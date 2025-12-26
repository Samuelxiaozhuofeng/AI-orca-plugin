/**
 * Memory Extraction Service
 * 
 * AI-powered service to extract user characteristics, preferences, and personal
 * information from conversation content.
 * 
 * Requirements: 13.1, 13.2
 */

import { getAiChatPluginName } from "../ui/ai-chat-ui";
import { getAiChatSettings, resolveAiModel } from "../settings/ai-chat-settings";

// ============================================================================
// Types
// ============================================================================

/**
 * A single extracted memory item from conversation analysis
 */
export interface ExtractedMemory {
  /** The extracted memory content */
  content: string;
  /** Optional category suggestion (e.g., "基本信息", "饮食偏好") */
  category?: string;
  /** Confidence score from 0 to 1 */
  confidence: number;
}

/**
 * Result of memory extraction operation
 */
export interface ExtractionResult {
  /** Array of extracted memories */
  memories: ExtractedMemory[];
  /** Whether the extraction was successful */
  success: boolean;
  /** Error message if extraction failed */
  error?: string;
}

// ============================================================================
// Prompt Template
// ============================================================================

const EXTRACTION_PROMPT = `分析以下对话内容，全面提取关于用户的个人信息、偏好、特征和关系网络。
只提取明确提到的信息，不要推测或编造。

## 提取维度（请尽可能全面提取）

### 基本信息
- 姓名、昵称、年龄、生日、星座
- 性别、身高、体重、血型
- 职业、公司、职位、工作地点
- 居住地、家乡、常去的地方

### 关系网络（重要！）
- 家人：父母、配偶、子女、兄弟姐妹等
- 关系人的信息：生日、喜好、鞋码、衣服尺码等
- 例如："我妈的鞋码是38"、"女儿的生日是5月1日"、"老婆喜欢红玫瑰"

### 偏好与习惯
- 饮食：喜欢/不喜欢的食物、过敏源、口味偏好
- 出行：常用交通方式、常去地点、车位信息
- 消费：品牌偏好、购物习惯、预算范围
- 作息：起床时间、睡眠习惯、工作时间

### 兴趣爱好
- 运动、音乐、电影、游戏、阅读等
- 收藏、旅行、摄影等爱好
- 关注的领域、学习的技能

### 健康信息
- 过敏史、慢性病、用药情况
- 健身目标、饮食限制

### 重要日期
- 纪念日、周年、重要事件日期

### 账号与设备
- 常用账号、会员信息
- 设备型号、车辆信息

## 提取规则
1. 每条记忆应该是独立的、完整的陈述
2. 使用第一人称（"我..."）来表述，关系人用"我的XX"
3. 不要提取临时性信息或一次性请求
4. 关系网络信息要明确标注关系，如"我妈的鞋码是38"
5. 尽可能细化，一个信息点一条记忆

## 输出格式（JSON 数组）
[
  { "content": "提取的记忆内容", "category": "分类", "confidence": 0.9 }
]

分类包括：基本信息、关系网络、饮食偏好、出行习惯、兴趣爱好、工作技能、健康信息、重要日期、消费偏好、其他

如果没有找到任何可提取的用户信息，返回空数组：[]

对话内容：
{conversation}`;

// ============================================================================
// Service Implementation
// ============================================================================

/**
 * Extract memories from conversation content using AI analysis
 * 
 * @param conversationContext - The conversation text to analyze
 * @param customPrompt - Optional custom prompt to guide extraction (e.g., "提取关于身高的信息")
 * @returns ExtractionResult containing extracted memories or error
 */
export async function extractMemories(conversationContext: string, customPrompt?: string): Promise<ExtractionResult> {
  // Validate input
  if (!conversationContext || conversationContext.trim().length === 0) {
    return {
      memories: [],
      success: true,
    };
  }

  // Get API settings
  const pluginName = getAiChatPluginName();
  const settings = getAiChatSettings(pluginName);
  
  // Validate settings
  if (!settings.apiUrl || !settings.apiKey) {
    return {
      memories: [],
      success: false,
      error: "API 配置缺失，请在设置中配置 API URL 和 API Key",
    };
  }

  const model = resolveAiModel(settings);
  if (!model) {
    return {
      memories: [],
      success: false,
      error: "未配置 AI 模型",
    };
  }

  // Build the prompt
  let prompt = EXTRACTION_PROMPT.replace("{conversation}", conversationContext);
  
  // Add custom prompt if provided
  if (customPrompt && customPrompt.trim()) {
    prompt = `${prompt}\n\n## 特别关注\n请特别关注并提取以下方面的信息：${customPrompt.trim()}`;
  }

  try {
    // Make API call
    const response = await callExtractionAPI({
      apiUrl: settings.apiUrl,
      apiKey: settings.apiKey,
      model,
      prompt,
      temperature: 0.3, // Lower temperature for more consistent extraction
    });

    // Parse the response
    const memories = parseExtractionResponse(response);

    return {
      memories,
      success: true,
    };
  } catch (error) {
    console.error("[MemoryExtraction] Extraction failed:", error);
    return {
      memories: [],
      success: false,
      error: error instanceof Error ? error.message : "记忆提取失败",
    };
  }
}

