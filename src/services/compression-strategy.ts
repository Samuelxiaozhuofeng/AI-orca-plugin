/**
 * Compression Strategy - 动态压缩策略组
 * 
 * 根据模型特性自动选择最优的压缩配置：
 * - CACHE_FIRST: 针对 DeepSeek 等支持 KV Cache 的模型，最大化缓存命中
 * - REASONING_FIRST: 针对 Gemini/Claude 等推理模型，保留更多上下文细节
 * - GENERAL: 通用模式，平衡压缩率和信息保留
 * 
 * 策略自动检测：基于模型名称模式匹配 + 运行时性能反馈
 */

// ═══════════════════════════════════════════════════════════════════════════
// 类型定义
// ═══════════════════════════════════════════════════════════════════════════

/** 压缩策略类型 */
export type CompressionStrategyType = "CACHE_FIRST" | "REASONING_FIRST" | "GENERAL";

/** 压缩策略配置 */
export type CompressionStrategyConfig = {
  // 基础配置
  compressionThreshold: number;      // 触发压缩的 Token 阈值
  hardLimitThreshold: number;        // 硬截断阈值
  recentTokenLimit: number;          // 最近对话保留的 Token 上限
  
  // 摘要配置
  summaryMaxTokens: number;          // 摘要输出的最大 Token
  summaryMaxTokensCompact: number;   // 高密度摘要的最大 Token
  summaryVerbosity: "minimal" | "medium" | "detailed";  // 摘要冗余度
  
  // Token 对齐
  enableTokenAlignment: boolean;     // 是否启用 Token 对齐
  tokenAlignUnit: number;            // Token 对齐单位
  
  // 里程碑配置
  milestoneThreshold: number;        // 触发里程碑合并的层数
  milestoneDistillThreshold: number; // 触发里程碑再蒸馏的数量
  
  // 实体映射位置
  entityMapPosition: "after_system" | "before_dynamic" | "inline";
  
  // 中层配置
  middleLayerTokenLimit: number;     // 中层 Token 上限
  layerTokenTarget: number;          // 每层摘要的目标 Token 数
};

/** 策略运行时状态 */
export type StrategyRuntimeState = {
  detectedStrategy: CompressionStrategyType;
  confidence: number;                // 检测置信度 (0-1)
  cacheHitRate: number;              // 缓存命中率
  lastAdjustmentAt: number;          // 上次调整时间
  adjustmentCount: number;           // 调整次数
  performanceScore: number;          // 性能评分 (0-100)
};

// ═══════════════════════════════════════════════════════════════════════════
// 策略配置定义
// ═══════════════════════════════════════════════════════════════════════════

/**
 * CACHE_FIRST 策略 - 针对 DeepSeek 等支持 KV Cache 的模型
 * 
 * 特点：
 * - 较低的压缩阈值，更早触发压缩
 * - 启用 Token 对齐（64单位），最大化缓存命中
 * - 极简摘要，追求稳定性
 * - 实体映射放在 System Prompt 之后，保证前缀稳定
 */
const CACHE_FIRST_CONFIG: CompressionStrategyConfig = {
  compressionThreshold: 4000,
  hardLimitThreshold: 5800,
  recentTokenLimit: 2500,
  
  summaryMaxTokens: 400,
  summaryMaxTokensCompact: 250,
  summaryVerbosity: "minimal",
  
  enableTokenAlignment: true,
  tokenAlignUnit: 64,
  
  milestoneThreshold: 10,
  milestoneDistillThreshold: 3,
  
  entityMapPosition: "after_system",
  
  middleLayerTokenLimit: 1500,
  layerTokenTarget: 1500,
};

/**
 * REASONING_FIRST 策略 - 针对 Gemini 2.5/3 Pro、Claude 等推理模型
 * 
 * 特点：
 * - 较高的压缩阈值，保留更多原始上下文
 * - 禁用 Token 对齐（这些模型不依赖 KV Cache）
 * - 中等冗余度摘要，保留更多推理细节
 * - 实体映射放在 Dynamic Context 之前，便于推理参考
 */
const REASONING_FIRST_CONFIG: CompressionStrategyConfig = {
  compressionThreshold: 12000,       // 更高阈值
  hardLimitThreshold: 18000,         // 更高硬限制
  recentTokenLimit: 4000,            // 保留更多最近对话
  
  summaryMaxTokens: 600,             // 更详细的摘要
  summaryMaxTokensCompact: 400,
  summaryVerbosity: "medium",
  
  enableTokenAlignment: false,       // 禁用对齐
  tokenAlignUnit: 1,                 // 无对齐
  
  milestoneThreshold: 20,            // 更多层才合并
  milestoneDistillThreshold: 4,
  
  entityMapPosition: "before_dynamic",
  
  middleLayerTokenLimit: 3000,       // 更大的中层容量
  layerTokenTarget: 2000,
};

