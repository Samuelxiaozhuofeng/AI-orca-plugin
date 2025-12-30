/**
 * Compression Service - 三明治缓存架构 v2
 * 
 * 核心原则："稳定性比简洁更值钱"
 * 宁可多保留 500 Token 冗余，也不要为了精简导致 50k 缓存重算
 * 
 * 三明治结构：
 * ┌─────────────────────────────────────────────────────────────┐
 * │ 底层 (Static Cache) - 100% 不动                              │
 * │ System Prompt + 核心指令 + 业务知识                          │
 * ├─────────────────────────────────────────────────────────────┤
 * │ 中层 (Summary Buffer) - 只追加不修改                         │
 * │ [实体映射] → [里程碑摘要] → [摘要层N] → [摘要层N+1] ...      │
 * │ 每层独立，新摘要追加到末尾，已有层永不改动                    │
 * │ 每 10 层触发一次"里程碑合并"                                 │
 * ├─────────────────────────────────────────────────────────────┤
 * │ 顶层 (Dynamic Context) - 频繁更新                            │
 * │ 最近 2-3 轮原始对话，保证短期记忆不失真                       │
 * └─────────────────────────────────────────────────────────────┘
 * 
 * 高级特性：
 * - 分级合并：10 层摘要合并为 1 个里程碑摘要
 * - 实体去重：全局实体映射，增量更新
 * - 语义断点：检测话题结束，避免逻辑中间截断
 * - Token 对齐：64 Token 边界填充，最大化缓存命中
 * - 元数据标记：消息范围追溯，支持原文召回
 */

import type { Message } from "./session-service";
import { openAIChatCompletionsStream, type OpenAIChatMessage } from "./openai-client";
import { estimateTokens } from "../utils/token-utils";
import {
  type CompressionStrategyConfig,
  type CompressionStrategyType,
  getEffectiveConfig,
  updateStrategyState,
  autoAdjustStrategy,
  clearStrategyState,
  compressionStrategyDebug,
} from "./compression-strategy";

// ═══════════════════════════════════════════════════════════════════════════
// 类型定义
// ═══════════════════════════════════════════════════════════════════════════

// 实体信息（支持增量更新）
type EntityInfo = {
  name: string;            // 实体名称
  type: "person" | "date" | "number" | "preference";
  value: string;           // 当前值
  firstSeen: number;       // 首次出现的层索引
  lastUpdated: number;     // 最后更新的层索引
};

// 摘要层（每层是一个独立的缓存块，一旦创建永不修改）
type SummaryLayer = {
  id: string;              // 层 ID（基于消息 hash）
  summary: string;         // 摘要内容（已格式化，Token 对齐）
  tokenCount: number;      // Token 数（对齐后）
  messageRange: [number, number];  // 消息范围 [startIdx, endIdx)
  createdAt: number;       // 创建时间戳
  isMilestone: boolean;    // 是否为里程碑摘要（合并层）
  // 信息密度元数据
  entities: string[];      // 本层新增/更新的实体
  decisions: string[];     // 本层的决策/共识
};

// 会话缓存
type SessionCache = {
  layers: SummaryLayer[];           // 摘要层列表（只追加）
  milestones: SummaryLayer[];       // 里程碑摘要（合并后的大层）
  entityMap: Map<string, EntityInfo>; // 全局实体映射
  processedCount: number;           // 已处理的消息数量
  lastUpdateAt: number;             // 最后更新时间
  pendingCompression: boolean;      // 是否有待处理的压缩（语义断点延迟）
  asyncCompressionInProgress: boolean; // 是否正在异步压缩
  // === 新增字段 ===
  calibrationOffset: number;        // Token 校准偏移量
  consecutiveMisses: number;        // 连续缓存未命中次数
  // === Token 估算偏差校准 ===
  tokenBiasFactor: number;          // Token 估算偏差因子（1.0 = 无偏差）
  biasCalibrationSamples: number;   // 偏差校准样本数
  cumulativeBiasSum: number;        // 累计偏差和（用于计算平均偏差）
};

const sessionCache = new Map<string, SessionCache>();

// 异步压缩任务队列
const pendingCompressionTasks = new Map<string, Promise<void>>();

// ═══════════════════════════════════════════════════════════════════════════
// 配置
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 摘要冗余度类型
 */
type SummaryVerbosity = "minimal" | "medium" | "detailed";

/**
 * 实体映射位置类型
 */
type EntityMapPosition = "after_system" | "before_dynamic" | "inline";

/**
 * 会话配置类型
 */
type SessionConfig = {
  compressionThreshold: number;
  hardLimitThreshold: number;
  recentTokenLimit: number;
  layerTokenTarget: number;
  summaryMaxTokens: number;
  summaryMaxTokensCompact: number;
  middleLayerTokenLimit: number;
  blockEndMarker: string;
  tokenAlignUnit: number;
  enableTokenAlignment: boolean;
  milestoneThreshold: number;
  tokenEstimateMargin: number;
  milestoneDistillThreshold: number;
  calibrationMissThreshold: number;
  slidingBufferMargin: number;
  biasCalibrationMinSamples: number;
  biasFactorMax: number;
  biasFactorMin: number;
  biasSignificanceThreshold: number;
  summaryVerbosity: SummaryVerbosity;
  entityMapPosition: EntityMapPosition;
};

/**
 * 默认配置（作为回退值，实际使用时会被策略配置覆盖）
 */
const DEFAULT_CONFIG: SessionConfig = {
  // 触发压缩的 Token 阈值（生产用）
  compressionThreshold: 4000,
  // 硬截断阈值（留 200 Token 余量应对估算误差）
  hardLimitThreshold: 5800,
  // 最近对话保留的 Token 上限（动态块）
  recentTokenLimit: 2500,
  // 每层摘要的目标 Token 数
  layerTokenTarget: 1500,
  // 摘要输出的最大 Token（基础值，可动态调整）
  summaryMaxTokens: 500,
  // 高密度摘要的最大 Token（当中层过长时使用）
  summaryMaxTokensCompact: 300,
  // 中层 Token 上限（超过此值启用高密度模式）
  middleLayerTokenLimit: 1500,
  // 缓存块结尾标记
  blockEndMarker: "\n<!-- END -->\n",
  // Token 对齐单位（DeepSeek 缓存对齐）
  tokenAlignUnit: 64,
  // 是否启用 Token 对齐
  enableTokenAlignment: true,
  // 触发里程碑合并的层数
  milestoneThreshold: 10,
  // Token 估算误差余量
  tokenEstimateMargin: 200,
  // === 新增配置 ===
  // 触发里程碑再蒸馏的里程碑数量
  milestoneDistillThreshold: 3,
  // 缓存校准：连续未命中次数阈值
  calibrationMissThreshold: 3,
  // 滑动缓冲区：确保完整问答对的额外 Token 余量
  slidingBufferMargin: 200,
  // === Token 偏差校准配置 ===
  // 偏差校准最小样本数（达到后才开始调整）
  biasCalibrationMinSamples: 3,
  // 偏差因子调整上限（防止过度校准）
  biasFactorMax: 1.15,
  // 偏差因子调整下限
  biasFactorMin: 0.90,
  // 偏差显著性阈值（偏差超过此比例才触发调整）
  biasSignificanceThreshold: 0.03,
  // 摘要冗余度
  summaryVerbosity: "medium",
  // 实体映射位置
  entityMapPosition: "after_system",
};

/**
 * 会话配置缓存（存储每个会话的有效配置）
 */
const sessionConfigCache = new Map<string, {
  config: SessionConfig;
  strategy: CompressionStrategyType;
  modelName: string;
}>();

