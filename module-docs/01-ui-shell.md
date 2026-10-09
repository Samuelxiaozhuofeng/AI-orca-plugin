# 模块：UI 外壳与入口（EditorSidetool / 面板注册）

## 目标与范围

提供 AI Chat 的「入口与承载容器」，包括：

- 在编辑器侧边工具栏（EditorSidetool）提供一个按钮入口
- 注册一个自定义 panel view，用于在左侧打开 AI Chat 面板
- 注册命令与默认快捷键、块 / 标签右键菜单入口
- 维护面板开 / 关状态与 panelId 跟踪，避免重复打开、可正确关闭

## 关联文件

- `src/main.ts`：`load()` / `unload()`；注册设置 schema、UI、渲染器、打开命令与快捷键，初始化斜杠命令目录和 MCP 服务器
- `src/ui/ai-chat-ui.ts`：注册 / 反注册 + `openAiChatPanel` / `toggleAiChatPanel` / `closeAiChatPanel`，关闭前自动保存
- `src/ui/ai-chat-context-menu.ts`：右键菜单命令（见 `module-docs/04-context.md`）
- `src/ui/ai-chat-renderer.ts`：AI 对话块渲染器（见 `module-docs/12-custom-block-renderer.md`）
- `src/views/AiChatSidetool.tsx`：EditorSidetool 按钮 UI（图标 `ti-message-chatbot`，提示「AI Chat」）
- `src/store/ui-store.ts`：`aiChatPanelId`、`lastRootBlockId`、`pendingChatSession`
- `src/utils/panel-tree.ts`：在 panel tree 中查找 ViewPanel

## 关键接口

### `registerAiChatUI(pluginName)`

- `orca.panels.registerPanel(`${pluginName}.aiChat`, AiChatPanel)`
- `registerAiChatContextMenus(pluginName)`
- `orca.editorSidetools.registerEditorSidetool(`${pluginName}.aiChatSidetool`, { render })`，渲染时记录 `lastRootBlockId`

### `openAiChatPanel()` / `toggleAiChatPanel()` / `closeAiChatPanel(panelId)`

- `openAiChatPanel`：面板已开则什么都不做；否则 `orca.nav.addTo(activePanel, "left", { view, viewArgs: { rootBlockId } })` 新建左侧 panel，记录 `aiChatPanelId` 并聚焦。
- `toggleAiChatPanel`：已开则先 `autoSaveOnClose()` 再 `orca.nav.close`；未开则同 `openAiChatPanel`。
- `closeAiChatPanel`：面板头部关闭按钮使用，同样先自动保存。
- `autoSaveOnClose`：`sessionStore` 里有未保存改动（`isDirty`）且有非 `localOnly` 消息时调用 `saveSession`（始终开启，没有开关）。

### `unregisterAiChatUI()`

- 若面板仍开着：先关闭
- 反注册 sidetool、右键菜单、panel

### 命令与快捷键（`main.ts`）

- 命令 `<pluginName>.openAiChatPanel`（显示名 "Open AI Chat Panel"）调用 `openAiChatPanel()`。
- 默认快捷键：macOS `meta+shift+k`，其他系统 `ctrl+shift+k`；命令已有快捷键或该组合被别的命令占用时不分配。

## 数据流 / 交互流

1. 用户点击 EditorSidetool 按钮（或按快捷键 / 用右键菜单加入上下文）
2. `toggleAiChatPanel()` / `openAiChatPanel()` 判断是否已开
3. 调用 `orca.nav.addTo(..., "left")` 创建左侧面板（或 `orca.nav.close` 关闭）
4. `uiStore.aiChatPanelId` 记录当前打开的 panelId

## 已知限制

- 只追踪「最后一次打开的 AI 面板 panelId」，不支持多实例。

## 更新记录

- 2025-12-19：初始化 UI 外壳、面板注册与开关逻辑
- 后续：增加打开命令与默认快捷键、关闭前自动保存、右键菜单入口
