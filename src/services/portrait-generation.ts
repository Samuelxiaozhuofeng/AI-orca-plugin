/**
 * Portrait Generation Service
 * 
 * AI-powered service to generate user portraits from memories.
 * Generates impression tags (emoji + label) and categorized details.
 * 
 * Requirements: 15.3, 15.4
 */

import { getAiChatPluginName } from "../ui/ai-chat-ui";
import {
  getAiChatSettings,
  resolveAiModel,
  getCurrentApiConfig,
  validateCurrentConfig,
} from "../settings/ai-chat-settings";
import type { MemoryItem, PortraitTag, PortraitCategory } from "../store/memory-store";
import { generateId, parseContentToItems } from "../store/memory-store";
import { buildChatUrlCandidates, readErrorMessage, extractJsonFromResponse } from "./ai/api-helpers";

// ============================================================================
// Types
// ============================================================================

/**
 * Generated portrait data from AI analysis
 */
export interface GeneratedPortrait {
  /** AI impression tags (emoji + short label) */
  tags: PortraitTag[];
  /** Categorized user information */
  categories: PortraitCategory[];
}

/**
 * Result of portrait generation operation
 */
export interface PortraitGenerationResult {
  /** Generated portrait data */
  portrait: GeneratedPortrait | null;
  /** Whether the generation was successful */
  success: boolean;
  /** Error message if generation failed */
  error?: string;
}

// ============================================================================
// Prompt Template
// ============================================================================

const PORTRAIT_PROMPT = `根据以下用户记忆，生成全面的用户印象。

## 印象结构

### 1. AI 印象标签（tags）
用 emoji + 简短描述（2-6字）总结用户特征
- 最多生成 10 个标签
- 优先选择最能代表用户特点的标签
- 标签应该简洁有趣，能快速传达用户特点

### 2. 分类详情（categories）
按类别整理用户信息，每条信息单独一行

## 可用分类
基本信息、关系网络、饮食偏好、出行习惯、兴趣爱好、工作技能、健康信息、重要日期、消费偏好、生活习惯、性格特点

## 生成规则
1. 只根据记忆中明确提到的信息生成，不要推测
2. 如果某个类别没有相关信息，不要生成该类别
3. **重要：分类内容必须是结构化列表，每条信息单独一行，格式为"字段：值"**
4. 不要把多条信息聚合成一段话
5. 选择最能代表用户特点的 emoji

## 输出格式（JSON）
{
  "tags": [
    { "emoji": "👨‍👩‍👧", "label": "三口之家" },
    { "emoji": "🌶️", "label": "无辣不欢" }
  ],
  "categories": [
    { 
      "title": "基本信息", 
      "content": "姓名：张三\\n身高：183cm\\n鞋码：42码\\n出生年：1995年\\n职业：程序员" 
    },
    { 
      "title": "关系网络", 
      "content": "妈妈鞋码：38码\\n老婆喜好：红玫瑰\\n女儿生日：5月1日" 
    },
    { 
      "title": "饮食偏好", 
      "content": "口味：无辣不欢\\n禁忌：不吃姜\\n过敏：芒果" 
    },
    {
      "title": "性格特点",
      "content": "性格：心思细腻\\n特点：喜欢被关注"
    }
  ]
}

注意：content 中每条信息用 \\n 换行分隔，格式为"字段：值"，不要写成一段话！

用户记忆：
{memories}`;

// ============================================================================
// Service Implementation
// ============================================================================

/**
 * Generate a user portrait from their memories using AI analysis
 * 
 * @param memories - Array of user's memory items
 * @param signal - Optional AbortSignal for cancellation
 * @returns PortraitGenerationResult containing generated portrait or error
 */
export async function generatePortrait(memories: MemoryItem[], signal?: AbortSignal): Promise<PortraitGenerationResult> {
  // Validate input
  if (!memories || memories.length === 0) {
    return {
      portrait: null,
      success: false,
      error: "没有可用的记忆来生成印象",
    };
  }

  // Get API settings
  const pluginName = getAiChatPluginName();
  const settings = getAiChatSettings(pluginName);
  
  const apiConfig = getCurrentApiConfig(settings);

  // Validate settings
  const validationError = validateCurrentConfig(settings);
  if (validationError) {
    return {
      portrait: null,
      success: false,
      error: validationError,
    };
  }

  const model = apiConfig.model || resolveAiModel(settings);
  if (!model) {
    return {
      portrait: null,
      success: false,
      error: "未配置 AI 模型",
    };
  }

  // Format memories for the prompt
  const memoriesText = memories
    .filter(m => m.isEnabled)
    .map(m => `- ${m.content}`)
    .join('\n');

  if (!memoriesText) {
    return {
      portrait: null,
      success: false,
      error: "没有启用的记忆来生成印象",
    };
  }

  // Build the prompt
  const prompt = PORTRAIT_PROMPT.replace("{memories}", memoriesText);

  try {
    // Make API call
    const response = await callPortraitAPI({
      apiUrl: apiConfig.apiUrl,
      apiKey: apiConfig.apiKey,
      protocol: apiConfig.protocol,
      anthropicApiPath: apiConfig.anthropicApiPath,
      model,
      prompt,
      temperature: 0.5, // Moderate temperature for creative but consistent output
      signal,
    });

    // Parse the response
    const portrait = parsePortraitResponse(response);

    if (!portrait) {
      return {
        portrait: null,
        success: false,
        error: "无法解析 AI 响应",
      };
    }

    return {
      portrait,
      success: true,
    };
  } catch (error) {
    console.error("[PortraitGeneration] Generation failed:", error);
    return {
      portrait: null,
      success: false,
      error: error instanceof Error ? error.message : "印象生成失败",
    };
  }
}


