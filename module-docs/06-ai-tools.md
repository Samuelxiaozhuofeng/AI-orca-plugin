# 模块：AI 工具系统（AI Tools）

## 目标与范围

决定 AI 能调用哪些工具、如何执行。提供给模型的工具全部来自外部 MCP 服务器（默认连 Orca Note MCP）发现的工具。

## 关联文件

- `src/services/ai/ai-tools.ts`：`getTools()`、`executeTool()`
- `src/services/ai/tool-call-router.ts`：把模型给的工具名对到可用工具名（容错）、重复调用签名
- `src/services/ai/tool-call-protocol.ts`：从正文里解析 / 剔除 XML、DSML 形式的工具调用
- `src/services/ai/tool-round-limit.ts`：工具轮数上限
- `src/services/ai/chat-stream-handler.ts`：流式请求、合并分片的 tool_calls
- `src/services/external/mcp-server-manager.ts`、`mcp-client.ts`、`mcp-tool-names.ts`：MCP 连接、工具发现与命名
- `src/store/mcp-store.ts`：MCP 服务器配置、被禁用的工具；`src/store/tool-store.ts`：工具显示名映射
- `src/views/AiChatPanel.tsx`：工具循环（`handleSend` 内）；`src/views/McpServerSettingsModal.tsx`：MCP 服务器与工具开关界面

## 可用工具

| 工具名称 | 功能 | 参数 |
| --- | --- | --- |
| `mcp__<服务器>__<工具名>_<哈希>` | 外部 MCP 工具，由已连接服务器动态发现；名称由 `buildMcpOpenAIName` 生成，总长不超过 64 字符 | 由各 MCP 工具自己的 schema 决定 |

`getTools()` 与 `getToolsForDraggedContext()` 目前都只返回已发现且未被禁用的 MCP 工具（`getAllDiscoveredTools()`），拖入块不会改变工具列表。`executeTool` 另外认得名字 `tool_instructions`（返回某个 MCP 工具的说明），但它不在提供给模型的工具列表里。

默认 MCP 服务器：`orca-note`，`http://localhost:18672/mcp`（`mcp-store.ts` 的 `DEFAULT_MCP_SERVER`）。在头部「更多」菜单的「MCP 服务器」里可增删服务器、单独禁用某个工具。

## 核心 API

```typescript
export function getTools(): OpenAITool[];               // 已启用的 MCP 工具
export async function executeTool(toolName: string, args: any): Promise<string>;
```

`executeTool` 分发：`mcp__` 开头走 `callRemoteTool`（断线类错误会重连一次）；`tool_instructions` 返回说明；其他返回 `Unknown tool: ...`。异常统一转成 `Error executing ...` 字符串。

## 数据流

详见仓库根目录 `TOOL_CALL_LOGIC.md`。概要：

```
handleSend → ensureMcpServersReady → 取 MCP 工具（模型支持 tools 时才传给 API）
    ↓
流式请求 → 得到 tool_calls（含从正文里解析出的 XML/DSML 调用）
    ↓
resolveToolCallName 纠正工具名 → 去重 → 解析（必要时修复）JSON 参数
    ↓
executeTool（60 秒超时，并行执行）→ 工具结果截断到 maxToolResultChars
    ↓
带着工具结果再请求一轮，直到没有 tool_calls / 出错 / 达到轮数上限
```

## 本机 AI（Claude Code）例外

协议选「本机 AI」时走 `local-cli-client.ts`，不产生 tool_calls，工具由 Claude Code 自己执行，权限请求转给确认弹窗（`ToolConfirmDialog`）；上面的工具循环不参与。详见 `bridge/README.md`。

## 扩展指南

- 新增能力：优先在 MCP 服务器侧提供工具，插件会自动发现。
- 要加插件内置工具：在 `getTools()` 返回的列表里加定义、`executeTool` 增加分支；工具显示名与图标见 `src/utils/tool-display-config.ts`。

## 更新记录

- 2025-12-21：从 `AiChatPanel.tsx` 提取为独立模块
- 内置笔记工具（搜索、读写块、日记等）及工具管理面板已移除，工具全部走 MCP
