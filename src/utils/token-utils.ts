/**
 * Token estimation utilities
 * 简单的 Token 估算工具，用于预估消息的 Token 数量和费用
 */

import type { CurrencyType } from "../settings/ai-chat-settings";
import { CURRENCY_SYMBOLS } from "../settings/ai-chat-settings";

/**
 * 估算文本的 Token 数量
 * 使用简单的启发式方法：
 * - 英文：约 4 字符 = 1 token
 * - 中文：约 1.5 字符 = 1 token
 */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  
  // 分离中文和非中文字符
  const chineseChars = text.match(/[\u4e00-\u9fff]/g) || [];
  const otherChars = text.replace(/[\u4e00-\u9fff]/g, "");
  
  // 中文字符：约 1.5 字符 = 1 token
  const chineseTokens = Math.ceil(chineseChars.length / 1.5);
  // 其他字符：约 4 字符 = 1 token
  const otherTokens = Math.ceil(otherChars.length / 4);
  
  return chineseTokens + otherTokens;
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
