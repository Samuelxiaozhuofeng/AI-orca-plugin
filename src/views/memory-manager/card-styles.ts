/**
 * Card-based layout styles for Memory Manager
 * Provides consistent styling for UserManagementCard, UserPortraitCard, and MemoryCard
 * Requirements: 14.1, 14.5
 */

// ============================================================================
// Card Base Styles
// ============================================================================

export const cardStyle: React.CSSProperties = {
  background: "var(--orca-color-bg-2)",
  borderRadius: "12px",
  border: "1px solid var(--orca-color-border)",
  marginBottom: "16px",
  overflow: "hidden",
};

export const cardHeaderStyle: React.CSSProperties = {
  padding: "10px 14px",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  borderBottom: "1px solid var(--orca-color-border)",
  background: "var(--orca-color-bg-3)",
  cursor: "pointer",
  userSelect: "none",
};

export const cardHeaderCollapsedStyle: React.CSSProperties = {
  ...cardHeaderStyle,
  borderBottom: "none",
};

export const cardTitleStyle: React.CSSProperties = {
  fontSize: "13px",
  fontWeight: 600,
  color: "var(--orca-color-text-1)",
  display: "flex",
  alignItems: "center",
  gap: "6px",
};

export const cardCollapseIconStyle: React.CSSProperties = {
  fontSize: "12px",
  color: "var(--orca-color-text-2)",
  transition: "transform 0.2s ease",
};

export const cardBodyStyle: React.CSSProperties = {
  padding: "12px 14px",
};

export const cardActionsStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
};

// ============================================================================
// User Management Card Styles
// ============================================================================

export const userAvatarStyle: React.CSSProperties = {
  width: "40px",
  height: "40px",
  borderRadius: "50%",
  background: "var(--orca-color-bg-3)",
  color: "var(--orca-color-text-1)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "18px",
  fontWeight: 500,
  cursor: "pointer",
  transition: "transform 0.2s ease, background 0.2s ease",
  border: "1px solid var(--orca-color-border)",
  flexShrink: 0,
};

export const userAvatarHoverStyle: React.CSSProperties = {
  ...userAvatarStyle,
  transform: "scale(1.05)",
  background: "var(--orca-color-bg-2)",
};

export const userInfoContainerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "16px",
};

export const userDetailsStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
};

export const userNameRowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  marginBottom: "4px",
};

export const userNameStyle: React.CSSProperties = {
  fontSize: "16px",
  fontWeight: 600,
  color: "var(--orca-color-text-1)",
};

export const userStatsStyle: React.CSSProperties = {
  fontSize: "13px",
  color: "var(--orca-color-text-2)",
};

export const userSelectorStyle: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: "6px",
  border: "1px solid var(--orca-color-border)",
  background: "var(--orca-color-bg-1)",
  color: "var(--orca-color-text-1)",
  fontSize: "14px",
  cursor: "pointer",
  outline: "none",
  minWidth: "120px",
};

export const userActionButtonStyle: React.CSSProperties = {
  padding: "6px",
  borderRadius: "6px",
  border: "none",
  background: "transparent",
  color: "var(--orca-color-text-2)",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "16px",
  transition: "background 0.15s ease, color 0.15s ease",
};


// ============================================================================
// User Portrait Card Styles
// ============================================================================

export const portraitTagsContainerStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "8px",
  marginBottom: "16px",
};

export const portraitTagStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "4px",
  padding: "6px 12px",
  borderRadius: "16px",
  background: "var(--orca-color-bg-3)",
  border: "1px solid var(--orca-color-border)",
  fontSize: "13px",
  color: "var(--orca-color-text-1)",
  cursor: "pointer",
  transition: "background 0.15s ease, border-color 0.15s ease",
};

export const portraitTagEmojiStyle: React.CSSProperties = {
  fontSize: "14px",
};

export const portraitCategoryStyle: React.CSSProperties = {
  marginBottom: "12px",
  padding: "12px",
  borderRadius: "8px",
  background: "var(--orca-color-bg-1)",
  border: "1px solid var(--orca-color-border)",
};

export const portraitCategoryTitleStyle: React.CSSProperties = {
  fontSize: "12px",
  fontWeight: 600,
  color: "var(--orca-color-text-2)",
  marginBottom: "6px",
  textTransform: "uppercase",
  letterSpacing: "0.5px",
};

export const portraitCategoryContentStyle: React.CSSProperties = {
  fontSize: "14px",
  color: "var(--orca-color-text-1)",
  lineHeight: "1.5",
};

export const generateButtonStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 16px",
  borderRadius: "8px",
  border: "1px dashed var(--orca-color-border)",
  background: "transparent",
  color: "var(--orca-color-text-2)",
  fontSize: "14px",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "8px",
  transition: "background 0.15s ease, border-color 0.15s ease, color 0.15s ease",
};

