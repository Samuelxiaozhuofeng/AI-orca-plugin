/**
 * Plugin API Service
 * 
 * 提供封装接口，让外部插件可以发送 AI 指令并接收运行结果。
 * 
 * 使用方式：
 * ```typescript
 * import { AiChatPluginAPI } from 'ai-chat-plugin/services/plugin-api';
 * 
 * // 简单调用
 * const result = await AiChatPluginAPI.sendMessage('帮我搜索 #TODO 标签的笔记');
 * console.log(result.content);
 * 
 * // 流式调用
 * for await (const chunk of AiChatPluginAPI.streamMessage('分析这段代码')) {
 *   if (chunk.type === 'content') {
 *     console.log(chunk.content);
 *   }
 * }
 * ```
 */

import { getAiChatSettings, getModelApiConfig, getModelRuntimeConfig, validateCurrentConfig } from "../settings/ai-chat-settings";
import { buildDynamicSystemPrompt } from "./ai/dynamic-prompt";
import { getAiChatPluginName } from "../ui/ai-chat-ui";
import { buildConversationMessages } from "./ai/message-builder";
import { streamChatWithRetry, type ToolCallInfo } from "./ai/chat-stream-handler";
import { TOOLS, executeTool, getTools } from "./ai/ai-tools";
import {
  createToolCallSignature,
  resolveToolCallName,
} from "./ai/tool-call-router";
import { createToolRoundLimit } from "./ai/tool-round-limit";
import type { Message } from "./session-service";
import { nowId } from "../utils/text-utils";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface PluginApiOptions {
  /** 使用的模型 ID，不传则使用默认模型 */
  model?: string;
  /** 系统提示词，不传则使用默认 */
  systemPrompt?: string;
  /** 是否启用工具调用（默认 true） */
  enableTools?: boolean;
  /** 自定义工具列表，不传则使用默认工具 */
  tools?: typeof TOOLS;
  /** 温度参数 */
  temperature?: number;
  /** 最大 token 数 */
  maxTokens?: number;
  /** 对话历史（用于多轮对话） */
  history?: Message[];
  /** 上下文文本（会注入到系统提示词） */
  contextText?: string;
  /** 超时时间（毫秒），默认 60000 */
  timeoutMs?: number;
  /** 最大工具调用轮数，0 表示不设置固定上限 */
  maxToolRounds?: number;
  /** 启用 Todoist AI 工具模式 */
  todoistEnabled?: boolean;
  /** AbortSignal 用于取消请求 */
  signal?: AbortSignal;
}

export interface PluginApiResult {
  /** 是否成功 */
  success: boolean;
  /** AI 回复内容 */
  content: string;
  /** 推理过程（如果模型支持） */
  reasoning?: string;
  /** 工具调用信息 */
  toolCalls?: ToolCallInfo[];
  /** 工具执行结果 */
  toolResults?: Array<{ name: string; result: string }>;
  /** 错误信息 */
  error?: string;
  /** 完整的对话历史（包含工具调用） */
  conversation?: Message[];
}

export type PluginApiStreamChunk =
  | { type: "content"; content: string }
  | { type: "reasoning"; reasoning: string }
  | { type: "tool_call"; name: string; args: any }
  | { type: "tool_result"; name: string; result: string }
  | { type: "done"; result: PluginApiResult };

// ─────────────────────────────────────────────────────────────────────────────
// Plugin API Implementation
// ─────────────────────────────────────────────────────────────────────────────

/**
 * AI Chat 插件 API
 * 
 * 提供简洁的接口让外部插件调用 AI 能力
 */
