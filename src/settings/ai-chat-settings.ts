// ═══════════════════════════════════════════════════════════════════════════
// 类型定义
// ═══════════════════════════════════════════════════════════════════════════

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

/** 平台下的模型配置 */
export type ProviderModel = {
  id: string;              // 模型 ID（如 gpt-4o）
  label?: string;          // 显示名称（可选）
  inputPrice?: number;     // 输入价格 $/M tokens
  outputPrice?: number;    // 输出价格 $/M tokens
  capabilities?: ModelCapability[];
  // 模型级别的设置
  temperature?: number;    // 温度（0-2）
  maxTokens?: number;      // 最大输出 token
  maxToolRounds?: number;  // 工具调用最大轮数
  currency?: CurrencyType; // 价格币种
  contextLength?: number;  // 模型上下文长度（tokens），用于本地模型防溢出
};

/** AI 平台/提供商配置 */
export type AiProvider = {
  id: string;              // 平台唯一 ID
  name: string;            // 平台显示名称
  apiUrl: string;          // API 地址
  apiKey: string;          // API 密钥
  protocol?: "openai" | "anthropic"; // API 协议类型，默认 openai
  anthropicApiPath?: string; // Anthropic 请求路径（可选；留空则自动拼接 /v1/messages 并回退 /messages）
  models: ProviderModel[]; // 该平台下的模型列表
  enabled: boolean;        // 是否启用
  isBuiltin?: boolean;     // 是否为内置平台（不可删除）
};

export type CurrencyType = "USD" | "CNY" | "EUR" | "JPY";

export const CURRENCY_SYMBOLS: Record<CurrencyType, string> = {
  USD: "$",
  CNY: "¥",
  EUR: "€",
  JPY: "¥",
};

/** 搜索引擎类型 */
export type SearchProvider = "tavily" | "bing" | "duckduckgo" | "brave" | "searxng" | "google" | "serpapi";

/** 单个搜索引擎实例配置 */
export type SearchProviderInstance = {
  id: string;              // 唯一标识
  provider: SearchProvider;
  enabled: boolean;        // 是否启用
  name?: string;           // 自定义名称（如 "Tavily 主账号"）
  // Tavily
  tavilyApiKey?: string;
  tavilySearchDepth?: "basic" | "advanced";
  tavilyIncludeAnswer?: boolean;
  tavilyIncludeDomains?: string[];
  tavilyExcludeDomains?: string[];
  // Bing
  bingApiKey?: string;
  bingMarket?: string;
  // DuckDuckGo
  duckduckgoRegion?: string;
  // Brave
  braveApiKey?: string;
  braveCountry?: string;
  braveSearchLang?: string;
  braveSafeSearch?: "off" | "moderate" | "strict";  // 图片搜索安全级别
  // SearXNG
  searxngInstanceUrl?: string;
  searxngLanguage?: string;
  searxngSafeSearch?: 0 | 1 | 2;  // 图片搜索安全级别
  // Google Custom Search
  googleApiKey?: string;           // Google Cloud API Key
  googleSearchEngineId?: string;   // Programmable Search Engine ID (cx)
  googleGl?: string;               // 国家代码，如 "cn", "us"
  googleHl?: string;               // 界面语言，如 "zh-CN", "en"
  googleLr?: string;               // 搜索结果语言，如 "lang_zh-CN"
  googleSafe?: "off" | "active";   // 安全搜索
  // SerpApi (Google Images)
  serpapiApiKey?: string;
  serpapiGl?: string;              // 国家代码
  serpapiHl?: string;              // 语言
};

/** 联网搜索配置 - 支持多引擎故障转移 */
export type WebSearchConfig = {
  enabled: boolean;
  maxResults: number;
  // 搜索引擎实例列表（按优先级排序，第一个失败自动尝试下一个）
  instances: SearchProviderInstance[];
  // 图像搜索配置
  imageSearchEnabled: boolean;
  maxImageResults: number;
  // 兼容旧版单引擎配置
  provider?: SearchProvider;
  tavilyApiKey?: string;
  tavilySearchDepth?: "basic" | "advanced";
  tavilyIncludeAnswer?: boolean;
  tavilyIncludeDomains?: string[];
  tavilyExcludeDomains?: string[];
  serperApiKey?: string;
  serperCountry?: string;
  serperLanguage?: string;
  bingApiKey?: string;
  bingMarket?: string;
  duckduckgoRegion?: string;
};

