/**
 * Message Builder Service
 *
 * Builds OpenAI-compatible message arrays with standard and fallback formats.
 * Supports multimodal messages with images, videos, and other files.
 */

import type { OpenAIChatMessage, OpenAITool } from "./openai-client";
import type { Message, ImageRef } from "../session-service";
import type { ChatMode } from "../../store/chat-mode-store";
import { buildImageContent, imageToBase64 } from "../external/image-service";
import { buildFileContentsForApi } from "../file-service";
import { extractOrcaImagesFromText, hasOrcaImageLinks } from "../../utils/orca-image-extractor";
import {
  shouldUseVisionProxy,
  describeImages,
  getVisionModelConfig,
} from "./vision-model-service";
import { snipOldToolResults } from "./context-manager";

export interface MessageBuildParams {
  messages: Message[];
  userContent: string;
  systemPrompt?: string;
  contextText?: string;
  customMemory?: string;
  chatMode?: ChatMode;
  // Token 优化参数
  maxHistoryMessages?: number; // 0=不限制
  // 模型 ID（用于判断是否需要视觉模型代理）
  modelId?: string;
}

export interface ConversationBuildParams {
  messages: Message[];
  systemPrompt?: string;
  contextText?: string;
  customMemory?: string;
  chatMode?: ChatMode;
  // Token 优化参数
  maxHistoryMessages?: number; // 0=不限制
  // 模型 ID（用于判断是否需要视觉模型代理）
  modelId?: string;
}

export interface ToolResultParams extends MessageBuildParams {
  assistantContent: string;
  toolCalls: any[];
  toolResults: Message[];
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
  // DeepSeek 的 reasoning_content 可能为空字符串 ""，必须原样回传
  if (m.role === "assistant" && m.reasoning != null) {
    (msg as any).reasoning_content = m.reasoning;
  }
  return msg;
}

/**
 * 将图片转换为文字描述（用于不支持视觉的模型）
 */
async function convertImagesToDescriptions(
  images: Array<ImageRef | { base64: string; mimeType: string; name?: string }>
): Promise<string> {
  if (images.length === 0) return "";

  const visionConfig = getVisionModelConfig();
  if (!visionConfig.enabled) {
    return images.map((img, i) => `[用户发送的图片 ${i + 1}: ${(img as any).name || "未命名"}，视觉模型未启用]`).join("\n");
  }

  try {
    const result = await describeImages(images);
    if (result.success && result.descriptions.length > 0) {
      const header = images.length === 1
        ? "[用户发送了一张图片，以下是图片内容的详细描述]"
        : `[用户发送了 ${images.length} 张图片，以下是图片内容的详细描述]`;
      const descriptions = result.descriptions
        .map((desc, i) => {
          const imgName = (images[i] as any)?.name || `图片 ${i + 1}`;
          return images.length === 1
            ? desc.description
            : `【${imgName}】\n${desc.description}`;
        })
        .join("\n\n");
      return `${header}\n\n${descriptions}`;
    }
    // 部分成功或失败
    const header = "[用户发送的图片描述]";
    const descriptions = result.descriptions
      .map((desc, i) => {
        const imgName = (images[i] as any)?.name || `图片 ${i + 1}`;
        return `【${imgName}】\n${desc.description}`;
      })
      .join("\n\n");
    return `${header}\n\n${descriptions}` + (result.error ? `\n\n[部分图片处理失败: ${result.error}]` : "");
  } catch (error: any) {
    console.error("[message-builder] Failed to convert images to descriptions:", error);
    return images.map((img, i) => `[用户发送的图片 ${i + 1}: ${(img as any).name || "未命名"} - 视觉处理失败]`).join("\n");
  }
}

/**
 * Convert internal Message to OpenAI API format with image support (async)
 * 
 * 支持的图片来源：
 * 1. m.images - 直接附加的图片（legacy）
 * 2. m.files - 文件附件（包括图片、视频等）
 * 3. Orca 图片链接 - [!image(...)](orca-block:xxx) 格式
 * 
 * @param m - 消息对象
 * @param useVisionProxy - 是否使用视觉模型代理（当前模型不支持视觉时为 true）
 */
