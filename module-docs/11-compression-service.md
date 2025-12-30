# 压缩服务 (Compression Service)

## 概述

`compression-service.ts` 实现了一套基于"三明治缓存架构"的对话历史压缩系统，支持**动态策略组**，能够根据模型特性自动选择最优的压缩配置。

## 动态策略组

### 策略类型

系统支持三种压缩策略，根据模型名称自动检测：

| 配置项 | CACHE_FIRST (DeepSeek) | REASONING_FIRST (Gemini/Claude) | GENERAL (通用) |
|--------|------------------------|--------------------------------|----------------|
| 压缩触发阈值 | 4,000 Tokens | 12,000 - 18,000 Tokens | 6,000 Tokens |
| Token 对齐 | 启用 (64单位) | 禁用 | 禁用 |
| 摘要冗余度 | 极低 (追求精简) | 中等 (保留更多细节) | 中等 |
| 实体映射位置 | System Prompt 之后 | Dynamic Context 之前 | System Prompt 之后 |
| 里程碑合并间隔 | 10 层 | 20 层 | 12 层 |
| 最近对话保留 | 2,500 Tokens | 4,000 Tokens | 3,000 Tokens |

### 自动检测规则

```typescript
// 模型名称 -> 策略映射（按优先级）
CACHE_FIRST:
  - deepseek-chat, deepseek-coder, deepseek-v2/v3

REASONING_FIRST:
  - gemini-2.5-pro, gemini-3-pro, gemini-exp
  - claude-3-5-sonnet, claude-3-opus
  - o1, o1-preview, o1-mini, o3

GENERAL:
  - gpt-4o, gpt-4-turbo, gpt-3.5
  - gemini-pro, gemini-flash
  - llama, mistral, qwen, yi
```

### 运行时自动调整

系统会根据缓存命中率自动调整策略：
- CACHE_FIRST 命中率持续低于 60% → 降级到 GENERAL
- GENERAL 命中率持续高于 85% → 升级到 CACHE_FIRST
- REASONING_FIRST 不自动调整（保持稳定）

## 设计背景

### 问题

长对话场景下，历史消息会快速累积 Token，导致：
1. API 调用成本线性增长
2. 超出模型上下文窗口限制
3. 频繁的缓存失效导致推理变慢

### 解决方案

采用三层结构管理上下文，最大化缓存命中率：

```
┌─────────────────────────────────────────────────────────────┐
│ 底层 (Static Cache) - 100% 不动                              │
│ System Prompt + 核心指令 + 用户记忆 + 业务知识                │
│ 一旦写入，永不修改，保证缓存完全命中                          │
├─────────────────────────────────────────────────────────────┤
│ 中层 (Summary Buffer) - 只追加不修改                         │
│                                                             │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ <global_knowledge>                                      │ │
│ │ ### 已知实体                                            │ │
│ │ 人物：张三、李四                                         │ │
│ │ 偏好：简洁风格、深色主题                                  │ │
│ │ </global_knowledge>                                     │ │
│ └─────────────────────────────────────────────────────────┘ │
│                           ↓                                 │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ ### 里程碑摘要 #1                                       │ │
│ │ <!-- range: 0-50 -->                                    │ │
│ │ - 阶段目标：完成了费用报表设计                           │ │
│ │ - 核心结论：采用简洁风格，张三负责审核                    │ │
│ │ <!-- END -->                                            │ │
│ │ <!-- padding: ------------------------------------ -->   │ │
│ └─────────────────────────────────────────────────────────┘ │
│                           ↓                                 │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ ### 历史摘要 #1                                         │ │
│ │ <!-- range: 50-55 -->                                   │ │
│ │ - 实体：预算 5000 元                                     │ │
│ │ - 共识：下周一提交初稿                                   │ │
│ │ <!-- END -->                                            │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ 每层独立，新摘要追加到末尾，已有层永不改动                    │
│ 里程碑合并间隔由策略决定（10-20 层）                         │
├─────────────────────────────────────────────────────────────┤
│ 顶层 (Dynamic Context) - 频繁更新                            │
│ 最近 2-4 轮原始对话（由策略决定 Token 上限）                  │
│ 保证 AI 的"短期记忆"不失真                                  │
└─────────────────────────────────────────────────────────────┘
```

## 配置参数

配置参数现在由动态策略系统管理，以下是默认值（GENERAL 策略）：

