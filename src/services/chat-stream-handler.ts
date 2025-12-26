/**
 * Chat Stream Handler Service
 *
 * Encapsulates streaming AI chat completions with automatic retry and fallback logic.
 * Supports mode-based tool call handling (Agent/Supervised/Ask modes).
 */

import {
  openAIChatCompletionsStream,
  type OpenAIChatMessage,
  type OpenAITool,
} from "./openai-client";
import { nowId } from "../utils/text-utils";
import {
  type ChatMode,
  type PendingToolCall,
  getMode,
  addPendingToolCall,
} from "../store/chat-mode-store";

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
  console.log("[mergeToolCalls] === START ===");
  console.log("[mergeToolCalls] Existing count:", existing.length);
  console.log("[mergeToolCalls] Incoming count:", incoming.length);
  console.log("[mergeToolCalls] Incoming raw:", JSON.stringify(incoming, null, 2));
  
  const result = [...existing];
  for (let i = 0; i < incoming.length; i++) {
    const tc = incoming[i];
    console.log(`[mergeToolCalls] Processing incoming[${i}]:`, {
      id: tc.id,
      index: tc.index,
      type: tc.type,
      function_name: tc.function?.name,
      arguments_length: tc.function?.arguments?.length,
      arguments_preview: tc.function?.arguments?.substring(0, 100),
    });
    
    // Strategy 1: Match by ID (standard OpenAI/Gemini behavior)
    // Only match if tc.id is a valid non-null value
    let found: ToolCallInfo | undefined = undefined;
    if (tc.id !== null && tc.id !== undefined) {
      found = result.find((t) => t.id === tc.id);
      console.log(`[mergeToolCalls] Found existing by id "${tc.id}":`, found ? "YES" : "NO");
    } else {
      console.log(`[mergeToolCalls] ID is null/undefined, skipping ID-based matching`);
    }
    
    // Strategy 2: Fallback to match by index (DeepSeek behavior)
    // If ID matching failed and index is available, try index-based matching
    if (!found && typeof tc.index === "number") {
      found = result.find((t: any) => t.index === tc.index);
      console.log(`[mergeToolCalls] Found existing by index ${tc.index}:`, found ? "YES" : "NO");
    }
    
    if (found) {
      console.log(`[mergeToolCalls] Merging into existing tool call:`, found.function.name || "(unnamed)");
      
      // Append arguments incrementally
      if (tc.function?.arguments) {
        const oldArgs = found.function.arguments || "";
        found.function.arguments = oldArgs + tc.function.arguments;
        console.log(`[mergeToolCalls] Appended arguments: "${oldArgs}" + "${tc.function.arguments}" => "${found.function.arguments}"`);
      }
      
      // Update name if it was empty before (DeepSeek sends name only in first chunk)
      if (!found.function.name && tc.function?.name) {
        found.function.name = tc.function.name;
        console.log(`[mergeToolCalls] Updated function name to: ${tc.function.name}`);
      }
      
      // Update type if it was empty before
      if ((!found.type || found.type === "function") && tc.type) {
        found.type = tc.type as "function";
        console.log(`[mergeToolCalls] Updated type to: ${tc.type}`);
      }
    } else {
      // Create new tool call
      const newId = tc.id || nowId();
      const newToolCall: any = {
        id: newId,
        type: tc.type || "function",
        function: {
          name: tc.function?.name || "",
          arguments: tc.function?.arguments || "",
        },
      };
      
      // Preserve index for future matching (DeepSeek compatibility)
      if (typeof tc.index === "number") {
        newToolCall.index = tc.index;
      }
      
      console.log(`[mergeToolCalls] Creating NEW tool call:`, newToolCall);
      result.push(newToolCall);
    }
  }
  
  console.log("[mergeToolCalls] Result count:", result.length);
  console.log("[mergeToolCalls] Result summary:", result.map(t => ({
    id: t.id,
    index: (t as any).index,
    name: t.function.name,
    args_length: t.function.arguments.length,
  })));
  console.log("[mergeToolCalls] === END ===");
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
      console.log("[streamChatCompletion] Received tool_calls chunk, merging...");
      const oldCount = toolCalls.length;
      toolCalls = mergeToolCalls(toolCalls, chunk.tool_calls);
      console.log(`[streamChatCompletion] toolCalls count: ${oldCount} => ${toolCalls.length}`);
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
    // Create a combined abort controller that responds to both user abort and timeout
    const timeoutController = new AbortController();
    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    
    // Helper to reset/start the timeout timer
    const resetTimeout = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        console.warn(`[streamChatWithRetry] Request timeout after ${timeoutMs}ms`);
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
        signal: timeoutController.signal, // Use the combined signal!
        tools: options.tools,
      })) {
        // Reset timeout on each chunk received (prevents timeout during slow responses)
        resetTimeout();

        if (chunk.type === "content" && chunk.content) {
          content += chunk.content;
          yield { type: "content", content: chunk.content };
        } else if (chunk.type === "tool_calls" && chunk.tool_calls) {
          console.log("[streamChatWithRetry] Received tool_calls chunk, merging...");
          const oldCount = toolCalls.length;
          toolCalls = mergeToolCalls(toolCalls, chunk.tool_calls);
          console.log(`[streamChatWithRetry] toolCalls count: ${oldCount} => ${toolCalls.length}`);
          yield { type: "tool_calls", toolCalls };
        }
      }
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
      options.signal?.removeEventListener("abort", onUserAbort);
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

