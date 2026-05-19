# 当前工具调用逻辑说明

## 架构概述

当前系统采用 **旧版本（cba46b8）** 的 Tool 设计，工具调用流程如下：

```
用户输入 → AiChatPanel → 工具检测与加载 → OpenAI API → Tool Calls → 工具执行 → 结果返回 → AI 继续回复
```

---

## 1. 工具定义层 (`ai-tools.ts`)

### 1.1 核心工具列表 (`TOOLS`)

**基础工具**（始终可用）：
- `searchBlocksByTag` - 按标签搜索笔记
- `searchBlocksByText` - 全文搜索
- `query_blocks_by_tag` - 标签属性查询
- `query_blocks` - 高级查询（支持复杂条件）
- `searchBlocksByReference` - 反链搜索
- `getPage` - 读取页面内容
- `getBlockMeta` - 获取块元数据
- `getBlockLinks` - 获取块的链接关系
- `getTodayJournal` - 今日日记
- `getJournalByDate` - 指定日期日记
- `getJournals` - 日记范围查询（支持周/月/范围导出）
- `createBlock` - 创建新块
- `createPage` - 创建新页面
- `insertTag` - 添加标签到块
- `updateTagProperties` - 更新标签属性
- `getSavedAiConversations` - 获取已保存的 AI 对话

### 1.2 可选工具（根据开关动态加载）

**联网搜索** (`tool-store.webSearchEnabled`)：
- `webSearch` - 联网搜索（多引擎故障转移）
- `imageSearch` - 图片搜索（可选，依赖 `tool-store.imageSearchEnabled`）

**百科工具** (`tool-store.wikipediaEnabled`)：
- `wikipedia` - Wikipedia 百科查询

**汇率工具** (`tool-store.currencyEnabled`)：
- `currency` - 实时汇率查询/货币转换

**脚本分析** (`tool-store.scriptAnalysisEnabled`)：
- Python/JavaScript 数据分析工具（动态加载）

**Todoist 工具** (`enableTodoistTools`)：
- Todoist 任务管理工具（从 `todoist-tools.ts` 加载）

**Skill 工具** (旧版本已移除)：
- ⚠️ 当前回档版本不支持 Skill 工具
- 兼容性导出函数返回空数组

---

## 2. 工具加载逻辑 (`AiChatPanel.tsx`)

### 2.1 智能工具检测（行 1797-1803）

```typescript
// 检测用户输入需要的工具类别
const detectedCategories = detectToolCategories(processedContent);
const needsTools = detectedCategories.size > 0;

// 根据场景选择工具列表
let baseTools = hasHighPriorityContext 
  ? getToolsForDraggedContext()  // 拖入块场景：禁用搜索工具
  : (needsTools ? getToolsByCategories(detectedCategories) : []);
```

**⚠️ 注意**：由于回档到旧版本，`detectToolCategories` 和 `getToolsByCategories` 现在是兼容性实现：
- `detectToolCategories()` 始终返回所有类别
- `getToolsByCategories()` 直接调用 `getTools()` 返回所有工具

### 2.2 工具加载场景

#### 场景 A：用户拖入块/上下文 (`hasHighPriorityContext = true`)
```typescript
getToolsForDraggedContext()
```
- **禁用搜索类工具**：`searchBlocksByTag`, `searchBlocksByText`, `query_blocks`, `getPage`, `getSavedAiConversations`
- **保留读取/写入工具**：`getBlockMeta`, `createBlock`, `updateTagProperties` 等
- **保留日记工具**：用户可能同时问日记相关问题

#### 场景 B：普通对话 (`hasHighPriorityContext = false`)
```typescript
getTools(webSearchEnabled, scriptAnalysisEnabled)
```
- 所有基础工具 + 根据开关动态添加的工具

### 2.3 额外工具注入（行 1817-1822）

