/**
 * ToolStatusIndicator Component
 *
 * A semantic, user-friendly status indicator for tool execution.
 * Replaces the technical card-based display with inline status flow.
 *
 * States:
 * - loading: Shows animated icon + friendly loading text + elapsed time
 * - success: Shows success icon + result summary + execution time + optional expand button
 * - failed: Shows error icon + error message + retry button
 * - cancelled: Shows cancelled icon + reason
 * 
 * Enhanced features (Requirements 10.1, 10.2):
 * - Displays execution time for loading and completed states
 * - Shows retry button when tool fails
 */

import {
  getToolDisplayConfig,
  generateResultSummary,
} from "../utils/tool-display-config";
import {
  toolStatusPillStyle,
  toolStatusIconStyle,
  toolStatusTextStyle,
  toolStatusExpandButtonStyle,
  toolStatusDetailsStyle,
  toolStatusErrorStyle,
  toolStatusRetryButtonStyle,
} from "../styles/ai-chat-styles";
import { withTooltip } from "../utils/orca-tooltip";
import MarkdownMessage from "./MarkdownMessage";

const React = window.React as unknown as {
  createElement: typeof window.React.createElement;
  useState: <T>(initial: T | (() => T)) => [T, (next: T | ((prev: T) => T)) => void];
  useCallback: <T extends (...args: any[]) => any>(fn: T, deps: any[]) => T;
  useEffect: (effect: () => void | (() => void), deps?: any[]) => void;
  useRef: <T>(initial: T) => { current: T };
  Fragment: typeof window.React.Fragment;
};
const { createElement, useState, useCallback, useEffect, useRef } = React;

export type ToolExecutionStatus = "loading" | "success" | "failed" | "cancelled";

export interface ToolStatusIndicatorProps {
  toolName: string;
  status: ToolExecutionStatus;
  result?: string;     // Tool result (for success state)
  error?: string;      // Error message (for failed state)
  args?: string;       // Tool arguments JSON string
  retryable?: boolean; // Whether retry is allowed
  onRetry?: () => void; // Retry callback
  startTime?: number;  // Execution start time (timestamp)
  endTime?: number;    // Execution end time (timestamp)
}

