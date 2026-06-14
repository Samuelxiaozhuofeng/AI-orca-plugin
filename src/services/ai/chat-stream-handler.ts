/**
 * Chat Stream Handler Service
 *
 * Encapsulates streaming AI chat completions with automatic retry and fallback logic.
 */

import {
  openAIChatCompletionsStream,
  type OpenAIChatMessage,
  type OpenAITool,
} from "./openai-client";
import { nowId } from "../../utils/text-utils";
import {
  compressMessages,
  estimateTotalTokens,
  type ManagedContext,
} from "./context-manager";
import {
  createToolProtocolStream,
  dedupeToolCalls,
  extractToolProtocol,
  type ToolCallInfo,
} from "./tool-call-protocol";

export {
  hasDsmlToolCalls,
  hasXmlToolCalls,
  parseDsmlToolCalls,
  parseXmlToolCalls,
  stripDsmlToolCalls,
  stripXmlToolCalls,
  type ToolCallInfo,
} from "./tool-call-protocol";

export interface StreamOptions {
  apiUrl: string;
  apiKey: string;
  model: string;
  messages: OpenAIChatMessage[];
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  tools?: OpenAITool[];
  timeoutMs?: number;
  protocol?: "openai" | "anthropic";
  anthropicApiPath?: string;
  /** 模型上下文长度限制（tokens），超出时自动截断 */
  maxContextTokens?: number;
  /** Enable automatic context compression for long conversations (default: true) */
  enableContextCompression?: boolean;
  /** Token threshold to trigger compression (default: maxContextTokens * 0.8) */
  compressionThreshold?: number;
  /** Number of recent messages to always preserve during compression (default: 6) */
  preserveRecentMessages?: number;
  /** 最大输出恢复重试次数，当 finish_reason 为 "length" 时自动续写 (default: 3) */
  maxOutputRetries?: number;
}

export interface StreamResult {
  content: string;
  toolCalls: ToolCallInfo[];
  reasoning?: string;
  /** 模型停止原因: "stop" | "length" | "tool_calls" | "content_filter" | "end_turn" | "max_tokens" */
  finishReason?: string;
}

export type StreamChunk =
  | { type: "content"; content: string }
  | { type: "reasoning"; reasoning: string }
  | { type: "tool_calls"; toolCalls: ToolCallInfo[] }
  | { type: "done"; result: StreamResult };

/**
 * Merge incoming tool call chunks into the accumulator.
 * Streaming APIs may send tool calls in multiple chunks.
 */
export function mergeToolCalls(
  existing: ToolCallInfo[],
  incoming: any[]
): ToolCallInfo[] {
  const result = [...existing];
  for (let i = 0; i < incoming.length; i++) {
    const tc = incoming[i];
    
    // Strategy 1: Match by ID (standard OpenAI/Gemini behavior)
    let found: ToolCallInfo | undefined = undefined;
    if (tc.id !== null && tc.id !== undefined) {
      found = result.find((t) => t.id === tc.id);
    }
    
    // Strategy 2: Fallback to match by index (DeepSeek behavior)
    if (!found && typeof tc.index === "number") {
      found = result.find((t: any) => t.index === tc.index);
    }
    
    if (found) {
      // Append arguments incrementally, but detect if we're getting a new complete JSON object
      if (tc.function?.arguments) {
        const newArgs = tc.function.arguments;
        const existingArgs = found.function.arguments || "";
        
        // Check if the new arguments start with '{' and existing args end with '}'
        // This indicates a new complete JSON object, not a continuation
        const existingEndsComplete = existingArgs.trim().endsWith('}');
        const newStartsComplete = newArgs.trim().startsWith('{');
        
        if (existingEndsComplete && newStartsComplete && existingArgs.trim()) {
          // This is a new tool call with the same ID - don't merge, create new entry
          const newId = `${tc.id || found.id}_${result.length}`;
          const newToolCall: any = {
            id: newId,
            type: tc.type || "function",
            function: {
              name: tc.function?.name || found.function.name || "",
              arguments: newArgs,
            },
          };
          
          if (typeof tc.index === "number") {
            newToolCall.index = tc.index;
          }
          
          result.push(newToolCall);
          continue;
        }
        
        // Normal case: append arguments incrementally
        found.function.arguments = existingArgs + newArgs;
      }
      
      // Update name if it was empty before
      if (!found.function.name && tc.function?.name) {
        found.function.name = tc.function.name;
      }
      
      // Update type if it was empty before
      if ((!found.type || found.type === "function") && tc.type) {
        found.type = tc.type as "function";
      }
    } else {
      // Create new tool call
      const newId = tc.id || (typeof tc.index === "number" ? `tool_call_${tc.index}` : nowId());
      const newToolCall: any = {
        id: newId,
        type: tc.type || "function",
        function: {
          name: tc.function?.name || "",
          arguments: tc.function?.arguments || "",
        },
      };
      
      if (typeof tc.index === "number") {
        newToolCall.index = tc.index;
      }
      
      result.push(newToolCall);
    }
  }
  
  return result;
}

