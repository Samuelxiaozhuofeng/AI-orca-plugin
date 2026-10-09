/**
 * Token estimation utilities
 * Token 估算工具，用于预估消息的 Token 数量和费用
 * 
 * v2: 使用新的 tokenizer 模块
 */

import type { CurrencyType } from "../settings/ai-chat-settings";
import { CURRENCY_SYMBOLS } from "../settings/ai-chat-settings";
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

/**
 * 格式化 Token 数量显示
 */
export function formatTokenCount(tokens: number): string {
  if (tokens < 1000) return tokens.toString();
  if (tokens < 10000) return `${(tokens / 1000).toFixed(1)}k`;
  return `${Math.round(tokens / 1000)}k`;
}

/**
 * 计算预估费用
 * @param inputTokens 输入 Token 数
 * @param outputTokens 预估输出 Token 数（默认为输入的 1.5 倍）
 * @param inputPrice 输入价格（每百万 Token）
 * @param outputPrice 输出价格（每百万 Token）
 */
export function estimateCost(
  inputTokens: number,
  outputTokens: number,
  inputPrice: number,
  outputPrice: number
): number {
  const inputCost = (inputTokens / 1_000_000) * inputPrice;
  const outputCost = (outputTokens / 1_000_000) * outputPrice;
  return inputCost + outputCost;
}

/**
 * 格式化费用显示
 */
export function formatCost(cost: number, currency: CurrencyType): string {
  const symbol = CURRENCY_SYMBOLS[currency] || "$";
  
  if (cost < 0.0001) return `<${symbol}0.0001`;
  if (cost < 0.01) return `${symbol}${cost.toFixed(4)}`;
  if (cost < 1) return `${symbol}${cost.toFixed(3)}`;
  return `${symbol}${cost.toFixed(2)}`;
}
