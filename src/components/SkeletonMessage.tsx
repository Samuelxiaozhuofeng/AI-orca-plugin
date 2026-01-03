/**
 * SkeletonMessage Component
 *
 * Skeleton placeholder for loading messages with shimmer animation.
 * Displays a placeholder while messages are loading.
 *
 * **Feature: chat-ui-enhancement**
 * **Validates: Requirements 11.1**
 */

import { ensureChatStyles } from "../styles/chat-animations";

const React = window.React as unknown as {
  createElement: typeof window.React.createElement;
  useEffect: (fn: () => void | (() => void), deps: any[]) => void;
};
const { createElement, useEffect } = React;

interface SkeletonMessageProps {
  role: "user" | "assistant";
}

/**
 * Skeleton shimmer animation styles
 * Creates a moving gradient effect to indicate loading
 */
const skeletonBaseStyle: React.CSSProperties = {
  background: "linear-gradient(90deg, var(--orca-color-bg-3) 25%, var(--orca-color-bg-2) 50%, var(--orca-color-bg-3) 75%)",
  backgroundSize: "200% 100%",
  animation: "skeletonShimmer 1.5s ease-in-out infinite",
  borderRadius: "4px",
};

const containerStyle = (role: "user" | "assistant"): React.CSSProperties => ({
  width: "100%",
  display: "flex",
  justifyContent: role === "user" ? "flex-end" : "flex-start",
  marginBottom: "12px",
  animation: "messageFadeSlideIn 300ms ease-out",
});

const bubbleStyle = (role: "user" | "assistant"): React.CSSProperties => ({
  maxWidth: role === "user" ? "75%" : "90%",
  width: role === "user" ? "200px" : "300px",
  padding: role === "user" ? "10px 14px" : "14px 18px",
  borderRadius: role === "user" ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
  background: "var(--orca-color-bg-2)",
  boxShadow: "0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.03)",
  display: "flex",
  flexDirection: "column",
  gap: "8px",
});

const lineStyle = (width: string): React.CSSProperties => ({
  ...skeletonBaseStyle,
  height: "14px",
  width,
});

/**
 * SkeletonMessage - Placeholder skeleton for loading messages
 * Shows animated skeleton lines while content is loading
 */
export default function SkeletonMessage({ role }: SkeletonMessageProps) {
  useEffect(() => {
    ensureChatStyles();
  }, []);

  // User messages show shorter skeleton
  if (role === "user") {
    return createElement(
      "div",
      { style: containerStyle(role) },
      createElement(
        "div",
        { style: bubbleStyle(role) },
        createElement("div", { style: lineStyle("80%") }),
        createElement("div", { style: lineStyle("60%") })
      )
    );
  }

  // Assistant messages show longer skeleton with more lines
  return createElement(
    "div",
    { style: containerStyle(role) },
    createElement(
      "div",
      { style: bubbleStyle(role) },
      createElement("div", { style: lineStyle("90%") }),
      createElement("div", { style: lineStyle("100%") }),
      createElement("div", { style: lineStyle("75%") }),
      createElement("div", { style: lineStyle("85%") })
    )
  );
}
