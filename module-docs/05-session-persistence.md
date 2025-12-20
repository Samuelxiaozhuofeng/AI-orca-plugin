# 模块：会话持久化（Session Persistence）

## 目标与范围

实现 AI Chat 对话的持久化存储，让用户能够：

- 手动保存当前对话
- 查看和恢复历史会话
- 创建新对话
- 关闭面板时自动保存（可选）

## 关联文件

- `src/services/session-service.ts`：会话持久化核心服务
- `src/store/session-store.ts`：会话状态共享 store
- `src/views/ChatHistoryMenu.tsx`：历史会话下拉菜单组件
- `src/views/AiChatPanel.tsx`：集成会话管理 UI
- `src/ui/ai-chat-ui.ts`：关闭时自动保存逻辑
- `src/settings/ai-chat-settings.ts`：新增设置项

## 数据结构

### SavedSession

```typescript
type SavedSession = {
  id: string;              // 会话唯一ID
  title: string;           // 自动生成（用户第一条消息前20字）
  messages: Message[];     // 消息数组（排除 localOnly）
  contexts: ContextRef[];  // 关联的上下文
  createdAt: number;       // 创建时间
  updatedAt: number;       // 最后更新时间
};
```

### ChatSessionsData（存储格式）

```typescript
type ChatSessionsData = {
  version: 1;                      // 数据格式版本
  activeSessionId: string | null;  // 当前活动会话
  sessions: SavedSession[];        // 所有保存的会话
};
```

### 存储位置

- 存储 API：`orca.plugins.setData/getData`
- 存储 key：`chat-sessions`
- 数据格式：JSON 字符串

## 核心 API（session-service.ts）

| 函数 | 说明 |
|------|------|
| `loadSessions()` | 加载所有保存的会话 |
| `saveSession(session)` | 保存或更新会话 |
| `deleteSession(sessionId)` | 删除指定会话 |
| `clearAllSessions()` | 清空所有会话 |
| `createNewSession()` | 创建新的空会话 |
| `getSession(sessionId)` | 获取指定会话 |
| `shouldAutoSave()` | 检查是否启用自动保存 |
| `generateSessionTitle(messages)` | 自动生成会话标题 |
| `formatSessionTime(timestamp)` | 格式化时间显示 |

## UI 结构

### Header 按钮布局

```
[AI Chat] [Save💾] [History📚] [Settings⚙️] [Stop⏹] [Clear🗑] [Close✕]
```

| 按钮 | 图标 | 行为 |
|------|------|------|
| Save | `ti-device-floppy` | 手动保存当前会话 |
| History | `ti-history` | 打开历史会话下拉菜单 |

### ChatHistoryMenu 组件

下拉菜单结构：

```
┌────────────────────────┐
│ Chat History    [+New] │
├────────────────────────┤
│ • 今天讨论的任务查询   │ ← 当前会话高亮
│   今天 12:30 · 8 msgs  │
├────────────────────────┤
│ • 代码优化建议      [×]│ ← 悬停显示删除
│   昨天 · 15 msgs       │
├────────────────────────┤
│ [Clear All History]    │
└────────────────────────┘
```

功能：
- 点击会话：切换到该会话
- New 按钮：创建新对话
- × 按钮：删除单个会话
- Clear All：清空所有历史

## 设置项

新增两个设置项（`ai-chat-settings.ts`）：

| 设置项 | 类型 | 默认值 | 说明 |
|--------|------|--------|------|
| `autoSaveChat` | singleChoice | `manual` | 自动保存模式 |
| `maxSavedSessions` | number | `10` | 最大保存会话数 |

### autoSaveChat 选项

- `on_close`：关闭面板时自动保存
- `manual`：仅手动保存（默认）
- `never`：从不保存

## 数据流

### 保存流程

```
用户点击 Save / 关闭面板(auto-save)
    ↓
过滤 localOnly 消息
    ↓
检查是否有真实消息（无则跳过）
    ↓
生成/更新会话标题（首条用户消息前20字）
    ↓
调用 orca.plugins.setData() 存储
    ↓
检查会话数量，超出 maxSavedSessions 则删除最旧的
```

### 加载流程

```
面板打开
    ↓
调用 loadSessions() 读取数据
    ↓
如果有 activeSessionId，恢复该会话
    ↓
恢复消息和上下文
```

### 状态同步（session-store.ts）

用于在 `AiChatPanel` 和 `ai-chat-ui` 之间共享状态：

```typescript
sessionStore = {
  currentSession,  // 当前会话
  messages,        // 当前消息
  contexts,        // 当前上下文
  isDirty,         // 是否有未保存的更改
}
```

- `AiChatPanel` 通过 `useEffect` 同步状态到 store
- `ai-chat-ui` 在关闭面板时读取 store 执行自动保存

## 已知限制

- 会话数据存储在 Orca 插件存储中，不支持跨设备同步
- 自动保存是异步执行的，极端情况下（如应用崩溃）可能丢失
- 会话标题自动生成，暂不支持手动重命名

## 下一步

- （可选）会话重命名功能
- （可选）导出对话为 Markdown
- （可选）会话搜索功能
- （可选）云同步

## 更新记录

- 2025-12-20：完成会话持久化功能（保存/加载/删除/历史菜单/自动保存）
