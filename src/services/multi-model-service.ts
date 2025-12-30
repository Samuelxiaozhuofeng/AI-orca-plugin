/**
 * Multi-Model Service
 * 
 * 处理多模型并行请求的服务
 */

import type { OpenAIChatMessage } from "./openai-client";
import type { ModelResponse } from "../components/MultiModelResponse";
import { streamChatWithRetry, type StreamChunk } from "./chat-stream-handler";
import { getAiChatSettings, getModelApiConfig } from "../settings/ai-chat-settings";
import { getAiChatPluginName } from "../ui/ai-chat-ui";
import { nowId } from "../utils/text-utils";

export interface MultiModelRequest {
  modelIds: string[];
  messages: OpenAIChatMessage[];
  fallbackMessages: OpenAIChatMessage[];
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

export interface MultiModelStreamUpdate {
  modelId: string;
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
  for (const modelId of request.modelIds) {
    const apiConfig = getModelApiConfig(settings, modelId);
    
    if (!apiConfig.apiUrl || !apiConfig.apiKey) {
      yield {
        modelId,
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
        temperature: request.temperature,
        maxTokens: request.maxTokens,
        signal: request.signal,
      },
      request.messages,
      request.fallbackMessages
    );
    
    modelStreams.set(modelId, {
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
    const promises = activeStreams.map(async ([modelId, stream]) => {
      try {
        const result = await stream.iterator.next();
        return { modelId, result, error: null };
      } catch (error: any) {
        return { modelId, result: null, error };
      }
    });
    
    // 等待任意一个完成
    const { modelId, result, error } = await Promise.race(promises);
    const stream = modelStreams.get(modelId)!;
    
    if (error) {
      stream.done = true;
      yield {
        modelId,
        type: "error",
        error: String(error?.message || error || "Unknown error"),
      };
      continue;
    }
    
    if (!result || result.done) {
      stream.done = true;
      yield {
        modelId,
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
        modelId,
        type: "content",
        content: chunk.content,
      };
    } else if (chunk.type === "reasoning") {
      stream.reasoning += chunk.reasoning;
      yield {
        modelId,
        type: "reasoning",
        reasoning: chunk.reasoning,
      };
    } else if (chunk.type === "done") {
      stream.done = true;
      yield {
        modelId,
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
export function getModelDisplayInfo(modelId: string): {
  modelLabel: string;
  providerId: string;
  providerName: string;
} {
  const pluginName = getAiChatPluginName();
  const settings = getAiChatSettings(pluginName);
  
  for (const provider of settings.providers) {
    const model = provider.models.find(m => m.id === modelId);
    if (model) {
      return {
        modelLabel: model.label || model.id,
        providerId: provider.id,
        providerName: provider.name,
      };
    }
  }
  
  return {
    modelLabel: modelId,
    providerId: "unknown",
    providerName: "Unknown",
  };
}

/**
 * 创建初始的模型响应状态
 */
export function createInitialResponses(modelIds: string[]): ModelResponse[] {
  return modelIds.map(modelId => {
    const info = getModelDisplayInfo(modelId);
    return {
      modelId,
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
    if (response.modelId !== update.modelId) return response;
    
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
