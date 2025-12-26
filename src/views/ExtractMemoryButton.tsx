/**
 * ExtractMemoryButton - Button component for extracting memories from AI messages
 * Displays on AI response messages to allow users to extract user information
 * Requirements: 13.1
 */

import type { ExtractedMemory } from "../services/memory-extraction";

const React = window.React as unknown as {
  createElement: typeof window.React.createElement;
  useState: <T>(initial: T | (() => T)) => [T, (next: T | ((prev: T) => T)) => void];
  useCallback: <T extends (...args: any[]) => any>(fn: T, deps: any[]) => T;
  useEffect: (fn: () => void | (() => void), deps: any[]) => void;
  useRef: <T>(value: T) => { current: T };
};
const { createElement, useState, useCallback, useEffect, useRef } = React;

// ============================================================================
// Styles
// ============================================================================

const containerStyle: React.CSSProperties = {
  position: "relative",
  display: "inline-block",
};

const extractButtonStyle: React.CSSProperties = {
  padding: "2px 6px",
  fontSize: "12px",
  cursor: "pointer",
  color: "var(--orca-color-text-2)",
  background: "transparent",
  border: "none",
  borderRadius: "2px",
  display: "flex",
  alignItems: "center",
  gap: "4px",
  transition: "color 0.15s ease, background 0.15s ease",
};

const extractButtonHoverStyle: React.CSSProperties = {
  ...extractButtonStyle,
  color: "var(--orca-color-primary, #007bff)",
  background: "var(--orca-color-bg-3)",
};

const extractButtonLoadingStyle: React.CSSProperties = {
  ...extractButtonStyle,
  cursor: "not-allowed",
  opacity: 0.6,
};

// Dropdown menu style (positioned above the button to avoid overflow)
const dropdownMenuStyle: React.CSSProperties = {
  position: "absolute",
  bottom: "100%",
  right: 0,
  marginBottom: "4px",
  background: "var(--orca-color-bg-1)",
  borderRadius: "6px",
  padding: "8px",
  minWidth: "260px",
  maxWidth: "300px",
  boxShadow: "0 -4px 12px rgba(0, 0, 0, 0.15)",
  border: "1px solid var(--orca-color-border)",
  zIndex: 100,
};

const promptInputStyle: React.CSSProperties = {
  width: "100%",
  padding: "6px 10px",
  borderRadius: "4px",
  border: "1px solid var(--orca-color-border)",
  background: "var(--orca-color-bg-2)",
  color: "var(--orca-color-text-1)",
  fontSize: "12px",
  outline: "none",
  boxSizing: "border-box",
};

const promptInputHintStyle: React.CSSProperties = {
  fontSize: "11px",
  color: "var(--orca-color-text-2)",
  marginTop: "6px",
  marginBottom: "8px",
  lineHeight: "1.4",
};

const promptInputActionsStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "flex-end",
  gap: "6px",
};

const promptInputBtnStyle: React.CSSProperties = {
  padding: "4px 10px",
  borderRadius: "4px",
  border: "none",
  fontSize: "12px",
  cursor: "pointer",
};

// ============================================================================
// Types
// ============================================================================

export interface ExtractMemoryButtonProps {
  /** The conversation context to analyze for memory extraction */
  conversationContext: string;
  /** Callback when extraction is complete with extracted memories */
  onExtracted: (memories: ExtractedMemory[]) => void;
  /** Callback when extraction starts (for loading state) */
  onExtractionStart?: () => void;
  /** Callback when extraction fails */
  onExtractionError?: (error: string) => void;
  /** Callback when dropdown visibility changes */
  onDropdownVisibilityChange?: (isVisible: boolean) => void;
}

// ============================================================================
// Component
// ============================================================================