export const portraitEmptyStyle: React.CSSProperties = {
  textAlign: "center",
  padding: "24px",
  color: "var(--orca-color-text-2)",
  fontSize: "14px",
};

// ============================================================================
// Memory Card Styles
// Requirements: 14.3 - Clean list design with subtle borders and appropriate spacing
// ============================================================================

export const memoryToolbarStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  marginBottom: "12px",
};

export const memorySearchInputStyle: React.CSSProperties = {
  flex: 1,
  padding: "6px 10px",
  borderRadius: "6px",
  border: "1px solid var(--orca-color-border)",
  background: "var(--orca-color-bg-1)",
  color: "var(--orca-color-text-1)",
  fontSize: "13px",
  outline: "none",
  transition: "border-color 0.2s ease",
};

export const memoryAddButtonStyle: React.CSSProperties = {
  padding: "6px 12px",
  borderRadius: "6px",
  border: "none",
  background: "var(--orca-color-primary, #007bff)",
  color: "#fff",
  fontSize: "13px",
  fontWeight: 500,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  gap: "4px",
  whiteSpace: "nowrap",
  transition: "opacity 0.15s ease",
};

export const memoryListStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "10px",
};

export const memoryItemStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "flex-start",
  gap: "14px",
  padding: "14px 16px",
  borderRadius: "10px",
  border: "1px solid var(--orca-color-border)",
  background: "var(--orca-color-bg-1)",
  transition: "border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease",
  boxShadow: "0 1px 3px rgba(0, 0, 0, 0.04)",
};

export const memoryItemDisabledStyle: React.CSSProperties = {
  ...memoryItemStyle,
  opacity: 0.55,
  background: "var(--orca-color-bg-2)",
};

export const memoryContentStyle: React.CSSProperties = {
  flex: 1,
  fontSize: "14px",
  lineHeight: "1.6",
  wordBreak: "break-word",
  color: "var(--orca-color-text-1)",
  paddingTop: "1px",
};

export const memoryActionsStyle: React.CSSProperties = {
  display: "flex",
  gap: "2px",
  flexShrink: 0,
  opacity: 0.7,
  transition: "opacity 0.15s ease",
};

export const memoryCheckboxStyle: React.CSSProperties = {
  width: "18px",
  height: "18px",
  cursor: "pointer",
  accentColor: "var(--orca-color-primary, #007bff)",
  flexShrink: 0,
  marginTop: "2px",
};

// ============================================================================
// Empty State Styles
// Requirements: 14.4, 9.2 - Attractive illustration with encouraging guidance text
// ============================================================================

export const emptyStateStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  justifyContent: "center",
  padding: "48px 32px",
  textAlign: "center",
  background: "linear-gradient(180deg, var(--orca-color-bg-1) 0%, var(--orca-color-bg-2) 100%)",
  borderRadius: "16px",
  border: "1px dashed var(--orca-color-border)",
  position: "relative",
  overflow: "hidden",
};

export const emptyStateDecorationStyle: React.CSSProperties = {
  position: "absolute",
  top: "-20px",
  right: "-20px",
  width: "120px",
  height: "120px",
  borderRadius: "50%",
  background: "linear-gradient(135deg, rgba(0, 123, 255, 0.08) 0%, rgba(0, 123, 255, 0.02) 100%)",
  pointerEvents: "none",
};

export const emptyStateDecorationLeftStyle: React.CSSProperties = {
  position: "absolute",
  bottom: "-30px",
  left: "-30px",
  width: "100px",
  height: "100px",
  borderRadius: "50%",
  background: "linear-gradient(135deg, rgba(0, 123, 255, 0.06) 0%, rgba(0, 123, 255, 0.01) 100%)",
  pointerEvents: "none",
};

export const emptyIconContainerStyle: React.CSSProperties = {
  width: "96px",
  height: "96px",
  borderRadius: "50%",
  background: "linear-gradient(135deg, rgba(0, 123, 255, 0.15) 0%, rgba(0, 123, 255, 0.05) 100%)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  marginBottom: "24px",
  boxShadow: "0 8px 24px rgba(0, 123, 255, 0.12), inset 0 -2px 8px rgba(0, 123, 255, 0.1)",
  position: "relative",
  zIndex: 1,
};

export const emptyIconInnerStyle: React.CSSProperties = {
  width: "72px",
  height: "72px",
  borderRadius: "50%",
  background: "linear-gradient(135deg, rgba(0, 123, 255, 0.2) 0%, rgba(0, 123, 255, 0.08) 100%)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  boxShadow: "inset 0 2px 4px rgba(255, 255, 255, 0.1)",
};

export const emptyIconStyle: React.CSSProperties = {
  fontSize: "36px",
  filter: "drop-shadow(0 2px 4px rgba(0, 0, 0, 0.1))",
};

