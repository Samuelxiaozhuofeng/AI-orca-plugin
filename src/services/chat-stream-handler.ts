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
import { nowId } from "../utils/text-utils";

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
}

export interface StreamResult {
  content: string;
  toolCalls: ToolCallInfo[];
}

export interface ToolCallInfo {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export type StreamChunk =
  | { type: "content"; content: string }
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
  for (const tc of incoming) {
    const found = result.find((t) => t.id === tc.id);
    if (found) {
      if (tc.function?.arguments) {
        found.function.arguments =
          (found.function.arguments || "") + tc.function.arguments;
      }
    } else {
      result.push({
        id: tc.id || nowId(),
        type: tc.type || "function",
        function: {
          name: tc.function?.name || "",
          arguments: tc.function?.arguments || "",
        },
      });
    }
  }
  return result;
}

/**
 * Stream chat completions from the API.
 * Yields chunks as they arrive for real-time UI updates.
 */
export async function* streamChatCompletion(
  options: StreamOptions
): AsyncGenerator<StreamChunk, void, unknown> {
  let content = "";
  let toolCalls: ToolCallInfo[] = [];

  for await (const chunk of openAIChatCompletionsStream({
    apiUrl: options.apiUrl,
    apiKey: options.apiKey,
    model: options.model,
    messages: options.messages,
    temperature: options.temperature,
    maxTokens: options.maxTokens,
    signal: options.signal,
    tools: options.tools,
  })) {
    if (chunk.type === "content" && chunk.content) {
      content += chunk.content;
      yield { type: "content", content: chunk.content };
    } else if (chunk.type === "tool_calls" && chunk.tool_calls) {
      toolCalls = mergeToolCalls(toolCalls, chunk.tool_calls);
      yield { type: "tool_calls", toolCalls };
    }
  }

  yield { type: "done", result: { content, toolCalls } };
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
  let content = "";
  let toolCalls: ToolCallInfo[] = [];
  let usedFallback = false;

  const doStream = async function* (
    messages: OpenAIChatMessage[]
  ): AsyncGenerator<StreamChunk, void, unknown> {
    const timeoutController = new AbortController();
    const timeoutId = setTimeout(() => {
      console.warn(`[streamChatWithRetry] Request timeout after ${timeoutMs}ms`);
      timeoutController.abort();
    }, timeoutMs);

    try {
      for await (const chunk of openAIChatCompletionsStream({
        apiUrl: options.apiUrl,
        apiKey: options.apiKey,
        model: options.model,
        messages,
        temperature: options.temperature,
        maxTokens: options.maxTokens,
        signal: options.signal,
        tools: options.tools,
      })) {
        clearTimeout(timeoutId);

        if (chunk.type === "content" && chunk.content) {
          content += chunk.content;
          yield { type: "content", content: chunk.content };
        } else if (chunk.type === "tool_calls" && chunk.tool_calls) {
          toolCalls = mergeToolCalls(toolCalls, chunk.tool_calls);
          yield { type: "tool_calls", toolCalls };
        }
      }
    } finally {
      clearTimeout(timeoutId);
    }
  };

  try {
    yield* doStream(standardMessages);
  } catch (err: any) {
    const isAbort = String(err?.name) === "AbortError";
    if (isAbort) throw err;

    console.log("[streamChatWithRetry] Retrying with fallback format...");
    usedFallback = true;
    content = "";
    toolCalls = [];
    onRetry?.();

    yield* doStream(fallbackMessages);
  }

  // Retry with fallback if response is empty
  if (!usedFallback && content.trim().length === 0 && toolCalls.length === 0) {
    console.warn("[streamChatWithRetry] Empty response, retrying with fallback...");
    usedFallback = true;
    content = "";
    onRetry?.();

    try {
      yield* doStream(fallbackMessages);
    } catch (fallbackErr: any) {
      console.error("[streamChatWithRetry] Fallback retry failed:", fallbackErr);
    }
  }

  yield { type: "done", result: { content, toolCalls } };
}
