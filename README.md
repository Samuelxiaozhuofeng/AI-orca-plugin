# Orca AI Chat Plugin

**智能笔记助手插件** - 为 Orca Note 提供强大的 AI 对话能力

![Version](https://img.shields.io/badge/version-2.0.0-blue)
![License](https://img.shields.io/badge/license-MIT-green)

## 🌟 核心特性

- 🤖 **多模型支持** - OpenAI、Claude、Gemini、Ollama 等
- 🔧 **23+ AI 工具** - 搜索、创建、更新笔记
- 🎯 **技能系统** - 自定义可复用的 AI 行为
- 💾 **会话管理** - 分支、收藏、导出、历史
- 🧠 **记忆系统** - 自动生成用户画像
- 📁 **多文件支持** - PDF、Word、Excel、图片、视频
- 🎮 **联网搜索** - Web 搜索、Wikipedia、货币转换
- 🎨 **Markdown 增强** - 代码、表格、图谱

## 🚀 快速开始

### 安装

```bash
# 克隆或下载项目
git clone <repository-url>

# 安装依赖
npm install

# 开发模式
npm run dev

# 生产构建
npm run build
```

### 配置

1. 在 Orca Note 中加载插件
2. 打开插件设置
3. 配置 AI 模型（OpenAI、Claude 等）的 API Key
4. 开始使用！

## 📖 文档

- **[完整架构说明](./ARCHITECTURE.md)** - 详细的架构、功能和实现说明
- **[快速设置指南](./docs/QUICK_SETUP_GUIDE.md)** - 快速上手教程
- **[工具调用逻辑](./TOOL_CALL_LOGIC.md)** - AI 工具系统说明
- **[AI 助手指引](./AGENTS.md)** - 开发者指引
- **[工具提示词](./Tool-Prompt/)** - 23+ 工具的详细文档

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

**搜索工具**：全文搜索、标签搜索、引用搜索、高级查询

**读取工具**：获取块内容、链接、元数据

**日记工具**：今日日记、指定日期、日期范围

**写入工具**：创建块、创建页面、插入标签、更新属性

**联网工具**：网页搜索、图片搜索、Wikipedia、货币转换

### 4. 技能系统

用户可以定义可复用的 AI 行为模式：

```
#skill 翻译助手
  - 类型: prompt
  - 描述: 专业翻译助手
  - 提示词: 你是专业翻译，请将内容翻译为{目标语言}
  - 变量: 目标语言
```

输入 `/` 即可快速激活技能。

### 5. 会话管理

- 自动保存对话历史
- 支持会话分支切换
- 导出为 Markdown/JSON/Journal
- 收藏和搜索功能

### 6. 记忆系统

- 自动从对话中提取用户信息
- 生成用户画像（兴趣、技能、偏好）
- 分类管理（工作、生活、学习等）
- 在后续对话中利用记忆

### 7. 文件处理

支持多种文件类型：

- **图片**：PNG, JPEG, GIF, WebP, AVIF
- **视频**：MP4, WebM, MOV（自动抽帧）
- **文档**：PDF, Word, Excel（自动提取文本）
- **代码**：JavaScript, Python, TypeScript 等
- **数据**：JSON, CSV（解析结构化数据）

### 8. 多模型对比

同时向多个 AI 模型发送请求，对比不同模型的回答质量。

## 🛠️ 技术栈

- **TypeScript** - 类型安全
- **React 18** - UI 框架
- **Vite** - 构建工具
- **Valtio** - 状态管理
- **d3-force** - 图谱可视化

## 📦 项目结构

```
AI-orca-plugin/
├── src/
│   ├── main.ts              # 插件入口
│   ├── ui/                  # UI 注册
│   ├── views/               # React 组件
│   ├── components/          # 可复用组件
│   ├── services/            # 业务逻辑（40+ 服务）
│   ├── store/               # 状态管理
│   ├── settings/            # 设置配置
│   ├── utils/               # 工具函数
│   └── styles/              # 样式定义
├── dist/                    # 构建输出
├── tests/                   # 测试文件
├── Tool-Prompt/             # 工具文档
├── ARCHITECTURE.md          # 架构说明
└── package.json
```

## 🤝 开发

### 添加新工具

1. 在 `src/services/ai-tools.ts` 定义工具
2. 实现工具执行逻辑
3. 在 `Tool-Prompt/` 添加工具文档

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

// 测试工具调用
import { executeTool } from "./services/ai-tools";
const result = await executeTool("searchNotes", { query: "test" });
```

## 📝 更新日志

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
