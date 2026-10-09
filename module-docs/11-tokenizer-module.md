# Tokenizer Module

## 概述

Tokenizer 模块提供多模型 Token 估算能力，支持：
- 模型特定的估算策略

## 文件结构

```
src/utils/tokenizer/
├── index.ts      # 主入口，Token 估算
└── types.ts      # 类型定义
```

界面和业务代码一般不直接引用本模块，而是通过 `src/utils/token-utils.ts`（`estimateTokens`、`formatTokenCount`、`estimateCost`、`formatCost`、`formatTokenSpeed`，并转出 `estimateTokensDetailed`等）。

估算方式：启发式规则（CJK 约 1.5 字符/token、英文约 4 字符/token、符号、数字分别计）或「简化 BPE 估算」，不引入真实 tokenizer 库；模型名未识别时回退启发式。默认配置：`modelName: "gpt-4o"`、`safetyMargin: 0.05`（`setTokenizerConfig` 可改）。

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
//   tokenizerType: "o200k",
//   modelFamily: "gpt",
//   confidence: 0.85
// }
```

## 模型支持

| 模型家族 | Tokenizer 类型 |
|----------|---------------|
| GPT-4o/o1 | o200k |
| GPT-4/3.5 | cl100k |
| Claude | claude |
| Gemini | gemini |
| DeepSeek | deepseek |

## 当前接入情况

- 在用：`estimateTokens`（输入框预估、上下文标签 token 数、面板与聊天块里的 token 统计，均经 `token-utils.ts`）、`formatTokenSpeed`（消息上的 tok/s）。
- 注意 `services/ai/context-manager.ts`（历史压缩）自带一个独立的估算函数，不走本模块。

## 设计原则

1. **宁可高估不低估** - 避免上下文截断
2. **缓存 tokenizer** - 避免重复初始化
