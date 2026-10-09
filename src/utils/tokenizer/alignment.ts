/**
 * Token Alignment - 改进的 Token 对齐填充
 * 
 * 设计原则：
 * - 使用短、无歧义的填充，避免重复字符导致 tokenization 偏差
 * - 填充内容应被模型忽略（不影响语义理解）
 * - 支持多种填充策略，适配不同模型
 */

import type { TokenAlignmentConfig, PaddingStrategy } from "./types";
import { estimateTokens } from "./index";

// ═══════════════════════════════════════════════════════════════════════════
// 填充策略实现
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 生成填充内容
 * 
 * 策略说明：
 * - comment: 使用 HTML 注释，内容为随机 ID 避免重复
 * - whitespace: 使用换行符，最简单但可能影响格式
 * - marker: 使用特殊标记，如 [PAD]
 * - none: 不填充
 */
function generatePadding(
  targetTokens: number,
  strategy: PaddingStrategy,
  marker?: string,
): string {
  if (targetTokens <= 0 || strategy === "none") {
    return "";
  }
  
  switch (strategy) {
    case "comment": {
      // 使用随机 ID 避免重复字符导致的 tokenization 偏差
      // 格式: <!-- pad:XXXX --> 约 4-5 tokens
      const baseTokens = 4;
      const iterations = Math.ceil(targetTokens / baseTokens);
      const parts: string[] = [];
      
      for (let i = 0; i < iterations; i++) {
        // 使用短随机 ID，避免长重复字符串
        const id = Math.random().toString(36).slice(2, 6);
        parts.push(`<!-- p${id} -->`);
      }
      
      return parts.join("");
    }
    
    case "whitespace": {
      // 换行符通常是 1 token
      return "\n".repeat(targetTokens);
    }
    
    case "marker": {
      // 使用自定义标记
      const m = marker || "[PAD]";
      const markerTokens = estimateTokens(m);
      const iterations = Math.ceil(targetTokens / Math.max(1, markerTokens));
      return m.repeat(iterations);
    }
    
    default:
      return "";
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// 主要导出
// ═══════════════════════════════════════════════════════════════════════════

/** 默认对齐配置 */
export const DEFAULT_ALIGNMENT_CONFIG: TokenAlignmentConfig = {
  enabled: true,
  alignUnit: 64,
  paddingStrategy: "comment",
};

/**
 * 将文本对齐到 token 边界
 * 
 * @param text 原始文本
 * @param config 对齐配置
 * @param modelName 模型名称（用于准确估算）
 * @returns 对齐后的文本
 */
export function alignToTokenBoundary(
  text: string,
  config: Partial<TokenAlignmentConfig> = {},
  modelName?: string,
): string {
  const cfg: TokenAlignmentConfig = { ...DEFAULT_ALIGNMENT_CONFIG, ...config };
  
  if (!cfg.enabled || cfg.alignUnit <= 1) {
    return text;
  }
  
  const currentTokens = estimateTokens(text, modelName);
  const remainder = currentTokens % cfg.alignUnit;
  
  if (remainder === 0) {
    return text;
  }
  
  const paddingTokens = cfg.alignUnit - remainder;
  const padding = generatePadding(paddingTokens, cfg.paddingStrategy, cfg.paddingMarker);
  
  // 确保文本以换行结尾
  const normalizedText = text.trimEnd();
  
  return `${normalizedText}\n${padding}\n`;
}

/**
 * 检查文本是否已对齐
 */
export function isAligned(
  text: string,
  alignUnit: number,
  modelName?: string,
): boolean {
  const tokens = estimateTokens(text, modelName);
  return tokens % alignUnit === 0;
}

/**
 * 移除填充内容（用于调试/显示）
 */
export function removePadding(text: string): string {
  // 移除 HTML 注释填充
  let cleaned = text.replace(/<!-- p[a-z0-9]+ -->/g, "");
  // 移除 [PAD] 标记
  cleaned = cleaned.replace(/\[PAD\]/g, "");
  // 清理多余空行
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");
  return cleaned.trim();
}

// ═══════════════════════════════════════════════════════════════════════════
// 模型特定配置
// ═══════════════════════════════════════════════════════════════════════════

/** 模型特定的对齐配置 */
export const MODEL_ALIGNMENT_CONFIGS: Record<string, Partial<TokenAlignmentConfig>> = {
  // DeepSeek: 启用 64 token 对齐，最大化 KV Cache 命中
  deepseek: {
    enabled: true,
    alignUnit: 64,
    paddingStrategy: "comment",
  },
  
  // GPT 系列: 可选对齐，使用较小单位
  gpt: {
    enabled: false,
    alignUnit: 32,
    paddingStrategy: "comment",
  },
  
  // Claude: 不需要对齐
  claude: {
    enabled: false,
    alignUnit: 1,
    paddingStrategy: "none",
  },
  
  // Gemini: 不需要对齐
  gemini: {
    enabled: false,
    alignUnit: 1,
    paddingStrategy: "none",
  },
};

/**
 * 获取模型特定的对齐配置
 */
export function getModelAlignmentConfig(modelName: string): TokenAlignmentConfig {
  const normalized = modelName.toLowerCase();
  
  for (const [key, config] of Object.entries(MODEL_ALIGNMENT_CONFIGS)) {
    if (normalized.includes(key)) {
      return { ...DEFAULT_ALIGNMENT_CONFIG, ...config };
    }
  }
  
  return DEFAULT_ALIGNMENT_CONFIG;
}
