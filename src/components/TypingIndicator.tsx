/**
 * Typing Indicator Component
 *
 * Animated typing indicator with three bouncing dots.
 * Replaces LoadingDots with a more engaging animation.
 *
 * **Feature: chat-ui-enhancement**
 * **Validates: Requirements 2.1, 2.2**
 */

import { ensureChatStyles } from "../styles/chat-animations";

const React = window.React as unknown as {
  createElement: typeof window.React.createElement;
  useEffect: (fn: () => void | (() => void), deps: any[]) => void;
};
const { createElement, useEffect } = React;

const containerStyle: React.CSSProperties = {
  padding: "12px 16px",
  display: "flex",
  alignItems: "center",
  height: "24px",
  gap: "4px",
};

const dotBaseStyle: React.CSSProperties = {
  display: "inline-block",
  width: "8px",
  height: "8px",
  borderRadius: "50%",
  background: "var(--orca-color-primary, #007bff)",
  animation: "typingBounce 1.4s ease-in-out infinite",
};

/**
 * TypingIndicator - Three dots bouncing animation
 * Each dot bounces with a 200ms delay between them (Requirements 2.2)
 */
export default function TypingIndicator() {
  useEffect(() => {
    ensureChatStyles();
  }, []);

  return createElement(
    "div",
    { style: containerStyle },
    createElement("span", {
      style: { ...dotBaseStyle, animationDelay: "0s" },
    }),
    createElement("span", {
      style: { ...dotBaseStyle, animationDelay: "0.2s" },
    }),
    createElement("span", {
      style: { ...dotBaseStyle, animationDelay: "0.4s" },
    })
  );
}
