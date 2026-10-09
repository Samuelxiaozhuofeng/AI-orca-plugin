/**
 * Shared styles for ChatInput components
 */

export const inputWrapperStyle = (isFocused: boolean) => ({
  display: "flex",
  flexDirection: "column" as const,
  gap: "8px",
  background: "var(--orca-color-bg-2)",
  borderRadius: "24px",
  padding: "12px 16px",
  border: isFocused
    ? "1px solid var(--orca-color-primary, #007bff)"
    : "1px solid var(--orca-color-border)",
  boxShadow: isFocused
    ? "0 4px 12px rgba(0,0,0,0.05)"
    : "0 2px 8px rgba(0,0,0,0.02)",
  transition: "all 0.2s ease",
});

export const toolbarStyle = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
};

export const addContextButtonStyle = {
  padding: "2px 8px",
  height: "24px",
  fontSize: 12,
  color: "var(--orca-color-text-2)",
  borderRadius: "8px",
  background: "var(--orca-color-bg-3)",
};

export const modelButtonStyle = {
  padding: "2px 10px",
  height: "24px",
  fontSize: 12,
  color: "var(--orca-color-text-2)",
  borderRadius: "8px",
  background: "var(--orca-color-bg-3)",
  display: "flex",
  alignItems: "center",
  gap: 6,
  maxWidth: 240,
};

export const modelLabelStyle = {
  overflow: "hidden" as const,
  textOverflow: "ellipsis" as const,
  whiteSpace: "nowrap" as const,
  maxWidth: 170,
};

export const textareaStyle = {
  flex: 1,
  resize: "none" as const,
  minHeight: 24,
  maxHeight: 360,
  background: "transparent",
  border: "none",
  padding: 0,
  outline: "none",
  lineHeight: "1.5",
  fontSize: "15px",
};

export const sendButtonStyle = (canSend: boolean) => ({
  borderRadius: "50%",
  width: "32px",
  height: "32px",
  minWidth: "32px",
  padding: 0,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  opacity: canSend ? 1 : 0.5,
  transition: "opacity 0.2s",
});

export const containerStyle = {
  padding: "16px",
  borderTop: "none",
  background: "transparent",
  position: "relative" as const,
  zIndex: 20,
};

// Model selector menu styles
export const menuContainerStyle = {
  padding: 16,
  boxSizing: "border-box" as const,
  background: "var(--orca-color-bg-1)",
};

export const menuFlexStyle = {
  display: "flex",
  gap: 16,
};

export const modelListPanelStyle = {
  flex: 1,
  minWidth: 0,
  display: "flex",
  flexDirection: "column" as const,
};

export const modelListScrollStyle = {
  flex: 1,
  maxHeight: 300,
  overflowY: "auto" as const,
  width: "100%",
};

export const addModelPanelStyle = {
  flex: 1,
  minWidth: 240,
  display: "flex",
  flexDirection: "column" as const,
  gap: 12,
  boxSizing: "border-box" as const,
};

export const addModelTitleStyle = {
  fontSize: 12,
  fontWeight: 600,
  marginBottom: 8,
  color: "var(--orca-color-text-1)",
};

export const addModelHintStyle = {
  marginTop: 8,
  fontSize: 11,
  color: "var(--orca-color-text-3)",
  lineHeight: 1.4,
};

/**
 * Measure where a toolbar popup fits inside the clipping panel.
 * Popups are portaled to the panel, so the boundary is searched from outside any open popup
 * (a menu opened from inside another menu is measured against the panel, not the outer menu).
 * Prefers `prefer` side; flips to the other side when it has more room and `prefer` can't fit `min`.
 * alignment "left" = grows rightwards from the anchor's left edge; "right" = grows leftwards.
 */
export function measureMenu(
  anchor: Element | null | undefined,
  prefer: "left" | "right",
  min: number,
  max: number,
): { width: number; alignment: "left" | "right" } {
  if (!anchor) return { width: Math.max(min, Math.min(360, max)), alignment: prefer };
  const rect = anchor.getBoundingClientRect();
  let clipLeft = 0;
  let clipRight = window.innerWidth;
  const start = anchor.closest(".orca-popup")?.parentElement ?? anchor.parentElement;
  for (let el = start; el; el = el.parentElement) {
    const cs = getComputedStyle(el);
    if (cs.overflow !== "visible" || cs.overflowX !== "visible") {
      const r = el.getBoundingClientRect();
      clipLeft = r.left;
      clipRight = r.right;
      break;
    }
  }
  const space = {
    left: clipRight - rect.left - 8,
    right: rect.right - clipLeft - 8,
  };
  const other = prefer === "left" ? "right" : "left";
  const alignment = space[prefer] >= min || space[prefer] >= space[other] ? prefer : other;
  // 可用宽度是硬上限（空间不足 min 时宁可窄也不越界）
  return { width: Math.max(0, Math.min(max, space[alignment])), alignment };
}
