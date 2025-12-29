/**
 * SuggestedReplies Component
 * 
 * AI-powered suggested quick replies after AI messages
 * User manually triggers generation to save tokens
 */

import type { Message } from "../services/session-service";

const React = window.React as unknown as {
  createElement: typeof window.React.createElement;
  useState: <T>(initial: T | (() => T)) => [T, (next: T | ((prev: T) => T)) => void];
  useCallback: <T extends (...args: any[]) => any>(fn: T, deps: any[]) => T;
};
const { createElement, useState, useCallback } = React;

interface SuggestedRepliesProps {
  onReplyClick: (text: string) => void;
  onGenerate: () => Promise<string[]>; // 调用 AI 生成建议
}

export default function SuggestedReplies({ onReplyClick, onGenerate }: SuggestedRepliesProps) {
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  const handleGenerate = useCallback(async () => {
    setIsGenerating(true);
    try {
      const generated = await onGenerate();
      setSuggestions(generated);
      setIsVisible(true);
    } catch (err: any) {
      console.error("Failed to generate suggestions:", err);
      const errorMessage = err?.message || "生成建议失败，请重试";
      if (typeof orca !== "undefined" && orca.notify) {
        orca.notify("error", errorMessage);
      }
      // 不设置 isVisible，保持按钮状态让用户可以重试
    } finally {
      setIsGenerating(false);
    }
  }, [onGenerate]);

  const handleClick = useCallback((text: string) => {
    onReplyClick(text);
    // 点击后隐藏建议
    setIsVisible(false);
    setSuggestions([]);
  }, [onReplyClick]);

  // 如果没有生成建议，显示生成按钮
  if (!isVisible || suggestions.length === 0) {
    return createElement(
      "button",
      {
        onClick: handleGenerate,
        disabled: isGenerating,
        style: {
          display: "flex",
          alignItems: "center",
          gap: "6px",
          padding: "6px 12px",
          marginTop: "12px",
          border: "1px solid var(--orca-color-border)",
          borderRadius: "16px",
          background: "var(--orca-color-bg-2)",
          color: "var(--orca-color-text-2)",
          fontSize: "13px",
          cursor: isGenerating ? "wait" : "pointer",
          transition: "all 0.2s ease",
          opacity: isGenerating ? 0.6 : 1,
        },
        onMouseEnter: (e: any) => {
          if (!isGenerating) {
            e.currentTarget.style.background = "var(--orca-color-bg-3)";
            e.currentTarget.style.borderColor = "var(--orca-color-primary)";
            e.currentTarget.style.color = "var(--orca-color-primary)";
          }
        },
        onMouseLeave: (e: any) => {
          e.currentTarget.style.background = "var(--orca-color-bg-2)";
          e.currentTarget.style.borderColor = "var(--orca-color-border)";
          e.currentTarget.style.color = "var(--orca-color-text-2)";
        },
        title: "使用 AI 生成建议回复",
      },
      createElement("i", {
        className: isGenerating ? "ti ti-loader" : "ti ti-sparkles",
        style: {
          fontSize: "14px",
          animation: isGenerating ? "spin 1s linear infinite" : undefined,
        },
      }),
      isGenerating ? "生成中..." : "生成建议回复"
    );
  }

  // 显示生成的建议
  return createElement(
    "div",
    {
      style: {
        display: "flex",
        flexDirection: "column",
        gap: "8px",
        marginTop: "12px",
        marginBottom: "8px",
      },
    },
    // 建议列表
    createElement(
      "div",
      {
        style: {
          display: "flex",
          flexWrap: "wrap",
          gap: "8px",
          opacity: isVisible ? 1 : 0,
          transform: isVisible ? "translateY(0)" : "translateY(10px)",
          transition: "all 0.3s ease-out",
        },
      },
      ...suggestions.map((suggestion, index) =>
        createElement(
          "button",
          {
            key: index,
            onClick: () => handleClick(suggestion),
            style: {
              display: "flex",
              alignItems: "center",
              gap: "6px",
              padding: "6px 12px",
              border: "1px solid var(--orca-color-border)",
              borderRadius: "16px",
              background: "var(--orca-color-bg-2)",
              color: "var(--orca-color-text-2)",
              fontSize: "13px",
              cursor: "pointer",
              transition: "all 0.2s ease",
              whiteSpace: "nowrap",
            },
            onMouseEnter: (e: any) => {
              e.currentTarget.style.background = "var(--orca-color-bg-3)";
              e.currentTarget.style.borderColor = "var(--orca-color-primary)";
              e.currentTarget.style.color = "var(--orca-color-primary)";
              e.currentTarget.style.transform = "translateY(-1px)";
            },
            onMouseLeave: (e: any) => {
              e.currentTarget.style.background = "var(--orca-color-bg-2)";
              e.currentTarget.style.borderColor = "var(--orca-color-border)";
              e.currentTarget.style.color = "var(--orca-color-text-2)";
              e.currentTarget.style.transform = "translateY(0)";
            },
            title: `快速回复: ${suggestion}`,
          },
          createElement("i", {
            className: "ti ti-message",
            style: { fontSize: "14px" },
          }),
          suggestion
        )
      )
    ),
    // 重新生成按钮
    createElement(
      "button",
      {
        onClick: handleGenerate,
        disabled: isGenerating,
        style: {
          display: "flex",
          alignItems: "center",
          gap: "4px",
          padding: "4px 8px",
          border: "none",
          borderRadius: "12px",
          background: "transparent",
          color: "var(--orca-color-text-3)",
          fontSize: "11px",
          cursor: isGenerating ? "wait" : "pointer",
          alignSelf: "flex-start",
          transition: "all 0.2s ease",
        },
        onMouseEnter: (e: any) => {
          if (!isGenerating) {
            e.currentTarget.style.color = "var(--orca-color-primary)";
          }
        },
        onMouseLeave: (e: any) => {
          e.currentTarget.style.color = "var(--orca-color-text-3)";
        },
        title: "重新生成建议",
      },
      createElement("i", {
        className: isGenerating ? "ti ti-loader" : "ti ti-refresh",
        style: {
          fontSize: "12px",
          animation: isGenerating ? "spin 1s linear infinite" : undefined,
        },
      }),
      "重新生成"
    )
  );
}
