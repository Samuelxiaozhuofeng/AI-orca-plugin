/**
 * ToolConfirmationCard Component
 *
 * Displays a confirmation UI for tool calls in Supervised mode.
 * Shows tool name in human-readable format, key parameters,
 * and provides Approve/Reject buttons.
 *
 * Requirements: 7.1, 7.2, 7.3, 7.4, 7.5
 */

import type { PendingToolCall } from "../store/chat-mode-store";
import { approveToolCall, rejectToolCall } from "../store/chat-mode-store";
import { getToolDisplayConfig } from "../utils/tool-display-config";

const React = window.React as unknown as {
  createElement: typeof window.React.createElement;
  useState: <T>(initial: T | (() => T)) => [T, (next: T | ((prev: T) => T)) => void];
  useCallback: <T extends (...args: any[]) => any>(fn: T, deps: any[]) => T;
  useMemo: <T>(fn: () => T, deps: any[]) => T;
};
const { createElement, useState, useCallback, useMemo } = React;

// ============================================================================
// Types
// ============================================================================

type CardStatus = "pending" | "approved" | "rejected" | "executing";

interface ToolConfirmationCardProps {
  toolCall: PendingToolCall;
  onApprove?: (toolCall: PendingToolCall) => void;
  onReject?: (toolCall: PendingToolCall) => void;
}

// ============================================================================
// Utilities
// ============================================================================

/**
 * Format tool name from snake_case or camelCase to human-readable format
 * Examples:
 *   createBlock -> Create Block
 *   search_blocks_by_tag -> Search Blocks By Tag
 *   getTodayJournal -> Get Today Journal
 *
 * Validates: Requirements 7.2
 */
export function formatToolName(toolName: string): string {
  // Handle snake_case: replace underscores with spaces
  let formatted = toolName.replace(/_/g, " ");

  // Handle camelCase: insert space before uppercase letters
  formatted = formatted.replace(/([a-z])([A-Z])/g, "$1 $2");

  // Capitalize first letter of each word
  formatted = formatted
    .split(" ")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");

  return formatted;
}

/**
 * Format tool arguments for display
 * Shows key parameters in a readable format
 */
function formatArgs(args: Record<string, any>): { key: string; value: string }[] {
  const result: { key: string; value: string }[] = [];

  for (const [key, value] of Object.entries(args)) {
    let displayValue: string;

    if (value === null || value === undefined) {
      displayValue = "null";
    } else if (typeof value === "string") {
      // Truncate long strings
      displayValue = value.length > 50 ? value.slice(0, 47) + "..." : value;
    } else if (typeof value === "object") {
      // For objects/arrays, show JSON preview
      const json = JSON.stringify(value);
      displayValue = json.length > 50 ? json.slice(0, 47) + "..." : json;
    } else {
      displayValue = String(value);
    }

    result.push({
      key: formatToolName(key),
      value: displayValue,
    });
  }

  return result;
}

// ============================================================================
// Styles
// ============================================================================

const cardContainerStyle = (status: CardStatus): React.CSSProperties => ({
  marginTop: "8px",
  padding: "12px 14px",
  background:
    status === "approved"
      ? "var(--orca-color-bg-success, rgba(0, 200, 83, 0.08))"
      : status === "rejected"
      ? "var(--orca-color-bg-danger, rgba(255, 0, 0, 0.08))"
      : "var(--orca-color-bg-2)",
  border: `1px solid ${
    status === "approved"
      ? "var(--orca-color-success, #00c853)"
      : status === "rejected"
      ? "var(--orca-color-danger, #dc3545)"
      : "var(--orca-color-border)"
  }`,
  borderRadius: "10px",
  transition: "all 0.2s ease",
});

const cardHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "10px",
  marginBottom: "8px",
};

const toolIconStyle: React.CSSProperties = {
  fontSize: "16px",
  flexShrink: 0,
};

const toolNameStyle: React.CSSProperties = {
  flex: 1,
  fontSize: "14px",
  fontWeight: 600,
  color: "var(--orca-color-text-1)",
};

const statusBadgeStyle = (status: CardStatus): React.CSSProperties => ({
  fontSize: "11px",
  padding: "2px 8px",
  borderRadius: "10px",
  fontWeight: 500,
  background:
    status === "approved"
      ? "var(--orca-color-success, #00c853)"
      : status === "rejected"
      ? "var(--orca-color-danger, #dc3545)"
      : status === "executing"
      ? "var(--orca-color-primary)"
      : "transparent",
  color:
    status === "pending"
      ? "var(--orca-color-text-2)"
      : "var(--orca-color-text-inverse, #fff)",
});

const paramsContainerStyle: React.CSSProperties = {
  marginBottom: "10px",
  padding: "8px 10px",
  background: "var(--orca-color-bg-3)",
  borderRadius: "6px",
  fontSize: "12px",
};

const paramRowStyle: React.CSSProperties = {
  display: "flex",
  gap: "8px",
  marginBottom: "4px",
};