/**
 * 获取会话的有效配置（基于策略动态生成）
 */
function getSessionConfig(sessionId: string, modelName: string): SessionConfig & { strategy: CompressionStrategyType } {
  // 检查缓存
  const cached = sessionConfigCache.get(sessionId);
  if (cached && cached.modelName === modelName) {
    return { ...cached.config, strategy: cached.strategy };
  }
  
  // 获取策略配置
  const strategyConfig = getEffectiveConfig(sessionId, modelName);
  
  // 合并配置
  const config: SessionConfig = {
    ...DEFAULT_CONFIG,
    compressionThreshold: strategyConfig.compressionThreshold,
    hardLimitThreshold: strategyConfig.hardLimitThreshold,
    recentTokenLimit: strategyConfig.recentTokenLimit,
    summaryMaxTokens: strategyConfig.summaryMaxTokens,
    summaryMaxTokensCompact: strategyConfig.summaryMaxTokensCompact,
    summaryVerbosity: strategyConfig.summaryVerbosity,
    enableTokenAlignment: strategyConfig.enableTokenAlignment,
    tokenAlignUnit: strategyConfig.tokenAlignUnit,
    milestoneThreshold: strategyConfig.milestoneThreshold,
    milestoneDistillThreshold: strategyConfig.milestoneDistillThreshold,
    entityMapPosition: strategyConfig.entityMapPosition,
    middleLayerTokenLimit: strategyConfig.middleLayerTokenLimit,
    layerTokenTarget: strategyConfig.layerTokenTarget,
  };
  
  // 更新缓存
  sessionConfigCache.set(sessionId, {
    config,
    strategy: strategyConfig.strategy,
    modelName,
  });
  
  console.log(`[compression] Session ${sessionId} using ${strategyConfig.strategy} strategy (threshold: ${config.compressionThreshold}, alignment: ${config.enableTokenAlignment})`);
  
  return { ...config, strategy: strategyConfig.strategy };
}

// 保持向后兼容的 CONFIG 引用（使用默认配置）
const CONFIG = DEFAULT_CONFIG;

// ═══════════════════════════════════════════════════════════════════════════
// 监控统计
// ═══════════════════════════════════════════════════════════════════════════

// 缓存命中率统计（用于监控）
type CompressionMetrics = {
  totalRequests: number;
  cacheHits: number;
  cacheMisses: number;
  layerCreations: number;
  milestoneCreations: number;
  hardLimitTriggers: number;
  lastMilestoneHitRate: number;  // 里程碑合并后的命中率
  // === 新增字段 ===
  milestoneDistillations: number;  // 里程碑再蒸馏次数
  calibrationAdjustments: number;  // Token 校准调整次数
};

const metricsStore = new Map<string, CompressionMetrics>();

function getOrCreateMetrics(sessionId: string): CompressionMetrics {
  let metrics = metricsStore.get(sessionId);
  if (!metrics) {
    metrics = {
      totalRequests: 0,
      cacheHits: 0,
      cacheMisses: 0,
      layerCreations: 0,
      milestoneCreations: 0,
      hardLimitTriggers: 0,
      lastMilestoneHitRate: 1.0,
      milestoneDistillations: 0,
      calibrationAdjustments: 0,
    };
    metricsStore.set(sessionId, metrics);
  }
  return metrics;
}

function recordCacheHit(sessionId: string, hit: boolean): void {
  const metrics = getOrCreateMetrics(sessionId);
  metrics.totalRequests++;
  if (hit) {
    metrics.cacheHits++;
  } else {
    metrics.cacheMisses++;
  }
}

function recordLayerCreation(sessionId: string): void {
  const metrics = getOrCreateMetrics(sessionId);
  metrics.layerCreations++;
}

function recordMilestoneCreation(sessionId: string): void {
  const metrics = getOrCreateMetrics(sessionId);
  metrics.milestoneCreations++;
  // 里程碑合并后重置命中率计算
  metrics.lastMilestoneHitRate = metrics.totalRequests > 0 
    ? metrics.cacheHits / metrics.totalRequests 
    : 1.0;
}

function recordHardLimitTrigger(sessionId: string): void {
  const metrics = getOrCreateMetrics(sessionId);
  metrics.hardLimitTriggers++;
}

function recordMilestoneDistillation(sessionId: string): void {
  const metrics = getOrCreateMetrics(sessionId);
  metrics.milestoneDistillations++;
}

function recordCalibrationAdjustment(sessionId: string): void {
  const metrics = getOrCreateMetrics(sessionId);
  metrics.calibrationAdjustments++;
}

// 低优先级内容（直接过滤，不进入摘要）
const LOW_PRIORITY_PATTERNS = [
  /^(好的|好|ok|OK|嗯|哦|行|可以|没问题|收到|明白|了解|知道了)[\s。！!,.，]*$/,
  /^(谢谢|感谢|多谢|thanks|thx)[\s。！!,.，]*$/i,
  /^(你好|您好|hi|hello|hey)[\s。！!,.，]*$/i,
  /^(是的|对|没错|确实|同意)[\s。！!,.，]*$/,
];

// 语义断点模式（话题结束信号）
const SEMANTIC_BREAK_PATTERNS = [
  /^(好的|就这样|先这样|那就这样|暂时就这些)[\s。！!,.，]*$/,
  /^(谢谢|感谢|多谢|辛苦了)[\s。！!,.，]*$/,
  /^(我知道了|明白了|了解了|收到)[\s。！!,.，]*$/,
  /^(下次再|回头再|稍后再|待会再)[\s。！!,.，]*$/,
  /[。！!?？]$/,  // 以句号/问号结尾
];