```typescript
// 策略配置类型
type CompressionStrategyConfig = {
  compressionThreshold: number;      // 触发压缩的 Token 阈值
  hardLimitThreshold: number;        // 硬截断阈值
  recentTokenLimit: number;          // 最近对话保留的 Token 上限
  summaryMaxTokens: number;          // 摘要输出的最大 Token
  summaryMaxTokensCompact: number;   // 高密度摘要的最大 Token
  summaryVerbosity: "minimal" | "medium" | "detailed";
  enableTokenAlignment: boolean;     // 是否启用 Token 对齐
  tokenAlignUnit: number;            // Token 对齐单位
  milestoneThreshold: number;        // 触发里程碑合并的层数
  milestoneDistillThreshold: number; // 触发里程碑再蒸馏的数量
  entityMapPosition: "after_system" | "before_dynamic" | "inline";
  middleLayerTokenLimit: number;     // 中层 Token 上限
  layerTokenTarget: number;          // 每层摘要的目标 Token 数
};

// 默认配置（内部使用）
const DEFAULT_CONFIG = {
  compressionThreshold: 4000,
  hardLimitThreshold: 5800,
  recentTokenLimit: 2500,
  layerTokenTarget: 1500,
  summaryMaxTokens: 500,
  summaryMaxTokensCompact: 300,
  middleLayerTokenLimit: 1500,
  tokenAlignUnit: 64,
  enableTokenAlignment: true,
  milestoneThreshold: 10,
  milestoneDistillThreshold: 3,
  // Token 偏差校准配置
  biasCalibrationMinSamples: 3,
  biasFactorMax: 1.15,
  biasFactorMin: 0.90,
  biasSignificanceThreshold: 0.03,
};
```

## 核心功能

### 1. 压缩触发条件

```typescript
// 软触发：Token 超过阈值 + 处于语义断点
const shouldCompress = totalTokens > compressionThreshold && isSemanticBreakPoint;

// 硬触发：Token 超过硬限制，无论是否断点都强制压缩
const forceCompress = totalTokens >= hardLimitThreshold;
```

### 2. 语义断点检测

避免在逻辑推导中间截断，检测以下模式：

**适合截断的信号：**
- "好的"、"就这样"、"先这样"
- "谢谢"、"感谢"
- "我知道了"、"明白了"
- 以句号/问号结尾的完整句子

**不应截断的信号：**
- 未闭合的代码块 ` ``` `
- 逻辑连接词开头："然后"、"接下来"、"首先"
- 以逗号/冒号结尾（未完成）
- 省略号结尾

### 3. 摘要生成

使用 AI 生成结构化摘要，保留三要素：

```typescript
const SUMMARY_PROMPT = `你是对话压缩专家。将以下对话压缩成结构化摘要。

## 必须保留（按优先级）：
1. **实体**：人名、数字、日期、具体偏好（最高优先级，必须原样保留）
2. **共识**：已确认的结论、决定、约定
3. **待办**：未完成的任务、待解决的问题

## 输出格式：
- 实体：[关键信息1] [关键信息2]
- 共识：[要点1] [要点2]
- 待办：[要点1]

## 规则：
- 删除礼貌用语、重复内容、已被推翻的错误尝试
- 每个要点不超过 20 字
- 总长度不超过 200 字`;
```

### 4. 里程碑合并

当摘要层达到 10 层时，自动合并为一个里程碑摘要：

```typescript
const MILESTONE_PROMPT = `将多个摘要合并为一个里程碑摘要。

## 里程碑摘要结构：
1. **阶段目标**：这一阶段完成了什么（高度抽象）
2. **核心结论**：最重要的决定和共识
3. **未解决项**：遗留问题、待办事项
4. **关键时间轴**：重要的时间节点`;
```

### 5. 实体映射

全局维护实体信息，避免重复：

```typescript
type EntityInfo = {
  name: string;            // 实体名称
  type: "person" | "date" | "number" | "preference";
  value: string;           // 当前值
  firstSeen: number;       // 首次出现的层索引
  lastUpdated: number;     // 最后更新的层索引
};

