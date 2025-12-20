export async function registerAiChatSettingsSchema(
  pluginName: string,
): Promise<void> {
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
      defaultValue: "",
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
  systemPrompt: "",
  temperature: 0.7,
  maxTokens: 4096,
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
    autoSaveChat: toAutoSaveChoice(raw.autoSaveChat, DEFAULT_AI_CHAT_SETTINGS.autoSaveChat),
    maxSavedSessions: toNumber(raw.maxSavedSessions, DEFAULT_AI_CHAT_SETTINGS.maxSavedSessions),
  };

  merged.apiUrl = merged.apiUrl.trim();
  merged.apiKey = merged.apiKey.trim();
  merged.model = merged.model.trim();
  merged.customModel = merged.customModel.trim();
  merged.temperature = Math.max(0, Math.min(2, merged.temperature));
  merged.maxTokens = Math.max(1, Math.floor(merged.maxTokens));
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
