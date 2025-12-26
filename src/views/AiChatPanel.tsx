import type { PanelProps } from "../orca.d.ts";

import { buildContextForSend } from "../services/context-builder";
import { contextStore, type ContextRef } from "../store/context-store";
import { skillStore, replaceVariables } from "../store/skill-store";
import { filterToolsBySkill } from "../services/ai-tools";
import { closeAiChatPanel, getAiChatPluginName } from "../ui/ai-chat-ui";
import { uiStore } from "../store/ui-store";
import { memoryStore } from "../store/memory-store";
import { findViewPanelById } from "../utils/panel-tree";
import ChatInput from "./ChatInput";
import MarkdownMessage from "../components/MarkdownMessage";
import MessageItem from "./MessageItem";
import ChatHistoryMenu from "./ChatHistoryMenu";
import HeaderMenu from "./HeaderMenu";
import EmptyState from "./EmptyState";
import LoadingDots from "../components/LoadingDots";
import MemoryManager from "./MemoryManager";
import { injectChatStyles } from "../styles/chat-animations";
import {
  buildAiModelOptions,
  getAiChatSettings,
  resolveAiModel,
  updateAiChatSettings,
  validateAiChatSettingsWithModel,
} from "../settings/ai-chat-settings";
import {
  loadSessions,
  saveSession,
  deleteSession,
  clearAllSessions,
  createNewSession,
  type SavedSession,
  type Message,
} from "../services/session-service";
import { sessionStore, updateSessionStore, markSessionSaved, clearSessionStore } from "../store/session-store";
import { TOOLS, executeTool } from "../services/ai-tools";
import { nowId, safeText } from "../utils/text-utils";
import { buildConversationMessages } from "../services/message-builder";
import { streamChatWithRetry, type ToolCallInfo } from "../services/chat-stream-handler";
import {
  panelContainerStyle,
  headerStyle,
  headerTitleStyle,
  messageListStyle,
  loadingContainerStyle,
  loadingBubbleStyle,
} from "../styles/ai-chat-styles";

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

// ─────────────────────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────────────────────