// 输出格式（XML 标签提升检索优先级）
<global_knowledge>
### 已知实体
人物：张三、李四
偏好：简洁风格、深色主题
</global_knowledge>
```

### 6. Token 对齐

为最大化 DeepSeek 缓存命中，将每层摘要对齐到 64 Token 边界：

```typescript
function alignToTokenBoundary(text: string): string {
  const tokens = estimateTokens(text);
  const remainder = tokens % 64;
  
  if (remainder === 0) return text;
  
  // 使用 HTML 注释填充，避免空格干扰模型注意力
  const paddingTokens = 64 - remainder;
  const paddingContent = "-".repeat(paddingTokens * 4);
  const padding = `<!-- padding: ${paddingContent} -->`;
  
  return text.trimEnd() + "\n" + padding + "\n";
}
```

### 7. 低优先级过滤

自动过滤无信息量的内容：

```typescript
const LOW_PRIORITY_PATTERNS = [
  /^(好的|好|ok|OK|嗯|哦|行|可以|没问题|收到|明白|了解|知道了)[\s。！!,.，]*$/,
  /^(谢谢|感谢|多谢|thanks|thx)[\s。！!,.，]*$/i,
  /^(你好|您好|hi|hello|hey)[\s。！!,.，]*$/i,
  /^(是的|对|没错|确实|同意)[\s。！!,.，]*$/,
];
```

### 8. 里程碑再蒸馏（v2.1 新增）

当里程碑数量达到阈值（默认 3 个）时，对旧里程碑进行"再蒸馏"：

```typescript
// 触发条件
if (cache.milestones.length >= CONFIG.milestoneDistillThreshold) {
  const distilled = await distillMilestones(cache.milestones, apiConfig);
  // 保留最新里程碑，用蒸馏结果替换旧的
  cache.milestones = [distilled, latestMilestone];
}
```

再蒸馏规则：
- **只保留**：仍然有效的共识、未完成的待办、关键实体
- **丢弃**：已完成的任务、过时的决定、中间过程
- **输出限制**：不超过 150 字

### 9. Token 校准机制（v2.1 新增）

应对不同模型 Tokenizer 的差异：

```typescript
// 当 API 返回缓存命中信息时调用
calibrateTokenOffset(sessionId, promptCacheHitTokens, expectedCacheTokens);

// 连续 3 轮未命中时，自动调整偏移量
if (cache.consecutiveMisses >= CONFIG.calibrationMissThreshold) {
  cache.calibrationOffset = newOffset;
}
```

### 10. 滑动缓冲区（v2.1 新增）

确保进入摘要的消息是完整的问答对：

```typescript
function findSafeRecentBoundary(messages, targetTokens) {
  // 1. 找到目标 Token 位置
  // 2. 如果边界在 assistant 消息上，往前包含对应的 user 消息
  // 3. 如果边界在 tool 消息上，包含完整的工具调用链
  // 4. 允许 slidingBufferMargin (200 tokens) 的额外余量
}
```

## 数据结构

### 摘要层 (SummaryLayer)

```typescript
type SummaryLayer = {
  id: string;              // 层 ID（基于消息 hash）
  summary: string;         // 摘要内容（已格式化，Token 对齐）
  tokenCount: number;      // Token 数（对齐后）
  messageRange: [number, number];  // 消息范围 [startIdx, endIdx)
  createdAt: number;       // 创建时间戳
  isMilestone: boolean;    // 是否为里程碑摘要
  entities: string[];      // 本层新增/更新的实体
  decisions: string[];     // 本层的决策/共识
};
```

### 会话缓存 (SessionCache)

```typescript
type SessionCache = {
  layers: SummaryLayer[];           // 摘要层列表（只追加）
  milestones: SummaryLayer[];       // 里程碑摘要
  entityMap: Map<string, EntityInfo>; // 全局实体映射
  processedCount: number;           // 已处理的消息数量
  lastUpdateAt: number;             // 最后更新时间
  pendingCompression: boolean;      // 是否有待处理的压缩
  asyncCompressionInProgress: boolean; // 是否正在异步压缩
  // === v2.1 新增 ===
  calibrationOffset: number;        // Token 校准偏移量
  consecutiveMisses: number;        // 连续缓存未命中次数
};
```

## API 接口

### 主要函数

```typescript
// 核心压缩函数（自动选择策略）
export async function compressContext(
  sessionId: string,
  messages: Message[],
  apiConfig: { apiUrl: string; apiKey: string; model: string },
): Promise<{
  summaryText: string | null;
  entityMapText: string;
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
}>

// 兼容旧接口（message-builder 调用）
export async function getOrCreateSummary(
  sessionId: string,
  messages: Message[],
  keepRecent: number,
  apiConfig: { ... },
): Promise<{
  summary: string | null;
  recentMessages: Message[];
  needsCompression: boolean;
}>

// 清除缓存
export function clearSummaryCache(sessionId: string): void
export function clearAllSummaryCache(): void

// 获取统计信息（包含策略信息）
export function getCacheStats(sessionId: string): {
  layerCount: number;
  milestoneCount: number;
  totalTokens: number;
  strategy: {
    type: CompressionStrategyType;
    compressionThreshold: number;
    enableTokenAlignment: boolean;
    milestoneThreshold: number;
  } | null;
  // ... 其他字段
} | null

export function getGlobalCompressionMetrics(): { ... }

