import {
  ContextRef,
  contextKey,
  getDisplayLabel,
  removeContext,
} from "../store/context-store";
import { estimateTokens, formatTokenCount } from "../utils/token-utils";
import { calculateTotalContextTokens, EnhancedContextChip, truncatePreview } from "../utils/chat-ui-utils";

const React = window.React as unknown as {
  createElement: typeof window.React.createElement;
  useState: typeof window.React.useState;
  useEffect: typeof window.React.useEffect;
  useMemo: typeof window.React.useMemo;
};
const { createElement, useState, useMemo } = React;

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
  const [hoveredChip, setHoveredChip] = useState<string | null>(null);

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
        const isHovered = hoveredChip === key;

        return createElement(
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
            onMouseEnter: () => setHoveredChip(key),
            onMouseLeave: () => setHoveredChip(null),
          },
          // 图标
          createElement("i", {
            className: icon,
            style: { fontSize: 12, opacity: 0.7 },
          }),
          // 标签
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
          // Token 数量
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
          // 删除按钮
          createElement(
            "span",
            {
              onClick: () => handleRemove(ref),
              style: {
                cursor: "pointer",
                opacity: 0.6,
                marginLeft: 2,
                display: "inline-flex",
                alignItems: "center",
              },
              onMouseEnter: (e: any) => (e.currentTarget.style.opacity = "1"),
              onMouseLeave: (e: any) => (e.currentTarget.style.opacity = "0.6"),
            },
            createElement("i", { className: "ti ti-x", style: { fontSize: 12 } })
          ),
          // Hover 预览 Tooltip
          isHovered && chip.preview && createElement(
            "div",
            {
              style: {
                position: "absolute",
                bottom: "calc(100% + 8px)",
                left: "50%",
                transform: "translateX(-50%)",
                padding: "8px 12px",
                borderRadius: 8,
                background: "var(--orca-color-bg-1)",
                border: "1px solid var(--orca-color-border)",
                boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                fontSize: 12,
                lineHeight: 1.5,
                color: "var(--orca-color-text-1)",
                maxWidth: 280,
                minWidth: 150,
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                zIndex: 1000,
                pointerEvents: "none",
              },
            },
            // Tooltip 箭头
            createElement("div", {
              style: {
                position: "absolute",
                bottom: -6,
                left: "50%",
                transform: "translateX(-50%)",
                width: 0,
                height: 0,
                borderLeft: "6px solid transparent",
                borderRight: "6px solid transparent",
                borderTop: "6px solid var(--orca-color-border)",
              },
            }),
            createElement("div", {
              style: {
                position: "absolute",
                bottom: -5,
                left: "50%",
                transform: "translateX(-50%)",
                width: 0,
                height: 0,
                borderLeft: "5px solid transparent",
                borderRight: "5px solid transparent",
                borderTop: "5px solid var(--orca-color-bg-1)",
              },
            }),
            chip.preview
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
