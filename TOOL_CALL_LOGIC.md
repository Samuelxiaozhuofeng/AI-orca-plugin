# 当前工具调用逻辑说明

## 架构概述

插件不再内置笔记操作工具。AI 能用的工具全部来自外部 MCP 服务器（默认 `orca-note`，`http://localhost:18672/mcp`），流程如下：

```
用户输入 → AiChatPanel.handleSend → 取 MCP 工具 → 流式请求 → tool_calls
       → 纠正工具名 / 去重 → 解析参数 → executeTool → 工具结果
       → 再请求一轮 → … → 最终回复
```

选了「本机 AI（Claude Code）」协议的平台例外：不走这套循环（见第 8 节）。

---

## 1. 工具定义层（`src/services/ai/ai-tools.ts`）

- `getTools()` / `getToolsForDraggedContext()`：都返回 `getAllDiscoveredTools()`，即已连接 MCP 服务器发现的、且没被用户禁用的工具。拖入块不会改变工具列表。
- `executeTool(toolName, args)`：`mcp__` 开头 → `callRemoteTool`；`tool_instructions` → 返回该工具的说明（这个名字不在提供给模型的列表里）；其他 → `Unknown tool: ...`；异常 → `Error executing ...`。

MCP 工具名格式 `mcp__<服务器>__<原名>_<哈希>`（`mcp-tool-names.ts`，总长不超过 64 字符），调用时再映射回服务器与原名。

## 2. MCP 连接（`src/services/external/mcp-server-manager.ts`）

- 插件加载时 `loadMcpSettings()` → `ensureDefaultMcpServer()` → `initMcpServers()`（`main.ts`），连接各服务器并发现工具，之后有定期健康检查。
- 每次发送消息前 `ensureMcpServersReady()`：已发现工具则直接用，否则重新初始化。
- `callRemoteTool`：服务器未连接 / 工具未注册直接返回 `Error: ...`；遇到网络类错误会重连一次再调用。
- 在头部「更多」菜单的「MCP 服务器」（`McpServerSettingsModal`）里管理服务器，并可逐个禁用工具（`mcp-store.ts` 的 `disabledTools`）。

## 3. 工具加载（`AiChatPanel.tsx` 的 `handleSend`）

1. `baseTools = getTools()`（有拖入的高优先级上下文时调 `getToolsForDraggedContext()`，结果相同）。
2. `modelSupportsTools(settings, model)`：模型 `capabilities` 里显式配置了但没有 `tools` → 不传工具；没配置能力 → 默认支持。不支持时 `tools` 传 `undefined`。
3. 系统提示词由 `buildDynamicSystemPrompt`（`dynamic-prompt.ts`）生成，再追加「Tool Name Contract」（可用工具名白名单，要求原样复制）和 MCP 路由说明。

## 4. 工具执行流程

对每一轮模型返回的 `tool_calls`：

1. **去重**：跳过本次回复里已有结果的 `tool_call_id`。
2. **纠正工具名**（`resolveToolCallName`）：精确 → 大小写 → 分隔符归一 → 单复数 → MCP 原名唯一匹配 → 单字符拼写差，只在唯一匹配时才改；对不上则生成一条 `Unknown tool` 错误结果，不执行。
3. **重复调用拦截**：工具名 + 规范化参数相同的调用，在同一次发送（含它引发的多轮工具调用）内只执行一次；下一次发送重新计，后面的返回 `Repeated tool call skipped` 错误。
4. **参数解析**：`JSON.parse`，失败则用 `tryRepairJson` 修复（取拼接 JSON 的第一个、补缺失括号、去重复键、去尾逗号、`blockld`→`blockId` 等）；仍失败返回 `Invalid JSON in tool arguments` 错误。
5. **执行**：同一轮的多个调用并行（`Promise.all`），每个 60 秒超时（`Tool execution timed out after 60s`）。主循环里没有「执行前询问用户」这一步。
6. **截断**：结果超过 `settings.maxToolResultChars`（默认 8000，0=不限制）就截断并附「已截断，原长度 N 字符」。
7. 结果以 `role: "tool"` 消息（带 `tool_call_id`、`name`）写入对话，用于下一轮请求。