// 根据消息索引查找摘要层
export function findLayerByMessageIndex(sessionId: string, messageIndex: number): { ... } | null

// 异步压缩
export function triggerAsyncCompression(sessionId: string, messages: Message[], apiConfig: { ... }): void
export async function waitForAsyncCompression(sessionId: string): Promise<void>

// 缓存预热
export function prewarmCache(sessionId: string, data: SerializedCache): void
export function prewarmMilestonesOnly(sessionId: string, milestones: SummaryLayer[], processedCount: number): void

// Token 校准
export function calibrateTokenOffset(sessionId: string, promptCacheHitTokens: number | undefined, expectedCacheTokens: number): void

// === 策略相关 ===
// 检测模型对应的策略
export function detectStrategy(modelName: string): { 
  strategy: CompressionStrategyType; 
  confidence: number;
}

// 获取策略配置
export function getStrategyConfig(strategy: CompressionStrategyType): CompressionStrategyConfig

// 手动设置会话策略（覆盖自动检测）
export function setSessionStrategy(sessionId: string, strategy: CompressionStrategyType): void

// 获取所有策略摘要
export function getAllStrategySummary(): Record<CompressionStrategyType, {...}>
```

### 调试接口

```javascript
// 浏览器控制台可用
window.compressionService.getGlobalCompressionMetrics()
// => { sessionCount: 1, totalLayers: 3, totalMilestones: 0, averageHitRate: 0.85 }

window.compressionService.getCacheStats('session-id')
// => { layerCount: 3, milestoneCount: 0, totalTokens: 450, strategy: { type: 'CACHE_FIRST', ... }, ... }

// 策略相关
window.compressionService.detectStrategy('deepseek-chat')
// => { strategy: 'CACHE_FIRST', confidence: 0.95, matchedRule: 'deepseek[-_]?chat' }

window.compressionService.getAllStrategySummary()
// => { CACHE_FIRST: {...}, REASONING_FIRST: {...}, GENERAL: {...} }

window.compressionService.setSessionStrategy('session-id', 'REASONING_FIRST')
// 手动覆盖策略
```

## 集成方式

### message-builder.ts 中的调用

```typescript
// buildConversationMessages 函数中
if (enableCompression && compressAfterMessages && sessionId && apiConfig) {
  const { summary, recentMessages } = await getOrCreateSummary(
    sessionId,
    filteredMessages,
    compressAfterMessages,
    apiConfig,
  );
  
  if (summary) {
    // 将摘要添加到系统提示词中
    const summarySection = `\n\n## 对话历史摘要\n${summary}`;
    systemContent = (systemContent || "") + summarySection;
    
    // 只保留最近消息
    filteredMessages = recentMessages;
  }
}
```

### 用户设置

通过 `CompressionSettingsModal.tsx` 提供 UI：

- **启用历史压缩**：开关 `enableCompression`
- **保留最近对话**：选择 5/8/10/12/15/20 条

设置存储在 `ai-chat-settings.ts`：

```typescript
interface AiChatSettings {
  enableCompression: boolean;        // 默认 true
  compressAfterMessages: number;     // 默认 10
}
```

## 监控指标

```typescript
type CompressionMetrics = {
  totalRequests: number;      // 总请求数
  cacheHits: number;          // 缓存命中次数
  cacheMisses: number;        // 缓存未命中次数
  layerCreations: number;     // 摘要层创建次数
  milestoneCreations: number; // 里程碑创建次数
  hardLimitTriggers: number;  // 硬截断触发次数
  lastMilestoneHitRate: number; // 里程碑合并后的命中率
  // === v2.1 新增 ===
  milestoneDistillations: number;  // 里程碑再蒸馏次数
  calibrationAdjustments: number;  // Token 校准调整次数
};
```

## 注意事项

1. **缓存一致性**：摘要层一旦创建永不修改，只追加新层
2. **Token 估算**：使用 `estimateTokens()` 粗略估算，留 200 Token 余量
3. **异步压缩**：可在用户发送消息后异步预计算，不阻塞主流程
4. **pinned 消息**：标记为 `pinned` 或 `noCompress` 的消息不会被压缩
5. **错误降级**：压缩失败时回退到使用全部消息

## 文件位置

- 主服务：`src/services/compression-service.ts`
- 策略模块：`src/services/compression-strategy.ts`
- 集成点：`src/services/message-builder.ts`
- 设置 UI：`src/views/CompressionSettingsModal.tsx`
- 菜单入口：`src/views/HeaderMenu.tsx`
- 设置定义：`src/settings/ai-chat-settings.ts`
