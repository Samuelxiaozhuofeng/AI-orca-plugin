/**
 * Vision Model Service
 * 
 * 提供视觉模型能力，让不支持视觉的模型也能"看"图片。
 * 通过调用配置的视觉模型（如 GPT-4o）来分析图片并返回描述。
 */

import { openAIChatCompletionsStream, type OpenAIChatMessage } from "./openai-client";
import { imageToBase64 } from "../external/image-service";
import type { ImageRef, FileRef } from "../session-service";
import { getAiChatSettings, getModelApiConfig, type AiChatSettings, type ProviderModel } from "../../settings/ai-chat-settings";
import { getAiChatPluginName } from "../../ui/ai-chat-ui";

// ═══════════════════════════════════════════════════════════════════════════
// 类型定义
// ═══════════════════════════════════════════════════════════════════════════

export interface VisionModelConfig {
  /** 是否启用视觉模型代理 */
  enabled: boolean;
  /** 视觉模型的 Provider ID */
  providerId: string;
  /** 视觉模型 ID */
  modelId: string;
  /** 图片描述的详细程度: brief(简短), normal(正常), detailed(详细) */
  detailLevel: "brief" | "normal" | "detailed";
  /** 最大输出 token 数 */
  maxTokens: number;
}

export interface ImageDescription {
  /** 图片描述文本 */
  description: string;
  /** 处理时间（毫秒） */
  processingTime: number;
  /** 使用的模型 */
  model: string;
}