/** 新的设置结构 */
export type AiChatSettings = {
  providers: AiProvider[];           // 平台列表
  selectedProviderId: string;        // 当前选中的平台 ID
  selectedModelId: string;           // 当前选中的模型 ID
  // 以下为全局默认值，模型可以覆盖
  temperature: number;
  maxTokens: number;
  maxToolRounds: number;
  currency: CurrencyType;
  // Token 优化设置
  maxHistoryMessages: number;        // 最大历史消息数（0=不限制）
  maxToolResultChars: number;        // 工具结果最大字符数（0=不限制）
  maxContextChars: number;           // 上下文最大字符数
  // 流式超时设置
  streamTimeout: number;             // 流式响应超时（毫秒），本地模型建议设置更长
  // 联网搜索设置
  webSearch: WebSearchConfig;
  // 兼容旧版本的字段（迁移用）
  apiKey?: string;
  apiUrl?: string;
  model?: string;
  customModel?: string;
  customModels?: any[];
};

// ═══════════════════════════════════════════════════════════════════════════
// 默认平台配置
// ═══════════════════════════════════════════════════════════════════════════

const DEFAULT_PROVIDERS: AiProvider[] = [
  {
    id: "openai",
    name: "OpenAI",
    apiUrl: "https://api.openai.com/v1",
    apiKey: "",
    protocol: "openai",
    enabled: true,
    isBuiltin: true,
    models: [
      { id: "gpt-4o", label: "GPT-4o", inputPrice: 2.5, outputPrice: 10, capabilities: ["vision", "tools"], temperature: 0.7, maxTokens: 4096, maxToolRounds: 5, currency: "USD" },
      { id: "gpt-4o-mini", label: "GPT-4o Mini", inputPrice: 0.15, outputPrice: 0.6, capabilities: ["vision", "tools"], temperature: 0.7, maxTokens: 4096, maxToolRounds: 5, currency: "USD" },
      { id: "o1", label: "o1", inputPrice: 15, outputPrice: 60, capabilities: ["reasoning"], temperature: 1, maxTokens: 8192, maxToolRounds: 3, currency: "USD" },
      { id: "o1-mini", label: "o1 Mini", inputPrice: 3, outputPrice: 12, capabilities: ["reasoning"], temperature: 1, maxTokens: 8192, maxToolRounds: 3, currency: "USD" },
    ],
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    apiUrl: "https://api.deepseek.com/v1",
    apiKey: "",
    protocol: "openai",
    enabled: true,
    isBuiltin: true,
    models: [
      { id: "deepseek-chat", label: "DeepSeek Chat", inputPrice: 0.14, outputPrice: 0.28, capabilities: ["tools"], temperature: 0.7, maxTokens: 4096, maxToolRounds: 5, currency: "USD" },
      { id: "deepseek-reasoner", label: "DeepSeek Reasoner", inputPrice: 0.55, outputPrice: 2.19, capabilities: ["reasoning"], temperature: 1, maxTokens: 8192, maxToolRounds: 3, currency: "USD" },
    ],
  },
];

