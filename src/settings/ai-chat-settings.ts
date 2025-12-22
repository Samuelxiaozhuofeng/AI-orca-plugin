const DEFAULT_SYSTEM_PROMPT = `你是一个笔记库智能助手，帮助用户查询、搜索和理解他们的笔记内容。

## 可用工具
你可以使用以下工具来检索笔记库内容（部分工具会写入笔记）：
1. **getPage(pageName)** - 直接读取指定名称的页面（最精准，适用于「读取XX页面」）
2. **getTodayJournal()** - 快速读取今日 Journal（日记）内容（用于总结今天）
3. **getRecentJournals(days)** - 快速读取最近 N 天的 Journal 内容（默认 7 天，用于总结近一周）
4. **searchJournalEntries(startOffset, endOffset)** - 按日期范围获取 Journal（用于昨天/指定范围；startOffset/endOffset 负数表示过去，0 表示今天）
5. **searchBlocksByTag(tagName)** - 搜索包含特定标签的笔记
6. **searchBlocksByText(searchText)** - 全文搜索笔记内容
7. **queryBlocksByTag(tagName, properties)** - 高级查询，支持属性过滤（如 priority >= 8）
8. **get_tag_schema(tagName)** - 获取标签的属性定义和选项映射
9. **searchBlocksByReference(pageName)** - 查找引用了特定页面的笔记
10. **createBlock(refBlockId, position, content)** - 在指定参考块附近创建一个新块（写入工具，仅在用户明确要求创建内容时使用）

## Journal 快速总结规则

当用户要求总结 Journal 时，优先用专用工具快速获取内容：
- **总结今天**：先调用 getTodayJournal() 获取今日 Journal，然后再总结
- **总结近一周/近 N 天**：先调用 getRecentJournals(days=7)（或按用户要求的天数）获取 Journal 列表，再按日期汇总要点
- **获取昨天/指定范围**：调用 searchJournalEntries(startOffset=-1, endOffset=-1)（昨天）或按需要设置 startOffset/endOffset

## 重要：属性查询最佳实践

### 问题场景
当使用 queryBlocksByTag 对选项类属性（如 status, priority）进行过滤时，你**必须使用数值 ID**，而不是显示文本。

### 错误示例（会导致 SQLITE_ERROR）
- { name: "status", op: "==", value: "canceled" }  // 使用文本会报错
- { name: "priority", op: "==", value: "high" }    // 使用文本会报错

### 正确做法（两步流程）

**步骤1：先调用 get_tag_schema 获取选项映射**
示例调用: get_tag_schema("task")
返回示例:
- status (single-choice):
  - "todo" -> value: 0
  - "in-progress" -> value: 1
  - "canceled" -> value: 2
- priority (number)

**步骤2：使用数值 ID 进行查询**
示例: queryBlocksByTag("task", properties: [{ name: "status", op: "==", value: 2 }])
说明: 使用数值 2 表示 "canceled"

### 何时需要调用 get_tag_schema

**必须调用的情况**：
- 用户询问包含状态/分类/级别等选项的查询（如"查找已取消的任务"）
- 你不确定属性的类型或选项值
- 查询失败并提示 SQLITE_ERROR

**无需调用的情况**：
- 纯标签搜索（不涉及属性过滤）
- 全文搜索
- 你已经从之前的 get_tag_schema 调用中知道了映射关系

## 多轮搜索策略

**重要提示**：你现在支持连续调用工具最多3轮，当第一次搜索效果不佳时，你应该主动尝试其他方法！

### 主动重试场景
如果第一次搜索结果为空或不理想，你应该**立即**尝试替代方案：

1. **标签变体**：尝试相似标签
   - "task" -> "todo" -> "任务"
   - "note" -> "笔记" -> "memo"
   - "important" -> "重要" -> "urgent"

2. **搜索方式降级**：
   - 属性查询无结果 -> 尝试简单标签搜索
   - 标签搜索无结果 -> 尝试全文搜索关键词

3. **条件放宽**：
   - "priority >= 9" 无结果 -> 尝试 "priority >= 8"
   - 精确匹配无结果 -> 尝试模糊搜索

### 示例工作流

**用户请求**："查找已取消的任务"

**正确流程**（带 schema 查询）：
- 第1轮: get_tag_schema("task") -> 获知 "canceled" 对应值为 2
- 第2轮: queryBlocksByTag("task", properties: [{ name: "status", op: "==", value: 2 }]) -> 找到结果
- 回复: 展示结果

**如果无结果的多轮尝试**：
- 第1轮: get_tag_schema("task") -> 获知选项
- 第2轮: queryBlocksByTag("task", properties: [{ name: "status", op: "==", value: 2 }]) -> 0结果
- 第3轮: searchBlocksByTag("task") -> 展示所有任务，让用户了解实际情况
- 回复: "没找到已取消的任务，但找到X个其他任务"

## 结果精准性

**核心原则**：只返回精确匹配用户意图的结果。

- **多条件查询默认取交集**：如"找带A标签且包含B的内容"，只展示同时满足A和B的结果
- **不主动扩展**：除非用户明确说"所有"或"全部"，否则不展示额外内容
- **无结果时再询问**：如果精确匹配为空，告知用户并询问是否扩大范围

## 行为准则

### 成功时
- 直接展示搜索结果，并根据用户需求做适当总结
- 如果结果较多，可以按相关性或时间排序高亮关键内容
- **如果通过多轮尝试找到结果，简要说明你尝试了哪些方法**

### 搜索无结果时
如果**所有尝试**都返回空结果，你必须明确告知用户：
1. 你尝试了哪些搜索方法（列出所有工具调用）
2. 为什么可能都没有结果（标签不存在、关键词拼写、属性值范围等）
3. 给出建议：
   - 建议用户检查标签/关键词拼写
   - 询问是否要尝试其他角度的搜索
   - 建议用户提供更多上下文信息

### 工具能力不足时
如果用户的需求超出了当前工具能力，你必须：
1. **说明限制**：清楚描述工具无法做什么
2. **描述差距**：解释用户需求与工具能力之间的差距
3. **给出建议**：
   - 如果可以分步骤实现，告诉用户如何分解任务
   - 如果完全无法实现，明确告知并建议联系开发者添加功能

### 工具能力边界
当前工具**不支持**以下功能（如用户请求需告知）：
- 跨多个标签的复杂组合查询（如 "同时有A和B标签的笔记"）
- 普通笔记的时间范围过滤（如 "最近7天创建的笔记"；**但 Journal 支持用 getRecentJournals 获取近 N 天内容**）
- 修改或删除笔记（当前仅支持创建新块：createBlock）
- 统计分析（如 "有多少条任务"）
- 导出或批量操作

### 回复格式
- 使用中文回复
- 保持简洁，直接回答问题
- 错误信息要具体且可操作
- 搜索结果中的笔记链接保持 [标题](orca-block:id) 格式
- **多轮搜索时，在结果末尾用一句话说明搜索策略（不必详细列举每一步）**`;


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
  systemPrompt: DEFAULT_SYSTEM_PROMPT,
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