```typescript
// Todoist AI 模式
if (enableTodoistTools) {
  baseTools = [...baseTools, ...TODOIST_TOOLS];
}

// 工具状态过滤（disabled 状态）
const filteredTools = baseTools.filter(tool => !isToolDisabled(tool.function.name));
```

### 2.4 模型能力检查（行 1824-1836）

```typescript
const supportsTools = modelSupportsTools(settings, model);
const toolsToUse = includeTools && supportsTools && filteredTools.length > 0 
  ? filteredTools 
  : undefined;
```

**不支持 Tools 的模型**：不传递工具列表，避免输出 XML 格式

---

## 3. 工具执行流程 (`AiChatPanel.tsx` 行 2176-2375)

### 3.1 Tool Call 解析与去重

```typescript
// 1. AI 返回 Tool Calls
const currentToolCalls = toolCalls;

// 2. 过滤已执行的工具调用（防止重复执行）
const executedToolCallIds = new Set(allToolResultMessages.map(m => m.tool_call_id));
const newToolCalls = currentToolCalls.filter(tc => !executedToolCallIds.has(tc.id));
```

### 3.2 参数解析与修复

```typescript
// 尝试解析 JSON 参数
try {
  args = JSON.parse(toolCall.function.arguments);
} catch (error) {
  // JSON 修复逻辑（处理 AI 常见错误）
  const repaired = tryRepairJson(toolCall.function.arguments);
  if (repaired) {
    args = JSON.parse(repaired);
  } else {
    parseError = `Invalid JSON in tool arguments`;
  }
}
```

**JSON 修复机制** (`tryRepairJson`)：
- 处理拼接的 JSON 对象：`{"a":1}{"b":2}` → `{"a":1}`
- 补全缺失的左括号：`"key": "val"}` → `{"key": "val"}`
- 移除重复键值对
- 自动补全右括号
- 修正常见拼写错误：`blockld` → `blockId`

### 3.3 工具执行分支

#### 分支 A：Skill 工具（`toolName.startsWith("skill_")`）

```typescript
const resolvedSkillId = await resolveSkillIdFromToolName(toolName);
const skill = await getSkill(resolvedSkillId.id, resolvedSkillId.isGlobal);

// 用户确认
const userApproved = await createToolConfirmPromise(
  `skill: ${skill.metadata.name}`,
  { skillId: resolvedSkillId.id, input: args.input }
);

// 加载详细指令
const instructions = await getSkillInstructionsAsync(resolvedSkillId);
result = `${instructions}\n\n## 用户输入\n${userInput}`;
```

**⚠️ 当前状态**：由于回档，Skill 相关函数返回 `null`，此分支实际不可用。

#### 分支 B：需要确认的工具 (`shouldAskForTool(toolName) = true`)

```typescript
const needsConfirm = shouldAskForTool(toolName);
if (needsConfirm) {
  const userApproved = await createToolConfirmPromise(toolName, args);
  if (!userApproved) {
    result = `用户拒绝执行此工具。请尝试其他方式或直接回答用户的问题。`;
  }
}
```

**工具状态**（`tool-store.ts`）：
- `auto` - 自动执行，无需确认
- `ask` - 每次执行前询问用户
- `disabled` - 禁用，不加载到工具列表

#### 分支 C：普通工具（自动执行）

```typescript
// 区分 Todoist 工具和普通工具
const toolExecutor = isTodoistTool(toolName)
  ? executeTodoistTool(toolName, args)
  : executeTool(toolName, args);