// 逻辑连续性模式（不应在此处截断）
const LOGIC_CONTINUATION_PATTERNS = [
  /```[\s\S]*$/,           // 代码块未闭合
  /^\s*(然后|接下来|首先|其次|最后|另外|此外)/,  // 逻辑连接词开头
  /[,，:：]$/,              // 以逗号/冒号结尾（未完成）
  /\.\.\.$|…$/,            // 省略号结尾
];

// 高价值实体模式（信息密度高，优先保留）
const ENTITY_PATTERNS = {
  // 日期时间
  date: /\d{4}[-/年]\d{1,2}[-/月]\d{1,2}[日号]?|\d{1,2}月\d{1,2}[日号]|今天|明天|昨天|下周|本周/g,
  // 数字（带单位）
  number: /\d+(?:\.\d+)?(?:个|条|篇|次|元|块|万|亿|%|分钟|小时|天|周|月|年|k|K|M|G|T)?/g,
  // 人名标记（常见称呼后的名字）
  name: /(?:叫|是|给|找|问|@)\s*([^\s,，。！!?？]{2,4})/g,
  // 偏好标记
  preference: /(?:喜欢|偏好|习惯|倾向于?|prefer)\s*([^\s,，。！!?？]+)/gi,
};

// 摘要提示词（保留三要素 + 信息密度优先）
const SUMMARY_PROMPT = `你是对话压缩专家。将以下对话压缩成结构化摘要。

## 必须保留（按优先级）：
1. **实体**：人名、数字、日期、具体偏好（最高优先级，必须原样保留）
2. **共识**：已确认的结论、决定、约定
3. **待办**：未完成的任务、待解决的问题

## 输出格式（严格遵守，确保 Token 对齐）：
- 实体：[关键信息1] [关键信息2]
- 共识：[要点1] [要点2]
- 待办：[要点1]

## 规则：
- 事实性陈述（Fact）压缩权重低于描述性文字
- 删除礼貌用语、重复内容、已被推翻的错误尝试
- 每个要点不超过 20 字
- 总长度不超过 200 字
- 无内容的类别可省略
- 输出必须以换行结束（Token 对齐）`;

// 里程碑合并提示词（更高级别的抽象）
const MILESTONE_PROMPT = `你是对话压缩专家。将以下多个摘要合并为一个里程碑摘要。

## 输入：多个历史摘要
## 输出：一个精炼的里程碑摘要

## 里程碑摘要结构（必须包含）：
1. **阶段目标**：这一阶段完成了什么（高度抽象）
2. **核心结论**：最重要的决定和共识
3. **未解决项**：遗留问题、待办事项
4. **关键时间轴**：重要的时间节点

## 输出格式：
- 阶段目标：[一句话概括]
- 核心结论：[要点1] [要点2]
- 未解决项：[要点1]
- 时间轴：[日期1: 事件] [日期2: 事件]

## 规则：
1. 合并重复的实体信息，保留最新值
2. 保留所有未完成的待办事项
3. 删除已过时或被推翻的决定
4. 使用更高级别的抽象（不是具体细节，而是阶段性目标）
5. 总长度控制在 300 字以内`;

// 里程碑再蒸馏提示词（极致压缩，仅保留核心）
const MILESTONE_DISTILL_PROMPT = `你是对话压缩专家。将以下多个里程碑摘要进行"再蒸馏"，提取最核心的信息。

## 输入：多个里程碑摘要
## 输出：一个极简的核心摘要

## 再蒸馏规则：
1. **只保留**：仍然有效的共识、未完成的待办、关键实体
2. **丢弃**：已完成的任务、过时的决定、中间过程
3. **合并**：相似的结论合并为一条

## 输出格式：
- 核心共识：[最重要的1-3条结论]
- 关键实体：[人名/数字/日期]
- 遗留待办：[未完成项]

## 规则：
- 总长度不超过 150 字
- 宁可丢失细节，也要保证核心信息的准确性`;

// ═══════════════════════════════════════════════════════════════════════════
// 工具函数
// ═══════════════════════════════════════════════════════════════════════════

function isLowPriority(content: string): boolean {
  if (!content || content.trim().length < 3) return true;
  return LOW_PRIORITY_PATTERNS.some(p => p.test(content.trim()));
}

function calculateTokens(messages: Message[]): number {
  return messages.reduce((sum, m) => sum + estimateTokens(m.content || ""), 0);
}

/**
 * 滑动缓冲区：确保进入摘要的消息是完整的问答对
 * 防止在关键逻辑中间截断
 */
function findSafeRecentBoundary(
  messages: Message[],
  targetTokens: number,
): number {
  let tokens = 0;
  let boundaryIdx = messages.length;
  
  // 从后往前累计 Token，找到目标位置
  for (let i = messages.length - 1; i >= 0; i--) {
    const msgTokens = estimateTokens(messages[i].content || "");
    if (tokens + msgTokens > targetTokens) {
      boundaryIdx = i + 1;
      break;
    }
    tokens += msgTokens;
    boundaryIdx = i;
  }
  
  // 如果边界刚好在 assistant 消息上，往前找到对应的 user 消息
  // 确保不会切断问答对
  if (boundaryIdx > 0 && boundaryIdx < messages.length) {
    const boundaryMsg = messages[boundaryIdx];
    
    // 如果边界是 assistant 消息，需要包含它对应的 user 消息
    if (boundaryMsg.role === "assistant") {
      // 往前找 user 消息
      for (let i = boundaryIdx - 1; i >= 0; i--) {
        if (messages[i].role === "user") {
          // 检查是否会超出太多（允许 slidingBufferMargin 的余量）
          const extraTokens = calculateTokens(messages.slice(i, boundaryIdx));
          if (extraTokens <= CONFIG.slidingBufferMargin) {
            boundaryIdx = i;
          }
          break;
        }
      }
    }
    
    // 如果边界是 tool 消息，需要包含完整的工具调用链
    if (boundaryMsg.role === "tool") {
      // 往前找到发起工具调用的 assistant 消息
      for (let i = boundaryIdx - 1; i >= 0; i--) {
        if (messages[i].role === "assistant" && messages[i].tool_calls) {
          boundaryIdx = i;
          break;
        }
        if (messages[i].role === "user") {
          boundaryIdx = i;
          break;
        }
      }
    }
  }
  
  return boundaryIdx;
}

/**
 * 检测语义断点（是否适合在此处压缩）
 * 返回 true 表示可以安全压缩
 */
function isSemanticBreakPoint(lastMessage: Message | undefined): boolean {
  if (!lastMessage || !lastMessage.content) return true;
  
  const content = lastMessage.content.trim();
  
  // 检查是否在逻辑连续中（不应截断）
  for (const pattern of LOGIC_CONTINUATION_PATTERNS) {
    if (pattern.test(content)) {
      return false;
    }
  }
  
  // 检查是否为语义断点（适合截断）
  for (const pattern of SEMANTIC_BREAK_PATTERNS) {
    if (pattern.test(content)) {
      return true;
    }
  }
  
  // 默认：如果是 assistant 消息且较长，认为是完整回复
  if (lastMessage.role === "assistant" && content.length > 100) {
    return true;
  }
  
  return false;
}

/**
 * 提取高价值实体（信息密度分析）
 */
function extractEntities(text: string): { 
  dates: string[]; 
  numbers: string[]; 
  names: string[];
  preferences: string[];
} {
  const dates = [...new Set((text.match(ENTITY_PATTERNS.date) || []))];
  const numbers = [...new Set((text.match(ENTITY_PATTERNS.number) || []))];
  const names: string[] = [];
  const preferences: string[] = [];
  
  let match;
  const nameRegex = new RegExp(ENTITY_PATTERNS.name.source, 'g');
  while ((match = nameRegex.exec(text)) !== null) {
    if (match[1] && !names.includes(match[1])) {
      names.push(match[1]);
    }
  }
  
  const prefRegex = new RegExp(ENTITY_PATTERNS.preference.source, 'gi');
  while ((match = prefRegex.exec(text)) !== null) {
    if (match[1] && !preferences.includes(match[1])) {
      preferences.push(match[1]);
    }
  }
  
  return { dates, numbers, names, preferences };
}

/**
 * 更新全局实体映射（增量更新，去重）
 */
function updateEntityMap(
  entityMap: Map<string, EntityInfo>,
  newEntities: { dates: string[]; numbers: string[]; names: string[]; preferences: string[] },
  layerIndex: number,
): string[] {
  const updatedKeys: string[] = [];
  
  // 处理人名
  for (const name of newEntities.names) {
    const key = `person:${name}`;
    const existing = entityMap.get(key);
    if (!existing) {
      entityMap.set(key, {
        name,
        type: "person",
        value: name,
        firstSeen: layerIndex,
        lastUpdated: layerIndex,
      });
      updatedKeys.push(key);
    }
  }
  
  // 处理偏好（可能更新）
  for (const pref of newEntities.preferences) {
    const key = `preference:${pref.slice(0, 10)}`;
    const existing = entityMap.get(key);
    if (!existing || existing.lastUpdated < layerIndex) {
      entityMap.set(key, {
        name: pref.slice(0, 10),
        type: "preference",
        value: pref,
        firstSeen: existing?.firstSeen ?? layerIndex,
        lastUpdated: layerIndex,
      });
      updatedKeys.push(key);
    }
  }
  
  return updatedKeys;
}

/**
 * 生成实体映射文本（XML 标签包裹，提升检索优先级）
 */
function buildEntityMapText(entityMap: Map<string, EntityInfo>): string {
  if (entityMap.size === 0) return "";
  
  const persons = [...entityMap.values()].filter(e => e.type === "person");
  const prefs = [...entityMap.values()].filter(e => e.type === "preference");
  
  const parts: string[] = [];
  if (persons.length > 0) {
    parts.push(`人物：${persons.map(p => p.name).join("、")}`);
  }
  if (prefs.length > 0) {
    parts.push(`偏好：${prefs.map(p => p.value).slice(0, 5).join("、")}`);
  }
  
  if (parts.length === 0) return "";
  
  // 使用 XML 标签包裹，提升模型对长期背景的检索优先级
  return `\n\n<global_knowledge>\n### 已知实体\n${parts.join("\n")}\n</global_knowledge>\n`;
}