export interface VisionAnalysisResult {
  /** 是否成功 */
  success: boolean;
  /** 图片描述列表 */
  descriptions: ImageDescription[];
  /** 错误信息（如果失败） */
  error?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// 默认配置
// ═══════════════════════════════════════════════════════════════════════════

export const DEFAULT_VISION_MODEL_CONFIG: VisionModelConfig = {
  enabled: true,
  providerId: "openai",
  modelId: "gpt-4o-mini",
  detailLevel: "normal",
  maxTokens: 500,
};

// 存储键
const VISION_CONFIG_KEY = "vision-model-config";
const VISION_CONFIG_LOCALSTORAGE_KEY = "ai-chat-vision-config";

// 内存缓存
let cachedVisionConfig: VisionModelConfig | null = null;

// ═══════════════════════════════════════════════════════════════════════════
// 配置管理
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 加载视觉模型配置
 */
export async function loadVisionModelConfig(pluginName: string): Promise<VisionModelConfig> {
  if (cachedVisionConfig) {
    return cachedVisionConfig;
  }

  let raw: string | null = null;

  // 首先尝试从 Orca 存储加载
  try {
    raw = await orca.plugins.getData(pluginName, VISION_CONFIG_KEY);
  } catch (e) {
    console.warn("[vision-model] Failed to load from Orca storage:", e);
  }

  // 回退到 localStorage
  if (!raw && typeof localStorage !== "undefined") {
    try {
      raw = localStorage.getItem(VISION_CONFIG_LOCALSTORAGE_KEY);
    } catch (e) {
      console.warn("[vision-model] Failed to load from localStorage:", e);
    }
  }

  if (raw) {
    try {
      const parsed = JSON.parse(raw);
      const config: VisionModelConfig = { ...DEFAULT_VISION_MODEL_CONFIG, ...parsed };
      cachedVisionConfig = config;
      return config;
    } catch (e) {
      console.warn("[vision-model] Failed to parse config:", e);
    }
  }

  const defaultConfig: VisionModelConfig = { ...DEFAULT_VISION_MODEL_CONFIG };
  cachedVisionConfig = defaultConfig;
  return defaultConfig;
}

/**
 * 保存视觉模型配置
 */
export async function saveVisionModelConfig(
  pluginName: string,
  config: Partial<VisionModelConfig>
): Promise<void> {
  const current = cachedVisionConfig || DEFAULT_VISION_MODEL_CONFIG;
  const newConfig = { ...current, ...config };
  const configJson = JSON.stringify(newConfig);

  // 保存到 Orca 存储
  try {
    await orca.plugins.setData(pluginName, VISION_CONFIG_KEY, configJson);
  } catch (e) {
    console.error("[vision-model] Failed to save to Orca storage:", e);
  }

  // 备份到 localStorage
  if (typeof localStorage !== "undefined") {
    try {
      localStorage.setItem(VISION_CONFIG_LOCALSTORAGE_KEY, configJson);
    } catch (e) {
      console.warn("[vision-model] Failed to save to localStorage:", e);
    }
  }

  cachedVisionConfig = newConfig;
}

/**
 * 获取视觉模型配置（同步，使用缓存）
 */
export function getVisionModelConfig(): VisionModelConfig {
  return cachedVisionConfig || DEFAULT_VISION_MODEL_CONFIG;
}

// ═══════════════════════════════════════════════════════════════════════════
// 模型检测
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 检查模型是否支持视觉
 */
export function modelSupportsVision(settings: AiChatSettings, modelId?: string): boolean {
  const targetModelId = modelId || settings.selectedModelId;

  for (const provider of settings.providers) {
    const model = provider.models.find((m) => m.id === targetModelId);
    if (model) {
      // 如果明确配置了 capabilities，检查是否包含 "vision"
      if (model.capabilities && model.capabilities.length > 0) {
        return model.capabilities.includes("vision");
      }
      // 没有配置 capabilities，根据模型名称推断
      return inferVisionSupport(targetModelId);
    }
  }

  // 未找到模型，根据名称推断
  return inferVisionSupport(targetModelId);
}

/**
 * 根据模型名称推断是否支持视觉
 */
function inferVisionSupport(modelId: string): boolean {
  const lowerModelId = modelId.toLowerCase();
  
  // 已知支持视觉的模型模式
  const visionModels = [
    "gpt-4o",
    "gpt-4-vision",
    "gpt-4-turbo",
    "claude-3",
    "gemini",
    "qwen-vl",
    "qwen2-vl",
    "glm-4v",
    "yi-vision",
    "internvl",
    "llava",
    "cogvlm",
    "minicpm-v",
  ];

  return visionModels.some((pattern) => lowerModelId.includes(pattern));
}

/**
 * 获取所有支持视觉的模型列表
 */
export function getVisionCapableModels(settings: AiChatSettings): Array<{
  providerId: string;
  providerName: string;
  model: ProviderModel;
}> {
  const result: Array<{
    providerId: string;
    providerName: string;
    model: ProviderModel;
  }> = [];

  for (const provider of settings.providers) {
    if (!provider.enabled) continue;

    for (const model of provider.models) {
      // 检查是否支持视觉
      const hasVision =
        model.capabilities?.includes("vision") || inferVisionSupport(model.id);

      if (hasVision) {
        result.push({
          providerId: provider.id,
          providerName: provider.name,
          model,
        });
      }
    }
  }

  return result;
}

// ═══════════════════════════════════════════════════════════════════════════
// 图片分析
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 根据详细程度生成提示词
 */
function getDescriptionPrompt(detailLevel: VisionModelConfig["detailLevel"]): string {
  switch (detailLevel) {
    case "brief":
      return "请用一句话简要描述这张图片的主要内容。";
    case "detailed":
      return `请详细描述这张图片，包括：
1. 图片的主要内容和主题
2. 图片中的物体、人物、场景
3. 颜色、构图、风格等视觉特征
4. 文字内容（如果有）
5. 任何其他值得注意的细节`;
    case "normal":
    default:
      return "请描述这张图片的内容，包括主要元素、场景和任何重要的细节或文字。";
  }
}

/**
 * 使用视觉模型描述单张图片
 */
export async function describeImage(
  imageRef: ImageRef | { base64: string; mimeType: string },
  options?: {
    customPrompt?: string;
    signal?: AbortSignal;
  }
): Promise<ImageDescription> {
  const startTime = Date.now();
  const pluginName = getAiChatPluginName();
  const settings = getAiChatSettings(pluginName);
  const visionConfig = getVisionModelConfig();

  if (!visionConfig.enabled) {
    throw new Error("视觉模型服务未启用");
  }

  // 获取视觉模型的 API 配置
  const apiConfig = getModelApiConfig(
    settings,
    visionConfig.modelId,
    visionConfig.providerId
  );

  if (!apiConfig.apiUrl || !apiConfig.apiKey) {
    throw new Error(`视觉模型 ${visionConfig.modelId} 未配置 API`);
  }

  // 获取图片 base64
  let base64: string;
  let mimeType: string;

  if ("path" in imageRef) {
    // ImageRef 类型
    const b64 = await imageToBase64(imageRef);
    if (!b64) {
      throw new Error(`无法读取图片: ${imageRef.path}`);
    }
    base64 = b64;
    mimeType = imageRef.mimeType || "image/png";
  } else {
    // 直接的 base64 数据
    base64 = imageRef.base64;
    mimeType = imageRef.mimeType;
  }

  // 构建消息
  const prompt = options?.customPrompt || getDescriptionPrompt(visionConfig.detailLevel);
  const messages: OpenAIChatMessage[] = [
    {
      role: "user",
      content: [
        { type: "text", text: prompt },
        {
          type: "image_url",
          image_url: {
            url: `data:${mimeType};base64,${base64}`,
          },
        },
      ] as any,
    },
  ];

  // 调用视觉模型
  let description = "";
  const stream = openAIChatCompletionsStream({
    apiUrl: apiConfig.apiUrl,
    apiKey: apiConfig.apiKey,
    model: visionConfig.modelId,
    messages,
    maxTokens: visionConfig.maxTokens,
    temperature: 0.3,
    signal: options?.signal,
    protocol: apiConfig.protocol,
    anthropicApiPath: apiConfig.anthropicApiPath,
  });

  for await (const chunk of stream) {
    if (chunk.type === "content" && chunk.content) {
      description += chunk.content;
    }
  }

  return {
    description: description.trim(),
    processingTime: Date.now() - startTime,
    model: visionConfig.modelId,
  };
}

/**
 * 批量描述多张图片
 */
export async function describeImages(
  images: Array<ImageRef | { base64: string; mimeType: string }>,
  options?: {
    customPrompt?: string;
    signal?: AbortSignal;
    concurrency?: number;
  }
): Promise<VisionAnalysisResult> {
  const startTime = Date.now();
  const concurrency = options?.concurrency ?? 2;
  const descriptions: ImageDescription[] = [];
  const errors: string[] = [];

  // 分批并行处理
  for (let i = 0; i < images.length; i += concurrency) {
    const batch = images.slice(i, i + concurrency);
    const results = await Promise.allSettled(
      batch.map((img) =>
        describeImage(img, {
          customPrompt: options?.customPrompt,
          signal: options?.signal,
        })
      )
    );

    for (const result of results) {
      if (result.status === "fulfilled") {
        descriptions.push(result.value);
      } else {
        errors.push(result.reason?.message || "Unknown error");
      }
    }
  }

  return {
    success: errors.length === 0,
    descriptions,
    error: errors.length > 0 ? errors.join("; ") : undefined,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// 智能视觉处理
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 为不支持视觉的模型处理图片内容
 * 
 * 如果当前模型不支持视觉，会自动调用视觉模型来描述图片，
 * 并将描述文本替换原有的图片内容。
 */
export async function processImagesForNonVisionModel(
  images: ImageRef[],
  options?: {
    signal?: AbortSignal;
  }
): Promise<string> {
  if (images.length === 0) {
    return "";
  }

  const visionConfig = getVisionModelConfig();
  if (!visionConfig.enabled) {
    return images
      .map((img, i) => `[图片 ${i + 1}: ${img.name || "未命名"}]`)
      .join("\n");
  }

  try {
    const result = await describeImages(images, {
      signal: options?.signal,
    });

    if (result.success && result.descriptions.length > 0) {
      return result.descriptions
        .map((desc, i) => {
          const imgName = images[i]?.name || `图片 ${i + 1}`;
          return `[${imgName} 的描述]: ${desc.description}`;
        })
        .join("\n\n");
    } else {
      // 部分成功的情况
      return result.descriptions
        .map((desc, i) => {
          const imgName = images[i]?.name || `图片 ${i + 1}`;
          return `[${imgName} 的描述]: ${desc.description}`;
        })
        .join("\n\n") + (result.error ? `\n\n[部分图片处理失败: ${result.error}]` : "");
    }
  } catch (error: any) {
    console.error("[vision-model] Failed to process images:", error);
    return images
      .map((img, i) => `[图片 ${i + 1}: ${img.name || "未命名"} - 处理失败]`)
      .join("\n");
  }
}

/**
 * 检查是否需要使用视觉模型代理
 * 
 * @param modelId - 当前使用的模型 ID
 * @param hasImages - 消息中是否包含图片
 * @returns 是否需要使用视觉模型代理
 */
export function shouldUseVisionProxy(modelId: string, hasImages: boolean): boolean {
  if (!hasImages) {
    return false;
  }

  const pluginName = getAiChatPluginName();
  const settings = getAiChatSettings(pluginName);
  const visionConfig = getVisionModelConfig();

  // 视觉模型服务未启用
  if (!visionConfig.enabled) {
    return false;
  }

  // 当前模型已支持视觉
  if (modelSupportsVision(settings, modelId)) {
    return false;
  }

  return true;
}
