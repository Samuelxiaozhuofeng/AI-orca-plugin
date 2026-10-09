# 模块：AI Chat 面板（对话 + 流式输出）

## 目标与范围

提供 AI Chat 面板（Orca 左侧 panel，单栏布局）：头部 / 消息列表 / 输入区。发送消息后按所选平台协议（OpenAI 兼容、Anthropic、本机 AI）发起流式请求，支持工具调用循环、停止生成、重试。

## 关联文件

- `src/views/AiChatPanel.tsx`：面板主体（状态、发送、工具循环、会话切换）
- `src/views/HeaderMenu.tsx`、`ChatHistoryMenu.tsx`、`EmptyState.tsx`、`MessageItem.tsx`、`ChatInput.tsx`
- `src/components/`：`MessageList`、`ScrollToBottomButton`、`ChatNavigation`、`ErrorMessage`、`TypingIndicator`、`ToolStatusIndicator` 等
- `src/services/ai/`：`message-builder.ts`（拼消息）、`chat-stream-handler.ts`（流式 + 重试）、`openai-client.ts`、`local-cli-*.ts`
- `src/services/branch-service.ts`：对话分支；`src/services/export-service.ts`：导出

## UI 结构（自上而下）

- Header：可编辑的会话标题 / 「新对话」（`+`）/ 历史对话菜单（`ChatHistoryMenu`）/ 「更多」菜单（`HeaderMenu`）/ 关闭
  - 「更多」菜单：显示设置（字体大小、紧凑模式、时间戳）、Settings（打开 Orca 设置）、MCP 服务器、导出 Markdown、保存到日记、选择消息保存（多选后「保存选中」）、Clear Chat（清空当前对话的消息，不删除对话本身）
- 消息区：新对话以一条仅本地显示（`localOnly`，不入存档）的欢迎语开始；消息为空时（如清空后）显示 `EmptyState`（三张建议卡：总结当前笔记、润色这段文字、AI 能做什么）；有消息时是消息列表，带日期分隔、回到底部按钮、`ChatNavigation` 浮动导航（消息多于 2 条时显示）
- 输入区：`ChatInput`（见 `module-docs/14-chat-input.md`）
- 弹窗：`McpServerSettingsModal`、全局图片预览 `GlobalImagePreview`

## 对话行为

- 发送：立即追加 user 消息，再追加 assistant 消息并流式追加内容；推理内容（reasoning）单独成一条消息显示；输出速度按 tok/s 显示在消息上。
- 停止：`AbortController` 中断；切换 / 新建 / 删除对话时会作废进行中的请求，旧请求之后的界面写入一律丢弃（`chat-request-owner.ts`）。
- 出错：显示 `ErrorMessage` 与重试按钮。
- 消息操作（`MessageItem`）：复制、删除此消息、回档到此处、保存到日记、重新生成（仅最后一条 AI 消息）、从此处创建分支（AI 消息）、标记为重要（压缩时保留）。
- 对话分支：从某条 AI 消息分叉出不同回复，可切换 / 重命名 / 删除分支（`branch-service.ts`）。
- 工具调用：见 `module-docs/06-ai-tools.md` 与根目录 `TOOL_CALL_LOGIC.md`。
- 斜杠命令：输入 `/` 弹出菜单。内置的 `/table /timeline /compare /list /steps /brief /detail /summary /eli5 /formal /diagram` 只改变回答格式 / 风格；其他 `/名字` 从插件数据目录 `Commands/<名字>.md` 读取模板（首次启动写入默认模板，被删会从默认恢复，用户改动不会被覆盖），拼在用户输入前发给 AI。
- 上下文：输入区的上下文标签（页面 / 块 / 标签 / 拖入的块）在发送时由 `buildContextForSend` 转成文本放入请求（见 `module-docs/04-context.md`）。
- 本机 AI（Claude Code）：选择该平台时请求经本机 bridge 发出；每个对话可单独选工作文件夹，同一对话会尽量续接 Claude Code 会话（`ccHead`）；插件对话只读取所选工作文件夹里那一份 `CLAUDE.md`。详见 `bridge/README.md`。

## 会话保存

消息变化后 1 秒防抖自动保存，切换对话 / 关闭面板前会补存；详见 `module-docs/05-session-persistence.md`。

## 样式约束

- 使用主题变量（`--orca-color-*`）+ inline style；动画样式由 `src/styles/chat-animations.ts` 注入（`injectChatStyles`）。

## 已知限制

- 需要先配置平台的 API 地址与密钥（在输入区的模型选择器中），否则发送时提示缺失配置。

## 更新记录

- 2025-12-19：实现基础对话、流式与 Stop；接入上下文
- 2025-12-20：实现会话持久化（详情见 `module-docs/05-session-persistence.md`）
- 后续：改为单栏布局，历史菜单、分支、斜杠命令、导出、MCP 工具、本机 AI 等陆续加入
