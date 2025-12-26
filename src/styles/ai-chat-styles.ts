/**
 * Unified styles for AI Chat Plugin
 * Used by AiChatPanel and MarkdownMessage
 */

// ─────────────────────────────────────────────────────────────────────────────
// Panel Layout Styles
// ─────────────────────────────────────────────────────────────────────────────

export const panelContainerStyle: React.CSSProperties = {
  height: "100%",
  width: "100%",
  display: "flex",
  flexDirection: "column",
  background: "var(--orca-color-bg-1)",
  color: "var(--orca-color-text-1)",
  animation: "panelEnter 240ms ease-out",
  transformOrigin: "left center",
};

export const headerStyle: React.CSSProperties = {
  padding: 12,
  display: "flex",
  alignItems: "center",
  gap: 8,
  borderBottom: "none",
  background: "var(--orca-color-bg-1)",
  zIndex: 10,
};

export const headerTitleStyle: React.CSSProperties = {
  fontWeight: 600,
  flex: 1,
  fontFamily: "var(--orca-fontfamily-ui)",
};

export const messageListStyle: React.CSSProperties = {
  flex: 1,
  overflow: "auto",
  padding: "20px",
  display: "flex",
  flexDirection: "column",
  gap: 10,
  scrollBehavior: "smooth",
};

// ─────────────────────────────────────────────────────────────────────────────
// Message Bubble Styles
// ─────────────────────────────────────────────────────────────────────────────

export const messageRowStyle = (role: string): React.CSSProperties => ({
  width: "100%",
  display: "flex",
  justifyContent: role === "user" ? "flex-end" : "flex-start",
  marginBottom: "16px",
  animation: "messageSlideIn 0.3s ease-out",
});

export const messageBubbleStyle = (role: string): React.CSSProperties => ({
  maxWidth: role === "user" ? "75%" : "90%",
  padding: role === "user" ? "12px 16px" : "16px 20px",
  borderRadius: role === "user" ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
  background: role === "user" ? "var(--orca-color-primary)" : "var(--orca-color-bg-2)",
  color: role === "user" ? "var(--orca-color-text-inverse)" : "var(--orca-color-text-1)",
  border: role === "assistant" ? "1px solid var(--orca-color-border)" : "none",
  boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
  position: "relative",
});

export const cursorStyle: React.CSSProperties = {
  display: "inline-block",
  width: "2px",
  height: "1.2em",
  background: "var(--orca-color-primary)",
  marginLeft: "2px",
  verticalAlign: "text-bottom",
  animation: "blink 1s step-end infinite",
};

export const toolCallStyle: React.CSSProperties = {
  marginTop: 8,
  padding: "10px 12px",
  background: "var(--orca-color-bg-3)",
  borderRadius: 6,
  fontSize: "0.85em",
  opacity: 0.9,
  fontFamily: "var(--orca-fontfamily-code)",
  borderLeft: "3px solid var(--orca-color-primary)",
};

export const loadingContainerStyle: React.CSSProperties = {
  width: "100%",
  display: "flex",
  justifyContent: "flex-start",
  marginBottom: "16px",
  animation: "messageSlideIn 0.3s ease-out",
};

export const loadingBubbleStyle: React.CSSProperties = {
  padding: "0",
  borderRadius: "18px 18px 18px 4px",
  background: "var(--orca-color-bg-2)",
  border: "1px solid var(--orca-color-border)",
  boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
};

// ─────────────────────────────────────────────────────────────────────────────
// Markdown Message Styles
// ─────────────────────────────────────────────────────────────────────────────

export const codeBlockContainerStyle: React.CSSProperties = {
  marginTop: "12px",
  marginBottom: "12px",
  borderRadius: "8px",
  border: "1px solid var(--orca-color-border)",
  overflow: "hidden",
  background: "var(--orca-color-bg-3)",
};