function finalizeToolProtocolContent(
  rawContent: string,
  existingToolCalls: ToolCallInfo[],
): { content: string; toolCalls: ToolCallInfo[]; extractedToolCalls: ToolCallInfo[] } {
  const extracted = extractToolProtocol(rawContent);
  const toolCalls = extracted.toolCalls.length > 0
    ? dedupeToolCalls([...existingToolCalls, ...extracted.toolCalls])
    : existingToolCalls;

  return {
    content: extracted.visibleText,
    toolCalls,
    extractedToolCalls: extracted.toolCalls,
  };
}

/**
 * Stream chat completions from the API.
 * Yields chunks as they arrive for real-time UI updates.
 */
export async function* streamChatCompletion(
  options: StreamOptions
): AsyncGenerator<StreamChunk, void, unknown> {
  let content = "";
  let reasoning = "";
  let toolCalls: ToolCallInfo[] = [];
  let finishReason: string | undefined;
  const protocolStream = createToolProtocolStream();

  for await (const chunk of openAIChatCompletionsStream({
    apiUrl: options.apiUrl,
    apiKey: options.apiKey,
    model: options.model,
    messages: options.messages,
    temperature: options.temperature,
    maxTokens: options.maxTokens,
    signal: options.signal,
    tools: options.tools,
    protocol: options.protocol,
    anthropicApiPath: options.anthropicApiPath,
    maxContextTokens: options.maxContextTokens,
  })) {
    if (chunk.type === "content" && chunk.content) {
      content += chunk.content;
      const visibleDelta = protocolStream.append(chunk.content);
      if (visibleDelta) {
        yield { type: "content", content: visibleDelta };
      }
    } else if (chunk.type === "reasoning" && chunk.reasoning != null) {
      reasoning += chunk.reasoning;
      yield { type: "reasoning", reasoning: chunk.reasoning };
    } else if (chunk.type === "tool_calls" && chunk.tool_calls) {
      toolCalls = mergeToolCalls(toolCalls, chunk.tool_calls);
      yield { type: "tool_calls", toolCalls };
    } else if (chunk.type === "finish_reason" && chunk.finishReason) {
      finishReason = chunk.finishReason;
    }
  }

  const finalized = finalizeToolProtocolContent(content, toolCalls);
  content = finalized.content;
  toolCalls = finalized.toolCalls;
  if (finalized.extractedToolCalls.length > 0) {
    yield { type: "tool_calls", toolCalls };
  }

  yield { type: "done", result: { content, toolCalls, reasoning: reasoning != null ? reasoning : undefined, finishReason } };
}

/**
 * Stream chat with automatic retry using fallback message format.
 *
 * @param options - Base streaming options
 * @param standardMessages - Standard OpenAI format messages
 * @param fallbackMessages - Fallback format for incompatible APIs
 * @param onRetry - Callback when retry is triggered
 */