const DEFAULT_AI_CHAT_SETTINGS: AiChatSettings = {
  providers: DEFAULT_PROVIDERS,
  selectedProviderId: "openai",
  selectedModelId: "gpt-4o-mini",
  // 全局默认值（模型未设置时使用）
  temperature: 0.7,
  maxTokens: 4096,
  maxToolRounds: 5,
  currency: "USD",
  // Token 优化默认值
  maxHistoryMessages: 0,           // 0=不限制（改用动态压缩）
  maxToolResultChars: 8000,        // 工具结果最大字符数（0=不限制）
  maxContextChars: 60000,          // 恢复原来的 60000
  // 流式超时设置
  streamTimeout: 30000,            // 默认 30 秒，本地模型可设置 120000（2分钟）或更长
  // 联网搜索设置
  webSearch: {
    enabled: false,
    maxResults: 5,
    instances: [], // 用户添加的搜索引擎实例
    imageSearchEnabled: true, // 默认启用图像搜索
    maxImageResults: 3, // 默认最多3张图片
  },
};


// ═══════════════════════════════════════════════════════════════════════════
// 设置 Schema 注册
// ═══════════════════════════════════════════════════════════════════════════

const PROVIDERS_STORAGE_KEY = "ai-providers-config";
const PROVIDERS_LOCALSTORAGE_KEY = "ai-chat-providers-config";

export async function registerAiChatSettingsSchema(
  pluginName: string,
): Promise<void> {
  // systemPrompt 已硬编码，不再暴露给用户配置
  await orca.plugins.setSettingsSchema(pluginName, {});
}

// ═══════════════════════════════════════════════════════════════════════════
// 工具函数
// ═══════════════════════════════════════════════════════════════════════════

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

function toCurrency(value: unknown, fallback: CurrencyType): CurrencyType {
  if (value === "USD" || value === "CNY" || value === "EUR" || value === "JPY") {
    return value;
  }
  return fallback;
}

function isCurrency(value: unknown): value is CurrencyType {
  return value === "USD" || value === "CNY" || value === "EUR" || value === "JPY";
}

function isModelCapability(value: unknown): value is ModelCapability {
  return value === "vision"
    || value === "web"
    || value === "reasoning"
    || value === "tools"
    || value === "rerank"
    || value === "embedding";
}

function normalizeProviderModels(
  models: unknown,
  fallbackModels?: ProviderModel[],
): ProviderModel[] {
  // 兼容旧配置：models 可能是逗号/换行分隔的字符串
  if (typeof models === "string") {
    const text = models.trim();
    if (!text) {
      return fallbackModels ? JSON.parse(JSON.stringify(fallbackModels)) : [];
    }

    // 兼容：如果用户手动存成了 JSON 数组字符串
    if (text.startsWith("[") && text.endsWith("]")) {
      try {
        const parsed = JSON.parse(text);
        return normalizeProviderModels(parsed, fallbackModels);
      } catch {
        // fallback to plain split
      }
    }

    const parts = text.split(/[,，;\r\n]+/);
    const normalized: ProviderModel[] = [];
    const seen = new Set<string>();
    for (const part of parts) {
      const id = part.trim();
      if (!id || seen.has(id)) continue;
      seen.add(id);
      normalized.push({ id, label: id });
    }
    if (normalized.length > 0) return normalized;
    return fallbackModels ? JSON.parse(JSON.stringify(fallbackModels)) : [];
  }

  if (!Array.isArray(models) || models.length === 0) {
    return fallbackModels ? JSON.parse(JSON.stringify(fallbackModels)) : [];
  }

  const normalized: ProviderModel[] = [];
  for (const model of models) {
    if (typeof model === "string") {
      // 兼容：数组里可能出现 "a, b, c" 这种老格式
      const parts = model.split(/[,，;\r\n]+/);
      for (const part of parts) {
        const id = part.trim();
        if (id) normalized.push({ id, label: id });
      }
      continue;
    }

    if (!model || typeof model !== "object") continue;

    const raw = model as Record<string, any>;
    const idSource = typeof raw.id === "string"
      ? raw.id
      : typeof raw.value === "string"
      ? raw.value
      : typeof raw.name === "string"
      ? raw.name
      : "";
    const id = typeof idSource === "string" ? idSource.trim() : "";
    if (!id) continue;

    const labelSource = typeof raw.label === "string"
      ? raw.label
      : typeof raw.name === "string"
      ? raw.name
      : undefined;
    const capabilities = Array.isArray(raw.capabilities)
      ? raw.capabilities.filter((cap) => isModelCapability(cap))
      : undefined;

    normalized.push({
      id,
      label: labelSource?.trim() || undefined,
      inputPrice: typeof raw.inputPrice === "number" ? raw.inputPrice : undefined,
      outputPrice: typeof raw.outputPrice === "number" ? raw.outputPrice : undefined,
      capabilities: capabilities && capabilities.length > 0 ? capabilities : undefined,
      temperature: typeof raw.temperature === "number" ? raw.temperature : undefined,
      maxTokens: typeof raw.maxTokens === "number" ? raw.maxTokens : undefined,
      maxToolRounds: typeof raw.maxToolRounds === "number" ? raw.maxToolRounds : undefined,
      currency: isCurrency(raw.currency) ? raw.currency : undefined,
    });
  }

  const deduped: ProviderModel[] = [];
  const seen = new Set<string>();
  for (const m of normalized) {
    if (!m?.id) continue;
    if (seen.has(m.id)) continue;
    seen.add(m.id);
    deduped.push(m);
  }

  if (deduped.length === 0 && fallbackModels?.length) {
    return JSON.parse(JSON.stringify(fallbackModels));
  }

  return deduped;
}