export const codeBlockHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "6px 12px",
  background: "var(--orca-color-bg-2)",
  borderBottom: "1px solid var(--orca-color-border)",
  fontSize: "12px",
  color: "var(--orca-color-text-2)",
  userSelect: "none",
};

export const codeBlockPreStyle: React.CSSProperties = {
  margin: 0,
  padding: "12px",
  overflowX: "auto",
  userSelect: "text", // 允许选择/复制 Markdown 内容
  fontFamily: 'var(--orca-fontfamily-code)',
  fontSize: "13px",
  lineHeight: "1.5",
  color: "var(--orca-color-text-1)",
};

export const inlineCodeStyle: React.CSSProperties = {
  fontFamily: 'var(--orca-fontfamily-code)',
  background: "var(--orca-color-bg-3)",
  padding: "2px 6px",
  borderRadius: "4px",
  fontSize: "0.9em",
  border: "1px solid var(--orca-color-border)",
  color: "var(--orca-color-text-1)",
};

export const markdownContainerStyle = (role: string): React.CSSProperties => ({
  fontFamily: role === "assistant"
    ? 'var(--orca-fontfamily-editor)'
    : 'var(--orca-fontfamily-ui)',
  fontSize: "16px",
  color: role === "user" ? "var(--orca-color-text-inverse)" : "var(--orca-color-text-1)",
  lineHeight: "1.6",
  userSelect: "text", // 允许选择/复制 Markdown 内容
});

export const blockQuoteStyle: React.CSSProperties = {
  borderLeft: "4px solid var(--orca-color-border)",
  marginLeft: 0,
  marginTop: "12px",
  marginBottom: "12px",
  background: "var(--orca-color-bg-2)",
  padding: "12px 16px",
  borderRadius: "8px",
  color: "var(--orca-color-text-2)",
  userSelect: "text", // 允许选择/复制 Markdown 内容
};

export const headingStyle = (level: number): React.CSSProperties => ({
  marginTop: level === 1 ? "24px" : "20px",
  marginBottom: "12px",
  fontWeight: "bold",
  fontSize: level === 1 ? "24px" : level === 2 ? "20px" : "18px",
  lineHeight: "1.4",
  borderLeft: "4px solid var(--orca-color-primary)",
  paddingLeft: "12px",
  background: "var(--orca-color-bg-2)",
  borderRadius: "0 8px 8px 0",
  color: "inherit",
});

export const linkStyle: React.CSSProperties = {
  color: "var(--orca-color-primary)",
  textDecoration: "underline",
  cursor: "pointer",
};

export const blockLinkContainerStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "6px",
  cursor: "pointer",
  padding: "4px 8px",
  borderRadius: "6px",
  transition: "all 0.2s ease",
  background: "transparent",
  border: "1px solid transparent",
};

export const blockLinkTextStyle: React.CSSProperties = {
  color: "var(--orca-color-primary)",
  fontWeight: 500,
  flex: 1,
};

export const blockLinkArrowStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "18px",
  height: "18px",
  borderRadius: "3px",
  background: "var(--orca-color-primary)",
  color: "var(--orca-color-text-inverse)",
  fontSize: "11px",
  flexShrink: 0,
  transition: "transform 0.2s ease",
};

export const boldStyle: React.CSSProperties = {
  fontWeight: "bold",
  color: "var(--orca-color-primary)",
  padding: "0 2px",
};

export const listStyle: React.CSSProperties = {
  marginTop: "12px",
  marginBottom: "12px",
  paddingLeft: "24px",
};

export const listItemStyle: React.CSSProperties = {
  marginTop: "6px",
  lineHeight: "1.8",
  color: "inherit",
  userSelect: "text", // 允许选择/复制 Markdown 内容
};

// 兼容/别名：列表项内容保持可选择，便于复制粘贴。
export const listItemStyle2: React.CSSProperties = listItemStyle;

