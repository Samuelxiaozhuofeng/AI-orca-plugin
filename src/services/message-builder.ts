/**
 * Message Builder Service
 *
 * Builds OpenAI-compatible message arrays with standard and fallback formats.
 * Supports multimodal messages with images, videos, and other files.
 */

import type { OpenAIChatMessage } from "./openai-client";
import type { Message } from "./session-service";
import type { ChatMode } from "../store/chat-mode-store";
import { buildImageContent } from "./image-service";
import { buildFileContentsForApi } from "./file-service";
import { extractOrcaImagesFromText, hasOrcaImageLinks } from "../utils/orca-image-extractor";

export interface MessageBuildParams {
  messages: Message[];
  userContent: string;
  systemPrompt?: string;
  contextText?: string;
  customMemory?: string;
  chatMode?: ChatMode;
  // Token 优化参数
  maxHistoryMessages?: number;       // 0=不限制
  enableCompression?: boolean;       // 是否启用压缩
  compressAfterMessages?: number;    // 超过多少条后压缩旧消息
  // 压缩服务参数
  sessionId?: string;                // 会话 ID（用于缓存摘要）
  apiConfig?: { apiUrl: string; apiKey: string; model: string }; // API 配置（用于生成摘要）
}

export interface ConversationBuildParams {
  messages: Message[];
  systemPrompt?: string;
  contextText?: string;
  customMemory?: string;
  chatMode?: ChatMode;
  // Token 优化参数
  maxHistoryMessages?: number;       // 0=不限制
  enableCompression?: boolean;       // 是否启用压缩
  compressAfterMessages?: number;    // 超过多少条后压缩旧消息
  // 压缩服务参数
  sessionId?: string;                // 会话 ID（用于缓存摘要）
  apiConfig?: { apiUrl: string; apiKey: string; model: string }; // API 配置（用于生成摘要）
}

export interface ToolResultParams extends MessageBuildParams {
  assistantContent: string;
  toolCalls: any[];
  toolResults: Message[];
}

import { getOrCreateSummary } from "./compression-service";

/**
 * 提取不压缩的消息（pinned 或 noCompress 标记）
 */
function extractPinnedMessages(messages: Message[]): { pinned: Message[]; rest: Message[] } {
  const pinned: Message[] = [];
  const rest: Message[] = [];
  
  for (const m of messages) {
    if ((m as any).pinned || (m as any).noCompress) {
      pinned.push(m);
    } else {
      rest.push(m);
    }
  }
  
  return { pinned, rest };
}

/**
 * Limit history messages, keeping system context intact
 * Strategy: Keep the most recent N messages, but ensure tool call chains are complete
 */
function limitHistoryMessages(messages: Message[], maxMessages: number): Message[] {
  if (maxMessages <= 0 || messages.length <= maxMessages) {
    return messages;
  }
  
  // 从后往前取 maxMessages 条
  const limited = messages.slice(-maxMessages);
  
  // 确保工具调用链完整：如果第一条是 tool 消息，需要找到对应的 assistant 消息
  // 收集 limited 中所有 tool 消息引用的 tool_call_id
  const toolCallIdsNeeded = new Set<string>();
  for (const m of limited) {
    if (m.role === "tool" && m.tool_call_id) {
      toolCallIdsNeeded.add(m.tool_call_id);
    }
  }
  
  // 检查 limited 中的 assistant 消息是否提供了这些 tool_call_id
  const toolCallIdsProvided = new Set<string>();
  for (const m of limited) {
    if (m.role === "assistant" && m.tool_calls) {
      for (const tc of m.tool_calls) {
        toolCallIdsProvided.add(tc.id);
      }
    }
  }
  
  // 找出缺失的 tool_call_id
  const missingIds = new Set<string>();
  for (const id of toolCallIdsNeeded) {
    if (!toolCallIdsProvided.has(id)) {
      missingIds.add(id);
    }
  }
  
  // 如果有缺失，从原始消息中找到提供这些 id 的 assistant 消息
  if (missingIds.size > 0) {
    const additionalMessages: Message[] = [];
    for (const m of messages) {
      if (m.role === "assistant" && m.tool_calls) {
        for (const tc of m.tool_calls) {
          if (missingIds.has(tc.id)) {
            additionalMessages.push(m);
            break;
          }
        }
      }
    }
    // 将缺失的 assistant 消息添加到开头
    return [...additionalMessages, ...limited];
  }
  
  return limited;
}

/**
 * Ask mode instruction to append to system prompt
 */
