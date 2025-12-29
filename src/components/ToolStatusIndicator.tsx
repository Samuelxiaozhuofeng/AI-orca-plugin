/**
 * ToolStatusIndicator Component
 *
 * A semantic, user-friendly status indicator for tool execution.
 * Replaces the technical card-based display with inline status flow.
 *
 * States:
 * - loading: Shows animated icon + friendly loading text
 * - success: Shows success icon + result summary + optional expand button
 * - failed: Shows error icon + error message + optional retry button
 * - cancelled: Shows cancelled icon + reason
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

const React = window.React as unknown as {
  createElement: typeof window.React.createElement;
  useState: <T>(initial: T | (() => T)) => [T, (next: T | ((prev: T) => T)) => void];
  useCallback: <T extends (...args: any[]) => any>(fn: T, deps: any[]) => T;
  Fragment: typeof window.React.Fragment;
};
const { createElement, useState, useCallback } = React;

export type ToolExecutionStatus = "loading" | "success" | "failed" | "cancelled";

export interface ToolStatusIndicatorProps {
  toolName: string;
  status: ToolExecutionStatus;
  result?: string;     // Tool result (for success state)
  error?: string;      // Error message (for failed state)
  args?: string;       // Tool arguments JSON string
  retryable?: boolean; // Whether retry is allowed
  onRetry?: () => void; // Retry callback
}

export default function ToolStatusIndicator({
  toolName,
  status,
  result,
  error,
  args,
  retryable = false,
  onRetry,
}: ToolStatusIndicatorProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const config = getToolDisplayConfig(toolName);

  const handleToggleExpand = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  // Determine icon and text based on status
  let icon: string;
  let text: string;
  let animationClass: string | undefined;

  switch (status) {
    case "loading":
      icon = config.icon;
      text = `${config.displayName}: ${config.loadingText}`;
      animationClass = `tool-animation-${config.animation}`;
      break;
    case "success":
      icon = config.successIcon;
      text = `${config.displayName}: ${result ? generateResultSummary(toolName, result) : config.successText}`;
      break;
    case "failed":
      icon = "❌";
      text = `${config.displayName}: ${error ? `失败 - ${error.slice(0, 50)}` : "执行失败"}`;
      break;
    case "cancelled":
      icon = "⏸️";
      text = `${config.displayName}: 已取消`;
      break;
    default:
      icon = "🔧";
      text = "未知状态";
  }

  // Determine if we should show expand button
  const showExpandButton = status === "success" && (result || args);

  return createElement(
    "div",
    { style: { marginTop: "8px" } },
    // Main status pill
    createElement(
      "div",
      {
        style: toolStatusPillStyle(status),
      },
      // Animated icon
      createElement(
        "span",
        {
          style: toolStatusIconStyle,
          className: animationClass,
        },
        icon
      ),
      // Status text
      createElement(
        "span",
        { style: toolStatusTextStyle },
        text
      ),
      // Expand button (for success state)
      showExpandButton &&
        createElement(
          "button",
          {
            style: toolStatusExpandButtonStyle,
            onClick: handleToggleExpand,
            title: isExpanded ? "收起详情" : "查看详情",
          },
          createElement("i", {
            className: isExpanded ? "ti ti-chevron-up" : "ti ti-code",
            style: { fontSize: "12px" },
          })
        ),
      // Retry button (for failed state)
      status === "failed" &&
        retryable &&
        onRetry &&
        createElement(
          "button",
          {
            style: toolStatusRetryButtonStyle,
            onClick: onRetry,
            title: "重试",
          },
          "重试"
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
                  maxHeight: "200px",
                  overflowY: "auto",
                },
              },
              formatJson(result)
            )
          )
      ),
    // Error details (always visible for failed state)
    status === "failed" &&
      error &&
      error.length > 50 &&
      createElement(
        "div",
        { style: toolStatusErrorStyle },
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
