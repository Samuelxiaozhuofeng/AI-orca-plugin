/**
 * Multi-Model Service
 * 
 * 处理多模型并行请求的服务
 */

import type { OpenAIChatMessage } from "./openai-client";
import type { ModelResponse } from "../../components/MultiModelResponse";
import { streamChatWithRetry, type StreamChunk } from "./chat-stream-handler";
import { getAiChatSettings, getModelApiConfig } from "../../settings/ai-chat-settings";
import { getAiChatPluginName } from "../../ui/ai-chat-ui";
import { parseModelKey } from "../../store/multi-model-store";
import { nowId } from "../../utils/text-utils";

export interface MultiModelRequest {
  /** 模型键列表 (格式: "providerId:modelId") */
  modelKeys: string[];
  messages: OpenAIChatMessage[];
  fallbackMessages: OpenAIChatMessage[];
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface MultiModelStreamUpdate {
  modelKey: string;
  type: "content" | "reasoning" | "error" | "done";
  content?: string;
  reasoning?: string;
  error?: string;
}

/**
 * 并行向多个模型发送请求，返回异步迭代器
 */
export async function* streamMultiModelChat(
  request: MultiModelRequest
): AsyncGenerator<MultiModelStreamUpdate, void, unknown> {
  const pluginName = getAiChatPluginName();
  const settings = getAiChatSettings(pluginName);
  
  // 为每个模型创建独立的流
  const modelStreams: Map<string, {
    iterator: AsyncGenerator<StreamChunk, void, unknown>;
    done: boolean;
    content: string;
    reasoning: string;
  }> = new Map();
  
  // 初始化所有模型的流
  for (const modelKey of request.modelKeys) {
    const parsed = parseModelKey(modelKey);
    if (!parsed) {
      yield {
        modelKey,
        type: "error",
        error: `无效的模型键: ${modelKey}`,
      };
      continue;
    }
    
    const { providerId, modelId } = parsed;
    const apiConfig = getModelApiConfig(settings, modelId, providerId);
    
    if (!apiConfig.apiUrl || !apiConfig.apiKey) {
      yield {
        modelKey,
        type: "error",
        error: `模型 ${modelId} 未配置 API`,
      };
      continue;
    }
    
    const iterator = streamChatWithRetry(
      {
        apiUrl: apiConfig.apiUrl,
        apiKey: apiConfig.apiKey,
        model: modelId,
        protocol: apiConfig.protocol,
        anthropicApiPath: apiConfig.anthropicApiPath,
        temperature: request.temperature,
        maxTokens: request.maxTokens,
        signal: request.signal,
      },
      request.messages,
      request.fallbackMessages
    );
    
    modelStreams.set(modelKey, {
      iterator,
      done: false,
      content: "",
      reasoning: "",
    });
  }
  
  // 并行处理所有流
  while (true) {
    const activeStreams = Array.from(modelStreams.entries()).filter(([_, s]) => !s.done);
    if (activeStreams.length === 0) break;
    
    // 使用 Promise.race 来获取最先返回的结果
    const promises = activeStreams.map(async ([modelKey, stream]) => {
      try {
        const result = await stream.iterator.next();
        return { modelKey, result, error: null };
      } catch (error: any) {
        return { modelKey, result: null, error };
      }
    });
    
    // 等待任意一个完成
    const { modelKey, result, error } = await Promise.race(promises);
    const stream = modelStreams.get(modelKey)!;
    
    if (error) {
      stream.done = true;
      yield {
        modelKey,
        type: "error",
        error: String(error?.message || error || "Unknown error"),
      };
      continue;
    }
    
    if (!result || result.done) {
      stream.done = true;
      yield {
        modelKey,
        type: "done",
        content: stream.content,
        reasoning: stream.reasoning,
      };
      continue;
    }
    
    const chunk = result.value;
    
    if (chunk.type === "content") {
      stream.content += chunk.content;
      yield {
        modelKey,
        type: "content",
        content: chunk.content,
      };
    } else if (chunk.type === "reasoning") {
      stream.reasoning += chunk.reasoning;
      yield {
        modelKey,
        type: "reasoning",
        reasoning: chunk.reasoning,
      };
    } else if (chunk.type === "done") {
      stream.done = true;
      yield {
        modelKey,
        type: "done",
        content: stream.content,
        reasoning: stream.reasoning,
      };
    }
  }
}

/**
 * 获取模型的显示信息
 */
export function getModelDisplayInfo(modelKey: string): {
  modelId: string;
  modelLabel: string;
  providerId: string;
  providerName: string;
} {
  const pluginName = getAiChatPluginName();
  const settings = getAiChatSettings(pluginName);
  
  const parsed = parseModelKey(modelKey);
  if (parsed) {
    const { providerId, modelId } = parsed;
    const provider = settings.providers.find(p => p.id === providerId);
    if (provider) {
      const model = provider.models.find(m => m.id === modelId);
      return {
        modelId,
        modelLabel: model?.label || modelId,
        providerId: provider.id,
        providerName: provider.name,
      };
    }
  }
  
  // 回退：尝试在所有 provider 中查找
  for (const provider of settings.providers) {
    const model = provider.models.find(m => m.id === modelKey);
    if (model) {
      return {
        modelId: model.id,
        modelLabel: model.label || model.id,
        providerId: provider.id,
        providerName: provider.name,
      };
    }
  }
  
  return {
    modelId: modelKey,
    modelLabel: modelKey,
    providerId: "unknown",
    providerName: "Unknown",
  };
}

/**
 * 创建初始的模型响应状态
 */
export function createInitialResponses(modelKeys: string[]): ModelResponse[] {
  return modelKeys.map(modelKey => {
    const info = getModelDisplayInfo(modelKey);
    return {
      modelKey,
      modelId: info.modelId,
      modelLabel: info.modelLabel,
      providerId: info.providerId,
      providerName: info.providerName,
      content: "",
      reasoning: undefined,
      isStreaming: true,
      error: undefined,
      startTime: Date.now(),
      endTime: undefined,
    };
  });
}

/**
 * 更新模型响应状态
 */
export function updateModelResponse(
  responses: ModelResponse[],
  update: MultiModelStreamUpdate
): ModelResponse[] {
  return responses.map(response => {
    if (response.modelKey !== update.modelKey) return response;
    
    switch (update.type) {
      case "content":
        return {
          ...response,
          content: response.content + (update.content || ""),
        };
      case "reasoning":
        return {
          ...response,
          reasoning: (response.reasoning || "") + (update.reasoning || ""),
        };
      case "error":
        return {
          ...response,
          isStreaming: false,
          error: update.error,
          endTime: Date.now(),
        };
      case "done":
        return {
          ...response,
          isStreaming: false,
          endTime: Date.now(),
        };
      default:
        return response;
    }
  });
}
