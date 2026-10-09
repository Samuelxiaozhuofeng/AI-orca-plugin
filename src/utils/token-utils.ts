/**
 * Token estimation utilities
 * Token 估算工具，用于预估消息的 Token 数量和费用
 * 
 * v2: 使用新的 tokenizer 模块
 */

import { estimateTokens as tokenizerEstimate } from "./tokenizer";

// 重新导出 tokenizer 功能
export { 
  estimateTokensDetailed,
  setTokenizerConfig,
  getTokenizerConfig,
} from "./tokenizer";

/**
 * 估算文本的 Token 数量
 * 
 * 使用新的 tokenizer 模块，支持：
 * - 多模型特定估算
 * - 安全余量
 * 
 * @param text 要估算的文本
 * @param modelName 可选的模型名称
 */
export function estimateTokens(text: string, modelName?: string): number {
  return tokenizerEstimate(text, modelName);
}

/** 回复输出速度，如 "50 tok/s"；没计时、计时太短（<300ms）或没内容时返回 null */
export function formatTokenSpeed(content: string, reasoning: string | undefined, durationMs: number | undefined): string | null {
  if (!durationMs || durationMs < 300) return null;
  const tokens = estimateTokens(content + (reasoning || ""));
  if (tokens <= 0) return null;
  return `${Math.round(tokens / (durationMs / 1000))} tok/s`;
}

/** 本机 AI 用量，如 "入 12.8k · 出 820 · ≈$0.12"；没有用量返回 null */
export function formatUsage(usage: { input: number; output: number; costUsd?: number } | undefined): string | null {
  if (!usage || typeof usage.input !== "number" || typeof usage.output !== "number") return null;
  const cost = typeof usage.costUsd === "number" ? ` · ${usage.costUsd < 0.01 ? "<$0.01" : `≈$${usage.costUsd.toFixed(2)}`}` : "";
  return `入 ${formatTokenCount(usage.input)} · 出 ${formatTokenCount(usage.output)}${cost}`;
}

/**
 * 格式化 Token 数量显示
 */
export function formatTokenCount(tokens: number): string {
  if (tokens < 1000) return tokens.toString();
  if (tokens < 10000) return `${(tokens / 1000).toFixed(1)}k`;
  return `${Math.round(tokens / 1000)}k`;
}