const ASK_MODE_INSTRUCTION = `

---
## 重要提示：当前为 Ask 模式
你现在处于"Ask 模式"。在此模式下：
- 你只能回答问题和提供信息
- 你不能执行任何操作或调用任何工具
- 如果用户请求执行操作，请解释你当前无法执行操作，但可以提供相关信息或建议
- 专注于提供有帮助的、信息性的回答`;

/**
 * Convert internal Message to OpenAI API format (sync, text only)
 */
function messageToApi(m: Message): OpenAIChatMessage {
  // DeepSeek 要求 assistant 消息必须有 content 或 tool_calls
  // 规则：
  // 1. 如果有 tool_calls，content 可以是 null
  // 2. 如果没有 tool_calls，content 必须是字符串（可以是空字符串）
  let content: string | null;
  if (m.role === "assistant") {
    const hasToolCalls = m.tool_calls && m.tool_calls.length > 0;
    if (hasToolCalls) {
      // 有 tool_calls 时，content 可以是 null 或实际内容
      content = m.content || null;
    } else {
      // 没有 tool_calls 时，content 必须是字符串
      content = m.content || "";
    }
  } else {
    content = m.content;
  }

  const msg: OpenAIChatMessage = {
    role: m.role as any,
    content,
  };
  if (m.tool_calls && m.tool_calls.length > 0) {
    msg.tool_calls = m.tool_calls;
  }
  if (m.tool_call_id) {
    msg.tool_call_id = m.tool_call_id;
    msg.name = m.name;
  }
  // DeepSeek Reasoner 要求 assistant 消息包含 reasoning_content 字段
  // 参考: https://api-docs.deepseek.com/guides/thinking_mode#tool-calls
  if (m.role === "assistant" && m.reasoning) {
    (msg as any).reasoning_content = m.reasoning;
  }
  return msg;
}

/**
 * Convert internal Message to OpenAI API format with image support (async)
 * 
 * 支持的图片来源：
 * 1. m.images - 直接附加的图片（legacy）
 * 2. m.files - 文件附件（包括图片、视频等）
 * 3. Orca 图片链接 - [!image(...)](orca-block:xxx) 格式
 */
async function messageToApiWithImages(m: Message): Promise<OpenAIChatMessage> {
  // Handle messages with images (multimodal) - legacy support
  if (m.images && m.images.length > 0 && m.role === "user") {
    const contentParts: any[] = [];
    
    // Add text content if present
    if (m.content) {
      contentParts.push({ type: "text", text: m.content });
    }
    
    // Add image content
    for (const img of m.images) {
      const imageContent = await buildImageContent(img);
      if (imageContent) {
        contentParts.push(imageContent);
      }
    }
    
    if (contentParts.length > 0) {
      return {
        role: "user",
        content: contentParts as any,
      };
    }
  }

  // Handle messages with files (new format - supports all file types including video)
  if (m.files && m.files.length > 0 && m.role === "user") {
    const contentParts: any[] = [];

    // Add text content if present
    if (m.content) {
      contentParts.push({ type: "text", text: m.content });
    }

    // Add file content (may return multiple items for video)
    for (const file of m.files) {
      const fileContents = await buildFileContentsForApi(file);
      contentParts.push(...fileContents);
    }

    if (contentParts.length > 0) {
      return {
        role: "user",
        content: contentParts as any,
      };
    }
  }

  // Handle Orca image links in user messages: [!image(...)](orca-block:xxx)
  if (m.role === "user" && m.content && hasOrcaImageLinks(m.content)) {
    try {
      const { images, cleanedText } = await extractOrcaImagesFromText(m.content);
      
      if (images.length > 0) {
        const contentParts: any[] = [];
        
        // Add cleaned text content
        if (cleanedText.trim()) {
          contentParts.push({ type: "text", text: cleanedText });
        }
        
        // Add extracted images
        for (const img of images) {
          if (img.base64) {
            contentParts.push({
              type: "image_url",
              image_url: {
                url: `data:${img.mimeType};base64,${img.base64}`,
              },
            });
          }
        }
        
        if (contentParts.length > 0) {
          console.log(`[message-builder] Extracted ${images.length} Orca images from message`);
          return {
            role: "user",
            content: contentParts as any,
          };
        }
      }
    } catch (error) {
      console.error("[message-builder] Failed to extract Orca images:", error);
      // Fall through to standard text message
    }
  }

  // Standard text message
  return messageToApi(m);
}

/**
 * Build system message content from prompt, context, and memory
 */
