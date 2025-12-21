import type { PanelProps } from "../orca.d.ts";

import { openAIChatCompletionsStream, type OpenAIChatMessage, type OpenAITool } from "../services/openai-client";
import { buildContextForSend } from "../services/context-builder";
import { contextStore, type ContextRef } from "../store/context-store";
import { closeAiChatPanel, getAiChatPluginName } from "../ui/ai-chat-ui";
import { uiStore } from "../store/ui-store";
import { findViewPanelById } from "../utils/panel-tree";
import ChatInput from "./ChatInput";
import MarkdownMessage from "../components/MarkdownMessage";
import ChatHistoryMenu from "./ChatHistoryMenu";
import {
  buildAiModelOptions,
  getAiChatSettings,
  resolveAiModel,
  updateAiChatSettings,
  validateAiChatSettingsWithModel,
} from "../settings/ai-chat-settings";
import { searchBlocksByTag, searchBlocksByText, queryBlocksByTag } from "../services/search-service";
import {
  loadSessions,
  saveSession,
  deleteSession,
  clearAllSessions,
  createNewSession,
  shouldAutoSave,
  type SavedSession,
  type Message,
} from "../services/session-service";
import { sessionStore, updateSessionStore, markSessionSaved, clearSessionStore } from "../store/session-store";

const React = window.React as unknown as {
  createElement: typeof window.React.createElement;
  useEffect: (fn: () => void | (() => void), deps: any[]) => void;
  useMemo: <T>(fn: () => T, deps: any[]) => T;
  useRef: <T>(value: T) => { current: T };
  useState: <T>(
    initial: T | (() => T),
  ) => [T, (next: T | ((prev: T) => T)) => void];
  useCallback: <T extends (...args: any[]) => any>(fn: T, deps: any[]) => T;
};
const { createElement, useEffect, useMemo, useRef, useState, useCallback } = React;

const { useSnapshot } = (window as any).Valtio as {
  useSnapshot: <T extends object>(obj: T) => T;
};
const { Button } = orca.components;

