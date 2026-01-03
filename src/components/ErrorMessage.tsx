/**
 * ErrorMessage Component
 *
 * Displays network error messages with a retry button.
 * Used when API calls fail to provide user feedback and recovery options.
 *
 * **Feature: chat-ui-enhancement**
 * **Validates: Requirements 11.3**
 */

const React = window.React as unknown as {
  createElement: typeof window.React.createElement;
  useCallback: <T extends (...args: any[]) => any>(fn: T, deps: any[]) => T;
};
const { createElement, useCallback } = React;

interface ErrorMessageProps {
  /** The error message to display */
  message: string;
  /** Callback when retry button is clicked */
  onRetry?: () => void;
  /** Whether retry is currently in progress */
  isRetrying?: boolean;
}

const containerStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "12px",
  padding: "16px",
  borderRadius: "12px",
  background: "var(--orca-color-bg-danger, rgba(220, 53, 69, 0.08))",
  border: "1px solid var(--orca-color-danger, #dc3545)",
  maxWidth: "90%",
  animation: "messageFadeSlideIn 300ms ease-out",
};

const headerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  color: "var(--orca-color-danger, #dc3545)",
  fontWeight: 600,
  fontSize: "14px",
};

const iconStyle: React.CSSProperties = {
  fontSize: "18px",
};

const messageStyle: React.CSSProperties = {
  fontSize: "13px",
  color: "var(--orca-color-text-2)",
  lineHeight: 1.5,
  wordBreak: "break-word",
};

const actionsStyle: React.CSSProperties = {
  display: "flex",
  gap: "8px",
  marginTop: "4px",
};

const retryButtonStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "6px",
  padding: "8px 16px",
  borderRadius: "8px",
  border: "none",
  background: "var(--orca-color-danger, #dc3545)",
  color: "#fff",
  fontSize: "13px",
  fontWeight: 500,
  cursor: "pointer",
  transition: "all 0.2s ease",
};

const retryButtonDisabledStyle: React.CSSProperties = {
  ...retryButtonStyle,
  opacity: 0.6,
  cursor: "not-allowed",
};

/**
 * ErrorMessage - Displays error with retry option
 * Shows a clear error message and provides a retry button for recovery
 */
export default function ErrorMessage({ message, onRetry, isRetrying }: ErrorMessageProps) {
  const handleRetry = useCallback(() => {
    if (onRetry && !isRetrying) {
      onRetry();
    }
  }, [onRetry, isRetrying]);

  return createElement(
    "div",
    { style: containerStyle },
    // Header with icon
    createElement(
      "div",
      { style: headerStyle },
      createElement("i", {
        className: "ti ti-alert-circle",
        style: iconStyle,
      }),
      createElement("span", null, "请求失败")
    ),
    // Error message
    createElement(
      "div",
      { style: messageStyle },
      message || "网络错误，请检查网络连接后重试"
    ),
    // Actions
    onRetry && createElement(
      "div",
      { style: actionsStyle },
      createElement(
        "button",
        {
          style: isRetrying ? retryButtonDisabledStyle : retryButtonStyle,
          onClick: handleRetry,
          disabled: isRetrying,
          onMouseEnter: (e: any) => {
            if (!isRetrying) {
              e.currentTarget.style.background = "var(--orca-color-danger-dark, #c82333)";
              e.currentTarget.style.transform = "translateY(-1px)";
            }
          },
          onMouseLeave: (e: any) => {
            if (!isRetrying) {
              e.currentTarget.style.background = "var(--orca-color-danger, #dc3545)";
              e.currentTarget.style.transform = "translateY(0)";
            }
          },
        },
        createElement("i", {
          className: isRetrying ? "ti ti-loader" : "ti ti-refresh",
          style: {
            fontSize: "14px",
            animation: isRetrying ? "spin 1s linear infinite" : undefined,
          },
        }),
        isRetrying ? "重试中..." : "重试"
      )
    )
  );
}
