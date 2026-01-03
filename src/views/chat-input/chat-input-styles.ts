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
  borderTop: "1px solid var(--orca-color-border)",
  background: "var(--orca-color-bg-1)",
  position: "relative" as const,
  zIndex: 20,
};

// Model selector menu styles
export const menuContainerStyle = {
  // width removed to let content define width (minWidth ensures it's not too narrow)
  minWidth: 540,
  padding: 16,
  background: "var(--orca-color-bg-1)",
};

export const menuFlexStyle = {
  display: "flex",
  gap: 16,
};

export const modelListPanelStyle = {
  flex: 1,
  minWidth: 0,
  // Restore paddingRight to ensure input doesn't touch the border
  paddingRight: 16,
  borderRight: "1px solid var(--orca-color-border)",
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
