import { sanitizeToolProtocolText } from "./tool-call-protocol";

export type OpenAIChatRole = "system" | "user" | "assistant" | "tool";

export type OpenAIChatMessage = {
  role: OpenAIChatRole;
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: {
      name: string;
      arguments: string;
    };
  }>;
  tool_call_id?: string;
  name?: string;
};

export type OpenAITool = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, any>;
      required?: string[];
    };
  };
};

export type OpenAIChatStreamArgs = {
  apiUrl: string;
  apiKey: string;
  model: string;
  messages: OpenAIChatMessage[];
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  tools?: OpenAITool[];
  protocol?: "openai" | "anthropic";
  anthropicApiPath?: string;
  /** 模型上下文长度限制（tokens），超出时自动截断 */
  maxContextTokens?: number;
  /** 请求超时时间（毫秒），默认 60000 (60秒) */
  timeout?: number;
  /** 最大重试次数，默认 2 */
  maxRetries?: number;
  /** 重试延迟基数（毫秒），默认 1000，实际延迟 = base * 2^attempt */
  retryDelayBase?: number;
  /** 是否返回 usage 统计信息 */
  includeUsage?: boolean;
};

function joinUrl(base: string, path: string): string {
  const b = base.replace(/\/+$/, "");
  const p = path.replace(/^\/+/, "");
  return `${b}/${p}`;
}

function getChatCompletionsUrl(apiUrl: string): string {
  const trimmed = apiUrl.trim().replace(/\/+$/, "");
  if (trimmed.toLowerCase().endsWith("/chat/completions")) return trimmed;
  return joinUrl(trimmed, "/chat/completions");
}

function getChatCompletionsUrlCandidates(apiUrl: string): string[] {
  const trimmed = apiUrl.trim().replace(/\/+$/, "");
  const lower = trimmed.toLowerCase();
  if (lower.endsWith("/chat/completions")) return [trimmed];
  if (lower.endsWith("/v1")) return [joinUrl(trimmed, "/chat/completions")];
  // 兼容：很多 OpenAI 兼容网关要求 /v1 前缀
  return [joinUrl(trimmed, "/v1/chat/completions"), joinUrl(trimmed, "/chat/completions")];
}

function getAnthropicMessagesUrl(apiUrl: string): string {
  const trimmed = apiUrl.trim().replace(/\/+$/, "");
  const lower = trimmed.toLowerCase();
  if (lower.endsWith("/messages")) return trimmed;
  if (lower.endsWith("/v1")) return joinUrl(trimmed, "/messages");
  return joinUrl(trimmed, "/v1/messages");
}

function getAnthropicMessagesUrlCandidates(apiUrl: string, anthropicApiPath?: string): string[] {
  const override = typeof anthropicApiPath === "string" ? anthropicApiPath.trim() : "";
  if (override) {
    if (/^https?:\/\//i.test(override)) return [override];
    return [joinUrl(apiUrl, override)];
  }

  const trimmed = apiUrl.trim().replace(/\/+$/, "");
  const lower = trimmed.toLowerCase();
  if (lower.endsWith("/messages")) return [trimmed];
  if (lower.endsWith("/v1")) return [joinUrl(trimmed, "/messages"), trimmed];
  // 兼容部分代理：baseUrl 可能已经包含了版本路径（不需要 /v1）
  // 额外回退：有些第三方把“baseUrl 本身”当作最终 messages 入口（不需要追加 /v1/messages）
  return [joinUrl(trimmed, "/v1/messages"), joinUrl(trimmed, "/messages"), trimmed];
}

async function readErrorMessage(res: Response): Promise<string> {
  const contentType = res.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("application/json")) {
      const json = await res.json();
      
      // 详细日志：输出完整的错误响应
      console.error("[API Error] Full error response:", JSON.stringify(json, null, 2));
      
      const msg =
        json?.error?.message ??
        json?.message ??
        (typeof json === "string" ? json : null);
      if (typeof msg === "string" && msg.trim()) return msg.trim();
      return JSON.stringify(json);
    }
  } catch {}

  try {
    const text = await res.text();
    if (text.trim()) {
      console.error("[API Error] Text response:", text);
      return text.trim();
    }
  } catch {}

  return `HTTP ${res.status}`;
}

type StreamChunk = {
  type: "content" | "tool_calls" | "reasoning" | "usage" | "finish_reason";
  content?: string;
  reasoning?: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: {
      name: string;
      arguments: string;
    };
  }>;
  /** Token 使用统计 */
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  /** 模型停止原因: "stop" | "length" | "tool_calls" | "content_filter" | "end_turn" | "max_tokens" */
  finishReason?: string;
};