/**
 * GENERAL 策略 - 通用模式
 * 
 * 特点：
 * - 平衡的压缩阈值
 * - 禁用 Token 对齐
 * - 中等冗余度
 * - 实体映射放在 System Prompt 之后
 */
const GENERAL_CONFIG: CompressionStrategyConfig = {
  compressionThreshold: 6000,
  hardLimitThreshold: 9000,
  recentTokenLimit: 3000,
  
  summaryMaxTokens: 500,
  summaryMaxTokensCompact: 300,
  summaryVerbosity: "medium",
  
  enableTokenAlignment: false,
  tokenAlignUnit: 1,
  
  milestoneThreshold: 12,
  milestoneDistillThreshold: 3,
  
  entityMapPosition: "after_system",
  
  middleLayerTokenLimit: 2000,
  layerTokenTarget: 1800,
};

/** 策略配置映射 */
const STRATEGY_CONFIGS: Record<CompressionStrategyType, CompressionStrategyConfig> = {
  CACHE_FIRST: CACHE_FIRST_CONFIG,
  REASONING_FIRST: REASONING_FIRST_CONFIG,
  GENERAL: GENERAL_CONFIG,
};

// ═══════════════════════════════════════════════════════════════════════════
// 模型检测规则
// ═══════════════════════════════════════════════════════════════════════════

/** 模型匹配规则 */
type ModelMatchRule = {
  pattern: RegExp;
  strategy: CompressionStrategyType;
  confidence: number;  // 匹配置信度
};

/**
 * 模型检测规则（按优先级排序）
 * 
 * 规则设计原则：
 * 1. 精确匹配优先于模糊匹配
 * 2. 新模型优先于旧模型
 * 3. 特定变体优先于通用名称
 */
const MODEL_MATCH_RULES: ModelMatchRule[] = [
  // === CACHE_FIRST: DeepSeek 系列 ===
  { pattern: /deepseek[-_]?chat/i, strategy: "CACHE_FIRST", confidence: 0.95 },
  { pattern: /deepseek[-_]?coder/i, strategy: "CACHE_FIRST", confidence: 0.95 },
  { pattern: /deepseek[-_]?v[23]/i, strategy: "CACHE_FIRST", confidence: 0.90 },
  { pattern: /deepseek/i, strategy: "CACHE_FIRST", confidence: 0.85 },
  
  // === REASONING_FIRST: Gemini 推理系列 ===
  { pattern: /gemini[-_]?2\.5[-_]?pro/i, strategy: "REASONING_FIRST", confidence: 0.95 },
  { pattern: /gemini[-_]?3[-_]?pro/i, strategy: "REASONING_FIRST", confidence: 0.95 },
  { pattern: /gemini[-_]?2[-_]?flash[-_]?thinking/i, strategy: "REASONING_FIRST", confidence: 0.90 },
  { pattern: /gemini[-_]?exp/i, strategy: "REASONING_FIRST", confidence: 0.85 },
  { pattern: /gemini[-_]?ultra/i, strategy: "REASONING_FIRST", confidence: 0.85 },
  
  // === REASONING_FIRST: Claude 推理系列 ===
  { pattern: /claude[-_]?3[-_]?5[-_]?sonnet/i, strategy: "REASONING_FIRST", confidence: 0.90 },
  { pattern: /claude[-_]?3[-_]?opus/i, strategy: "REASONING_FIRST", confidence: 0.90 },
  { pattern: /claude[-_]?3/i, strategy: "REASONING_FIRST", confidence: 0.80 },
  
  // === REASONING_FIRST: OpenAI o1 系列 ===
  { pattern: /^o1[-_]?preview/i, strategy: "REASONING_FIRST", confidence: 0.95 },
  { pattern: /^o1[-_]?mini/i, strategy: "REASONING_FIRST", confidence: 0.90 },
  { pattern: /^o1$/i, strategy: "REASONING_FIRST", confidence: 0.95 },
  { pattern: /^o3/i, strategy: "REASONING_FIRST", confidence: 0.95 },
  
  // === GENERAL: GPT 系列 ===
  { pattern: /gpt[-_]?4[-_]?turbo/i, strategy: "GENERAL", confidence: 0.85 },
  { pattern: /gpt[-_]?4o/i, strategy: "GENERAL", confidence: 0.85 },
  { pattern: /gpt[-_]?4/i, strategy: "GENERAL", confidence: 0.80 },
  { pattern: /gpt[-_]?3\.5/i, strategy: "GENERAL", confidence: 0.80 },
  
  // === GENERAL: Gemini 通用系列 ===
  { pattern: /gemini[-_]?pro/i, strategy: "GENERAL", confidence: 0.75 },
  { pattern: /gemini[-_]?flash/i, strategy: "GENERAL", confidence: 0.75 },
  { pattern: /gemini/i, strategy: "GENERAL", confidence: 0.70 },
  
  // === GENERAL: 其他模型 ===
  { pattern: /llama/i, strategy: "GENERAL", confidence: 0.70 },
  { pattern: /mistral/i, strategy: "GENERAL", confidence: 0.70 },
  { pattern: /qwen/i, strategy: "GENERAL", confidence: 0.75 },
  { pattern: /yi[-_]?/i, strategy: "GENERAL", confidence: 0.70 },
];

