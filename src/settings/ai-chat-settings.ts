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
  - ❌ **绝对禁止**使用 [数字] 格式（如 [4209]），这种格式无法渲染为链接！
  - ❌ **绝对禁止**把工具返回的链接改成 [数字] 格式
- block 引用直接写 [标题](orca-block:id)，不要用括号包裹，不要写成 ([标题](orca-block:id))
- **引用位置决定格式（重要）**：
  - **句末引用**（标注信息来源，类似学术论文的引用标记）：
    - 格式：直接写 orca-block:数字（不需要方括号！）
    - 示例：用户在日记中提到了这件事orca-block:123
    - 效果：系统自动渲染成彩色小圆点 ●，悬停可预览，点击可跳转
    - ❌ 错误格式：[123](orca-block:123) - 这样写不会变成小圆点！
  - **句中提及**（作为句子的一部分，需要让用户知道具体是什么）：
    - 格式：[真实标题](orca-block:id)
    - 示例：根据[项目计划](orca-block:123)的安排，我们需要...
    - 效果：显示为可点击的链接文字
  - ⚠️ **判断标准**：如果删掉这个引用后句子不通顺，说明需要用标题格式；如果删掉后句子仍然完整，可以用小圆点格式
  - ❌ 禁止在句子中间使用 orca-block:数字 格式，小圆点出现在句中会导致阅读困难
- **时间线展示**：当展示有时间顺序的事件（如项目进度、历史记录、计划安排）时，使用时间线格式：
  \`\`\`timeline
  2024-12-01 | 事件标题 | 可选描述
  2024-12-15 | 另一个事件
  \`\`\`
- **图片展示**：
  - 直接使用 Markdown 图片语法 ![描述](路径)，不要用文字描述图片内容
  - ⚠️ **禁止凭记忆写文件名**：必须从工具返回的内容中复制完整路径，不要手打或凭印象
  - 如果不确定文件名，先调用 getBlock 获取图片块内容，从中提取正确的文件路径
- 保持简洁，直接回答问题
- 所有尝试失败时：说明尝试了哪些方法、可能原因、给出建议
`;

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
};

/** AI 平台/提供商配置 */
export type AiProvider = {
  id: string;              // 平台唯一 ID
  name: string;            // 平台显示名称
  apiUrl: string;          // API 地址
  apiKey: string;          // API 密钥
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

/** 新的设置结构 */
export type AiChatSettings = {
  providers: AiProvider[];           // 平台列表
  selectedProviderId: string;        // 当前选中的平台 ID
  selectedModelId: string;           // 当前选中的模型 ID
  systemPrompt: string;
  // 以下为全局默认值，模型可以覆盖
  temperature: number;
  maxTokens: number;
  maxToolRounds: number;
  currency: CurrencyType;
  // Token 优化设置
  maxHistoryMessages: number;        // 最大历史消息数（0=不限制）
  maxToolResultChars: number;        // 工具结果最大字符数（0=不限制）
  maxContextChars: number;           // 上下文最大字符数
  // 动态压缩设置
  enableCompression: boolean;        // 是否启用压缩
  compressAfterMessages: number;     // 超过多少条后开始压缩旧消息（5-20）
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
    enabled: true,
    isBuiltin: true,
    models: [
      { id: "deepseek-chat", label: "DeepSeek Chat", inputPrice: 0.14, outputPrice: 0.28, capabilities: ["tools"], temperature: 0.7, maxTokens: 4096, maxToolRounds: 5, currency: "USD" },
      { id: "deepseek-reasoner", label: "DeepSeek Reasoner", inputPrice: 0.55, outputPrice: 2.19, capabilities: ["reasoning"], temperature: 1, maxTokens: 8192, maxToolRounds: 3, currency: "USD" },
    ],
  },
];

export const DEFAULT_AI_CHAT_SETTINGS: AiChatSettings = {
  providers: DEFAULT_PROVIDERS,
  selectedProviderId: "openai",
  selectedModelId: "gpt-4o-mini",
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
  // 全局默认值（模型未设置时使用）
  temperature: 0.7,
  maxTokens: 4096,
  maxToolRounds: 5,
  currency: "USD",
  // Token 优化默认值
  maxHistoryMessages: 0,           // 0=不限制（改用动态压缩）
  maxToolResultChars: 0,           // 0=不限制
  maxContextChars: 60000,          // 恢复原来的 60000
  // 动态压缩设置
  enableCompression: true,         // 默认启用压缩
  compressAfterMessages: 10,       // 超过 10 条后开始压缩旧消息
};


