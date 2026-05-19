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

// ═══════════════════════════════════════════════════════════════════════════
// <tool_call> XML 标签适配层 (Qwen3/Llama/DeepSeek/GLM 等模型)
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 解析 <tool_call> XML 标签，支持多种格式：
 * 格式1 (JSON): '<tool_call>{"name": "searchNotes", "arguments": {"query": "酒馆"}}</tool_call>'
 * 格式2 (arg_key/arg_value): '<tool_call>searchNotes<arg_key>query</arg_key><arg_value>脂肪</arg_value></tool_call>'
 * 格式3 (name属性): '<tool_call name="searchNotes"><arg>...</arg></tool_call>'
 * 输出: [{ id, type, function: { name, arguments } }]
 */
export function parseXmlToolCalls(content: string): ToolCallInfo[] {
  const toolCalls: ToolCallInfo[] = [];
  
  // 匹配所有 <tool_call>...</tool_call> 块
  const toolCallRegex = /<tool_call(?:\s+name="([^"]+)")?[^>]*>\s*([\s\S]*?)\s*<\/tool_call>/g;
  let match;
  let index = 0;
  
  while ((match = toolCallRegex.exec(content)) !== null) {
    const nameAttr = match[1]; // 从 name 属性获取的工具名
    const innerContent = match[2].trim();
    
    let toolName = "";
    let args: Record<string, any> = {};
    let parsed = false;
    
    // 尝试格式1: JSON 格式（必须包含 name 或 function.name 字段）
    if (!parsed && innerContent.startsWith("{")) {
      try {
        const jsonObj = JSON.parse(innerContent);
        toolName = jsonObj.name || jsonObj.function?.name || "";
        
        // 只有当 JSON 中包含工具名时，才认为格式1成功
        if (toolName) {
          let jsonArgs = jsonObj.arguments ?? jsonObj.parameters ?? {};
          if (typeof jsonArgs === "object") {
            args = jsonArgs;
          } else if (typeof jsonArgs === "string") {
            try {
              args = JSON.parse(jsonArgs);
            } catch {
              args = { value: jsonArgs };
            }
          }
          parsed = true;
        }
        // 如果 JSON 中没有 name 字段，不设置 parsed，继续尝试其他格式
      } catch {
        // 不是有效 JSON，继续尝试其他格式
      }
    }
    
    // 尝试格式2: <arg_key>...</arg_key><arg_value>...</arg_value> 格式
    if (!parsed && innerContent.includes("<arg_key>")) {
      // 工具名是 <arg_key> 之前的文本
      const argKeyIndex = innerContent.indexOf("<arg_key>");
      toolName = innerContent.substring(0, argKeyIndex).trim();
      
      // 解析所有 arg_key/arg_value 对
      const argPairRegex = /<arg_key>([\s\S]*?)<\/arg_key>\s*<arg_value>([\s\S]*?)<\/arg_value>/g;
      let argMatch;
      while ((argMatch = argPairRegex.exec(innerContent)) !== null) {
        const key = argMatch[1].trim();
        let value: any = argMatch[2].trim();
        // 尝试解析为 JSON
        try {
          value = JSON.parse(value);
        } catch {
          // 保持字符串值
        }
        args[key] = value;
      }
      parsed = true;
    }
    
    // 尝试格式3: 使用 name 属性，内容可能是其他参数格式
    if (!parsed && nameAttr) {
      toolName = nameAttr;
      // 尝试解析内容为参数
      if (innerContent.startsWith("{")) {
        try {
          args = JSON.parse(innerContent);
          parsed = true;
        } catch (err) {
          console.warn("[parseXmlToolCalls] Failed to parse JSON args for name-attribute form:", err);
          args = { input: innerContent };
          parsed = true;
        }
      } else if (innerContent) {
        args = { input: innerContent };
        parsed = true;
      } else {
        // 无参数的工具调用
        args = {};
        parsed = true;
      }
    }
    
    // 如果以上都失败，尝试将整个内容作为简单的工具名+参数
    if (!parsed && innerContent) {
      // 简单启发式：如果内容看起来像是 "toolName param1 param2"
      const parts = innerContent.split(/\s+/);
      if (parts.length > 0) {
        toolName = parts[0];
        if (parts.length > 1) {
          args = { input: parts.slice(1).join(" ") };
        }
        parsed = true;
      }
    }
    
    if (toolName) {
      toolCalls.push({
        id: `xml_tool_call_${index++}`,
        type: "function",
        function: {
          name: toolName,
          arguments: JSON.stringify(args),
        },
      });
    } else {
      console.warn("[parseXmlToolCalls] Could not parse tool call:", innerContent);
    }
  }
  
  return toolCalls;
}

/**
 * 检查内容是否包含 <tool_call> 标签
 *
 * 注意：部分模型会输出带属性的形式，例如：<tool_call name="xxx">...</tool_call>
 */
export function hasXmlToolCalls(content: string): boolean {
  return /<tool_call\b/i.test(content);
}

/**
 * 从内容中移除 <tool_call> 块，返回纯文本内容
 */
