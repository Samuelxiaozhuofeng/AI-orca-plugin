# 模块：AI 工具系统（AI Tools）

## 目标与范围

定义和执行 AI 可用的工具（Tools），让 AI 能够与 Orca 笔记库进行交互，搜索和查询用户的笔记内容。

## 关联文件

- `src/services/ai-tools.ts`：工具定义与执行逻辑（核心）
- `src/views/AiChatPanel.tsx`：调用工具的 UI 组件

## 可用工具

| 工具名称             | 功能             | 参数                                             |
| -------------------- | ---------------- | ------------------------------------------------ |
| `tool_instructions`  | 获取指定工具说明 | `toolName` (必填)                                |

## 核心 API

### TOOLS 常量

```typescript
export const TOOLS: OpenAITool[];
```

符合 OpenAI Function Calling 规范的工具定义数组。

### executeTool 函数

```typescript
export async function executeTool(toolName: string, args: any): Promise<string>;
```

执行指定工具并返回格式化的结果字符串。

## 数据流

```
用户发送消息
    ↓
AI 决定调用工具 → 返回 tool_calls
    ↓
AiChatPanel 解析 tool_calls
    ↓
调用 executeTool(toolName, args)
    ↓
executeTool 执行对应工具
    ↓
返回结果给 AI 继续对话
```

## 扩展指南

添加新工具需要：

1. 在 `TOOLS` 数组中添加工具定义
2. 在 `executeTool` 函数中添加对应的处理分支

## 更新记录

- 2025-12-21：从 `AiChatPanel.tsx` 提取为独立模块
- 2026-01-23：补充标签搜索返回属性与 block-ref 展开说明
