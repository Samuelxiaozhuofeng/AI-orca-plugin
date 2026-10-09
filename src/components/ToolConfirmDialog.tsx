/**
 * Tool Confirm Dialog
 * 工具执行确认对话框
 */

import { TOOL_DISPLAY_NAMES } from "../store/tool-store";

/**
 * 创建一个 Promise，等待用户确认工具执行
 * 使用自定义弹窗替代浏览器原生 confirm()
 * full: 全量显示参数（本机 AI 用，长内容可滚动）；默认聚焦「拒绝」，「允许」只认鼠标点击且出现 400ms 内的点击忽略
 * signal 中止时关闭弹窗并按拒绝处理
 * 键盘只作用于本弹窗：Esc 拒绝，Enter/空格只触发当前聚焦按钮的原生行为
 */
export function createToolConfirmPromise(
  toolName: string,
  args: Record<string, any>,
  options?: { full?: boolean; signal?: AbortSignal },
): Promise<boolean> {
  return new Promise((resolve) => {
    if (options?.signal?.aborted) {
      resolve(false);
      return;
    }
    const full = options?.full === true;
    const displayName = TOOL_DISPLAY_NAMES[toolName] || toolName;
    const argsStr = Object.entries(args)
      .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v, null, full ? 2 : undefined) : v}`)
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
      minWidth: "min(380px, 92vw)",
      maxWidth: full ? "min(720px, 90vw)" : "min(480px, 92vw)",
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
      maxHeight: full ? "50vh" : "140px",
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
      options?.signal?.removeEventListener("abort", onAbort);
      overlay.remove();
      resolve(value);
    };

    const onBackdrop = (e: MouseEvent) => {
      if (e.target === overlay) cleanup(false);
    };
    overlay.addEventListener("click", onBackdrop);

    overlay.addEventListener("keydown", (e: KeyboardEvent) => {
      if (e.key === "Escape") cleanup(false);
    });

    const onAbort = () => cleanup(false);
    options?.signal?.addEventListener("abort", onAbort);

    denyBtn.addEventListener("click", () => cleanup(false));
    const shownAt = Date.now();
    allowBtn.addEventListener("click", (e: MouseEvent) => {
      // full：键盘触发的 click（detail 为 0）和刚出现时的误触都不算允许
      if (full && (e.detail === 0 || Date.now() - shownAt < 400)) return;
      cleanup(true);
    });

    // ── 组装并挂载 ──
    btnRow.appendChild(denyBtn);
    btnRow.appendChild(allowBtn);
    card.appendChild(header);
    card.appendChild(nameEl);
    card.appendChild(argsEl);
    card.appendChild(btnRow);
    overlay.appendChild(card);
    document.body.appendChild(overlay);

    // full 默认聚焦拒绝，其余聚焦允许
    setTimeout(() => (full ? denyBtn : allowBtn).focus(), 50);
  });
}