export default function ExtractMemoryButton({
  conversationContext,
  onExtracted,
  onExtractionStart,
  onExtractionError,
  onDropdownVisibilityChange,
}: ExtractMemoryButtonProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [showDropdown, setShowDropdown] = useState(false);
  const [customPrompt, setCustomPrompt] = useState("");
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    if (!showDropdown) return;
    
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
        setCustomPrompt("");
      }
    };
    
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showDropdown]);

  // Notify parent when dropdown visibility changes
  useEffect(() => {
    onDropdownVisibilityChange?.(showDropdown);
  }, [showDropdown, onDropdownVisibilityChange]);

  const doExtract = useCallback(async (prompt?: string) => {
    if (isLoading || !conversationContext.trim()) return;

    setIsLoading(true);
    setShowDropdown(false);
    onExtractionStart?.();

    try {
      // Dynamic import to avoid circular dependencies
      const { extractMemories } = await import("../services/memory-extraction");
      const result = await extractMemories(conversationContext, prompt);

      if (!result.success) {
        onExtractionError?.(result.error || "提取失败");
        if (typeof orca !== "undefined" && orca.notify) {
          orca.notify("error", result.error || "记忆提取失败");
        }
        return;
      }

      if (result.memories.length === 0) {
        if (typeof orca !== "undefined" && orca.notify) {
          orca.notify("info", "未能从对话中提取到有效信息");
        }
        return;
      }

      onExtracted(result.memories);
    } catch (error: any) {
      const errorMsg = error?.message || "记忆提取失败";
      onExtractionError?.(errorMsg);
      if (typeof orca !== "undefined" && orca.notify) {
        orca.notify("error", errorMsg);
      }
    } finally {
      setIsLoading(false);
      setCustomPrompt("");
    }
  }, [conversationContext, isLoading, onExtracted, onExtractionStart, onExtractionError]);

  const handleClick = useCallback(() => {
    if (isLoading || !conversationContext.trim()) return;
    setShowDropdown(!showDropdown);
  }, [conversationContext, isLoading, showDropdown]);

  const handleConfirmExtract = useCallback(() => {
    doExtract(customPrompt.trim() || undefined);
  }, [doExtract, customPrompt]);

  const handleCancelDropdown = useCallback(() => {
    setShowDropdown(false);
    setCustomPrompt("");
  }, []);

  const currentStyle = isLoading
    ? extractButtonLoadingStyle
    : isHovered
    ? extractButtonHoverStyle
    : extractButtonStyle;

  return createElement(
    "div",
    { style: containerStyle, ref: containerRef },
    createElement(
      "button",
      {
        style: currentStyle,
        onClick: handleClick,
        onMouseEnter: () => setIsHovered(true),
        onMouseLeave: () => setIsHovered(false),
        title: "提取印象 - 从对话中提取用户信息",
        disabled: isLoading,
      },
      isLoading
        ? createElement("i", { className: "ti ti-loader-2", style: { animation: "spin 1s linear infinite" } })
        : createElement("i", { className: "ti ti-brain" }),
      isLoading ? "提取中..." : "提取印象"
    ),
    // Dropdown menu
    showDropdown && createElement(
      "div",
      { style: dropdownMenuStyle },
      createElement("input", {
        type: "text",
        placeholder: "输入提取提示（可选）...",
        value: customPrompt,
        onChange: (e: any) => setCustomPrompt(e.target.value),
        style: promptInputStyle,
        autoFocus: true,
        onKeyDown: (e: any) => {
          if (e.key === "Enter") handleConfirmExtract();
          if (e.key === "Escape") handleCancelDropdown();
        },
      }),
      createElement(
        "div",
        { style: promptInputHintStyle },
        "例如：身高、饮食偏好、工作信息"
      ),
      createElement(
        "div",
        { style: promptInputActionsStyle },
        createElement(
          "button",
          {
            style: { ...promptInputBtnStyle, background: "var(--orca-color-bg-3)", color: "var(--orca-color-text-2)" },
            onClick: handleCancelDropdown,
          },
          "取消"
        ),
        createElement(
          "button",
          {
            style: { ...promptInputBtnStyle, background: "var(--orca-color-primary)", color: "#fff" },
            onClick: handleConfirmExtract,
          },
          "提取"
        )
      )
    )
  );
}