export function stripXmlToolCalls(content: string): string {
  return content.replace(/<tool_call\b[^>]*>[\s\S]*?<\/tool_call>/gi, "").trim();
}

// ═══════════════════════════════════════════════════════════════════════════
// DSML / 纯 invoke 工具调用适配层 (DeepSeek/GLM 等模型)
// 同时支持两种格式:
//   带前缀: <｜DSML｜invoke name="..."><｜DSML｜parameter name="...">value</｜DSML｜parameter></｜DSML｜invoke>
//   纯格式: <invoke name="..."><parameter name="...">value</parameter></invoke>
// ═══════════════════════════════════════════════════════════════════════════

/** DSML 前缀（可选匹配） */
const DSML = "(?:｜DSML｜)?";

/**
 * 检查内容是否包含 DSML 或纯 invoke 格式的工具调用
 */
export function hasDsmlToolCalls(content: string): boolean {
  return /<｜DSML｜function_calls>/.test(content)
    || /<｜DSML｜invoke/.test(content)
    || /<invoke[\s>]/.test(content);
}

/**
 * 解析 DSML 或纯 invoke 格式的工具调用
 */
export function parseDsmlToolCalls(content: string): ToolCallInfo[] {
  const toolCalls: ToolCallInfo[] = [];

  // 匹配所有 invoke 块（可选 DSML 前缀）
  const invokeRegex = new RegExp(
    `<${DSML}invoke\\s+name="([^"]+)"[^>]*>([\\s\\S]*?)<\\/${DSML}invoke>`,
    "g"
  );
  let match;
  let index = 0;

  while ((match = invokeRegex.exec(content)) !== null) {
    const toolName = match[1];
    const invokeContent = match[2];

    // 解析参数（可选 DSML 前缀）
    const args: Record<string, any> = {};
    const paramRegex = new RegExp(
      `<${DSML}parameter\\s+name="([^"]+)"[^>]*>([\\s\\S]*?)<\\/${DSML}parameter>`,
      "g"
    );
    let paramMatch;

    while ((paramMatch = paramRegex.exec(invokeContent)) !== null) {
      const paramName = paramMatch[1];
      let paramValue: any = paramMatch[2].trim();

      // 尝试解析 JSON 值
      try {
        paramValue = JSON.parse(paramValue);
      } catch {
        // 保持字符串值
      }

      args[paramName] = paramValue;
    }

    toolCalls.push({
      id: `dsml_tool_call_${index++}`,
      type: "function",
      function: {
        name: toolName,
        arguments: JSON.stringify(args),
      },
    });
  }

  return toolCalls;
}

/**
 * 从内容中移除 DSML 或纯 invoke 工具调用块
 */
export function stripDsmlToolCalls(content: string): string {
  // 移除 DSML function_calls 块
  let result = content.replace(/<｜DSML｜function_calls>[\s\S]*?<\/｜DSML｜function_calls>/g, "");
  // 移除 invoke 块（带或不带 DSML 前缀）
  result = result.replace(/<(?:｜DSML｜)?invoke[\s\S]*?<\/(?:｜DSML｜)?invoke>/g, "");
  // 移除 parameter 标签残余
  result = result.replace(/<(?:｜DSML｜)?parameter[\s\S]*?<\/(?:｜DSML｜)?parameter>/g, "");
  // 移除自闭合标签
  result = result.replace(/<｜DSML｜[^>]*\/>/g, "");
  // 移除孤立的 invoke 开标签
  result = result.replace(/<(?:｜DSML｜)?\/?invoke[^>]*>/gi, "");
  // 移除孤立的 parameter 标签
  result = result.replace(/<(?:｜DSML｜)?\/?parameter[^>]*>/gi, "");
  return result.trim();
}

/** 检查字符串末尾是否为 <invoke（含 DSML 前缀）的部分前缀，用于跨 chunk 缓冲 */
function getTrailingInvokePrefixLen(s: string): number {
  const prefixes = ["<invok", "<invo", "<inv", "<in", "<i", "<"];
  for (const p of prefixes) {
    if (s.endsWith(p)) return p.length;
  }
  // Also check for DSML prefixed form: <｜DSML｜invoke...
  // The DSML prefix uses fullwidth vertical bar characters
  if (/<[｜|]?DSML[｜|]?invok$/.test(s)) return 16;
  if (/<[｜|]?DSML[｜|]?invo$/.test(s)) return 14;
  if (/<[｜|]?DSML[｜|]?inv$/.test(s)) return 13;
  if (/<[｜|]?DSML[｜|]?in$/.test(s)) return 12;
  if (/<[｜|]?DSML[｜|]?i$/.test(s)) return 11;
  if (/<[｜|]?DSML[｜|]?$/.test(s)) return 10;
  return 0;
}