function smoothScrollToBottom(el: HTMLDivElement | null, duration = 300) {
  if (!el) return;
  if (el.scrollHeight - el.scrollTop - el.clientHeight < 50) {
    el.scrollTop = el.scrollHeight;
    return;
  }
  const start = el.scrollTop;
  const target = el.scrollHeight - el.clientHeight;
  if (target < start) {
    el.scrollTop = target;
    return;
  }
  const distance = target - start;
  let startTime: number | null = null;

  function animation(currentTime: number) {
    if (startTime === null) startTime = currentTime;
    const progress = Math.min((currentTime - startTime) / duration, 1);
    const ease = 1 - Math.pow(1 - progress, 3);
    el!.scrollTop = start + distance * ease;
    if (progress < 1) requestAnimationFrame(animation);
  }
  requestAnimationFrame(animation);
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export default function AiChatPanel({ panelId }: PanelProps) {
  const orcaSnap = useSnapshot(orca.state);
  const uiSnap = useSnapshot(uiStore);
  const [sending, setSending] = useState(false);
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

  const [messages, setMessages] = useState<Message[]>([]);

  // View mode state for switching between chat and memory manager
  type ViewMode = 'chat' | 'memory-manager';
  const [viewMode, setViewMode] = useState<ViewMode>('chat');

  const listRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const scrollToBottom = useCallback(() => {
    smoothScrollToBottom(listRef.current);
  }, []);

  const updateMessage = useCallback((id: string, updates: Partial<Message>) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...updates } : m)));
    queueMicrotask(scrollToBottom);
  }, [scrollToBottom]);

  // ─────────────────────────────────────────────────────────────────────────
  // Session Management
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    const pluginName = getAiChatPluginName();
    const settings = getAiChatSettings(pluginName);
    const defaultModel = resolveAiModel(settings);

    loadSessions().then((data) => {
      setSessions(data.sessions);
      if (data.activeSessionId) {
        const active = data.sessions.find((s) => s.id === data.activeSessionId);
        if (active && active.messages.length > 0) {
          setCurrentSession({
            ...active,
            model: (active.model || "").trim() || defaultModel,
          });
          setMessages(active.messages);
          if (active.contexts && active.contexts.length > 0) {
            contextStore.selected = active.contexts;
          }
        }
      }
      setSessionsLoaded(true);
    });
  }, []);

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
    const data = await loadSessions();
    setSessions(data.sessions);
    orca.notify("success", "Session saved");
  }, [messages, currentSession]);

  const handleNewSession = useCallback(() => {
    const pluginName = getAiChatPluginName();
    const settings = getAiChatSettings(pluginName);
    const defaultModel = resolveAiModel(settings);

    setCurrentSession({ ...createNewSession(), model: defaultModel });
    setMessages([
      {
        id: nowId(),
        role: "assistant",
        content: "New conversation started. How can I help?",
        createdAt: Date.now(),
        localOnly: true,
      },
    ]);
    contextStore.selected = [];
  }, []);

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
    contextStore.selected = session.contexts || [];
  }, [sessions]);

  const handleDeleteSession = useCallback(async (sessionId: string) => {
    await deleteSession(sessionId);
    const data = await loadSessions();
    setSessions(data.sessions);
    if (currentSession.id === sessionId) {
      handleNewSession();
    }
  }, [currentSession.id, handleNewSession]);

  const handleClearAllSessions = useCallback(async () => {
    await clearAllSessions();
    setSessions([]);
    handleNewSession();
  }, [handleNewSession]);

  // Sync state to session store for auto-save on close
  useEffect(() => {
    const hasRealMessages = messages.some((m) => !m.localOnly);
    if (hasRealMessages) {
      updateSessionStore(currentSession, messages, [...contextStore.selected]);
    }
  }, [messages, currentSession]);

  useEffect(() => injectChatStyles(), []);
  useEffect(() => () => { clearSessionStore(); }, []);
  useEffect(() => () => { if (abortRef.current) abortRef.current.abort(); }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Memory Manager View Switching
  // ─────────────────────────────────────────────────────────────────────────

  const handleOpenMemoryManager = useCallback(() => {
    setViewMode('memory-manager');
  }, []);

  const handleCloseMemoryManager = useCallback(() => {
    setViewMode('chat');
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Chat Send Logic
  // ─────────────────────────────────────────────────────────────────────────

	  async function handleSend(content: string, historyOverride?: Message[]) {
	    if (!content || sending) return;

	    const pluginName = getAiChatPluginName();
	    const settings = getAiChatSettings(pluginName);
	    // 工具调用最大轮数：可在设置中配置；若缺失则默认 5（向后兼容）
	    const MAX_TOOL_ROUNDS = settings.maxToolRounds || 5;
	    // 系统提示词模板变量：支持 {maxToolRounds}，按当前 MAX_TOOL_ROUNDS 注入
	    let systemPrompt = settings.systemPrompt.split("{maxToolRounds}").join(String(MAX_TOOL_ROUNDS));

	    // ═══════════════════════════════════════════════════════════════════════
	    // Skill 集成
	    // ═══════════════════════════════════════════════════════════════════════
	    const activeSkill = skillStore.activeSkill;
	    let activeTools = TOOLS; // 默认使用全部工具

	    if (activeSkill) {
	      // 1. 追加 Skill 指令到 System Prompt
	      let skillPrompt = activeSkill.prompt || "";

	      // 替换变量（如果有）
	      if (activeSkill.variables?.length && Object.keys(skillStore.variables).length > 0) {
	        skillPrompt = replaceVariables(skillPrompt, skillStore.variables);
	      }

	      if (skillPrompt) {
	        systemPrompt += `\n\n---\n## 当前激活技能: ${activeSkill.name}\n${activeSkill.description ? activeSkill.description + "\n\n" : ""}${skillPrompt}`;
	      }

	      // 2. 工具型 Skill 过滤工具集
	      if (activeSkill.type === "tools") {
	        activeTools = filterToolsBySkill(activeSkill);
	        console.log(`[AiChatPanel] Skill "${activeSkill.name}" filtered tools: ${activeTools.length}/${TOOLS.length}`);
	      }
	    }
	    // ═══════════════════════════════════════════════════════════════════════

	    const model = (currentSession.model || "").trim() || resolveAiModel(settings);
	    const validationError = validateAiChatSettingsWithModel(settings, model);
	    if (validationError) {
	      orca.notify("warn", validationError);
      return;
    }

    setSending(true);

    const userMsg: Message = { id: nowId(), role: "user", content, createdAt: Date.now() };

    // Use override if provided (for regeneration), otherwise append to current state
    if (historyOverride) {
        setMessages([...historyOverride, userMsg]);
    } else {
        setMessages((prev) => [...prev, userMsg]);
    }
    
    queueMicrotask(scrollToBottom);

    const aborter = new AbortController();
    abortRef.current = aborter;

    try {
      // Build context
      let contextText = "";
      try {
        const contexts = contextStore.selected;
        if (contexts.length) contextText = await buildContextForSend(contexts);
      } catch (err: any) {
        orca.notify("warn", `Context build failed: ${String(err?.message ?? err ?? "unknown error")}`);
      }

      // Maintain an in-memory conversation so multi-round tool calls include prior tool results.
      // Use historyOverride if available to build conversation
      const baseMessages = historyOverride || messages;
      const conversation: Message[] = [...baseMessages.filter((m) => !m.localOnly), userMsg];

      // Create assistant message placeholder
      const assistantId = nowId();
      const assistantCreatedAt = Date.now();
      setStreamingMessageId(assistantId);
      setMessages((prev) => [...prev, { id: assistantId, role: "assistant", content: "", createdAt: assistantCreatedAt }]);
      queueMicrotask(scrollToBottom);

      // Stream initial response with timeout protection
      let currentContent = "";
      let toolCalls: ToolCallInfo[] = [];

      // Get memory text for injection based on current injection mode
      // Uses getFullMemoryText which combines portrait (higher priority) + unextracted memories
      const memoryText = memoryStore.getFullMemoryText();

	      const { standard: apiMessages, fallback: apiMessagesFallback } = buildConversationMessages({
	        messages: conversation,
	        systemPrompt,
	        contextText,
	        customMemory: memoryText,
	      });

      for await (const chunk of streamChatWithRetry(
        {
          apiUrl: settings.apiUrl,
          apiKey: settings.apiKey,
          model,
          temperature: settings.temperature,
          maxTokens: settings.maxTokens,
          signal: aborter.signal,
          tools: activeTools,
        },
        apiMessages,
        apiMessagesFallback,
      )) {
        if (chunk.type === "content") {
          currentContent += chunk.content;
          updateMessage(assistantId, { content: currentContent });
        } else if (chunk.type === "tool_calls") {
          toolCalls = chunk.toolCalls;
        }
      }

      setStreamingMessageId(null);

      if (!currentContent && toolCalls.length === 0) {
        updateMessage(assistantId, { content: "(empty response)" });
      }

	      conversation.push({
	        id: assistantId,
	        role: "assistant",
	        content: currentContent,
	        createdAt: assistantCreatedAt,
	        tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
	      });

		      // Handle tool calls with multi-round support
		      let toolRound = 0;
		      let currentToolCalls = toolCalls;
		      let currentAssistantId = assistantId;
		      const allToolResultMessages: Message[] = [];

      while (currentToolCalls.length > 0 && toolRound < MAX_TOOL_ROUNDS) {
        toolRound++;
        console.log(`[AI] Tool calling round ${toolRound}/${MAX_TOOL_ROUNDS}`);

        updateMessage(currentAssistantId, { tool_calls: currentToolCalls });

        // Keep tool_calls in the conversation snapshot
        const assistantIdx = conversation.findIndex((m) => m.id === currentAssistantId);
        if (assistantIdx >= 0) conversation[assistantIdx].tool_calls = currentToolCalls;

        // Execute tools
        const toolResultMessages: Message[] = [];
        for (const toolCall of currentToolCalls) {
          const toolName = toolCall.function.name;
          let args: any = {};
          let parseError: string | null = null;

          try {
            args = JSON.parse(toolCall.function.arguments);
          } catch (error: any) {
            parseError = `Invalid JSON in tool arguments: ${error.message}`;
            console.error(`[AI] [Round ${toolRound}] JSON parse error for ${toolName}:`, error);
            console.error(`[AI] Raw arguments:`, toolCall.function.arguments);
          }

          // Log tool call with parsed arguments for debugging
          console.log(`[AI] [Round ${toolRound}] Calling tool: ${toolName}`);
          if (!parseError) {
            console.log(`[AI] [Round ${toolRound}] Tool arguments:`, args);
          }

          // If JSON parsing failed, return error to model
          let result: string;
          if (parseError) {
             result = `Error: ${parseError}\n\nRaw arguments received:\n${toolCall.function.arguments}\n\nPlease provide valid JSON arguments.`;
          } else {
             // Execute tool with timeout protection
             const TOOL_TIMEOUT_MS = 60000; // 60s timeout for tool execution
             try {
               const timeoutPromise = new Promise<string>((_, reject) => {
                 setTimeout(() => reject(new Error(`Tool execution timed out after ${TOOL_TIMEOUT_MS / 1000}s`)), TOOL_TIMEOUT_MS);
               });
               
               result = await Promise.race([
                 executeTool(toolName, args),
                 timeoutPromise
               ]);
             } catch (err: any) {
               console.error(`[AI] [Round ${toolRound}] Tool execution error/timeout:`, err);
               result = `Error: ${err.message || "Tool execution failed"}`;
             }
          }

          console.log(`[AI] [Round ${toolRound}] Tool result: ${result.substring(0, 100)}${result.length > 100 ? "..." : ""}`);

          toolResultMessages.push({
            id: nowId(),
            role: "tool",
            content: result,
            tool_call_id: toolCall.id,
            name: toolName,
            createdAt: Date.now(),
          });
        }

        allToolResultMessages.push(...toolResultMessages);
        conversation.push(...toolResultMessages);

        setMessages((prev) => [...prev, ...toolResultMessages]);
        queueMicrotask(scrollToBottom);

        // Build messages for next response including all prior tool results
	        const { standard, fallback } = buildConversationMessages({
	          messages: conversation,
	          systemPrompt,
	          contextText,
	          customMemory: memoryText,
	        });

        // Create assistant message for next response
        const nextAssistantId = nowId();
        const nextAssistantCreatedAt = Date.now();
        setStreamingMessageId(nextAssistantId);
        setMessages((prev) => [...prev, { id: nextAssistantId, role: "assistant", content: "", createdAt: nextAssistantCreatedAt }]);
        queueMicrotask(scrollToBottom);

        let nextContent = "";
        let nextToolCalls: ToolCallInfo[] = [];
        const enableTools = toolRound < MAX_TOOL_ROUNDS;

        try {
          for await (const chunk of streamChatWithRetry(
            {
              apiUrl: settings.apiUrl,
              apiKey: settings.apiKey,
              model,
              temperature: settings.temperature,
              maxTokens: settings.maxTokens,
              signal: aborter.signal,
              tools: enableTools ? activeTools : undefined, // Last round: disable tools to force an answer
            },
            standard,
            fallback,
            () => console.log(`[AI] [Round ${toolRound}] Retrying with fallback format...`)
          )) {
            if (chunk.type === "content") {
              nextContent += chunk.content;
              updateMessage(nextAssistantId, { content: nextContent });
            } else if (chunk.type === "tool_calls" && enableTools) {
              nextToolCalls = chunk.toolCalls;
            }
          }
        } catch (streamErr: any) {
          console.error(`[AI] [Round ${toolRound}] Error during response:`, streamErr);
          throw streamErr;
        }

        setStreamingMessageId(null);

        if (nextToolCalls.length > 0) {
          updateMessage(nextAssistantId, { tool_calls: nextToolCalls });
        }

        // If the model returned nothing, surface tool outputs so the user isn't left with an empty bubble.
        if (nextContent.trim().length === 0 && nextToolCalls.length === 0) {
          const toolFallback = allToolResultMessages.map((m) => m.content).join("\n\n").trim();
          const fallbackText = toolFallback || "(empty response from API)";
          updateMessage(nextAssistantId, { content: fallbackText });
          nextContent = fallbackText;
        }

        conversation.push({
          id: nextAssistantId,
          role: "assistant",
          content: nextContent,
          createdAt: nextAssistantCreatedAt,
          tool_calls: nextToolCalls.length > 0 ? nextToolCalls : undefined,
        });

        // Check if model wants to call more tools
        if (nextToolCalls.length > 0 && toolRound < MAX_TOOL_ROUNDS) {
          console.log(`[AI] Model requested ${nextToolCalls.length} more tool(s), continuing to round ${toolRound + 1}`);
          currentToolCalls = nextToolCalls;
          currentAssistantId = nextAssistantId;
          // Continue loop
        } else {
          // No more tool calls or reached max rounds
          if (nextToolCalls.length > 0) {
            console.warn(`[AI] Reached max tool rounds (${MAX_TOOL_ROUNDS}), stopping`);
            const toolFallback = allToolResultMessages.map((m) => m.content).join("\n\n").trim();
            const warning = [
              nextContent?.trim(),
              toolFallback ? `\n\n${toolFallback}` : "",
              "\n\n_[已达到最大工具调用轮数限制]_",
            ]
              .join("")
              .trim();
            updateMessage(nextAssistantId, { content: warning || "_[已达到最大工具调用轮数限制]_" });
          }

          console.log(`[AI] Tool calling complete after ${toolRound} round(s) (${nextContent.length} chars)`);
          break;
        }
      }
    } catch (err: any) {
      const isAbort = String(err?.name ?? "") === "AbortError";
      const msg = String(err?.message ?? err ?? "unknown error");
      if (!isAbort) orca.notify("error", msg);

      setMessages((prev) => {
        const lastIdx = prev.findIndex((m, i) => m.role === "assistant" && i === prev.length - 1);
        if (lastIdx >= 0) {
          return prev.map((m, i) =>
            i === lastIdx ? { ...m, content: m.content || (isAbort ? "(stopped)" : `(error) ${msg}`) } : m
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

  const handleRegenerate = useCallback(() => {
    if (sending) return;

    // Find the last user message
    let lastUserIdx = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i].role === 'user') {
            lastUserIdx = i;
            break;
        }
    }

    if (lastUserIdx !== -1) {
        const content = messages[lastUserIdx].content || "";
        const historyBeforeUser = messages.slice(0, lastUserIdx);
        // Resend using the history BEFORE the last user message, and re-using the last user content.
        handleSend(content, historyBeforeUser);
    }
  }, [messages, sending]);


  function clear() {
    if (abortRef.current) abortRef.current.abort();
    setMessages([]);
  }

  function stop() {
    if (abortRef.current) abortRef.current.abort();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Derived State
  // ─────────────────────────────────────────────────────────────────────────

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
    setCurrentSession((prev) => ({ ...prev, model: nextModel }));
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
        orca.notify("error", `Failed to add model: ${String(err?.message ?? err ?? "unknown error")}`);
      }
    },
    [pluginNameForUi]
  );

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  let messageListContent: any[] | any;

  if (messages.length === 0) {
    messageListContent = createElement(EmptyState, {
      onSuggestionClick: (text: string) => handleSend(text),
    });
  } else {
    const messageElements = messages.map((m, i) => {
      // Determine if this is the last message that should offer regeneration (Last AI message)
      const isLastAi = m.role === 'assistant' && i === messages.length - 1;
      
      return createElement(MessageItem, {
        key: m.id,
        message: m,
        isLastAiMessage: isLastAi,
        isStreaming: streamingMessageId === m.id,
        onRegenerate: isLastAi ? handleRegenerate : undefined,
      });
    });

    // Add loading dots if waiting for response
    const lastMsg = messages[messages.length - 1];
    if (sending && lastMsg && lastMsg.role === "user") {
      messageElements.push(
        createElement(
          "div",
          {
            key: "loading",
            style: loadingContainerStyle,
          },
          createElement(
            "div",
            {
              style: loadingBubbleStyle,
            },
            createElement(LoadingDots)
          )
        )
      );
    }
    
    messageListContent = messageElements;
  }

  // If in memory manager view, render MemoryManager instead of chat
  if (viewMode === 'memory-manager') {
    return createElement(MemoryManager, { onBack: handleCloseMemoryManager });
  }

  return createElement(
    "div",
    {
      style: panelContainerStyle,
    },
    // Header
    createElement(
      "div",
      {
        style: headerStyle,
      },
      createElement("div", { style: headerTitleStyle }, "AI Chat"),
      // Chat History
      createElement(ChatHistoryMenu, {
        sessions,
        activeSessionId: currentSession.id,
        onSelectSession: handleSelectSession,
        onDeleteSession: handleDeleteSession,
        onClearAll: handleClearAllSessions,
        onNewSession: handleNewSession,
      }),
      // More Menu (Save, Settings, Clear)
      createElement(HeaderMenu, {
        onSaveSession: handleSaveSession,
        onClearChat: clear,
        onOpenSettings: () => void orca.commands.invokeCommand("core.openSettings"),
        onOpenMemoryManager: handleOpenMemoryManager,
      }),
      // Close Button
      createElement(Button, { variant: "plain", onClick: () => closeAiChatPanel(panelId), title: "Close" }, createElement("i", { className: "ti ti-x" }))
    ),
    // Message List or Empty State
    createElement(
      "div",
      {
        ref: listRef as any,
        style: messageListStyle,
      },
      ...(Array.isArray(messageListContent) ? messageListContent : [messageListContent])
    ),
    // Chat Input
    createElement(ChatInput, {
      onSend: (text: string) => handleSend(text),
      onStop: stop,
      disabled: sending,
      currentPageId: rootBlockId,
      currentPageTitle,
      modelOptions,
      selectedModel,
      onModelChange: handleModelChange,
      onAddModel: handleAddModelToSettings,
    })
  );
}