// ============================================================================
// API Call Helper
// ============================================================================

interface PortraitAPIParams {
  apiUrl: string;
  apiKey: string;
  protocol: "openai" | "anthropic" | "xml-tools";  // xml-tools 使用 OpenAI 兼容格式
  anthropicApiPath?: string;
  model: string;
  prompt: string;
  temperature: number;
  signal?: AbortSignal;
}

/**
 * Make API call for portrait generation
 */
async function callPortraitAPI(params: PortraitAPIParams): Promise<string> {
  const { apiUrl, apiKey, protocol, anthropicApiPath, model, prompt, temperature, signal } = params;

  // Build the API URL
  const urlCandidates = buildChatUrlCandidates(apiUrl, protocol, anthropicApiPath);

  const systemPrompt = "你是一个专门分析用户信息并生成用户印象的助手。你只输出 JSON 格式的结果，不添加任何其他文字。";

  const requestBody = protocol === "anthropic"
    ? {
        model,
        system: systemPrompt,
        messages: [
          {
            role: "user",
            content: [{ type: "text", text: prompt }],
          },
        ],
        temperature,
        max_tokens: 2048,
      }
    : {
        model,
        messages: [
          {
            role: "system",
            content: systemPrompt,
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        temperature,
        max_tokens: 2048,
      };

  const body = JSON.stringify(requestBody);
  let response: Response | null = null;

  for (let i = 0; i < urlCandidates.length; i++) {
    const url = urlCandidates[i];
    response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(protocol === "anthropic"
          ? { "x-api-key": apiKey, "anthropic-version": "2023-06-01", Authorization: `Bearer ${apiKey}` }
          : { Authorization: `Bearer ${apiKey}` }),
      },
      body,
      signal,
    });

    if (response.ok) break;
    if (protocol === "anthropic" && response.status === 404 && i < urlCandidates.length - 1) {
      continue;
    }

    const errorText = await readErrorMessage(response);
    throw new Error(`API 请求失败: ${errorText}`);
  }

  if (!response) throw new Error("API 请求失败: Failed to fetch");
  const json = await response.json();
  
  if (protocol === "anthropic") {
    const blocks = Array.isArray(json?.content) ? json.content : [];
    const text = blocks
      .map((b: any) => (b?.type === "text" ? b?.text : ""))
      .filter((t: any) => typeof t === "string")
      .join("");
    if (!text.trim()) {
      throw new Error("API 响应格式错误");
    }
    return text;
  }

  // OpenAI-compatible response
  const content = json?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error("API 响应格式错误");
  }

  return content;
}

// ============================================================================
// Response Parsing
// ============================================================================

/**
 * Parse the AI response and extract portrait data
 */
function parsePortraitResponse(response: string): GeneratedPortrait | null {
  // Try to extract JSON from the response
  const jsonContent = extractJsonFromResponse(response);
  
  if (!jsonContent) {
    console.warn("[PortraitGeneration] No JSON found in response");
    return null;
  }

  try {
    const parsed = JSON.parse(jsonContent);
    
    // Validate it's an object with expected structure
    if (!parsed || typeof parsed !== "object") {
      console.warn("[PortraitGeneration] Response is not an object");
      return null;
    }

    // Parse and validate tags
    const tags: PortraitTag[] = [];
    if (Array.isArray(parsed.tags)) {
      for (const item of parsed.tags) {
        const tag = validateTagItem(item);
        if (tag) {
          tags.push(tag);
        }
      }
    }

    // Parse and validate categories
    const categories: PortraitCategory[] = [];
    if (Array.isArray(parsed.categories)) {
      for (const item of parsed.categories) {
        const category = validateCategoryItem(item);
        if (category) {
          categories.push(category);
        }
      }
    }

    // Return null if both are empty
    if (tags.length === 0 && categories.length === 0) {
      console.warn("[PortraitGeneration] No valid tags or categories found");
      return null;
    }

    return { tags, categories };
  } catch (error) {
    console.error("[PortraitGeneration] Failed to parse JSON:", error);
    return null;
  }
}

/**
 * Validate and normalize a single tag item
 */
function validateTagItem(item: unknown): PortraitTag | null {
  if (!item || typeof item !== "object") {
    return null;
  }

  const obj = item as Record<string, unknown>;

  // Emoji is required
  const emoji = obj.emoji;
  if (typeof emoji !== "string" || emoji.trim().length === 0) {
    return null;
  }

  // Label is required
  const label = obj.label;
  if (typeof label !== "string" || label.trim().length === 0) {
    return null;
  }

  return {
    id: generateId(),
    emoji: emoji.trim(),
    label: label.trim(),
  };
}