/** 检测内容中是否出现 invoke 标签（含 DSML 前缀） */
const INVOKE_DETECT_RE = /<(?:｜DSML｜)?invoke[\s>]/;

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
  // 闸门：检测到 invoke XML 后停止向 UI 输出文本，静默累积用于 DSML 解析
  let invokeDetected = false;
  let yieldedContentLen = 0;

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
      if (!invokeDetected) {
        const invokeIdx = content.search(INVOKE_DETECT_RE);
        if (invokeIdx >= 0) {
          invokeDetected = true;
          if (invokeIdx > yieldedContentLen) {
            yield { type: "content", content: content.substring(yieldedContentLen, invokeIdx) };
            yieldedContentLen = invokeIdx;
          }
        } else {
          const partialLen = getTrailingInvokePrefixLen(content);
          const safeEnd = content.length - partialLen;
          if (safeEnd > yieldedContentLen) {
            yield { type: "content", content: content.substring(yieldedContentLen, safeEnd) };
            yieldedContentLen = safeEnd;
          }
        }
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

  // 检查 content 中是否包含 <tool_call> XML 标签
  // 即使存在原生 tool_calls，也必须剥离 XML/DSML，防止标签泄漏到回复文本
  if (hasXmlToolCalls(content)) {
    const xmlToolCalls = parseXmlToolCalls(content);
    content = stripXmlToolCalls(content);
    if (xmlToolCalls.length > 0) {
      const existingKeys = new Set(toolCalls.map(tc => `${tc.function.name}:${tc.function.arguments}`));
      for (const xtc of xmlToolCalls) {
        const key = `${xtc.function.name}:${xtc.function.arguments}`;
        if (!existingKeys.has(key)) { toolCalls.push(xtc); existingKeys.add(key); }
      }
      yield { type: "tool_calls", toolCalls };
    }
  }

  // 即使存在原生 tool_calls，也必须剥离 DSML，防止标签泄漏到回复文本
  if (hasDsmlToolCalls(content)) {
    const dsmlToolCalls = parseDsmlToolCalls(content);
    content = stripDsmlToolCalls(content);
    if (dsmlToolCalls.length > 0) {
      const existingKeys = new Set(toolCalls.map(tc => `${tc.function.name}:${tc.function.arguments}`));
      for (const dtc of dsmlToolCalls) {
        const key = `${dtc.function.name}:${dtc.function.arguments}`;
        if (!existingKeys.has(key)) { toolCalls.push(dtc); existingKeys.add(key); }
      }
      yield { type: "tool_calls", toolCalls };
    }
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
  let invokeDetected = false;
  let yieldedContentLen = 0;

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
          if (!invokeDetected) {
            const invokeIdx = content.search(INVOKE_DETECT_RE);
            if (invokeIdx >= 0) {
              invokeDetected = true;
              if (invokeIdx > yieldedContentLen) {
                yield { type: "content", content: content.substring(yieldedContentLen, invokeIdx) };
                yieldedContentLen = invokeIdx;
              }
            } else {
              const partialLen = getTrailingInvokePrefixLen(content);
              const safeEnd = content.length - partialLen;
              if (safeEnd > yieldedContentLen) {
                yield { type: "content", content: content.substring(yieldedContentLen, safeEnd) };
                yieldedContentLen = safeEnd;
              }
            }
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
    invokeDetected = false;
    yieldedContentLen = 0;
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
    invokeDetected = false;
    yieldedContentLen = 0;
    onRetry?.();

    try {
      yield* doStream(compressedFallbackMessages);
    } catch (fallbackErr: any) {
    }
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // Qwen3/Llama 适配: 检查 content 中是否包含 <tool_call> XML 标签
  // 如果模型不支持原生 tool_calls 格式，会把调用写在 content 里
  // ═══════════════════════════════════════════════════════════════════════════
  // 即使存在原生 tool_calls，也必须剥离 XML/DSML，防止标签泄漏到回复文本
  if (hasXmlToolCalls(content)) {
    console.log("[streamChatWithRetry] Detected <tool_call> XML in content, parsing...");
    const xmlToolCalls = parseXmlToolCalls(content);
    content = stripXmlToolCalls(content);
    if (xmlToolCalls.length > 0) {
      const existingKeys = new Set(toolCalls.map(tc => `${tc.function.name}:${tc.function.arguments}`));
      for (const xtc of xmlToolCalls) {
        const key = `${xtc.function.name}:${xtc.function.arguments}`;
        if (!existingKeys.has(key)) { toolCalls.push(xtc); existingKeys.add(key); }
      }
      yield { type: "tool_calls", toolCalls };
    }
  }

  // 即使存在原生 tool_calls，也必须剥离 DSML，防止标签泄漏到回复文本
  if (hasDsmlToolCalls(content)) {
    console.log("[streamChatWithRetry] Detected DSML format tool calls in content, parsing...");
    const dsmlToolCalls = parseDsmlToolCalls(content);
    content = stripDsmlToolCalls(content);
    if (dsmlToolCalls.length > 0) {
      const existingKeys = new Set(toolCalls.map(tc => `${tc.function.name}:${tc.function.arguments}`));
      for (const dtc of dsmlToolCalls) {
        const key = `${dtc.function.name}:${dtc.function.arguments}`;
        if (!existingKeys.has(key)) { toolCalls.push(dtc); existingKeys.add(key); }
      }
      yield { type: "tool_calls", toolCalls };
    }
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
            // 实时输出续写内容
            yield { type: "content", content: chunk.content };
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
