# ChatInput 组件模块

## 模块概述

`ChatInput` 是 AI 聊天面板的输入区，整合：上下文标签、`@` 选择器、文本输入（含斜杠命令菜单）、文件上传 / 粘贴 / 拖入、模型与平台选择、本机 AI 工作文件夹、token 预估、发送 / 停止。

## 文件结构

```
src/views/
├── ChatInput.tsx                  # 主组件（~1465 行）
├── ContextChips.tsx               # 已选上下文标签
├── ContextPicker.tsx              # @ 触发的上下文选择菜单
└── chat-input/
    ├── index.ts                   # 模块导出
    ├── chat-input-styles.ts       # 共享样式与菜单定位 measureMenu
    ├── ModelSelectorButton.tsx    # 模型选择触发按钮
    ├── ModelSelectorMenu.tsx      # 平台 / 模型选择与编辑菜单
    └── WorkDirButton.tsx          # 本机 AI 工作文件夹选择
```

## 组件职责

### ChatInput（主组件）

- 管理文本、待发送文件（`pendingFiles`）、斜杠菜单、`@` 选择器的状态。
- 发送：`Enter` 发送、`Shift+Enter` 换行（输入法组词时 Enter 不发送）。只有上下文没有文字时发送「请基于我提供的上下文回答。」；发送成功后清空文本和文件，并清掉拖入的高优先级上下文。
- 输入框高度随内容增长，最高 360px；占位文字 `Ask AI...`（有待发送文件时为「描述文件或直接发送...」）。
- `@`：在行首或空格 / 换行之后输入 `@` 打开 `ContextPicker`；工具栏也有 `Add Context (@)` 按钮。
- 斜杠命令菜单：只有 `/clear`。文本以 `/` 开头、没有空格且是 `/clear` 的前缀时弹出；Tab / Enter 或点击把 `/clear ` 填入输入框（已完整输入 `/clear` 时 Enter 直接提交），Esc 关闭。提交内容 trim 后恰好是 `/clear` 时调用 `onClearChat`（清空当前对话）并清空输入框，不调用 `onSend`。
- 文件：点回形针按钮选择（`isSupportedFile` 判断类型）、粘贴图片、拖入文件；上传由 `file-service.ts` 的 `uploadFile` 处理。视频文件按完整识别（画面+音频）处理。
- 拖入 Orca 块：识别 `orca/` 开头的拖拽数据或文本里的块 id，以 `addBlockById(id, 1)` 加为高优先级上下文，不插入文本。
- Token 预估：输入框右下角显示 `~N`（`estimateTokens`），悬停提示预估输入 / 输出 token。
- 本机 AI（`protocol === "local-cli"`）时：显示 `WorkDirButton`；若中转在完全放开模式下运行，显示红色「⚠ 完全放开」标签。工具栏过窄时工作文件夹按钮收进「更多操作」（`ti-dots`）菜单。
- 生成中（`disabled`）时发送按钮变为停止按钮，调用 `onStop`。

### ModelSelectorButton

- 显示当前模型名（没有时显示「选择模型」），点击打开 `ModelSelectorMenu`（`orca.components.ContextMenu`）。

### ModelSelectorMenu

- 顶部搜索框「搜索模型...」，按平台分组、可展开；已停用的平台不显示。
- 点模型选中；可「设为默认」（写入全局默认平台 / 模型）；每个模型可编辑：显示名称、temperature、maxTokens、工具轮数（默认继承全局、不限制）、模型能力标签。
- 平台配置面板：平台名称、API 地址、协议（OpenAI 兼容 / Anthropic 兼容 / 本机 AI（Claude Code），选后者时地址自动填 bridge 默认地址）、Anthropic 请求路径、API 密钥、模型列表；可从 API 「获取模型」、手动添加模型、删除平台（内置平台不可删）；底部「新建平台」。
- 所有修改通过 `onUpdateSettings` 写回设置（见 `module-docs/03-settings.md`）。

### WorkDirButton

- 仅本机 AI 显示。按钮显示文件夹末级名；点开可粘贴路径、点选最近用过的 5 个（`localStorage` 键 `ai-chat-local-cli-recent-workdirs`）、或「用默认文件夹」回到 bridge 的默认文件夹。每个对话各记各的（存在会话的 `workDir` 里）。

### chat-input-styles

- 共享样式常量与动态样式函数，以及 `measureMenu`（计算弹出菜单的宽度和对齐方向）。

## Props 接口（`ChatInput`）

```typescript
type Props = {
  onSend: (message: string, files?: FileRef[]) => void | Promise<void>;
  onClearChat: () => void;            // 提交 /clear 时调用（等同 Clear Chat）
  onStop?: () => void;
  disabled?: boolean;                 // 生成中：显示停止按钮，不可发送
  currentPageId: DbId | null;
  currentPageTitle: string;
  settings: AiChatSettings;
  selectedModel: string;              // 当前对话选的模型 id（可能与全局默认不同）
  onModelSelect: (providerId: string, modelId: string) => void;
  onUpdateSettings: (settings: AiChatSettings) => void;
  workDir?: string;                   // 本机 AI 工作文件夹，空 = bridge 默认文件夹
  onWorkDirChange: (workDir: string | undefined) => void;
  localCliFullAccess?: boolean;       // bridge 在完全放开模式
};
```

## 使用示例

见 `AiChatPanel.tsx` 末尾的 `createElement(ChatInput, {...})`：`onSend` 接 `handleSend`，`onStop` 接 `stop`，`disabled` 接 `sending`，`selectedModel` / `onModelSelect` 接当前对话的模型。

## 更新记录

- 2024-12：从单文件拆分为 `ChatInput` + `ModelSelectorMenu` + `ModelSelectorButton` + 样式文件
- 后续：增加文件上传 / 粘贴 / 拖入、斜杠命令菜单、token 预估、平台配置、`WorkDirButton` 与本机 AI 标签；模型选择改为平台 + 模型两级，`modelOptions` / `onModelChange` / `onAddModel` 等旧 props 已移除