/**
 * Portrait info item - single piece of information
 */
interface PortraitInfoItem {
  id: string;
  label: string;
  value: string;
}

/**
 * Validate and normalize a single category item
 * Converts content string to items array
 */
function validateCategoryItem(item: unknown): PortraitCategory | null {
  if (!item || typeof item !== "object") {
    return null;
  }

  const obj = item as Record<string, unknown>;

  // Title is required
  const title = obj.title;
  if (typeof title !== "string" || title.trim().length === 0) {
    return null;
  }

  // Content is required
  const content = obj.content;
  if (typeof content !== "string" || content.trim().length === 0) {
    return null;
  }

  // Parse content into items array
  const items = parseContentToItems(content.trim());
  if (items.length === 0) {
    return null;
  }

  return {
    id: generateId(),
    title: title.trim(),
    items,
  };
}

// ============================================================================
// Export Service Object
// ============================================================================

/**
 * Portrait generation service object
 */
export const portraitGenerationService = {
  generatePortrait,
  refreshPortraitFromCategories,
};

// ============================================================================
// Refresh Portrait from Categories
// ============================================================================

const REFRESH_PORTRAIT_PROMPT = `根据以下用户分类信息，重新生成 AI 印象标签。

## 当前用户分类信息
{categories}

## 生成规则
1. 根据分类信息中的内容，生成能够概括用户特点的印象标签
2. 每个标签用 emoji + 简短描述（2-6字）
3. 最多生成 10 个标签
4. 标签应该简洁有趣，能快速传达用户特点
5. 不要重复已有的标签内容

## 已有标签（避免重复）
{existingTags}

## 输出格式（JSON）
{
  "tags": [
    { "emoji": "👨‍👩‍👧", "label": "三口之家" },
    { "emoji": "🌶️", "label": "无辣不欢" }
  ]
}

只输出 JSON，不要添加任何其他文字。`;

/**
 * Refresh AI impression tags based on current portrait categories
 * 
 * @param categories - Current portrait categories
 * @param existingTags - Existing tags to avoid duplication
 * @param signal - Optional AbortSignal for cancellation
 * @returns PortraitGenerationResult containing new tags
 */
export async function refreshPortraitFromCategories(
  categories: PortraitCategory[],
  existingTags: PortraitTag[],
  signal?: AbortSignal
): Promise<PortraitGenerationResult> {
  // Validate input
  if (!categories || categories.length === 0) {
    return {
      portrait: null,
      success: false,
      error: "没有可用的分类信息来生成印象",
    };
  }

  // Get API settings
  const pluginName = getAiChatPluginName();
  const settings = getAiChatSettings(pluginName);
  
  const validationError = validateCurrentConfig(settings);
  if (validationError) {
    return {
      portrait: null,
      success: false,
      error: validationError,
    };
  }

  const apiConfig = getCurrentApiConfig(settings);
  const model = apiConfig.model || resolveAiModel(settings);
  if (!model) {
    return {
      portrait: null,
      success: false,
      error: "未配置 AI 模型",
    };
  }

  // Format categories for the prompt
  const categoriesText = categories.map(cat => {
    const itemsText = cat.items.map(item => {
      const values = item.values ? [item.value, ...item.values] : [item.value];
      return item.label ? `${item.label}：${values.join('、')}` : values.join('、');
    }).join('\n');
    return `【${cat.title}】\n${itemsText}`;
  }).join('\n\n');

  // Format existing tags
  const existingTagsText = existingTags.length > 0
    ? existingTags.map(t => `${t.emoji} ${t.label}`).join('、')
    : '无';

  // Build the prompt
  const prompt = REFRESH_PORTRAIT_PROMPT
    .replace("{categories}", categoriesText)
    .replace("{existingTags}", existingTagsText);

  try {
    const response = await callPortraitAPI({
      apiUrl: apiConfig.apiUrl,
      apiKey: apiConfig.apiKey,
      protocol: apiConfig.protocol,
      anthropicApiPath: apiConfig.anthropicApiPath,
      model,
      prompt,
      temperature: 0.7,
      signal,
    });

    // Parse the response - only extract tags
    const jsonContent = extractJsonFromResponse(response);
    if (!jsonContent) {
      return {
        portrait: null,
        success: false,
        error: "无法解析 AI 响应",
      };
    }

    const parsed = JSON.parse(jsonContent);
    const tags: PortraitTag[] = [];
    
    if (Array.isArray(parsed.tags)) {
      for (const item of parsed.tags) {
        const tag = validateTagItem(item);
        if (tag) {
          tags.push(tag);
        }
      }
    }

    return {
      portrait: { tags, categories: [] },
      success: true,
    };
  } catch (error) {
    console.error("[PortraitGeneration] Refresh failed:", error);
    return {
      portrait: null,
      success: false,
      error: error instanceof Error ? error.message : "印象刷新失败",
    };
  }
}
