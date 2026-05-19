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

## 设计原则

1. **宁可高估不低估** - 避免上下文截断
2. **缓存 tokenizer** - 避免重复初始化
3. **运行时校准** - 根据实际 API 返回调整
4. **短填充** - 避免重复字符导致 tokenization 偏差