function buildSystemContent(
  systemPrompt?: string,
  contextText?: string,
  customMemory?: string,
  chatMode?: ChatMode
): string | null {
  const parts: string[] = [];
  if (systemPrompt?.trim()) parts.push(systemPrompt.trim());
  if (customMemory?.trim()) parts.push(`用户信息:\n${customMemory.trim()}`);
  if (contextText?.trim()) parts.push(`Context:\n${contextText.trim()}`);
  
  // Append Ask mode instruction when in Ask mode
  if (chatMode === 'ask') {
    parts.push(ASK_MODE_INSTRUCTION.trim());
  }
  
  return parts.length > 0 ? parts.join("\n\n") : null;
}

/**
 * Build chat messages from full conversation history.
 *
 * Standard format: Preserves OpenAI tool-calling roles/fields with image support.
 * Fallback format: Strips tool_calls and converts tool messages into user messages.
 */
export async function buildConversationMessages(params: ConversationBuildParams): Promise<{
  standard: OpenAIChatMessage[];
  fallback: OpenAIChatMessage[];
}> {
  const { messages, systemPrompt, contextText, customMemory, chatMode, maxHistoryMessages, enableCompression, compressAfterMessages, sessionId, apiConfig } = params;

  let systemContent = buildSystemContent(systemPrompt, contextText, customMemory, chatMode);
  let filteredMessages = messages.filter((m) => !m.localOnly);
  
  // 使用 AI 生成摘要压缩旧消息（仅当启用压缩且有 sessionId 和 apiConfig 时）
  console.log(`[message-builder] Compression check: enableCompression=${enableCompression}, compressAfterMessages=${compressAfterMessages}, sessionId=${sessionId}, hasApiConfig=${!!apiConfig}, filteredMessages=${filteredMessages.length}`);
  if (enableCompression && compressAfterMessages && compressAfterMessages > 0 && sessionId && apiConfig) {
    console.log(`[message-builder] Entering compression path...`);
    try {
      const { summary, recentMessages } = await getOrCreateSummary(
        sessionId,
        filteredMessages,
        compressAfterMessages,
        apiConfig,
      );
      
      if (summary) {
        // 提取 pinned 消息
        const oldMessages = filteredMessages.slice(0, -compressAfterMessages);
        const { pinned } = extractPinnedMessages(oldMessages);
        
        // 将摘要添加到系统提示词中
        const summarySection = `\n\n## 对话历史摘要\n以下是之前对话的摘要，请参考：\n${summary}`;
        systemContent = (systemContent || "") + summarySection;
        
        // 只保留 pinned 消息和最近消息
        filteredMessages = [...pinned, ...recentMessages];
        console.log(`[message-builder] Using AI summary, keeping ${filteredMessages.length} messages`);
      }
    } catch (error) {
      console.error("[message-builder] Compression failed, using all messages:", error);
    }
  }
  
  // 硬限制历史消息数量（如果设置了）
  if (maxHistoryMessages && maxHistoryMessages > 0) {
    const originalCount = filteredMessages.length;
    filteredMessages = limitHistoryMessages(filteredMessages, maxHistoryMessages);
    if (filteredMessages.length < originalCount) {
      console.log(`[message-builder] Limited history from ${originalCount} to ${filteredMessages.length} messages`);
    }
  }
  
  // 收集所有有效的 tool_call_id（来自 assistant 消息的 tool_calls）
  const validToolCallIds = new Set<string>();
  filteredMessages.forEach((m) => {
    if (m.role === "assistant" && m.tool_calls && m.tool_calls.length > 0) {
      m.tool_calls.forEach((tc) => validToolCallIds.add(tc.id));
    }
  });
  
  // 过滤掉无效消息：
  // 1. 没有对应 tool_calls 的 tool 消息
  // 2. 既没有 content 也没有 tool_calls 的 assistant 消息
  const validMessages = filteredMessages.filter((m) => {
    // 过滤孤儿 tool 消息
    if (m.role === "tool" && m.tool_call_id) {
      return validToolCallIds.has(m.tool_call_id);
    }
    // 过滤无效 assistant 消息（既没有 content 也没有 tool_calls）
    // 注意：reasoning 不能单独作为有效内容，API 要求必须有 content 或 tool_calls
    if (m.role === "assistant") {
      const hasContent = m.content && m.content.trim().length > 0;
      const hasToolCalls = m.tool_calls && m.tool_calls.length > 0;
      // API 要求：必须有 content 或 tool_calls（reasoning 不算）
      if (!hasContent && !hasToolCalls) {
        console.log("[message-builder] Filtering out invalid assistant message (no content/tool_calls):", m.id);
        return false;
      }
    }
    return true;
  });
  
  // Build standard format with async image conversion
  const history = await Promise.all(validMessages.map(messageToApiWithImages));
  
  // 过滤掉转换后仍然无效的 assistant 消息
  const filteredHistory = history.filter((m) => {
    if (m.role === "assistant") {
      const hasContent = m.content !== null && m.content !== undefined && 
        (typeof m.content === 'string' ? m.content.trim().length > 0 : true);
      const hasToolCalls = m.tool_calls && m.tool_calls.length > 0;
      return hasContent || hasToolCalls;
    }
    return true;
  });

  const standard: OpenAIChatMessage[] = [
    ...(systemContent ? [{ role: "system" as const, content: systemContent }] : []),
    ...filteredHistory,
  ];

  // Build fallback format (sync, no images)
  const fallbackHistory = validMessages.map(messageToApi);
  const fallback: OpenAIChatMessage[] = [
    ...(systemContent ? [{ role: "system" as const, content: systemContent }] : []),
    ...fallbackHistory.flatMap((m) => {
      if (m.role === "tool") {
        const toolName = m.name || "tool";
        return [
          {
            role: "user" as const,
            content: `Tool Result [${toolName}]:\n${m.content ?? ""}`,
          },
        ];
      }

      if (m.role === "assistant") {
        const { tool_calls, ...rest } = m;
        // 确保 content 不是 null（API 要求 assistant 消息必须有 content 或 tool_calls）
        if (rest.content === null || rest.content === undefined) {
          rest.content = "";
        }
        // 如果移除 tool_calls 后，content 也是空的，则跳过这条消息
        if (!rest.content || (typeof rest.content === 'string' && rest.content.trim().length === 0)) {
          return [];
        }
        return [rest as OpenAIChatMessage];
      }

      // user/system messages
      return [m];
    }),
  ];

  return { standard, fallback };
}

