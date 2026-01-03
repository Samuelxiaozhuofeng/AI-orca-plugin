/**
 * ScrollToBottomButton Component
 *
 * A floating button that appears when the user scrolls up in a long conversation.
 * Clicking it smoothly scrolls to the bottom of the message list.
 *
 * **Feature: chat-ui-enhancement**
 * **Validates: Requirements 4.2, 4.3**
 */

import { ensureChatStyles } from "../styles/chat-animations";

const React = window.React as unknown as {
  createElement: typeof window.React.createElement;
  useEffect: (fn: () => void | (() => void), deps: any[]) => void;
};
const { createElement, useEffect } = React;

export interface ScrollToBottomButtonProps {
  /** Whether the button should be visible */
  visible: boolean;
  /** Callback when the button is clicked */
  onClick: () => void;
  /** Optional: Number of new messages (for badge display) */
  newMessageCount?: number;
}

const containerStyle: React.CSSProperties = {
  position: "absolute",
  bottom: "16px",
  left: "50%",
  transform: "translateX(-50%)",
  zIndex: 100,
  transition: "opacity 0.2s ease, transform 0.2s ease",
};

const buttonStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "6px",
  padding: "8px 16px",
  borderRadius: "20px",
  border: "1px solid var(--orca-color-border, rgba(128, 128, 128, 0.2))",
  background: "var(--orca-color-bg-1, #fff)",
  boxShadow: "0 2px 12px rgba(0, 0, 0, 0.15)",
  cursor: "pointer",
  fontSize: "13px",
  fontWeight: 500,
  color: "var(--orca-color-text-1, #333)",
  transition: "all 0.2s ease",
  userSelect: "none",
};

const buttonHoverStyle: React.CSSProperties = {
  ...buttonStyle,
  background: "var(--orca-color-bg-2, #f5f5f5)",
  boxShadow: "0 4px 16px rgba(0, 0, 0, 0.2)",
};

const iconStyle: React.CSSProperties = {
  fontSize: "16px",
  color: "var(--orca-color-primary, #007bff)",
};

const badgeStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: "18px",
  height: "18px",
  padding: "0 5px",
  borderRadius: "9px",
  background: "var(--orca-color-primary, #007bff)",
  color: "#fff",
  fontSize: "11px",
  fontWeight: 600,
};

/**
 * ScrollToBottomButton - Floating button to scroll to the latest messages
 * 
 * @param visible - Whether the button should be visible
 * @param onClick - Callback when the button is clicked
 * @param newMessageCount - Optional number of new messages to display as a badge
 */
export default function ScrollToBottomButton({
  visible,
  onClick,
  newMessageCount,
}: ScrollToBottomButtonProps) {
  useEffect(() => {
    ensureChatStyles();
  }, []);

  if (!visible) {
    return null;
  }

  return createElement(
    "div",
    {
      style: {
        ...containerStyle,
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? "auto" : "none",
      },
    },
    createElement(
      "button",
      {
        style: buttonStyle,
        onClick,
        onMouseOver: (e: any) => {
          Object.assign(e.currentTarget.style, buttonHoverStyle);
        },
        onMouseOut: (e: any) => {
          Object.assign(e.currentTarget.style, buttonStyle);
        },
        title: "跳转到最新消息",
      },
      createElement("i", {
        className: "ti ti-arrow-down",
        style: iconStyle,
      }),
      createElement("span", null, "跳转到最新"),
      newMessageCount && newMessageCount > 0
        ? createElement("span", { style: badgeStyle }, newMessageCount > 99 ? "99+" : newMessageCount)
        : null
    )
  );
}
