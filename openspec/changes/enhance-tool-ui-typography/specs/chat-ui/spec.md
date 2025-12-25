# Specification: Chat UI - Tool Status Display

## ADDED Requirements

### Requirement: Tool Execution Visual Feedback

The AI Chat Panel MUST provide clear, semantic visual feedback for each tool invocation, allowing users to understand what the AI is doing without exposing technical parameter details.

**ID:** CHAT-UI-TOOL-001
**Priority:** High

#### Scenario: 用户看到 AI 正在创建块

- **GIVEN** 用户发送了需要 AI 创建新块的请求（如 "帮我创建一个待办事项"）
- **WHEN** AI 调用 `createBlock` 工具
- **THEN** 界面MUST显示：✨ 图标（闪烁动画）+ "正在创建块..." 文字
- **AND** MUST NOT显示技术参数（如 `refBlockId`, `position`, `content`）
- **AND** 当工具执行完成后，MUST更新为：✅ 图标（静态）+ "已创建新块" 文字
- **AND** 用户可通过 hover 菜单查看技术细节（可选）

#### Scenario: 用户看到 AI 正在搜索标签

- **GIVEN** 用户请求查找特定标签的笔记（如 "找出所有任务"）
- **WHEN** AI 调用 `searchBlocksByTag` 工具
- **THEN** 界面MUST显示：🔍 图标（脉动动画）+ "正在搜索标签..." 文字
- **AND** MUST NOT显示参数（如 `tagName`, `maxResults`）
- **AND** 当搜索完成后，MUST更新为：✅ 图标 + "找到 N 条结果" 文字

#### Scenario: 用户看到 AI 正在获取页面

- **GIVEN** 用户请求查看特定页面内容
- **WHEN** AI 调用 `getPage` 工具
- **THEN** 界面MUST显示：📖 图标（翻页动画）+ "正在获取页面..." 文字
- **AND** 完成后MUST显示：✅ "已获取页面「页面名」"

---

### Requirement: Tool Category Differentiation

Different tool categories MUST use distinct visual identifiers (icons, animations, text) to help users quickly recognize the type of operation the AI is performing.

**ID:** CHAT-UI-TOOL-002
**Priority:** High

#### Scenario: 创建类工具使用统一的视觉标识

- **GIVEN** AI 调用任何创建类工具（`createBlock`, `createPage`, `insertTag`）
- **THEN** 界面MUST显示：
  - 图标：✨（闪烁动画）
  - 文字模式："正在创建XXX..."
  - 成功后："已创建XXX"

#### Scenario: 搜索类工具使用统一的视觉标识

- **GIVEN** AI 调用任何搜索类工具（`searchBlocksByTag`, `searchBlocksByText`, `queryBlocksByTag`, `searchTasks`, 等）
- **THEN** 界面MUST显示：
  - 图标：🔍（脉动动画）
  - 文字模式："正在搜索XXX..."
  - 成功后："找到 N 条结果"

#### Scenario: 查询类工具使用统一的视觉标识

- **GIVEN** AI 调用任何查询类工具（`getPage`, `getTodayJournal`, `getRecentJournals`, 等）
- **THEN** 界面MUST显示：
  - 图标：📖（翻页动画）
  - 文字模式："正在获取XXX..."
  - 成功后："已获取XXX"

---

### Requirement: Seamless Tool Status Transitions

Tool invocations and results MUST be merged into a single, seamless status flow rather than separate cards.

**ID:** CHAT-UI-TOOL-003
**Priority:** Medium

#### Scenario: 工具状态流畅转换

- **GIVEN** AI 开始调用工具
- **WHEN** 工具状态从 loading 变为 success
- **THEN** 界面MUST在同一位置更新显示（不添加新的卡片）
- **AND** 过渡MUST使用平滑的动画（如淡入淡出）
- **AND** MUST NOT出现两个独立的可折叠卡片（一个显示参数，一个显示结果）

#### Scenario: 用户可选择查看技术细节

**Gemini Review - Critical Fix**: 使用点击交互代替 Hover，解决触屏设备兼容性问题。

- **GIVEN** 工具执行完成，显示简洁的结果摘要
- **WHEN** 用户看到工具状态显示，旁边有低对比度的 `</>` 图标
- **THEN** 点击 `</>` 图标MUST展开菜单，包含："查看参数" 和 "查看完整结果"
- **AND** 点击菜单项后MUST弹出模态框或侧边栏，显示完整的 JSON 数据
- **AND** 交互MUST兼容触屏设备（不依赖 Hover）

---

### Requirement: Error States MUST Be User-Friendly

When a tool execution fails, the system MUST display clear, user-friendly error messages with retry functionality.

**ID:** CHAT-UI-TOOL-004
**Priority:** High

**Gemini Review**: Added retry button and cancelled state support.

#### Scenario: 工具执行失败显示错误状态

- **GIVEN** AI 调用工具但执行失败（如找不到页面）
- **WHEN** 工具返回错误
- **THEN** 界面MUST显示：❌ 图标（静态）+ 用户友好的错误消息（如 "创建失败：找不到页面"）
- **AND** MUST NOT显示技术性的堆栈跟踪或错误代码
- **AND** 如果错误可重试，MUST显示"重试"按钮
- **AND** 用户可通过点击 `</>` 图标查看详细错误信息

#### Scenario: 用户取消工具执行

- **GIVEN** AI 正在执行工具
- **WHEN** 用户停止生成（如点击 Stop 按钮）
- **THEN** 界面MUST显示：⏸️ 图标 + "已取消" 文字
- **AND** 工具状态MUST从 loading 转换为 cancelled

---

## MODIFIED Requirements

### Requirement: Tool Call Display Format

Tool calls SHALL be displayed as inline status indicators with category-specific icons, animations, and text. Parameters SHALL NOT be shown by default but SHALL be accessible via hover menus.

**ID:** CHAT-UI-MSG-001
**Change Type:** Enhancement
**Priority:** High

**Before:**
Tool calls were displayed as collapsible cards, showing tool names and "Click to see args" prompts by default, with JSON parameters visible when expanded.

**After:**
Tool calls are displayed as inline status indicators with category-specific icons, animations, and friendly text. Parameters are hidden by default and accessible via hover menus.

#### Scenario: 旧格式消息兼容

- **GIVEN** 数据库中存在旧格式的消息（包含 tool_calls）
- **WHEN** 用户打开聊天面板查看历史消息
- **THEN** 旧消息MUST正确渲染为新格式（状态指示器）
- **AND** 如果工具已完成，MUST显示 success 状态（而不是 loading）

---

## Dependencies

**Depends on:**
- `typography` spec - 确保工具状态文字使用正确的字体和大小
- 现有 `ai-tools` spec - 工具定义和执行逻辑不变

**Blocks:**
_无_

---

## Testing Criteria

### Functional Tests
- [ ] 所有 14 个工具都有正确的图标和文字
- [ ] 状态转换流畅（loading → success → error）
- [ ] Hover 菜单正常工作
- [ ] 旧消息向后兼容

### Visual Tests
- [ ] 动画性能良好（60fps）
- [ ] 不同主题下显示正常
- [ ] 截图对比通过