// ═══════════════════════════════════════════════════════════════════════════
// 策略检测与管理
// ═══════════════════════════════════════════════════════════════════════════

/** 会话策略状态缓存 */
const sessionStrategyState = new Map<string, StrategyRuntimeState>();

/**
 * 根据模型名称检测最佳策略
 */
export function detectStrategy(modelName: string): { 
  strategy: CompressionStrategyType; 
  confidence: number;
  matchedRule?: string;
} {
  if (!modelName) {
    return { strategy: "GENERAL", confidence: 0.5 };
  }
  
  const normalizedName = modelName.toLowerCase().trim();
  
  for (const rule of MODEL_MATCH_RULES) {
    if (rule.pattern.test(normalizedName)) {
      return {
        strategy: rule.strategy,
        confidence: rule.confidence,
        matchedRule: rule.pattern.source,
      };
    }
  }
  
  // 默认使用 GENERAL 策略
  return { strategy: "GENERAL", confidence: 0.5 };
}

/**
 * 获取策略配置
 */
export function getStrategyConfig(strategy: CompressionStrategyType): CompressionStrategyConfig {
  return { ...STRATEGY_CONFIGS[strategy] };
}

/**
 * 获取或创建会话的策略状态
 */
export function getOrCreateStrategyState(
  sessionId: string,
  modelName: string,
): StrategyRuntimeState {
  let state = sessionStrategyState.get(sessionId);
  
  if (!state) {
    const detection = detectStrategy(modelName);
    state = {
      detectedStrategy: detection.strategy,
      confidence: detection.confidence,
      cacheHitRate: 1.0,
      lastAdjustmentAt: Date.now(),
      adjustmentCount: 0,
      performanceScore: 80,
    };
    sessionStrategyState.set(sessionId, state);
    
    console.log(`[compression-strategy] Session ${sessionId} initialized with ${detection.strategy} strategy (confidence: ${(detection.confidence * 100).toFixed(0)}%, model: ${modelName})`);
  }
  
  return state;
}

/**
 * 更新策略状态（基于运行时反馈）
 */
export function updateStrategyState(
  sessionId: string,
  feedback: {
    cacheHitRate?: number;
    compressionLatency?: number;
    tokenSavings?: number;
  },
): void {
  const state = sessionStrategyState.get(sessionId);
  if (!state) return;
  
  // 更新缓存命中率
  if (feedback.cacheHitRate !== undefined) {
    // 指数移动平均
    state.cacheHitRate = state.cacheHitRate * 0.7 + feedback.cacheHitRate * 0.3;
  }
  
  // 计算性能评分
  let score = 80;
  
  // 缓存命中率权重
  if (state.detectedStrategy === "CACHE_FIRST") {
    // CACHE_FIRST 策略更看重缓存命中率
    score = state.cacheHitRate * 100;
  } else {
    // 其他策略缓存命中率权重较低
    score = 60 + state.cacheHitRate * 40;
  }
  
  // Token 节省权重
  if (feedback.tokenSavings !== undefined) {
    const savingsBonus = Math.min(20, feedback.tokenSavings / 1000);
    score += savingsBonus;
  }
  
  state.performanceScore = Math.min(100, Math.max(0, score));
  state.lastAdjustmentAt = Date.now();
}

/**
 * 自动调整策略（基于性能反馈）
 * 
 * 调整规则：
 * 1. CACHE_FIRST 缓存命中率持续低于 60%，降级到 GENERAL
 * 2. GENERAL 缓存命中率持续高于 85%，升级到 CACHE_FIRST
 * 3. 推理模型不自动调整（保持 REASONING_FIRST）
 */