function parseDataUrl(url: string): { mediaType: string; base64: string } | null {
  // 兼容带参数的 data URL，例如 data:image/png;name=xxx;base64,...
  const match = url.match(/^data:([^;,]+)(?:;[^,]+)*;base64,(.+)$/i);
  if (!match) return null;
  const mediaType = match[1].trim();
  const base64 = match[2].trim();
  if (!mediaType || !base64) return null;
  return { mediaType, base64 };
}

function openAIContentToAnthropicBlocks(content: any): any[] {
  if (typeof content === "string") {
    return content ? [{ type: "text", text: content }] : [];
  }

  if (Array.isArray(content)) {
    const blocks: any[] = [];
    for (const part of content) {
      if (!part || typeof part !== "object") continue;

      if (part.type === "text" && typeof part.text === "string") {
        if (part.text) blocks.push({ type: "text", text: part.text });
        continue;
      }

      // OpenAI multimodal image part: { type: "image_url", image_url: { url } }
      if (part.type === "image_url" && typeof part.image_url?.url === "string") {
        const parsed = parseDataUrl(part.image_url.url);
        // Anthropic 仅支持 image/jpeg, image/png, image/gif, image/webp
        // 参考: https://docs.anthropic.com/en/docs/build-with-claude/vision#supported-image-formats
        const supportedTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
        
        if (parsed && supportedTypes.includes(parsed.mediaType.toLowerCase())) {
          blocks.push({
            type: "image",
            source: {
              type: "base64",
              media_type: parsed.mediaType,
              data: parsed.base64,
            },
          });
        } else {
          // 不支持的格式或无法解析，降级为文本提示
          // 如果是 base64，截断显示
          const urlPreview = part.image_url.url.length > 100
            ? part.image_url.url.substring(0, 50) + "..."
            : part.image_url.url;
          blocks.push({ type: "text", text: `[image: ${urlPreview}]` });
        }
        continue;
      }

      // 视频/其它：Anthropic Messages 不支持 video_url，降级为文本
      if (part.type === "video_url" && typeof part.video_url?.url === "string") {
        blocks.push({ type: "text", text: `[video: ${part.video_url.url}]` });
        continue;
      }
    }
    return blocks;
  }

  return [];
}

function buildAnthropicMessagesFromOpenAI(
  openAiMessages: OpenAIChatMessage[],
): { system?: string; messages: Array<{ role: "user" | "assistant"; content: any[] }> } {
  const systemMessages = openAiMessages.filter((m) => m.role === "system");
  const system = systemMessages
    .map((m) => (typeof m.content === "string" ? m.content : ""))
    .filter(Boolean)
    .join("\n");

  const messages: Array<{ role: "user" | "assistant"; content: any[] }> = [];

  for (const m of openAiMessages) {
    if (m.role === "system") continue;

    // Tool result messages (OpenAI) => tool_result blocks (Anthropic) carried by user role.
    if (m.role === "tool") {
      const toolUseId = typeof (m as any).tool_call_id === "string" ? (m as any).tool_call_id : "";
      const contentText = typeof m.content === "string" ? m.content : "";

      if (!toolUseId) {
        // 无法关联 tool_use，降级为普通文本 user 消息
        const blocks = contentText ? [{ type: "text", text: contentText }] : [];
        if (blocks.length > 0) messages.push({ role: "user", content: blocks });
        continue;
      }

      messages.push({
        role: "user",
        content: [
          {
            type: "tool_result",
            tool_use_id: toolUseId,
            content: contentText || "",
          },
        ],
      });
      continue;
    }

    if (m.role !== "user" && m.role !== "assistant") continue;

    const blocks = openAIContentToAnthropicBlocks(m.content);

    if (m.role === "assistant" && Array.isArray(m.tool_calls) && m.tool_calls.length > 0) {
      for (const tc of m.tool_calls) {
        const id = typeof tc?.id === "string" ? tc.id : "";
        const name = typeof tc?.function?.name === "string" ? tc.function.name : "";
        const args = typeof tc?.function?.arguments === "string" ? tc.function.arguments : "";

        let input: any = {};
        if (args && args.trim()) {
          try {
            input = JSON.parse(args);
          } catch {
            input = {};
          }
        }

        blocks.push({
          type: "tool_use",
          id: id || undefined,
          name,
          input,
        });
      }
    }

    // Anthropic 要求 content 非空；否则降级加一个空文本块
    const safeBlocks = blocks.length > 0 ? blocks : [{ type: "text", text: "" }];

    // 合并连续的相同角色消息
    const lastMsg = messages[messages.length - 1];
    if (lastMsg && lastMsg.role === m.role) {
      lastMsg.content.push(...safeBlocks);
    } else {
      messages.push({ role: m.role, content: safeBlocks });
    }
  }

  return { system: system || undefined, messages };
}

