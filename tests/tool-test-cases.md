# AI 工具测试用例

插件自身不再内置笔记工具，AI 的工具全部来自 MCP 服务器（默认 Orca Note MCP，`http://localhost:18672/mcp`）。以下是在 Orca Note 里手动验证工具调用链路的用例；具体工具名以「MCP 服务器」窗口里列出的为准（形如 `mcp__orca-note__<工具名>_<哈希>`）。

自动化测试：`npm run test`（`tests/run-tests.ts` 汇总，其中 `tool-call-parsing.test.ts`、`tool-round-limit.test.ts`、`mcp-tool-names.test.ts`、`mcp-client.test.ts` 覆盖工具调用相关逻辑）。

## 0. 前置检查

1. 打开 AI Chat 面板 → 头部「更多」菜单 → 「MCP 服务器」：`Orca Note MCP` 应显示已连接，并列出可用工具。
2. 当前模型的能力里没有取消「工具」（`modelSupportsTools`），否则不会传工具。

## 1. 读取类

```
今天的日记写了什么
```
预期：AI 调用 Orca Note MCP 里读日记的工具，返回今日日记内容。

```
读取"工作计划"页面的内容
```
预期：AI 先查找页面再读取，回答基于读到的真实内容。

```
搜索包含"会议"的笔记
```
预期：AI 调用搜索类工具并列出结果；引用笔记时用 `((块ID))` 形式。

## 2. 写入类

```
在今日日记下添加一条：测试笔记 - 工具调用测试
```
预期：在今日日记下创建新笔记（写入前请确认测试数据可随意改动）。

## 3. 工具管理

- 在「MCP 服务器」窗口禁用某个工具后再提问：该工具不应再被调用，也不会出现在可用工具名单里。
- 断开 / 关闭 MCP 服务器后提问：AI 不应编造结果；调用失败时应看到 `Error: ...`，随后 AI 直接说明无法完成。

## 4. 容错链路

- 工具名偏差：模型把工具名写错一个字符 / 单复数时，会被纠正到唯一匹配的工具（控制台 `[Tool Call] Normalized tool name`）；对不上则返回 `Unknown tool` 错误并列出可用工具名。
- 参数 JSON 残缺（如缺右括号、拼接的两个 JSON）：控制台出现 `[Tool Call] Repaired malformed JSON`，仍无法解析则返回 `Invalid JSON in tool arguments`。
- 重复调用：同一次发送里，同一工具同一参数第二次调用会被跳过（下一次发送不受影响）（`Repeated tool call skipped`），随后不带工具再请求一轮。
- 工具执行超过 60 秒：返回 `Tool execution timed out after 60s`。
- 结果过长：超过 `maxToolResultChars`（默认 8000）会被截断并附「已截断，原长度 N 字符」。

## 检查要点

1. **Console 日志**（Ctrl+Shift+I，Mac 为 Cmd+Option+I）：
   - `[MCP] 初始化完成: N 成功, M 失败`
   - `[AiChatPanel] 工具: N 个工具`
2. **界面**：每次工具调用在消息里显示为工具状态条（执行中 → 完成），MCP 工具统一显示为「外部工具」。
3. **轮数**：默认不限制工具轮数；在模型设置里给某个模型显式设了上限时，到达上限后 AI 应直接给出回答。