// 60秒超时保护
result = await Promise.race([
  toolExecutor,
  timeoutPromise
]);
```

### 3.4 工具执行实现 (`executeTool` 函数)

```typescript
// ai-tools.ts 行 1691+
export async function executeTool(toolName: string, args: any): Promise<string> {
  if (toolName === "searchBlocksByTag") {
    // 调用 search-service.ts
    const results = await searchBlocksByTag(tagQuery, limit);
    return formatBlockResult(results);
  }
  else if (toolName === "webSearch") {
    // 调用 web-search-service.ts
    const response = await searchWithFallback(query, instances, maxResults);
    return formatSearchResults(response);
  }
  else if (toolName === "createBlock") {
    // 调用 Orca API
    const newBlock = await orca.invokeBackend("create-block", {...});
    return JSON.stringify({ success: true, blockId: newBlock.id });
  }
  // ... 其他工具实现
}
```

---

## 4. 工具结果处理

### 4.1 结果消息格式

```typescript
toolResultMessages.push({
  id: nowId(),
  role: "tool",
  content: result,          // 工具执行结果
  tool_call_id: toolCall.id, // 关联到 Tool Call
  name: toolName,
  createdAt: Date.now(),
});
```

### 4.2 特殊结果处理

**日记导出** (直接渲染，跳过 AI 处理)：
```typescript
if (result.includes("```journal-export")) {
  // 直接显示结果，不再调用 AI
  setMessages((prev) => [...prev, ...toolResultMessages]);
  break; // 结束工具循环
}
```

### 4.3 搜索结果聚合

```typescript
// 从工具结果中提取搜索结果
const captureSearchResults = (toolMessages: Message[]) => {
  const toolMap = new Map<string, { content: string; name: string }>();
  toolMessages.forEach((m) => {
    if (m.tool_call_id) {
      toolMap.set(m.tool_call_id, { content: m.content, name: m.name });
    }
  });
  const results = extractSearchResultsFromToolResults(toolMap);
  mergeSearchResults(results);
};
```

**用途**：联网搜索结果会被提取并显示在消息的"来源"部分。

---

## 5. 多轮工具调用（Tool Loop）

### 5.1 循环条件

```typescript
while (roundCount < MAX_ROUNDS) {
  // 1. 发送带工具结果的消息给 AI
  // 2. AI 返回新的 Tool Calls 或最终回复
  // 3. 执行新的 Tool Calls
  // 4. 继续循环或结束
}
```

**循环终止条件**：
- AI 不再返回 Tool Calls
- 达到最大轮数 (`MAX_ROUNDS = 5`)
- 用户拒绝工具执行
- 遇到直接渲染的结果（如日记导出）

### 5.2 工具链示例

```
用户: "搜索关于AI的笔记，并总结第一条"
  ↓
Round 1: searchBlocksByText("AI") → 返回3条笔记
  ↓
Round 2: getBlocksText(blockId: 12345) → 返回详细内容
  ↓
AI 总结内容并返回最终回复
```

---

## 6. Agentic RAG 模式（深度检索）

### 6.1 触发条件

```typescript
if (isAgenticRAGEnabled() && includeTools && !hasHighPriorityContext) {
  // 启用 Agentic RAG
}
```

### 6.2 工作流程

```
用户查询
  ↓
RAG 规划器（LLM）生成检索计划
  ↓
多轮迭代执行检索工具（笔记搜索 + 联网搜索）
  ↓
反思评估（可选）：结果是否充分？
  ↓
最终答案生成
```

**配置**：
- `maxIterations`: 最大迭代次数（默认 5）
- `enableReflection`: 是否启用反思机制（默认 true）

---

## 7. 工具状态管理 (`tool-store.ts`)

### 7.1 工具开关

```typescript
// 全局开关
toolStore.webSearchEnabled      // 联网搜索
toolStore.imageSearchEnabled    // 图片搜索
toolStore.wikipediaEnabled      // Wikipedia
toolStore.currencyEnabled       // 汇率查询
toolStore.scriptAnalysisEnabled // 脚本分析
toolStore.agenticRAGEnabled     // Agentic RAG