// ─── Content sanitization ────────────────────────────────────────────────────
// 流式传输中 invoke/DSML 标签跨 chunk 被截断的问题，在累积完整后需要统一清洗。
// chat-stream-handler 的 DSML 解析器负责提取工具调用，此层负责最终净化显示内容。

function sanitizeContentChunk(text: string): string {
  return text;
}

/**
 * 完整文本净化 — 移除所有 invoke/DSML/tool_call 标签和残片。
 * 在显示层和存储历史前调用，确保标签不会泄漏到用户可见内容中。
 */
export function sanitizeContent(text: string): string {
  return sanitizeToolProtocolText(text);
}

function safeDeltaFromEvent(obj: any): StreamChunk {
  const errMsg = obj?.error?.message;
  if (typeof errMsg === "string" && errMsg.trim()) {
    throw new Error(errMsg.trim());
  }

  const delta = obj?.choices?.[0]?.delta;
  const choice = obj?.choices?.[0];

  // 检测 finish_reason（"stop" | "length" | "tool_calls" | "content_filter"）
  const finishReason = choice?.finish_reason;
  if (finishReason && typeof finishReason === "string") {
    return { type: "finish_reason", finishReason };
  }

  // Check for tool calls in delta
  if (delta?.tool_calls) {
    return {
      type: "tool_calls",
      tool_calls: delta.tool_calls,
    };
  }

  // Check for reasoning content (DeepSeek/Claude/OpenAI thinking)
  // 尝试多种可能的字段名
  // 注意：DeepSeek 的 reasoning_content 可能为空字符串 ""，不能用 || 过滤
  let reasoning: string | undefined;
  if (delta) {
    if ("reasoning_content" in delta) reasoning = delta.reasoning_content;
    else if ("thinking" in delta) reasoning = delta.thinking;
    else if ("reasoning" in delta) reasoning = delta.reasoning;
  }
  if (reasoning === undefined && choice) {
    if ("reasoning_content" in choice) reasoning = choice.reasoning_content;
    else if ("thinking" in choice) reasoning = choice.thinking;
  }

  // DeepSeek Reasoner 有时会返回重复字符，尝试去重
  if (typeof reasoning === "string") {
    // 检测并修复连续重复的字符模式（如 "我我喜喜欢欢" -> "我喜欢"）
    // 使用更宽松的检测：如果超过 50% 的字符是连续重复的，就进行去重
    const originalLength = reasoning.length;
    const deduped = reasoning.replace(/(.)\1/g, '$1');
    const removedCount = originalLength - deduped.length;
    // 如果去除的重复字符超过原长度的 40%，说明确实有大量重复
    if (originalLength > 4 && removedCount > originalLength * 0.4) {
      reasoning = deduped;
    }
    
    return {
      type: "reasoning",
      reasoning,
    };
  }

  // Check for content in delta
  // 注意：不在此处清洗 invoke/DSML 标签，因为跨 chunk 的标签需要在累积完整后由
  // chat-stream-handler 的 DSML 解析器统一处理。显示层由 sanitizeContent 负责。
  if (delta && typeof delta.content === "string" && delta.content.length > 0) {
    return {
      type: "content",
      content: delta.content,
    };
  }

  // Check message (non-streaming response)
  const msg = obj?.choices?.[0]?.message;
  if (msg) {
    if (msg.tool_calls) {
      return {
        type: "tool_calls",
        tool_calls: msg.tool_calls,
      };
    }
    // Check reasoning in non-streaming message
    // 注意：DeepSeek 的 reasoning_content 可能为空字符串 ""
    const msgReasoning = ("reasoning_content" in msg) ? msg.reasoning_content : msg.thinking;
    if (typeof msgReasoning === "string") {
      return {
        type: "reasoning",
        reasoning: msgReasoning,
      };
    }
    if (typeof msg.content === "string") {
      const cleaned = sanitizeContentChunk(msg.content);
      if (!cleaned) return { type: "content" };
      return {
        type: "content",
        content: cleaned,
      };
    }
  }

  // Legacy text field
  if (typeof obj?.text === "string") {
    const cleaned = sanitizeContentChunk(obj.text);
    if (!cleaned) return { type: "content" };
    return {
      type: "content",
      content: cleaned,
    };
  }

  return {
    type: "content",
    content: "",
  };
}