// ============================================================================
// API Call Helper
// ============================================================================

interface ExtractionAPIParams {
  apiUrl: string;
  apiKey: string;
  model: string;
  prompt: string;
  temperature: number;
}

/**
 * Make API call for memory extraction
 */
async function callExtractionAPI(params: ExtractionAPIParams): Promise<string> {
  const { apiUrl, apiKey, model, prompt, temperature } = params;

  // Build the API URL
  const url = buildChatCompletionsUrl(apiUrl);

  const requestBody = {
    model,
    messages: [
      {
        role: "system",
        content: "你是一个专门分析对话内容并提取用户个人信息的助手。你只输出 JSON 格式的结果，不添加任何其他文字。",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
    temperature,
    max_tokens: 2048,
  };

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(requestBody),
  });

  if (!response.ok) {
    const errorText = await readErrorMessage(response);
    throw new Error(`API 请求失败: ${errorText}`);
  }

  const json = await response.json();
  
  // Extract content from response
  const content = json?.choices?.[0]?.message?.content;
  if (typeof content !== "string") {
    throw new Error("API 响应格式错误");
  }

  return content;
}

/**
 * Build the chat completions URL from base API URL
 */
function buildChatCompletionsUrl(apiUrl: string): string {
  const trimmed = apiUrl.trim().replace(/\/+$/, "");
  if (trimmed.toLowerCase().endsWith("/chat/completions")) {
    return trimmed;
  }
  return `${trimmed}/chat/completions`;
}

/**
 * Read error message from failed response
 */
async function readErrorMessage(response: Response): Promise<string> {
  const contentType = response.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("application/json")) {
      const json = await response.json();
      const msg = json?.error?.message ?? json?.message;
      if (typeof msg === "string" && msg.trim()) {
        return msg.trim();
      }
      return JSON.stringify(json);
    }
  } catch {
    // Ignore parse errors
  }

  try {
    const text = await response.text();
    if (text.trim()) {
      return text.trim();
    }
  } catch {
    // Ignore read errors
  }

  return `HTTP ${response.status}`;
}

// ============================================================================
// Response Parsing
// ============================================================================

/**
 * Parse the AI response and extract memories
 */
function parseExtractionResponse(response: string): ExtractedMemory[] {
  // Try to extract JSON from the response
  const jsonContent = extractJsonFromResponse(response);
  
  if (!jsonContent) {
    console.warn("[MemoryExtraction] No JSON found in response");
    return [];
  }

  try {
    const parsed = JSON.parse(jsonContent);
    
    // Validate it's an array
    if (!Array.isArray(parsed)) {
      console.warn("[MemoryExtraction] Response is not an array");
      return [];
    }

    // Validate and filter each item
    const memories: ExtractedMemory[] = [];
    for (const item of parsed) {
      const memory = validateMemoryItem(item);
      if (memory) {
        memories.push(memory);
      }
    }

    return memories;
  } catch (error) {
    console.error("[MemoryExtraction] Failed to parse JSON:", error);
    return [];
  }
}

/**
 * Extract JSON array from response text
 * Handles cases where AI might include extra text around the JSON
 */
function extractJsonFromResponse(response: string): string | null {
  const trimmed = response.trim();
  
  // If it starts with [ and ends with ], it's likely pure JSON
  if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
    return trimmed;
  }

  // Try to find JSON array in the response
  const jsonMatch = trimmed.match(/\[[\s\S]*\]/);
  if (jsonMatch) {
    return jsonMatch[0];
  }

  return null;
}

/**
 * Validate and normalize a single memory item
 */
function validateMemoryItem(item: unknown): ExtractedMemory | null {
  if (!item || typeof item !== "object") {
    return null;
  }

  const obj = item as Record<string, unknown>;

  // Content is required
  const content = obj.content;
  if (typeof content !== "string" || content.trim().length === 0) {
    return null;
  }

  // Category is optional
  const category = typeof obj.category === "string" ? obj.category.trim() : undefined;

  // Confidence defaults to 0.8 if not provided or invalid
  let confidence = 0.8;
  if (typeof obj.confidence === "number" && obj.confidence >= 0 && obj.confidence <= 1) {
    confidence = obj.confidence;
  }

  return {
    content: content.trim(),
    category: category || undefined,
    confidence,
  };
}

// ============================================================================
// Export Service Object
// ============================================================================

/**
 * Memory extraction service object
 */
export const memoryExtractionService = {
  extractMemories,
};