/**
 * Token 对齐填充（动态配置）
 * 使用 HTML 注释填充，避免空格干扰模型注意力
 * 
 * @param text 要对齐的文本
 * @param enableAlignment 是否启用对齐（REASONING_FIRST 策略禁用）
 * @param alignUnit Token 对齐单位（默认 64）
 */
function alignToTokenBoundary(
  text: string, 
  enableAlignment: boolean = true,
  alignUnit: number = 64,
): string {
  // 如果禁用对齐，直接返回
  if (!enableAlignment || alignUnit <= 1) {
    return text;
  }
  
  const tokens = estimateTokens(text);
  const remainder = tokens % alignUnit;
  
  if (remainder === 0) return text;
  
  // 计算需要填充的 Token 数
  const paddingTokens = alignUnit - remainder;
  // 使用 HTML 注释填充，避免空格干扰模型
  // 粗略估计：1 Token ≈ 4 个字符
  const paddingContent = "-".repeat(paddingTokens * 4);
  const padding = `<!-- padding: ${paddingContent} -->`;
  
  return text.trimEnd() + "\n" + padding + "\n";
}

/**
 * 格式化摘要输出（带元数据标记和 Token 对齐）
 * 
 * @param summary 摘要内容
 * @param layerIndex 层索引
 * @param messageRange 消息范围
 * @param isMilestone 是否为里程碑
 * @param enableAlignment 是否启用 Token 对齐
 * @param alignUnit Token 对齐单位
 */
function formatSummaryOutput(
  summary: string, 
  layerIndex: number,
  messageRange: [number, number],
  isMilestone: boolean = false,
  enableAlignment: boolean = true,
  alignUnit: number = 64,
): string {
  // 1. 统一换行符
  let cleaned = summary.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  // 2. 移除首尾空白
  cleaned = cleaned.trim();
  // 3. 压缩连续空行
  cleaned = cleaned.replace(/\n{3,}/g, "\n\n");
  
  // 4. 添加层级标记和元数据
  const label = isMilestone 
    ? `### 里程碑摘要 #${layerIndex + 1}` 
    : `### 历史摘要 #${layerIndex + 1}`;
  const meta = `<!-- range: ${messageRange[0]}-${messageRange[1]} -->`;
  
  const formatted = `\n\n${label}\n${meta}\n${cleaned}${DEFAULT_CONFIG.blockEndMarker}`;
  
  // 5. Token 对齐（使用传入的配置）
  return alignToTokenBoundary(formatted, enableAlignment, alignUnit);
}

/**
 * 规范化字符串结尾
 */
function normalizeBlockEnding(text: string): string {
  return text.trimEnd() + "\n";
}

/**
 * 生成层 ID
 */
function generateLayerId(messages: Message[]): string {
  const content = messages.map(m => `${m.id}:${m.role}`).join("|");
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    hash = ((hash << 5) - hash) + content.charCodeAt(i);
    hash |= 0;
  }
  return `layer_${hash.toString(16)}_${messages.length}`;
}

// ═══════════════════════════════════════════════════════════════════════════
// 核心逻辑
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 计算当前中层 Token 总数
 */
function calculateMiddleLayerTokens(cache: SessionCache): number {
  const milestoneTokens = cache.milestones.reduce((sum, m) => sum + m.tokenCount, 0);
  const layerTokens = cache.layers.reduce((sum, l) => sum + l.tokenCount, 0);
  return milestoneTokens + layerTokens;
}

/**
 * 动态计算摘要最大 Token（根据中层长度调整）
 */
function getDynamicSummaryMaxTokens(cache: SessionCache): number {
  const middleTokens = calculateMiddleLayerTokens(cache);
  
  // 如果中层已经很长，使用高密度模式
  if (middleTokens >= CONFIG.middleLayerTokenLimit) {
    console.log(`[compression] Middle layer too long (${middleTokens} tokens), using compact mode`);
    return CONFIG.summaryMaxTokensCompact;
  }
  
  return CONFIG.summaryMaxTokens;
}

/**
 * 生成摘要（带实体提取和已知实体感知）
 */
async function generateSummary(
  messages: Message[],
  apiConfig: { apiUrl: string; apiKey: string; model: string },
  knownEntities: string[] = [],
  maxTokens: number = CONFIG.summaryMaxTokens,
): Promise<{ summary: string; entities: string[]; decisions: string[] }> {
  // 过滤低优先级消息
  const filtered = messages.filter(m => 
    m.role === "assistant" || (m.role === "user" && !isLowPriority(m.content))
  );

  if (filtered.length === 0) {
    return { summary: "", entities: [], decisions: [] };
  }

  // 提取实体
  const allText = filtered.map(m => m.content || "").join(" ");
  const extractedEntities = extractEntities(allText);
  const entities = [
    ...extractedEntities.names,
    ...extractedEntities.dates,
    ...extractedEntities.numbers.slice(0, 5),
    ...extractedEntities.preferences,
  ];

  // 构建对话文本
  const text = filtered
    .filter(m => m.role !== "tool")
    .map(m => {
      const content = (m.content || "").slice(0, 300);
      return `${m.role === "user" ? "U" : "A"}: ${content}`;
    })
    .join("\n");

  // 如果有已知实体，添加提示
  let prompt = SUMMARY_PROMPT;
  if (knownEntities.length > 0) {
    prompt += `\n\n## 已知实体（无需重复，只记录更新）：\n${knownEntities.slice(0, 10).join("、")}`;
  }
  
  // 高密度模式提示
  if (maxTokens <= CONFIG.summaryMaxTokensCompact) {
    prompt += `\n\n## 注意：请使用极简模式，总长度不超过 150 字`;
  }

  const apiMessages: OpenAIChatMessage[] = [
    { role: "system", content: prompt },
    { role: "user", content: text },
  ];

  let result = "";
  try {
    for await (const chunk of openAIChatCompletionsStream({
      apiUrl: apiConfig.apiUrl,
      apiKey: apiConfig.apiKey,
      model: apiConfig.model,
      messages: apiMessages,
      temperature: 0.2,
      maxTokens,
    })) {
      if (chunk.type === "content") {
        result += chunk.content;
      }
    }
  } catch (error) {
    console.error("[compression] Summary generation failed:", error);
    if (entities.length > 0) {
      result = `- 实体：${entities.join(" ")}`;
    }
  }

  // 提取决策/共识
  const decisions: string[] = [];
  const consensusMatch = result.match(/共识[：:]\s*(.+?)(?=\n|$)/);
  if (consensusMatch) {
    decisions.push(...consensusMatch[1].split(/[,，]/));
  }

  return {
    summary: result.trim(),
    entities,
    decisions,
  };
}

/**
 * 合并多个摘要层为里程碑摘要
 */
