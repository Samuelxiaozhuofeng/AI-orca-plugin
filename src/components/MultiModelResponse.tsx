/**
 * MultiModelResponse - 多模型并行响应展示组件
 * 
 * 显示多个模型对同一问题的并行回答，支持：
 * - 并排/堆叠布局切换
 * - 独立的流式输出状态
 * - 模型标签和状态指示
 */

import MarkdownMessage from "./MarkdownMessage";
import TypingIndicator from "./TypingIndicator";

const React = window.React as unknown as {
  createElement: typeof window.React.createElement;
  useState: <T>(initial: T | (() => T)) => [T, (next: T | ((prev: T) => T)) => void];
  useCallback: <T extends (...args: any[]) => any>(fn: T, deps: any[]) => T;
  useMemo: <T>(factory: () => T, deps: any[]) => T;
  useEffect: (effect: () => void | (() => void), deps?: any[]) => void;
};
const { createElement, useState, useCallback, useMemo, useEffect } = React;

/** 单个模型的响应状态 */
export interface ModelResponse {
  modelId: string;
  modelLabel: string;
  providerId: string;
  providerName: string;
  content: string;
  reasoning?: string;
  isStreaming: boolean;
  error?: string;
  startTime?: number;
  endTime?: number;
}

interface MultiModelResponseProps {
  /** 各模型的响应数据 */
  responses: ModelResponse[];
  /** 布局模式 */
  layout?: "side-by-side" | "stacked";
  /** 复制回调 */
  onCopy?: (modelId: string, content: string) => void;
  /** 采用某个模型的回答 */
  onAdopt?: (modelId: string, content: string) => void;
}

