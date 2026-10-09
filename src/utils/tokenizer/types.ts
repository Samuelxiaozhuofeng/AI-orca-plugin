/**
 * Tokenizer Types
 */

/** Tokenizer 类型 */
export type TokenizerType = 
  | "cl100k"      // GPT-4, GPT-3.5-turbo
  | "o200k"       // GPT-4o, o1
  | "claude"      // Claude 系列
  | "gemini"      // Gemini 系列
  | "deepseek"    // DeepSeek 系列
  | "heuristic";  // 启发式回退

/** Tokenizer 配置 */
export type TokenizerConfig = {
  /** 默认模型名称 */
  modelName: string;
  /** 安全余量（0.05 = 5%） */
  safetyMargin: number;
};

/** Token 估算结果 */
export type TokenEstimateResult = {
  /** 最终 token 数（含安全余量） */
  tokens: number;
  /** 原始估算值 */
  rawTokens: number;
  /** 使用的 tokenizer 类型 */
  tokenizerType: TokenizerType;
  /** 模型家族 */
  modelFamily: "gpt" | "claude" | "gemini" | "deepseek" | "other";
  /** 估算置信度 (0-1) */
  confidence: number;
};
