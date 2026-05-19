# Plugin API 模块

## 这是什么？

简单说：**让你的其他插件可以"调用 AI"**。

正常情况下，用户需要打开 AI Chat 面板，手动输入问题，等待回复。但有了这个 API，你的插件代码可以直接发消息给 AI，拿到回复，然后做任何你想做的事。

## 最简单的例子

```typescript
// 一行代码调用 AI
const result = await window.AiChatPluginAPI.sendMessage('你好');
console.log(result.content); // "你好！有什么可以帮你的吗？"
```

就这么简单。

## 三种使用方式

### 方式一：问一句，等回答（最常用）

```typescript
const result = await window.AiChatPluginAPI.sendMessage('总结我今天的日记');

if (result.success) {
  // 成功了，拿到回复
  console.log(result.content);
} else {
  // 失败了，看看什么错误
  console.log(result.error);
}
```

**适合场景**：一问一答，不需要实时显示

### 方式二：边生成边显示（流式）

```typescript
for await (const chunk of window.AiChatPluginAPI.streamMessage('写一首诗')) {
  if (chunk.type === 'content') {
    // 每收到一点内容就显示出来
    myTextArea.value += chunk.content;
  }
}
```

**适合场景**：需要实时显示 AI 正在打字的效果

### 方式三：直接调工具，不问 AI

```typescript
// 直接搜索笔记，不需要 AI 理解你的意图
const result = await window.AiChatPluginAPI.executeTool('searchBlocksByTag', {
  tag_query: '#TODO'
});
```

**适合场景**：你明确知道要做什么，不需要 AI 判断

## 实际应用举例

### 例子 1：右键菜单"AI 解释"

用户选中一段文字，右键点击"AI 解释"，弹窗显示解释。

```typescript
// 注册右键菜单
orca.registerContextMenu({
  label: 'AI 解释',
  async onClick() {
    // 1. 获取选中的文字
    const selectedText = window.getSelection().toString();
    
    // 2. 问 AI
    const result = await window.AiChatPluginAPI.sendMessage(
      `用简单的话解释这段内容：${selectedText}`
    );
    
    // 3. 显示结果
    if (result.success) {
      alert(result.content);
    }
  }
});
```

### 例子 2：自动生成每日总结

每天晚上自动总结今天的日记，写入"每日总结"页面。

```typescript
async function generateDailySummary() {
  // 1. 让 AI 总结今天的日记（AI 会自动调用 getTodayJournal 工具）
  const result = await window.AiChatPluginAPI.sendMessage(
    '总结我今天的日记，提取关键事项和心情'
  );
  
  if (!result.success) {
    console.error('生成失败:', result.error);
    return;
  }
  
  // 2. 把总结写入笔记
  await window.AiChatPluginAPI.executeTool('createBlock', {
    pageName: '每日总结',
    content: `## ${new Date().toLocaleDateString()}\n\n${result.content}`
  });
  
  console.log('每日总结已生成！');
}
```

### 例子 3：批量给笔记打标签

找出所有没有标签的笔记，让 AI 分析内容并建议标签。

```typescript
async function suggestTags(noteContent) {
  const result = await window.AiChatPluginAPI.sendMessage(
    `分析这条笔记应该打什么标签，只回复标签名，用逗号分隔：\n\n${noteContent}`,
    { enableTools: false }  // 不需要工具，纯对话
  );
  
  if (result.success) {
    return result.content.split(',').map(t => t.trim());
  }
  return [];
}

// 使用
const tags = await suggestTags('今天学习了 React Hooks，感觉 useEffect 很有用');
console.log(tags); // ['学习', 'React', '编程']
```

### 例子 4：实时翻译输入框

用户输入中文，实时翻译成英文显示。

```typescript
async function translateRealtime(inputEl, outputEl) {
  outputEl.value = ''; // 清空输出
  
  for await (const chunk of window.AiChatPluginAPI.streamMessage(
    `翻译成英文：${inputEl.value}`,
    { enableTools: false }
  )) {
    if (chunk.type === 'content') {
      outputEl.value += chunk.content; // 实时显示翻译结果
    }
  }
}
```

### 例子 5：多轮对话（记住上下文）

```typescript
// 保存对话历史
let chatHistory = [];

async function chat(message) {
  const result = await window.AiChatPluginAPI.sendMessage(message, {
    history: chatHistory  // 传入历史记录
  });
  
  if (result.success) {
    // 更新历史记录，下次对话会记住
    chatHistory = result.conversation;
    return result.content;
  }
  return null;
}

// 使用
await chat('我叫小明');           // "你好小明！"
await chat('我叫什么名字？');      // "你叫小明。" （AI 记住了）
```

### 例子 6：取消正在进行的请求

```typescript
const controller = new AbortController();

// 开始请求
const promise = window.AiChatPluginAPI.sendMessage('写一篇很长的文章', {
  signal: controller.signal
});

// 用户点击取消按钮
cancelButton.onclick = () => {
  controller.abort();
};