const paramKeyStyle: React.CSSProperties = {
  color: "var(--orca-color-text-2)",
  minWidth: "80px",
  flexShrink: 0,
};

const paramValueStyle: React.CSSProperties = {
  color: "var(--orca-color-text-1)",
  fontFamily: "var(--orca-fontfamily-code)",
  wordBreak: "break-all",
  flex: 1,
};

const actionsContainerStyle: React.CSSProperties = {
  display: "flex",
  gap: "8px",
  justifyContent: "flex-end",
};

const buttonBaseStyle: React.CSSProperties = {
  padding: "6px 14px",
  fontSize: "12px",
  fontWeight: 500,
  borderRadius: "6px",
  cursor: "pointer",
  transition: "all 0.15s ease",
  border: "none",
  display: "flex",
  alignItems: "center",
  gap: "4px",
};

const approveButtonStyle: React.CSSProperties = {
  ...buttonBaseStyle,
  background: "var(--orca-color-success, #00c853)",
  color: "var(--orca-color-text-inverse, #fff)",
};

const rejectButtonStyle: React.CSSProperties = {
  ...buttonBaseStyle,
  background: "var(--orca-color-bg-3)",
  color: "var(--orca-color-text-2)",
  border: "1px solid var(--orca-color-border)",
};

const resultMessageStyle = (isApproved: boolean): React.CSSProperties => ({
  fontSize: "12px",
  color: isApproved
    ? "var(--orca-color-success, #00c853)"
    : "var(--orca-color-danger, #dc3545)",
  display: "flex",
  alignItems: "center",
  gap: "6px",
});

// ============================================================================
// Component
// ============================================================================

export default function ToolConfirmationCard({
  toolCall,
  onApprove,
  onReject,
}: ToolConfirmationCardProps) {
  const [status, setStatus] = useState<CardStatus>("pending");

  // Get tool display config for icon
  const toolConfig = useMemo(() => {
    return getToolDisplayConfig(toolCall.toolName);
  }, [toolCall.toolName]);

  // Format tool name for display
  const displayName = useMemo(() => {
    return formatToolName(toolCall.toolName);
  }, [toolCall.toolName]);

  // Format arguments for display
  const formattedArgs = useMemo(() => {
    return formatArgs(toolCall.args);
  }, [toolCall.args]);

  // Handle approve action
  const handleApprove = useCallback(() => {
    setStatus("executing");
    const approved = approveToolCall(toolCall.id);
    if (approved) {
      setStatus("approved");
      onApprove?.(approved);
    }
  }, [toolCall.id, onApprove]);

  // Handle reject action
  const handleReject = useCallback(() => {
    const rejected = rejectToolCall(toolCall.id);
    if (rejected) {
      setStatus("rejected");
      onReject?.(rejected);
    }
  }, [toolCall.id, onReject]);

  return createElement(
    "div",
    { style: cardContainerStyle(status) },

    // Header: Icon + Tool Name + Status Badge
    createElement(
      "div",
      { style: cardHeaderStyle },
      createElement("span", { style: toolIconStyle }, toolConfig.icon),
      createElement("span", { style: toolNameStyle }, displayName),
      status !== "pending" &&
        createElement(
          "span",
          { style: statusBadgeStyle(status) },
          status === "approved"
            ? "已批准"
            : status === "rejected"
            ? "已跳过"
            : status === "executing"
            ? "执行中..."
            : ""
        )
    ),

    // Parameters
    formattedArgs.length > 0 &&
      createElement(
        "div",
        { style: paramsContainerStyle },
        ...formattedArgs.map((param, index) =>
          createElement(
            "div",
            {
              key: `${param.key}-${index}`,
              style: {
                ...paramRowStyle,
                marginBottom: index === formattedArgs.length - 1 ? 0 : "4px",
              },
            },
            createElement("span", { style: paramKeyStyle }, `${param.key}:`),
            createElement("span", { style: paramValueStyle }, param.value)
          )
        )
      ),

    // Actions or Result Message
    status === "pending"
      ? createElement(
          "div",
          { style: actionsContainerStyle },
          createElement(
            "button",
            {
              style: rejectButtonStyle,
              onClick: handleReject,
              title: "跳过此操作",
            },
            createElement("i", { className: "ti ti-x" }),
            "跳过"
          ),
          createElement(
            "button",
            {
              style: approveButtonStyle,
              onClick: handleApprove,
              title: "批准执行",
            },
            createElement("i", { className: "ti ti-check" }),
            "批准"
          )
        )
      : createElement(
          "div",
          { style: resultMessageStyle(status === "approved") },
          createElement("i", {
            className:
              status === "approved"
                ? "ti ti-check"
                : status === "rejected"
                ? "ti ti-x"
                : "ti ti-loader",
          }),
          status === "approved"
            ? "工具已执行"
            : status === "rejected"
            ? "已跳过此操作"
            : "正在执行..."
        )
  );
}