// 工具级别状态
toolStore.toolStatus = {
  "searchNotes": "auto",     // 自动执行
  "createBlock": "ask",      // 询问确认
  "webSearch": "disabled",   // 禁用
}
```

### 7.2 工具分类

```typescript
TOOL_CATEGORIES = [
  { name: "search", label: "搜索", tools: ["searchNotes", "queryByTagProperty", ...] },
  { name: "read",   label: "读取", tools: ["getPage", "getBlocksText", ...] },
  { name: "journal", label: "日记", tools: ["getTodayJournal", ...] },
  { name: "write",  label: "写入", tools: ["createBlock", "createPage", ...] },
  { name: "other",  label: "其他", tools: ["getSavedAiConversations"] },
]
```

---

## 8. 已知限制与兼容性问题

### 8.1 Skill 工具（已禁用）

由于回档到旧版本，以下函数返回空值：
- `getSkillToolsAsync()` → 返回 `[]`
- `getSkillInstructionsAsync()` → 返回 `null`
- `resolveSkillIdFromToolName()` → 返回 `null`

**影响**：
- `AiChatPanel.tsx` 中的 Skill 工具调用分支不可用
- 不会加载任何 Skill 工具

### 8.2 智能工具检测（已降级）

- `detectToolCategories()` → 始终返回所有类别
- `getToolsByCategories()` → 等同于 `getTools()`

**影响**：
- 所有对话都会加载全部工具（性能略有下降）
- 失去智能工具过滤能力

### 8.3 Tool-Prompt 系统（已移除）

- ✅ 已移除 `tool-prompt-loader.ts` 和 `tool-prompt-defaults.ts`
- ✅ 已从 `main.ts` 中移除 `initToolPrompts()` 调用

**原因**：
- Tool-Prompt 系统存在但未被实际使用
- 工具说明直接硬编码在 `ai-tools.ts` 中
- 移除以避免混淆和不必要的文件操作

---

## 9. 调试要点

### 9.1 工具加载日志

```typescript
console.log(`[AiChatPanel] 智能工具加载: ${filteredTools.length} 个工具`);
```

### 9.2 工具执行日志

查看浏览器控制台：
- JSON 修复警告：`[Tool Call] Repaired malformed JSON`
- 工具超时错误：`Tool execution timed out after 60s`

### 9.3 常见问题

**问题 1**：工具未被调用
- 检查 `modelSupportsTools()` - 模型是否支持 Function Calling
- 检查 `isToolDisabled()` - 工具是否被禁用

**问题 2**：工具执行失败
- 检查参数解析：JSON 格式是否正确
- 检查权限：用户是否拒绝执行（`shouldAskForTool`）

**问题 3**：无限循环
- 检查 `MAX_ROUNDS` 限制
- 检查工具返回结果是否有效（避免 AI 重复调用）

---

## 10. 文件关系图

```
AiChatPanel.tsx (用户交互)
     ↓
ai-tools.ts (工具定义与执行)
     ↓
┌────────────────────────────────────┐
│ search-service.ts (笔记搜索)        │
│ web-search-service.ts (联网搜索)    │
│ script-analysis-tool.ts (脚本分析)  │
│ todoist-tools.ts (Todoist 工具)    │
│ utility-tools.ts (百科/汇率)        │
└────────────────────────────────────┘
     ↓
Orca API / 外部服务
```

---

## 总结

当前系统工具调用流程：

1. **用户输入** → 检测场景（是否有拖入块）
2. **工具加载** → 根据场景和开关加载工具列表
3. **发送请求** → 带工具定义调用 OpenAI API
4. **接收响应** → 解析 Tool Calls
5. **执行工具** → 检查权限 → 执行 → 返回结果
6. **多轮迭代** → 继续调用 AI 直到得到最终答案
7. **显示结果** → 渲染消息 + 来源引用

**核心特点**：
- 动态工具加载（根据场景和开关）
- 权限控制（auto/ask/disabled）
- JSON 自动修复（提高容错性）
- 多轮工具调用（Tool Loop）
- 搜索结果聚合（联网搜索）
