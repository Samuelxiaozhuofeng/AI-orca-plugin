import {
  ContextRef,
  contextKey,
  getDisplayLabel,
  removeContext,
} from "../store/context-store";
import { estimateTokens, formatTokenCount } from "../utils/token-utils";
import { calculateTotalContextTokens, EnhancedContextChip, truncatePreview } from "../utils/chat-ui-utils";
import { tooltipText, withTooltip } from "../utils/orca-tooltip";

const React = window.React as unknown as {
  createElement: typeof window.React.createElement;
  useMemo: typeof window.React.useMemo;
};
const { createElement, useMemo } = React;

type Props = {
  items: ContextRef[];
  onRemove?: (ref: ContextRef) => void;
  /** 上下文内容映射，用于计算 token 和预览 */
  contextContents?: Map<string, string>;
  /** 是否显示 token 数 */
  showTokens?: boolean;
};

/**
 * Context Chips - 显示已选中的 context 列表（chips 形式）
 * 增强版：显示每个芯片的 token 数和总 token 数
 */
export default function ContextChips({ 
  items, 
  onRemove, 
  contextContents,
  showTokens = true 
}: Props) {
  // 计算每个芯片的 token 数
  const enhancedChips: EnhancedContextChip[] = useMemo(() => {
    return items.map((ref) => {
      const key = contextKey(ref);
      const content = contextContents?.get(key) || "";
      const tokenCount = estimateTokens(content);
      const preview = truncatePreview(content, 150);
      
      return {
        id: key,
        title: getDisplayLabel(ref),
        kind: ref.kind,
        tokenCount,
        preview,
      };
    });
  }, [items, contextContents]);

  // 计算总 token 数
  const totalTokens = useMemo(() => {
    return calculateTotalContextTokens(enhancedChips);
  }, [enhancedChips]);

  if (items.length === 0) return null;

  const handleRemove = (ref: ContextRef) => {
    removeContext(contextKey(ref));
    onRemove?.(ref);
  };

  return createElement(
    "div",
    {
      style: {
        display: "flex",
        flexDirection: "column",
        gap: 6,
        padding: "8px 0",
      },
    },
    // 芯片列表
    createElement(
      "div",
      {
        style: {
          display: "flex",
          flexWrap: "wrap",
          gap: 6,
          alignItems: "center",
        },
      },
      ...items.map((ref, index) => {
        const key = contextKey(ref);
        const label = getDisplayLabel(ref);
        const icon = ref.kind === "page" ? "ti ti-file-text" : "ti ti-tag";
        const chip = enhancedChips[index];

        return withTooltip(
          chip.preview ? tooltipText(chip.preview) : null,
          createElement(
            "div",
            {
              key,
              style: {
                position: "relative",
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                padding: "2px 8px",
                borderRadius: 12,
                background: "var(--orca-color-bg-2)",
                border: "1px solid var(--orca-color-border)",
                fontSize: 12,
                maxWidth: 220,
                cursor: "default",
                transition: "all 0.15s ease",
              },
            },
            createElement("i", {
              className: icon,
              style: { fontSize: 12, opacity: 0.7 },
            }),
            createElement(
              "span",
              {
                style: {
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  flex: 1,
                },
              },
              label
            ),
            showTokens && chip.tokenCount > 0 && createElement(
              "span",
              {
                style: {
                  fontSize: 10,
                  color: "var(--orca-color-text-3)",
                  marginLeft: 2,
                  padding: "1px 4px",
                  borderRadius: 4,
                  background: "var(--orca-color-bg-3)",
                },
              },
              formatTokenCount(chip.tokenCount)
            ),
            createElement(
              "span",
              {
                onClick: () => handleRemove(ref),
                style: {
                  cursor: "pointer",
                  marginLeft: 2,
                  display: "inline-flex",
                  alignItems: "center",
                },
                className: "context-chip-remove",
              },
              createElement("i", { className: "ti ti-x", style: { fontSize: 12 } })
            )
          )
        );
      })
    ),
    // 总 Token 数显示
    showTokens && totalTokens > 0 && createElement(
      "div",
      {
        style: {
          display: "flex",
          alignItems: "center",
          gap: 4,
          fontSize: 11,
          color: "var(--orca-color-text-3)",
          paddingLeft: 4,
        },
      },
      createElement("i", {
        className: "ti ti-sum",
        style: { fontSize: 12 },
      }),
      `上下文共 ${formatTokenCount(totalTokens)} tokens`
    )
  );
}