// ═══════════════════════════════════════════════════════════════════════════
// 获取和更新设置
// ═══════════════════════════════════════════════════════════════════════════

/** 存储的配置数据结构 */
type StoredConfig = {
  providers: AiProvider[];
  selectedProviderId: string;
  selectedModelId: string;
  temperature: number;
  maxTokens: number;
  maxToolRounds: number;
  currency: CurrencyType;
  // Token 优化设置
  maxHistoryMessages?: number;
  maxToolResultChars?: number;
  maxContextChars?: number;
  // 流式超时设置
  streamTimeout?: number;
  // 联网搜索设置
  webSearch?: WebSearchConfig;
};

// 内存缓存（避免频繁读取）
let cachedConfig: StoredConfig | null = null;
let cachePluginName: string | null = null;

/** 从存储加载配置（优先从 Orca 插件存储加载，回退到 localStorage） */
async function loadStoredConfig(pluginName: string): Promise<StoredConfig | null> {
  let raw: string | null = null;

  // 首先尝试从 Orca 插件存储加载
  try {
    raw = await orca.plugins.getData(pluginName, PROVIDERS_STORAGE_KEY);
  } catch (e) {
    console.warn('[AiChatSettings] Failed to load from Orca storage:', e);
  }

  // 如果 Orca 存储失败或为空，尝试从 localStorage 加载
  if (!raw && typeof localStorage !== "undefined") {
    try {
      raw = localStorage.getItem(PROVIDERS_LOCALSTORAGE_KEY);
    } catch (e) {
      console.warn('[AiChatSettings] Failed to load from localStorage:', e);
    }
  }

  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      return parsed;
    } catch (e) {
      console.warn('[AiChatSettings] Failed to parse stored config:', e);
    }
  }

  return null;
}

/** 保存配置到存储（双重保存：Orca 插件存储 + localStorage） */
async function saveStoredConfig(pluginName: string, config: StoredConfig): Promise<void> {
  const configJson = JSON.stringify(config);

  // 保存到 Orca 插件存储
  try {
    await orca.plugins.setData(pluginName, PROVIDERS_STORAGE_KEY, configJson);
  } catch (e) {
    console.error('[AiChatSettings] Failed to save to Orca storage:', e);
    // 不抛出异常，继续尝试保存到 localStorage
  }

  // 同时保存到 localStorage 作为备份
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.setItem(PROVIDERS_LOCALSTORAGE_KEY, configJson);
    } catch (e) {
      console.warn('[AiChatSettings] Failed to save to localStorage:', e);
    }
  }

  // 更新内存缓存
  cachedConfig = config;
  cachePluginName = pluginName;
}

