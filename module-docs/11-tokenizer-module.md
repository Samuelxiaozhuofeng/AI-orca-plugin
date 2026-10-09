# Tokenizer Module

## 概述

Tokenizer 模块提供多模型 Token 估算能力，支持：
- 模型特定的估算策略
- 运行时偏差校准
- Token 对齐填充

## 文件结构

```
src/utils/tokenizer/
├── index.ts      # 主入口，Token 估算
├── types.ts      # 类型定义
└── alignment.ts  # Token 对齐填充
```

界面和业务代码一般不直接引用本模块，而是通过 `src/utils/token-utils.ts`（`estimateTokens`、`formatTokenCount`、`estimateCost`、`formatCost`、`formatTokenSpeed`，并转出 `estimateTokensDetailed`、`recordCalibrationSample`、`alignToTokenBoundary` 等）。

估算方式：启发式规则（CJK 约 1.5 字符/token、英文约 4 字符/token、符号、数字分别计）或「简化 BPE 估算」，不引入真实 tokenizer 库；模型名未识别时回退启发式。默认配置：`modelName: "gpt-4o"`、开启校准、`safetyMargin: 0.05`（`setTokenizerConfig` 可改）。

## 核心功能

### Token 估算

```typescript
import { estimateTokens, estimateTokensDetailed } from "../utils/tokenizer";

// 简单估算
const tokens = estimateTokens("Hello, 你好！");

// 详细估算（包含元数据）
const result = estimateTokensDetailed("Hello, 你好！", "gpt-4o");
// result: {
//   tokens: 12,           // 最终值（含安全余量）
//   rawTokens: 10,        // 原始估算
//   calibratedTokens: 11, // 校准后
//   tokenizerType: "o200k",
//   modelFamily: "gpt",
//   confidence: 0.85
// }
```

### 运行时校准

```typescript
import { recordCalibrationSample, getCalibrationStats } from "../utils/tokenizer";

// 记录校准样本（API 返回实际 token 数后调用）
recordCalibrationSample("gpt-4o", estimatedTokens, actualTokens);

// 查看校准统计
const stats = getCalibrationStats();
// { gpt: { samples: 5, biasFactor: 1.02, lastUpdated: ... } }
```

### Token 对齐

```typescript
import { alignToTokenBoundary, getModelAlignmentConfig } from "../utils/tokenizer/alignment";

// 对齐到 64 token 边界
const aligned = alignToTokenBoundary(text, {
  enabled: true,
  alignUnit: 64,
  paddingStrategy: "comment", // 使用 HTML 注释填充
});

// 获取模型特定配置
const config = getModelAlignmentConfig("deepseek-chat");
// { enabled: true, alignUnit: 64, paddingStrategy: "comment" }
```

## 填充策略

| 策略 | 说明 | 适用场景 |
|------|------|----------|
| `comment` | HTML 注释 `<!-- pXXXX -->` | DeepSeek（默认） |
| `whitespace` | 换行符 | 简单场景 |
| `marker` | 自定义标记 `[PAD]` | 特殊需求 |
| `none` | 不填充 | Claude/Gemini |

## 模型支持

| 模型家族 | Tokenizer 类型 | 对齐建议 |
|----------|---------------|----------|
| GPT-4o/o1 | o200k | 可选 32 |
| GPT-4/3.5 | cl100k | 可选 32 |
| Claude | claude | 禁用 |
| Gemini | gemini | 禁用 |
| DeepSeek | deepseek | 启用 64 |

## 当前接入情况

- 在用：`estimateTokens`（输入框预估、上下文标签 token 数、面板与聊天块里的 token 统计，均经 `token-utils.ts`）、`formatTokenSpeed`（消息上的 tok/s）。
- 注意 `services/ai/context-manager.ts`（历史压缩）自带一个独立的估算函数，不走本模块。
- 已实现但目前没有被发送流程调用：`recordCalibrationSample`（没有任何地方传入 API 返回的真实 token 数）、`alignToTokenBoundary`（请求构造里没有做对齐填充）。

## 设计原则

1. **宁可高估不低估** - 避免上下文截断
2. **缓存 tokenizer** - 避免重复初始化
3. **运行时校准** - 根据实际 API 返回调整
4. **短填充** - 避免重复字符导致 tokenization 偏差
