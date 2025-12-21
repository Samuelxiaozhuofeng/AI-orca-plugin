/**
 * Loading Dots Component
 *
 * Animated loading indicator for chat messages.
 */

const React = window.React as unknown as {
  createElement: typeof window.React.createElement;
};
const { createElement } = React;

const dotStyle: React.CSSProperties = {
  display: "inline-block",
  width: "6px",
  height: "6px",
  borderRadius: "50%",
  background: "var(--orca-color-text-3)",
  margin: "0 3px",
  animation: "loadingDots 1.4s infinite ease-in-out",
};

export default function LoadingDots() {
  return createElement(
    "div",
    {
      style: {
        padding: "12px 16px",
        display: "flex",
        alignItems: "center",
        height: "24px",
      },
    },
    createElement("span", { style: { ...dotStyle, animationDelay: "0s" } }),
    createElement("span", { style: { ...dotStyle, animationDelay: "0.2s" } }),
    createElement("span", { style: { ...dotStyle, animationDelay: "0.4s" } })
  );
}
