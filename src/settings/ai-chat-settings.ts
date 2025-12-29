// 系统提示词支持模板变量：例如 {maxToolRounds} 会在运行时按设置值替换。
const DEFAULT_SYSTEM_PROMPT = `你是一个笔记库智能助手，帮助用户查询、搜索和理解他们的笔记内容。

## 工具使用原则（重要）
- **一次成功即返回**：工具返回"✅ Search complete"时，立即向用户展示结果，**绝对不要**再调用其他工具
- **禁止对搜索结果调用 getPage**：搜索结果已包含完整内容（标题+正文），直接使用即可。特别注意：不要对 "Block #数字" 格式的链接调用 getPage
- **避免重复查询**：一旦找到符合条件的结果，不要再调用相同或类似的搜索工具
- **参数完整性**：调用工具前确保所有必需参数已填写，不要传空值或 undefined

## 搜索策略
- **属性查询流程**（如"Status=Done的任务"）：
  1. 先调用 get_tag_schema 获取标签的属性定义和选项值
  2. 再调用 query_blocks_by_tag 携带正确的过滤条件
  3. 收到结果后直接返回，无需再调用其他工具
- **主动重试**：首次搜索无结果时，尝试替代方案（最多 {maxToolRounds} 轮）：
  1. 标签变体（如 #task → #todo → #任务）
  2. 搜索降级（属性查询 → 标签搜索 → 全文搜索）
  3. 条件放宽（如 priority >= 9 → priority >= 8）
- **精准返回**：只展示精确匹配用户意图的结果
- **优先专用工具**：总结今天用 getTodayJournal，总结近期用 getRecentJournals

## 写入操作规则
- **仅在明确授权时创建**：只有用户明确要求「创建」「添加」「写入」时，才可使用 createBlock/createPage/insertTag
- **确认参数**：缺少必要信息（如位置、内容）时，先询问用户而非猜测
- **禁止重复创建**：createBlock 成功后立即停止，不要再次调用。一个请求只创建一次内容！
- **检查工具结果**：如果 createBlock 返回了 "Created new block"，说明已成功，不要再调用

## 已知限制
- 不支持修改或删除已有笔记（仅支持创建新块）
- 最大返回结果数为 50

## 回复规范
- 使用中文回复
- **块引用格式（极其重要，必须严格遵守）**：
  - ✅ 引用工具返回的结果时，**原样保留** [标题](orca-block:id) 格式，不要修改！
  - ✅ 自己提及某个块时，使用 blockid:数字 格式（如 blockid:4209）
  - ❌ **绝对禁止**使用 [数字] 格式（如 [4209]），这种格式无法渲染为链接！
  - ❌ **绝对禁止**把工具返回的链接改成 [数字] 格式
- block 引用直接写 [标题](orca-block:id)，不要用括号包裹，不要写成 ([标题](orca-block:id))
- **时间线展示**：当展示有时间顺序的事件（如项目进度、历史记录、计划安排）时，使用时间线格式：
  \`\`\`timeline
  2024-12-01 | 事件标题 | 可选描述
  2024-12-15 | 另一个事件
  \`\`\`
- 保持简洁，直接回答问题
- 所有尝试失败时：说明尝试了哪些方法、可能原因、给出建议
`;