export async function* streamChatWithRetry(
  options: Omit<StreamOptions, "messages">,
  standardMessages: OpenAIChatMessage[],
  fallbackMessages: OpenAIChatMessage[],
  onRetry?: () => void
): AsyncGenerator<StreamChunk, void, unknown> {
  const timeoutMs = options.timeoutMs ?? 30000;
  const enableContextCompression = options.enableContextCompression ?? true;
  const maxContextTokens = options.maxContextTokens ?? 128000;
  const compressionThreshold = options.compressionThreshold ?? Math.floor(maxContextTokens * 0.9);
  const preserveRecentMessages = options.preserveRecentMessages ?? 10;
  
  let content = "";
  let reasoning = "";
  let toolCalls: ToolCallInfo[] = [];
  let finishReason: string | undefined;
  let usedFallback = false;
  let protocolStream = createToolProtocolStream();

  // Apply context compression if enabled and messages exceed threshold
  const maybeCompressMessages = async (messages: OpenAIChatMessage[]): Promise<OpenAIChatMessage[]> => {
    if (!enableContextCompression) return messages;
    
    const currentTokens = estimateTotalTokens(messages);
    if (currentTokens <= compressionThreshold) return messages;
    
    console.log(`[streamChatWithRetry] Context compression triggered: ${currentTokens} tokens > ${compressionThreshold} threshold`);
    
    const { messages: compressedMessages, stats, wasCompressed } = await compressMessages(
      messages,
      compressionThreshold,
      {
        preserveRecentCount: preserveRecentMessages,
        preserveSystemMessages: true,
      }
    );
    
    if (wasCompressed) {
      console.log(`[streamChatWithRetry] Context compressed: ${stats.totalMessages} -> ${stats.compressedMessages} messages, ` +
        `${currentTokens} -> ${stats.estimatedTokens} tokens (ratio: ${stats.compressionRatio.toFixed(2)}x)`);
    }
    
    return compressedMessages;
  };

  const doStream = async function* (
    messages: OpenAIChatMessage[]
  ): AsyncGenerator<StreamChunk, void, unknown> {
    // Create a combined abort controller that responds to both user abort and timeout
    const timeoutController = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    
    // Helper to reset/start the timeout timer
    const resetTimeout = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        timeoutController.abort();
      }, timeoutMs);
    };
    
    // Start initial timeout
    resetTimeout();
    
    // If user's signal is already aborted, abort immediately
    if (options.signal?.aborted) {
      if (timeoutId) clearTimeout(timeoutId);
      throw new DOMException("Aborted", "AbortError");
    }
    
    // Link user's abort signal to our timeout controller
    const onUserAbort = () => timeoutController.abort();
    options.signal?.addEventListener("abort", onUserAbort);

    try {
      for await (const chunk of openAIChatCompletionsStream({
        apiUrl: options.apiUrl,
        apiKey: options.apiKey,
        model: options.model,
        messages,
        temperature: options.temperature,
        maxTokens: options.maxTokens,
        signal: timeoutController.signal,
        tools: options.tools,
        protocol: options.protocol,
        anthropicApiPath: options.anthropicApiPath,
        maxContextTokens: options.maxContextTokens,
      })) {
        // Reset timeout on each chunk received (prevents timeout during slow responses)
        resetTimeout();

        if (chunk.type === "content" && chunk.content) {
          content += chunk.content;
          const visibleDelta = protocolStream.append(chunk.content);
          if (visibleDelta) {
            yield { type: "content", content: visibleDelta };
          }
        } else if (chunk.type === "reasoning" && chunk.reasoning != null) {
          reasoning += chunk.reasoning;
          yield { type: "reasoning", reasoning: chunk.reasoning };
        } else if (chunk.type === "tool_calls" && chunk.tool_calls) {
          toolCalls = mergeToolCalls(toolCalls, chunk.tool_calls);
          yield { type: "tool_calls", toolCalls };
        } else if (chunk.type === "finish_reason" && chunk.finishReason) {
          finishReason = chunk.finishReason;
        }
      }
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      options.signal?.removeEventListener("abort", onUserAbort);
    }
  };

  // Apply context compression to messages before streaming
  const compressedStandardMessages = await maybeCompressMessages(standardMessages);
  const compressedFallbackMessages = await maybeCompressMessages(fallbackMessages);

  try {
    yield* doStream(compressedStandardMessages);
  } catch (err: any) {
    const isAbort = String(err?.name) === "AbortError";
    if (isAbort) throw err;

    usedFallback = true;
    content = "";
    reasoning = "";
    toolCalls = [];
    finishReason = undefined;
    protocolStream = createToolProtocolStream();
    onRetry?.();

    try {
      yield* doStream(compressedFallbackMessages);
    } catch (fallbackErr: any) {
      const isFallbackAbort = String(fallbackErr?.name) === "AbortError";
      if (isFallbackAbort) throw fallbackErr;
      console.error("[streamChatWithRetry] 标准和备用格式均失败:", fallbackErr?.message);
      content = `请求失败: ${fallbackErr?.message || "未知错误"}`;
    }
  }

  // Only retry with fallback if response is truly empty (no content AND no tool calls)
  // Tool calls with empty content is a valid response - don't retry in that case
  if (!usedFallback && content.trim().length === 0 && toolCalls.length === 0) {
    usedFallback = true;
    content = "";
    reasoning = ""; // 重置 reasoning
    protocolStream = createToolProtocolStream();
    onRetry?.();

    try {
      yield* doStream(compressedFallbackMessages);
    } catch (fallbackErr: any) {
    }
  }

  const finalized = finalizeToolProtocolContent(content, toolCalls);
  content = finalized.content;
  toolCalls = finalized.toolCalls;
  if (finalized.extractedToolCalls.length > 0) {
    yield { type: "tool_calls", toolCalls };
  }

  // ── 最大输出恢复：finish_reason 为 "length"/"max_tokens" 时自动续写 ──
  const maxOutputRetries = options.maxOutputRetries ?? 3;
  let outputRetryCount = 0;

  while (
    (finishReason === "length" || finishReason === "max_tokens") &&
    outputRetryCount < maxOutputRetries &&
    toolCalls.length === 0 &&
    content.trim().length > 0
  ) {
    outputRetryCount++;
    console.log(`[streamChatWithRetry] 输出达到上限，自动续写 (${outputRetryCount}/${maxOutputRetries})...`);

    // 构建续写消息：追加部分 assistant 回复 + "请继续"
    const partialAssistant: OpenAIChatMessage = {
      role: "assistant",
      content,
    };
    const continueMsg: OpenAIChatMessage = {
      role: "user",
      content: "请继续",
    };

    const continueStandard = await maybeCompressMessages([
      ...compressedStandardMessages,
      partialAssistant,
      continueMsg,
    ]);
    const continueFallback = await maybeCompressMessages([
      ...compressedFallbackMessages,
      partialAssistant,
      continueMsg,
    ]);

    // 续写流（使用独立局部变量，不污染外层累加器）
    let contContent = "";
    let contReasoning = "";
    let contFinishReason: string | undefined;
    let contToolCalls: ToolCallInfo[] = [];
    let contError: string | null = null;
    const contProtocolStream = createToolProtocolStream();

    try {
      const contTimeoutController = new AbortController();
      let contTimeoutId: ReturnType<typeof setTimeout> | null = null;

      const contResetTimeout = () => {
        if (contTimeoutId) clearTimeout(contTimeoutId);
        contTimeoutId = setTimeout(() => contTimeoutController.abort(), timeoutMs);
      };
      contResetTimeout();

      const onContAbort = () => contTimeoutController.abort();
      options.signal?.addEventListener("abort", onContAbort);

      try {
        for await (const chunk of openAIChatCompletionsStream({
          apiUrl: options.apiUrl,
          apiKey: options.apiKey,
          model: options.model,
          messages: continueStandard,
          temperature: options.temperature,
          maxTokens: options.maxTokens,
          signal: contTimeoutController.signal,
          tools: undefined, // 续写不带工具，让模型专注完成文本
          protocol: options.protocol,
          anthropicApiPath: options.anthropicApiPath,
          maxContextTokens: options.maxContextTokens,
        })) {
          contResetTimeout();
          if (chunk.type === "content" && chunk.content) {
            contContent += chunk.content;
            const visibleDelta = contProtocolStream.append(chunk.content);
            if (visibleDelta) {
              yield { type: "content", content: visibleDelta };
            }
          } else if (chunk.type === "reasoning" && chunk.reasoning != null) {
            contReasoning += chunk.reasoning;
            yield { type: "reasoning", reasoning: chunk.reasoning };
          } else if (chunk.type === "finish_reason" && chunk.finishReason) {
            contFinishReason = chunk.finishReason;
          } else if (chunk.type === "tool_calls" && chunk.tool_calls) {
            contToolCalls = mergeToolCalls(contToolCalls, chunk.tool_calls);
          }
        }
      } finally {
        if (contTimeoutId) clearTimeout(contTimeoutId);
        options.signal?.removeEventListener("abort", onContAbort);
      }
    } catch (err: any) {
      if (String(err?.name) === "AbortError") throw err;
      contError = err?.message || "续写失败";
      console.warn(`[streamChatWithRetry] 续写失败:`, contError);
      break;
    }

    // 累加续写内容
    if (contContent) {
      const finalizedContinuation = finalizeToolProtocolContent(contContent, contToolCalls);
      contContent = finalizedContinuation.content;
      contToolCalls = finalizedContinuation.toolCalls;
      content += contContent;
    }
    if (contReasoning) {
      reasoning = reasoning || contReasoning;
    }
    if (contToolCalls.length > 0) {
      toolCalls = contToolCalls;
    }
    finishReason = contFinishReason;

    if (contError) break;
  }

  yield { type: "done", result: { content, toolCalls, reasoning: reasoning != null ? reasoning : undefined, finishReason } };
}