export function autoAdjustStrategy(sessionId: string): boolean {
  const state = sessionStrategyState.get(sessionId);
  if (!state) return false;
  
  // 推理模型不自动调整
  if (state.detectedStrategy === "REASONING_FIRST") {
    return false;
  }
  
  const now = Date.now();
  const timeSinceLastAdjust = now - state.lastAdjustmentAt;
  
  // 至少间隔 5 分钟才能调整
  if (timeSinceLastAdjust < 5 * 60 * 1000) {
    return false;
  }
  
  let adjusted = false;
  
  // CACHE_FIRST 降级检测
  if (state.detectedStrategy === "CACHE_FIRST" && state.cacheHitRate < 0.6) {
    console.log(`[compression-strategy] Session ${sessionId}: CACHE_FIRST -> GENERAL (low cache hit rate: ${(state.cacheHitRate * 100).toFixed(1)}%)`);
    state.detectedStrategy = "GENERAL";
    state.adjustmentCount++;
    adjusted = true;
  }
  
  // GENERAL 升级检测
  if (state.detectedStrategy === "GENERAL" && state.cacheHitRate > 0.85) {
    console.log(`[compression-strategy] Session ${sessionId}: GENERAL -> CACHE_FIRST (high cache hit rate: ${(state.cacheHitRate * 100).toFixed(1)}%)`);
    state.detectedStrategy = "CACHE_FIRST";
    state.adjustmentCount++;
    adjusted = true;
  }
  
  if (adjusted) {
    state.lastAdjustmentAt = now;
    state.confidence = 0.7; // 自动调整后降低置信度
  }
  
  return adjusted;
}

/**
 * 获取会话当前的有效配置
 */
export function getEffectiveConfig(
  sessionId: string,
  modelName: string,
): CompressionStrategyConfig & { strategy: CompressionStrategyType; confidence: number } {
  const state = getOrCreateStrategyState(sessionId, modelName);
  const config = getStrategyConfig(state.detectedStrategy);
  
  return {
    ...config,
    strategy: state.detectedStrategy,
    confidence: state.confidence,
  };
}

/**
 * 手动设置会话策略（覆盖自动检测）
 */
export function setSessionStrategy(
  sessionId: string,
  strategy: CompressionStrategyType,
): void {
  let state = sessionStrategyState.get(sessionId);
  
  if (!state) {
    state = {
      detectedStrategy: strategy,
      confidence: 1.0,
      cacheHitRate: 1.0,
      lastAdjustmentAt: Date.now(),
      adjustmentCount: 0,
      performanceScore: 80,
    };
    sessionStrategyState.set(sessionId, state);
  } else {
    state.detectedStrategy = strategy;
    state.confidence = 1.0; // 手动设置置信度为 100%
    state.lastAdjustmentAt = Date.now();
  }
  
  console.log(`[compression-strategy] Session ${sessionId} manually set to ${strategy}`);
}

/**
 * 清除会话策略状态
 */
export function clearStrategyState(sessionId: string): void {
  sessionStrategyState.delete(sessionId);
}

/**
 * 获取所有策略的配置摘要（用于调试/UI展示）
 */
export function getAllStrategySummary(): Record<CompressionStrategyType, {
  compressionThreshold: number;
  enableTokenAlignment: boolean;
  summaryVerbosity: string;
  milestoneThreshold: number;
  entityMapPosition: string;
}> {
  return {
    CACHE_FIRST: {
      compressionThreshold: CACHE_FIRST_CONFIG.compressionThreshold,
      enableTokenAlignment: CACHE_FIRST_CONFIG.enableTokenAlignment,
      summaryVerbosity: CACHE_FIRST_CONFIG.summaryVerbosity,
      milestoneThreshold: CACHE_FIRST_CONFIG.milestoneThreshold,
      entityMapPosition: CACHE_FIRST_CONFIG.entityMapPosition,
    },
    REASONING_FIRST: {
      compressionThreshold: REASONING_FIRST_CONFIG.compressionThreshold,
      enableTokenAlignment: REASONING_FIRST_CONFIG.enableTokenAlignment,
      summaryVerbosity: REASONING_FIRST_CONFIG.summaryVerbosity,
      milestoneThreshold: REASONING_FIRST_CONFIG.milestoneThreshold,
      entityMapPosition: REASONING_FIRST_CONFIG.entityMapPosition,
    },
    GENERAL: {
      compressionThreshold: GENERAL_CONFIG.compressionThreshold,
      enableTokenAlignment: GENERAL_CONFIG.enableTokenAlignment,
      summaryVerbosity: GENERAL_CONFIG.summaryVerbosity,
      milestoneThreshold: GENERAL_CONFIG.milestoneThreshold,
      entityMapPosition: GENERAL_CONFIG.entityMapPosition,
    },
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 调试接口
// ═══════════════════════════════════════════════════════════════════════════

/** 暴露给浏览器控制台的调试接口 */
export const compressionStrategyDebug = {
  detectStrategy,
  getStrategyConfig,
  getAllStrategySummary,
  getSessionState: (sessionId: string) => sessionStrategyState.get(sessionId),
  setSessionStrategy,
  clearStrategyState,
};

// 挂载到 window（如果在浏览器环境）
if (typeof window !== "undefined") {
  (window as any).compressionStrategy = compressionStrategyDebug;
}
