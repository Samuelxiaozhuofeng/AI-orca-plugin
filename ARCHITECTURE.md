# Orca AI Chat Plugin - 完整架构与功能说明

## 📋 目录

- [项目概述](#项目概述)
- [技术栈](#技术栈)
- [项目结构](#项目结构)
- [核心架构](#核心架构)
- [功能模块](#功能模块)
- [服务层详解](#服务层详解)
- [状态管理](#状态管理)
- [UI组件](#ui组件)
- [工具系统](#工具系统)
- [技能系统](#技能系统)
- [文件处理](#文件处理)
- [多模型支持](#多模型支持)
- [记忆管理](#记忆管理)
- [数据流](#数据流)
- [开发指南](#开发指南)

---

## 项目概述

**Orca AI Chat Plugin** 是 Orca Note（块级笔记应用）的 AI 聊天增强插件，提供类似 ChatGPT 的智能对话体验。

### 核心特性

- 🤖 **多模型支持** - OpenAI、Anthropic Claude、Google Gemini、本地 Ollama 等
- 🔧 **丰富的 AI 工具** - 23+ 内置工具，支持搜索、创建、更新笔记
- 🎯 **技能系统** - 用户自定义可复用的 AI 行为模式
- 💾 **会话管理** - 支持分支、收藏、导出、历史记录
- 🧠 **记忆系统** - 用户画像生成、长期记忆管理
- 📁 **多文件支持** - PDF、Word、Excel、图片、视频处理
- 🌐 **联网搜索** - 集成 Web 搜索、Wikipedia、货币转换
- 🔄 **流式输出** - SSE 实时流式响应
- 🎨 **Markdown 增强** - 支持代码高亮、表格、图表

---

## 技术栈

### 核心技术

- **TypeScript** - 类型安全的开发语言
- **React 18** - UI 框架（通过 `window.React` 访问）
- **Vite** - 构建工具和开发服务器
- **Valtio** - 响应式状态管理

### 第三方库

| 库 | 用途 |
|---|---|
| `d3-force` | 力导向图可视化（知识图谱） |
| `xlsx` | Excel 文件解析 |
| `mammoth` | Word 文档解析 |
| `unpdf` | PDF 文件解析 |

### API 集成

- OpenAI / Azure OpenAI
- Anthropic Claude
- Google Gemini
- 其他 OpenAI 兼容服务（Ollama、LM Studio 等）

---

## 项目结构

```
AI-orca-plugin/
├── src/                          # 源代码目录
│   ├── main.ts                   # 插件入口点
│   ├── orca.d.ts                 # Orca API 类型定义
│   │
│   ├── ui/                       # UI 注册和协调
│   │   ├── ai-chat-ui.ts         # 面板/侧边工具注册
│   │   ├── ai-chat-renderer.ts   # 自定义块渲染器
│   │   └── ai-chat-context-menu.ts # 右键菜单
│   │
│   ├── views/                    # React 视图组件
│   │   ├── AiChatPanel.tsx       # 主聊天面板
│   │   ├── AiChatSidetool.tsx    # 侧边栏工具
│   │   ├── ChatInput.tsx         # 聊天输入框
│   │   ├── MessageItem.tsx       # 消息项渲染
│   │   ├── ContextPicker.tsx     # 上下文选择器
│   │   ├── MemoryManager.tsx     # 记忆管理界面
│   │   ├── SkillManagerModal.tsx # 技能管理器
│   │   └── ...                   # 其他 UI 组件
│   │
│   ├── components/               # 可复用组件
│   │   ├── MarkdownMessage.tsx   # Markdown 渲染
│   │   ├── LocalGraph.tsx        # 知识图谱
│   │   ├── MultiModelResponse.tsx # 多模型响应
│   │   └── ...
│   │
│   ├── services/                 # 业务逻辑层
│   │   ├── openai-client.ts      # OpenAI API 客户端
│   │   ├── chat-stream-handler.ts # 流式响应处理
│   │   ├── ai-tools.ts           # AI 工具定义
│   │   ├── search-service.ts     # 搜索服务
│   │   ├── session-service.ts    # 会话管理
│   │   ├── memory-extraction.ts  # 记忆提取
│   │   ├── skills-manager.ts     # 技能管理
│   │   ├── file-service.ts       # 文件处理
│   │   └── ...                   # 40+ 服务文件
│   │
│   ├── store/                    # 状态管理（Valtio）
│   │   ├── context-store.ts      # 上下文状态
│   │   ├── session-store.ts      # 会话状态
│   │   ├── memory-store.ts       # 记忆状态
│   │   ├── tool-store.ts         # 工具状态
│   │   ├── ui-store.ts           # UI 状态
│   │   └── ...
│   │
│   ├── settings/                 # 设置和配置
│   │   └── ai-chat-settings.ts   # 设置模式定义
│   │
│   ├── utils/                    # 工具函数
│   │   ├── query-builder.ts      # 查询构建器
│   │   ├── markdown-renderer.ts  # Markdown 解析
│   │   ├── token-utils.ts        # Token 计算
│   │   └── ...
│   │
│   ├── styles/                   # 样式定义
│   │   ├── ai-chat-styles.ts     # 主样式
│   │   └── chat-animations.ts    # 动画效果
│   │
│   └── types/                    # 类型定义
│       └── index.ts
│
├── dist/                         # 构建输出目录
├── scripts/                      # 构建脚本
├── tests/                        # 测试文件
├── docs/                         # 文档目录
├── module-docs/                  # 模块文档
└── plugin-docs/                  # 插件文档
```

---

## 核心架构

### 插件生命周期

```typescript
// src/main.ts

export async function load(pluginName: string) {
  // 1. 注册设置模式
  await registerAiChatSettingsSchema(pluginName);
  
  // 2. 初始化设置
  await initAiChatSettings(pluginName);
  
  // 3. 注册 UI（面板、侧边工具、上下文菜单）
  registerAiChatUI(pluginName);
  registerAiChatRenderer();
  
  // 4. 加载记忆存储
  await loadMemoryStore();
  
  // 5. 加载视觉模型配置
  await loadVisionModelConfig(pluginName);
  
  // 6. 初始化内置技能
  await ensureBuiltInSkills();
  
  // 7. 初始化命令目录
  await initCommands();
  
  // 8. 挂载 Plugin API
  (window as any).AiChatPluginAPI = AiChatPluginAPI;
}

export async function unload() {
  // 清理 UI 注册
  unregisterAiChatUI();
  unregisterAiChatRenderer();
}
```

### Orca API 集成

插件通过全局 `orca` 对象与 Orca Note 交互：

```typescript
// 状态访问
orca.state.blocks[blockId]        // 获取块数据
orca.state.repoDir                // 仓库目录

// 后端调用
await orca.invokeBackend("get-block-tree", blockId)
await orca.invokeBackend("search-blocks-by-text", query)
await orca.invokeBackend("query", queryDescription)

// 导航
orca.nav.openInLastPanel("block", { blockId })
orca.nav.close(panelId)

// UI 组件
const { Button, Input } = orca.components

// 通知
orca.notify("success", "操作成功")
```

### React 使用模式

插件不打包 React，而是使用 Orca 提供的全局 React：

```typescript
const React = window.React as any;
const { createElement, useState, useEffect } = React;
const { useSnapshot } = (window as any).Valtio;

// 创建组件
export default function MyComponent({ prop }: Props) {
  const [state, setState] = useState(0);
  
  return createElement("div", null, 
    createElement("h1", null, "Hello")
  );
}
```

---

## 功能模块

### 1. 聊天面板（AiChatPanel）

主聊天界面，支持：

- **流式对话** - SSE 实时响应
- **多轮对话** - 保持上下文连续性
- **工具调用** - AI 自动调用 23+ 工具
- **文件上传** - 支持图片、PDF、Word、Excel、视频
- **分支管理** - 对话分支切换
- **建议回复** - 智能生成建议
- **代码执行** - Python/JavaScript 代码解释器

**核心流程**：

```
用户输入 → 构建上下文 → 发送 API → 流式接收 
→ 工具调用处理 → 更新 UI → 保存会话
```

### 2. 上下文管理

**选择机制**：
- 块选择（单个/多个）
- 页面选择（包含所有子块）
- 标签选择（所有带该标签的块）
- 拖拽添加

**上下文构建**：
```typescript
// src/services/context-builder.ts
export async function buildContextForSend(
  refs: ContextRef[],
  options?: BuildOptions
): Promise<string>
```

**压缩策略**：
- 自动识别需要压缩的长上下文
- 使用 AI 进行语义压缩
- 保留关键信息

### 3. 会话管理

**功能**：
- 自动保存对话
- 会话列表（按时间/收藏）
- 分支管理
- 导出（Markdown/JSON/Journal）
- 搜索和过滤

**存储**：
```typescript
// 保存到 Orca Note 块
#saved-ai-chat-session {session_id}
  - title: 会话标题
  - created: 时间戳
  - messages: [...] (压缩存储)
```

### 4. 记忆系统

**用户画像**：
- 自动从对话中提取用户信息
- 生成标签（兴趣、技能、偏好）
- 分类整理（工作、生活、学习等）

**记忆提取流程**：
```
对话内容 → AI 分析 → 提取关键信息 
→ 生成画像 → 持久化存储 → 后续对话使用
```

### 5. 技能系统

**技能类型**：

1. **Prompt 型** - 追加系统提示词
   ```
   #skill 翻译助手
     - 类型: prompt
     - 提示词: 你是专业翻译助手...
     - 变量: 目标语言
   ```

2. **Tools 型** - 限制可用工具
   ```
   #skill 任务管理
     - 类型: tools
     - 工具: searchTasks, createBlock
     - 提示词: 专注任务管理...
   ```

**使用方式**：
- 输入 `/` 触发技能选择器
- 选择后显示为芯片
- 点击 X 取消激活

### 6. 工具系统

**内置工具（23个）**：

| 类别 | 工具 |
|---|---|
| 搜索 | searchNotes, searchBlocksByTag, searchBlocksByReference, queryBlocks |
| 读取 | getBlockLinks, getBlockMeta, getBlocksText, getPage |
| 日记 | getTodayJournal, getJournalByDate, getJournals |
| 写入 | createBlock, createPage, insertTag, updateTagProperties |
| 查询 | queryByTagProperty, getTagsAndPages, getPageByName |
| 联网 | webSearch, imageSearch, wikipedia, currency |
| 其他 | fetchUrl, getSavedAiConversations, batchInsertTags |

**工具状态**：
- `auto` - 自动执行（搜索等安全操作）
- `ask` - 询问用户（写入等敏感操作）
- `disabled` - 临时禁用

**动态工具**：
- **Skills** - 用户自定义技能工具
- **Todoist** - 任务管理（6个工具）
- **Code Interpreter** - 代码执行

### 7. 多模型支持

**支持的提供商**：
- OpenAI (GPT-4, GPT-4 Turbo, GPT-4o, o1, o3)
- Anthropic (Claude 3.5 Sonnet, Claude 3 Opus)
- Google (Gemini Pro, Gemini Flash)
- Azure OpenAI
- 自定义 OpenAI 兼容服务

**多模型对比**：
- 同时向多个模型发送请求
- 并行显示响应
- 对比不同模型的回答质量

### 8. 文件处理

**支持的文件类型**：

| 类型 | 格式 | 处理方式 |
|---|---|---|
| 图片 | PNG, JPEG, GIF, WebP, AVIF | 转 base64，支持动图帧切割 |
| 视频 | MP4, WebM, MOV | 抽帧 + 音频识别 |
| 文档 | PDF, Word, Excel | 提取文本内容 |
| 代码 | JS, TS, Python, 等 | 直接读取 |
| 数据 | JSON, CSV | 解析结构化数据 |

**处理流程**：
```
文件上传 → 类型检测 → 格式转换 
→ 内容提取 → 发送给 AI
```

---

## 服务层详解

### 核心服务

#### openai-client.ts
OpenAI API 客户端，支持：
- SSE 流式响应
- 工具调用（function calling）
- 多模态输入（图片、视频）
- 错误重试和处理

#### chat-stream-handler.ts
流式聊天处理器：
- 解析 SSE 流
- 处理工具调用（JSON/XML 格式）
- 增量更新 UI
- 错误恢复

#### ai-tools.ts
工具定义和执行：
- 23+ 工具定义（OpenAI Tool 格式）
- 工具参数验证
- 工具执行逻辑
- 结果格式化

#### search-service.ts
搜索服务：
- 文本搜索（全文索引）
- 标签搜索
- 属性过滤
- 高级查询（AND/OR 组合）
- 重排序（reranking）

#### session-service.ts
会话持久化：
- 会话创建和更新
- 自动压缩大会话
- 会话列表管理
- 导出功能

#### memory-extraction.ts
记忆提取：
- 从对话提取关键信息
- 识别用户特征
- 生成结构化数据

#### portrait-generation.ts
用户画像生成：
- 标签生成（兴趣、技能）
- 分类整理（工作、生活）
- 增量更新

#### skills-manager.ts
技能管理：
- 扫描 `#skill` 标签块
- 解析技能定义
- 验证技能配置
- 提供技能列表

#### file-service.ts
文件处理：
- 文件类型检测
- 文件上传
- 内容提取
- 格式转换

#### document-parser.ts
文档解析：
- PDF 文本提取（unpdf）
- Word 解析（mammoth）
- Excel 解析（xlsx）

#### video-service.ts
视频处理：
- 视频抽帧
- 缩略图生成
- 音频识别（如果支持）

### 辅助服务

- **context-builder.ts** - 上下文文本构建
- **message-builder.ts** - OpenAI 消息格式构建
- **query-builder.ts** - 查询 DSL 构建
- **citation-service.ts** - 引用管理
- **export-service.ts** - 会话导出
- **suggestion-service.ts** - 建议回复生成
- **branch-service.ts** - 会话分支管理
- **reranking-service.ts** - 搜索结果重排序
- **web-search-service.ts** - 网页搜索
- **utility-tools.ts** - Wikipedia、货币转换等
- **todoist-service.ts** - Todoist 集成

---

## 状态管理

使用 **Valtio** 进行响应式状态管理：

### contextStore
```typescript
{
  contextRefs: ContextRef[],      // 选中的上下文项
  contextPreview: string,          // 预览文本
  draggedItems: any[],             // 拖拽项
}
```

### sessionStore
```typescript
{
  messages: Message[],             // 当前会话消息
  sessionId: string,               // 会话 ID
  branches: Branch[],              // 分支列表
  activeBranchId: string,          // 激活分支
}
```

### memoryStore
```typescript
{
  users: Map<userId, UserInfo>,
  activeUserId: string,
  memories: Memory[],
  portrait: UserPortrait,
}
```

### toolStore
```typescript
{
  toolStatus: Map<toolName, Status>,
  webSearchEnabled: boolean,
  agenticRAGEnabled: boolean,
  // ...其他工具开关
}
```

### uiStore
```typescript
{
  panelId: string,                 // 面板 ID
  lastRootBlockId: number,         // 最后访问的块 ID
  isStreaming: boolean,            // 是否正在流式输出
}
```

---

## UI组件

### 主要组件

#### AiChatPanel.tsx
主聊天面板，包含：
- 消息列表
- 输入框
- 上下文选择器
- 设置面板
- 会话历史

#### ChatInput.tsx
智能输入框：
- 多行输入
- 文件拖拽上传
- 技能触发（/）
- 快捷键支持

#### MessageItem.tsx
消息项渲染：
- Markdown 渲染
- 代码高亮
- 工具调用显示
- 引用标注
- 操作按钮（复制、重试、分支）

#### MarkdownMessage.tsx
增强的 Markdown 渲染：
- 代码块（带复制按钮）
- 表格
- 任务列表
- 时间线
- 对比视图
- 图片画廊
- 知识图谱（`[GRAPH:blockId]`）

#### LocalGraph.tsx
知识图谱可视化：
- 力导向布局（d3-force）
- 节点拖拽
- 缩放和平移
- 链接关系展示

#### MemoryManager.tsx
记忆管理界面：
- 用户列表
- 记忆卡片
- 画像展示
- 标签管理
- 分类编辑

#### SkillManagerModal.tsx
技能管理器：
- 技能列表
- 创建/编辑
- 启用/禁用
- 导入/导出

---

## 工具系统

### 工具定义格式

```typescript
const TOOL: OpenAITool = {
  type: "function",
  function: {
    name: "toolName",
    description: "工具描述...",
    parameters: {
      type: "object",
      properties: {
        param1: {
          type: "string",
          description: "参数描述"
        }
      },
      required: ["param1"]
    }
  }
}
```

### 工具执行流程

```
AI 决定调用工具 → 解析工具调用
→ 检查工具状态（auto/ask/disabled）
→ 执行工具（如需询问则弹窗）
→ 格式化结果 → 返回给 AI
→ AI 生成最终回复
```

### 工具分类

**搜索类**：
- `searchNotes` - 全文搜索
- `searchBlocksByTag` - 标签搜索
- `searchBlocksByReference` - 引用搜索
- `queryBlocks` - 高级查询

**读取类**：
- `getBlockLinks` - 获取块的链接
- `getBlockMeta` - 获取块元数据
- `getBlocksText` - 批量获取块文本
- `getPage` - 获取页面内容

**日记类**：
- `getTodayJournal` - 今日日记
- `getJournalByDate` - 指定日期
- `getJournals` - 日期范围

**写入类**：
- `createBlock` - 创建块
- `createPage` - 创建页面
- `insertTag` - 插入标签
- `updateTagProperties` - 更新标签属性

**联网类**：
- `webSearch` - 网页搜索
- `imageSearch` - 图片搜索
- `wikipedia` - Wikipedia 查询
- `currency` - 货币转换

---

## 技能系统

### 技能定义

技能存储为带 `#skill` 标签的块：

```
#skill 翻译助手
  - 类型: prompt
  - 描述: 专业翻译助手
  - 提示词: 你是一位专业翻译，请将内容翻译为{目标语言}
  - 变量: 目标语言
```

### 技能解析

```typescript
// src/services/skills-manager.ts
export async function loadSkills(): Promise<Skill[]> {
  // 1. 搜索 #skill 标签
  const results = await searchBlocksByTag("skill");
  
  // 2. 解析每个技能块
  const skills = results.map(parseSkillBlock);
  
  // 3. 验证技能配置
  return skills.filter(validateSkill);
}
```

### 技能应用

**Prompt 型**：
```typescript
// 追加到系统提示词
systemPrompt += `\n\n${skill.prompt}`;
```

**Tools 型**：
```typescript
// 过滤工具列表
const allowedTools = allTools.filter(
  tool => skill.tools.includes(tool.function.name)
);
```

---

## 文件处理

### 处理流程

```
文件选择/拖拽 → 文件验证（类型、大小）
→ 上传到 Orca assets → 获取文件路径
→ 类型检测 → 内容提取 → 附加到消息
```

### 文件类型处理

**图片**：
```typescript
// 转为 base64
const base64 = await imageToBase64(fileRef);
return {
  type: "image_url",
  image_url: { url: `data:image/jpeg;base64,${base64}` }
};
```

**视频**：
```typescript
// 抽帧（多张图片）
const frames = await extractVideoFrames(videoFile);
return frames.map(frame => ({
  type: "image_url",
  image_url: { url: frame }
}));
```

**文档**：
```typescript
// 提取文本
const text = await parseDocument(arrayBuffer, fileName, mimeType);
return {
  type: "text",
  text: `[文件: ${fileName}]\n${text}`
};
```

---

## 多模型支持

### 提供商配置

```typescript
// src/settings/ai-chat-settings.ts
type Provider = 
  | "openai"
  | "anthropic"
  | "google"
  | "azure"
  | "custom";

interface ModelConfig {
  provider: Provider;
  apiKey: string;
  baseURL?: string;
  model: string;
}
```

### 多模型对比

```typescript
// src/services/multi-model-service.ts
export async function streamMultiModelChat(
  models: ModelConfig[],
  messages: Message[]
) {
  // 并行发送请求
  const streams = models.map(config => 
    streamChat(config, messages)
  );
  
  // 实时更新各模型响应
  for await (const update of mergeStreams(streams)) {
    updateModelResponse(update.modelId, update.content);
  }
}
```

---

## 记忆管理

### 记忆提取

```typescript
// src/services/memory-extraction.ts
export async function extractMemory(
  messages: Message[]
): Promise<Memory[]> {
  // 1. 识别对话中的用户信息
  const userInfo = await analyzeConversation(messages);
  
  // 2. 提取关键事实
  const facts = extractFacts(userInfo);
  
  // 3. 生成记忆对象
  return facts.map(fact => ({
    id: generateId(),
    type: fact.type,
    content: fact.content,
    timestamp: Date.now(),
    confidence: fact.confidence
  }));
}
```

### 用户画像生成

```typescript
// src/services/portrait-generation.ts
export async function generatePortrait(
  memories: Memory[]
): Promise<UserPortrait> {
  // 1. 聚合记忆信息
  const aggregated = aggregateMemories(memories);
  
  // 2. 生成标签
  const tags = await generateTags(aggregated);
  
  // 3. 生成分类
  const categories = await generateCategories(aggregated);
  
  return { tags, categories };
}
```

---

## 数据流

### 聊天流程

```
用户输入
  ↓
构建消息列表（历史 + 当前 + 上下文）
  ↓
选择模型和工具
  ↓
发送 API 请求（SSE）
  ↓
接收流式响应
  ├─ 文本内容 → 增量更新 UI
  └─ 工具调用 → 执行工具 → 继续请求
  ↓
生成最终回复
  ↓
保存会话
  ↓
提取记忆（可选）
```

### 工具调用流程

```
AI 返回工具调用
  ↓
解析工具名称和参数
  ↓
检查工具状态
  ├─ auto → 直接执行
  ├─ ask → 弹窗确认 → 执行
  └─ disabled → 拒绝执行
  ↓
执行工具逻辑
  ↓
格式化结果（成功/失败）
  ↓
附加工具结果到消息
  ↓
继续 API 请求（包含工具结果）
  ↓
AI 根据工具结果生成最终回复
```

### 上下文处理流程

```
用户选择上下文（块/页面/标签）
  ↓
存储到 contextStore
  ↓
构建上下文预览文本
  ├─ 获取块内容
  ├─ 展开子块（可选）
  └─ 格式化为文本
  ↓
发送聊天时附加上下文
  ↓
AI 基于上下文回答
```

---

## 开发指南

### 环境搭建

```bash
# 安装依赖
npm install

# 开发模式（热重载）
npm run dev

# 生产构建
npm run build

# 预览构建结果
npm run preview
```

### 添加新工具

1. 在 `src/services/ai-tools.ts` 定义工具：

```typescript
export const MY_TOOL: OpenAITool = {
  type: "function",
  function: {
    name: "myTool",
    description: "工具描述",
    parameters: { /* ... */ }
  }
};
```

2. 实现工具逻辑：

```typescript
async function executeMyTool(args: any) {
  // 实现逻辑
  return "结果";
}
```

3. 注册工具：

```typescript
export const TOOLS = [
  // ...其他工具
  MY_TOOL
];

export async function executeTool(name: string, args: any) {
  if (name === "myTool") {
    return await executeMyTool(args);
  }
  // ...
}
```

### 添加新组件

1. 创建组件文件 `src/components/MyComponent.tsx`：

```typescript
const React = window.React as any;
const { createElement, useState } = React;

export default function MyComponent({ prop }: Props) {
  const [state, setState] = useState(0);
  
  return createElement("div", { className: "my-component" },
    createElement("h1", null, "Hello")
  );
}
```

2. 在父组件中使用：

```typescript
import MyComponent from "../components/MyComponent";

// 在 createElement 中使用
createElement(MyComponent, { prop: "value" })
```

### 调试技巧

1. **查看 Orca 状态**：
   ```javascript
   console.log(orca.state.blocks);
   ```

2. **查看 Valtio Store**：
   ```javascript
   import { contextStore } from "./store/context-store";
   console.log(contextStore);
   ```

3. **测试工具调用**：
   ```javascript
   import { executeTool } from "./services/ai-tools";
   const result = await executeTool("searchNotes", { query: "test" });
   ```

4. **监控 API 请求**：
   打开浏览器开发者工具 Network 标签，查看 API 请求和响应

### 代码规范

- **缩进**：2 空格
- **类型**：严格使用 TypeScript 类型
- **命名**：
  - 文件：kebab-case（`my-service.ts`）
  - 组件：PascalCase（`MyComponent.tsx`）
  - 函数：camelCase（`myFunction`）
  - 常量：UPPER_SNAKE_CASE（`MY_CONSTANT`）
- **样式**：使用 `--orca-color-*` CSS 变量
- **React**：使用 `createElement`，不使用 JSX

---

## 总结

**Orca AI Chat Plugin** 是一个功能丰富、架构清晰的 AI 增强插件，核心特点：

✅ **模块化设计** - 清晰的服务层、状态管理、UI 组件分离  
✅ **可扩展性强** - 易于添加新工具、技能、模型支持  
✅ **用户体验好** - 流式输出、智能建议、多文件支持  
✅ **功能完善** - 搜索、创建、记忆、技能、多模型等  
✅ **类型安全** - 全面的 TypeScript 类型定义  

适合作为构建智能笔记助手的参考项目。
