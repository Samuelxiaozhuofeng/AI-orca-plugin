# Orca AI Chat Plugin

**智能笔记助手插件** - 为 Orca Note 提供强大的 AI 对话能力

![Version](https://img.shields.io/badge/version-2.0.1-blue)
![License](https://img.shields.io/badge/license-MIT-green)

## 🌟 核心特性

- 🤖 **多平台模型** - OpenAI 协议、Anthropic 协议的服务（内置 OpenAI、DeepSeek，可自行添加），以及本机 AI（经 `bridge/` 中转调用本机 Claude Code）
- 🔧 **MCP 工具** - 通过 MCP 服务器接入笔记和外部工具（默认连 Orca Note MCP）
- 💾 **会话管理** - 分支、收藏、导出、历史
- 📁 **多文件支持** - PDF、Word、Excel、图片、视频
- ⌨️ **斜杠命令** - 输入 `/clear` 清空当前对话
- 🎨 **Markdown 增强** - 代码、表格

## 🚀 快速开始

### 安装

```bash
# 克隆或下载项目
git clone <repository-url>

# 安装依赖
npm install

# 开发模式
npm run dev

# 生产构建（tsc + vite build；若有 build.config.local.json 会把 dist 复制到其中 copyTo 指定的位置）
npm run build

# 运行测试
npm test

# 打包发布 zip（需先 build）
npm run package
```

### 配置

1. 在 Orca Note 中加载插件
2. 打开 AI 聊天面板，点输入框下方的模型选择器
3. 添加平台，填 API 地址和 API Key（OpenAI、Claude 等），再选模型
4. 开始使用！

## 📖 文档

- **[完整架构说明](./ARCHITECTURE.md)** - 详细的架构、功能和实现说明
- **[本机 AI 中转](./bridge/README.md)** - 本机 AI（Claude Code）中转的安装与权限说明
- **[工具调用逻辑](./TOOL_CALL_LOGIC.md)** - AI 工具系统说明
- **[AI 助手指引](./AGENTS.md)** - 开发者指引
- **[模块文档](./module-docs/)** - 各模块行为说明

## 🎯 主要功能

### 1. 智能对话

- 流式响应，实时输出
- 多轮对话，保持上下文
- 支持文本、图片、文件等多模态输入

### 2. 上下文选择

- 选择笔记块作为对话上下文
- 支持页面、标签、拖拽添加
- 自动压缩长上下文

### 3. AI 工具

插件自身只内置一个元工具 `tool_instructions`（查询某个工具的用法）；笔记读写等工具来自 MCP 服务器（默认配置 Orca Note MCP，`http://localhost:18672/mcp`，可在对话菜单「MCP 服务器」里增删服务器、开关单个工具）。

选「本机 AI」平台时，由本机 Claude Code 自带的工具干活，写操作的确认见 [bridge/README.md](./bridge/README.md)。

### 4. 会话管理

- 自动保存对话历史
- 支持会话分支切换
- 导出为 Markdown 文件，或保存到日记
- 收藏、置顶、重命名

### 5. 文件处理

支持多种文件类型：

- **图片**：PNG, JPEG, GIF, WebP, BMP, SVG, AVIF
- **视频**：MP4, WebM, MOV 等（自动抽帧）
- **音频**：MP3, WAV, OGG 等
- **文档**：PDF, Word, Excel（自动提取文本）
- **代码**：JavaScript, Python, TypeScript 等
- **数据**：JSON, CSV（解析结构化数据）

### 6. 本机 AI

给平台选「本机 AI」协议，对话经 `bridge/` 中转交给本机 Claude Code；输入框旁可为每个对话单独选工作文件夹，该文件夹里的 `CLAUDE.md` 会被读取。详见 [bridge/README.md](./bridge/README.md)。

## 🛠️ 技术栈

- **TypeScript** - 类型安全
- **React 18** - UI 框架
- **Vite** - 构建工具
- **Valtio** - 状态管理

## 📦 项目结构

```
AI-orca-plugin/
├── src/
│   ├── main.ts              # 插件入口
│   ├── ui/                  # UI 注册
│   ├── views/               # React 组件
│   ├── components/          # 可复用组件
│   ├── services/            # 业务逻辑（ai/ external/ notes/ 子目录 + 会话、分支、导出、文件等）
│   ├── store/               # 状态管理
│   ├── settings/            # 设置配置
│   ├── utils/               # 工具函数
│   └── styles/              # 样式定义
├── bridge/                  # 本机 AI 中转（Orca Agent Bridge）
├── scripts/                 # 构建后处理、打包、测试脚本
├── dist/                    # 构建输出
├── tests/                   # 测试文件
├── module-docs/             # 模块文档
├── ARCHITECTURE.md          # 架构说明
└── package.json
```

## 🤝 开发

### 添加新工具

笔记等工具由 MCP 服务器提供，不在插件内定义：在对话菜单「MCP 服务器」里添加服务器即可。`src/services/ai/ai-tools.ts` 只负责元工具 `tool_instructions` 和把 `mcp__` 开头的调用转发给 MCP 客户端。

### 添加新组件

1. 创建 `src/components/MyComponent.tsx`
2. 使用 `window.React` 创建组件
3. 在父组件中引用

### 代码规范

- 2 空格缩进
- TypeScript 严格模式
- kebab-case 文件名
- PascalCase 组件名
- camelCase 函数名

## 🐛 调试

```javascript
// 查看 Orca 状态
console.log(orca.state.blocks);

// 查看存储状态
import { contextStore } from "./store/context-store";
console.log(contextStore);

// 查看某个工具的用法
import { executeTool } from "./services/ai/ai-tools";
const result = await executeTool("tool_instructions", { toolName: "mcp__..." });
```

## 📝 更新日志

### v2.0.1 (2026-06-14)
- 📦 补齐插件市场发布包元信息
- 🧩 新增插件图标与 LICENSE
- ✅ 清理发布包结构，适配 awesome-orcanote 收录要求

### v2.0.0 (2026-02-01)
- ✨ 完整架构文档
- 🗑️ 清理无用依赖和代码
- 📚 文档重构和整理
- 🔧 移除 fflate 和 yaml 未使用依赖
- 🧹 删除 sql-executor 和 content-enhancement 未使用服务

### v1.1.0 (2026-01-31)
- 🐛 修复工具调用解析 Bug
- 🔒 Skills 强制用户确认
- 📊 工具状态管理优化
- ✅ 新增 55 个单元测试

## 📄 许可证

MIT License

## 💬 联系

如有问题或建议，请提交 Issue。

---

**注意**：本插件需要 Orca Note 环境才能运行。请确保已安装 Orca Note。