// ============================================================================
// Mode-Based Tool Call Handling
// ============================================================================

/**
 * Result of processing tool calls based on chat mode
 */
export interface ToolCallRoutingResult {
  /** Tool calls to execute immediately (Agent mode) */
  executeImmediately: ToolCallInfo[];
  /** Tool calls queued for user confirmation (Supervised mode) */
  pendingForConfirmation: PendingToolCall[];
  /** Whether execution should pause for user confirmation */
  shouldPauseForConfirmation: boolean;
}

/**
 * Route tool calls based on the current chat mode.
 * 
 * - Agent mode: All tool calls are returned for immediate execution
 * - Supervised mode: Tool calls are added to pending queue, execution pauses
 * - Ask mode: Should not receive tool calls (handled by message-builder excluding tools)
 * 
 * @param toolCalls - Array of tool calls from the AI response
 * @param chatMode - Optional chat mode override (defaults to store value)
 * @returns Routing result indicating how to handle the tool calls
 */
export function routeToolCallsByMode(
  toolCalls: ToolCallInfo[],
  chatMode?: ChatMode
): ToolCallRoutingResult {
  const mode = chatMode ?? getMode();
  
  console.log(`[routeToolCallsByMode] Mode: ${mode}, Tool calls: ${toolCalls.length}`);
  
  // Ask mode should not receive tool calls (handled upstream by excluding tools from API)
  // If we somehow receive them, treat as no-op
  if (mode === 'ask') {
    console.warn('[routeToolCallsByMode] Received tool calls in Ask mode - ignoring');
    return {
      executeImmediately: [],
      pendingForConfirmation: [],
      shouldPauseForConfirmation: false,
    };
  }
  
  // Agent mode: execute all tool calls immediately
  if (mode === 'agent') {
    console.log('[routeToolCallsByMode] Agent mode - executing immediately');
    return {
      executeImmediately: toolCalls,
      pendingForConfirmation: [],
      shouldPauseForConfirmation: false,
    };
  }
  
  // Supervised mode: queue all tool calls for user confirmation
  if (mode === 'supervised') {
    console.log('[routeToolCallsByMode] Supervised mode - queuing for confirmation');
    
    const pendingCalls: PendingToolCall[] = [];
    
    for (const toolCall of toolCalls) {
      let args: Record<string, any> = {};
      try {
        args = JSON.parse(toolCall.function.arguments || '{}');
      } catch (e) {
        console.warn(`[routeToolCallsByMode] Failed to parse args for ${toolCall.function.name}:`, e);
        args = { _raw: toolCall.function.arguments };
      }
      
      const pendingCall = addPendingToolCall(toolCall.function.name, args);
      // Store the original tool call ID for later execution
      (pendingCall as any).originalToolCallId = toolCall.id;
      pendingCalls.push(pendingCall);
    }
    
    return {
      executeImmediately: [],
      pendingForConfirmation: pendingCalls,
      shouldPauseForConfirmation: pendingCalls.length > 0,
    };
  }
  
  // Fallback: treat unknown modes as agent mode
  console.warn(`[routeToolCallsByMode] Unknown mode "${mode}" - defaulting to agent behavior`);
  return {
    executeImmediately: toolCalls,
    pendingForConfirmation: [],
    shouldPauseForConfirmation: false,
  };
}

/**
 * Check if tool execution should proceed based on current mode
 * @param chatMode - Optional chat mode override
 * @returns true if tools should be executed immediately, false if confirmation needed
 */
export function shouldExecuteToolsImmediately(chatMode?: ChatMode): boolean {
  const mode = chatMode ?? getMode();
  return mode === 'agent';
}

/**
 * Check if the current mode requires tool confirmation
 * @param chatMode - Optional chat mode override
 * @returns true if in supervised mode requiring confirmation
 */
export function requiresToolConfirmation(chatMode?: ChatMode): boolean {
  const mode = chatMode ?? getMode();
  return mode === 'supervised';
}