/** 同步获取设置（使用缓存，首次需要先调用 initAiChatSettings） */
export function getAiChatSettings(pluginName: string): AiChatSettings {
  const raw = (orca.state.plugins as any)?.[pluginName]?.settings ?? {};
  
  // 使用缓存的配置
  const config = (cachePluginName === pluginName && cachedConfig) ? cachedConfig : null;
  
  // 如果有缓存，使用缓存的 providers；为空时回退到默认值
  const fallbackProviders: AiProvider[] = JSON.parse(JSON.stringify(DEFAULT_PROVIDERS));
  const rawProviders = config?.providers;
  let providers = Array.isArray(rawProviders) && rawProviders.length > 0
    ? rawProviders
    : fallbackProviders;

  // 修复旧配置：缺失字段/模型时补默认值
  if (providers.length > 0) {
    for (const provider of providers) {
      const fallback = fallbackProviders.find((p) => p.id === provider.id);
      if (provider.enabled === undefined) {
        provider.enabled = fallback?.enabled ?? true;
      }
      if (!provider.name) {
        provider.name = fallback?.name ?? provider.id;
      }
      if (!provider.apiUrl) {
        provider.apiUrl = fallback?.apiUrl ?? provider.apiUrl;
      }
      if (!provider.protocol) {
        provider.protocol = fallback?.protocol ?? "openai";
      }
      if (typeof (provider as any).anthropicApiPath !== "string") {
        (provider as any).anthropicApiPath = undefined;
      } else {
        const trimmed = String((provider as any).anthropicApiPath).trim();
        (provider as any).anthropicApiPath = trimmed ? trimmed : undefined;
      }
      if (provider.isBuiltin === undefined && fallback?.isBuiltin !== undefined) {
        provider.isBuiltin = fallback.isBuiltin;
      }
      provider.models = normalizeProviderModels(provider.models, fallback?.models);
    }
  }

  const totalModels = providers.reduce((sum, provider) => sum + provider.models.length, 0);
  if (totalModels === 0 && fallbackProviders.length > 0) {
    const existingIds = new Set(providers.map((provider) => provider.id));
    for (const fallback of fallbackProviders) {
      if (!existingIds.has(fallback.id)) {
        providers.push(JSON.parse(JSON.stringify(fallback)));
      }
    }
  }
  
  // 兼容旧版迁移
  if (!config && raw.apiKey) {
    const openai = providers.find((p: AiProvider) => p.id === "openai");
    if (openai) {
      openai.apiKey = raw.apiKey;
      if (raw.apiUrl) openai.apiUrl = raw.apiUrl;
    }
  }
  
  const merged: AiChatSettings = {
    providers,
    selectedProviderId: config?.selectedProviderId || DEFAULT_AI_CHAT_SETTINGS.selectedProviderId,
    selectedModelId: config?.selectedModelId || DEFAULT_AI_CHAT_SETTINGS.selectedModelId,
    temperature: config?.temperature ?? DEFAULT_AI_CHAT_SETTINGS.temperature,
    maxTokens: config?.maxTokens ?? DEFAULT_AI_CHAT_SETTINGS.maxTokens,
    maxToolRounds: config?.maxToolRounds ?? DEFAULT_AI_CHAT_SETTINGS.maxToolRounds,
    currency: config?.currency ?? DEFAULT_AI_CHAT_SETTINGS.currency,
    // Token 优化设置
    maxHistoryMessages: config?.maxHistoryMessages ?? DEFAULT_AI_CHAT_SETTINGS.maxHistoryMessages,
    maxToolResultChars: config?.maxToolResultChars ?? DEFAULT_AI_CHAT_SETTINGS.maxToolResultChars,
    maxContextChars: config?.maxContextChars ?? DEFAULT_AI_CHAT_SETTINGS.maxContextChars,
    // 流式超时设置
    streamTimeout: config?.streamTimeout ?? DEFAULT_AI_CHAT_SETTINGS.streamTimeout,
    // 联网搜索设置
    webSearch: config?.webSearch ?? DEFAULT_AI_CHAT_SETTINGS.webSearch,
  };

  merged.temperature = Math.max(0, Math.min(2, merged.temperature));
  merged.maxTokens = Math.max(1, Math.floor(merged.maxTokens));
  merged.maxToolRounds = Math.max(3, Math.min(10, Math.floor(merged.maxToolRounds)));
  // Token 优化设置范围限制
  merged.maxHistoryMessages = Math.max(0, Math.floor(merged.maxHistoryMessages));
  merged.maxToolResultChars = Math.max(0, Math.floor(merged.maxToolResultChars));
  merged.maxContextChars = Math.max(5000, Math.floor(merged.maxContextChars));
  merged.streamTimeout = Math.max(10000, Math.floor(merged.streamTimeout)); // 最小 10 秒

  return merged;
}