async function messageToApiWithImages(m: Message, useVisionProxy: boolean = false): Promise<OpenAIChatMessage> {
  // Handle messages with images (multimodal) - legacy support
  if (m.images && m.images.length > 0 && m.role === "user") {
    // 如果需要使用视觉模型代理，将图片转换为文字描述
    if (useVisionProxy) {
      const imagesWithBase64: Array<{ base64: string; mimeType: string; name?: string }> = [];
      for (const img of m.images) {
        try {
          const base64 = await imageToBase64(img);
          if (base64) {
            imagesWithBase64.push({
              base64,
              mimeType: img.mimeType || "image/png",
              name: img.name,
            });
          }
        } catch (error) {
          console.warn("[message-builder] Failed to read image:", img.name);
        }
      }
      const imageDescriptions = await convertImagesToDescriptions(imagesWithBase64);
      const textContent = m.content
        ? `${m.content}\n\n${imageDescriptions}`
        : imageDescriptions;
      return {
        role: "user",
        content: textContent,
      };
    }

    // 模型支持视觉，直接发送图片
    const contentParts: any[] = [];
    
    // Add text content if present
    if (m.content) {
      contentParts.push({ type: "text", text: m.content });
    }
    
    // Add image content (with error handling for each image)
    for (const img of m.images) {
      try {
        const imageContent = await buildImageContent(img);
        if (imageContent) {
          contentParts.push(imageContent);
        } else {
          // 图片转换失败，添加文本提示
          contentParts.push({ type: "text", text: `[图片加载失败: ${img.name}]` });
        }
      } catch (error) {
        contentParts.push({ type: "text", text: `[图片处理错误: ${img.name}]` });
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
    // 分离图片文件和其他文件
    const imageFiles = m.files.filter(f => f.mimeType?.startsWith("image/"));
    const otherFiles = m.files.filter(f => !f.mimeType?.startsWith("image/"));

    // 如果需要使用视觉模型代理且有图片文件
    if (useVisionProxy && imageFiles.length > 0) {
      const imagesWithBase64: Array<{ base64: string; mimeType: string; name?: string }> = [];
      for (const file of imageFiles) {
        try {
          const base64 = await imageToBase64({ path: file.path, name: file.name, mimeType: file.mimeType });
          if (base64) {
            imagesWithBase64.push({
              base64,
              mimeType: file.mimeType || "image/png",
              name: file.name,
            });
          }
        } catch (error) {
          console.warn("[message-builder] Failed to read image file:", file.name);
        }
      }
      const imageDescriptions = await convertImagesToDescriptions(imagesWithBase64);
      
      // 处理其他文件
      const otherContentParts: any[] = [];
      for (const file of otherFiles) {
        try {
          const fileContents = await buildFileContentsForApi(file);
          if (fileContents && fileContents.length > 0) {
            // 过滤掉 image_url 类型，只保留文本
            for (const content of fileContents) {
              if (content.type === "text") {
                otherContentParts.push(content);
              }
            }
          }
        } catch (error) {
          console.warn("[message-builder] Failed to process file:", file.name);
        }
      }

      let textContent = m.content || "";
      if (imageDescriptions) {
        textContent = textContent ? `${textContent}\n\n${imageDescriptions}` : imageDescriptions;
      }
      for (const part of otherContentParts) {
        if (part.text) {
          textContent = textContent ? `${textContent}\n\n${part.text}` : part.text;
        }
      }

      return {
        role: "user",
        content: textContent,
      };
    }

    // 模型支持视觉或没有图片文件，正常处理
    const contentParts: any[] = [];

    // Add text content if present
    if (m.content) {
      contentParts.push({ type: "text", text: m.content });
    }

    // Add file content (may return multiple items for video, with error handling)
    for (const file of m.files) {
      try {
        const fileContents = await buildFileContentsForApi(file);
        if (fileContents && fileContents.length > 0) {
          contentParts.push(...fileContents);
        } else {
          // 文件处理失败，添加文本提示
          contentParts.push({ type: "text", text: `[文件加载失败: ${file.name}]` });
        }
      } catch (error) {
        contentParts.push({ type: "text", text: `[文件处理错误: ${file.name}]` });
      }
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
        // 如果需要使用视觉模型代理，将图片转换为文字描述
        if (useVisionProxy) {
          const imagesWithBase64 = images
            .filter(img => img.base64)
            .map(img => ({
              base64: img.base64!,
              mimeType: img.mimeType,
              name: img.blockId ? `block-${img.blockId}` : undefined,
            }));
          const imageDescriptions = await convertImagesToDescriptions(imagesWithBase64);
          const textContent = cleanedText.trim()
            ? `${cleanedText.trim()}\n\n${imageDescriptions}`
            : imageDescriptions;
          return {
            role: "user",
            content: textContent,
          };
        }

        // 模型支持视觉，直接发送图片
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
          return {
            role: "user",
            content: contentParts as any,
          };
        }
      }
    } catch (error) {
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
  if (contextText?.trim()) parts.push(`用户上下文:\n${contextText.trim()}`);
  
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
  const { messages, systemPrompt, contextText, customMemory, chatMode, maxHistoryMessages, modelId } = params;

  // 检查是否需要使用视觉模型代理
  // 检查消息中是否包含图片
  const hasImages = messages.some(m => 
    (m.images && m.images.length > 0) ||
    (m.files && m.files.some(f => f.mimeType?.startsWith("image/"))) ||
    (m.content && hasOrcaImageLinks(m.content))
  );
  const useVisionProxy = modelId ? shouldUseVisionProxy(modelId, hasImages) : false;
  
  if (useVisionProxy && hasImages) {
    console.log("[message-builder] 使用视觉模型代理处理图片");
  }

  const systemContent = buildSystemContent(systemPrompt, contextText, customMemory, chatMode);
  let filteredMessages = messages.filter((m) => !m.localOnly);
  
  // 硬限制历史消息数量（如果设置了）
  if (maxHistoryMessages && maxHistoryMessages > 0) {
    const originalCount = filteredMessages.length;
    filteredMessages = limitHistoryMessages(filteredMessages, maxHistoryMessages);
    if (filteredMessages.length < originalCount) {
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
        return false;
      }
    }
    return true;
  });
  
  // Build standard format with async image conversion
  const history = await Promise.all(validMessages.map(m => messageToApiWithImages(m, useVisionProxy)));
  
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

  // 安全检查：如果过滤后没有消息了，至少保留最后一条用户消息
  if (filteredHistory.length === 0 && messages.length > 0) {
    console.warn("[message-builder] All messages filtered out, keeping last user message");
    const lastUserMessage = messages.filter(m => m.role === "user").pop();
    if (lastUserMessage) {
      const apiMessage = await messageToApiWithImages(lastUserMessage, useVisionProxy);
      filteredHistory.push(apiMessage);
    }
  }

  // 裁剪旧工具结果，节省 token（保留最近 3 轮完整内容）
  const snippedHistory = snipOldToolResults(filteredHistory, {
    preserveRecentTurns: 3,
    minLengthToSnip: 300,
  });

  const standard: OpenAIChatMessage[] = [
    ...(systemContent ? [{ role: "system" as const, content: systemContent }] : []),
    ...snippedHistory,
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