// ═══════════════════════════════════════════════════════════════════════════
// 设置 Schema 注册
// ═══════════════════════════════════════════════════════════════════════════

const PROVIDERS_STORAGE_KEY = "ai-providers-config";

export async function registerAiChatSettingsSchema(
  pluginName: string,
): Promise<void> {
  // 只注册需要在设置页面显示的字段
  await orca.plugins.setSettingsSchema(pluginName, {
    // 系统提示词（在设置页面显示）
    systemPrompt: { label: "System Prompt", type: "string", defaultValue: DEFAULT_SYSTEM_PROMPT },
  });
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
  enableCompression?: boolean;
  compressAfterMessages?: number;
};

// 内存缓存（避免频繁读取）
let cachedConfig: StoredConfig | null = null;
let cachePluginName: string | null = null;

/** 从存储加载配置 */
async function loadStoredConfig(pluginName: string): Promise<StoredConfig | null> {
  try {
    const raw = await orca.plugins.getData(pluginName, PROVIDERS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      console.log("[ai-chat-settings] Loaded config from storage:", {
        providersCount: parsed.providers?.length,
        selectedProviderId: parsed.selectedProviderId,
        selectedModelId: parsed.selectedModelId,
      });
      return parsed;
    }
  } catch (e) {
    console.warn("[ai-chat-settings] Failed to load config:", e);
  }
  return null;
}

/** 保存配置到存储 */
async function saveStoredConfig(pluginName: string, config: StoredConfig): Promise<void> {
  try {
    await orca.plugins.setData(pluginName, PROVIDERS_STORAGE_KEY, JSON.stringify(config));
    cachedConfig = config;
    cachePluginName = pluginName;
    console.log("[ai-chat-settings] Config saved to storage");
  } catch (e) {
    console.error("[ai-chat-settings] Failed to save config:", e);
    throw e;
  }
}

/** 同步获取设置（使用缓存，首次需要先调用 initAiChatSettings） */
export function getAiChatSettings(pluginName: string): AiChatSettings {
  const raw = (orca.state.plugins as any)?.[pluginName]?.settings ?? {};
  
  // 使用缓存的配置
  const config = (cachePluginName === pluginName && cachedConfig) ? cachedConfig : null;
  
  // 如果有缓存，使用缓存的 providers
  const providers = config?.providers || JSON.parse(JSON.stringify(DEFAULT_PROVIDERS));
  
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
    systemPrompt: toString(raw.systemPrompt, DEFAULT_AI_CHAT_SETTINGS.systemPrompt),
    temperature: config?.temperature ?? DEFAULT_AI_CHAT_SETTINGS.temperature,
    maxTokens: config?.maxTokens ?? DEFAULT_AI_CHAT_SETTINGS.maxTokens,
    maxToolRounds: config?.maxToolRounds ?? DEFAULT_AI_CHAT_SETTINGS.maxToolRounds,
    currency: config?.currency ?? DEFAULT_AI_CHAT_SETTINGS.currency,
    // Token 优化设置
    maxHistoryMessages: config?.maxHistoryMessages ?? DEFAULT_AI_CHAT_SETTINGS.maxHistoryMessages,
    maxToolResultChars: config?.maxToolResultChars ?? DEFAULT_AI_CHAT_SETTINGS.maxToolResultChars,
    maxContextChars: config?.maxContextChars ?? DEFAULT_AI_CHAT_SETTINGS.maxContextChars,
    enableCompression: config?.enableCompression ?? DEFAULT_AI_CHAT_SETTINGS.enableCompression,
    compressAfterMessages: config?.compressAfterMessages ?? DEFAULT_AI_CHAT_SETTINGS.compressAfterMessages,
  };

  merged.temperature = Math.max(0, Math.min(2, merged.temperature));
  merged.maxTokens = Math.max(1, Math.floor(merged.maxTokens));
  merged.maxToolRounds = Math.max(3, Math.min(10, Math.floor(merged.maxToolRounds)));
  // Token 优化设置范围限制
  merged.maxHistoryMessages = Math.max(0, Math.floor(merged.maxHistoryMessages));
  merged.maxToolResultChars = Math.max(0, Math.floor(merged.maxToolResultChars));
  merged.maxContextChars = Math.max(5000, Math.floor(merged.maxContextChars));
  merged.compressAfterMessages = Math.max(5, Math.min(20, Math.floor(merged.compressAfterMessages)));

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
    enableCompression: next.enableCompression,
    compressAfterMessages: next.compressAfterMessages,
  };
  
  console.log("[ai-chat-settings] Saving config:", {
    selectedProviderId: config.selectedProviderId,
    selectedModelId: config.selectedModelId,
    providersCount: config.providers.length,
  });
  
  // 保存到 data 存储
  await saveStoredConfig(pluginName, config);
  
  // 同时保存 systemPrompt 到 settings（用于设置页面）
  if (patch.systemPrompt !== undefined) {
    await orca.plugins.setSettings(to, pluginName, { systemPrompt: next.systemPrompt });
  }
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
export function getCurrentApiConfig(settings: AiChatSettings): { apiUrl: string; apiKey: string; model: string } {
  const provider = getSelectedProvider(settings);
  return {
    apiUrl: provider?.apiUrl || "",
    apiKey: provider?.apiKey || "",
    model: settings.selectedModelId,
  };
}

