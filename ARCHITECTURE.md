# Orca AI Chat Plugin - 架构说明

## 项目概述

**Orca AI Chat Plugin** 是 Orca Note（块级笔记应用）的 AI 聊天插件：在侧边栏 / 面板里和 AI 对话，可把页面、标签作为上下文，通过 MCP 工具读写笔记，也可把对话交给本机 Claude Code（本机 AI）处理。

### 核心特性

- **多平台模型** - 平台按协议分三类：`openai`（OpenAI 兼容接口）、`anthropic`、`local-cli`（本机 AI）。内置平台 OpenAI、DeepSeek，可自行添加平台和模型
- **MCP 工具** - 笔记和外部工具都经 MCP 服务器接入
- **会话管理** - 自动保存、分支、收藏、置顶、重命名、导出 Markdown、保存到日记
- **多文件支持** - 图片、视频、音频、PDF、Word、Excel、代码、数据文件
- **斜杠命令** - 输入 `/` 选用 `Commands/` 目录里的提示词模板
- **流式输出** - SSE 实时流式响应
- **Markdown 增强** - 代码块、表格、图片画廊等

---

## 技术栈

- **TypeScript**、**React 18**（通过 `window.React` 访问，不打包 React）、**Vite**、**Valtio**（`window.Valtio`）
- 依赖库：`xlsx`（Excel）、`mammoth`（Word）、`unpdf`（PDF）

---

## 项目结构

```
AI-orca-plugin/
├── src/
│   ├── main.ts                    # 插件入口（load / unload）
│   ├── orca.d.ts                  # Orca API 类型定义
│   ├── ui/
│   │   ├── ai-chat-ui.ts          # 面板 + 编辑器侧边工具注册、打开面板
│   │   ├── ai-chat-renderer.ts    # 自定义块渲染器（aichat.conversation）
│   │   └── ai-chat-context-menu.ts # 页面 / 标签右键菜单「加入 AI 上下文」
│   ├── views/
│   │   ├── AiChatPanel.tsx        # 主聊天面板
│   │   ├── AiChatSidetool.tsx     # 编辑器侧边按钮
│   │   ├── ChatInput.tsx          # 输入框（文件、斜杠命令）
│   │   ├── chat-input/            # 输入框子部件：模型选择、工作文件夹按钮（仅本机 AI）、样式
│   │   ├── MessageItem.tsx        # 单条消息
│   │   ├── HeaderMenu.tsx         # 顶部菜单（清空、显示设置、MCP 服务器、导出、保存到日记）
│   │   ├── ChatHistoryMenu.tsx    # 历史对话列表
│   │   ├── ContextPicker.tsx / ContextChips.tsx # 上下文选择与展示
│   │   ├── DisplaySettingsPanel.tsx # 字号 / 紧凑模式 / 时间戳
│   │   ├── McpServerSettingsModal.tsx # MCP 服务器设置
│   │   └── EmptyState.tsx         # 欢迎页
│   ├── components/                # 消息列表、Markdown 渲染、工具确认弹窗、引用、图片画廊等
│   ├── services/
│   │   ├── ai/                    # 见「服务层」
│   │   ├── external/              # MCP 客户端 / 服务器管理、图片、动图、视频
│   │   ├── notes/                 # context-builder.ts（上下文文本）、document-parser.ts（PDF/Word/Excel）
│   │   ├── session-service.ts     # 会话持久化
│   │   ├── branch-service.ts      # 对话分支
│   │   ├── export-service.ts      # 导出 Markdown / 保存到日记
│   │   ├── file-service.ts        # 文件类型、上传、内容提取
│   │   ├── commands-loader.ts     # 斜杠命令加载
│   │   └── commands-defaults.ts   # 默认命令模板
│   ├── store/                     # Valtio 状态：context / session / ui / tool / mcp / display-settings
│   ├── settings/ai-chat-settings.ts # 设置 schema、平台与模型配置
│   ├── utils/                     # Markdown 渲染、token 估算（含 tokenizer/）、面板树、延迟保存等
│   └── styles/                    # 主样式、动画
├── bridge/                        # 本机 AI 中转（Orca Agent Bridge），见 bridge/README.md
├── scripts/                       # post-build.mjs、package-release.mjs、run-tests.mjs
├── tests/                         # *.test.ts，入口 tests/run-tests.ts
├── module-docs/                   # 模块文档
└── plugin-docs/                   # Orca 官方插件 API 参考
```