/** 初始化设置（异步加载存储的配置） */
export async function initAiChatSettings(pluginName: string): Promise<void> {
  const config = await loadStoredConfig(pluginName);
  if (config) {
    cachedConfig = config;
    cachePluginName = pluginName;
  }
}

export async function updateAiChatSettings(
  to: "app" | "repo",
  pluginName: string,
  patch: Partial<AiChatSettings>,
): Promise<void> {
  const current = getAiChatSettings(pluginName);
  const next = { ...current, ...patch };
  
  // 构建存储配置
  const config: StoredConfig = {
    providers: next.providers,
    selectedProviderId: next.selectedProviderId,
    selectedModelId: next.selectedModelId,
    temperature: next.temperature,
    maxTokens: next.maxTokens,
    maxToolRounds: next.maxToolRounds,
    currency: next.currency,
    // Token 优化设置
    maxHistoryMessages: next.maxHistoryMessages,
    maxToolResultChars: next.maxToolResultChars,
    maxContextChars: next.maxContextChars,
    // 流式超时设置
    streamTimeout: next.streamTimeout,
    // 联网搜索设置
    webSearch: next.webSearch,
  };
  
  // 保存到 data 存储
  await saveStoredConfig(pluginName, config);
}

// ═══════════════════════════════════════════════════════════════════════════
// 平台和模型操作
// ═══════════════════════════════════════════════════════════════════════════

/** 获取当前选中的平台 */
export function getSelectedProvider(settings: AiChatSettings): AiProvider | undefined {
  return settings.providers.find(p => p.id === settings.selectedProviderId);
}

/** 获取当前选中的模型 */
export function getSelectedModel(settings: AiChatSettings): ProviderModel | undefined {
  const provider = getSelectedProvider(settings);
  return provider?.models.find(m => m.id === settings.selectedModelId);
}

/** 获取当前 API 配置 */
export function getCurrentApiConfig(settings: AiChatSettings): {
  apiUrl: string;
  apiKey: string;
  model: string;
  protocol: "openai" | "anthropic";
  anthropicApiPath?: string;
} {
  const provider = getSelectedProvider(settings);
  return {
    apiUrl: provider?.apiUrl || "",
    apiKey: provider?.apiKey || "",
    model: settings.selectedModelId,
    protocol: provider?.protocol === "anthropic" ? "anthropic" : "openai",
    anthropicApiPath: typeof provider?.anthropicApiPath === "string" ? provider.anthropicApiPath : undefined,
  };
}

/** 验证当前配置是否完整 */
export function validateCurrentConfig(settings: AiChatSettings): string | null {
  const provider = getSelectedProvider(settings);
  if (!provider) return "请选择一个平台";
  if (!provider.apiUrl.trim()) return `请设置 ${provider.name} 的 API 地址`;
  if (!provider.apiKey.trim()) return `请设置 ${provider.name} 的 API 密钥`;
  if (!settings.selectedModelId.trim()) return "请选择一个模型";
  return null;
}