/** 获取当前模型的完整配置（包括模型级别的设置，回退到全局默认值） */
export function getModelConfig(settings: AiChatSettings, modelId?: string): {
  temperature: number;
  maxTokens: number;
  maxToolRounds: number;
  currency: CurrencyType;
  inputPrice: number;
  outputPrice: number;
} {
  const targetModelId = modelId || settings.selectedModelId;
  
  // 查找模型
  let model: ProviderModel | undefined;
  for (const provider of settings.providers) {
    model = provider.models.find(m => m.id === targetModelId);
    if (model) break;
  }
  
  return {
    temperature: model?.temperature ?? settings.temperature,
    maxTokens: model?.maxTokens ?? settings.maxTokens,
    maxToolRounds: model?.maxToolRounds ?? settings.maxToolRounds,
    currency: model?.currency ?? settings.currency,
    inputPrice: model?.inputPrice ?? 0,
    outputPrice: model?.outputPrice ?? 0,
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

/** 创建新平台 */
export function createProvider(name: string): AiProvider {
  return {
    id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    name: name || "新平台",
    apiUrl: "https://api.openai.com/v1",
    apiKey: "",
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
): { apiUrl: string; apiKey: string } {
  // 查找包含该模型的平台
  for (const provider of settings.providers) {
    if (provider.models.find(m => m.id === modelName)) {
      return {
        apiUrl: provider.apiUrl,
        apiKey: provider.apiKey,
      };
    }
  }
  // 回退到当前选中的平台
  const current = getCurrentApiConfig(settings);
  return { apiUrl: current.apiUrl, apiKey: current.apiKey };
}

/** @deprecated 使用 validateCurrentConfig */
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

/** 构建模型选项列表（用于下拉菜单） */
export type AiModelOption = {
  value: string;
  label: string;
  group?: string;
  providerId?: string;
  apiUrl?: string;
  apiKey?: string;
  inputPrice?: number;
  outputPrice?: number;
  capabilities?: ModelCapability[];
};

export function buildAiModelOptions(settings: AiChatSettings): AiModelOption[] {
  const options: AiModelOption[] = [];
  
  for (const provider of settings.providers) {
    if (!provider.enabled) continue;
    
    for (const model of provider.models) {
      options.push({
        value: model.id,
        label: model.label || model.id,
        group: provider.name,
        providerId: provider.id,
        apiUrl: provider.apiUrl,
        apiKey: provider.apiKey,
        inputPrice: model.inputPrice,
        outputPrice: model.outputPrice,
        capabilities: model.capabilities,
      });
    }
  }
  
  return options;
}

/** @deprecated */
export function resolveAiModel(settings: AiChatSettings): string {
  return settings.selectedModelId;
}

/** @deprecated */
export function validateAiChatSettings(settings: AiChatSettings): string | null {
  return validateCurrentConfig(settings);
}

/** @deprecated */
export function validateAiChatSettingsWithModel(
  settings: AiChatSettings,
  modelOverride: string,
): string | null {
  const config = getModelApiConfig(settings, modelOverride);
  if (!config.apiUrl) return "Missing API URL";
  if (!config.apiKey) return "Missing API Key";
  if (!modelOverride.trim()) return "Missing model";
  return null;
}

// 兼容旧版类型
export type AiModelPreset = ProviderModel;