export async function registerAiChatSettingsSchema(
  pluginName: string,
): Promise<void> {
  const isZh = orca.state.locale === "zh-CN";
  await orca.plugins.setSettingsSchema(pluginName, {
    apiKey: {
      label: "API Key",
      type: "string",
      defaultValue: "",
    },
    apiUrl: {
      label: "API URL",
      type: "string",
      defaultValue: "https://api.openai.com/v1",
    },
    model: {
      label: "AI Model",
      type: "singleChoice",
      choices: [
        { label: "GPT-4o Mini", value: "gpt-4o-mini" },
        { label: "GPT-4o", value: "gpt-4o" },
        { label: "Custom", value: "custom" },
      ],
      defaultValue: "gpt-4o-mini",
    },
    customModel: {
      label: "Custom Model Name",
      type: "string",
      defaultValue: "",
    },
    customModels: {
      label: isZh ? "自定义模型" : "Custom Models",
      description: isZh
        ? "添加自定义模型，每个模型可配置独立的 API 地址和密钥"
        : "Add custom models with optional independent API URL and Key",
      type: "array",
      defaultValue: [],
      arrayItemSchema: {
        model: {
          label: isZh ? "模型名称" : "Model Name",
          type: "string",
          defaultValue: "",
        },
        label: {
          label: isZh ? "显示名称（可选）" : "Display Name (optional)",
          type: "string",
          defaultValue: "",
        },
        apiUrl: {
          label: isZh ? "API 地址（留空使用全局）" : "API URL (empty = use global)",
          type: "string",
          defaultValue: "",
        },
        apiKey: {
          label: isZh ? "API 密钥（留空使用全局）" : "API Key (empty = use global)",
          type: "string",
          defaultValue: "",
        },
        inputPrice: {
          label: isZh ? "输入价格 ($/百万Token)" : "Input Price ($/M tokens)",
          type: "number",
          defaultValue: 0,
        },
        outputPrice: {
          label: isZh ? "输出价格 ($/百万Token)" : "Output Price ($/M tokens)",
          type: "number",
          defaultValue: 0,
        },
        capabilities: {
          label: isZh ? "模型能力" : "Capabilities",
          type: "multiChoices",
          choices: [
            { label: isZh ? "视觉" : "Vision", value: "vision" },
            { label: isZh ? "联网" : "Web", value: "web" },
            { label: isZh ? "推理" : "Reasoning", value: "reasoning" },
            { label: isZh ? "工具" : "Tools", value: "tools" },
            { label: isZh ? "重排" : "Rerank", value: "rerank" },
            { label: isZh ? "嵌入" : "Embedding", value: "embedding" },
          ],
          defaultValue: [],
        },
      },
    },
    systemPrompt: {
      label: "System Prompt",
      type: "string",
      defaultValue: DEFAULT_SYSTEM_PROMPT,
    },
    temperature: {
      label: "Temperature",
      type: "number",
      defaultValue: 0.7,
    },
	    maxTokens: {
	      label: "Max Tokens",
	      type: "number",
	      defaultValue: 4096,
	    },
	    maxToolRounds: {
	      // 工具调用最大轮数：复杂查询场景下允许 AI 多次尝试（会增加响应时间和成本）
	      label: isZh ? "工具调用最大轮数" : "Max Tool Rounds",
	      description: isZh
	        ? "AI 可以连续调用工具的最大轮数（3-10）。增加轮数可以让 AI 在复杂场景下有更多尝试机会，但会增加响应时间和成本。"
	        : "Maximum rounds AI can call tools consecutively (3-10). More rounds allow AI to handle complex queries better, but increase response time and cost.",
	      type: "number",
	      defaultValue: 5,
	      min: 3,
	      max: 10,
	    },
	    autoSaveChat: {
	      label: "Auto Save Chat",
	      description: "When to automatically save chat history",
	      type: "singleChoice",
	      choices: [
        { label: "On Close", value: "on_close" },
        { label: "Manual Only", value: "manual" },
        { label: "Never", value: "never" },
      ],
      defaultValue: "manual",
    },
    maxSavedSessions: {
      label: "Max Saved Sessions",
      description: "Maximum number of saved chat sessions (oldest will be deleted when exceeded)",
      type: "number",
      defaultValue: 10,
    },
    currency: {
      label: isZh ? "价格币种" : "Currency",
      description: isZh ? "用于显示预估费用的货币单位" : "Currency unit for estimated cost display",
      type: "singleChoice",
      choices: [
        { label: "USD ($)", value: "USD" },
        { label: "CNY (¥)", value: "CNY" },
        { label: "EUR (€)", value: "EUR" },
        { label: "JPY (¥)", value: "JPY" },
      ],
      defaultValue: "USD",
    },
  });
}

export type CurrencyType = "USD" | "CNY" | "EUR" | "JPY";

export const CURRENCY_SYMBOLS: Record<CurrencyType, string> = {
  USD: "$",
  CNY: "¥",
  EUR: "€",
  JPY: "¥",
};

export type AiChatSettings = {
	apiKey: string;
	apiUrl: string;
	model: string;
	customModel: string;
	customModels: AiModelPreset[];
	systemPrompt: string;
	temperature: number;
	maxTokens: number;
	maxToolRounds: number;
	autoSaveChat: "on_close" | "manual" | "never";
	maxSavedSessions: number;
	currency: CurrencyType;
};

/** 模型能力类型 */
export type ModelCapability = "vision" | "web" | "reasoning" | "tools" | "rerank" | "embedding";

/** 模型能力标签配置 */
export const MODEL_CAPABILITY_LABELS: Record<ModelCapability, { label: string; icon: string; color: string }> = {
  vision: { label: "视觉", icon: "ti ti-eye", color: "#8b5cf6" },
  web: { label: "联网", icon: "ti ti-world", color: "#06b6d4" },
  reasoning: { label: "推理", icon: "ti ti-brain", color: "#f59e0b" },
  tools: { label: "工具", icon: "ti ti-tool", color: "#10b981" },
  rerank: { label: "重排", icon: "ti ti-arrows-sort", color: "#ec4899" },
  embedding: { label: "嵌入", icon: "ti ti-vector", color: "#6366f1" },
};