async function mergeLayers(
  layers: SummaryLayer[],
  apiConfig: { apiUrl: string; apiKey: string; model: string },
  alignmentConfig?: { enableAlignment: boolean; alignUnit: number },
): Promise<SummaryLayer | null> {
  if (layers.length === 0) return null;

  const combinedSummaries = layers.map(l => l.summary).join("\n---\n");
  const messageRange: [number, number] = [
    layers[0].messageRange[0],
    layers[layers.length - 1].messageRange[1],
  ];

  const apiMessages: OpenAIChatMessage[] = [
    { role: "system", content: MILESTONE_PROMPT },
    { role: "user", content: combinedSummaries },
  ];

  let result = "";
  try {
    for await (const chunk of openAIChatCompletionsStream({
      apiUrl: apiConfig.apiUrl,
      apiKey: apiConfig.apiKey,
      model: apiConfig.model,
      messages: apiMessages,
      temperature: 0.2,
      maxTokens: 600,
    })) {
      if (chunk.type === "content") {
        result += chunk.content;
      }
    }
  } catch (error) {
    console.error("[compression] Milestone merge failed:", error);
    // 降级：简单拼接
    result = layers.map(l => l.summary.replace(/### 历史摘要 #\d+\n/, "")).join("\n");
  }

  const formattedSummary = formatSummaryOutput(
    result.trim(),
    0, // 里程碑索引单独计算
    messageRange,
    true,
    alignmentConfig?.enableAlignment ?? true,
    alignmentConfig?.alignUnit ?? 64,
  );

  return {
    id: `milestone_${Date.now()}`,
    summary: formattedSummary,
    tokenCount: estimateTokens(formattedSummary),
    messageRange,
    createdAt: Date.now(),
    isMilestone: true,
    entities: [...new Set(layers.flatMap(l => l.entities))],
    decisions: [...new Set(layers.flatMap(l => l.decisions))],
  };
}

/**
 * 里程碑再蒸馏：当里程碑数量过多时，合并旧里程碑
 * 仅保留核心共识和实体，丢弃过程细节
 */
async function distillMilestones(
  milestones: SummaryLayer[],
  apiConfig: { apiUrl: string; apiKey: string; model: string },
  alignmentConfig?: { enableAlignment: boolean; alignUnit: number },
): Promise<SummaryLayer | null> {
  if (milestones.length < 2) return null;

  // 合并前 N-1 个里程碑，保留最新的一个不动
  const toDistill = milestones.slice(0, -1);
  const combinedSummaries = toDistill.map(m => m.summary).join("\n---\n");
  const messageRange: [number, number] = [
    toDistill[0].messageRange[0],
    toDistill[toDistill.length - 1].messageRange[1],
  ];

  const apiMessages: OpenAIChatMessage[] = [
    { role: "system", content: MILESTONE_DISTILL_PROMPT },
    { role: "user", content: combinedSummaries },
  ];

  let result = "";
  try {
    for await (const chunk of openAIChatCompletionsStream({
      apiUrl: apiConfig.apiUrl,
      apiKey: apiConfig.apiKey,
      model: apiConfig.model,
      messages: apiMessages,
      temperature: 0.2,
      maxTokens: 300, // 极简输出
    })) {
      if (chunk.type === "content") {
        result += chunk.content;
      }
    }
  } catch (error) {
    console.error("[compression] Milestone distillation failed:", error);
    return null;
  }

  const formattedSummary = formatSummaryOutput(
    result.trim(),
    0,
    messageRange,
    true,
    alignmentConfig?.enableAlignment ?? true,
    alignmentConfig?.alignUnit ?? 64,
  );

  return {
    id: `distilled_${Date.now()}`,
    summary: formattedSummary,
    tokenCount: estimateTokens(formattedSummary),
    messageRange,
    createdAt: Date.now(),
    isMilestone: true,
    entities: [...new Set(toDistill.flatMap(m => m.entities))],
    decisions: [], // 再蒸馏后只保留核心，不再追踪具体决策
  };
}

/**
 * Token 校准：根据 API 返回的缓存命中信息调整偏移量
 * 同时根据 prompt_tokens 校准 Token 估算偏差因子
 */
export function calibrateTokenOffset(
  sessionId: string,
  promptCacheHitTokens: number | undefined,
  expectedCacheTokens: number,
  actualPromptTokens?: number,    // API 返回的实际 prompt_tokens
  estimatedPromptTokens?: number, // 本地估算的 prompt_tokens
): void {
  const cache = sessionCache.get(sessionId);
  if (!cache) return;

  // === 偏差因子校准（基于 prompt_tokens） ===
  if (actualPromptTokens !== undefined && estimatedPromptTokens !== undefined && estimatedPromptTokens > 0) {
    // 计算本次偏差比例：(实际 - 估算) / 估算
    const biasRatio = (actualPromptTokens - estimatedPromptTokens) / estimatedPromptTokens;
    
    // 累计偏差样本
    cache.cumulativeBiasSum += biasRatio;
    cache.biasCalibrationSamples++;
    
    // 达到最小样本数后，计算并应用偏差因子
    if (cache.biasCalibrationSamples >= CONFIG.biasCalibrationMinSamples) {
      const averageBias = cache.cumulativeBiasSum / cache.biasCalibrationSamples;
      
      // 只有偏差超过显著性阈值才调整
      if (Math.abs(averageBias) >= CONFIG.biasSignificanceThreshold) {
        // 新的偏差因子 = 1 + 平均偏差
        let newFactor = 1 + averageBias;
        
        // 限制在合理范围内
        newFactor = Math.max(CONFIG.biasFactorMin, Math.min(CONFIG.biasFactorMax, newFactor));
        
        if (Math.abs(newFactor - cache.tokenBiasFactor) > 0.01) {
          console.log(`[compression] Token bias factor adjusted: ${cache.tokenBiasFactor.toFixed(3)} -> ${newFactor.toFixed(3)} (avg bias: ${(averageBias * 100).toFixed(1)}%, samples: ${cache.biasCalibrationSamples})`);
          cache.tokenBiasFactor = newFactor;
          recordCalibrationAdjustment(sessionId);
        }
      }
    }
  }

  // === 缓存命中校准（原有逻辑） ===
  // 如果 API 没有返回缓存命中信息，跳过
  if (promptCacheHitTokens === undefined) return;

  const diff = expectedCacheTokens - promptCacheHitTokens;
  
  // 如果差异在合理范围内（<= 64），认为命中
  if (Math.abs(diff) <= CONFIG.tokenAlignUnit) {
    cache.consecutiveMisses = 0;
    return;
  }

  // 缓存未命中
  cache.consecutiveMisses++;
  console.log(`[compression] Cache miss detected: expected=${expectedCacheTokens}, actual=${promptCacheHitTokens}, consecutive=${cache.consecutiveMisses}`);

  // 连续未命中超过阈值，触发校准
  if (cache.consecutiveMisses >= CONFIG.calibrationMissThreshold) {
    // 计算偏移量：可能是模型端的固定头部消耗
    const newOffset = diff > 0 ? Math.ceil(diff / CONFIG.tokenAlignUnit) * CONFIG.tokenAlignUnit : 0;
    
    if (newOffset !== cache.calibrationOffset) {
      console.log(`[compression] Calibrating token offset: ${cache.calibrationOffset} -> ${newOffset}`);
      cache.calibrationOffset = newOffset;
      cache.consecutiveMisses = 0;
      recordCalibrationAdjustment(sessionId);
    }
  }
}

/**
 * 获取校准后的 Token 估算值
 * 应用偏差因子进行修正
 */
export function getCalibratedTokenEstimate(sessionId: string, rawEstimate: number): number {
  const cache = sessionCache.get(sessionId);
  if (!cache || cache.biasCalibrationSamples < CONFIG.biasCalibrationMinSamples) {
    // 未校准，返回原始估算 + 默认余量
    return rawEstimate + CONFIG.tokenEstimateMargin;
  }
  
  // 应用偏差因子
  return Math.ceil(rawEstimate * cache.tokenBiasFactor);
}

/**
 * 获取校准后的 Token 对齐
 */
function alignToTokenBoundaryWithCalibration(text: string, calibrationOffset: number): string {
  const tokens = estimateTokens(text) + calibrationOffset;
  const remainder = tokens % CONFIG.tokenAlignUnit;
  
  if (remainder === 0) return text;
  
  const paddingTokens = CONFIG.tokenAlignUnit - remainder;
  const paddingContent = "-".repeat(paddingTokens * 4);
  const padding = `<!-- padding: ${paddingContent} -->`;
  
  return text.trimEnd() + "\n" + padding + "\n";
}

/**
 * 缓存友好的上下文压缩（三明治架构 v2 + 动态策略）
 */
export async function compressContext(
  sessionId: string,
  messages: Message[],
  apiConfig: { apiUrl: string; apiKey: string; model: string },
): Promise<{
  summaryText: string | null;
  entityMapText: string;       // 实体映射文本
  recentMessages: Message[];
  stats: {
    totalTokens: number;
    summaryTokens: number;
    recentTokens: number;
    layerCount: number;
    milestoneCount: number;
    compressed: boolean;
    entities: string[];
    pendingCompression: boolean;
    strategy: CompressionStrategyType;  // 当前使用的策略
  };
}> {
  // 获取动态配置（基于模型自动选择策略）
  const sessionConfig = getSessionConfig(sessionId, apiConfig.model);
  
  const validMessages = messages.filter(m => !m.localOnly);
  const totalTokens = calculateTokens(validMessages);

  // 不需要压缩（使用动态阈值）
  if (totalTokens <= sessionConfig.compressionThreshold) {
    return {
      summaryText: null,
      entityMapText: "",
      recentMessages: validMessages,
      stats: {
        totalTokens,
        summaryTokens: 0,
        recentTokens: totalTokens,
        layerCount: 0,
        milestoneCount: 0,
        compressed: false,
        entities: [],
        pendingCompression: false,
        strategy: sessionConfig.strategy,
      },
    };
  }

  // 获取或创建缓存
  let cache = sessionCache.get(sessionId);
  if (!cache) {
    cache = { 
      layers: [], 
      milestones: [],
      entityMap: new Map(),
      processedCount: 0, 
      lastUpdateAt: Date.now(),
      pendingCompression: false,
      asyncCompressionInProgress: false,
      calibrationOffset: 0,
      consecutiveMisses: 0,
      tokenBiasFactor: 1.0,
      biasCalibrationSamples: 0,
      cumulativeBiasSum: 0,
    };
    sessionCache.set(sessionId, cache);
  }

  // 记录请求（用于命中率统计）
  const metrics = getOrCreateMetrics(sessionId);
  const hadCachedLayers = cache.layers.length > 0 || cache.milestones.length > 0;
  recordCacheHit(sessionId, hadCachedLayers);
  
  // 更新策略状态（用于自动调整）
  const currentHitRate = metrics.totalRequests > 0 ? metrics.cacheHits / metrics.totalRequests : 1.0;
  updateStrategyState(sessionId, { cacheHitRate: currentHitRate });
  
  // 尝试自动调整策略
  if (autoAdjustStrategy(sessionId)) {
    // 策略已调整，清除配置缓存以获取新配置
    sessionConfigCache.delete(sessionId);
  }

  // 使用滑动缓冲区找出最近消息（确保完整问答对，使用动态配置）
  const recentStartIdx = findSafeRecentBoundary(validMessages, sessionConfig.recentTokenLimit);
  const recentMessages = validMessages.slice(recentStartIdx);
  const recentTokens = calculateTokens(recentMessages);
  const oldMessages = validMessages.slice(0, recentStartIdx);

  // 检查是否需要生成新的摘要层
  const newMessageCount = oldMessages.length - cache.processedCount;
  
  if (newMessageCount > 0) {
    const newMessages = oldMessages.slice(cache.processedCount);
    const newTokens = calculateTokens(newMessages);
    const lastMessage = newMessages[newMessages.length - 1];

    // 语义断点检测
    const isBreakPoint = isSemanticBreakPoint(lastMessage);
    
    // 硬截断检测：超过硬限制必须压缩（使用动态阈值）
    const isHardLimit = totalTokens >= sessionConfig.hardLimitThreshold;
    
    if (isHardLimit) {
      recordHardLimitTrigger(sessionId);
    }
    
    // 触发条件：Token 足够多 且 (处于语义断点 或 硬截断)（使用动态配置）
    const shouldCompress = (newTokens >= sessionConfig.layerTokenTarget || newMessageCount >= 10);
    
    if (shouldCompress) {
      // 硬截断：无论是否断点都必须压缩
      if (isHardLimit) {
        console.log(`[compression] Hard limit reached (${totalTokens} tokens, threshold: ${sessionConfig.hardLimitThreshold}), forcing compression`);
        cache.pendingCompression = false;
      } else if (!isBreakPoint) {
        // 标记待压缩，延迟到下一个断点
        cache.pendingCompression = true;
        console.log(`[compression] Pending: not at semantic break point`);
      } else {
        cache.pendingCompression = false;
      }
      
      // 执行压缩（断点或硬截断）
      if (isBreakPoint || isHardLimit || cache.pendingCompression) {
        if (isBreakPoint || isHardLimit) {
          console.log(`[compression] Creating new layer: ${newMessageCount} msgs, ${newTokens} tokens`);
          
          try {
            // 获取已知实体
            const knownEntities = [...cache.entityMap.values()].map(e => e.name);
            
            // 动态计算摘要最大 Token
            const dynamicMaxTokens = getDynamicSummaryMaxTokens(cache);
            
            // 对齐配置
            const alignmentConfig = {
              enableAlignment: sessionConfig.enableTokenAlignment,
              alignUnit: sessionConfig.tokenAlignUnit,
            };
            
            const { summary, entities, decisions } = await generateSummary(
              newMessages, 
              apiConfig,
              knownEntities,
              dynamicMaxTokens,
            );
            
            if (summary) {
              const layerId = generateLayerId(newMessages);
              const messageRange: [number, number] = [cache.processedCount, oldMessages.length];
              const formattedSummary = formatSummaryOutput(
                summary, 
                cache.layers.length,
                messageRange,
                false,
                alignmentConfig.enableAlignment,
                alignmentConfig.alignUnit,
              );
              
              // 更新实体映射
              const extracted = extractEntities(newMessages.map(m => m.content || "").join(" "));
              updateEntityMap(cache.entityMap, extracted, cache.layers.length);
              
              // 追加新层
              cache.layers.push({
                id: layerId,
                summary: formattedSummary,
                tokenCount: estimateTokens(formattedSummary),
                messageRange,
                createdAt: Date.now(),
                isMilestone: false,
                entities,
                decisions,
              });
              
              cache.processedCount = oldMessages.length;
              cache.lastUpdateAt = Date.now();
              cache.pendingCompression = false;
              recordLayerCreation(sessionId);
              console.log(`[compression] Layer #${cache.layers.length} created`);
              
              // 检查是否需要里程碑合并（使用动态配置）
              if (cache.layers.length >= sessionConfig.milestoneThreshold) {
                console.log(`[compression] Triggering milestone merge for ${cache.layers.length} layers (threshold: ${sessionConfig.milestoneThreshold})`);
                const milestone = await mergeLayers(cache.layers, apiConfig, alignmentConfig);
                if (milestone) {
                  cache.milestones.push(milestone);
                  cache.layers = []; // 清空已合并的层
                  recordMilestoneCreation(sessionId);
                  console.log(`[compression] Milestone #${cache.milestones.length} created, hit rate before: ${(metrics.cacheHits / metrics.totalRequests * 100).toFixed(1)}%`);
                  
                  // 检查是否需要里程碑再蒸馏（使用动态配置）
                  if (cache.milestones.length >= sessionConfig.milestoneDistillThreshold) {
                    console.log(`[compression] Triggering milestone distillation for ${cache.milestones.length} milestones`);
                    const distilled = await distillMilestones(cache.milestones, apiConfig, alignmentConfig);
                    if (distilled) {
                      // 保留最新的里程碑，用蒸馏结果替换旧的
                      const latestMilestone = cache.milestones[cache.milestones.length - 1];
                      cache.milestones = [distilled, latestMilestone];
                      recordMilestoneDistillation(sessionId);
                      console.log(`[compression] Milestones distilled: ${sessionConfig.milestoneDistillThreshold} -> 2`);
                    }
                  }
                }
              }
            }
          } catch (error) {
            console.error("[compression] Failed to generate summary:", error);
          }
        }
      }
    }
  }

  // 构建摘要文本：里程碑 + 当前层
  const parts: string[] = [];
  for (const m of cache.milestones) {
    parts.push(m.summary);
  }
  for (const l of cache.layers) {
    parts.push(l.summary);
  }
  
  const summaryText = parts.length > 0
    ? normalizeBlockEnding(parts.join(""))
    : null;

  const entityMapText = buildEntityMapText(cache.entityMap);
  const summaryTokens = 
    cache.milestones.reduce((sum, m) => sum + m.tokenCount, 0) +
    cache.layers.reduce((sum, l) => sum + l.tokenCount, 0);
  const allEntities = [
    ...cache.milestones.flatMap(m => m.entities),
    ...cache.layers.flatMap(l => l.entities),
  ];

  return {
    summaryText,
    entityMapText,
    recentMessages,
    stats: {
      totalTokens,
      summaryTokens,
      recentTokens,
      layerCount: cache.layers.length,
      milestoneCount: cache.milestones.length,
      compressed: parts.length > 0,
      entities: [...new Set(allEntities)],
      pendingCompression: cache.pendingCompression,
      strategy: sessionConfig.strategy,
    },
  };
}

/**
 * 清除会话缓存
 */
export function clearSummaryCache(sessionId: string): void {
  sessionCache.delete(sessionId);
  sessionConfigCache.delete(sessionId);
  clearStrategyState(sessionId);
  console.log(`[compression] Cache cleared for session: ${sessionId}`);
}

/**
 * 清除所有缓存
 */
export function clearAllSummaryCache(): void {
  const count = sessionCache.size;
  sessionCache.clear();
  sessionConfigCache.clear();
  console.log(`[compression] All caches cleared (${count} sessions)`);
}

/**
 * 获取缓存统计信息（用于调试/监控）
 */
export function getCacheStats(sessionId: string): {
  layerCount: number;
  milestoneCount: number;
  totalTokens: number;
  processedMessages: number;
  entities: string[];
  entityMapSize: number;
  lastUpdateAt: number | null;
  pendingCompression: boolean;
  // 策略信息
  strategy: {
    type: CompressionStrategyType;
    compressionThreshold: number;
    enableTokenAlignment: boolean;
    milestoneThreshold: number;
  } | null;
  // Token 偏差校准信息
  tokenBias: {
    factor: number;           // 当前偏差因子
    samples: number;          // 校准样本数
    averageBias: number;      // 平均偏差百分比
    isCalibrated: boolean;    // 是否已完成初始校准
  };
  // 监控指标
  metrics: {
    totalRequests: number;
    cacheHitRate: number;
    layerCreations: number;
    milestoneCreations: number;
    hardLimitTriggers: number;
  };
} | null {
  const cache = sessionCache.get(sessionId);
  if (!cache) return null;
  
  const metrics = getOrCreateMetrics(sessionId);
  const configCache = sessionConfigCache.get(sessionId);
  
  // 计算平均偏差百分比
  const averageBias = cache.biasCalibrationSamples > 0
    ? cache.cumulativeBiasSum / cache.biasCalibrationSamples
    : 0;
  
  return {
    layerCount: cache.layers.length,
    milestoneCount: cache.milestones.length,
    totalTokens: 
      cache.milestones.reduce((sum, m) => sum + m.tokenCount, 0) +
      cache.layers.reduce((sum, l) => sum + l.tokenCount, 0),
    processedMessages: cache.processedCount,
    entities: [...cache.entityMap.values()].map(e => e.name),
    entityMapSize: cache.entityMap.size,
    lastUpdateAt: cache.lastUpdateAt,
    pendingCompression: cache.pendingCompression,
    strategy: configCache ? {
      type: configCache.strategy,
      compressionThreshold: configCache.config.compressionThreshold,
      enableTokenAlignment: configCache.config.enableTokenAlignment,
      milestoneThreshold: configCache.config.milestoneThreshold,
    } : null,
    tokenBias: {
      factor: cache.tokenBiasFactor,
      samples: cache.biasCalibrationSamples,
      averageBias,
      isCalibrated: cache.biasCalibrationSamples >= CONFIG.biasCalibrationMinSamples,
    },
    metrics: {
      totalRequests: metrics.totalRequests,
      cacheHitRate: metrics.totalRequests > 0 
        ? metrics.cacheHits / metrics.totalRequests 
        : 1.0,
      layerCreations: metrics.layerCreations,
      milestoneCreations: metrics.milestoneCreations,
      hardLimitTriggers: metrics.hardLimitTriggers,
    },
  };
}

/**
 * 根据消息索引查找所在的摘要层（用于原文召回）
 */
export function findLayerByMessageIndex(sessionId: string, messageIndex: number): {
  layerType: "milestone" | "layer" | "recent";
  layerIndex: number;
  messageRange: [number, number];
} | null {
  const cache = sessionCache.get(sessionId);
  if (!cache) return null;
  
  // 检查里程碑
  for (let i = 0; i < cache.milestones.length; i++) {
    const m = cache.milestones[i];
    if (messageIndex >= m.messageRange[0] && messageIndex < m.messageRange[1]) {
      return { layerType: "milestone", layerIndex: i, messageRange: m.messageRange };
    }
  }
  
  // 检查普通层
  for (let i = 0; i < cache.layers.length; i++) {
    const l = cache.layers[i];
    if (messageIndex >= l.messageRange[0] && messageIndex < l.messageRange[1]) {
      return { layerType: "layer", layerIndex: i, messageRange: l.messageRange };
    }
  }
  
  // 在最近消息中
  return { 
    layerType: "recent", 
    layerIndex: -1, 
    messageRange: [cache.processedCount, -1],
  };
}

/**
 * 异步触发压缩（不阻塞主流程）
 * 用于在用户发送消息后，异步预计算下一轮的压缩
 * 
 * 锁机制：确保同一时间只有一个摘要生成任务在运行
 * - 使用 pendingCompressionTasks Map 作为全局锁
 * - 使用 asyncCompressionInProgress 作为会话级锁
 * - 双重检查防止竞态条件
 */
export function triggerAsyncCompression(
  sessionId: string,
  messages: Message[],
  apiConfig: { apiUrl: string; apiKey: string; model: string },
): void {
  // 第一重检查：全局任务队列
  if (pendingCompressionTasks.has(sessionId)) {
    console.log(`[compression] Async compression already queued for session ${sessionId}, skipping`);
    return;
  }
  
  // 第二重检查：会话级锁
  const cache = sessionCache.get(sessionId);
  if (cache?.asyncCompressionInProgress) {
    console.log(`[compression] Async compression already in progress for session ${sessionId}, skipping`);
    return;
  }
  
  // 检查是否需要压缩
  const validMessages = messages.filter(m => !m.localOnly);
  const totalTokens = calculateTokens(validMessages);
  
  if (totalTokens <= CONFIG.compressionThreshold) {
    return;
  }
  
  // 立即设置锁，防止竞态条件
  if (cache) {
    cache.asyncCompressionInProgress = true;
  }
  
  console.log(`[compression] Triggering async compression for session ${sessionId}`);
  
  const task = (async () => {
    try {
      // 再次检查锁状态（双重检查锁定模式）
      const currentCache = sessionCache.get(sessionId);
      if (currentCache && !currentCache.asyncCompressionInProgress) {
        // 锁被意外释放，重新获取
        currentCache.asyncCompressionInProgress = true;
      }
      
      await compressContext(sessionId, messages, apiConfig);
    } catch (error) {
      console.error("[compression] Async compression failed:", error);
    } finally {
      // 释放锁
      const finalCache = sessionCache.get(sessionId);
      if (finalCache) {
        finalCache.asyncCompressionInProgress = false;
      }
      pendingCompressionTasks.delete(sessionId);
    }
  })();
  
  pendingCompressionTasks.set(sessionId, task);
}

/**
 * 等待异步压缩完成（如果有）
 */
export async function waitForAsyncCompression(sessionId: string): Promise<void> {
  const task = pendingCompressionTasks.get(sessionId);
  if (task) {
    await task;
  }
}

/**
 * 获取压缩监控指标（全局）
 */
export function getGlobalCompressionMetrics(): {
  sessionCount: number;
  totalLayers: number;
  totalMilestones: number;
  averageHitRate: number;
} {
  let totalLayers = 0;
  let totalMilestones = 0;
  let totalHitRate = 0;
  let sessionCount = 0;
  
  for (const [sessionId, cache] of sessionCache) {
    totalLayers += cache.layers.length;
    totalMilestones += cache.milestones.length;
    
    const metrics = metricsStore.get(sessionId);
    if (metrics && metrics.totalRequests > 0) {
      totalHitRate += metrics.cacheHits / metrics.totalRequests;
      sessionCount++;
    }
  }
  
  return {
    sessionCount: sessionCache.size,
    totalLayers,
    totalMilestones,
    averageHitRate: sessionCount > 0 ? totalHitRate / sessionCount : 1.0,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 兼容旧接口
// ═══════════════════════════════════════════════════════════════════════════

export async function getOrCreateSummary(
  sessionId: string,
  messages: Message[],
  _keepRecent: number,
  apiConfig: { apiUrl: string; apiKey: string; model: string },
): Promise<{
  summary: string | null;
  recentMessages: Message[];
  needsCompression: boolean;
}> {
  console.log(`[compression] getOrCreateSummary called: sessionId=${sessionId}, messages=${messages.length}, keepRecent=${_keepRecent}`);
  const result = await compressContext(sessionId, messages, apiConfig);
  console.log(`[compression] compressContext result: compressed=${result.stats.compressed}, totalTokens=${result.stats.totalTokens}, threshold=${CONFIG.compressionThreshold}`);
  // 合并实体映射和摘要文本
  const fullSummary = result.entityMapText + (result.summaryText || "");
  return {
    summary: fullSummary || null,
    recentMessages: result.recentMessages,
    needsCompression: result.stats.compressed,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 缓存预热
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 可序列化的缓存数据（用于持久化存储）
 */
export type SerializedCache = {
  milestones: SummaryLayer[];
  layers: SummaryLayer[];
  entityMap: Array<[string, EntityInfo]>;
  processedCount: number;
  lastUpdateAt: number;
};

/**
 * 导出缓存数据（用于持久化）
 */
export function exportCache(sessionId: string): SerializedCache | null {
  const cache = sessionCache.get(sessionId);
  if (!cache) return null;
  
  return {
    milestones: cache.milestones,
    layers: cache.layers,
    entityMap: [...cache.entityMap.entries()],
    processedCount: cache.processedCount,
    lastUpdateAt: cache.lastUpdateAt,
  };
}

/**
 * 缓存预热（从持久化数据恢复）
 * 
 * 用于高频用户：在 Session 初始化时，从数据库加载里程碑摘要
 * 完成 L1/L2 层的初次缓存命中
 */
export function prewarmCache(sessionId: string, data: SerializedCache): void {
  const cache: SessionCache = {
    milestones: data.milestones || [],
    layers: data.layers || [],
    entityMap: new Map(data.entityMap || []),
    processedCount: data.processedCount || 0,
    lastUpdateAt: data.lastUpdateAt || Date.now(),
    pendingCompression: false,
    asyncCompressionInProgress: false,
    calibrationOffset: 0,
    consecutiveMisses: 0,
    tokenBiasFactor: 1.0,
    biasCalibrationSamples: 0,
    cumulativeBiasSum: 0,
  };
  
  sessionCache.set(sessionId, cache);
  
  const totalTokens = calculateMiddleLayerTokens(cache);
  console.log(`[compression] Cache prewarmed for session ${sessionId}: ${cache.milestones.length} milestones, ${cache.layers.length} layers, ${totalTokens} tokens`);
}

/**
 * 快速预热（仅加载里程碑摘要）
 * 
 * 用于快速恢复长对话的核心上下文
 */
export function prewarmMilestonesOnly(
  sessionId: string, 
  milestones: SummaryLayer[],
  processedCount: number,
): void {
  const cache: SessionCache = {
    milestones,
    layers: [],
    entityMap: new Map(),
    processedCount,
    lastUpdateAt: Date.now(),
    pendingCompression: false,
    asyncCompressionInProgress: false,
    calibrationOffset: 0,
    consecutiveMisses: 0,
    tokenBiasFactor: 1.0,
    biasCalibrationSamples: 0,
    cumulativeBiasSum: 0,
  };
  
  // 从里程碑中恢复实体映射
  for (const milestone of milestones) {
    for (const entity of milestone.entities) {
      cache.entityMap.set(`entity:${entity}`, {
        name: entity,
        type: "person",
        value: entity,
        firstSeen: 0,
        lastUpdated: 0,
      });
    }
  }
  
  sessionCache.set(sessionId, cache);
  console.log(`[compression] Milestones prewarmed for session ${sessionId}: ${milestones.length} milestones`);
}

// ═══════════════════════════════════════════════════════════════════════════
// 策略相关导出
// ═══════════════════════════════════════════════════════════════════════════

// 重新导出策略模块的类型和函数
export type { CompressionStrategyType, CompressionStrategyConfig } from "./compression-strategy";
export {
  detectStrategy,
  getStrategyConfig,
  getAllStrategySummary,
  setSessionStrategy,
} from "./compression-strategy";

// ═══════════════════════════════════════════════════════════════════════════
// 调试接口
// ═══════════════════════════════════════════════════════════════════════════

/** 暴露给浏览器控制台的调试接口 */
export const compressionServiceDebug = {
  getCacheStats,
  getGlobalCompressionMetrics,
  clearSummaryCache,
  clearAllSummaryCache,
  exportCache,
  // 策略相关
  ...compressionStrategyDebug,
};

// 挂载到 window（如果在浏览器环境）
if (typeof window !== "undefined") {
  (window as any).compressionService = compressionServiceDebug;
}
