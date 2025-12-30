/**
 * Tool Confirm Dialog
 * 工具执行确认对话框
 */

const React = window.React as typeof import("react");
const { createElement } = React;

import { TOOL_DISPLAY_NAMES } from "../store/tool-store";

interface ToolConfirmDialogProps {
  toolName: string;
  args: Record<string, any>;
  onConfirm: () => void;
  onDeny: () => void;
}

export default function ToolConfirmDialog({
  toolName,
  args,
  onConfirm,
  onDeny,
}: ToolConfirmDialogProps) {
  const displayName = TOOL_DISPLAY_NAMES[toolName] || toolName;
  
  // 格式化参数显示
  const formatArgs = () => {
    const entries = Object.entries(args);
    if (entries.length === 0) return "无参数";
    return entries.map(([key, value]) => {
      const valueStr = typeof value === "object" ? JSON.stringify(value, null, 2) : String(value);
      const truncated = valueStr.length > 100 ? valueStr.slice(0, 100) + "..." : valueStr;
      return `${key}: ${truncated}`;
    }).join("\n");
  };

  return createElement(
    "div",
    {
      style: {
        padding: "12px 16px",
        background: "var(--orca-color-bg-2)",
        borderRadius: 8,
        border: "1px solid var(--orca-color-warning, #ffc107)",
        marginBottom: 8,
      },
    },
    // 标题
    createElement(
      "div",
      {
        style: {
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 8,
          color: "var(--orca-color-warning, #ffc107)",
          fontWeight: 500,
          fontSize: 13,
        },
      },
      createElement("i", { className: "ti ti-alert-triangle", style: { fontSize: 16 } }),
      `AI 请求执行: ${displayName}`
    ),
    // 参数
    createElement(
      "pre",
      {
        style: {
          margin: "8px 0",
          padding: 8,
          background: "var(--orca-color-bg-1)",
          borderRadius: 4,
          fontSize: 11,
          fontFamily: "monospace",
          color: "var(--orca-color-text-2)",
          whiteSpace: "pre-wrap",
          wordBreak: "break-all",
          maxHeight: 100,
          overflow: "auto",
        },
      },
      formatArgs()
    ),
    // 按钮
    createElement(
      "div",
      {
        style: {
          display: "flex",
          gap: 8,
          justifyContent: "flex-end",
          marginTop: 8,
        },
      },
      createElement(
        "button",
        {
          onClick: onDeny,
          style: {
            padding: "6px 12px",
            borderRadius: 4,
            border: "1px solid var(--orca-color-border)",
            background: "var(--orca-color-bg-1)",
            color: "var(--orca-color-text-2)",
            cursor: "pointer",
            fontSize: 12,
          },
        },
        "拒绝"
      ),
      createElement(
        "button",
        {
          onClick: onConfirm,
          style: {
            padding: "6px 12px",
            borderRadius: 4,
            border: "none",
            background: "var(--orca-color-primary)",
            color: "#fff",
            cursor: "pointer",
            fontSize: 12,
          },
        },
        "允许"
      )
    )
  );
}

/**
 * 创建一个 Promise，等待用户确认工具执行
 */
export function createToolConfirmPromise(
  toolName: string,
  args: Record<string, any>,
): Promise<boolean> {
  return new Promise((resolve) => {
    const displayName = TOOL_DISPLAY_NAMES[toolName] || toolName;
    const argsStr = Object.entries(args)
      .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : v}`)
      .join("\n");
    
    // 使用 Orca 的确认对话框
    const confirmed = window.confirm(
      `AI 请求执行工具: ${displayName}\n\n参数:\n${argsStr}\n\n是否允许？`
    );
    resolve(confirmed);
  });
}
