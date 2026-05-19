/**
 * ScrollToBottomButton Component
 *
 * A floating button that appears when the user scrolls up in a long conversation.
 * Clicking it smoothly scrolls to the bottom of the message list.
 *
 * Enhanced with:
 * - Bounce-in entrance animation
 * - Subtle floating effect
 * - Arrow bounce animation
 * - Hover scale effect
 *
 * **Feature: chat-ui-enhancement**
 * **Validates: Requirements 4.2, 4.3**
 */

import { ensureChatStyles } from "../styles/chat-animations";
import { withTooltip } from "../utils/orca-tooltip";

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
  zIndex: 10,
};

const buttonStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "6px",
  padding: "10px 18px",
  borderRadius: "var(--orca-radius-full)",
  border: "1px solid var(--orca-color-border, rgba(128, 128, 128, 0.2))",
  background: "var(--orca-color-bg-1, #fff)",
  boxShadow: "0 4px 20px rgba(0, 0, 0, 0.12), 0 2px 6px rgba(0, 0, 0, 0.08)",
  cursor: "pointer",
  fontSize: "13px",
  fontWeight: 500,
  color: "var(--orca-color-text-1, #333)",
  transition: "all 0.2s cubic-bezier(0.34, 1.56, 0.64, 1)",
  userSelect: "none",
  transform: "scale(1)",
};

const buttonHoverStyle: React.CSSProperties = {
  ...buttonStyle,
  background: "var(--orca-color-bg-2, #f5f5f5)",
  boxShadow: "0 6px 24px rgba(0, 0, 0, 0.18), 0 3px 8px rgba(0, 0, 0, 0.1)",
  transform: "scale(1.05)",
};

const iconStyle: React.CSSProperties = {
  fontSize: "16px",
  color: "var(--orca-color-primary, #007bff)",
  display: "inline-flex",
};

const badgeStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: "20px",
  height: "20px",
  padding: "0 6px",
  borderRadius: "10px",
  background: "var(--orca-color-primary, #007bff)",
  border: "none",
  color: "var(--orca-color-text-inverse)",
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

  const animationClass = "scroll-btn-enter scroll-btn-float";

  return createElement(
    "div",
    {
      style: containerStyle,
      className: animationClass,
    },
    withTooltip(
      newMessageCount && newMessageCount > 0 
        ? `跳转到最新 (${newMessageCount} 条新消息)` 
        : "跳转到最新消息",
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
        },
        createElement("i", {
          className: "ti ti-arrow-down scroll-btn-arrow",
          style: iconStyle,
        }),
        newMessageCount && newMessageCount > 0
          ? createElement("span", { style: badgeStyle }, newMessageCount > 99 ? "99+" : newMessageCount)
          : null
      )
    )
  );
}
