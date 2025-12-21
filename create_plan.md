# AI 编辑器工具实现计划

本文档为其它 AI 开发者提供详细的实现指南，用于在 Orca AI Chat 插件中添加四个新的编辑器工具。

## 功能概述

| 功能         | 描述                | API 命令                      | 可行性     |
| ------------ | ------------------- | ----------------------------- | ---------- |
| 创建新笔记   | AI 创建新内容块     | `core.editor.insertBlock`     | ⭐⭐⭐⭐⭐ |
| 插入标签     | AI 为笔记添加标签   | `core.editor.insertTag`       | ⭐⭐⭐⭐⭐ |
| 设置属性     | AI 修改笔记属性     | `core.editor.setProperties`   | ⭐⭐⭐⭐⭐ |
| 批量插入文本 | AI 批量创建多行内容 | `core.editor.batchInsertText` | ⭐⭐⭐⭐⭐ |

---

## 必读文档参考

> [!IMPORTANT]
> 开发前必须仔细阅读以下文档，理解 API 用法和现有代码模式。

### 核心 API 文档

- **[Core-Editor-Commands.md](file:///d:/orca%E6%8F%92%E4%BB%B6/AI%20plugin/plugin-docs/documents/Core-Editor-Commands.md)**
  - `core.editor.insertBlock` — 第 27-49 行
  - `core.editor.batchInsertText` — 第 51-74 行
  - `core.editor.insertTag` — 第 543-569 行
  - `core.editor.setProperties` — 第 340-380 行

### 现有实现参考

- **[ai-tools.ts](file:///d:/orca%E6%8F%92%E4%BB%B6/AI%20plugin/src/services/ai-tools.ts)** — 工具定义模式和 `executeTool` 函数
- **[06-ai-tools.md](file:///d:/orca%E6%8F%92%E4%BB%B6/AI%20plugin/module-docs/06-ai-tools.md)** — 模块扩展指南

---

## 实现步骤

### 第一步：理解 API 调用模式

所有编辑器命令通过 `orca.commands.invokeEditorCommand` 调用：

```typescript
// 基本调用格式
const result = await orca.commands.invokeEditorCommand(
  "core.editor.commandName",
  cursor, // CursorData | null
  ...args // 命令参数
);
```

关键点：

- 第一个参数是命令名称
- 第二个参数是 `cursor`（可为 `null`）
- 后续参数根据具体命令而定

### 第二步：在 TOOLS 数组中添加工具定义

在 `src/services/ai-tools.ts` 的 `TOOLS` 数组中添加新工具定义。

#### 2.1 createBlock 工具

```typescript
{
  type: "function",
  function: {
    name: "createBlock",
    description: "创建新的笔记块。可指定参考块和位置。",
    parameters: {
      type: "object",
      properties: {
        refBlockId: {
          type: "number",
          description: "参考块 ID，新块将相对于此块插入"
        },
        position: {
          type: "string",
          enum: ["before", "after", "firstChild", "lastChild"],
          description: "相对于参考块的位置"
        },
        content: {
          type: "string",
          description: "块的文本内容"
        }
      },
      required: ["refBlockId", "position", "content"]
    }
  }
}
```

#### 2.2 insertTag 工具

```typescript
{
  type: "function",
  function: {
    name: "insertTag",
    description: "为指定块添加标签",
    parameters: {
      type: "object",
      properties: {
        blockId: {
          type: "number",
          description: "要添加标签的块 ID"
        },
        tagName: {
          type: "string",
          description: "标签别名（如 'project', 'task'）"
        },
        data: {
          type: "array",
          description: "可选的关联数据",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              value: {}
            }
          }
        }
      },
      required: ["blockId", "tagName"]
    }
  }
}
```

#### 2.3 setProperties 工具

```typescript
{
  type: "function",
  function: {
    name: "setProperties",
    description: "设置或更新块的属性值",
    parameters: {
      type: "object",
      properties: {
        blockIds: {
          type: "array",
          items: { type: "number" },
          description: "要设置属性的块 ID 数组"
        },
        properties: {
          type: "array",
          description: "要设置的属性数组",
          items: {
            type: "object",
            properties: {
              name: { type: "string", description: "属性名" },
              value: { description: "属性值" },
              type: {
                type: "number",
                description: "属性类型: 0=JSON, 1=Text, 2=BlockRefs, 3=Number, 4=Boolean, 5=DateTime, 6=TextChoices"
              }
            }
          }
        }
      },
      required: ["blockIds", "properties"]
    }
  }
}
```

#### 2.4 batchInsertText 工具

```typescript
{
  type: "function",
  function: {
    name: "batchInsertText",
    description: "批量插入多行文本，每行成为一个新块",
    parameters: {
      type: "object",
      properties: {
        refBlockId: {
          type: "number",
          description: "参考块 ID"
        },
        position: {
          type: "string",
          enum: ["before", "after", "firstChild", "lastChild"],
          description: "相对于参考块的位置"
        },
        text: {
          type: "string",
          description: "要插入的多行文本（用换行符分隔）"
        },
        skipMarkdown: {
          type: "boolean",
          description: "是否跳过 Markdown 解析"
        },
        skipTags: {
          type: "boolean",
          description: "是否跳过标签提取"
        }
      },
      required: ["refBlockId", "position", "text"]
    }
  }
}
```

### 第三步：在 executeTool 函数中添加处理逻辑

在 `executeTool` 函数中添加对应的分支处理。

#### 3.1 createBlock 处理

```typescript
} else if (toolName === "createBlock") {
  const refBlockId = args.refBlockId;
  const position = args.position || "after";
  const content = args.content || "";

  // 获取参考块
  const refBlock = orca.state.blocks[refBlockId];
  if (!refBlock) {
    return `Error: Block ${refBlockId} not found`;
  }

  // 构建 ContentFragment 数组
  const contentFragments = [{ t: "t", v: content }];

  const newBlockId = await orca.commands.invokeEditorCommand(
    "core.editor.insertBlock",
    null,
    refBlock,
    position,
    contentFragments
  );

  return `Created new block with ID: ${newBlockId}`;
}
```

#### 3.2 insertTag 处理

```typescript
} else if (toolName === "insertTag") {
  const blockId = args.blockId;
  const tagName = args.tagName;
  const data = args.data || [];

  const tagId = await orca.commands.invokeEditorCommand(
    "core.editor.insertTag",
    null,
    blockId,
    tagName,
    data
  );

  return `Added tag "${tagName}" to block ${blockId}, tag reference ID: ${tagId}`;
}
```

#### 3.3 setProperties 处理

```typescript
} else if (toolName === "setProperties") {
  const blockIds = args.blockIds;
  const properties = args.properties;

  if (!Array.isArray(blockIds) || blockIds.length === 0) {
    return "Error: blockIds must be a non-empty array";
  }

  await orca.commands.invokeEditorCommand(
    "core.editor.setProperties",
    null,
    blockIds,
    properties
  );

  return `Set ${properties.length} properties on ${blockIds.length} block(s)`;
}
```

#### 3.4 batchInsertText 处理

```typescript
} else if (toolName === "batchInsertText") {
  const refBlockId = args.refBlockId;
  const position = args.position || "lastChild";
  const text = args.text || "";
  const skipMarkdown = args.skipMarkdown || false;
  const skipTags = args.skipTags || false;

  const refBlock = orca.state.blocks[refBlockId];
  if (!refBlock) {
    return `Error: Block ${refBlockId} not found`;
  }

  await orca.commands.invokeEditorCommand(
    "core.editor.batchInsertText",
    null,
    refBlock,
    position,
    text,
    skipMarkdown,
    skipTags
  );

  const lineCount = text.split('\n').length;
  return `Inserted ${lineCount} lines of text`;
}
```

---

## 需要注意的关键点

### 1. 块引用获取

```typescript
// 通过 ID 获取块对象
const block = orca.state.blocks[blockId];
```

### 2. ContentFragment 格式

```typescript
// 简单文本内容
const contentFragments = [{ t: "t", v: "文本内容" }];
```

### 3. PropType 枚举值

| 类型        | 值  | 说明           |
| ----------- | --- | -------------- |
| JSON        | 0   | 任意 JSON 对象 |
| Text        | 1   | 字符串         |
| BlockRefs   | 2   | 块引用 ID 数组 |
| Number      | 3   | 数字           |
| Boolean     | 4   | 布尔值         |
| DateTime    | 5   | 日期时间       |
| TextChoices | 6   | 选项数组       |

### 4. 错误处理

参考现有工具的错误处理模式，包装在 try-catch 中并返回友好的错误信息。

---

## 安全考量

> [!CAUTION]
> 这些工具会修改用户的笔记库，需要特别注意：

1. **验证块 ID 存在性** — 操作前检查 `orca.state.blocks[id]` 是否存在
2. **限制批量操作** — 考虑对 `batchInsertText` 设置行数上限
3. **属性类型验证** — 确保属性值与声明的类型匹配
4. **AI 描述清晰** — 工具描述应明确告知 AI 何时使用这些工具

---

## 更新模块文档

实现完成后，更新 `module-docs/06-ai-tools.md`：

1. 在"可用工具"表格中添加新工具
2. 更新"已知限制"部分（现在支持创建、修改笔记）
3. 添加更新记录

---

## 验证方法

1. **手动测试**：在 Orca 中打开 AI Chat 面板，尝试以下提示：

   - "在当前笔记后面创建一个新块，内容为'测试内容'"
   - "给块 ID 为 xxx 的笔记添加 #project 标签"
   - "设置块 xxx 的 priority 属性为 5"
   - "批量插入以下三行文本：第一行、第二行、第三行"

2. **检查结果**：
   - 验证新块是否正确创建
   - 验证标签是否正确添加
   - 验证属性是否正确设置
   - 验证批量文本是否逐行创建为独立块
