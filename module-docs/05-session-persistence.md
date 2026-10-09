# 模块：会话持久化（Session Persistence）

## 目标与范围

让对话在关闭面板、重启 Orca 后仍在，并支持：自动保存、历史对话切换、置顶 / 收藏 / 重命名 / 删除、笔记里的聊天块「继续对话」。**没有手动保存按钮，也没有自动保存开关**：只要有真实消息就自动保存。

## 关联文件

- `src/services/session-service.ts`：会话读写、索引、缓存（核心）
- `src/utils/pending-save.ts`：防抖保存队列（`createPendingSave`）
- `src/store/session-store.ts`：面板与 `ai-chat-ui` 共享的当前会话快照
- `src/views/ChatHistoryMenu.tsx`：历史对话下拉菜单
- `src/views/AiChatPanel.tsx`：会话管理（新建 / 切换 / 删除 / 自动保存）
- `src/ui/ai-chat-ui.ts`：关闭面板前保存（`autoSaveOnClose`）
- `src/store/ui-store.ts`：`pendingChatSession`（笔记聊天块「继续对话」传来的副本）

## 数据结构

- `Message`：`id`、`role`（user / assistant / tool）、`content`、`createdAt`，另有 `localOnly`（不入存档的本地提示）、`files`、`reasoning`、`model`、`contextRefs`、`pinned`、`tool_calls` / `tool_call_id` / `name`、分支字段（`branches`、`branchId`、`parentMessageId`、`activeBranchId`）、本机 AI 的 `cc` 等。
- `SessionFileData` / `SavedSession`：`id`、`title`、`model`、`workDir`（本机 AI 工作文件夹）、`ccHead`（本机 AI 续接点）、`messages`、`contexts`、`createdAt`、`updatedAt`、`pinned`、`favorited`、`scrollPosition`。
- `SessionMeta`（索引项）：`id`、`title`、`model`、`createdAt`、`updatedAt`、`pinned`、`favorited`、`messageCount`。
- `SessionIndex`：`{ version: 2, activeSessionId, sessions: SessionMeta[] }`，置顶的排前，其余按 `updatedAt` 倒序。

## 存储

- 存储 API：`orca.plugins.readFile / writeFile / removeFile / listFiles`（插件数据目录）
- 索引：`Sessions/index.json`；每个会话一个文件 `Sessions/<id>.json`
- 旧版（单个 `chat-sessions` 数据项，`orca.plugins.getData`）会在首次加载时迁移成上述文件格式
- 加载索引时会扫描 `Sessions/` 目录：目录里有但索引里没有的会话文件会自动补进索引（也支持 `日期_标题.json` 这样的自定义文件名），索引里的消息数等元数据过期时会更新
- 读取会话时会把旧消息里内嵌的 XML / DSML 工具调用标记规整成正式的 `tool_calls`（`normalizePersistedMessages`）

## 核心 API（session-service.ts）

| 函数 | 说明 |
| --- | --- |
| `loadSessions()` | 读索引，返回只含元数据的会话列表（消息按需再加载）和 `activeSessionId` |
| `loadFullSession(id)` / `getSession(id)` | 读完整会话（含消息） |
| `saveSession(session)` | 立即写入并更新索引；没有非 `localOnly` 消息则跳过（关闭面板时用） |
| `autoCacheSession(session)` | 自动保存用：文件 2 秒防抖写入、索引立即更新；只有消息变多才更新 `updatedAt`；保留已有标题 / 置顶 / 收藏 |
| `deleteSession(id)` | 删除会话文件并更新索引 |
| `clearAllSessions()` | 删除所有**非收藏**的会话 |
| `toggleSessionPinned(id)` / `toggleSessionFavorited(id)` | 置顶 / 收藏 |
| `renameSession(id, title)` | 重命名；空标题则按首条消息重新生成 |
| `setActiveSessionId(id)` | 记录活动会话 |
| `createNewSession()` | 创建空会话（内存中，有消息才会存） |
| `generateSessionTitle(messages)` | 标题 = 首条用户消息前 20 字（超出加 `...`），没有则用「会话 + 时间」 |
| `formatSessionTime(ts)` | 今天 HH:mm / 昨天 / 周几 / M月D日 |
| `clearSessionCache()` | 清缓存并立即写出待写入内容 |

## UI

- 面板 Header：`[会话标题（可编辑）] [+ 新对话] [历史对话] [更多] [关闭]`，没有单独的保存按钮。
- `ChatHistoryMenu`：按「置顶 / 收藏 / 今天 / 昨天 / 本周 / 更早」分组；每项显示标题和 `N 条`；可置顶、收藏、重命名、删除（删除先确认）；顶部「新建」，可切换「只看收藏」；底部「清空非收藏对话」（确认后执行，收藏的保留）。

## 保存与加载流程

保存（面板内）：

```
消息 / 会话 / 上下文变化 → pendingSave.schedule(拍快照)（1 秒防抖）
    ↓
到点：autoCacheSession(快照)（串行执行，前一次写完才写下一次）
    ↓
刷新历史列表
```

- 新建 / 切换 / 删除对话前会 `pendingSave.flush()`：立刻拍下尚未执行的那次快照并排队写入，避免防抖把最后一条回复吞掉，也避免晚到的保存把刚删的对话写回来。保存失败只记日志，不打断后续操作。
- 面板打开时：`loadSessions()` 后恢复 `activeSessionId` 对应的会话（消息、上下文、滚动位置）；若读取期间用户已新建 / 切换对话则不再恢复。
- 关闭面板：`autoSaveOnClose`（`ai-chat-ui.ts`）读取 `sessionStore`，有未保存改动且有真实消息时调用 `saveSession`。
- `sessionStore`（`currentSession`、`messages`、`contexts`、`isDirty`）由 `AiChatPanel` 在消息变化时同步，供 `ai-chat-ui` 关闭时读取。
- 清空消息（Clear Chat）会把空状态同步进存档（已存过的对话才更新），避免关闭时把清空前的快照写回去。

## 已知限制

- 会话存在插件数据目录，不跨设备同步。
- 防抖期内（约 1–2 秒）发生崩溃可能丢最后一点内容。
- 会话数量没有上限设置。

## 更新记录

- 2025-12-20：完成会话持久化功能
- 后续：存储由单个数据项改为「索引 + 每会话一个文件」；增加置顶 / 收藏 / 重命名、始终自动保存、串行防抖保存（`pending-save.ts`）、保存工作文件夹与本机 AI 续接点