function safeAnthropicDeltaFromEvent(obj: any): StreamChunk {
  const error = obj?.error;
  if (error?.message && typeof error.message === "string") {
    throw new Error(error.message);
  }

  // Anthropic streaming events
  // https://docs.anthropic.com/en/api/messages-streaming
  if (obj?.type === "content_block_delta") {
    const text = obj?.delta?.text;
    if (typeof text === "string" && text) {
      const cleaned = sanitizeContentChunk(text);
      if (!cleaned) return { type: "content" };
      return { type: "content", content: cleaned };
    }
  }

  // Some proxies may send plain message object
  if (Array.isArray(obj?.content)) {
    const text = obj.content
      .map((b: any) => (b?.type === "text" ? b?.text : ""))
      .filter((t: any) => typeof t === "string" && t)
      .join("");
    const cleaned = sanitizeContentChunk(text);
    if (!cleaned) return { type: "content" };
    return { type: "content", content: cleaned };
  }

  return { type: "content", content: "" };
}

function extractAnthropicText(json: any): string {
  if (!json) return "";
  if (Array.isArray(json.content)) {
    return json.content
      .map((b: any) => (b?.type === "text" ? b?.text : ""))
      .filter((t: any) => typeof t === "string")
      .join("");
  }
  return "";
}

function extractAnthropicToolCalls(json: any): StreamChunk["tool_calls"] {
  const blocks = Array.isArray(json?.content) ? json.content : [];
  const toolUses = blocks.filter((b: any) => b?.type === "tool_use");
  if (toolUses.length === 0) return undefined;
  return toolUses.map((b: any, i: number) => {
    const id = typeof b?.id === "string" && b.id ? b.id : `tool_call_${i}`;
    const name = typeof b?.name === "string" ? b.name : "";
    const input = b?.input ?? {};
    return {
      id,
      type: "function",
      function: {
        name,
        arguments: JSON.stringify(input),
      },
    };
  });
}

/**
 * 估算文本内容的 token 数
 * 
 * 基于 OpenAI 的 tokenizer 特性：
 * - 中文字符：约 1.5-2 字符/token（每个汉字通常是 1-2 个 token）
 * - 英文单词：约 4 字符/token（平均一个单词 1 个 token）
 * - 数字：约 2-3 数字/token
 * - 标点符号：通常 1 个符号 = 1 个 token
 * - base64 图片：约 3 字符/token
 * 
 * 此函数根据内容的实际组成动态计算更准确的估算值
 */
function estimateTokens(content: any): number {
  if (!content) return 0;
  
  if (typeof content === "string") {
    // 检测是否是 base64 图片数据
    if (content.startsWith("data:image")) {
      // base64 图片：大约每 3 个字符 = 1 token
      return Math.ceil(content.length / 3);
    }
    
    return estimateTextTokens(content);
  }
  
  if (Array.isArray(content)) {
    return content.reduce((sum, part) => {
      if (part?.type === "text") return sum + estimateTokens(part.text);
      if (part?.type === "image_url") return sum + estimateTokens(part.image_url?.url);
      return sum + estimateTokens(JSON.stringify(part));
    }, 0);
  }
  
  return Math.ceil(JSON.stringify(content).length / 4);
}

/**
 * 根据文本内容的语言组成估算 token 数
 * 使用更精确的分类计算
 */
function estimateTextTokens(text: string): number {
  if (!text) return 0;
  
  // 统计各类字符数量
  let chineseChars = 0;      // 中日韩字符
  let englishChars = 0;      // 英文字母
  let numberChars = 0;       // 数字
  let punctuationChars = 0;  // 标点符号
  let whitespaceChars = 0;   // 空白字符
  let otherChars = 0;        // 其他字符
  
  for (const char of text) {
    const code = char.charCodeAt(0);
    
    // 中日韩统一表意文字 (CJK Unified Ideographs)
    if (
      (code >= 0x4E00 && code <= 0x9FFF) ||   // CJK 基本
      (code >= 0x3400 && code <= 0x4DBF) ||   // CJK 扩展 A
      (code >= 0x20000 && code <= 0x2A6DF) || // CJK 扩展 B
      (code >= 0x3000 && code <= 0x303F) ||   // CJK 标点
      (code >= 0xFF00 && code <= 0xFFEF)      // 全角字符
    ) {
      chineseChars++;
    }
    // 日文假名
    else if (
      (code >= 0x3040 && code <= 0x309F) ||   // 平假名
      (code >= 0x30A0 && code <= 0x30FF)      // 片假名
    ) {
      chineseChars++; // 日文假名与中文类似处理
    }
    // 英文字母
    else if (
      (code >= 0x41 && code <= 0x5A) ||  // A-Z
      (code >= 0x61 && code <= 0x7A)     // a-z
    ) {
      englishChars++;
    }
    // 数字
    else if (code >= 0x30 && code <= 0x39) { // 0-9
      numberChars++;
    }
    // 空白字符
    else if (char === ' ' || char === '\t' || char === '\n' || char === '\r') {
      whitespaceChars++;
    }
    // ASCII 标点符号
    else if (
      (code >= 0x21 && code <= 0x2F) ||  // ! " # $ % & ' ( ) * + , - . /
      (code >= 0x3A && code <= 0x40) ||  // : ; < = > ? @
      (code >= 0x5B && code <= 0x60) ||  // [ \ ] ^ _ `
      (code >= 0x7B && code <= 0x7E)     // { | } ~
    ) {
      punctuationChars++;
    }
    // 其他字符（如表情符号、特殊符号等）
    else {
      otherChars++;
    }
  }
  
  // 根据各类字符的 token 比率计算估算值
  // 这些比率基于 OpenAI cl100k_base tokenizer 的经验值
  const tokens = 
    chineseChars * 0.6 +        // 中文：约 1.5-2 字符/token → 0.5-0.67 token/字符
    englishChars / 4.5 +        // 英文：约 4-5 字符/token（单词平均长度）
    numberChars / 2.5 +         // 数字：约 2-3 数字/token
    punctuationChars * 0.5 +    // 标点：约 2 个标点/token（很多标点会合并）
    whitespaceChars * 0.25 +    // 空白：通常与相邻 token 合并
    otherChars * 0.7;           // 其他：保守估计
  
  // 添加一些基础开销（BPE 分词的边界效应）
  const baseOverhead = Math.ceil(text.length / 100); // 每 100 字符约 1 token 的边界开销
  
  return Math.max(1, Math.ceil(tokens + baseOverhead));
}