export const paragraphStyle: React.CSSProperties = {
  marginTop: "8px",
  marginBottom: "8px",
  lineHeight: "1.8",
  color: "inherit",
  userSelect: "text", // 允许选择/复制 Markdown 内容
};

// ─────────────────────────────────────────────────────────────────────────────
// Message Item Action Bar & Tool Styles
// ─────────────────────────────────────────────────────────────────────────────

export const actionBarStyle: React.CSSProperties = {
  position: "absolute",
  top: "-20px",
  right: "0",
  display: "flex",
  gap: "4px",
  background: "var(--orca-color-bg-1)",
  border: "1px solid var(--orca-color-border)",
  borderRadius: "4px",
  padding: "2px",
  boxShadow: "0 2px 4px rgba(0,0,0,0.1)",
  opacity: 0,
  transition: "opacity 0.2s ease",
  pointerEvents: "none", // disabled when hidden
  zIndex: 5,
};

export const actionButtonStyle: React.CSSProperties = {
  padding: "2px 6px",
  fontSize: "12px",
  cursor: "pointer",
  color: "var(--orca-color-text-2)",
  background: "transparent",
  border: "none",
  borderRadius: "2px",
  display: "flex",
  alignItems: "center",
};

export const toolCardStyle: React.CSSProperties = {
  marginTop: "8px",
  border: "1px solid var(--orca-color-border)",
  borderRadius: "8px",
  overflow: "hidden",
  background: "var(--orca-color-bg-2)",
  fontSize: "0.9em",
};

export const toolHeaderStyle: React.CSSProperties = {
  padding: "8px 12px",
  background: "var(--orca-color-bg-3)",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  gap: "8px",
  userSelect: "none",
  color: "var(--orca-color-text-1)",
};

export const toolBodyStyle: React.CSSProperties = {
  padding: "12px",
  borderTop: "1px solid var(--orca-color-border)",
  fontFamily: "var(--orca-fontfamily-code)",
  whiteSpace: "pre-wrap",
  wordBreak: "break-all",
  maxHeight: "300px",
  overflowY: "auto",
  background: "var(--orca-color-bg-1)",
  color: "var(--orca-color-text-1)",
};

// ─────────────────────────────────────────────────────────────────────────────
// Empty State Styles
// ─────────────────────────────────────────────────────────────────────────────

export const emptyStateContainerStyle: React.CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  padding: "40px 20px",
  color: "var(--orca-color-text-1)",
  animation: "messageSlideIn 0.4s ease-out",
};

export const emptyStateTitleStyle: React.CSSProperties = {
  fontSize: "24px",
  fontWeight: 600,
  marginBottom: "12px",
  background: "linear-gradient(135deg, var(--orca-color-primary) 0%, var(--orca-color-text-1) 100%)",
  WebkitBackgroundClip: "text",
  WebkitTextFillColor: "transparent",
  textAlign: "center",
};

export const emptyStateSubtitleStyle: React.CSSProperties = {
  fontSize: "14px",
  color: "var(--orca-color-text-2)",
  marginBottom: "32px",
  textAlign: "center",
  maxWidth: "400px",
  lineHeight: "1.5",
};

export const suggestionGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
  gap: "12px",
  width: "100%",
  maxWidth: "600px",
};

export const suggestionCardStyle: React.CSSProperties = {
  padding: "16px",
  background: "var(--orca-color-bg-2)",
  border: "1px solid var(--orca-color-border)",
  borderRadius: "12px",
  cursor: "pointer",
  transition: "all 0.2s ease",
  display: "flex",
  flexDirection: "column",
  gap: "8px",
};

export const suggestionIconStyle: React.CSSProperties = {
  fontSize: "20px",
  marginBottom: "4px",
};

export const suggestionTitleStyle: React.CSSProperties = {
  fontSize: "14px",
  fontWeight: 600,
  color: "var(--orca-color-text-1)",
};

export const suggestionDescStyle: React.CSSProperties = {
  fontSize: "12px",
  color: "var(--orca-color-text-2)",
};
