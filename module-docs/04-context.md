# 模块：上下文读取与选择（page / block / tag）

## 目标与范围

让用户把笔记内容作为上下文交给 AI：选择上下文、在输入区显示为标签（chip）、发送时转成纯文本放入请求。

- page：一个页面（根块）及其子树
- block：一个块及其子树（主要来自拖入）
- tag：某标签下的块及其子树
- 入口：输入区 `@` 选择器、把块拖进输入区、页面 / 标签右键菜单

## 关联文件

- `src/store/context-store.ts`：已选上下文（`contextStore.selected`）与增删方法
- `src/services/notes/context-builder.ts`：读取并转文本（`buildContextForSend`）
- `src/views/ContextPicker.tsx`：`@` 触发的选择菜单
- `src/views/ContextChips.tsx`：输入区上方的上下文标签（显示每项与总 token 数，可移除）
- `src/views/ChatInput.tsx`：拖入块处理、`@` 快捷键、发送后清理高优先级上下文
- `src/ui/ai-chat-context-menu.ts`：右键菜单命令
- `src/ui/ai-chat-ui.ts`：记录 `lastRootBlockId`

## 数据结构

`ContextRef`：

- `{ kind: "page", rootBlockId, title, priority? }`
- `{ kind: "block", blockId, title, priority? }`
- `{ kind: "tag", tag, priority? }`

去重 key（`contextKey`）：`page:${rootBlockId}` / `block:${blockId}` / `tag:${去掉 # 的标签名}`。`priority`：0 普通（`@` 选择器 / 右键菜单），1 高优先级（拖入的块）；`addContext` 按优先级排序插入，高优先级在前。

## 入口

- **`@` 选择器**（`ContextPicker`）：在输入框空位置输入 `@` 或点 `Add Context (@)` 按钮打开；顶部搜索框，分「当前页面 / 页面 / 标签」三组（候选项通过 `get-aliased-blocks` / `get-aliases` 取得），选中后加入上下文。
- **拖入块**：把 Orca 块拖到输入区，按块 id 以 `addBlockById(id, 1)` 加入高优先级上下文；这类上下文在发送后自动移除（`clearHighPriorityContexts`）。只要有任何已选上下文，系统提示词就会追加「上下文优先」段落（`hasDraggedContext`）。
- **右键菜单**：页面根块菜单 `Add Page to AI Context`（只在页面根块上显示）；标签菜单 `Add Tag to AI Context`（标签名取 `aliases[0]` 或 `text`）。加入后自动打开 AI 面板。

## 读取与转文本（`buildContextForSend`）

默认限制：`maxBlocks` 300、`maxDepth` 10、`maxChars` 60000（面板发送时传入 `settings.maxContextChars`）、`maxTagRoots` 50、`maxAssets` 20；超出会截断并附说明。

- page / block：`orca.invokeBackend("get-block-tree", id)`，递归转文本；子块只给 id 时用 `get-blocks` 分批（每批 200）补齐。输出标题行带块 id，如 `## Page: 标题 (blockId: 123)`。
- tag：`get-blocks-with-tags` 取命中的块（最多 `maxTagRoots` 个），逐个展开子树。
- 块里的图片 / 视频 / 音频 / 文件会收集为 `assets`（`FileRef`），随请求一起处理。
- 某项读取失败时，该项输出 `## <kind> error` 加错误信息，不影响其他项。

## 已知限制

- `get-block-tree` 返回结构在不同版本可能有差异，代码做了多字段兼容。
- tag 命中很多时要逐个请求子树，可能较慢，受 `maxTagRoots` / `maxBlocks` 限制。

## 更新记录

- 2025-12-19：完成上下文读取与预览、右键菜单入口
- 后续：独立的 ContextSelector / Build Preview 面板已移除，改为输入区 `@` 选择器 + 上下文标签；增加拖入块、资源提取
