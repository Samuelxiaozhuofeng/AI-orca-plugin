// 系统提示词支持模板变量：例如 {maxToolRounds} 会在运行时按设置值替换。
const DEFAULT_SYSTEM_PROMPT = `你是一个笔记库智能助手，帮助用户查询、搜索和理解他们的笔记内容。

## 搜索策略
- **主动重试**：首次搜索无结果时，立即尝试替代方案（最多 {maxToolRounds} 轮）：
  1. 标签变体（如 #task → #todo → #任务）
  2. 搜索降级（属性查询 → 标签搜索 → 全文搜索）
  3. 条件放宽（如 priority >= 9 → priority >= 8）
- **精准返回**：只展示精确匹配用户意图的结果，多条件默认取交集
- **优先专用工具**：总结今天用 getTodayJournal，总结近期用 getRecentJournals
- **属性查询**：不确定选项值时先调用 get_tag_schema 获取正确 ID（避免 SQLITE_ERROR）

## 写入操作规则
- **仅在明确授权时创建**：只有用户明确要求「创建」「添加」「写入」时，才可使用 createBlock/createPage/insertTag
- **确认参数**：缺少必要信息（如位置、内容）时，先询问用户而非猜测

## Skill 系统
- 用户请求涉及特定领域任务时（如翻译、写作），可用 searchSkills 查找相关技能
- 找到技能后用 getSkillDetails 获取详情，并按照技能定义的指令执行

## 已知限制
- 不支持修改或删除已有笔记（仅支持创建新块）
- 最大返回结果数为 50
- 不支持跨多个标签的组合查询（可用 query_blocks 的 OR/AND 模式）

## 回复规范
- 使用中文回复
- 搜索结果保持 [标题](orca-block:id) 格式（方便点击跳转）
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
      label: "Saved Custom Models",
      description:
        "Saved model names for quick switching in Chat Panel (models share the same API URL/Key for now). You can also add models from the Chat Panel model picker.",
      type: "array",
      defaultValue: [],
      arrayItemSchema: {
        model: {
          label: "Model Name",
          type: "string",
          defaultValue: "",
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
  });
}

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
};

export type AiModelPreset = {
  label?: string;
  model: string;
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
    const model = typeof rawModel === "string" ? rawModel.trim() : "";
    if (!model) continue;
    const label = typeof rawLabel === "string" ? rawLabel.trim() : "";
    out.push({ label, model });
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
};

const BUILTIN_MODEL_OPTIONS: AiModelOption[] = [
  { value: "gpt-4o-mini", label: "GPT-4o Mini", group: "Built-in" },
  { value: "gpt-4o", label: "GPT-4o", group: "Built-in" },
];

export function buildAiModelOptions(
  settings: AiChatSettings,
  extraModels: string[] = [],
): AiModelOption[] {
  const seen = new Set<string>();
  const out: AiModelOption[] = [];

  const add = (value: string, label: string, group: string) => {
    const v = value.trim();
    if (!v) return;
    if (seen.has(v)) return;
    seen.add(v);
    out.push({ value: v, label: label.trim() || v, group });
  };

  for (const opt of BUILTIN_MODEL_OPTIONS) add(opt.value, opt.label, opt.group ?? "Built-in");

  for (const item of settings.customModels) {
    add(item.model, item.label || item.model, "Custom");
  }
  if (settings.customModel.trim()) add(settings.customModel, settings.customModel, "Custom");

  for (const m of extraModels) add(m, m, "Other");

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

export async function updateAiChatSettings(
  to: "app" | "repo",
  pluginName: string,
  patch: Partial<AiChatSettings>,
): Promise<void> {
  const current = getAiChatSettings(pluginName);
  const next: AiChatSettings = { ...current, ...patch };
  await orca.plugins.setSettings(to, pluginName, next);
}
