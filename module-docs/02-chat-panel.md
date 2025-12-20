# 模块：AI Chat 面板（对话 + 流式输出）

## 目标与范围

提供 AI Chat 面板，包含：

- 左侧聊天区：Header / MessageList / 输入区
- 右侧信息栏：ContextSelector + Preview（Step 2 已接入；Step 3 会继续接入 Prompt/History）
- 真实 AI 交互：发送消息后调用 OpenAI-compatible `/chat/completions`（支持流式）

## 关联文件

- `src/views/AiChatPanel.tsx`

## UI 结构

- 顶层为左右两栏布局：
  - 左：聊天主区（`flex: 1`）
  - 右：信息栏（固定宽度，后续放 ContextSelector / PromptSelector / History）
- Header 行为：
  - 设置按钮：打开 Orca 设置面板（`core.openSettings`）
  - 清空：清空消息列表（仅前端）
  - 关闭：关闭当前 AI Chat panel

## 对话行为

- 用户发送：
  - 立即追加 user 消息
  - 追加一条 assistant 消息并开始流式追加内容
  - 可通过 Stop 中断（AbortController）

## 样式约束

- 目前仅使用主题变量（`--orca-color-*`）+ inline style
- 未注入独立 CSS 文件（后续如增加 CSS，应采用 `orca.themes.injectCSSResource` 并作用域隔离）

## 已知限制

- 需要先在 Settings 中配置 API Key / URL / Model，否则会提示缺失配置

## 下一步

- （可选）Prompt 模板 / 快捷键 / 导出等完善
- （可选）会话搜索功能

## 更新记录

- 2025-12-19：实现双栏布局、mock 对话与基础交互
- 2025-12-19：右侧信息栏接入 ContextSelector 与 Preview（详情见 `module-docs/04-context.md`）
- 2025-12-19：接入 OpenAI-compatible 对话（含流式 + Stop）
- 2025-12-20：实现会话持久化功能（详情见 `module-docs/05-session-persistence.md`）
  - Header 新增 Save 按钮和 History 下拉菜单
  - 支持保存/加载/删除会话
  - 支持创建新对话
  - 支持关闭时自动保存（需在设置中启用）