/**
 * Build chat messages for initial API call (before tool execution)
 * Now async to support file content extraction
 */
export async function buildChatMessages(params: MessageBuildParams): Promise<OpenAIChatMessage[]> {
  const { messages, userContent, systemPrompt, contextText, customMemory, chatMode } = params;

  const systemContent = buildSystemContent(systemPrompt, contextText, customMemory, chatMode);
  const filteredMessages = messages.filter((m) => !m.localOnly);
  const history = await Promise.all(filteredMessages.map(messageToApiWithImages));

  return [
    ...(systemContent ? [{ role: "system" as const, content: systemContent }] : []),
    ...history,
    { role: "user" as const, content: userContent },
  ];
}

/**
 * Build messages including tool results in both standard and fallback formats.
 *
 * Standard format: Uses OpenAI's tool/assistant message structure
 * Fallback format: Converts tool results to user messages for incompatible APIs
 * Now async to support file content extraction
 */
export async function buildMessagesWithToolResults(params: ToolResultParams): Promise<{
  standard: OpenAIChatMessage[];
  fallback: OpenAIChatMessage[];
}> {
  const {
    messages,
    userContent,
    systemPrompt,
    contextText,
    customMemory,
    chatMode,
    assistantContent,
    toolCalls,
    toolResults,
  } = params;

  const systemContent = buildSystemContent(systemPrompt, contextText, customMemory, chatMode);
  const filteredMessages = messages.filter((m) => !m.localOnly);
  const history = await Promise.all(filteredMessages.map(messageToApiWithImages));

  // Standard OpenAI format with tool role
  const standard: OpenAIChatMessage[] = [
    ...(systemContent ? [{ role: "system" as const, content: systemContent }] : []),
    ...history,
    { role: "user" as const, content: userContent },
    {
      role: "assistant" as const,
      content: assistantContent || null,
      tool_calls: toolCalls,
    },
    ...toolResults.map((msg) => ({
      role: "tool" as const,
      content: msg.content,
      tool_call_id: msg.tool_call_id!,
      name: msg.name!,
    })),
  ];

  // Fallback format - convert tool results to user message
  const historySync = filteredMessages.map(messageToApi);
  const fallback: OpenAIChatMessage[] = [
    ...(systemContent ? [{ role: "system" as const, content: systemContent }] : []),
    ...historySync.map((m) => {
      // Strip tool_calls from fallback format
      const { tool_calls, ...rest } = m;
      return rest as OpenAIChatMessage;
    }),
    { role: "user" as const, content: userContent },
    {
      role: "user" as const,
      content: `Tool Results:\n${toolResults.map((m) => `[${m.name}]: ${m.content}`).join("\n\n")}`,
    },
  ];

  return { standard, fallback };
}