export default function ToolStatusIndicator({
  toolName,
  status,
  result,
  error,
  args,
  retryable = true, // Default to true for failed state
  onRetry,
  startTime,
  endTime,
}: ToolStatusIndicatorProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [elapsedTime, setElapsedTime] = useState(0);
  const config = getToolDisplayConfig(toolName);
  const internalStartTime = useRef(startTime || Date.now());

  // Track elapsed time for loading state
  useEffect(() => {
    if (status === "loading") {
      // Update elapsed time every second
      const timer = setInterval(() => {
        setElapsedTime(Math.round((Date.now() - internalStartTime.current) / 1000));
      }, 1000);
      return () => clearInterval(timer);
    } else if (status === "success" || status === "failed" || status === "cancelled") {
      // Calculate final elapsed time
      if (endTime && startTime) {
        setElapsedTime(Math.round((endTime - startTime) / 1000));
      } else if (internalStartTime.current) {
        setElapsedTime(Math.round((Date.now() - internalStartTime.current) / 1000));
      }
    }
  }, [status, startTime, endTime]);

  const handleToggleExpand = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  // Format elapsed time for display
  const formatElapsedTime = (seconds: number): string => {
    if (seconds < 60) {
      return `${seconds}秒`;
    }
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}分${remainingSeconds}秒`;
  };

  // 显示名称格式：中文名称
  const displayName = config.displayName;
  const funcName = toolName;

  // Determine icon and status text based on status
  let icon: string;
  let statusText: string;
  let animationClass: string | undefined;
  let statusColor: string;

  switch (status) {
    case "loading":
      icon = config.icon;
      statusText = config.loadingText;
      animationClass = `tool-animation-${config.animation}`;
      statusColor = "var(--orca-color-primary)"; // blue
      break;
    case "success":
      icon = config.successIcon;
      statusText = result ? generateResultSummary(toolName, result) : config.successText;
      statusColor = "var(--orca-color-success, #22c55e)"; // green
      break;
    case "failed":
      icon = "❌";
      // 显示更长的错误摘要，优先显示关键信息
      statusText = error ? (error.length > 120 ? error.slice(0, 120) + "..." : error) : "执行失败";
      statusColor = "var(--orca-color-danger, #dc3545)"; // red
      break;
    case "cancelled":
      icon = "⏸️";
      statusText = "已取消";
      statusColor = "var(--orca-color-text-3)"; // gray
      break;
    default:
      icon = "🔧";
      statusText = "未知状态";
      statusColor = "var(--orca-color-text-3)";
  }

  // Determine if we should show expand button
  const showExpandButton = status === "success" && (result || args);
  
  // Show retry button for failed state (Requirements 10.2)
  const showRetryButton = status === "failed" && retryable;

  return createElement(
    "div",
    { style: { marginTop: "8px" } },
    // Main status card - 重新设计的工具状态卡片
    createElement(
      "div",
      {
        style: {
          display: "flex",
          alignItems: "flex-start",
          gap: "12px",
          padding: "12px 14px",
          borderRadius: "10px",
          background: status === "loading"
            ? "color-mix(in srgb, var(--orca-color-primary) 6%, transparent)"
            : status === "failed"
              ? "color-mix(in srgb, var(--orca-color-danger, #dc3545) 6%, transparent)"
              : "var(--orca-color-bg-2)",
          border: `1px solid ${status === "loading"
            ? "color-mix(in srgb, var(--orca-color-primary) 15%, transparent)"
            : status === "failed"
              ? "color-mix(in srgb, var(--orca-color-danger, #dc3545) 15%, transparent)"
              : "var(--orca-color-border)"}`,
          transition: "all 0.2s ease",
        },
      },
      // 左侧状态图标
      createElement(
        "div",
        {
          style: {
            width: "32px",
            height: "32px",
            borderRadius: "8px",
            background: `color-mix(in srgb, ${statusColor} 15%, transparent)`,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "16px",
            flexShrink: 0,
          },
          className: animationClass,
        },
        icon
      ),
      // 中间内容区
      createElement(
        "div",
        {
          style: {
            flex: 1,
            minWidth: 0,
          },
        },
        // 工具名称 + 状态标签
        createElement(
          "div",
          {
            style: {
              display: "flex",
              alignItems: "center",
              gap: "8px",
              marginBottom: "4px",
            },
          },
          createElement(
            "span",
            {
              style: {
                fontWeight: 600,
                fontSize: "13px",
                color: "var(--orca-color-text-1)",
              },
            },
            displayName
          ),
          createElement(
            "span",
            {
              style: {
                fontSize: "11px",
                color: "var(--orca-color-text-3)",
                fontFamily: "var(--orca-fontfamily-code)",
              },
            },
            funcName
          ),
          // 状态标签
          createElement(
            "span",
            {
              style: {
                fontSize: "10px",
                padding: "2px 6px",
                borderRadius: "4px",
                background: `color-mix(in srgb, ${statusColor} 20%, transparent)`,
                color: statusColor,
                fontWeight: 500,
                marginLeft: "auto",
              },
            },
            status === "loading" ? "执行中" : 
            status === "success" ? "已完成" : 
            status === "failed" ? "失败" : "已取消"
          ),
          // 执行时间
          elapsedTime > 0 && createElement(
            "span",
            {
              style: {
                fontSize: "11px",
                color: "var(--orca-color-text-3)",
              },
            },
            formatElapsedTime(elapsedTime)
          )
        ),
        // 状态文字/结果摘要
        createElement(
          "div",
          {
            style: {
              fontSize: "12px",
              color: status === "failed" ? "var(--orca-color-danger, #dc3545)" : "var(--orca-color-text-2)",
              lineHeight: 1.4,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            },
          },
          statusText
        )
      ),
      // 右侧按钮区
      createElement(
        "div",
        {
          style: {
            display: "flex",
            alignItems: "center",
            gap: "4px",
            flexShrink: 0,
          },
        },
        // Expand button (for success state)
        showExpandButton &&
          withTooltip(
            isExpanded ? "收起详情" : "查看详情",
            createElement(
              "button",
              {
                style: {
                  width: "28px",
                  height: "28px",
                  borderRadius: "6px",
                  border: "1px solid var(--orca-color-border)",
                  background: "var(--orca-color-bg-1)",
                  color: "var(--orca-color-text-2)",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  transition: "all 0.2s ease",
                },
                onClick: handleToggleExpand,
              },
              createElement("i", {
                className: isExpanded ? "ti ti-chevron-up" : "ti ti-code",
                style: { 
                  fontSize: "14px",
                  transition: "transform 0.2s ease",
                  transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
                },
              })
            )
          ),
        // Retry button (for failed state)
        showRetryButton &&
          withTooltip(
            "重试",
            createElement(
              "button",
              {
                style: {
                  padding: "4px 10px",
                  borderRadius: "6px",
                  border: "1px solid color-mix(in srgb, var(--orca-color-danger, #dc3545) 30%, transparent)",
                  background: "color-mix(in srgb, var(--orca-color-danger, #dc3545) 10%, transparent)",
                  color: "var(--orca-color-danger, #dc3545)",
                  cursor: "pointer",
                  fontSize: "12px",
                  fontWeight: 500,
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                },
                onClick: onRetry,
                disabled: !onRetry,
              },
              createElement("i", {
                className: "ti ti-refresh",
                style: { fontSize: "12px" },
              }),
              "重试"
            )
          )
      )
    ),
    // Expanded details
    isExpanded &&
      createElement(
        "div",
        { style: toolStatusDetailsStyle },
        // Arguments section
        args &&
          createElement(
            "div",
            { style: { marginBottom: "8px" } },
            createElement(
              "div",
              { style: { fontWeight: "bold", marginBottom: "4px", fontSize: "12px" } },
              "参数:"
            ),
            createElement(
              "pre",
              {
                style: {
                  margin: 0,
                  fontSize: "11px",
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-all",
                  background: "var(--orca-color-bg-3)",
                  padding: "8px",
                  borderRadius: "4px",
                },
              },
              formatJson(args)
            )
          ),
        // Result section
        result &&
          createElement(
            "div",
            {},
            createElement(
              "div",
              { style: { fontWeight: "bold", marginBottom: "4px", fontSize: "12px" } },
              "结果:"
            ),
            // 检测是否是 JSON 或纯数据，使用 pre 显示；否则使用 Markdown 渲染
            isJsonLike(result)
              ? createElement(
                  "pre",
                  {
                    style: {
                      margin: 0,
                      fontSize: "11px",
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-all",
                      background: "var(--orca-color-bg-3)",
                      padding: "8px",
                      borderRadius: "4px",
                      maxHeight: "200px",
                      overflowY: "auto",
                    },
                  },
                  formatJson(result)
                )
              : createElement(
                  "div",
                  {
                    style: {
                      background: "var(--orca-color-bg-3)",
                      padding: "8px",
                      borderRadius: "4px",
                      maxHeight: "200px",
                      overflowY: "auto",
                      fontSize: "12px",
                    },
                  },
                  createElement(MarkdownMessage, {
                    content: result,
                    role: "tool",
                  })
                )
          )
      ),
    // Error details (always visible for failed state)
    status === "failed" &&
      error &&
      error.length > 80 &&
      createElement(
        "div",
        { 
          style: {
            ...toolStatusErrorStyle,
            marginTop: "8px",
            padding: "10px 12px",
            borderRadius: "8px",
            background: "color-mix(in srgb, var(--orca-color-danger, #dc3545) 6%, transparent)",
            border: "1px solid color-mix(in srgb, var(--orca-color-danger, #dc3545) 15%, transparent)",
            fontSize: "12px",
            color: "var(--orca-color-danger, #dc3545)",
            lineHeight: 1.5,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }
        },
        createElement(
          "div",
          { style: { fontWeight: 600, marginBottom: "6px", fontSize: "11px" } },
          "错误详情："
        ),
        error
      )
  );
}

/**
 * Format JSON string for display
 * Attempts to pretty-print JSON, falls back to original string
 */
function formatJson(str: string): string {
  try {
    const parsed = JSON.parse(str);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return str;
  }
}

/**
 * Check if a string looks like JSON or structured data
 * Returns true for JSON objects/arrays, false for natural language text
 */
function isJsonLike(str: string): boolean {
  const trimmed = str.trim();
  // Check if starts with { or [ (JSON)
  if ((trimmed.startsWith("{") && trimmed.endsWith("}")) ||
      (trimmed.startsWith("[") && trimmed.endsWith("]"))) {
    try {
      JSON.parse(trimmed);
      return true;
    } catch {
      // Not valid JSON, could be Markdown
      return false;
    }
  }
  // Check if it's mostly code-like (no spaces, special chars)
  if (trimmed.length < 100 && !trimmed.includes(" ") && !trimmed.includes("\n")) {
    return true;
  }
  return false;
}