const result = await promise;
if (!result.success && result.error === 'Request aborted') {
  console.log('用户取消了请求');
}
```

## 返回值说明

### sendMessage 返回值

```typescript
{
  success: true,              // 是否成功
  content: "AI 的回复内容",    // 主要内容
  reasoning: "思考过程...",    // 有些模型会返回思考过程
  toolCalls: [...],           // AI 调用了哪些工具
  toolResults: [              // 工具执行结果
    { name: "searchBlocksByTag", result: "找到 5 条笔记..." }
  ],
  conversation: [...]         // 完整对话历史（用于多轮对话）
}
```

### streamMessage 的 chunk 类型

```typescript
// 正在输出内容
{ type: 'content', content: '你' }
{ type: 'content', content: '好' }

// 正在思考（部分模型支持）
{ type: 'reasoning', reasoning: '用户在打招呼...' }

// 正在调用工具
{ type: 'tool_call', name: 'searchBlocksByTag', args: { tag_query: '#TODO' } }

// 工具返回结果
{ type: 'tool_result', name: 'searchBlocksByTag', result: '找到 3 条...' }

// 全部完成
{ type: 'done', result: { success: true, content: '...', ... } }
```

## 配置选项一览

```typescript
await window.AiChatPluginAPI.sendMessage('你好', {
  // 使用哪个模型（不传就用默认的）
  model: 'gpt-4',
  
  // 自定义系统提示词
  systemPrompt: '你是一个翻译助手，只做翻译，不解释',
  
  // 是否让 AI 使用工具（搜索笔记等）
  enableTools: true,
  
  // 温度（0-2，越高越随机）
  temperature: 0.7,
  
  // 最大回复长度
  maxTokens: 2000,
  
  // 对话历史（多轮对话用）
  history: previousMessages,
  
  // 额外上下文（会注入到提示词）
  contextText: '当前用户正在编辑的内容：...',
  
  // 超时时间（毫秒）
  timeoutMs: 60000,
  
  // 最多调用几轮工具
  maxToolRounds: 5,
  
  // 取消信号
  signal: abortController.signal
});
```

## 可用工具速查

| 工具名 | 干什么用 | 示例参数 |
|--------|----------|----------|
| `searchBlocksByTag` | 按标签搜索 | `{ tag_query: '#TODO' }` |
| `searchBlocksByText` | 全文搜索 | `{ query: '会议' }` |
| `getTodayJournal` | 获取今天日记 | `{}` |
| `getRecentJournals` | 获取最近几天日记 | `{ days: 7 }` |
| `getPage` | 读取某个页面 | `{ pageName: '项目计划' }` |
| `getBlock` | 读取某个块 | `{ blockId: 12345 }` |
| `createBlock` | 创建新笔记 | `{ pageName: '收件箱', content: '...' }` |
| `insertTag` | 给块加标签 | `{ blockId: 123, tagName: 'TODO' }` |

完整列表见 `src/services/ai-tools.ts`。

## 技能层（Skills）

- 技能作为 `skill_` 前缀工具提供给模型，执行前会弹出确认。
- 技能文件存储在插件目录的 `Skills/<技能名称>/skills.md`，并可包含 `Script/` 与 `Data/` 资源。
- 技能支持导入/导出 `.zip`，结构需保持 `Skills/<技能名称>/...`。
- 若宿主不提供 `plugin-fs-*`，技能会改用 `orca.plugins.setData/getData` 持久化，仅保存 `skills.md`，`Script/` 与 `Data/` 不落库。

## 新增后端 API（插件目录读写）

以下 API 由宿主提供，用于读写插件目录中的技能文件：

| 消息类型 | 说明 | 参数示例 |
| --- | --- | --- |
| `plugin-fs-list-dir` | 列出目录 | `{ pluginName, path }` |
| `plugin-fs-read-text` | 读取文本文件 | `{ pluginName, path }` |
| `plugin-fs-read-binary` | 读取二进制文件 | `{ pluginName, path }` |
| `plugin-fs-write-text` | 写入文本文件 | `{ pluginName, path, content }` |
| `plugin-fs-write-binary` | 写入二进制文件 | `{ pluginName, path, base64 }` |
| `plugin-fs-mkdirs` | 创建目录 | `{ pluginName, path }` |
| `plugin-fs-exists` | 判断存在 | `{ pluginName, path }` |
## 常见问题

### Q: 为什么返回 success: false？

检查 `result.error`，常见原因：
- API Key 没配置
- 网络问题
- 模型不可用

### Q: 工具没有被调用？

确保 `enableTools: true`（默认就是 true），并且你的问题需要用到工具。比如问"你好"不会触发工具，问"搜索我的 TODO"才会。

### Q: 怎么知道 AI 调用了什么工具？

```typescript
const result = await api.sendMessage('搜索我的 TODO');
console.log(result.toolResults); // [{ name: 'searchBlocksByTag', result: '...' }]
```

### Q: 流式模式下怎么知道完成了？

```typescript
for await (const chunk of api.streamMessage('...')) {
  if (chunk.type === 'done') {
    console.log('完成！', chunk.result);
  }
}
```

## 文件位置

- 源码：`src/services/plugin-api.ts`
- 入口注册：`src/main.ts`