function nowId(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function safeText(block: any): string {
  if (!block) return "";
  if (typeof block.text === "string" && block.text.trim()) return block.text.trim();
  if (Array.isArray(block.content)) {
    return block.content
      .map((f: any) =>
        (f?.t === "text" || f?.t === "t") && typeof f.v === "string" ? f.v : "",
      )
      .join("")
      .trim();
  }
  return "";
}

// Inject keyframes styles
const globalStyles = `
@keyframes blink {
    0%, 50% { opacity: 1; }
    51%, 100% { opacity: 0; }
}
@keyframes loadingDots {
    0%, 80%, 100% { transform: scale(0); opacity: 0.3; }
    40% { transform: scale(1); opacity: 1; }
}
@keyframes messageSlideIn {
    from {
        opacity: 0;
        transform: translateY(10px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}
`;

const LoadingDots = () => {
    const dotStyle = {
        display: 'inline-block',
        width: '6px',
        height: '6px',
        borderRadius: '50%',
        background: 'var(--orca-color-text-3)',
        margin: '0 3px',
        animation: 'loadingDots 1.4s infinite ease-in-out',
    };

    return createElement(
        'div',
        { style: { padding: '12px 16px', display: 'flex', alignItems: 'center', height: '24px' } },
        createElement('span', { style: { ...dotStyle, animationDelay: '0s' } }),
        createElement('span', { style: { ...dotStyle, animationDelay: '0.2s' } }),
        createElement('span', { style: { ...dotStyle, animationDelay: '0.4s' } })
    );
};

export default function AiChatPanel({ panelId }: PanelProps) {
  const orcaSnap = useSnapshot(orca.state);
  const uiSnap = useSnapshot(uiStore);
  const [sending, setSending] = useState(false);
  // Track which message is currently streaming to add typewriter cursor
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);

  // Session management state
  const [currentSession, setCurrentSession] = useState<SavedSession>(() => {
    const pluginName = getAiChatPluginName();
    const settings = getAiChatSettings(pluginName);
    const model = resolveAiModel(settings);
    return { ...createNewSession(), model };
  });
  const [sessions, setSessions] = useState<SavedSession[]>([]);
  const [sessionsLoaded, setSessionsLoaded] = useState(false);

  const [messages, setMessages] = useState<Message[]>(() => [
    {
      id: nowId(),
      role: "assistant",
      content: "Hello! Please configure API Key / URL / Model in Settings first, then start chatting.",
      createdAt: Date.now(),
      localOnly: true,
    },
  ]);

  const listRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Load sessions on mount
  useEffect(() => {
    const pluginName = getAiChatPluginName();
    const settings = getAiChatSettings(pluginName);
    const defaultModel = resolveAiModel(settings);

    loadSessions().then((data) => {
      setSessions(data.sessions);
      // If there's an active session, load it
      if (data.activeSessionId) {
        const active = data.sessions.find((s) => s.id === data.activeSessionId);
        if (active && active.messages.length > 0) {
          setCurrentSession({
            ...active,
            model: (active.model || "").trim() || defaultModel,
          });
          setMessages(active.messages);
          // Restore context if available
          if (active.contexts && active.contexts.length > 0) {
            contextStore.selected = active.contexts;
          }
        }
      }
      setSessionsLoaded(true);
    });
  }, []);

  // Save session helper
  const handleSaveSession = useCallback(async () => {
    const filteredMessages = messages.filter((m) => !m.localOnly);
    if (filteredMessages.length === 0) {
      orca.notify("info", "No messages to save");
      return;
    }

    const sessionToSave: SavedSession = {
      ...currentSession,
      messages: filteredMessages,
      contexts: [...contextStore.selected],
      updatedAt: Date.now(),
    };

    await saveSession(sessionToSave);
    markSessionSaved();
    // Refresh sessions list
    const data = await loadSessions();
    setSessions(data.sessions);
    orca.notify("success", "Session saved");
  }, [messages, currentSession]);

  // Handle session selection from history
  const handleSelectSession = useCallback(async (sessionId: string) => {
    const pluginName = getAiChatPluginName();
    const settings = getAiChatSettings(pluginName);
    const defaultModel = resolveAiModel(settings);

    const session = sessions.find((s) => s.id === sessionId);
    if (!session) return;

    setCurrentSession({
      ...session,
      model: (session.model || "").trim() || defaultModel,
    });
    setMessages(session.messages.length > 0 ? session.messages : []);
    // Restore context
    contextStore.selected = session.contexts || [];
  }, [sessions]);

  // Handle session deletion
  const handleDeleteSession = useCallback(async (sessionId: string) => {
    await deleteSession(sessionId);
    const data = await loadSessions();
    setSessions(data.sessions);

    // If deleted current session, create a new one
    if (currentSession.id === sessionId) {
      handleNewSession();
    }
  }, [currentSession.id]);

  // Handle clear all sessions
  const handleClearAllSessions = useCallback(async () => {
    await clearAllSessions();
    setSessions([]);
    handleNewSession();
  }, []);

  // Handle new session
  const handleNewSession = useCallback(() => {
    const pluginName = getAiChatPluginName();
    const settings = getAiChatSettings(pluginName);
    const defaultModel = resolveAiModel(settings);

    const newSession = { ...createNewSession(), model: defaultModel };
    setCurrentSession(newSession);
    setMessages([
      {
        id: nowId(),
        role: "assistant",
        content: "New chat started. How can I help you?",
        createdAt: Date.now(),
        localOnly: true,
      },
    ]);
    contextStore.selected = [];
  }, []);

  // Sync state to session store for auto-save on close
  useEffect(() => {
    // Only sync if there are non-localOnly messages
    const hasRealMessages = messages.some((m) => !m.localOnly);
    if (hasRealMessages) {
      updateSessionStore(currentSession, messages, [...contextStore.selected]);
    }
  }, [messages, currentSession]);

  // Clear session store on unmount
  useEffect(() => {
    return () => {
      clearSessionStore();
    };
  }, []);

  // Inject styles on mount
  useEffect(() => {
    const styleEl = document.createElement('style');
    styleEl.textContent = globalStyles;
    document.head.appendChild(styleEl);
    return () => {
        document.head.removeChild(styleEl);
    };
  }, []);

  function smoothScrollToBottom(duration = 300) {
    const el = listRef.current;
    if (!el) return;

    // If close to bottom, snap to it
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 50) {
        el.scrollTop = el.scrollHeight;
        return;
    }

    const start = el.scrollTop;
    const target = el.scrollHeight - el.clientHeight;
    
    // If target is less than start (e.g. content removed), just set it
    if (target < start) {
        el.scrollTop = target;
        return;
    }
    
    const distance = target - start;
    let startTime: number | null = null;

    function animation(currentTime: number) {
        if (startTime === null) startTime = currentTime;
        const timeElapsed = currentTime - startTime;
        const progress = Math.min(timeElapsed / duration, 1);

        // Ease out cubic
        const ease = 1 - Math.pow(1 - progress, 3);

        el!.scrollTop = start + distance * ease;

        if (progress < 1) {
            requestAnimationFrame(animation);
        }
    }

    requestAnimationFrame(animation);
  }

  function scrollToBottom() {
      // Use smooth scroll wrapper
      smoothScrollToBottom();
  }

  async function buildContextForRequest(): Promise<string> {
    const contexts = contextStore.selected;
    if (!contexts.length) {
      return "";
    }
    return await buildContextForSend(contexts);
  }

  // Define available tools for the AI
  const TOOLS: OpenAITool[] = [
    {
      type: "function",
      function: {
        name: "searchBlocksByTag",
        description: "Search for notes/blocks that have a specific tag. Use this when the user asks to find notes with a particular tag or category.",
        parameters: {
          type: "object",
          properties: {
            tagName: {
              type: "string",
              description: "The tag name to search for (e.g., '爱情', 'work', 'ideas')",
            },
            maxResults: {
              type: "number",
              description: "Maximum number of results to return (default: 50, max: 50)",
            },
          },
          required: ["tagName"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "searchBlocksByText",
        description: "Search for notes/blocks containing specific text or keywords. Use this when the user wants to find notes by content.",
        parameters: {
          type: "object",
          properties: {
            searchText: {
              type: "string",
              description: "The text or keywords to search for",
            },
            maxResults: {
              type: "number",
              description: "Maximum number of results to return (default: 50, max: 50)",
            },
          },
          required: ["searchText"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "queryBlocksByTag",
        description: "Advanced query for blocks with a specific tag and property filters. Use this when the user wants to filter notes by tag properties (e.g., 'find tasks with priority >= 8', 'find notes without a category'). This supports property comparisons like >=, >, <, <=, ==, !=, 'is null', 'not null'.",
        parameters: {
          type: "object",
          properties: {
            tagName: {
              type: "string",
              description: "The tag name to query for (e.g., 'task', 'note', 'project')",
            },
            properties: {
              type: "array",
              description: "Array of property filters to apply",
              items: {
                type: "object",
                properties: {
                  name: {
                    type: "string",
                    description: "Property name (e.g., 'priority', 'category', 'author')",
                  },
                  op: {
                    type: "string",
                    description: "Comparison operator: '>=', '>', '<=', '<', '==', '!=', 'is null', 'not null', 'includes', 'not includes'",
                  },
                  value: {
                    description: "Value to compare against (can be string, number, or boolean). Not required for 'is null' and 'not null' operators.",
                  },
                },
                required: ["name", "op"],
              },
            },
            maxResults: {
              type: "number",
              description: "Maximum number of results to return (default: 50, max: 50)",
            },
          },
          required: ["tagName"],
        },
      },
    },
  ];

  // Execute tool calls
  async function executeTool(toolName: string, args: any): Promise<string> {
    try {
      if (toolName === "searchBlocksByTag") {
        // Support multiple parameter names: tagName, tag, query
        const tagName = args.tagName || args.tag || args.query;
        const maxResults = args.maxResults || 50;

        if (!tagName) {
          console.error("[Tool] Missing tag name parameter");
          return "Error: Missing tag name parameter";
        }

        const results = await searchBlocksByTag(tagName, Math.min(maxResults, 50));

        if (results.length === 0) {
          return `No notes found with tag "${tagName}".`;
        }

        // Optimized format: remove redundant fields (tags, date) and simplify output
        const summary = results.map((r, i) => {
          const body = r.fullContent ?? r.content;
          return `${i + 1}.\n${body}`;
        }).join("\n\n");

        return `Found ${results.length} note(s) with tag "${tagName}":\n${summary}`;
      } else if (toolName === "searchBlocksByText") {
        // Support multiple parameter names: searchText, text, query, queries
        let searchText = args.searchText || args.text || args.query || args.queries;

        // Handle array parameters (AI sometimes sends ["text"] instead of "text")
        if (Array.isArray(searchText)) {
          searchText = searchText[0];
        }

        const maxResults = args.maxResults || 50;

        if (!searchText || typeof searchText !== "string") {
          console.error("[Tool] Missing or invalid search text parameter");
          return "Error: Missing search text parameter";
        }

        const results = await searchBlocksByText(searchText, Math.min(maxResults, 50));

        if (results.length === 0) {
          return `No notes found containing "${searchText}".`;
        }

        // Optimized format: remove redundant fields (tags, date) and simplify output
        const summary = results.map((r, i) => {
          // Use fullContent (includes children) or fallback to content
          const body = r.fullContent ?? r.content;
          return `${i + 1}.\n${body}`;
        }).join("\n\n");

        return `Found ${results.length} note(s) containing "${searchText}":\n${summary}`;
      } else if (toolName === "queryBlocksByTag") {
        // Advanced query with property filters
        const tagName = args.tagName || args.tag || args.query;
        const properties = args.properties || [];
        const maxResults = args.maxResults || 50;

        if (!tagName) {
          console.error("[Tool] Missing tag name parameter");
          return "Error: Missing tag name parameter";
        }

        const results = await queryBlocksByTag(tagName, {
          properties,
          maxResults: Math.min(maxResults, 50),
        });

        if (results.length === 0) {
          const filterDesc = properties.length > 0
            ? ` with filters: ${properties.map((p: any) => `${p.name} ${p.op} ${p.value ?? ''}`).join(', ')}`
            : '';
          return `No notes found with tag "${tagName}"${filterDesc}.`;
        }

        // Optimized format: remove redundant fields and simplify output
        const summary = results.map((r, i) => {
          const body = r.fullContent ?? r.content;
          return `${i + 1}.\n${body}`;
        }).join("\n\n");

        const filterDesc = properties.length > 0
          ? ` (filtered by: ${properties.map((p: any) => `${p.name} ${p.op} ${p.value ?? ''}`).join(', ')})`
          : '';
        return `Found ${results.length} note(s) with tag "${tagName}"${filterDesc}:\n${summary}`;
      } else {
        console.error("[Tool] Unknown tool:", toolName);
        return `Unknown tool: ${toolName}`;
      }
    } catch (error: any) {
      console.error("[Tool] Error:", error);
      return `Error executing ${toolName}: ${error?.message ?? error ?? "unknown error"}`;
    }
  }

  async function handleSend(content: string) {
    if (!content) return;
    if (sending) return;

    const pluginName = getAiChatPluginName();
    const settings = getAiChatSettings(pluginName);
    const model = (currentSession.model || "").trim() || resolveAiModel(settings);
    const validationError = validateAiChatSettingsWithModel(settings, model);
    if (validationError) {
      orca.notify("warn", validationError);
      return;
    }

    setSending(true);

    const userMsg: Message = {
      id: nowId(),
      role: "user",
      content,
      createdAt: Date.now(),
    };

    setMessages((prev: Message[]) => [...prev, userMsg]);
    queueMicrotask(scrollToBottom);

    const aborter = new AbortController();
    abortRef.current = aborter;

    try {
      let contextText = "";
      try {
        contextText = await buildContextForRequest();
      } catch (err: any) {
        orca.notify("warn", `Context build failed: ${String(err?.message ?? err ?? "unknown error")}`);
      }

      const systemParts: string[] = [];
      if (settings.systemPrompt.trim()) systemParts.push(settings.systemPrompt.trim());
      if (contextText.trim()) systemParts.push(`Context:\n${contextText.trim()}`);

      // Build message history for the API
      const buildMessages = (currentMessages?: Message[]): OpenAIChatMessage[] => {
        const msgsToUse = currentMessages || messages;
        const history = msgsToUse
          .filter((m) => !m.localOnly)
          .map((m) => {
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
          });

        const requestMessages: OpenAIChatMessage[] = [
          ...(systemParts.length
            ? [{ role: "system" as const, content: systemParts.join("\n\n") }]
            : []),
          ...history,
          { role: "user" as const, content },
        ];

        return requestMessages;
      };

      // Call AI with tools enabled
      console.log("[AI] Sending user message:", content);

      const assistantId = nowId();
      setStreamingMessageId(assistantId);

      setMessages((prev: Message[]) => [
        ...prev,
        {
          id: assistantId,
          role: "assistant",
          content: "",
          createdAt: Date.now(),
        },
      ]);
      queueMicrotask(scrollToBottom);

      let gotAny = false;
      let toolCalls: any[] = [];
      let currentContent = "";

      for await (const chunk of openAIChatCompletionsStream({
        apiUrl: settings.apiUrl,
        apiKey: settings.apiKey,
        model,
        messages: buildMessages(),
        temperature: settings.temperature,
        maxTokens: settings.maxTokens,
        signal: aborter.signal,
        tools: TOOLS,
      })) {
        gotAny = true;

        if (chunk.type === "content" && chunk.content) {
          currentContent += chunk.content;
          setMessages((prev: Message[]) =>
            prev.map((m: Message) =>
              m.id === assistantId ? { ...m, content: currentContent } : m,
            ),
          );
          queueMicrotask(scrollToBottom);
        } else if (chunk.type === "tool_calls" && chunk.tool_calls) {
          // Merge tool calls (streaming may send them in chunks)
          for (const tc of chunk.tool_calls) {
            const existing = toolCalls.find((t) => t.id === tc.id);
            if (existing) {
              if (tc.function?.arguments) {
                existing.function.arguments = (existing.function.arguments || "") + tc.function.arguments;
              }
            } else {
              toolCalls.push({
                id: tc.id || nowId(),
                type: tc.type || "function",
                function: {
                  name: tc.function?.name || "",
                  arguments: tc.function?.arguments || "",
                },
              });
            }
          }
        }
      }

      setStreamingMessageId(null);

      if (!gotAny) {
        setMessages((prev: Message[]) =>
          prev.map((m: Message) =>
            m.id === assistantId && !m.content ? { ...m, content: "(empty response)" } : m,
          ),
        );
      }

      // If there are tool calls, save them to the assistant message and execute them
      if (toolCalls.length > 0) {
        setMessages((prev: Message[]) =>
          prev.map((m: Message) =>
            m.id === assistantId ? { ...m, tool_calls: toolCalls } : m,
          ),
        );

        // Collect all tool results
        const toolResultMessages: Message[] = [];

        // Execute each tool call and collect results
        for (const toolCall of toolCalls) {
          const toolName = toolCall.function.name;
          let args: any = {};

          console.log(`[AI] Calling tool: ${toolName}`, toolCall.function.arguments);

          try {
            args = JSON.parse(toolCall.function.arguments);
          } catch (err) {
            console.error("[AI] Failed to parse tool arguments:", err);
          }

          const result = await executeTool(toolName, args);
          console.log(`[AI] Tool result: ${result.substring(0, 100)}${result.length > 100 ? '...' : ''}`);

          // Create tool result message
          const toolResultMsg: Message = {
            id: nowId(),
            role: "tool",
            content: result,
            tool_call_id: toolCall.id,
            name: toolName,
            createdAt: Date.now(),
          };

          toolResultMessages.push(toolResultMsg);
        }

        // Add all tool results to messages
        setMessages((prev: Message[]) => [...prev, ...toolResultMessages]);
        queueMicrotask(scrollToBottom);

        // Build the complete message history including tool results
        // Option 1: Standard OpenAI format with tool role
        const messagesWithToolsStandard: OpenAIChatMessage[] = [
          ...(systemParts.length
            ? [{ role: "system" as const, content: systemParts.join("\n\n") }]
            : []),
          ...messages.filter((m) => !m.localOnly).map((m) => {
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
          }),
          { role: "user" as const, content },
          {
            role: "assistant" as const,
            content: currentContent || null,  // Must be null if there are tool_calls
            tool_calls: toolCalls,
          },
          ...toolResultMessages.map((msg) => ({
            role: "tool" as const,
            content: msg.content,
            tool_call_id: msg.tool_call_id!,
            name: msg.name!,
          })),
        ];

        // Option 2: Fallback format - convert tool results to user messages
        // Some API servers don't support the "tool" role, so we provide a fallback
        const messagesWithToolsFallback: OpenAIChatMessage[] = [
          ...(systemParts.length
            ? [{ role: "system" as const, content: systemParts.join("\n\n") }]
            : []),
          ...messages.filter((m) => !m.localOnly).map((m) => {
            const msg: OpenAIChatMessage = {
              role: m.role as any,
              content: m.content,
            };
            // Don't include tool_calls in fallback mode
            return msg;
          }),
          { role: "user" as const, content },
          // Include tool results as a user message
          {
            role: "user" as const,
            content: `Tool Results:\n${toolResultMessages.map(m => `[${m.name}]: ${m.content}`).join('\n\n')}`,
          },
        ];

        // Try standard format first, fallback if it fails
        let messagesWithTools = messagesWithToolsStandard;
        let usedFallback = false;

        // Call AI again with the tool results to get final response
        console.log("[AI] Sending tool results back to AI...");

        const finalAssistantId = nowId();
        setStreamingMessageId(finalAssistantId);

        setMessages((prev: Message[]) => [
          ...prev,
          {
            id: finalAssistantId,
            role: "assistant",
            content: "",
            createdAt: Date.now(),
          },
        ]);
        queueMicrotask(scrollToBottom);

        let finalContent = "";
        let chunkCount = 0;
        try {
          // Create a timeout signal (30 seconds)
          const timeoutController = new AbortController();
          const timeoutId = setTimeout(() => {
            console.warn("[handleSend] Request timeout after 30s, aborting...");
            timeoutController.abort();
          }, 30000);

          // Combine with existing abort signal
          const combinedSignal = aborter.signal;
          if (timeoutController.signal.aborted || combinedSignal.aborted) {
            throw new Error("Request aborted");
          }

          for await (const chunk of openAIChatCompletionsStream({
            apiUrl: settings.apiUrl,
            apiKey: settings.apiKey,
            model,
            messages: messagesWithTools,
            temperature: settings.temperature,
            maxTokens: settings.maxTokens,
            signal: combinedSignal,
            // Don't pass tools here - we want a text response, not more tool calls
          })) {
            clearTimeout(timeoutId); // Clear timeout on first chunk
            chunkCount++;

            if (chunk.type === "content" && chunk.content) {
              finalContent += chunk.content;
              setMessages((prev: Message[]) =>
                prev.map((m: Message) =>
                  m.id === finalAssistantId ? { ...m, content: finalContent } : m,
                ),
              );
              queueMicrotask(scrollToBottom);
            }
          }

          clearTimeout(timeoutId);
        } catch (streamErr: any) {
          console.error("[AI] Error during final response:", streamErr);

          // If we haven't used fallback yet and error is not abort, try fallback format
          if (!usedFallback && String(streamErr?.name) !== "AbortError") {
            console.log("[AI] Retrying with fallback format...");
            usedFallback = true;
            messagesWithTools = messagesWithToolsFallback;

            // Retry with fallback format
            try {
              chunkCount = 0;
              finalContent = "";

              for await (const chunk of openAIChatCompletionsStream({
                apiUrl: settings.apiUrl,
                apiKey: settings.apiKey,
                model,
                messages: messagesWithTools,
                temperature: settings.temperature,
                maxTokens: settings.maxTokens,
                signal: aborter.signal,
              })) {
                chunkCount++;

                if (chunk.type === "content" && chunk.content) {
                  finalContent += chunk.content;
                  setMessages((prev: Message[]) =>
                    prev.map((m: Message) =>
                      m.id === finalAssistantId ? { ...m, content: finalContent } : m,
                    ),
                  );
                  queueMicrotask(scrollToBottom);
                }
              }
              console.log("[AI] Fallback succeeded");
            } catch (fallbackErr: any) {
              console.error("[AI] Fallback also failed:", fallbackErr);
              throw fallbackErr; // Re-throw to be caught by outer catch
            }
          } else {
            throw streamErr; // Re-throw to be caught by outer catch
          }
        }

        setStreamingMessageId(null);

        if (chunkCount === 0) {
          console.warn("[AI] No response received from API");
          setMessages((prev: Message[]) =>
            prev.map((m: Message) =>
              m.id === finalAssistantId && !m.content ? { ...m, content: "(empty response from API)" } : m,
            ),
          );
        } else {
          console.log(`[AI] Final response complete (${finalContent.length} chars)`);
        }
	      }
	    } catch (err: any) {
	      const isAbort = String(err?.name ?? "") === "AbortError";
      const msg = String(err?.message ?? err ?? "unknown error");
      if (!isAbort) orca.notify("error", msg);

      // Find the last assistant message and update it with error
      setMessages((prev: Message[]) => {
        const lastAssistantIndex = prev.findIndex(
          (m, i) => m.role === "assistant" && i === prev.length - 1
        );
        if (lastAssistantIndex >= 0) {
          return prev.map((m, i) =>
            i === lastAssistantIndex
              ? { ...m, content: m.content || (isAbort ? "(stopped)" : `(error) ${msg}`) }
              : m
          );
        }
        return prev;
      });
    } finally {
      if (abortRef.current === aborter) abortRef.current = null;
      setSending(false);
      setStreamingMessageId(null);
      queueMicrotask(scrollToBottom);
    }
  }

  function clear() {
    if (abortRef.current) abortRef.current.abort();
    setMessages([]);
  }

  function stop() {
    if (!abortRef.current) return;
    abortRef.current.abort();
  }

  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  const rootBlockId: number | null = useMemo(() => {
    const vp = findViewPanelById(orcaSnap.panels, panelId);
    const arg = (vp?.viewArgs as any)?.rootBlockId;
    if (typeof arg === "number") return arg;
    if (typeof uiSnap.lastRootBlockId === "number") return uiSnap.lastRootBlockId;
    return null;
  }, [orcaSnap.panels, panelId, uiSnap.lastRootBlockId]);

  const currentPageTitle = useMemo(() => {
    if (rootBlockId == null) return "";
    const block = (orca.state.blocks as any)?.[rootBlockId];
    return safeText(block) || "";
  }, [rootBlockId]);

  const pluginNameForUi = getAiChatPluginName();
  const settingsForUi = getAiChatSettings(pluginNameForUi);
  const defaultModelForUi = resolveAiModel(settingsForUi);
  const selectedModel = (currentSession.model || "").trim() || defaultModelForUi;
  const modelOptions = buildAiModelOptions(settingsForUi, [selectedModel]);

  const handleModelChange = useCallback((nextModel: string) => {
    setCurrentSession((prev: SavedSession) => ({ ...prev, model: nextModel }));
  }, []);

  const handleAddModelToSettings = useCallback(
    async (model: string) => {
      const trimmed = model.trim();
      if (!trimmed) return;

      try {
        const current = getAiChatSettings(pluginNameForUi);
        if (current.customModels.some((m) => m.model === trimmed)) return;

        await updateAiChatSettings("app", pluginNameForUi, {
          customModels: [...current.customModels, { model: trimmed }],
        });
        orca.notify("success", `Added model: ${trimmed}`);
      } catch (err: any) {
        const msg = String(err?.message ?? err ?? "unknown error");
        orca.notify("error", `Failed to add model: ${msg}`);
      }
    },
    [pluginNameForUi],
  );

  // Construct message elements to properly handle loading state
  const messageElements = messages.map((m: Message) => {
      // Skip tool messages from display (they're internal)
      if (m.role === "tool") {
        return null;
      }

      return createElement(
        "div",
        {
          key: m.id,
          style: {
            width: "100%",
            display: "flex",
            justifyContent: m.role === "user" ? "flex-end" : "flex-start",
            marginBottom: "16px",
            animation: "messageSlideIn 0.3s ease-out",
          },
        },
        createElement(
          "div",
          {
            style: {
              maxWidth: m.role === "user" ? "75%" : "90%",
              padding: m.role === "user" ? "12px 16px" : "16px 20px",
              borderRadius: m.role === "user" ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
              background: m.role === "user"
                  ? "var(--orca-color-primary, #007bff)"
                  : "var(--orca-color-bg-2)",
              color: m.role === "user" ? "#fff" : "var(--orca-color-text-1)",
              border: m.role === "assistant" ? "1px solid var(--orca-color-border)" : "none",
              boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
              position: "relative",
            },
          },
          // Use Markdown rendering for content
          createElement(MarkdownMessage, {
              content: m.content || "",
              role: m.role,
          }),
          // Typewriter cursor for streaming message
          (streamingMessageId === m.id) && createElement("span", {
              style: {
                  display: "inline-block",
                  width: "2px",
                  height: "1.2em",
                  background: "var(--orca-color-primary, #007bff)",
                  marginLeft: "2px",
                  verticalAlign: "text-bottom",
                  animation: "blink 1s step-end infinite",
              }
          }),
          // Show tool calls if present
          m.tool_calls && m.tool_calls.length > 0
            ? createElement(
                "div",
                {
                  style: {
                    marginTop: 8,
                    padding: 8,
                    background: "var(--orca-color-bg-3)",
                    borderRadius: 4,
                    fontSize: "0.85em",
                    opacity: 0.8,
                    fontFamily: "monospace",
                  },
                },
                `🔧 Calling tool: ${m.tool_calls.map((tc) => tc.function.name).join(", ")}`
              )
            : null,
        ),
      );
    }).filter(Boolean);

    // Add loading dots if sending but no response yet (or only tool responses so far)
    const lastMsg = messages[messages.length - 1];
    if (sending && lastMsg && lastMsg.role === "user") {
        messageElements.push(
            createElement(
                "div",
                {
                    key: "loading",
                    style: {
                        width: "100%",
                        display: "flex",
                        justifyContent: "flex-start",
                        marginBottom: "16px",
                        animation: "messageSlideIn 0.3s ease-out",
                    },
                },
                createElement(
                    "div",
                    {
                        style: {
                            padding: "0",
                            borderRadius: "18px 18px 18px 4px",
                            background: "var(--orca-color-bg-2)",
                            border: "1px solid var(--orca-color-border)",
                            boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
                        }
                    },
                    createElement(LoadingDots)
                )
            )
        );
    }

  return createElement(
    "div",
    {
      style: {
        height: "100%",
        width: "100%",
        display: "flex",
        flexDirection: "column",
        background: "var(--orca-color-bg-1)",
        color: "var(--orca-color-text-1)",
      },
    },
    // Header
    createElement(
      "div",
      {
        style: {
          padding: 12,
          display: "flex",
          alignItems: "center",
          gap: 8,
          borderBottom: "1px solid var(--orca-color-border)",
          background: "var(--orca-color-bg-1)",
          zIndex: 10,
        },
      },
      createElement(
        "div",
        { style: { fontWeight: 600, flex: 1, fontFamily: "var(--chat-font-sans)" } },
        "AI Chat",
      ),
      // Save button
      createElement(
        Button,
        {
          variant: "plain",
          onClick: handleSaveSession,
          title: "Save session",
        },
        createElement("i", { className: "ti ti-device-floppy" }),
      ),
      // History menu
      createElement(ChatHistoryMenu, {
        sessions,
        activeSessionId: currentSession.id,
        onSelectSession: handleSelectSession,
        onDeleteSession: handleDeleteSession,
        onClearAll: handleClearAllSessions,
        onNewSession: handleNewSession,
      }),
      createElement(
        Button,
        {
          variant: "plain",
          onClick: () => void orca.commands.invokeCommand("core.openSettings"),
          title: "Settings",
        },
        createElement("i", { className: "ti ti-settings" }),
      ),
      createElement(
        Button,
        { variant: "plain", disabled: !sending, onClick: stop, title: "Stop generation" },
        createElement("i", { className: "ti ti-player-stop" }),
      ),
      createElement(
        Button,
        { variant: "plain", onClick: clear, title: "Clear chat" },
        createElement("i", { className: "ti ti-trash" }),
      ),
      createElement(
        Button,
        { variant: "plain", onClick: () => closeAiChatPanel(panelId), title: "Close" },
        createElement("i", { className: "ti ti-x" }),
      ),
    ),
    // Message List
    createElement(
      "div",
      {
        ref: listRef as any,
        style: {
          flex: 1,
          overflow: "auto",
          padding: "20px",
          display: "flex",
          flexDirection: "column",
          gap: 10,
          scrollBehavior: "smooth",
        },
      },
      ...messageElements,
    ),
    // Chat Input
    createElement(ChatInput, {
      onSend: handleSend,
      disabled: sending,
      currentPageId: rootBlockId,
      currentPageTitle,
      modelOptions,
      selectedModel,
      onModelChange: handleModelChange,
      onAddModel: handleAddModelToSettings,
    }),
  );
}