/** 单个模型响应卡片 */
function ModelResponseCard({
  response,
  onCopy,
  onAdopt,
}: {
  response: ModelResponse;
  onCopy?: (content: string) => void;
  onAdopt?: (content: string) => void;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const [reasoningExpanded, setReasoningExpanded] = useState(false);

  const duration = useMemo(() => {
    if (!response.startTime) return null;
    const end = response.endTime || Date.now();
    return ((end - response.startTime) / 1000).toFixed(1);
  }, [response.startTime, response.endTime, response.isStreaming]);

  const handleCopy = useCallback(() => {
    if (response.content && onCopy) {
      onCopy(response.content);
    }
  }, [response.content, onCopy]);

  const handleAdopt = useCallback(() => {
    if (response.content && onAdopt) {
      onAdopt(response.content);
    }
  }, [response.content, onAdopt]);

  return createElement(
    "div",
    {
      style: {
        flex: 1,
        minWidth: "280px",
        maxWidth: "100%",
        border: "1px solid var(--orca-color-border)",
        borderRadius: "12px",
        background: "var(--orca-color-bg-1)",
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
      },
      onMouseEnter: () => setIsHovered(true),
      onMouseLeave: () => setIsHovered(false),
    },
    // Header
    createElement(
      "div",
      {
        style: {
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "10px 14px",
          borderBottom: "1px solid var(--orca-color-border)",
          background: "var(--orca-color-bg-2)",
        },
      },
      // Model info
      createElement(
        "div",
        {
          style: {
            display: "flex",
            alignItems: "center",
            gap: "8px",
          },
        },
        // Status indicator
        createElement("div", {
          style: {
            width: "8px",
            height: "8px",
            borderRadius: "50%",
            background: response.error
              ? "var(--orca-color-error)"
              : response.isStreaming
              ? "var(--orca-color-warning)"
              : "var(--orca-color-success)",
            animation: response.isStreaming ? "pulse 1.5s ease-in-out infinite" : undefined,
          },
        }),
        // Model name
        createElement(
          "span",
          {
            style: {
              fontSize: "13px",
              fontWeight: 600,
              color: "var(--orca-color-text-1)",
            },
          },
          response.modelLabel
        ),
        // Provider badge
        createElement(
          "span",
          {
            style: {
              fontSize: "11px",
              color: "var(--orca-color-text-3)",
              background: "var(--orca-color-bg-3)",
              padding: "2px 6px",
              borderRadius: "4px",
            },
          },
          response.providerName
        )
      ),
      // Duration & Actions
      createElement(
        "div",
        {
          style: {
            display: "flex",
            alignItems: "center",
            gap: "8px",
          },
        },
        // Duration
        duration &&
          createElement(
            "span",
            {
              style: {
                fontSize: "11px",
                color: "var(--orca-color-text-3)",
              },
            },
            `${duration}s`
          ),
        // Action buttons (visible on hover)
        createElement(
          "div",
          {
            style: {
              display: "flex",
              gap: "4px",
              opacity: isHovered && !response.isStreaming ? 1 : 0,
              transition: "opacity 0.2s",
            },
          },
          // Copy button
          onCopy &&
            createElement(
              "button",
              {
                onClick: handleCopy,
                style: {
                  padding: "4px 8px",
                  border: "none",
                  borderRadius: "4px",
                  background: "var(--orca-color-bg-3)",
                  color: "var(--orca-color-text-2)",
                  cursor: "pointer",
                  fontSize: "12px",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                },
                title: "复制内容",
              },
              createElement("i", { className: "ti ti-copy", style: { fontSize: "14px" } })
            ),
          // Adopt button
          onAdopt &&
            createElement(
              "button",
              {
                onClick: handleAdopt,
                style: {
                  padding: "4px 8px",
                  border: "none",
                  borderRadius: "4px",
                  background: "var(--orca-color-primary)",
                  color: "white",
                  cursor: "pointer",
                  fontSize: "12px",
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                },
                title: "采用此回答",
              },
              createElement("i", { className: "ti ti-check", style: { fontSize: "14px" } }),
              "采用"
            )
        )
      )
    ),
    // Content
    createElement(
      "div",
      {
        style: {
          flex: 1,
          padding: "14px",
          overflowY: "auto",
          maxHeight: "400px",
        },
      },
      // Reasoning (if any)
      response.reasoning &&
        createElement(
          "div",
          {
            style: {
              marginBottom: "12px",
              padding: "10px",
              borderRadius: "8px",
              background: "var(--orca-color-bg-2)",
              border: "1px solid var(--orca-color-border)",
            },
          },
          createElement(
            "div",
            {
              onClick: () => setReasoningExpanded(!reasoningExpanded),
              style: {
                display: "flex",
                alignItems: "center",
                gap: "6px",
                cursor: "pointer",
                fontSize: "12px",
                color: "var(--orca-color-text-2)",
              },
            },
            createElement("i", {
              className: response.isStreaming ? "ti ti-loader" : "ti ti-brain",
              style: {
                fontSize: "14px",
                color: "var(--orca-color-primary)",
                animation: response.isStreaming ? "spin 1s linear infinite" : undefined,
              },
            }),
            response.isStreaming ? "思考中..." : "推理过程",
            createElement("i", {
              className: reasoningExpanded ? "ti ti-chevron-up" : "ti ti-chevron-down",
              style: { fontSize: "12px", marginLeft: "auto" },
            })
          ),
          reasoningExpanded &&
            createElement(
              "div",
              {
                style: {
                  marginTop: "8px",
                  fontSize: "13px",
                  color: "var(--orca-color-text-2)",
                  lineHeight: 1.6,
                },
              },
              createElement(MarkdownMessage, { content: response.reasoning, role: "assistant" })
            )
        ),
      // Error message
      response.error
        ? createElement(
            "div",
            {
              style: {
                color: "var(--orca-color-error)",
                fontSize: "13px",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              },
            },
            createElement("i", { className: "ti ti-alert-circle", style: { fontSize: "16px" } }),
            response.error
          )
        : // Content or loading
        response.content
        ? createElement(
            "div",
            null,
            createElement(MarkdownMessage, { content: response.content, role: "assistant" }),
            response.isStreaming &&
              createElement("span", {
                style: {
                  display: "inline-block",
                  width: "2px",
                  height: "16px",
                  background: "var(--orca-color-primary)",
                  marginLeft: "2px",
                  animation: "blink 1s step-end infinite",
                },
              })
          )
        : response.isStreaming
        ? createElement(
            "div",
            {
              style: {
                display: "flex",
                alignItems: "center",
                gap: "8px",
                color: "var(--orca-color-text-3)",
                fontSize: "13px",
              },
            },
            createElement(TypingIndicator, null),
            "正在生成..."
          )
        : null
    )
  );
}

export default function MultiModelResponse({
  responses,
  layout = "side-by-side",
  onCopy,
  onAdopt,
}: MultiModelResponseProps) {
  const containerStyle: React.CSSProperties =
    layout === "side-by-side"
      ? {
          display: "flex",
          gap: "12px",
          flexWrap: "wrap",
        }
      : {
          display: "flex",
          flexDirection: "column",
          gap: "12px",
        };

  return createElement(
    "div",
    { style: containerStyle },
    ...responses.map((response) =>
      createElement(ModelResponseCard, {
        key: response.modelId,
        response,
        onCopy: onCopy ? (content: string) => onCopy(response.modelId, content) : undefined,
        onAdopt: onAdopt ? (content: string) => onAdopt(response.modelId, content) : undefined,
      })
    )
  );
}
