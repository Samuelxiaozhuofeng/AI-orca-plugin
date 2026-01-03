/**
 * TokenProgressBar - Token 使用进度条组件
 * 显示当前 token 占用相对于模型上下文限制的进度
 * 颜色根据阈值变化：
 * - < 80%: primary (蓝色)
 * - >= 80%: warning (黄色)
 * - >= 95%: danger (红色)
 * 
 * Requirements: 5.1, 5.2, 5.3
 */

import { calculateTokenPercentage, getProgressColor } from "../utils/chat-ui-utils";
import { formatTokenCount } from "../utils/token-utils";

const React = window.React as unknown as {
  createElement: typeof window.React.createElement;
  useMemo: <T>(factory: () => T, deps: any[]) => T;
};
const { createElement, useMemo } = React;

export interface TokenProgressBarProps {
  /** 当前 Token 数 */
  currentTokens: number;
  /** 最大 Token 数（模型上下文限制） */
  maxTokens: number;
  /** 是否显示文字标签 */
  showLabel?: boolean;
  /** 自定义样式 */
  style?: React.CSSProperties;
}

// 容器样式
const containerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  width: "100%",
};

// 进度条外层样式
const progressBarOuterStyle: React.CSSProperties = {
  flex: 1,
  height: "4px",
  background: "var(--orca-color-bg-3)",
  borderRadius: "2px",
  overflow: "hidden",
};

// 进度条内层样式（动态）
const getProgressBarInnerStyle = (percentage: number, color: string): React.CSSProperties => ({
  height: "100%",
  width: `${Math.min(100, percentage)}%`,
  background: color,
  borderRadius: "2px",
  transition: "width 0.3s ease, background 0.3s ease",
});

// 标签样式
const labelStyle: React.CSSProperties = {
  fontSize: "11px",
  color: "var(--orca-color-text-3)",
  whiteSpace: "nowrap",
};

/**
 * TokenProgressBar 组件
 * 显示 token 使用进度条，颜色根据阈值变化
 */
export default function TokenProgressBar({
  currentTokens,
  maxTokens,
  showLabel = true,
  style,
}: TokenProgressBarProps) {
  // 计算百分比和颜色
  const { percentage, color } = useMemo(() => {
    const pct = calculateTokenPercentage(currentTokens, maxTokens);
    const clr = getProgressColor(pct);
    return { percentage: pct, color: clr };
  }, [currentTokens, maxTokens]);

  // 如果 maxTokens 为 0 或无效，不显示
  if (maxTokens <= 0) {
    return null;
  }

  return createElement(
    "div",
    { 
      style: { ...containerStyle, ...style },
      title: `${formatTokenCount(currentTokens)} / ${formatTokenCount(maxTokens)} tokens (${percentage.toFixed(1)}%)`,
    },
    // 进度条
    createElement(
      "div",
      { style: progressBarOuterStyle },
      createElement("div", { style: getProgressBarInnerStyle(percentage, color) })
    ),
    // 标签
    showLabel && createElement(
      "span",
      { 
        style: {
          ...labelStyle,
          color: percentage >= 80 ? color : labelStyle.color,
        },
      },
      `${formatTokenCount(currentTokens)}/${formatTokenCount(maxTokens)}`
    )
  );
}