---

## 核心架构

### 插件生命周期（`src/main.ts`）

`load`：
1. 注册设置 schema、读取已存的平台配置
2. 若设置里有本机 AI 平台，非阻塞地探测并按需拉起中转（`autostartLocalCli`）
3. 注册 UI（面板、侧边工具、右键菜单）和块渲染器
4. 注册命令 `openAiChatPanel`，默认快捷键 macOS `meta+shift+k`、其他系统 `ctrl+shift+k`（已被占用则不分配）
5. 初始化 `Commands/` 目录的默认模板
6. 读取 MCP 设置，补上默认 MCP 服务器，非阻塞地连接各服务器

`unload`：清掉快捷键、命令、UI 和渲染器注册。

### Orca API 与 React

插件通过全局 `orca` 对象与 Orca 交互（`orca.state`、`orca.invokeBackend`、`orca.plugins.getData/setData/writeFile`、`orca.panels`、`orca.editorSidetools`、`orca.renderers` 等，类型见 `src/orca.d.ts`，API 参考见 `plugin-docs/`）。组件用 `window.React` 的 `createElement` 写，不用 JSX；样式用 `--orca-color-*` CSS 变量。

---

## 功能模块

### 聊天与流式

- `ai/openai-client.ts`：按平台协议（openai / anthropic / local-cli）发起流式请求
- `ai/chat-stream-handler.ts`：流式聊天，含重试与回退
- `ai/message-builder.ts`：构建发给模型的消息（含图片、视频、文件的多模态内容）
- `ai/tool-call-protocol.ts`、`ai/tool-call-router.ts`：解析模型输出里 XML / DSML 形式的工具调用，并把工具名对应到可用工具
- `ai/tool-round-limit.ts`：工具调用最大轮数（0 = 不限制，上限 100）
- `ai/model-fetcher.ts`：从平台的 `/models` 接口拉取模型列表
- `ai/dynamic-prompt.ts`：系统提示词（基础提示 + 按能力追加段落）
- `ai/context-manager.ts`：长对话压缩、旧工具结果裁剪

### 上下文

上下文引用（`store/context-store.ts`）有三种：页面（`page`）、块（`block`）、标签（`tag`）。添加方式：输入框旁的上下文选择器、页面 / 标签右键菜单「Add Page / Tag to AI Context」。发送时由 `notes/context-builder.ts` 的 `buildContextForSend` 生成上下文文本，长度受设置 `maxContextChars` 限制。

### 会话

- 存储：插件目录下 `Sessions/index.json`（索引）和 `Sessions/<sessionId>.json`（每个会话一个文件）；旧版 `chat-sessions` 数据会迁移
- 防抖保存与串行写入见 `utils/pending-save.ts`
- 分支：`branch-service.ts` 创建 / 切换 / 重命名 / 删除分支
- 导出：`export-service.ts` 导出 Markdown 文件，或把整个对话 / 选中的消息保存到日记
- 对话也可作为 `aichat.conversation` 块渲染在笔记里（`ui/ai-chat-renderer.ts`）

### 工具系统

插件内置的工具只有一个元工具 `tool_instructions`（返回指定工具的参数说明）。其余工具全部来自 MCP 服务器：

- `store/mcp-store.ts`：服务器列表、连接状态、已发现的工具、被用户关闭的工具；默认服务器 `orca-note`（`http://localhost:18672/mcp`）
- `external/mcp-client.ts`：MCP 客户端，支持 streamable-http，失败时回退 legacy-sse
- `external/mcp-server-manager.ts`：连接生命周期、把远程工具转成 function-calling 格式、路由调用、按开关过滤
- `external/mcp-tool-names.ts`：外部工具统一以 `mcp__<服务器id>__<工具名>` 命名
- `ai/ai-tools.ts`：`executeTool` 把 `mcp__` 工具转发给 MCP 客户端
- `store/tool-store.ts`、`utils/tool-display-config.ts`：工具显示名

### 本机 AI（local-cli）

平台协议选 `local-cli` 时，请求发往本机 `bridge/` 中转（默认 `http://127.0.0.1:18673`），由中转调用本机 Claude Code：