/** 检查模型是否支持 function calling (tools) */
export function modelSupportsTools(settings: AiChatSettings, modelId?: string): boolean {
  const targetModelId = modelId || settings.selectedModelId;
  
  // 查找模型
  for (const provider of settings.providers) {
    const model = provider.models.find(m => m.id === targetModelId);
    if (model) {
      // 如果模型明确配置了 capabilities，检查是否包含 "tools"
      if (model.capabilities && model.capabilities.length > 0) {
        return model.capabilities.includes("tools");
      }
      // 没有配置 capabilities，默认支持
      // 即使模型输出 XML 格式的 <tool_call>，适配层也能解析
      return true;
    }
  }
  
  // 未找到模型，默认支持（依赖适配层）
  return true;
}

/** 创建新平台 */
export function createProvider(name: string): AiProvider {
  return {
    id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: name || "新平台",
    apiUrl: "https://api.openai.com/v1",
    apiKey: "",
    protocol: "openai",
    anthropicApiPath: undefined,
    enabled: true,
    models: [],
  };
}

/** 添加模型到平台 */
export function addModelToProvider(provider: AiProvider, modelId: string, label?: string): ProviderModel {
  const model: ProviderModel = {
    id: modelId,
    label: label || modelId,
  };
  provider.models.push(model);
  return model;
}

// ═══════════════════════════════════════════════════════════════════════════
// 兼容旧版 API（逐步废弃）
// ═══════════════════════════════════════════════════════════════════════════

/** @deprecated 使用 getCurrentApiConfig */
export function getModelApiConfig(
  settings: AiChatSettings,
  modelName: string,
  providerId?: string,
): { apiUrl: string; apiKey: string; protocol: "openai" | "anthropic"; anthropicApiPath?: string } {
  // 如果指定了 providerId，直接查找该 provider
  if (providerId) {
    const provider = settings.providers.find(p => p.id === providerId);
    if (provider && provider.apiUrl?.trim() && provider.apiKey?.trim()) {
      return {
        apiUrl: provider.apiUrl,
        apiKey: provider.apiKey,
        protocol: provider.protocol === "anthropic" ? "anthropic" : "openai",
        anthropicApiPath: typeof provider.anthropicApiPath === "string" ? provider.anthropicApiPath : undefined,
      };
    }
  }

  // 优先选择已配置 API 的提供商，避免重名模型命中未配置的内置项
  const matchedProviders = settings.providers.filter((provider) =>
    provider.models.some((m) => m.id === modelName)
  );

  // 1) 如果当前选中 provider 含该模型且配置完整，优先使用
  const selectedProvider = matchedProviders.find(
    (p) => p.id === settings.selectedProviderId,
  );
  if (selectedProvider && selectedProvider.apiUrl?.trim() && selectedProvider.apiKey?.trim()) {
    return {
      apiUrl: selectedProvider.apiUrl,
      apiKey: selectedProvider.apiKey,
      protocol: selectedProvider.protocol === "anthropic" ? "anthropic" : "openai",
      anthropicApiPath: typeof selectedProvider.anthropicApiPath === "string" ? selectedProvider.anthropicApiPath : undefined,
    };
  }

  // 2) 其它 provider 按“配置完整+启用”优先级选择
  const scored = matchedProviders
    .map((p) => {
      const hasApi = !!p.apiUrl?.trim() && !!p.apiKey?.trim();
      const enabled = p.enabled !== false;
      const score = (hasApi ? 2 : 0) + (enabled ? 1 : 0);
      return { p, score };
    })
    .sort((a, b) => b.score - a.score);

  if (scored.length > 0 && scored[0].score > 0) {
    const best = scored[0].p;
    return {
      apiUrl: best.apiUrl,
      apiKey: best.apiKey,
      protocol: best.protocol === "anthropic" ? "anthropic" : "openai",
      anthropicApiPath: typeof best.anthropicApiPath === "string" ? best.anthropicApiPath : undefined,
    };
  }
  // 回退到当前选中的平台
  const current = getCurrentApiConfig(settings);
  return { apiUrl: current.apiUrl, apiKey: current.apiKey, protocol: current.protocol, anthropicApiPath: current.anthropicApiPath };
}

/** @deprecated */
export function resolveAiModel(settings: AiChatSettings): string {
  return settings.selectedModelId;
}