## 5. 多轮循环与退出

- 轮数上限来自模型设置 `maxToolRounds`（`tool-round-limit.ts`，范围 0–100）。默认 0 = 不限制；只有模型显式开启 `maxToolRoundsOverride` 才用该模型的数值。
- 退出条件：模型不再返回 tool_calls；本轮的调用都已有结果；达到轮数上限（那一轮之后会不带工具再请求一次）；请求被取消 / 对话被切走。
- 恢复机制：某轮结果里出现错误（`Error:`、`Unknown tool`、`Invalid JSON in tool arguments`、超时、重复调用、`用户拒绝执行` 等）或刚到轮数上限时，下一次请求**不再带工具**，并在系统提示词末尾追加「Tool Recovery」，要求直接用已有结果回答；若模型仍返回空内容，会显示一段「工具调用没有成功完成，我已停止继续调用工具」的兜底文字。

## 6. 工具调用的解析与流式（`tool-call-protocol.ts`、`chat-stream-handler.ts`）

- 正常的 function calling 分片由 `mergeToolCalls` 按 id（回退按 index）合并。
- 部分模型把调用写在正文里（`<tool_call>`、`<invoke>`、DSML 等）：`createToolProtocolStream` 在流式输出时把这些标记从可见文字中剔除，结束时 `extractToolProtocol` 解析成 `tool_calls`，并与原生的去重合并。已保存的旧消息加载时也会做同样的规整（`session-service.ts`）。
- `streamChatWithRetry`：标准消息格式失败或返回完全为空时，用备用格式重试一次；`finish_reason` 为 `length` / `max_tokens` 且没有 tool_calls 时自动续写，最多 3 次（续写请求不带工具）；超过上下文阈值（默认 `maxContextTokens` 的 90%，保留最近 10 条）时先压缩历史；默认 30 秒无数据超时（每收到数据重置）。

## 7. 界面显示

- 工具调用状态由 `ToolStatusIndicator` 显示；显示名 / 图标来自 `src/utils/tool-display-config.ts`（MCP 工具统一用「外部工具」配置）和 `tool-store.ts` 的 `TOOL_DISPLAY_NAMES`（MCP 工具发现后自动注册）。
- 旧会话里的 `webSearch` 工具结果仍会被解析成「来源」展示（`extractSearchResultsFromToolResults`），但联网搜索工具本身已不存在。
- `ToolConfirmDialog` 目前只用于本机 AI 的权限确认（`local-cli-context.ts`）。

## 8. 本机 AI（Claude Code）

`protocol === "local-cli"` 时，`streamChatWithRetry` 直接交给 `streamLocalCli`（`local-cli-client.ts`）：经本机 bridge 调用 Claude Code，不产生 tool_calls，工具由 Claude Code 自己执行，权限请求转给确认弹窗。详见 `bridge/README.md`。

## 9. 调试要点

- 工具未被调用：看 `modelSupportsTools()` 的结果、MCP 服务器是否已连接并发现工具（「MCP 服务器」窗口里看状态）、工具是否被禁用。
- 控制台日志：`[Tool Call] Repaired malformed JSON`、`[Tool Call] Normalized tool name ...`、`[MCP] ...`。
- 工具执行失败：看工具结果消息里的 `Error: ...`；工具名对不上时错误里会列出可用工具名。
- 疑似死循环：检查模型的 `maxToolRounds` 设置，以及是否在重复调用同一工具（重复调用会被拦截）。

## 10. 文件关系

```
AiChatPanel.tsx（工具循环）
   ├─ ai-tools.ts（getTools / executeTool）
   │     └─ external/mcp-server-manager.ts → mcp-client.ts → MCP 服务器
   ├─ tool-call-router.ts（工具名纠正、调用签名）
   ├─ tool-call-protocol.ts（正文里的 XML/DSML 调用）
   ├─ tool-round-limit.ts
   └─ chat-stream-handler.ts → openai-client.ts / local-cli-client.ts
```
