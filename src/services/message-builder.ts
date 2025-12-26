/**
 * Message Builder Service
 *
 * Builds OpenAI-compatible message arrays with standard and fallback formats.
 */

import type { OpenAIChatMessage } from "./openai-client";
import type { Message } from "./session-service";
import { type ChatMode, getMode } from "../store/chat-mode-store";

export interface MessageBuildParams {
  messages: Message[];
  userContent: string;
  systemPrompt?: string;
  contextText?: string;
  customMemory?: string;
  chatMode?: ChatMode;
}

export interface ConversationBuildParams {
  messages: Message[];
  systemPrompt?: string;
  contextText?: string;
  customMemory?: string;
  chatMode?: ChatMode;
}

export interface ToolResultParams extends MessageBuildParams {
  assistantContent: string;
  toolCalls: any[];
  toolResults: Message[];
}

/**
 * Ask mode instruction to append to system prompt
 * Instructs AI to only answer questions without executing any operations
 */
export const ASK_MODE_INSTRUCTION = `

---
## 重要提示：当前为 Ask 模式
你现在处于"Ask 模式"。在此模式下：
- 你只能回答问题和提供信息
- 你不能执行任何操作或调用任何工具
- 如果用户请求执行操作，请解释你当前无法执行操作，但可以提供相关信息或建议
- 专注于提供有帮助的、信息性的回答`;

/**
 * Check if tools should be included in the API request based on chat mode
 * @param chatMode - Current chat mode (optional, defaults to store value)
 * @returns true if tools should be included, false if in Ask mode
 */
export function shouldIncludeTools(chatMode?: ChatMode): boolean {
  const mode = chatMode ?? getMode();
  return mode !== 'ask';
}

/**
 * Convert internal Message to OpenAI API format
 */
function messageToApi(m: Message): OpenAIChatMessage {
  const msg: OpenAIChatMessage = {
    role: m.role as any,
    content: m.role === "assistant" && !m.content ? null : m.content,
  };
  if (m.tool_calls) msg.tool_calls = m.tool_calls;
  if (m.tool_call_id) {
    msg.tool_call_id = m.tool_call_id;
    msg.name = m.name;
  }
  return msg;
}

/**
 * Build system message content from prompt, context, and memory
 * @param systemPrompt - Base system prompt
 * @param contextText - Context text from selected contexts
 * @param customMemory - Custom memory text
 * @param chatMode - Current chat mode (optional, defaults to store value)
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
  const mode = chatMode ?? getMode();
  if (mode === 'ask') {
    parts.push(ASK_MODE_INSTRUCTION.trim());
  }
  
  return parts.length > 0 ? parts.join("\n\n") : null;
}

/**
 * Build chat messages from full conversation history.
 *
 * Standard format: Preserves OpenAI tool-calling roles/fields.
 * Fallback format: Strips tool_calls and converts tool messages into user messages.
 */
export function buildConversationMessages(params: ConversationBuildParams): {
  standard: OpenAIChatMessage[];
  fallback: OpenAIChatMessage[];
} {
  const { messages, systemPrompt, contextText, customMemory, chatMode } = params;

  const systemContent = buildSystemContent(systemPrompt, contextText, customMemory, chatMode);
  const history = messages.filter((m) => !m.localOnly).map(messageToApi);

  const standard: OpenAIChatMessage[] = [
    ...(systemContent ? [{ role: "system" as const, content: systemContent }] : []),
    ...history,
  ];

  const fallback: OpenAIChatMessage[] = [
    ...(systemContent ? [{ role: "system" as const, content: systemContent }] : []),
    ...history.flatMap((m) => {
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
 */
export function buildChatMessages(params: MessageBuildParams): OpenAIChatMessage[] {
  const { messages, userContent, systemPrompt, contextText, customMemory, chatMode } = params;

  const systemContent = buildSystemContent(systemPrompt, contextText, customMemory, chatMode);
  const history = messages.filter((m) => !m.localOnly).map(messageToApi);

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
 */
export function buildMessagesWithToolResults(params: ToolResultParams): {
  standard: OpenAIChatMessage[];
  fallback: OpenAIChatMessage[];
} {
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
  const history = messages.filter((m) => !m.localOnly).map(messageToApi);

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
  const fallback: OpenAIChatMessage[] = [
    ...(systemContent ? [{ role: "system" as const, content: systemContent }] : []),
    ...history.map((m) => {
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
