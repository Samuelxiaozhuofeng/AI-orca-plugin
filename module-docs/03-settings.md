# 模块：设置与配置存储

## 目标与范围

管理 AI 平台 / 模型配置的数据结构、默认值和存取。配置界面不在 Orca 设置面板里，而在聊天输入框的「模型选择器」中（见 `module-docs/14-chat-input.md`）。

## 关联文件

- `src/settings/ai-chat-settings.ts`：类型、默认值、读写、模型 / 平台工具函数
- `src/main.ts`：`load()` 时 `registerAiChatSettingsSchema` + `initAiChatSettings`
- `src/views/chat-input/ModelSelectorMenu.tsx`：平台与模型的编辑界面
- `src/store/display-settings-store.ts`、`src/store/mcp-store.ts`：显示设置、MCP 服务器配置（各自独立存储）

## Orca 设置面板

`registerAiChatSettingsSchema` 调用 `orca.plugins.setSettingsSchema(pluginName, {})`，schema 为空，Orca 设置里没有本插件的可调项（系统提示词已硬编码，不再让用户配置）。头部「更多」菜单的「Settings」只是执行 `core.openSettings` 打开 Orca 设置面板。

## 配置结构（`AiChatSettings`）

- `providers: AiProvider[]`：平台列表。每个平台有 `id`、`name`、`apiUrl`、`apiKey`、`protocol`（`openai` / `anthropic` / `local-cli`，默认 `openai`）、`anthropicApiPath`（可选，留空则自动拼 `/v1/messages` 并回退 `/messages`）、`models`、`enabled`、`isBuiltin`。
- 内置平台：OpenAI（`https://api.openai.com/v1`，gpt-4o、gpt-4o-mini、o1、o1-mini）、DeepSeek（`https://api.deepseek.com/v1`，deepseek-chat、deepseek-reasoner）；内置平台不可删除。
- `ProviderModel`：`id`、`label`、`inputPrice` / `outputPrice`（$/M tokens）、`capabilities`（视觉 / 联网 / 推理 / 工具 / 重排 / 嵌入）、`temperature`、`maxTokens`、`maxToolRounds` + `maxToolRoundsOverride`、`currency`、`contextLength`。
- 全局默认（模型没设时使用）：

| 字段 | 默认值 | 说明 |
| --- | --- | --- |
| `selectedProviderId` / `selectedModelId` | `openai` / `gpt-4o-mini` | 默认选中的平台与模型 |
| `temperature` | `0.7` | 限制在 0–2 |
| `maxTokens` | `4096` | 至少 1 |
| `currency` | `USD` | `USD` / `CNY` / `EUR` / `JPY` |
| `maxHistoryMessages` | `0` | 最大历史消息数，0 = 不限制（靠上下文压缩） |
| `maxToolResultChars` | `8000` | 工具结果最大字符数，0 = 不限制 |
| `maxContextChars` | `60000` | 上下文最大字符数，下限 5000 |

后三项和 `currency` 目前没有界面入口，只能用默认值（或改存储）。
- 工具轮数：`getModelRuntimeConfig` 只有当模型 `maxToolRoundsOverride === true` 时才用该模型的 `maxToolRounds`，否则为 0（不限制）；数值范围 0–100。

## 存储

- `orca.plugins.setData(pluginName, "ai-providers-config", json)`，同时备份到 `localStorage["ai-chat-providers-config"]`；读取时先读 Orca 存储，没有再读 localStorage。
- 读取时会补默认值：缺字段的平台补默认协议 / 启用状态；模型列表为空时回退内置模型；旧版 `apiKey` / `apiUrl` 会迁移到 OpenAI 平台。
- 其他独立存储：显示设置（`ai-chat-display-settings`）、MCP 服务器（`ai-chat-mcp-servers`）及被禁用工具（`ai-chat-mcp-disabled-tools`）、会话（见 `module-docs/05-session-persistence.md`）。

## 运行时使用

- 读取：`getAiChatSettings(pluginName)`（同步，使用缓存；`initAiChatSettings` 先异步加载）；更新：`updateAiChatSettings`。
- `getModelApiConfig(settings, modelId)`：按模型找到可用平台的 URL / Key / 协议，已停用（`enabled === false`）的平台一律不选。
- `validateCurrentConfig`：检查平台、URL、Key、模型是否填全。
- `modelSupportsTools`：模型 `capabilities` 里显式配置了才看是否含 `tools`；没配置默认支持。
- 「本机 AI（Claude Code）」平台（`protocol: "local-cli"`）：API 地址填 bridge 地址，API 密钥填 bridge 令牌，详见 `bridge/README.md`。
- 默认快捷键打开面板：macOS `meta+shift+k`，其他 `ctrl+shift+k`（`main.ts`，已被占用则跳过）。

## 更新记录

- 2025-12-19：把 AI 配置接入 Orca 设置面板（schema）
- 后续改为多平台 / 多模型配置，存于插件数据存储，Orca 设置 schema 置空；自动保存模式、最大保存会话数等设置项已移除（会话始终自动保存）
