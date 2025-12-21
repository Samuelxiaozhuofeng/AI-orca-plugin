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
  borderRadius: "12px",
  background: "var(--orca-color-bg-3)",
};

export const modelButtonStyle = {
  padding: "2px 10px",
  height: "24px",
  fontSize: 12,
  color: "var(--orca-color-text-2)",
  borderRadius: "12px",
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
  maxHeight: 200,
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
  width: 520,
  padding: 12,
  background: "var(--orca-color-bg-1)",
};

export const menuFlexStyle = {
  display: "flex",
  gap: 12,
};

export const modelListPanelStyle = {
  flex: 1,
  minWidth: 0,
  borderRight: "1px solid var(--orca-color-border)",
  paddingRight: 12,
};

export const modelListScrollStyle = {
  marginTop: 8,
  maxHeight: 280,
  overflow: "auto" as const,
  paddingRight: 4,
};

export const addModelPanelStyle = {
  width: 220,
  flexShrink: 0,
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
