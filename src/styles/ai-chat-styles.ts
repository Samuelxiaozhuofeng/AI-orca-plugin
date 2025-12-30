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
  // Gemini UX Review: Message rhythm over density
  // Same speaker: 4-8px, Different speaker: 24px (handled in component)
  marginBottom: "12px",
  animation: "messageSlideIn 0.3s ease-out",
});

export const messageBubbleStyle = (role: string): React.CSSProperties => ({
  maxWidth: role === "user" ? "75%" : "90%",
  // Gemini UX Review: Slightly reduced padding for density
  padding: role === "user" ? "10px 14px" : "14px 18px",
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
  padding: "12px 16px",
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
  color: "var(--orca-color-primary, #007bff)",
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
  color: "var(--orca-color-primary, #007bff)",
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
  background: "var(--orca-color-primary, #007bff)",
  color: "var(--orca-color-text-inverse, #fff)",
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
  // Gemini UX Review: Reduced line-height (1.6)
  lineHeight: "1.6",
  color: "inherit",
  userSelect: "text", // Allow selection/copy of Markdown content
};

// Compatibility alias: list item content remains selectable for copy-paste.
export const listItemStyle2: React.CSSProperties = listItemStyle;

export const paragraphStyle: React.CSSProperties = {
  marginTop: "8px",
  marginBottom: "8px",
  // Gemini UX Review: Reduced line-height (1.6)
  lineHeight: "1.6",
  color: "inherit",
  userSelect: "text", // Allow selection/copy of Markdown content
};

// Image styles for inline images in markdown
export const imageContainerStyle: React.CSSProperties = {
  display: "block",
  margin: "8px 0",
};

export const imageStyle: React.CSSProperties = {
  maxWidth: "100%",
  maxHeight: "400px",
  borderRadius: "8px",
  cursor: "pointer",
  objectFit: "contain",
  boxShadow: "0 2px 8px rgba(0, 0, 0, 0.1)",
  transition: "transform 0.2s ease, box-shadow 0.2s ease",
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

// ─────────────────────────────────────────────────────────────────────────────
// Tool Status Indicator Styles (Gemini UX Review - Semantic Tool Display)
// ─────────────────────────────────────────────────────────────────────────────

type ToolStatus = "loading" | "success" | "failed" | "cancelled";

/**
 * Tool status pill - inline status indicator
 * Gemini UX Review: Pill shape + subtle background + secondary text color
 */
export const toolStatusPillStyle = (status: ToolStatus): React.CSSProperties => ({
  display: "flex",
  alignItems: "center",
  gap: "8px",
  padding: "6px 12px",
  borderRadius: "16px", // Pill shape
  fontSize: "13px",
  background:
    status === "failed"
      ? "var(--orca-color-bg-danger, rgba(255, 0, 0, 0.08))"
      : "var(--orca-color-bg-3)",
  color:
    status === "failed"
      ? "var(--orca-color-danger, #dc3545)"
      : "var(--orca-color-text-2)",
  transition: "all 0.2s ease",
  maxWidth: "100%",
  overflow: "hidden",
});

/**
 * Tool status icon - animated icon container
 */
export const toolStatusIconStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "14px",
  flexShrink: 0,
};

/**
 * Tool status text - status description
 */
export const toolStatusTextStyle: React.CSSProperties = {
  flex: 1,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

/**
 * Tool status expand button - low-contrast code icon
 * Gemini UX Review: Click interaction over hover (touch-friendly)
 */
export const toolStatusExpandButtonStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: "20px",
  height: "20px",
  padding: 0,
  border: "none",
  borderRadius: "4px",
  background: "transparent",
  color: "var(--orca-color-text-3)",
  cursor: "pointer",
  opacity: 0.6,
  transition: "opacity 0.2s ease",
  flexShrink: 0,
};

/**
 * Tool status details - expandable details panel
 */
export const toolStatusDetailsStyle: React.CSSProperties = {
  marginTop: "8px",
  padding: "12px",
  background: "var(--orca-color-bg-2)",
  border: "1px solid var(--orca-color-border)",
  borderRadius: "8px",
  fontSize: "12px",
  color: "var(--orca-color-text-2)",
};

/**
 * Tool status error - error details display
 */
export const toolStatusErrorStyle: React.CSSProperties = {
  marginTop: "8px",
  padding: "8px 12px",
  background: "var(--orca-color-bg-danger, rgba(255, 0, 0, 0.05))",
  border: "1px solid var(--orca-color-danger, #dc3545)",
  borderRadius: "6px",
  fontSize: "12px",
  color: "var(--orca-color-danger, #dc3545)",
  whiteSpace: "pre-wrap",
  wordBreak: "break-all",
};

/**
 * Tool status retry button - retry action button
 */
export const toolStatusRetryButtonStyle: React.CSSProperties = {
  padding: "4px 8px",
  fontSize: "12px",
  border: "1px solid var(--orca-color-border)",
  borderRadius: "4px",
  background: "var(--orca-color-bg-2)",
  color: "var(--orca-color-text-1)",
  cursor: "pointer",
  marginLeft: "8px",
  flexShrink: 0,
};

// ─────────────────────────────────────────────────────────────────────────────
// Message Time Styles
// ─────────────────────────────────────────────────────────────────────────────

export const messageTimeStyle = (role: string): React.CSSProperties => ({
  fontSize: "11px",
  color: "var(--orca-color-text-3)",
  marginTop: "6px",
  textAlign: role === "user" ? "right" : "left",
  userSelect: "none",
});