export const emptyTitleStyle: React.CSSProperties = {
  fontSize: "20px",
  fontWeight: 700,
  marginBottom: "12px",
  color: "var(--orca-color-text-1)",
  letterSpacing: "-0.3px",
  position: "relative",
  zIndex: 1,
};

export const emptyDescStyle: React.CSSProperties = {
  fontSize: "14px",
  lineHeight: "1.8",
  color: "var(--orca-color-text-2)",
  marginBottom: "28px",
  maxWidth: "300px",
  position: "relative",
  zIndex: 1,
};

export const emptyHighlightStyle: React.CSSProperties = {
  color: "var(--orca-color-primary, #007bff)",
  fontWeight: 500,
};

export const emptyAddButtonStyle: React.CSSProperties = {
  padding: "16px 32px",
  borderRadius: "14px",
  border: "none",
  background: "linear-gradient(135deg, var(--orca-color-primary, #007bff) 0%, #0056b3 100%)",
  color: "#fff",
  fontSize: "16px",
  fontWeight: 600,
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  gap: "12px",
  transition: "transform 0.2s ease, box-shadow 0.2s ease",
  boxShadow: "0 6px 20px rgba(0, 123, 255, 0.4)",
  position: "relative",
  zIndex: 1,
  letterSpacing: "0.3px",
};

// ============================================================================
// Emoji Picker Styles
// ============================================================================

export const emojiPickerOverlayStyle: React.CSSProperties = {
  position: "fixed",
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  background: "rgba(0, 0, 0, 0.3)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
};

export const emojiPickerContainerStyle: React.CSSProperties = {
  background: "var(--orca-color-bg-1)",
  borderRadius: "12px",
  padding: "16px",
  boxShadow: "0 8px 32px rgba(0, 0, 0, 0.2)",
  maxWidth: "320px",
  width: "90%",
};

export const emojiPickerTitleStyle: React.CSSProperties = {
  fontSize: "14px",
  fontWeight: 600,
  marginBottom: "12px",
  color: "var(--orca-color-text-1)",
};

export const emojiGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(8, 1fr)",
  gap: "4px",
  maxHeight: "200px",
  overflowY: "auto",
};

export const emojiItemStyle: React.CSSProperties = {
  width: "32px",
  height: "32px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "18px",
  cursor: "pointer",
  borderRadius: "6px",
  transition: "background 0.15s ease",
};

export const emojiInputContainerStyle: React.CSSProperties = {
  marginTop: "12px",
  display: "flex",
  gap: "8px",
};

export const emojiInputStyle: React.CSSProperties = {
  flex: 1,
  padding: "8px 12px",
  borderRadius: "6px",
  border: "1px solid var(--orca-color-border)",
  background: "var(--orca-color-bg-2)",
  color: "var(--orca-color-text-1)",
  fontSize: "14px",
  outline: "none",
};

// ============================================================================
// Modal Styles
// ============================================================================

export const modalOverlayStyle: React.CSSProperties = {
  position: "fixed",
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
  background: "rgba(0, 0, 0, 0.5)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 1000,
};

export const modalStyle: React.CSSProperties = {
  background: "var(--orca-color-bg-1)",
  borderRadius: "12px",
  padding: "24px",
  minWidth: "320px",
  maxWidth: "400px",
  boxShadow: "0 8px 32px rgba(0, 0, 0, 0.2)",
};

export const modalTitleStyle: React.CSSProperties = {
  fontSize: "18px",
  fontWeight: 600,
  marginBottom: "16px",
  color: "var(--orca-color-text-1)",
};

export const modalButtonsStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: "12px",
  marginTop: "24px",
};

export const cancelButtonStyle: React.CSSProperties = {
  padding: "8px 16px",
  borderRadius: "6px",
  border: "1px solid var(--orca-color-border)",
  background: "transparent",
  color: "var(--orca-color-text-1)",
  fontSize: "14px",
  cursor: "pointer",
};

export const dangerButtonStyle: React.CSSProperties = {
  padding: "8px 16px",
  borderRadius: "6px",
  border: "none",
  background: "var(--orca-color-danger, #dc3545)",
  color: "#fff",
  fontSize: "14px",
  cursor: "pointer",
};

// ============================================================================
// Input Styles
// ============================================================================

export const editInputStyle: React.CSSProperties = {
  flex: 1,
  padding: "8px 12px",
  borderRadius: "6px",
  border: "1px solid var(--orca-color-primary, #007bff)",
  background: "var(--orca-color-bg-1)",
  color: "var(--orca-color-text-1)",
  fontSize: "14px",
  outline: "none",
  resize: "none",
  minHeight: "60px",
  fontFamily: "inherit",
};

export const iconButtonStyle: React.CSSProperties = {
  padding: "6px",
  borderRadius: "4px",
  border: "none",
  background: "transparent",
  color: "var(--orca-color-text-2)",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: "16px",
};
