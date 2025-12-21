import type { PanelProps } from "../orca.d.ts";

import { openAIChatCompletionsStream, type OpenAIChatMessage } from "../services/openai-client";
import { buildContextForSend } from "../services/context-builder";
import { contextStore, type ContextRef } from "../store/context-store";
import { closeAiChatPanel, getAiChatPluginName } from "../ui/ai-chat-ui";
import { uiStore } from "../store/ui-store";
import { findViewPanelById } from "../utils/panel-tree";
import ChatInput from "./ChatInput";
import MarkdownMessage from "../components/MarkdownMessage";
import ChatHistoryMenu from "./ChatHistoryMenu";
import LoadingDots from "../components/LoadingDots";
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
import { buildChatMessages, buildMessagesWithToolResults } from "../services/message-builder";
import { streamChatCompletion, streamChatWithRetry, mergeToolCalls, type ToolCallInfo } from "../services/chat-stream-handler";

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
        content: "New chat started. How can I help you?",
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
  // Chat Send Logic
  // ─────────────────────────────────────────────────────────────────────────

  async function handleSend(content: string) {
    if (!content || sending) return;

    const pluginName = getAiChatPluginName();
    const settings = getAiChatSettings(pluginName);
    const model = (currentSession.model || "").trim() || resolveAiModel(settings);
    const validationError = validateAiChatSettingsWithModel(settings, model);
    if (validationError) {
      orca.notify("warn", validationError);
      return;
    }

    setSending(true);

    // Add user message
    const userMsg: Message = { id: nowId(), role: "user", content, createdAt: Date.now() };
    setMessages((prev) => [...prev, userMsg]);
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

      // Build initial messages
      const apiMessages = buildChatMessages({
        messages,
        userContent: content,
        systemPrompt: settings.systemPrompt,
        contextText,
      });

      // Create assistant message placeholder
      const assistantId = nowId();
      setStreamingMessageId(assistantId);
      setMessages((prev) => [...prev, { id: assistantId, role: "assistant", content: "", createdAt: Date.now() }]);
      queueMicrotask(scrollToBottom);

      // Stream initial response
      let currentContent = "";
      let toolCalls: ToolCallInfo[] = [];

      for await (const chunk of streamChatCompletion({
        apiUrl: settings.apiUrl,
        apiKey: settings.apiKey,
        model,
        messages: apiMessages,
        temperature: settings.temperature,
        maxTokens: settings.maxTokens,
        signal: aborter.signal,
        tools: TOOLS,
      })) {
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

      // Handle tool calls
      if (toolCalls.length > 0) {
        updateMessage(assistantId, { tool_calls: toolCalls });

        // Execute tools
        const toolResultMessages: Message[] = [];
        for (const toolCall of toolCalls) {
          const toolName = toolCall.function.name;
          let args: any = {};
          try {
            args = JSON.parse(toolCall.function.arguments);
          } catch {}

          console.log(`[AI] Calling tool: ${toolName}`);
          const result = await executeTool(toolName, args);
          console.log(`[AI] Tool result: ${result.substring(0, 100)}${result.length > 100 ? "..." : ""}`);

          toolResultMessages.push({
            id: nowId(),
            role: "tool",
            content: result,
            tool_call_id: toolCall.id,
            name: toolName,
            createdAt: Date.now(),
          });
        }

        setMessages((prev) => [...prev, ...toolResultMessages]);
        queueMicrotask(scrollToBottom);

        // Build messages with tool results
        const { standard, fallback } = buildMessagesWithToolResults({
          messages,
          userContent: content,
          systemPrompt: settings.systemPrompt,
          contextText,
          assistantContent: currentContent,
          toolCalls,
          toolResults: toolResultMessages,
        });

        // Create final assistant message
        const finalAssistantId = nowId();
        setStreamingMessageId(finalAssistantId);
        setMessages((prev) => [...prev, { id: finalAssistantId, role: "assistant", content: "", createdAt: Date.now() }]);
        queueMicrotask(scrollToBottom);

        let finalContent = "";

        try {
          for await (const chunk of streamChatWithRetry(
            {
              apiUrl: settings.apiUrl,
              apiKey: settings.apiKey,
              model,
              temperature: settings.temperature,
              maxTokens: settings.maxTokens,
              signal: aborter.signal,
            },
            standard,
            fallback,
            () => console.log("[AI] Retrying with fallback format...")
          )) {
            if (chunk.type === "content") {
              finalContent += chunk.content;
              updateMessage(finalAssistantId, { content: finalContent });
            }
          }
        } catch (streamErr: any) {
          console.error("[AI] Error during final response:", streamErr);
          throw streamErr;
        }

        if (finalContent.trim().length === 0) {
          const toolFallback = toolResultMessages.map((m) => m.content).join("\n\n").trim();
          updateMessage(finalAssistantId, { content: toolFallback || "(empty response from API)" });
        }

        setStreamingMessageId(null);
        console.log(`[AI] Final response complete (${finalContent.length} chars)`);
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

  const messageElements = messages
    .filter((m) => m.role !== "tool")
    .map((m) =>
      createElement(
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
              background: m.role === "user" ? "var(--orca-color-primary, #007bff)" : "var(--orca-color-bg-2)",
              color: m.role === "user" ? "#fff" : "var(--orca-color-text-1)",
              border: m.role === "assistant" ? "1px solid var(--orca-color-border)" : "none",
              boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
              position: "relative",
            },
          },
          createElement(MarkdownMessage, { content: m.content || "", role: m.role }),
          streamingMessageId === m.id &&
            createElement("span", {
              style: {
                display: "inline-block",
                width: "2px",
                height: "1.2em",
                background: "var(--orca-color-primary, #007bff)",
                marginLeft: "2px",
                verticalAlign: "text-bottom",
                animation: "blink 1s step-end infinite",
              },
            }),
          m.tool_calls &&
            m.tool_calls.length > 0 &&
            createElement(
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
        )
      )
    );

  // Add loading dots if waiting for response
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
            },
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
      createElement("div", { style: { fontWeight: 600, flex: 1, fontFamily: "var(--chat-font-sans)" } }, "AI Chat"),
      createElement(Button, { variant: "plain", onClick: handleSaveSession, title: "Save session" }, createElement("i", { className: "ti ti-device-floppy" })),
      createElement(ChatHistoryMenu, {
        sessions,
        activeSessionId: currentSession.id,
        onSelectSession: handleSelectSession,
        onDeleteSession: handleDeleteSession,
        onClearAll: handleClearAllSessions,
        onNewSession: handleNewSession,
      }),
      createElement(Button, { variant: "plain", onClick: () => void orca.commands.invokeCommand("core.openSettings"), title: "Settings" }, createElement("i", { className: "ti ti-settings" })),
      createElement(Button, { variant: "plain", disabled: !sending, onClick: stop, title: "Stop generation" }, createElement("i", { className: "ti ti-player-stop" })),
      createElement(Button, { variant: "plain", onClick: clear, title: "Clear chat" }, createElement("i", { className: "ti ti-trash" })),
      createElement(Button, { variant: "plain", onClick: () => closeAiChatPanel(panelId), title: "Close" }, createElement("i", { className: "ti ti-x" }))
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
      ...messageElements
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
    })
  );
}