export type AiModelPreset = {
  label?: string;
  model: string;
  /** 自定义 API URL（留空则使用全局设置） */
  apiUrl?: string;
  /** 自定义 API Key（留空则使用全局设置） */
  apiKey?: string;
  /** 输入价格，单位：每百万Token */
  inputPrice?: number;
  /** 输出价格，单位：每百万Token */
  outputPrice?: number;
  /** 模型能力标签 */
  capabilities?: ModelCapability[];
};

export const DEFAULT_AI_CHAT_SETTINGS: AiChatSettings = {
	apiKey: "",
	apiUrl: "https://api.openai.com/v1",
	model: "gpt-4o-mini",
	customModel: "",
	customModels: [],
	systemPrompt: DEFAULT_SYSTEM_PROMPT,
	temperature: 0.7,
	maxTokens: 4096,
	maxToolRounds: 5,
	autoSaveChat: "manual",
	maxSavedSessions: 10,
	currency: "USD",
};

function toNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return fallback;
}

function toString(value: unknown, fallback: string): string {
  if (typeof value === "string") return value;
  return fallback;
}

function toModelPresets(value: unknown, fallback: AiModelPreset[]): AiModelPreset[] {
  if (!Array.isArray(value)) return fallback;

  const out: AiModelPreset[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") continue;
    const rawLabel = (item as any).label;
    const rawModel = (item as any).model;
    const rawApiUrl = (item as any).apiUrl;
    const rawApiKey = (item as any).apiKey;
    const rawInputPrice = (item as any).inputPrice;
    const rawOutputPrice = (item as any).outputPrice;
    const rawCapabilities = (item as any).capabilities;
    
    const model = typeof rawModel === "string" ? rawModel.trim() : "";
    if (!model) continue;
    const label = typeof rawLabel === "string" ? rawLabel.trim() : "";
    const apiUrl = typeof rawApiUrl === "string" ? rawApiUrl.trim() : undefined;
    const apiKey = typeof rawApiKey === "string" ? rawApiKey.trim() : undefined;
    const inputPrice = typeof rawInputPrice === "number" && rawInputPrice >= 0 ? rawInputPrice : undefined;
    const outputPrice = typeof rawOutputPrice === "number" && rawOutputPrice >= 0 ? rawOutputPrice : undefined;
    const capabilities = Array.isArray(rawCapabilities) 
      ? rawCapabilities.filter((c): c is ModelCapability => 
          ["vision", "web", "reasoning", "tools", "rerank", "embedding"].includes(c)
        )
      : undefined;
    
    out.push({ label, model, apiUrl: apiUrl || undefined, apiKey: apiKey || undefined, inputPrice, outputPrice, capabilities });
  }

  const seen = new Set<string>();
  const unique: AiModelPreset[] = [];
  for (const item of out) {
    if (seen.has(item.model)) continue;
    seen.add(item.model);
    unique.push(item);
  }

  return unique;
}

function toAutoSaveChoice(
  value: unknown,
  fallback: "on_close" | "manual" | "never",
): "on_close" | "manual" | "never" {
  if (value === "on_close" || value === "manual" || value === "never") {
    return value;
  }
  return fallback;
}

function toCurrency(value: unknown, fallback: CurrencyType): CurrencyType {
  if (value === "USD" || value === "CNY" || value === "EUR" || value === "JPY") {
    return value;
  }
  return fallback;
}

export function getAiChatSettings(pluginName: string): AiChatSettings {
	const raw = (orca.state.plugins as any)?.[pluginName]?.settings ?? {};
	const merged: AiChatSettings = {
		apiKey: toString(raw.apiKey, DEFAULT_AI_CHAT_SETTINGS.apiKey),
		apiUrl: toString(raw.apiUrl, DEFAULT_AI_CHAT_SETTINGS.apiUrl),
		model: toString(raw.model, DEFAULT_AI_CHAT_SETTINGS.model),
		customModel: toString(raw.customModel, DEFAULT_AI_CHAT_SETTINGS.customModel),
		customModels: toModelPresets(raw.customModels, DEFAULT_AI_CHAT_SETTINGS.customModels),
		systemPrompt: toString(raw.systemPrompt, DEFAULT_AI_CHAT_SETTINGS.systemPrompt),
		temperature: toNumber(raw.temperature, DEFAULT_AI_CHAT_SETTINGS.temperature),
		maxTokens: toNumber(raw.maxTokens, DEFAULT_AI_CHAT_SETTINGS.maxTokens),
		maxToolRounds: toNumber(raw.maxToolRounds, DEFAULT_AI_CHAT_SETTINGS.maxToolRounds),
		autoSaveChat: toAutoSaveChoice(raw.autoSaveChat, DEFAULT_AI_CHAT_SETTINGS.autoSaveChat),
		maxSavedSessions: toNumber(raw.maxSavedSessions, DEFAULT_AI_CHAT_SETTINGS.maxSavedSessions),
		currency: toCurrency(raw.currency, DEFAULT_AI_CHAT_SETTINGS.currency),
	};

  merged.apiUrl = merged.apiUrl.trim();
  merged.apiKey = merged.apiKey.trim();
  merged.model = merged.model.trim();
	merged.customModel = merged.customModel.trim();
	merged.temperature = Math.max(0, Math.min(2, merged.temperature));
	merged.maxTokens = Math.max(1, Math.floor(merged.maxTokens));
	merged.maxToolRounds = Math.max(3, Math.min(10, Math.floor(merged.maxToolRounds)));
	merged.maxSavedSessions = Math.max(1, Math.floor(merged.maxSavedSessions));

	return merged;
}

