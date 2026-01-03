/**
 * DateSeparator Component
 *
 * Displays a date separator line between message groups.
 * Style: centered text with horizontal lines on both sides.
 *
 * **Feature: chat-ui-enhancement**
 * **Validates: Requirements 4.1**
 */

import { formatDateSeparator } from "../utils/chat-ui-utils";

const React = window.React as unknown as {
  createElement: typeof window.React.createElement;
};
const { createElement } = React;

export interface DateSeparatorProps {
  date: Date;
  /** Optional: pre-formatted label (if not provided, will use formatDateSeparator) */
  label?: string;
}

const containerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "12px",
  margin: "16px 0",
  userSelect: "none",
};

const lineStyle: React.CSSProperties = {
  flex: 1,
  height: "1px",
  background: "var(--orca-color-border, rgba(128, 128, 128, 0.2))",
};

const labelStyle: React.CSSProperties = {
  fontSize: "12px",
  fontWeight: 500,
  color: "var(--orca-color-text-3, #999)",
  padding: "4px 12px",
  background: "var(--orca-color-bg-2, rgba(128, 128, 128, 0.05))",
  borderRadius: "12px",
  whiteSpace: "nowrap",
};

/**
 * DateSeparator - Displays a date separator with centered text and lines
 * 
 * @param date - The date to display
 * @param label - Optional pre-formatted label
 */
export default function DateSeparator({ date, label }: DateSeparatorProps) {
  const displayLabel = label ?? formatDateSeparator(date);

  return createElement(
    "div",
    { style: containerStyle, className: "date-separator" },
    createElement("div", { style: lineStyle }),
    createElement("span", { style: labelStyle }, displayLabel),
    createElement("div", { style: lineStyle })
  );
}