/**
 * 估算消息数组的总 token 数
 */
function estimateMessagesTokens(messages: OpenAIChatMessage[]): number {
  return messages.reduce((sum, msg) => {
    // 每条消息有约 4 token 的开销
    return sum + 4 + estimateTokens(msg.content);
  }, 0);
}

/**
 * 估算工具定义的 token 数
 */
function estimateToolsTokens(tools: OpenAITool[]): number {
  if (!tools || tools.length === 0) return 0;
  return tools.reduce((sum, tool) => {
    const desc = tool.function.description || "";
    const params = JSON.stringify(tool.function.parameters || {});
    return sum + estimateTokens(tool.function.name) + estimateTokens(desc) + estimateTokens(params);
  }, 0);
}

/**
 * 移除消息中的图片，替换为文本提示
 */
function stripImagesFromMessages(messages: OpenAIChatMessage[]): OpenAIChatMessage[] {
  return messages.map(msg => {
    if (!msg.content || typeof msg.content === "string") return msg;
    // OpenAI multimodal messages can have array content
    const contentArr = msg.content as any[];
    if (!Array.isArray(contentArr)) return msg;
    
    const newContent = contentArr.map((part: any) => {
      if (part?.type === "image_url") {
        return { type: "text", text: "[图片已移除以适应上下文限制]" };
      }
      return part;
    });
    
    return { ...msg, content: newContent as any };
  });
}

/**
 * 截断较早的消息以适应上下文限制
 */
function truncateOlderMessages(
  messages: OpenAIChatMessage[],
  targetTokens: number,
  currentTokens: number
): OpenAIChatMessage[] {
  if (currentTokens <= targetTokens) return messages;
  
  // 保留 system 消息和最近的消息
  const systemMessages = messages.filter(m => m.role === "system");
  const nonSystemMessages = messages.filter(m => m.role !== "system");
  
  // 从最早的非系统消息开始移除
  let result = [...nonSystemMessages];
  let tokens = currentTokens;
  
  while (tokens > targetTokens && result.length > 2) {
    const removed = result.shift();
    if (removed) {
      tokens -= (4 + estimateTokens(removed.content));
    }
  }
  
  // 如果还是超出，添加摘要提示
  if (tokens > targetTokens && result.length > 0) {
    result = [{
      role: "user" as const,
      content: "[早期对话已被截断以适应上下文限制]"
    }, ...result.slice(-2)];
  }
  
  return [...systemMessages, ...result];
}

/**
 * 延迟函数
 */
function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * 判断错误是否可重试
 */
function isRetryableError(status: number): boolean {
  // 429: Rate limit, 500+: Server errors (except 501 Not Implemented)
  return status === 429 || (status >= 500 && status !== 501);
}

/**
 * 创建带超时的 AbortSignal
 */
function createTimeoutSignal(timeoutMs: number, existingSignal?: AbortSignal): { signal: AbortSignal; cleanup: () => void } {
  const controller = new AbortController();
  
  const timeoutId = setTimeout(() => {
    controller.abort(new Error(`Request timeout after ${timeoutMs}ms`));
  }, timeoutMs);
  
  // 如果有外部 signal，监听它的 abort 事件
  const onExternalAbort = () => {
    clearTimeout(timeoutId);
    controller.abort(existingSignal?.reason);
  };
  
  if (existingSignal) {
    existingSignal.addEventListener('abort', onExternalAbort);
  }
  
  const cleanup = () => {
    clearTimeout(timeoutId);
    if (existingSignal) {
      existingSignal.removeEventListener('abort', onExternalAbort);
    }
  };
  
  return { signal: controller.signal, cleanup };
}

