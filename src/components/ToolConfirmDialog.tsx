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
            border: "1px solid var(--orca-color-border)",
            background: "var(--orca-color-bg-3)",
            color: "var(--orca-color-text-1)",
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
 * 使用自定义弹窗替代浏览器原生 confirm()
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

    // ── 遮罩层 ──
    const overlay = document.createElement("div");
    Object.assign(overlay.style, {
      position: "fixed",
      inset: "0",
      background: "rgba(0,0,0,0.45)",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      zIndex: "99999",
      animation: "orca-fade-in 0.15s ease",
    });

    // ── 对话框卡片 ──
    const card = document.createElement("div");
    Object.assign(card.style, {
      background: "var(--orca-color-bg-1, #1e1e1e)",
      border: "1px solid var(--orca-color-border, #333)",
      borderRadius: "12px",
      padding: "20px 24px",
      minWidth: "380px",
      maxWidth: "480px",
      boxShadow: "0 16px 48px rgba(0,0,0,0.35)",
      color: "var(--orca-color-text-1, #ddd)",
      fontSize: "13px",
      animation: "orca-slide-up 0.2s ease",
    });

    // ── 标题行 ──
    const header = document.createElement("div");
    Object.assign(header.style, {
      display: "flex",
      alignItems: "center",
      gap: "8px",
      marginBottom: "12px",
      fontSize: "14px",
      fontWeight: "600",
      color: "var(--orca-color-warning, #f0a020)",
    });
    header.innerHTML = `<i class="ti ti-alert-triangle" style="font-size:18px"></i> AI 请求执行工具`;

    // ── 工具名 ──
    const nameEl = document.createElement("div");
    Object.assign(nameEl.style, {
      fontSize: "13px",
      fontWeight: "500",
      marginBottom: "10px",
      color: "var(--orca-color-text-1, #eee)",
    });
    nameEl.textContent = displayName;

    // ── 参数区 ──
    const argsEl = document.createElement("pre");
    Object.assign(argsEl.style, {
      margin: "0 0 16px 0",
      padding: "10px 12px",
      background: "var(--orca-color-bg-2, #252525)",
      borderRadius: "6px",
      fontSize: "11px",
      fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace",
      color: "var(--orca-color-text-2, #aaa)",
      whiteSpace: "pre-wrap",
      wordBreak: "break-all",
      maxHeight: "140px",
      overflow: "auto",
      lineHeight: "1.5",
    });
    argsEl.textContent = argsStr;

    // ── 按钮行 ──
    const btnRow = document.createElement("div");
    Object.assign(btnRow.style, {
      display: "flex",
      gap: "10px",
      justifyContent: "flex-end",
    });

    const denyBtn = document.createElement("button");
    Object.assign(denyBtn.style, {
      padding: "7px 18px",
      borderRadius: "6px",
      border: "1px solid var(--orca-color-border, #444)",
      background: "var(--orca-color-bg-2, #252525)",
      color: "var(--orca-color-text-2, #aaa)",
      cursor: "pointer",
      fontSize: "12px",
      fontWeight: "500",
    });
    denyBtn.textContent = "拒绝";
    denyBtn.addEventListener("mouseenter", () => {
      denyBtn.style.background = "var(--orca-color-bg-3, #333)";
    });
    denyBtn.addEventListener("mouseleave", () => {
      denyBtn.style.background = "var(--orca-color-bg-2, #252525)";
    });

    const allowBtn = document.createElement("button");
    Object.assign(allowBtn.style, {
      padding: "7px 18px",
      borderRadius: "6px",
      border: "none",
      background: "var(--orca-color-primary, #4a90d9)",
      color: "#fff",
      cursor: "pointer",
      fontSize: "12px",
      fontWeight: "500",
    });
    allowBtn.textContent = "允许执行";
    allowBtn.addEventListener("mouseenter", () => {
      allowBtn.style.filter = "brightness(1.15)";
    });
    allowBtn.addEventListener("mouseleave", () => {
      allowBtn.style.filter = "";
    });

    // ── 清理并决议 ──
    const cleanup = (value: boolean) => {
      overlay.removeEventListener("click", onBackdrop);
      window.removeEventListener("keydown", onKey);
      overlay.remove();
      resolve(value);
    };

    const onBackdrop = (e: MouseEvent) => {
      if (e.target === overlay) cleanup(false);
    };
    overlay.addEventListener("click", onBackdrop);

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") cleanup(false);
      if (e.key === "Enter") cleanup(true);
    };
    window.addEventListener("keydown", onKey);

    denyBtn.addEventListener("click", () => cleanup(false));
    allowBtn.addEventListener("click", () => cleanup(true));

    // ── 组装并挂载 ──
    btnRow.appendChild(denyBtn);
    btnRow.appendChild(allowBtn);
    card.appendChild(header);
    card.appendChild(nameEl);
    card.appendChild(argsEl);
    card.appendChild(btnRow);
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    // 自动聚焦允许按钮
    setTimeout(() => allowBtn.focus(), 50);
  });
}