export const AiChatPluginAPI = {
  /**
   * 发送消息并等待完整响应
   * 
   * @param content - 用户消息内容
   * @param options - 可选配置
   * @returns 完整的 AI 响应结果
   * 
   * @example
   * ```typescript
   * const result = await AiChatPluginAPI.sendMessage('搜索 #TODO 标签');
   * if (result.success) {
   *   console.log(result.content);
   * }
   * ```
   */
  async sendMessage(content: string, options: PluginApiOptions = {}): Promise<PluginApiResult> {
    let finalResult: PluginApiResult | null = null;

    try {
      for await (const chunk of this.streamMessage(content, options)) {
        if (chunk.type === "done") {
          finalResult = chunk.result;
        }
      }
    } catch (err: any) {
      return {
        success: false,
        content: "",
        error: err?.message || String(err),
      };
    }

    return finalResult || {
      success: false,
      content: "",
      error: "No response received",
    };
  },

  /**
   * 流式发送消息，实时获取响应
   * 
   * @param content - 用户消息内容
   * @param options - 可选配置
   * @yields 流式响应块
   * 
   * @example
   * ```typescript
   * for await (const chunk of AiChatPluginAPI.streamMessage('分析代码')) {
   *   if (chunk.type === 'content') {
   *     process.stdout.write(chunk.content);
   *   } else if (chunk.type === 'tool_call') {
   *     console.log(`调用工具: ${chunk.name}`);
   *   }
   * }
   * ```
   */
  async *streamMessage(
    content: string,
    options: PluginApiOptions = {}
  ): AsyncGenerator<PluginApiStreamChunk, void, unknown> {
    const pluginName = getAiChatPluginName();
    const settings = getAiChatSettings(pluginName);

    // 验证配置
    const validationError = validateCurrentConfig(settings);
    if (validationError) {
      yield {
        type: "done",
        result: {
          success: false,
          content: "",
          error: validationError,
        },
      };
      return;
    }

    const {
      model = settings.selectedModelId,
      systemPrompt = buildDynamicSystemPrompt(),
      enableTools = true,
      history = [],
      contextText = "",
      timeoutMs = 60000,
      todoistEnabled = false,
      signal,
    } = options;
    const runtimeConfig = getModelRuntimeConfig(settings, model);
    const temperature = options.temperature ?? runtimeConfig.temperature;
    const maxTokens = options.maxTokens ?? runtimeConfig.maxTokens;
    const maxToolRounds = options.maxToolRounds ?? runtimeConfig.maxToolRounds;

    // 动态获取工具列表（包含外部 MCP 工具）
    const tools = options.tools ?? getTools(false, todoistEnabled);
    const toolRoundLimit = createToolRoundLimit(maxToolRounds);

    // 获取 API 配置
    const apiConfig = getModelApiConfig(settings, model);

    // 构建用户消息
    const userMsg: Message = {
      id: nowId(),
      role: "user",
      content,
      createdAt: Date.now(),
    };

    // 构建对话历史
    const conversation: Message[] = [...history.filter(m => !m.localOnly), userMsg];

    // 构建 API 消息
    const { standard: apiMessages, fallback: apiMessagesFallback } = await buildConversationMessages({
      messages: conversation,
      systemPrompt,
      contextText,
      chatMode: enableTools ? "agent" : "ask",
      modelId: model,
    });

    // 创建 abort controller
    const aborter = new AbortController();
    
    // 链接外部 signal
    if (signal) {
      signal.addEventListener("abort", () => aborter.abort());
    }

    let currentContent = "";
    let currentReasoning = "";
    let toolCalls: ToolCallInfo[] = [];
    const toolResults: Array<{ name: string; result: string }> = [];

    try {
      // 第一轮流式响应
      for await (const chunk of streamChatWithRetry(
        {
          apiUrl: apiConfig.apiUrl,
          apiKey: apiConfig.apiKey,
          model,
          protocol: apiConfig.protocol,
          anthropicApiPath: apiConfig.anthropicApiPath,
          temperature,
          maxTokens,
          signal: aborter.signal,
          tools: enableTools ? tools : undefined,
          timeoutMs,
        },
        apiMessages,
        apiMessagesFallback
      )) {
        if (chunk.type === "content") {
          currentContent += chunk.content;
          yield { type: "content", content: chunk.content };
        } else if (chunk.type === "reasoning") {
          currentReasoning += chunk.reasoning;
          yield { type: "reasoning", reasoning: chunk.reasoning };
        } else if (chunk.type === "tool_calls" && enableTools) {
          toolCalls = chunk.toolCalls;
        }
      }

      // 处理工具调用（多轮）
      let toolRound = 0;
      let currentToolCalls = toolCalls;
      const executedToolSignatures = new Set<string>();

      while (currentToolCalls.length > 0 && toolRoundLimit.canRun(toolRound)) {
        toolRound++;

        // 添加 assistant 消息到对话；后续会用路由后的工具名更新，保证 tool 消息有配对 tool_call。
        const assistantMessage: Message = {
          id: nowId(),
          role: "assistant",
          content: currentContent,
          createdAt: Date.now(),
          tool_calls: currentToolCalls,
        };
        conversation.push(assistantMessage);

        let hasToolError = false;
        const routedToolCalls: ToolCallInfo[] = [];

        // 执行工具
        for (const rawToolCall of currentToolCalls) {
          const resolution = resolveToolCallName(rawToolCall, tools);
          let toolCall = rawToolCall;
          let toolName = rawToolCall.function.name;
          let args: any = {};

          if (resolution.status === "invalid") {
            hasToolError = true;
            routedToolCalls.push(rawToolCall);
            const result = resolution.message;
            toolResults.push({ name: toolName, result });
            yield { type: "tool_result", name: toolName, result };
            conversation.push({
              id: nowId(),
              role: "tool",
              content: result,
              tool_call_id: rawToolCall.id,
              name: toolName,
              createdAt: Date.now(),
            });
            continue;
          }

          toolCall = resolution.toolCall;
          toolName = toolCall.function.name;
          routedToolCalls.push(toolCall);

          const signature = createToolCallSignature(toolCall);
          if (executedToolSignatures.has(signature)) {
            hasToolError = true;
            const result = `Error: Repeated tool call skipped: ${toolName}. Use prior tool results and answer directly.`;
            toolResults.push({ name: toolName, result });
            yield { type: "tool_result", name: toolName, result };
            conversation.push({
              id: nowId(),
              role: "tool",
              content: result,
              tool_call_id: toolCall.id,
              name: toolName,
              createdAt: Date.now(),
            });
            continue;
          }
          executedToolSignatures.add(signature);

          try {
            args = JSON.parse(toolCall.function.arguments);
          } catch (err: any) {
            hasToolError = true;
            const result = `Error: Invalid JSON in tool arguments: ${err?.message || String(err)}`;
            toolResults.push({ name: toolName, result });
            yield { type: "tool_result", name: toolName, result };
            conversation.push({
              id: nowId(),
              role: "tool",
              content: result,
              tool_call_id: toolCall.id,
              name: toolName,
              createdAt: Date.now(),
            });
            continue;
          }

          yield { type: "tool_call", name: toolName, args };

          let result: string;
          try {
            result = await executeTool(toolName, args);
          } catch (err: any) {
            result = `Error: ${err?.message || String(err)}`;
          }
          if (/^Error[:：]/i.test(result) || /^Unknown tool[:：]/i.test(result)) {
            hasToolError = true;
          }

          toolResults.push({ name: toolName, result });
          yield { type: "tool_result", name: toolName, result };

          // 添加工具结果到对话
          conversation.push({
            id: nowId(),
            role: "tool",
            content: result,
            tool_call_id: toolCall.id,
            name: toolName,
            createdAt: Date.now(),
          });
        }

        if (routedToolCalls.length > 0) {
          assistantMessage.tool_calls = routedToolCalls;
        }

        // 构建下一轮消息
        const nextSystemPrompt = hasToolError
          ? `${systemPrompt}\n\n## Tool Recovery\nThe previous tool call failed, repeated, or used an unavailable name. Do not call any more tools. Answer directly from the available conversation and tool results.`
          : systemPrompt;
        const { standard: nextMessages, fallback: nextFallback } = await buildConversationMessages({
          messages: conversation,
          systemPrompt: nextSystemPrompt,
          contextText,
          chatMode: enableTools ? "agent" : "ask",
          modelId: model,
        });

        // 下一轮流式响应
        currentContent = "";
        currentToolCalls = [];
        const enableNextTools = enableTools && !hasToolError && toolRoundLimit.canRun(toolRound);

        for await (const chunk of streamChatWithRetry(
          {
            apiUrl: apiConfig.apiUrl,
            apiKey: apiConfig.apiKey,
            model,
            protocol: apiConfig.protocol,
            anthropicApiPath: apiConfig.anthropicApiPath,
            temperature,
            maxTokens,
            signal: aborter.signal,
            tools: enableNextTools ? tools : undefined,
            timeoutMs,
          },
          nextMessages,
          nextFallback
        )) {
          if (chunk.type === "content") {
            currentContent += chunk.content;
            yield { type: "content", content: chunk.content };
          } else if (chunk.type === "reasoning") {
            currentReasoning += chunk.reasoning;
            yield { type: "reasoning", reasoning: chunk.reasoning };
          } else if (chunk.type === "tool_calls" && enableNextTools) {
            currentToolCalls = chunk.toolCalls;
          }
        }
      }

      // 完成
      yield {
        type: "done",
        result: {
          success: true,
          content: currentContent,
          reasoning: currentReasoning != null ? currentReasoning : undefined,
          toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
          toolResults: toolResults.length > 0 ? toolResults : undefined,
          conversation,
        },
      };
    } catch (err: any) {
      const isAbort = err?.name === "AbortError";
      yield {
        type: "done",
        result: {
          success: false,
          content: currentContent,
          error: isAbort ? "Request aborted" : (err?.message || String(err)),
        },
      };
    }
  },

  /**
   * 直接执行工具（不经过 AI）
   * 
   * @param toolName - 工具名称
   * @param args - 工具参数
   * @returns 工具执行结果
   * 
   * @example
   * ```typescript
   * const result = await AiChatPluginAPI.executeTool('searchBlocksByTag', {
   *   tag_query: '#TODO',
   *   maxResults: 10
   * });
   * ```
   */
  async executeTool(toolName: string, args: any): Promise<string> {
    return executeTool(toolName, args);
  },

  /**
   * 获取可用的工具列表
   * 
   * @returns 工具定义列表
   */
  getAvailableTools() {
    return getTools().map(tool => ({
      name: tool.function.name,
      description: tool.function.description,
      parameters: tool.function.parameters,
    }));
  },

  /**
   * 获取当前配置信息
   */
  getConfig() {
    const pluginName = getAiChatPluginName();
    const settings = getAiChatSettings(pluginName);
    const runtimeConfig = getModelRuntimeConfig(settings, settings.selectedModelId);
    return {
      model: settings.selectedModelId,
      temperature: runtimeConfig.temperature,
      maxTokens: runtimeConfig.maxTokens,
      maxToolRounds: runtimeConfig.maxToolRounds,
    };
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Global Registration (for external plugins)
// ─────────────────────────────────────────────────────────────────────────────

// 将 API 挂载到全局，方便其他插件访问
declare global {
  interface Window {
    AiChatPluginAPI?: typeof AiChatPluginAPI;
  }
}

// 注册到全局
if (typeof window !== "undefined") {
  window.AiChatPluginAPI = AiChatPluginAPI;
}

export default AiChatPluginAPI;
