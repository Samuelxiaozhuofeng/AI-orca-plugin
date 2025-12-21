/**
 * Message Builder Service
 *
 * Builds OpenAI-compatible message arrays with standard and fallback formats.
 */

import type { OpenAIChatMessage } from "./openai-client";
import type { Message } from "./session-service";

export interface MessageBuildParams {
  messages: Message[];
  userContent: string;
  systemPrompt?: string;
  contextText?: string;
}

export interface ToolResultParams extends MessageBuildParams {
  assistantContent: string;
  toolCalls: any[];
  toolResults: Message[];
}

/**
 * Convert internal Message to OpenAI API format
 */
function messageToApi(m: Message): OpenAIChatMessage {
  const msg: OpenAIChatMessage = {
    role: m.role as any,
    content: m.content,
  };
  if (m.tool_calls) msg.tool_calls = m.tool_calls;
  if (m.tool_call_id) {
    msg.tool_call_id = m.tool_call_id;
    msg.name = m.name;
  }
  return msg;
}

/**
 * Build system message content from prompt and context
 */
function buildSystemContent(systemPrompt?: string, contextText?: string): string | null {
  const parts: string[] = [];
  if (systemPrompt?.trim()) parts.push(systemPrompt.trim());
  if (contextText?.trim()) parts.push(`Context:\n${contextText.trim()}`);
  return parts.length > 0 ? parts.join("\n\n") : null;
}

/**
 * Build chat messages for initial API call (before tool execution)
 */
export function buildChatMessages(params: MessageBuildParams): OpenAIChatMessage[] {
  const { messages, userContent, systemPrompt, contextText } = params;

  const systemContent = buildSystemContent(systemPrompt, contextText);
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
    assistantContent,
    toolCalls,
    toolResults,
  } = params;

  const systemContent = buildSystemContent(systemPrompt, contextText);
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