export async function* openAIChatCompletionsStream(
  args: OpenAIChatStreamArgs,
): AsyncGenerator<StreamChunk, void, unknown> {
  const protocol = args.protocol || "openai";
  const logPrefix = protocol === "anthropic" ? "[anthropic]" : "[openAI]";
  const urlCandidates =
    protocol === "anthropic"
      ? getAnthropicMessagesUrlCandidates(args.apiUrl, args.anthropicApiPath)
      : getChatCompletionsUrlCandidates(args.apiUrl);
  
  // 配置参数
  const timeout = args.timeout ?? 60000; // 默认 60 秒
  const maxRetries = args.maxRetries ?? 2;
  const retryDelayBase = args.retryDelayBase ?? 1000;
  const includeUsage = args.includeUsage ?? true;

  let requestBody: any;

  if (protocol === "anthropic") {
    // Anthropic messages format
    const built = buildAnthropicMessagesFromOpenAI(args.messages);

    requestBody = {
      model: args.model,
      messages: built.messages,
      system: built.system,
      max_tokens: args.maxTokens ?? 1024,
      temperature: args.temperature,
      stream: true,
    };
  } else {
    // OpenAI-compatible format
    requestBody = {
      model: args.model,
      messages: args.messages,
      temperature: args.temperature,
      max_tokens: args.maxTokens,
      stream: true,
      // 启用推理内容和 usage 统计返回
      stream_options: {
        include_usage: includeUsage,
      },
    };
  }

  // Debug: 检查 assistant 消息是否符合 DeepSeek 要求
  for (const msg of args.messages) {
    if (msg.role === "assistant") {
      const hasContent = msg.content !== null && msg.content !== undefined && 
        (typeof msg.content === 'string' ? msg.content.length > 0 : true);
      const hasToolCalls = msg.tool_calls && msg.tool_calls.length > 0;
      if (!hasContent && !hasToolCalls) {
        console.warn(`${logPrefix} Warning: assistant message has no content and no tool_calls:`, msg);
      }
    }
  }

  // Add tools (OpenAI-compatible vs Anthropic-compatible schemas)
  let toolsToUse = args.tools;
  if (toolsToUse && toolsToUse.length > 0) {
    if (protocol === "anthropic") {
      requestBody.tools = toolsToUse.map((t) => ({
        name: t.function.name,
        description: t.function.description,
        input_schema: t.function.parameters,
      }));
    } else {
      requestBody.tools = toolsToUse;
    }
  }

  // ========== 上下文溢出保护 ==========
  const maxContextTokens = args.maxContextTokens || 0;
  if (maxContextTokens > 0) {
    // 预留响应空间（max_tokens 或默认 2048）
    const reservedForResponse = args.maxTokens || 2048;
    const availableTokens = maxContextTokens - reservedForResponse;
    
    // 估算当前 token 数
    let messagesTokens = estimateMessagesTokens(requestBody.messages);
    let toolsTokens = toolsToUse ? estimateToolsTokens(toolsToUse) : 0;
    let totalTokens = messagesTokens + toolsTokens;
    
    console.log(`${logPrefix} Token 估算: messages=${messagesTokens}, tools=${toolsTokens}, total=${totalTokens}, limit=${availableTokens}`);
    
    // 如果超出限制，依次执行截断策略
    if (totalTokens > availableTokens) {
      console.warn(`${logPrefix} ⚠️ 上下文超出限制 (${totalTokens} > ${availableTokens})，开始自动调整...`);
      
      // 策略 1：移除图片
      const messagesWithoutImages = stripImagesFromMessages(requestBody.messages);
      const tokensAfterStripImages = estimateMessagesTokens(messagesWithoutImages);
      
      if (tokensAfterStripImages + toolsTokens <= availableTokens) {
        console.log(`${logPrefix} 策略 1 成功：移除图片后 tokens=${tokensAfterStripImages + toolsTokens}`);
        requestBody.messages = messagesWithoutImages;
        totalTokens = tokensAfterStripImages + toolsTokens;
      } else {
        // 图片已移除，继续下一策略
        requestBody.messages = messagesWithoutImages;
        messagesTokens = tokensAfterStripImages;
        totalTokens = messagesTokens + toolsTokens;
        
        // 策略 2：移除工具（如果 tools 占比很大）
        if (toolsTokens > availableTokens * 0.3 && toolsTokens > 500) {
          console.log(`${logPrefix} 策略 2：移除工具以节省 ${toolsTokens} tokens`);
          delete requestBody.tools;
          toolsToUse = undefined;
          toolsTokens = 0;
          totalTokens = messagesTokens;
        }
        
        // 策略 3：截断早期消息
        if (totalTokens > availableTokens) {
          console.log(`${logPrefix} 策略 3：截断早期消息...`);
          requestBody.messages = truncateOlderMessages(
            requestBody.messages,
            availableTokens - toolsTokens,
            messagesTokens
          );
          totalTokens = estimateMessagesTokens(requestBody.messages) + toolsTokens;
          console.log(`${logPrefix} 截断后 tokens=${totalTokens}`);
        }
      }
      
      console.log(`${logPrefix} ✅ 调整完成，最终 tokens=${totalTokens}`);
    }
  }

  // DEBUG: Log the full request body to help troubleshoot 400 errors
  console.log(`${logPrefix} Request URL:`, urlCandidates[0]);
  console.log(`${logPrefix} Request Body:`, JSON.stringify(requestBody, null, 2));
  
  // 验证请求体中的关键字段
  if (requestBody.tools && requestBody.tools.length > 0) {
    console.log(`${logPrefix} Tools count:`, requestBody.tools.length);
    requestBody.tools.forEach((tool: any, idx: number) => {
      const toolName = protocol === "anthropic" ? tool.name : tool.function?.name;
      console.log(`${logPrefix} Tool[${idx}]:`, toolName);
      
      // 检查工具名称是否符合规范（只能包含字母、数字、下划线和连字符）
      if (toolName && !/^[a-zA-Z0-9_-]+$/.test(toolName)) {
        console.error(`${logPrefix} ⚠️ Invalid tool name detected: "${toolName}" - must match pattern ^[a-zA-Z0-9_-]+$`);
      }
    });
  }

  const body = JSON.stringify(requestBody);
  let res: Response | null = null;
  let lastError: Error | null = null;
  let isHttpError = false;

  // 带重试的请求循环
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    // 如果是重试，先等待
    if (attempt > 0) {
      const retryDelay = retryDelayBase * Math.pow(2, attempt - 1);
      console.log(`${logPrefix} 🔄 重试 ${attempt}/${maxRetries}，等待 ${retryDelay}ms...`);
      await delay(retryDelay);
    }
    
    // 尝试所有 URL 候选
    for (let i = 0; i < urlCandidates.length; i++) {
      const url = urlCandidates[i];
      
      // 创建带超时的 signal
      const { signal: timeoutSignal, cleanup } = createTimeoutSignal(timeout, args.signal);
      
      try {
        res = await fetch(url, {
          method: "POST",
          headers: {
            Accept: "text/event-stream",
            "Content-Type": "application/json",
            ...(protocol === "anthropic"
              ? {
                  "x-api-key": args.apiKey,
                  "anthropic-version": "2023-06-01",
                  Authorization: `Bearer ${args.apiKey}`,
                }
              : { Authorization: `Bearer ${args.apiKey}` }),
          },
          body,
          signal: timeoutSignal,
        });
        
        cleanup(); // 清理超时定时器
        
        if (res.ok) break;
        
        // 404 尝试下一个 URL
        if (res.status === 404 && i < urlCandidates.length - 1) {
          console.warn(`${logPrefix} 404 at ${url}, trying fallback...`);
          continue;
        }
        
        // 读取错误信息
        const msg = await readErrorMessage(res);
        lastError = new Error(msg); isHttpError = true;
        
        console.error(`${logPrefix} ❌ Error response:`, {
          status: res.status,
          statusText: res.statusText,
          url: url,
          message: msg,
          headers: Object.fromEntries(res.headers.entries())
        });
        
        // 判断是否可重试
        if (isRetryableError(res.status) && attempt < maxRetries) {
          console.log(`${logPrefix} 可重试错误 (${res.status})，将进行重试...`);
          res = null; // 重置以便重试
          break; // 跳出 URL 循环，进入重试
        }
        
        // 不可重试的错误，直接抛出
        throw lastError;
        
      } catch (fetchErr: any) {
        cleanup(); // 确保清理

        // 检查是否是超时或取消
        if (fetchErr.name === 'AbortError') {
          if (args.signal?.aborted) {
            throw new Error('Request cancelled by user');
          }
          lastError = new Error(`Request timeout after ${timeout}ms`);
          console.warn(`${logPrefix} ⏱️ 请求超时`);
        } else if (isHttpError) {
          // HTTP 层错误（4xx 等不可重试错误），直接向上抛，不重试
          throw fetchErr;
        } else {
          lastError = fetchErr;
          console.error(`${logPrefix} Fetch error:`, fetchErr);
        }

        // 网络/超时错误可以重试
        if (attempt < maxRetries) {
          console.log(`${logPrefix} 网络错误，将进行重试...`);
          res = null;
          break;
        }

        throw lastError;
      }
    }
    
    // 如果请求成功，跳出重试循环
    if (res?.ok) break;
  }

  if (!res) {
    throw lastError || new Error("Failed to fetch after all retries");
  }

  const contentType = (res.headers.get("content-type") ?? "").toLowerCase();

  if (!res.body || contentType.includes("application/json")) {
    const json = await res.json();
    if (protocol === "anthropic") {
      const toolCalls = extractAnthropicToolCalls(json);
      if (toolCalls?.length) {
        yield { type: "tool_calls", tool_calls: toolCalls };
      }
      const text = extractAnthropicText(json);
      if (text) {
        const cleaned = sanitizeContentChunk(text);
        if (cleaned) yield { type: "content", content: cleaned };
      }
      return;
    }

    const chunk: StreamChunk = safeDeltaFromEvent(json);
    if (chunk.content || chunk.tool_calls || chunk.reasoning != null) yield chunk;
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const anthropicToolBlocks = new Map<number, { id: string; name: string }>();

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    while (true) {
      const newlineIndex = buffer.indexOf("\n");
      if (newlineIndex === -1) break;
      const rawLine = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);

      const line = rawLine.trim();
      if (!line) continue;
      if (!line.startsWith("data:")) continue;

      const data = line.slice("data:".length).trim();
      if (!data) continue;
      if (data === "[DONE]") return;

      let obj: any;
      try {
        obj = JSON.parse(data);
      } catch (parseErr) {
        console.warn(`${logPrefix} Failed to parse SSE data:`, data);
        continue;
      }

      if (protocol === "anthropic") {
        if (obj?.type === "error" && obj?.error?.message) {
          throw new Error(String(obj.error.message));
        }

        if (obj?.type === "content_block_start" && obj?.content_block?.type === "tool_use") {
          const index = typeof obj?.index === "number" ? obj.index : 0;
          const id = typeof obj?.content_block?.id === "string" && obj.content_block.id
            ? obj.content_block.id
            : `tool_call_${index}`;
          const name = typeof obj?.content_block?.name === "string" ? obj.content_block.name : "";
          anthropicToolBlocks.set(index, { id, name });

          const input = obj?.content_block?.input;
          const hasInput = input && typeof input === "object" && Object.keys(input).length > 0;
          if (hasInput) {
            yield {
              type: "tool_calls",
              tool_calls: [
                {
                  id,
                  type: "function",
                  function: { name, arguments: JSON.stringify(input) },
                },
              ],
            };
          } else {
            // Initialize empty args, so later input_json_delta can append safely.
            yield {
              type: "tool_calls",
              tool_calls: [
                {
                  id,
                  type: "function",
                  function: { name, arguments: "" },
                },
              ],
            };
          }
          continue;
        }

        if (obj?.type === "content_block_delta") {
          const deltaType = obj?.delta?.type;
          if (deltaType === "text_delta" && typeof obj?.delta?.text === "string" && obj.delta.text) {
            const cleaned = sanitizeContentChunk(obj.delta.text);
            if (!cleaned) continue;
            yield { type: "content", content: cleaned };
            continue;
          }

          if (deltaType === "input_json_delta" && typeof obj?.delta?.partial_json === "string") {
            const index = typeof obj?.index === "number" ? obj.index : 0;
            const tool = anthropicToolBlocks.get(index) || { id: `tool_call_${index}`, name: "" };
            yield {
              type: "tool_calls",
              tool_calls: [
                {
                  id: tool.id,
                  type: "function",
                  function: { name: tool.name, arguments: obj.delta.partial_json },
                },
              ],
            };
            continue;
          }
        }

        if (obj?.type === "message_stop") {
          if (obj?.["stop_reason"]) {
            yield { type: "finish_reason", finishReason: obj["stop_reason"] };
          }
          return;
        }

        const chunk = safeAnthropicDeltaFromEvent(obj);
        if (chunk.content || chunk.tool_calls || chunk.reasoning != null) yield chunk;
        continue;
      }

      // 检查 usage 信息（通常在最后一个 chunk）
      if (obj?.usage && includeUsage) {
        yield {
          type: "usage",
          usage: {
            prompt_tokens: obj.usage.prompt_tokens || 0,
            completion_tokens: obj.usage.completion_tokens || 0,
            total_tokens: obj.usage.total_tokens || 0,
          },
        };
      }
      
      const chunk = safeDeltaFromEvent(obj);
      if (chunk.content || chunk.tool_calls || chunk.reasoning != null) yield chunk;
    }
  }
}