export type AiModelOption = {
  value: string;
  label: string;
  group?: string;
  /** 自定义 API URL */
  apiUrl?: string;
  /** 自定义 API Key */
  apiKey?: string;
  /** 输入价格，单位：每百万Token */
  inputPrice?: number;
  /** 输出价格，单位：每百万Token */
  outputPrice?: number;
  /** 模型能力标签 */
  capabilities?: ModelCapability[];
};

const BUILTIN_MODEL_OPTIONS: AiModelOption[] = [
  { value: "gpt-4o-mini", label: "GPT-4o Mini", group: "Built-in", inputPrice: 0.15, outputPrice: 0.6, capabilities: ["vision", "tools"] },
  { value: "gpt-4o", label: "GPT-4o", group: "Built-in", inputPrice: 2.5, outputPrice: 10, capabilities: ["vision", "tools"] },
];

export function buildAiModelOptions(
  settings: AiChatSettings,
  extraModels: string[] = [],
): AiModelOption[] {
  const seen = new Set<string>();
  const out: AiModelOption[] = [];

  const add = (opt: AiModelOption) => {
    const v = opt.value.trim();
    if (!v) return;
    if (seen.has(v)) return;
    seen.add(v);
    out.push({ ...opt, value: v, label: (opt.label || v).trim() });
  };

  for (const opt of BUILTIN_MODEL_OPTIONS) add(opt);

  for (const item of settings.customModels) {
    add({
      value: item.model,
      label: item.label || item.model,
      group: "Custom",
      apiUrl: item.apiUrl,
      apiKey: item.apiKey,
      inputPrice: item.inputPrice,
      outputPrice: item.outputPrice,
      capabilities: item.capabilities,
    });
  }
  if (settings.customModel.trim()) {
    add({ value: settings.customModel, label: settings.customModel, group: "Custom" });
  }

  for (const m of extraModels) add({ value: m, label: m, group: "Other" });

  return out;
}

export function resolveAiModel(settings: AiChatSettings): string {
  if (settings.model === "custom") return settings.customModel.trim();
  return settings.model.trim();
}

export function validateAiChatSettings(settings: AiChatSettings): string | null {
  if (!settings.apiUrl.trim()) return "Missing API URL (Settings → API URL)";
  if (!settings.apiKey.trim()) return "Missing API Key (Settings → API Key)";
  const model = resolveAiModel(settings);
  if (!model) return "Missing model (Settings → AI Model / Custom Model Name)";
  return null;
}

export function validateAiChatSettingsWithModel(
  settings: AiChatSettings,
  modelOverride: string,
): string | null {
  if (!settings.apiUrl.trim()) return "Missing API URL (Settings → API URL)";
  if (!settings.apiKey.trim()) return "Missing API Key (Settings → API Key)";
  if (!modelOverride.trim()) return "Missing model (Select a model or check Settings)";
  return null;
}

/**
 * 获取指定模型的 API 配置
 * 如果模型有自定义配置则使用，否则使用全局配置
 */
export function getModelApiConfig(
  settings: AiChatSettings,
  modelName: string,
): { apiUrl: string; apiKey: string } {
  // 查找自定义模型配置
  const customModel = settings.customModels.find(m => m.model === modelName);
  
  return {
    apiUrl: (customModel?.apiUrl?.trim() || settings.apiUrl).trim(),
    apiKey: (customModel?.apiKey?.trim() || settings.apiKey).trim(),
  };
}

/**
 * 验证模型的 API 配置是否完整
 */
export function validateModelApiConfig(
  settings: AiChatSettings,
  modelName: string,
): string | null {
  const config = getModelApiConfig(settings, modelName);
  if (!config.apiUrl) return "Missing API URL";
  if (!config.apiKey) return "Missing API Key";
  if (!modelName.trim()) return "Missing model name";
  return null;
}

export async function updateAiChatSettings(
  to: "app" | "repo",
  pluginName: string,
  patch: Partial<AiChatSettings>,
): Promise<void> {
  const current = getAiChatSettings(pluginName);
  const next: AiChatSettings = { ...current, ...patch };
  await orca.plugins.setSettings(to, pluginName, next);
}