- `ai/local-cli-client.ts`：流式请求与事件映射
- `ai/local-cli-context.ts`：组装运行时上下文（Orca MCP 地址与令牌、确认弹窗、工作文件夹等）
- `ai/local-cli-autostart.ts`：探测中转，必要时拉起 `/Applications/Orca Agent Bridge.app`
- `ai/local-cli-resume.ts`：同一对话接着聊时的续接
- 输入框旁的工作文件夹按钮（`views/chat-input/WorkDirButton.tsx`）：每个对话单独选；该文件夹里的 `CLAUDE.md` 由中转读取

模式、权限、令牌、工作文件夹等细节见 `bridge/README.md`。

### 文件处理

`file-service.ts` 的 `FILE_TYPE_CONFIGS` 定义可上传的类型：

| 类型 | 格式 | 处理 |
|---|---|---|
| 图片 | PNG, JPEG, GIF, WebP, BMP, SVG, AVIF | 转 base64（动图在 `external/animated-image-service.ts` 处理） |
| 视频 | MP4, WebM, MOV, AVI, MKV | 抽帧（`external/video-service.ts`） |
| 音频 | MP3, WAV, OGG, MP4, FLAC, AAC | 按音频类别处理 |
| 文档 | PDF, Word, Excel | `notes/document-parser.ts` 提取文本 |
| 文本 / 代码 / 数据 | txt, md, 代码, CSV, JSON | 直接读取 |

### 斜杠命令

`commands-loader.ts` 从插件目录 `Commands/<name>.md` 读取命令；文件被删会用 `commands-defaults.ts` 里的默认模板（`orcanote`、`debug`、`review`、`refactor`）重建，用户改过的不会被覆盖。输入框输入 `/` 弹出命令菜单；`AiChatPanel.tsx` 另有一组内置的回答格式指令（如 `/brief`、`/table`、`/summary`）。

---

## 设置

`settings/ai-chat-settings.ts`：

| 项 | 默认值 |
|---|---|
| 当前平台 / 模型 | `openai` / `gpt-4o-mini` |
| `temperature` | 0.7 |
| `maxTokens` | 4096 |
| `currency` | `USD`（可选 USD / CNY / EUR / JPY） |
| `maxHistoryMessages` | 0（不限制，改用动态压缩） |
| `maxToolResultChars` | 8000（0 = 不限制） |
| `maxContextChars` | 60000 |

平台（`AiProvider`）含 `apiUrl`、`apiKey`、`protocol`、`models`、`enabled`；模型（`ProviderModel`）可单独覆盖温度、最大输出、`maxToolRounds`、`contextLength`，并可标注能力（vision / web / reasoning / tools / rerank / embedding）。显示设置（字号、紧凑模式、时间戳）在 `store/display-settings-store.ts`。

---

## 状态管理（Valtio）

| store | 内容 |
|---|---|
| `contextStore` | `selected`：已选上下文引用 |
| `sessionStore` | `currentSession`、`messages`、`contexts`、`isDirty` |
| `uiStore` | `aiChatPanelId`、`lastRootBlockId`、`pendingChatSession` |
| `mcpStore` | `servers`、`serverStatuses`、`disabledTools`、`discoveredTools` |
| `displaySettingsStore` | `fontSize`、`compactMode`、`showTimestamps` |
| `tool-store` | 工具显示名映射 `TOOL_DISPLAY_NAMES` |

---

## 数据流

### 聊天

```
用户输入（可带文件、斜杠命令、上下文）
  → 构建消息（历史 + 上下文 + 文件内容）
  → 按平台协议发流式请求（local-cli 走 bridge）
  → 文本增量更新 UI；遇到工具调用 → 执行（MCP）→ 带结果继续请求（受最大轮数限制）
  → 生成最终回复 → 防抖保存会话
```

---

## 开发

```bash
npm install
npm run dev       # Vite 开发服务器
npm run build     # tsc + vite build + scripts/post-build.mjs（有 build.config.local.json 时把 dist 复制到 copyTo）
npm run package   # 打包发布 zip
npm test          # 运行 tests/ 下的测试
```

- 新测试：写 `tests/xxx.test.ts`，在 `tests/run-tests.ts` 里 import
- 新增笔记类工具：在 MCP 服务器一侧提供，插件会自动发现；不在插件里单独定义
- 规范：2 空格缩进、TypeScript 严格模式；文件 kebab-case、组件 PascalCase、函数 camelCase
