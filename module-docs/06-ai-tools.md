# 模块：AI 工具系统（AI Tools）

## 目标与范围

定义和执行 AI 可用的工具（Tools），让 AI 能够与 Orca 笔记库进行交互，搜索和查询用户的笔记内容。

## 关联文件

- `src/services/ai-tools.ts`：工具定义与执行逻辑（核心）
- `src/services/search-service.ts`：底层搜索服务
- `src/utils/query-filter-parser.ts`：属性过滤器解析
- `src/views/AiChatPanel.tsx`：调用工具的 UI 组件
- `src/services/skill-service.ts`：技能层注册与执行
- `src/components/SkillConfirmDialog.tsx`：技能执行确认

## 技能层（Skills）

技能用于将多个工具组合成用户任务流程。每个技能由 `skills.md` 描述，并按固定结构存储在插件目录下：

```
Skills/
  <技能名称>/
    skills.md
    Script/
    Data/
```

### 运行规则

- 技能以 `skill_` 前缀暴露为模型可调用的工具。
- 执行技能前必须向用户确认。
- 技能步骤按顺序执行，可调用现有工具。
- 若宿主不提供 `plugin-fs-*`，则改用 `orca.plugins.setData/getData` 持久化，仅保存 `skills.md`，`Script/` 与 `Data/` 都不会落库。
- ??????????????????????????????

## 技能预检
- 可在工具面板开启“技能预检”开关。
- 在生成回复前，AI 会输出 Skill Check 摘要（匹配技能 + 理由 + 建议动作）。
- 用户确认后才会执行技能；拒绝则继续常规对话。

## 可用工具

| 工具名称             | 功能             | 参数                                             |
| -------------------- | ---------------- | ------------------------------------------------ |
| `tool_instructions`  | 获取指定工具说明 | `toolName` (必填)                                |
| `searchBlocksByTag`  | 按标签搜索笔记   | `tagName` (必需), `maxResults` (可选, 默认 50)   |
| `searchBlocksByText` | 按文本内容搜索   | `searchText` (必需), `maxResults` (可选)         |
| `queryBlocksByTag`   | 高级标签属性查询 | `tagName`, `properties[]`, `property_filters` 等 |

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
executeTool 调用对应的 search-service 函数
    ↓
格式化结果（包含可点击的 orca-block: 链接）
    ↓
返回结果给 AI 继续对话
```

## 结果格式

工具返回的结果使用 Markdown 格式，包含：

- 结果计数
- 可点击的笔记链接：`[标题](orca-block:id)`
- 笔记内容预览
- 属性值（如适用）
- `searchBlocksByTag`/`queryBlocksByTag` 默认返回标签属性；block-ref 属性会展开为块摘要
- `briefMode=true` 时仅返回标题+摘要，不包含属性详情

示例：

```
Found 3 note(s) with tag "task" (filtered by: priority >= 8):
1. [完成报告](orca-block:12345) (priority=9)
- 这是笔记内容预览...
```

## 扩展指南

添加新工具需要：

1. 在 `TOOLS` 数组中添加工具定义
2. 在 `executeTool` 函数中添加对应的处理分支
3. （可选）在 `search-service.ts` 中添加底层搜索函数

## 已知限制

- 最大返回结果数限制为 50
- 不支持跨多个标签的组合查询
- 不支持创建、修改或删除笔记

## 更新记录

- 2025-12-21：从 `AiChatPanel.tsx` 提取为独立模块
- 2026-01-23：补充标签搜索返回属性与 block-ref 展开说明
