import type { PanelProps } from "../orca.d.ts";

import { buildContextForSend } from "../services/notes/context-builder";
import { contextKey, contextStore, type ContextRef } from "../store/context-store";
import { closeAiChatPanel, getAiChatPluginName } from "../ui/ai-chat-ui";
import { uiStore } from "../store/ui-store";
import { memoryStore } from "../store/memory-store";
import { getMode } from "../store/chat-mode-store";
import { findViewPanelById } from "../utils/panel-tree";
import { generateSuggestedReplies } from "../services/ai/suggestion-service";
import { estimateTokens, formatTokenCount } from "../utils/token-utils";
import { isSameDay, formatDateSeparator, getTimeGreeting } from "../utils/chat-ui-utils";
import { withTooltip } from "../utils/orca-tooltip";
import ChatInput from "./ChatInput";
import MarkdownMessage from "../components/MarkdownMessage";
import MessageItem from "./MessageItem";
import DateSeparator from "../components/DateSeparator";
import ScrollToBottomButton from "../components/ScrollToBottomButton";
import ErrorMessage from "../components/ErrorMessage";
import ChatHistoryMenu from "./ChatHistoryMenu";
import HeaderMenu from "./HeaderMenu";
import StreamSettingsModal from "./StreamSettingsModal";
import WebSearchSettingsModal from "./WebSearchSettingsModal";
import VisionModelSettingsModal from "./VisionModelSettingsModal";
import EmptyState from "./EmptyState";
import TypingIndicator from "../components/TypingIndicator";
import MemoryManager from "./MemoryManager";
import ChatNavigation from "../components/ChatNavigation";
import FlashcardReview, { type Flashcard } from "../components/FlashcardReview";
import GlobalImagePreview from "../components/GlobalImagePreview";
import TodoistModals from "./TodoistModals";
import TodoistSettingsModal from "./TodoistSettingsModal";
import SkillManagerModal from "./SkillManagerModal";
import McpServerSettingsModal from "./McpServerSettingsModal";
import { todoistModalStore } from "../store/todoist-store";
import { injectChatStyles } from "../styles/chat-animations";
import {
  getAiChatSettings,
  getModelApiConfig,
  getCurrentApiConfig,
  getSelectedProvider,
  updateAiChatSettings,
  validateCurrentConfig,
  modelSupportsTools,
  getModelRuntimeConfig,
  type AiChatSettings,
} from "../settings/ai-chat-settings";
import { buildDynamicSystemPrompt, getCurrentRepoId } from "../services/ai/dynamic-prompt";
import { getDiscoveredTools } from "../store/mcp-store";
import {
  loadSessions,
  loadFullSession,
  deleteSession,
  clearAllSessions,
  createNewSession,
  generateSessionTitle,
  toggleSessionPinned,
  toggleSessionFavorited,
  renameSession,
  autoCacheSession,
  type SavedSession,
  type Message,
  type FileRef,
} from "../services/session-service";
import { exportSessionAsFile, saveSessionToJournal, saveMessagesToJournal } from "../services/export-service";
import { sessionStore, updateSessionStore, clearSessionStore } from "../store/session-store";
import { FLASHCARD_TOOL, executeTool, getToolsForDraggedContext, getTools, extractSearchResultsFromToolResults, getSkillToolsAsync, getSkillInstructionsAsync, getSkillToolName, resolveSkillIdFromToolName, getSkillToolMode } from "../services/ai/ai-tools";
import { getToolStatus, isToolDisabled, shouldAskForTool, isAgenticRAGEnabled, getAgenticRAGConfig, isWebSearchEnabled } from "../store/tool-store";
import { listSkills, getSkill } from "../services/ai/skills-manager";
import type { Skill, SkillRef } from "../types/skills";
import { getAutoTriggerSkill } from "../services/ai/skill-recommender";
import { nowId, safeText } from "../utils/text-utils";
import { buildConversationMessages } from "../services/ai/message-builder";
import { streamChatWithRetry, type ToolCallInfo } from "../services/ai/chat-stream-handler";
import type { OpenAIChatMessage } from "../services/ai/openai-client";
import { sanitizeContent } from "../services/ai/openai-client";
import {
  createSyntheticToolErrorMessage,
  createToolCallSignature,
  resolveToolCallName,
} from "../services/ai/tool-call-router";
import { executeAgenticRAG, getToolDisplayName } from "../services/ai/agentic-rag-service";
import { createToolRoundLimit } from "../services/ai/tool-round-limit";
import { ensureMcpServersReady } from "../services/external/mcp-server-manager";
import { normalizeWebSearchResults, type WebSearchSource } from "../utils/source-attribution";
import {
  panelContainerStyle,
  headerStyle,
  headerTitleStyle,
  messageListStyle,
  loadingContainerStyle,
  loadingBubbleStyle,
} from "../styles/ai-chat-styles";
import { multiModelStore } from "../store/multi-model-store";
import {
  createBranch,
  switchBranch,
  deleteBranch,
  renameBranch,
  getActiveBranchId,
} from "../services/branch-service";
import MultiModelResponse, { type ModelResponse } from "../components/MultiModelResponse";
import {
  streamMultiModelChat,
  createInitialResponses,
  updateModelResponse,
  getModelDisplayInfo,
} from "../services/ai/multi-model-service";

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

/**
 * 获取模型的上下文长度限制
 * @param settings AI 设置
 * @param modelId 模型 ID
 * @param providerId 可选的提供商 ID
 * @returns 上下文长度（tokens），如果未配置则返回 undefined 使用默认值
 */
function getModelContextLength(
  settings: AiChatSettings,
  modelId: string,
  providerId?: string
): number | undefined {
  // 如果指定了 providerId，直接查找该 provider
  if (providerId) {
    const provider = settings.providers.find(p => p.id === providerId);
    if (provider) {
      const model = provider.models.find(m => m.id === modelId);
      if (model?.contextLength) {
        return model.contextLength;
      }
    }
  }

  // 查找所有包含该模型的提供商
  for (const provider of settings.providers) {
    const model = provider.models.find(m => m.id === modelId);
    if (model?.contextLength) {
      return model.contextLength;
    }
  }

  // 未配置，返回 undefined 使用默认值
  return undefined;
}

type ScrollAnimationState = {
  rafId: number | null;
  cancelToken: number;
};

function cancelSmoothScroll(state?: ScrollAnimationState) {
  if (!state) return;
  state.cancelToken += 1;
  if (state.rafId !== null) {
    cancelAnimationFrame(state.rafId);
    state.rafId = null;
  }
}

function smoothScrollToBottom(
  el: HTMLDivElement | null,
  state?: ScrollAnimationState,
  duration = 300,
) {
  if (!el) return;
  if (state) {
    cancelSmoothScroll(state);
  }
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
  const cancelToken = state ? state.cancelToken : 0;

  function animation(currentTime: number) {
    if (state && state.cancelToken !== cancelToken) return;
    if (startTime === null) startTime = currentTime;
    const progress = Math.min((currentTime - startTime) / duration, 1);
    const ease = 1 - Math.pow(1 - progress, 3);
    el!.scrollTop = start + distance * ease;
    if (progress < 1) {
      const rafId = requestAnimationFrame(animation);
      if (state) state.rafId = rafId;
    } else if (state) {
      state.rafId = null;
    }
  }
  const rafId = requestAnimationFrame(animation);
  if (state) state.rafId = rafId;
}

const AUTO_SCROLL_INTERVAL_MS = 150;
const AUTO_SCROLL_DURATION_MS = 150;

function restoreScrollPosition(el: HTMLDivElement | null, savedPosition?: number) {
  if (!el) return;
  if (savedPosition !== undefined) {
    el.scrollTop = savedPosition;
  } else {
    el.scrollTop = el.scrollHeight;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// EditableTitle Component - 可编辑的会话标题
// ─────────────────────────────────────────────────────────────────────────────

type EditableTitleProps = {
  title: string;
  onSave: (newTitle: string) => void;
};

function EditableTitle({ title, onSave }: EditableTitleProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(title);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setEditValue(title);
  }, [title]);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  const handleSave = useCallback(() => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== title) {
      onSave(trimmed);
    } else if (!trimmed) {
      // 标题为空时恢复原标题
      setEditValue(title);
    }
    setIsEditing(false);
  }, [editValue, title, onSave]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSave();
    } else if (e.key === "Escape") {
      setEditValue(title);
      setIsEditing(false);
    }
  }, [handleSave, title]);

  if (isEditing) {
    return createElement("input", {
      ref: inputRef as any,
      type: "text",
      value: editValue,
      onChange: (e: any) => setEditValue(e.target.value),
      onBlur: handleSave,
      onKeyDown: handleKeyDown,
      maxLength: 100,
      placeholder: "输入标题",
      style: {
        ...headerTitleStyle,
        border: "1px solid var(--orca-color-primary)",
        borderRadius: "var(--orca-radius-sm)",
        padding: "2px 8px",
        background: "var(--orca-color-bg-1)",
        color: "var(--orca-color-text-1)",
        outline: "none",
        minWidth: 120,
        maxWidth: 200,
      },
    });
  }

  return withTooltip(
    "点击编辑标题",
    createElement(
      "div",
      {
        style: {
          ...headerTitleStyle,
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          gap: 4,
          padding: "2px 4px",
          borderRadius: 4,
          transition: "background 0.15s",
        },
        onClick: () => setIsEditing(true),
        onMouseOver: (e: any) => {
          e.currentTarget.style.background = "var(--orca-color-bg-2)";
        },
        onMouseOut: (e: any) => {
          e.currentTarget.style.background = "transparent";
        },
      },
      createElement("span", {
        style: {
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          maxWidth: 180,
        },
      }, title),
      createElement("i", {
        className: "ti ti-edit",
        style: {
          fontSize: 12,
          opacity: 0.5,
          flexShrink: 0,
        },
      })
    )
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export default function AiChatPanel({ panelId }: PanelProps) {
  const orcaSnap = useSnapshot(orca.state);
  const uiSnap = useSnapshot(uiStore);
  const contextSnap = useSnapshot(contextStore);
  const [sending, setSending] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);

  // Network error state for retry functionality
  // **Feature: chat-ui-enhancement**
  // **Validates: Requirements 11.3**
  const [lastError, setLastError] = useState<{
    message: string;
    retryData?: { content: string; files?: any[]; historyOverride?: Message[] };
  } | null>(null);

  // Session management state
  const [currentSession, setCurrentSession] = useState<SavedSession>(() => {
    const pluginName = getAiChatPluginName();
    const settings = getAiChatSettings(pluginName);
    return { ...createNewSession(), model: settings.selectedModelId };
  });
  const [sessions, setSessions] = useState<SavedSession[]>([]);
  const [sessionsLoaded, setSessionsLoaded] = useState(false);

  const [messages, setMessages] = useState<Message[]>([]);

  // View mode state for switching between chat and memory manager
  type ViewMode = 'chat' | 'memory-manager';
  const [viewMode, setViewMode] = useState<ViewMode>('chat');

  // Flashcard review state
  const [flashcardMode, setFlashcardMode] = useState(false);
  const [pendingFlashcards, setPendingFlashcards] = useState<Flashcard[]>([]);
  const [flashcardIndex, setFlashcardIndex] = useState(0);
  const [flashcardKeptCount, setFlashcardKeptCount] = useState(0);
  const [flashcardSkippedCount, setFlashcardSkippedCount] = useState(0);

  // Multi-model parallel response state
  const [multiModelResponses, setMultiModelResponses] = useState<ModelResponse[]>([]);
  const [isMultiModelMode, setIsMultiModelMode] = useState(false);

  // Stream settings modal state
  const [showStreamSettings, setShowStreamSettings] = useState(false);

  // Web search settings modal state
  const [showWebSearchSettings, setShowWebSearchSettings] = useState(false);

  // Vision model settings modal state
  const [showVisionModelSettings, setShowVisionModelSettings] = useState(false);

  // Skill manager modal state
  const [showSkillManager, setShowSkillManager] = useState(false);

  // Todoist settings modal state
  const [showTodoistSettings, setShowTodoistSettings] = useState(false);

  // MCP server settings modal state
  const [showMcpSettings, setShowMcpSettings] = useState(false);

  // Message selection mode state (for batch save)
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedMessageIds, setSelectedMessageIds] = useState<Set<string>>(new Set());

  // Branch management state (对话分支功能)
  const [currentBranchId, setCurrentBranchId] = useState<string | null>(null);


  // Scroll to bottom button state
  // **Feature: chat-ui-enhancement**
  // **Validates: Requirements 4.2, 4.3**
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);

  const listRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const skillConfirmResolversRef = useRef(new Map<string, (approved: boolean) => void>());
  // 追踪用户是否在底部附近，用于决定流式输出时是否自动滚动
  const isNearBottomRef = useRef(true);
  const scrollAnimationStateRef = useRef<ScrollAnimationState>({ rafId: null, cancelToken: 0 });
  const autoScrollTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastAutoScrollAtRef = useRef(0);

  const clearPendingAutoScroll = useCallback(() => {
    if (autoScrollTimeoutRef.current) {
      clearTimeout(autoScrollTimeoutRef.current);
      autoScrollTimeoutRef.current = null;
    }
  }, []);

  const cancelAutoScroll = useCallback(() => {
    clearPendingAutoScroll();
    cancelSmoothScroll(scrollAnimationStateRef.current);
  }, [clearPendingAutoScroll]);

  const scrollToBottom = useCallback(() => {
    clearPendingAutoScroll();
    smoothScrollToBottom(listRef.current, scrollAnimationStateRef.current);
  }, [clearPendingAutoScroll]);

  const scheduleAutoScroll = useCallback(() => {
    if (!isNearBottomRef.current) return;
    const now = Date.now();
    const elapsed = now - lastAutoScrollAtRef.current;
    const delay = Math.max(AUTO_SCROLL_INTERVAL_MS - elapsed, 0);

    if (autoScrollTimeoutRef.current) return;
    autoScrollTimeoutRef.current = setTimeout(() => {
      autoScrollTimeoutRef.current = null;
      if (!isNearBottomRef.current) return;
      lastAutoScrollAtRef.current = Date.now();
      smoothScrollToBottom(
        listRef.current,
        scrollAnimationStateRef.current,
        AUTO_SCROLL_DURATION_MS,
      );
    }, delay);
  }, []);

  // 智能滚动：只有当用户在底部附近时才自动滚动
  const scrollToBottomIfNeeded = useCallback(() => {
    if (isNearBottomRef.current) {
      scheduleAutoScroll();
    }
  }, [scheduleAutoScroll]);

  const updateMessage = useCallback((id: string, updates: Partial<Message>) => {
    setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, ...updates } : m)));
    scrollToBottomIfNeeded();
  }, [scrollToBottomIfNeeded]);

  const extractJsonPayload = useCallback((raw: string): any | null => {
    if (!raw) return null;
    const cleaned = raw
      .trim()
      .replace(/```json/gi, "")
      .replace(/```/g, "")
      .trim();
    if (!cleaned) return null;
    try {
      return JSON.parse(cleaned);
    } catch {}
    const match = cleaned.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }, []);

  const requestSkillConfirm = useCallback((skill: Skill): Promise<boolean> => {
    return new Promise((resolve) => {
      const messageId = nowId();
      const createdAt = Date.now();
      const stepSummary = [skill.description || skill.instruction.slice(0, 200)];
      skillConfirmResolversRef.current.set(messageId, resolve);
      setMessages((prev) => [
        ...prev,
        {
          id: messageId,
          role: "assistant",
          content: "",
          createdAt,
          localOnly: true,
          skillConfirm: {
            skillId: skill.id,
            skillName: skill.name,
            steps: stepSummary,
            status: "pending",
          },
        },
      ]);
    });
  }, []);

  const handleSkillConfirmAction = useCallback((messageId: string, approved: boolean) => {
    const resolver = skillConfirmResolversRef.current.get(messageId);
    if (resolver) {
      resolver(approved);
      skillConfirmResolversRef.current.delete(messageId);
    }

    setMessages((prev) =>
      prev.map((m) => {
        if (m.id !== messageId || !m.skillConfirm) return m;
        return {
          ...m,
          skillConfirm: {
            ...m.skillConfirm,
            status: approved ? "approved" : "denied",
          },
        };
      })
    );
  }, []);

  const handleSkillSlashCommand = useCallback(async (rawContent: string, requestText: string) => {
    // Skill slash command is no longer supported in the new system
    // This function is kept for compatibility but does nothing
    orca.notify("info", "技能编写功能暂不可用，请使用技能管理器创建新技能");
  }, []);

  const displaySessionTitle = useMemo(() => {
    const title = (currentSession.title || "").trim();
    if (title) return title;
    const hasRealMessages = messages.some((m) => !m.localOnly);
    if (hasRealMessages) {
      return generateSessionTitle(messages);
    }
    return "新对话";
  }, [currentSession.title, messages]);

  // ─────────────────────────────────────────────────────────────────────────
  // Panel Metadata for orca-tabs-plugin compatibility
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    // Set panel metadata attributes for orca-tabs-plugin to detect this view panel
    // 使用延迟确保 DOM 已经完全渲染
    const setMetadata = () => {
      const panelElement = document.querySelector(
        `.orca-panel[data-panel-id="${panelId}"]`
      );
      
      if (panelElement) {
        panelElement.setAttribute('data-panel-title', 'AI Chat');
        panelElement.setAttribute('data-panel-icon', '🤖');
        panelElement.setAttribute('data-panel-type', 'view');
      }
    };

    // 立即尝试设置
    setMetadata();
    
    // 延迟再次尝试，确保 DOM 完全就绪
    const timeoutId = setTimeout(setMetadata, 100);
    
    return () => clearTimeout(timeoutId);
  }, [panelId]);

  // ─────────────────────────────────────────────────────────────────────────
  // Session Management
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    const pluginName = getAiChatPluginName();
    const settings = getAiChatSettings(pluginName);
    const defaultModel = settings.selectedModelId;

    loadSessions().then(async (data) => {
      setSessions(data.sessions);
      if (data.activeSessionId) {
        // 加载完整会话数据（包含消息）
        const active = await loadFullSession(data.activeSessionId);
        if (active) {
          // 恢复会话（即使没有消息，也可能有闪卡状态）
          setCurrentSession({
            ...active,
            model: (active.model || "").trim() || defaultModel,
          });
          if (active.messages.length > 0) {
            setMessages(active.messages);
          }
          if (active.contexts && active.contexts.length > 0) {
            contextStore.selected = active.contexts;
          }
          // 恢复闪卡状态
          if (active.flashcardState && active.flashcardState.cards.length > 0) {
            const state = active.flashcardState;
            // 只有还有未完成的卡片才恢复
            if (state.currentIndex < state.cards.length) {
              setPendingFlashcards(state.cards as Flashcard[]);
              setFlashcardIndex(state.currentIndex);
              setFlashcardKeptCount(state.keptCount);
              setFlashcardSkippedCount(state.skippedCount);
              setFlashcardMode(true);
            }
          }
          // 恢复滚动位置
          // 使用 setTimeout 确保 DOM 渲染完成后再滚动
          setTimeout(() => {
            if (listRef.current) {
              if (active.scrollPosition !== undefined && active.scrollPosition > 0) {
                listRef.current.scrollTop = active.scrollPosition;
              } else {
                // 没有保存位置或位置为0，滚动到底部显示最新消息
                listRef.current.scrollTop = listRef.current.scrollHeight;
              }
            }
          }, 50);
        }
      }
      setSessionsLoaded(true);
    });
  }, []);

  const handleNewSession = useCallback(() => {
    const pluginName = getAiChatPluginName();
    const settings = getAiChatSettings(pluginName);
    const defaultModel = settings.selectedModelId;


    // 创建全新的会话，确保 ID 是新的
    const newSession = { ...createNewSession(), model: defaultModel };
    setCurrentSession(newSession);
    setMessages([
      {
        id: nowId(),
        role: "assistant",
        content: `${getTimeGreeting()}，新对话已开始，有什么可以帮你的吗？`,
        createdAt: Date.now(),
        localOnly: true,
      },
    ]);
    // 清理上下文
    contextStore.selected = [];
    // 清理 sessionStore 中的旧状态
    clearSessionStore();
    // 清除错误状态
    setLastError(null);
    // 重置闪卡状态
    setFlashcardMode(false);
    setPendingFlashcards([]);
    setFlashcardIndex(0);
    setFlashcardKeptCount(0);
    setFlashcardSkippedCount(0);
  }, [currentSession.id]);

  const handleSelectSession = useCallback(async (sessionId: string) => {
    const pluginName = getAiChatPluginName();
    const settings = getAiChatSettings(pluginName);
    const defaultModel = settings.selectedModelId;

    // 保存当前会话的滚动位置
    if (listRef.current && currentSession.id !== sessionId) {
      setCurrentSession((prev) => ({
        ...prev,
        scrollPosition: listRef.current?.scrollTop ?? 0,
      }));
    }

    // 加载完整会话数据（包含消息）
    const session = await loadFullSession(sessionId);
    if (!session) return;

    setCurrentSession({
      ...session,
      model: (session.model || "").trim() || defaultModel,
    });
    setMessages(session.messages.length > 0 ? session.messages : []);
    contextStore.selected = session.contexts || [];

    // 恢复闪卡状态
    if (session.flashcardState && session.flashcardState.cards.length > 0) {
      const state = session.flashcardState;
      if (state.currentIndex < state.cards.length) {
        setPendingFlashcards(state.cards as Flashcard[]);
        setFlashcardIndex(state.currentIndex);
        setFlashcardKeptCount(state.keptCount);
        setFlashcardSkippedCount(state.skippedCount);
        setFlashcardMode(true);
      } else {
        // 闪卡已完成，重置状态
        setFlashcardMode(false);
        setPendingFlashcards([]);
        setFlashcardIndex(0);
        setFlashcardKeptCount(0);
        setFlashcardSkippedCount(0);
      }
    } else {
      // 没有闪卡状态，重置
      setFlashcardMode(false);
      setPendingFlashcards([]);
      setFlashcardIndex(0);
      setFlashcardKeptCount(0);
      setFlashcardSkippedCount(0);
    }

    // 恢复目标会话的滚动位置
    // 使用 setTimeout 确保 DOM 渲染完成后再滚动
    // 如果没有保存的滚动位置，默认滚动到底部显示最新消息
    setTimeout(() => {
      if (listRef.current) {
        if (session.scrollPosition !== undefined && session.scrollPosition > 0) {
          listRef.current.scrollTop = session.scrollPosition;
        } else {
          // 没有保存位置或位置为0，滚动到底部
          listRef.current.scrollTop = listRef.current.scrollHeight;
        }
      }
    }, 50);
  }, [currentSession.id]);

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
    const data = await loadSessions();
    setSessions(data.sessions);
    // 如果当前会话被清理了，切换到剩余会话或创建新会话
    if (!data.sessions.find(s => s.id === currentSession.id)) {
      if (data.activeSessionId) {
        handleSelectSession(data.activeSessionId);
      } else {
        handleNewSession();
      }
    }
  }, [handleNewSession, currentSession.id, handleSelectSession]);

  // Toggle session pinned status
  const handleTogglePin = useCallback(async (sessionId: string) => {
    await toggleSessionPinned(sessionId);
    const data = await loadSessions();
    setSessions(data.sessions);
  }, []);

  // Toggle session favorited status
  const handleToggleFavorite = useCallback(async (sessionId: string) => {
    await toggleSessionFavorited(sessionId);
    const data = await loadSessions();
    setSessions(data.sessions);
  }, []);

  // Rename session
  const handleRenameSession = useCallback(async (sessionId: string, newTitle: string) => {
    await renameSession(sessionId, newTitle);
    const data = await loadSessions();
    setSessions(data.sessions);
    // Update current session title if it's the one being renamed
    if (currentSession.id === sessionId) {
      setCurrentSession((prev) => ({ ...prev, title: newTitle }));
    }
  }, [currentSession.id]);

  // Auto-cache session when messages or flashcard state change (debounced)
  const autoCacheTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const hasRealMessages = messages.some((m) => !m.localOnly);
    const hasFlashcards = flashcardMode && pendingFlashcards.length > 0;
    
    // 需要有真实消息或闪卡状态才保存
    if ((!hasRealMessages && !hasFlashcards) || !sessionsLoaded) return;

    // Debounce auto-cache to avoid too frequent saves
    if (autoCacheTimeoutRef.current) {
      clearTimeout(autoCacheTimeoutRef.current);
    }
    autoCacheTimeoutRef.current = setTimeout(async () => {
      const flashcardState = hasFlashcards ? {
        cards: pendingFlashcards,
        currentIndex: flashcardIndex,
        keptCount: flashcardKeptCount,
        skippedCount: flashcardSkippedCount,
      } : undefined;
      
      const sessionToCache: SavedSession = {
        ...currentSession,
        messages,
        contexts: [...contextSnap.selected],
        scrollPosition: listRef.current?.scrollTop ?? currentSession.scrollPosition,
        flashcardState,
      };
      await autoCacheSession(sessionToCache);
      const data = await loadSessions();
      setSessions(data.sessions);
    }, 1000); // 1 second debounce for faster flashcard state saving

    return () => {
      if (autoCacheTimeoutRef.current) {
        clearTimeout(autoCacheTimeoutRef.current);
      }
    };
  }, [messages, currentSession, sessionsLoaded, flashcardMode, pendingFlashcards, flashcardIndex, flashcardKeptCount, flashcardSkippedCount, contextSnap.selected]);

  // Sync state to session store for auto-save on close
  useEffect(() => {
    const hasRealMessages = messages.some((m) => !m.localOnly);
    if (hasRealMessages) {
      updateSessionStore(currentSession, messages, [...contextSnap.selected]);
    }
  }, [messages, currentSession, contextSnap.selected]);

  useEffect(() => {
    // 注入样式，但不返回清理函数，避免面板关闭时影响样式
    injectChatStyles();
  }, []);
  useEffect(() => () => { clearSessionStore(); }, []);
  useEffect(() => () => { if (abortRef.current) abortRef.current.abort(); }, []);
  useEffect(() => () => { cancelAutoScroll(); }, [cancelAutoScroll]);

  // Check Python server status on mount
  // ─────────────────────────────────────────────────────────────────────────
  // Scroll to Bottom Button Detection
  // **Feature: chat-ui-enhancement**
  // **Validates: Requirements 4.2, 4.3**
  // ─────────────────────────────────────────────────────────────────────────

  useEffect(() => {
    const listEl = listRef.current;
    if (!listEl) return;

    const handleScroll = () => {
      // Show button when user scrolls up more than 200px from bottom
      const distanceFromBottom = listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight;
      setShowScrollToBottom(distanceFromBottom > 200);
      // 更新 isNearBottomRef，用于决定流式输出时是否自动滚动
      // 阈值设为 100px，比按钮显示阈值小，避免用户刚滚动一点就停止自动滚动
      isNearBottomRef.current = distanceFromBottom < 100;
    };

    const handleUserScrollIntent = () => {
      cancelAutoScroll();
    };

    listEl.addEventListener("scroll", handleScroll, { passive: true });
    listEl.addEventListener("wheel", handleUserScrollIntent, { passive: true });
    listEl.addEventListener("touchstart", handleUserScrollIntent, { passive: true });
    listEl.addEventListener("touchmove", handleUserScrollIntent, { passive: true });
    listEl.addEventListener("pointerdown", handleUserScrollIntent);
    return () => {
      listEl.removeEventListener("scroll", handleScroll);
      listEl.removeEventListener("wheel", handleUserScrollIntent);
      listEl.removeEventListener("touchstart", handleUserScrollIntent);
      listEl.removeEventListener("touchmove", handleUserScrollIntent);
      listEl.removeEventListener("pointerdown", handleUserScrollIntent);
    };
  }, [cancelAutoScroll]);

  const handleScrollToBottom = useCallback(() => {
    scrollToBottom();
    setShowScrollToBottom(false);
    // 点击滚动到底部按钮后，恢复自动滚动
    isNearBottomRef.current = true;
  }, [scrollToBottom]);

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
  // Message Selection Mode (for batch save)
  // ─────────────────────────────────────────────────────────────────────────

  const handleToggleSelectionMode = useCallback(() => {
    setSelectionMode(prev => {
      if (prev) {
        // 退出选择模式时清空选中
        setSelectedMessageIds(new Set());
      }
      return !prev;
    });
  }, []);

  const handleToggleMessageSelection = useCallback((messageId: string) => {
    setSelectedMessageIds(prev => {
      const next = new Set(prev);
      if (next.has(messageId)) {
        next.delete(messageId);
      } else {
        next.add(messageId);
      }
      return next;
    });
  }, []);

  const handleSaveSelectedMessages = useCallback(async () => {
    if (selectedMessageIds.size === 0) {
      orca.notify("warn", "请先选择要保存的消息");
      return;
    }
    
    // 按原始顺序获取选中的消息
    const selectedMessages = messages.filter(m => selectedMessageIds.has(m.id));
    
    const result = await saveMessagesToJournal(selectedMessages, undefined, currentSession.model);
    if (result.success) {
      orca.notify("success", result.message);
      // 保存成功后退出选择模式
      setSelectionMode(false);
      setSelectedMessageIds(new Set());
    } else {
      orca.notify("error", result.message);
    }
  }, [selectedMessageIds, messages, currentSession.model]);

  // ─────────────────────────────────────────────────────────────────────────
  // Chat Send Logic
  // ─────────────────────────────────────────────────────────────────────────

  async function handleSend(content: string, files?: FileRef[], historyOverride?: Message[]) {
    if (!content && (!files || files.length === 0)) return;
    
    // ─────────────────────────────────────────────────────────────────────
    // Todoist 命令拦截（不发送给 AI，直接执行）
    // ─────────────────────────────────────────────────────────────────────
    const trimmedContent = content.trim();

    // /todoist - 查看今日任务
    if (trimmedContent === "/todoist" || trimmedContent.startsWith("/todoist ")) {
      todoistModalStore.viewMode = "today";
      todoistModalStore.showTaskList = true;
      return;
    }
    
    // /todoist-add - 添加任务
    if (trimmedContent === "/todoist-add" || trimmedContent.startsWith("/todoist-add ")) {
      const taskContent = trimmedContent.replace(/^\/todoist-add\s*/, "").trim();
      todoistModalStore.addTaskContent = taskContent;
      todoistModalStore.showAddTask = true;
      return;
    }
    
    // /todoist-done - 标记完成
    if (trimmedContent === "/todoist-done" || trimmedContent.startsWith("/todoist-done ")) {
      todoistModalStore.showTaskList = true;
      return;
    }
    
    // /todoist-all - 查看全部任务
    if (trimmedContent === "/todoist-all" || trimmedContent.startsWith("/todoist-all ")) {
      todoistModalStore.viewMode = "all";
      todoistModalStore.showTaskList = true;
      return;
    }
    
    // /todoist-ai - 启用 Todoist AI 工具模式（不拦截，继续发送给 AI）
    let enableTodoistTools = false;
    if (trimmedContent.startsWith("/todoist-ai")) {
      enableTodoistTools = true;
    }
    
    // 如果正在生成，先停止当前生成
    if (sending) {
      if (abortRef.current) abortRef.current.abort();
      // 等待一小段时间让 abort 生效
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // /skill - 生成技能草稿（不发送给 AI 对话流）
    if (trimmedContent === "/skill" || trimmedContent.startsWith("/skill ")) {
      const requestText = trimmedContent.replace(/^\/skill\s*/, "").trim();
      await handleSkillSlashCommand(content, requestText);
      return;
    }

	    const pluginName = getAiChatPluginName();
	    const settings = getAiChatSettings(pluginName);
	    const model = (currentSession.model || "").trim() || settings.selectedModelId;
	    const runtimeConfig = getModelRuntimeConfig(settings, model);
	    try {
	      await ensureMcpServersReady();
	    } catch (err) {
	      console.warn("[handleSend] MCP readiness check failed:", err);
	    }
	    // 0 表示不设置固定工具轮数上限，依靠重复/错误/取消等状态退出（Codex 式 agent loop）。
	    const toolRoundLimit = runtimeConfig.maxToolRounds;
	    const toolRoundController = createToolRoundLimit(toolRoundLimit);

	    // 加载已启用的技能，注入系统提示词让 AI 自动识别并调用
	    const enabledSkills: Array<{ name: string; description: string; instruction: string }> = [];
	    try {
	      const allSkillRefs = await listSkills();
	      for (const ref of allSkillRefs) {
	        const skill = await getSkill(ref.id, ref.scope === "global");
	        if (skill && skill.mode !== "disabled") {
	          enabledSkills.push({
	            name: skill.name || skill.id,
	            description: skill.description || "",
	            instruction: skill.instruction,
	          });
	        }
	      }
	    } catch (err) {
	      console.warn("[handleSend] Failed to load skills:", err);
	    }

	    // 自动触发检测：高置信度匹配时自动激活技能
	    let autoActivatedSkill: { name: string; instruction: string } | undefined;
	    if (!content.startsWith("#") && !content.startsWith("/")) {
	      try {
	        const matched = await getAutoTriggerSkill(content, 0.5);
	        if (matched) {
	          autoActivatedSkill = {
	            name: matched.name,
	            instruction: matched.instruction,
	          };
	          console.log(`[handleSend] Auto-activated skill: ${matched.name}`);
	        }
	      } catch (err) {
	        console.warn("[handleSend] Auto-trigger check failed:", err);
	      }
	    }

	    // 系统提示词
	    let systemPrompt = buildDynamicSystemPrompt({
      hasMcpTools: getDiscoveredTools().length > 0,
      hasTodoistTools: enableTodoistTools,
      hasWebSearch: isWebSearchEnabled(),
      hasDraggedContext: contextStore.selected.length > 0,
      skills: enabledSkills,
      autoActivatedSkill,
      repoId: getCurrentRepoId(),
    });

	    // 检测用户指令并追加格式要求
	    let processedContent = content;
	    
	    // Skill 加载逻辑：如果用户输入 #skillname，尝试加载 Skill
	    if (content.startsWith("#")) {
	      const spaceIndex = content.indexOf(" ");
	      const skillName = spaceIndex > 0 ? content.slice(1, spaceIndex) : content.slice(1);
	      const restText = spaceIndex > 0 ? content.slice(spaceIndex + 1).trim() : "";
	      
	      // 尝试加载 Skill
	      try {
	        const { listSkills, getSkill } = await import("../services/ai/skills-manager");
	        const allSkills = await listSkills();
	        
		// 查找匹配的 Skill（优先按名称匹配，其次按 ID）
		const skillRef = allSkills.find(s => s.name === skillName) || allSkills.find(s => s.id === skillName);

		let foundSkill = null;
		if (skillRef) {
		  foundSkill = await getSkill(skillRef.id, skillRef.scope === "global");
		}
	        
	        if (foundSkill) {
	          // 使用现有的 requestSkillConfirm 机制显示确认对话框
	          const confirmed = await requestSkillConfirm(foundSkill);
	          
	          if (!confirmed) {
	            // 用户取消，不继续执行
	            return;
	          }
	          
	          // 用户确认，加载 Skill 指令
	          processedContent = restText ? `${foundSkill.instruction}\n\n## 用户输入\n${restText}` : foundSkill.instruction;
	        }
	      } catch (err) {
	        console.error("[handleSend] Failed to load skill:", err);
	      }
	    }
	    
	    // Commands 加载逻辑：如果用户输入 /commandname，尝试加载命令文件
	    if (content.startsWith("/")) {
	      const spaceIndex = content.indexOf(" ");
	      const commandName = spaceIndex > 0 ? content.slice(1, spaceIndex) : content.slice(1);
	      const restText = spaceIndex > 0 ? content.slice(spaceIndex + 1).trim() : "";
	      
	      // 检查是否是内置 UI 命令（如 /table, /brief, /localgraph 等）
	      const builtinCommands = [
	        "table", "timeline", "compare", "list", "steps", "brief", "detail", "summary", "eli5", "formal", "diagram",
	        "localgraph", "card", "skill",
	        "todoist", "todoist-all", "todoist-add", "todoist-done", "todoist-ai"
	      ];
	      const isBuiltinCommand = builtinCommands.includes(commandName);
	      
	      if (!isBuiltinCommand) {
	        // 尝试从 Commands 文件夹加载命令
	        const { loadCommand } = await import("../services/commands-loader");
	        const commandContent = await loadCommand(commandName);
	        if (commandContent) {
	          // 拼接命令内容和用户输入（发送给 AI）
	          processedContent = restText ? `${commandContent}\n\n${restText}` : commandContent;
	        }
	      }
	    }
	    
	    // /timeline - 时间线格式
	    const wantsTimelineFormat = /\/timeline|用\s*timeline\s*格式展示|timeline\s*格式|时间线格式/.test(content);
	    if (wantsTimelineFormat) {
	      const timelineRequest = processedContent
	        .replace(/\/timeline|用\s*timeline\s*格式展示|timeline\s*格式|时间线格式/g, "")
	        .trim();
	      if (timelineRequest) {
	        processedContent = timelineRequest;
	      } else {
	        const priorAssistantMessage = [...(historyOverride || messages)]
	          .reverse()
	          .find((message) => message.role === "assistant" && !message.localOnly && message.content.trim());
	        processedContent = priorAssistantMessage
	          ? `请把下面这段内容重新整理为 timeline 格式，不要重新问候，不要询问我要展示什么。\n\n${sanitizeContent(priorAssistantMessage.content)}`
	          : "请用 timeline 格式展示最近一次可用的对话内容；如果没有可用内容，简短询问需要展示的日期或主题。";
	      }
	      systemPrompt += `\n\n【格式要求 - 时间线】用户要求使用时间线格式展示结果。
格式：
\`\`\`timeline
日期时间 | [标题](orca-block:id) | 详细描述 | 类型
\`\`\`
要求：
1. 每行一个事件，用 | 分隔：日期时间 | 标题 | 描述 | 类型
2. 日期时间格式：YYYY-MM-DD HH:mm（如 2024-01-15 14:30），如果没有具体时间可以只写日期
3. 标题使用 [标题](orca-block:id) 格式，让用户可以点击跳转
4. 描述要详细，包含关键内容摘要
5. 类型用中文，可选值：工作、娱乐、学习、生活、健康、旅行、财务、社交
6. 根据内容智能判断类型，如日记默认生活，任务默认工作
7. 按时间顺序排列
8. 最终回答必须包含一个 fenced code block，语言名必须是 timeline，不要用普通 Markdown 列表替代：
\`\`\`timeline
日期时间 | 标题 | 描述 | 类型
\`\`\``;
	    }
	    
	    // /brief - 简洁回答
	    if (content.includes("/brief")) {
	      processedContent = processedContent.replace(/\/brief/g, "").trim();
	      systemPrompt += `\n\n【回答风格】用户要求简洁回答。请：
1. 直接给出答案，不要铺垫
2. 使用短句，避免长段落
3. 要点用列表呈现
4. 省略不必要的解释和背景`;
	    }
	    
	    // /detail - 详细回答
	    if (content.includes("/detail")) {
	      processedContent = processedContent.replace(/\/detail/g, "").trim();
	      systemPrompt += `\n\n【回答风格】用户要求详细回答。请：
1. 充分展开说明，提供完整信息
2. 包含背景、原因、细节
3. 举例说明关键点
4. 如有相关内容，主动补充`;
	    }
	    
	    // /table - 表格格式
	    if (content.includes("/table")) {
	      processedContent = processedContent.replace(/\/table/g, "").trim();
	      systemPrompt += `\n\n【格式要求 - 表格】用户要求使用表格格式展示结果。请：
1. 使用 Markdown 表格格式
2. 第一行为表头，描述各列含义
3. 合理设计列，让信息清晰对比
4. 如有链接，使用 [标题](orca-block:id) 格式`;
	    }
	    
	    // /summary - 总结模式
	    if (content.includes("/summary")) {
	      processedContent = processedContent.replace(/\/summary/g, "").trim();
	      systemPrompt += `\n\n【回答风格 - 总结】用户要求总结模式。请：
1. 提炼核心要点，去除冗余信息
2. 使用结构化格式（标题+要点）
3. 每个要点一句话概括
4. 最后给出一句话总结`;
	    }
	    
	    // /compare - 对比模式
	    if (content.includes("/compare")) {
	      processedContent = processedContent.replace(/\/compare/g, "").trim();
	      systemPrompt += `\n\n【格式要求 - 对比】用户要求对比展示。请使用以下格式：
\`\`\`compare
左侧标题 | 右侧标题
---
左侧内容第1点 | 右侧内容第1点
左侧内容第2点 | 右侧内容第2点
左侧内容第3点 | 右侧内容第3点
\`\`\`
要求：
1. 第一行是两边的标题，用 | 分隔
2. 第二行是分隔符 ---
3. 后续每行是对应的对比项，用 | 分隔
4. 对比项要一一对应，便于比较`;
	    }

	    // /list - 列表格式
	    if (content.includes("/list")) {
	      processedContent = processedContent.replace(/\/list/g, "").trim();
	      systemPrompt += `\n\n【格式要求 - 列表】用户要求使用列表格式展示结果。请：
1. 使用有序或无序列表呈现信息
2. 每个列表项简洁明了
3. 相关项目可以使用嵌套列表
4. 如有链接，使用 [标题](orca-block:id) 格式`;
	    }

	    // /steps - 步骤格式
	    if (content.includes("/steps")) {
	      processedContent = processedContent.replace(/\/steps/g, "").trim();
	      systemPrompt += `\n\n【格式要求 - 步骤】用户要求分步骤展示操作流程。请：
1. 使用有序列表，每步一个编号
2. 每步标题简洁，后面可以补充说明
3. 步骤之间有清晰的逻辑顺序
4. 如有注意事项，在相关步骤后用缩进说明`;
	    }

	    // /eli5 - 简单易懂解释
	    if (content.includes("/eli5")) {
	      processedContent = processedContent.replace(/\/eli5/g, "").trim();
	      systemPrompt += `\n\n【回答风格 - 简单易懂】用户要求用简单易懂的方式解释。请：
1. 避免专业术语，用日常用语
2. 多用比喻和类比帮助理解
3. 从基础概念讲起，循序渐进
4. 举生活中的例子说明`;
	    }

	    // /formal - 正式专业语气
	    if (content.includes("/formal")) {
	      processedContent = processedContent.replace(/\/formal/g, "").trim();
	      systemPrompt += `\n\n【回答风格 - 正式专业】用户要求使用正式专业的语气回答。请：
1. 使用规范的书面语言
2. 结构清晰，逻辑严谨
3. 适当使用专业术语
4. 保持客观中立的语气`;
	    }

	    // /diagram - 流程图/示意图
	    if (content.includes("/diagram")) {
	      processedContent = processedContent.replace(/\/diagram/g, "").trim();
	      systemPrompt += `\n\n【格式要求 - 流程图】用户要求生成流程图或示意图。请使用 Mermaid 语法：
\`\`\`mermaid
graph TD
    A[开始] --> B{判断条件}
    B -->|是| C[执行操作1]
    B -->|否| D[执行操作2]
    C --> E[结束]
    D --> E
\`\`\`
要求：
1. 使用 mermaid 代码块
2. 根据内容选择合适的图表类型（flowchart、sequence 等）
3. 节点文字简洁明了
4. 连线标注清晰`;
	    }

	    // /todoist-ai - Todoist AI 模式
	    if (content.includes("/todoist-ai")) {
	      processedContent = processedContent.replace(/\/todoist-ai/g, "").trim();
	      systemPrompt += `\n\n【Todoist 任务管理模式】
你现在可以使用 Todoist 工具来帮助用户管理任务：
- todoist_get_tasks: 获取任务列表（today=今日，all=全部）
- todoist_create_task: 创建新任务（支持自然语言日期如"明天下午3点"）
- todoist_complete_task: 标记任务完成

使用指南：
1. 用户问任务相关问题时，先调用 todoist_get_tasks 获取任务列表
2. 创建任务时，从用户的话中提取任务内容和截止日期
3. 完成任务时，需要先获取任务列表找到对应的 task_id
4. 回复时用友好的语气，告诉用户操作结果`;
	    }

	    // /localgraph - 链接关系图谱（直接渲染图谱，不走 AI）
	    if (content.includes("/localgraph")) {
	      const graphQuery = processedContent.replace(/\/localgraph/g, "").trim();
	      const cleanedQuery = graphQuery.replace(/^(显示|查看|分析|的)?\s*/g, "").replace(/\s*(的)?(链接)?(关系)?(图谱)?$/g, "").trim();
	      
	      // 添加用户消息
	      const userMsg: Message = { 
	        id: nowId(), 
	        role: "user", 
	        content, 
	        createdAt: Date.now(),
	      };
	      setMessages((prev) => [...prev, userMsg]);
	      
	      // 直接获取 blockId 并渲染图谱
	      (async () => {
	        let blockId: number | null = null;
	        let pageName: string | null = null;
	        
	        if (cleanedQuery) {
	          // 检查是否是 blockId 格式：纯数字、blockid 123、blockid:123
	          const blockIdMatch = cleanedQuery.match(/^(?:blockid[:\s]*)?(\d+)$/i);
	          if (blockIdMatch) {
	            blockId = parseInt(blockIdMatch[1], 10);
	          } else {
	            // 否则当作页面名称，需要查找对应的 blockId
	            pageName = cleanedQuery;
            try {
              const block = await orca.invokeBackend("get-block-by-alias", cleanedQuery);
              if (block && block.id) {
                blockId = block.id;
              }
            } catch (err) {
            }
          }
	        } else {
	          // 使用当前打开的页面
	          try {
	            const activePanel = orca.state.activePanel;
	            if (activePanel && activePanel !== uiStore.aiChatPanelId) {
	              const vp = orca.nav.findViewPanel(activePanel, orca.state.panels);
	              if (vp?.view === "block" && vp.viewArgs?.blockId) {
	                blockId = vp.viewArgs.blockId;
	              }
	            }
	          } catch {}
	        }
	        
	        if (!blockId) {
	          const errorMsg = pageName 
	            ? `找不到页面「${pageName}」，请检查名称是否正确`
	            : "请先选择一个页面，或指定页面名称，例如：/localgraph 阿拉丁";
	          const assistantMsg: Message = {
	            id: nowId(),
	            role: "assistant",
	            content: errorMsg,
	            createdAt: Date.now(),
	          };
	          setMessages((prev) => [...prev, assistantMsg]);
	          return;
	        }
	        
	        // 直接输出 localgraph 代码块格式，让 MarkdownMessage 渲染图谱
	        const graphContent = "```localgraph\n" + blockId + "\n```";
	        const assistantMsg: Message = {
	          id: nowId(),
	          role: "assistant",
	          content: graphContent,
	          createdAt: Date.now(),
	        };
	        setMessages((prev) => [...prev, assistantMsg]);
	        queueMicrotask(scrollToBottom);
	      })();
	      
	      return; // 直接返回，不走 AI
	    }

	    // /card - 闪卡生成模式（使用工具调用强制格式）
	    const isFlashcardMode = content.includes("/card") || content.includes("帮我构建闪卡") || content.includes("生成闪卡");
	    if (isFlashcardMode) {
	      // 提取用户指定的主题（如果有）
	      let cardTopic = processedContent
	        .replace(/\/card/g, "")
	        .replace(/帮我构建闪卡/g, "")
	        .replace(/生成闪卡/g, "")
	        .trim();
	      
	      // 添加用户消息
	      const userMsg: Message = { 
	        id: nowId(), 
	        role: "user", 
	        content, 
	        createdAt: Date.now(),
	      };
	      setMessages((prev) => [...prev, userMsg]);
	      
	      // 设置发送状态，显示加载中
	      setSending(true);
	      
	      // 构建闪卡生成的系统提示词
	      const flashcardSystemPrompt = `你是一个闪卡生成助手。当用户要求生成闪卡时，你必须调用 generateFlashcards 工具。

闪卡生成原则：
- 简洁：答案≤20字为佳
- 5-8 张卡片
- 答案是结论，不是解释
- 选择题需要 2-4 个选项，标记正确答案

⚠️ 重要：必须调用 generateFlashcards 工具，不要用文本回复！`;
	      
	      // 用户请求消息
	      let flashcardPrompt = cardTopic 
	        ? `请根据我们之前的对话，生成关于「${cardTopic}」的闪卡。调用 generateFlashcards 工具生成。`
	        : "请根据我们的对话内容生成闪卡。调用 generateFlashcards 工具生成。";
	      
	      // 构建对话历史
	      const historyMessages = messages.filter((m) => !m.localOnly);
	      const flashcardRequestMsg: Message = { 
	        id: nowId(), 
	        role: "user", 
	        content: flashcardPrompt, 
	        createdAt: Date.now() 
	      };
	      const conversationForFlashcard: Message[] = [...historyMessages, flashcardRequestMsg];
	      
	      const model = (currentSession.model || "").trim() || settings.selectedModelId;
	      const memoryText = memoryStore.getFullMemoryText();
	      
	      // 构建上下文
	      let contextText = "";
	      try {
	        const contexts = contextStore.selected;
	        if (contexts.length) {
	          const result = await buildContextForSend(contexts, { maxChars: settings.maxContextChars });
	          contextText = result.text;
	        }
	      } catch {}
	      
	      // 使用专用的闪卡工具（不在普通 TOOLS 列表中）
      const { standard: apiMessages, fallback: apiMessagesFallback } = await buildConversationMessages({
	        messages: conversationForFlashcard,
	        systemPrompt: flashcardSystemPrompt,
	        contextText,
	        customMemory: memoryText,
	        chatMode: "agent", // 使用工具模式
	        modelId: model,
	      });
	      
	      // 获取模型特定的 API 配置
	      const apiConfig = getModelApiConfig(settings, model);
	      
	      const aborter = new AbortController();
	      abortRef.current = aborter;
	      
	      try {
	        let toolCallResult: any = null;
	        let textContent = "";
	        let mergedToolCalls: ToolCallInfo[] = [];
	        
	        // Stream tool calls and content, then process the final tool args.
          for await (const chunk of streamChatWithRetry(
            {
              apiUrl: apiConfig.apiUrl,
              apiKey: apiConfig.apiKey,
              model,
              protocol: apiConfig.protocol,
              anthropicApiPath: apiConfig.anthropicApiPath,
              temperature: runtimeConfig.temperature,
              maxTokens: runtimeConfig.maxTokens,
              signal: aborter.signal,
              tools: [FLASHCARD_TOOL],
            },
	          apiMessages,
	          apiMessagesFallback || apiMessages,
	        )) {
	          if (chunk.type === "content") {
	            textContent += chunk.content;
	          } else if (chunk.type === "tool_calls" && chunk.toolCalls) {
	            mergedToolCalls = chunk.toolCalls;
	          } else if (chunk.type === "done") {
	            if (!textContent && chunk.result.content) {
	              textContent = chunk.result.content;
	            }
	            if (chunk.result.toolCalls?.length) {
	              mergedToolCalls = chunk.result.toolCalls;
	            }
	          }
	        }
	        
	        if (!toolCallResult && mergedToolCalls.length > 0) {
	          for (const tc of mergedToolCalls) {
	            if (tc.function.name === "generateFlashcards") {
	              try {
	                const args = typeof tc.function.arguments === "string"
	                  ? JSON.parse(tc.function.arguments)
	                  : tc.function.arguments;
	                const resultStr = await executeTool("generateFlashcards", args);
	                toolCallResult = JSON.parse(resultStr);
	              } catch (e) {
	              }
	            }
	          }
	        }
	        
	        // 检查工具调用结果
	        if (toolCallResult && toolCallResult.success && toolCallResult.cards) {
	          // 工具调用成功，进入闪卡界面
	          setPendingFlashcards(toolCallResult.cards);
	          setFlashcardMode(true);
	        } else if (textContent) {
	          // 没有工具调用，尝试从文本解析（兼容不支持工具的模型）
	          const { parseFlashcards } = await import("../services/flashcard-service");
	          const cards = parseFlashcards(textContent);
	          if (cards.length > 0) {
	            setPendingFlashcards(cards);
	            setFlashcardMode(true);
	          } else {
	            // 显示 AI 的文本回复
	            const assistantMsg: Message = {
	              id: nowId(),
	              role: "assistant",
	              content: textContent || "抱歉，无法生成闪卡。请提供更多上下文或指定主题。",
	              createdAt: Date.now(),
	            };
	            setMessages((prev) => [...prev, assistantMsg]);
	          }
	        } else {
	          // 既没有工具调用也没有文本
	          const assistantMsg: Message = {
	            id: nowId(),
	            role: "assistant",
	            content: "抱歉，无法生成闪卡。请提供更多上下文或指定主题。",
	            createdAt: Date.now(),
	          };
	          setMessages((prev) => [...prev, assistantMsg]);
	        }
	      } catch (err: any) {
	        const msg = String(err?.message ?? err ?? "生成闪卡失败");
	        orca.notify("error", msg);
	        const assistantMsg: Message = {
	          id: nowId(),
	          role: "assistant",
	          content: `生成闪卡失败: ${msg}`,
	          createdAt: Date.now(),
	        };
	        setMessages((prev) => [...prev, assistantMsg]);
	      } finally {
	        setSending(false);
	        if (abortRef.current === aborter) abortRef.current = null;
	      }
	      
	      return; // 直接返回，不走常规 AI 流程
	    }

	    // Get current chat mode for tool handling
	    const currentChatMode = getMode();
	    const includeTools = currentChatMode !== 'ask';

	    const validationError = validateCurrentConfig(settings);
	    if (validationError) {
	      orca.notify("warn", validationError);
      return;
    }

    setSending(true);

    // 获取高优先级上下文（拖入的块）用于显示
    const highPrioritySourceContexts = contextStore.selected.filter(c => (c.priority ?? 0) > 0);
    const contextPreviewMap = new Map<string, string>();
    await Promise.all(highPrioritySourceContexts.map(async (ctx) => {
      const key = contextKey(ctx);
      try {
        const result = await buildContextForSend([ctx], {
          maxChars: Math.min(settings.maxContextChars || 60_000, 8_000),
          maxBlocks: 120,
        });
        contextPreviewMap.set(key, result.text);
      } catch (err: any) {
        contextPreviewMap.set(key, `Context preview failed: ${String(err?.message ?? err ?? "unknown error")}`);
      }
    }));

    const highPriorityContexts = highPrioritySourceContexts.map(c => ({
        title: c.kind === 'tag' ? `#${c.tag}` : c.title,
        kind: c.kind,
        blockId: c.kind === 'page' ? c.rootBlockId : c.kind === 'block' ? c.blockId : undefined,
        preview: contextPreviewMap.get(contextKey(c)),
      }));

    // 先添加用户消息到列表
    const userMsg: Message = { 
      id: nowId(), 
      role: "user", 
      content, 
      createdAt: Date.now(),
      files: files && files.length > 0 ? files : undefined,
      contextRefs: highPriorityContexts.length > 0 ? highPriorityContexts : undefined,
    };

    // Use override if provided (for regeneration), otherwise append to current state
    if (historyOverride) {
        setMessages([...historyOverride, userMsg]);
    } else {
        setMessages((prev) => [...prev, userMsg]);
    }

    // 自动激活技能时显示系统通知
    if (autoActivatedSkill) {
      setMessages((prev) => [
        ...prev,
        {
          id: nowId(),
          role: "assistant" as const,
          content: `📋 已激活技能: **${autoActivatedSkill.name}**`,
          createdAt: Date.now(),
          localOnly: true,
        },
      ]);
    }

    // 用户发送消息时，重置为自动滚动状态并滚动到底部
    isNearBottomRef.current = true;
    queueMicrotask(scrollToBottom);

    // ─────────────────────────────────────────────────────────────────────────
    // 多模型并行模式处理
    // ─────────────────────────────────────────────────────────────────────────
    if (multiModelStore.enabled && multiModelStore.selectedModels.length >= 2) {
      setIsMultiModelMode(true);
      const selectedModels = [...multiModelStore.selectedModels];
      
      // 初始化多模型响应状态
      const initialResponses = createInitialResponses(selectedModels);
      setMultiModelResponses(initialResponses);
      
      const aborter = new AbortController();
      abortRef.current = aborter;
      
      try {
        // 构建上下文
        let contextText = "";
        try {
          const contexts = contextStore.selected;
          if (contexts.length) {
            const result = await buildContextForSend(contexts, { maxChars: settings.maxContextChars });
            contextText = result.text;
          }
        } catch {}
        
        const memoryText = memoryStore.getFullMemoryText();
        const baseMessages = historyOverride || messages;
        
        const conversation: Message[] = [...baseMessages.filter((m) => !m.localOnly), {
          ...userMsg,
          content: processedContent,
        }];
        
        // 构建 API 消息（不包含工具，多模型模式下简化处理）
        const { standard: apiMessages, fallback: apiMessagesFallback } = await buildConversationMessages({
          messages: conversation,
          systemPrompt,
          contextText,
          customMemory: memoryText,
          chatMode: "ask", // 多模型模式下不使用工具
          // 多模型模式不传 modelId，因为每个模型都不同
        });
        
        // 并行流式请求所有模型
        for await (const update of streamMultiModelChat({
          modelKeys: selectedModels,
          messages: apiMessages,
          fallbackMessages: apiMessagesFallback,
          signal: aborter.signal,
        })) {
          setMultiModelResponses(prev => updateModelResponse(prev, update));
        }
        
      } catch (err: any) {
        const isAbort = String(err?.name ?? "") === "AbortError";
        if (!isAbort) {
          orca.notify("error", String(err?.message ?? err ?? "多模型请求失败"));
        }
      } finally {
        if (abortRef.current === aborter) abortRef.current = null;
        setSending(false);
      }
      
      return; // 多模型模式处理完成，不走单模型流程
    }
    // ─────────────────────────────────────────────────────────────────────────

    const userMsgForApi: Message = {
      id: userMsg.id, 
      role: "user", 
      content: processedContent, 
      createdAt: userMsg.createdAt,
      files: userMsg.files,
    };

    const aborter = new AbortController();
    abortRef.current = aborter;

    try {
      // Build context (now returns text + assets)
      let contextText = "";
      let contextAssets: FileRef[] = [];
      try {
        const contexts = contextStore.selected;
        if (contexts.length) {
          const result = await buildContextForSend(contexts, { maxChars: settings.maxContextChars });
          contextText = result.text;
          contextAssets = result.assets;
        }
      } catch (err: any) {
        orca.notify("warn", `Context build failed: ${String(err?.message ?? err ?? "unknown error")}`);
      }

      // Maintain an in-memory conversation so multi-round tool calls include prior tool results.
      // Use historyOverride if available to build conversation
      const baseMessages = historyOverride || messages;
      
      // Merge context assets with user message files
      const userMsgWithContextAssets: Message = {
        ...userMsgForApi,
        files: [
          ...(userMsgForApi.files || []),
          ...contextAssets,
        ].length > 0 ? [
          ...(userMsgForApi.files || []),
          ...contextAssets,
        ] : undefined,
      };
      
      const conversation: Message[] = [...baseMessages.filter((m) => !m.localOnly), userMsgWithContextAssets];

      let aggregatedSearchResults: WebSearchSource[] = [];
      const mergeSearchResults = (incoming: WebSearchSource[]) => {
        if (!incoming.length) return;
        const seen = new Set(aggregatedSearchResults.map((r) => r.url));
        incoming.forEach((result) => {
          if (!result.url || seen.has(result.url)) return;
          seen.add(result.url);
          aggregatedSearchResults.push(result);
        });
      };
      const captureSearchResults = (toolMessages: Message[]) => {
        if (!toolMessages.length) return;
        const toolMap = new Map<string, { content: string; name: string }>();
        toolMessages.forEach((m) => {
          if (m.tool_call_id) {
            toolMap.set(m.tool_call_id, { content: m.content, name: m.name || "" });
          }
        });
        const results = normalizeWebSearchResults(extractSearchResultsFromToolResults(toolMap));
        mergeSearchResults(results);
      };
      const getSearchResultsForMessage = () => (
        aggregatedSearchResults.length > 0 ? aggregatedSearchResults : undefined
      );
      const isToolErrorResult = (message: Message) => {
        const content = (message.content || "").trim();
        return /^Error[:：]/i.test(content)
          || /^Unknown tool[:：]/i.test(content)
          || /^Tool not found[:：]/i.test(content)
          || content.includes("Invalid JSON in tool arguments")
          || content.includes("Tool execution timed out")
          || content.includes("Repeated tool call skipped")
          || content.includes("用户拒绝执行");
      };

      const buildToolContractSystemPrompt = (
        basePrompt: string,
        availableTools: Array<{ function: { name: string } }> | undefined,
      ) => {
        if (!availableTools?.length) return basePrompt;
        const names = availableTools
          .map((tool) => tool.function.name)
          .filter(Boolean)
          .sort();
        const listed = names.join("\n");
        const mcpNames = names.filter((name) => name.startsWith("mcp__"));
        const orcaNoteNames = mcpNames.filter((name) => name.startsWith("mcp__orca-note__"));
        const mcpGuidance = mcpNames.length
          ? `

## MCP Tool Routing
- MCP tools in the allowlist are available external tools. Do not claim MCP tools are unavailable when an allowlisted mcp__ name matches the task.
- For Orca Note notes, journals, pages, blocks, tags, timeline extraction, or local repository content, prefer the matching mcp__orca-note__* tool over skill_* tools.
- Copy the complete MCP tool name exactly, including server prefix and any suffix. Do not add "s", change singular/plural, translate, abbreviate, or infer a missing tool name.
- If no allowlisted tool matches the requested action, answer directly instead of inventing a function name.
${orcaNoteNames.length ? `\nAvailable Orca Note MCP tools:\n${orcaNoteNames.join("\n")}` : ""}`
          : "";
        return `${basePrompt}

## Tool Name Contract
When calling a tool, the function name must be copied exactly from this allowlist. Do not invent, translate, pluralize, abbreviate, or change punctuation in tool names. MCP tools are especially strict: one character difference means a different tool.

${listed}${mcpGuidance}`;
      };

      const buildToolRecoverySystemPrompt = (basePrompt: string, reason: string) => `${basePrompt}

## Tool Recovery
Reason: ${reason}

Do not call any more tools in this response. Do not output DSML, XML, <invoke>, <parameter>, <tool_call>, <tool_calls>, or <function_calls> markup. Use the available conversation and tool results/errors to answer the user directly. If the requested action could not be completed, say that plainly and give the best useful next step.`;

      const buildEmptyToolRecoveryText = (reason: string, toolMessages: Message[]) => {
        const errorSummary = toolMessages
          .filter(isToolErrorResult)
          .map((m) => (m.content || "").split("\n")[0])
          .filter(Boolean)
          .slice(0, 3)
          .join("\n");
        return [
          `工具调用没有成功完成，我已停止继续调用工具。原因：${reason}`,
          errorSummary ? `\n${sanitizeContent(errorSummary)}` : "",
          "\n请检查工具是否已连接、工具名是否仍然存在，或换一种更明确的说法重试。",
        ].join("").trim();
      };

      // Stream initial response with timeout protection
      let currentContent = "";
      let currentReasoning = "";
      let toolCalls: ToolCallInfo[] = [];
      let reasoningMessageId: string | null = null;
      let reasoningCreatedAt: number | null = null;

      // Get memory text for injection based on current injection mode
      // Uses getFullMemoryText which combines portrait (higher priority) + unextracted memories
      const memoryText = memoryStore.getFullMemoryText();

      // 获取模型特定的 API 配置
      const apiConfig = getModelApiConfig(settings, model);

      // 根据是否有拖入的块来选择工具列表
      // 有拖入块时禁用搜索类工具，强制 AI 使用已提供的上下文
      const hasHighPriorityContext = highPriorityContexts.length > 0;

      let baseTools = hasHighPriorityContext
        ? getToolsForDraggedContext()
        : getTools(false, enableTodoistTools);

      // 合并技能工具：将已启用的技能注册为 function calling 工具
      try {
        const skillTools = await getSkillToolsAsync();
        if (skillTools.length > 0) {
          baseTools = [...baseTools, ...skillTools];
          console.log(`[AiChatPanel] 已注册 ${skillTools.length} 个技能工具`);
        }
      } catch (err) {
        console.warn("[AiChatPanel] 加载技能工具失败:", err);
      }

      const filteredTools = baseTools.filter(tool => !isToolDisabled(tool.function.name));
      
      // 检查模型是否支持原生 function calling
      const supportsTools = modelSupportsTools(settings, model);
      
      // 调试日志：显示加载的工具数量
      if (filteredTools.length > 0) {
        if (supportsTools) {
          console.log(`[AiChatPanel] Tool-as-Skill 架构: ${filteredTools.length} 个工具`);
        } else {
          console.log(`[AiChatPanel] 模型 ${model} 不支持 tools 能力，跳过工具加载`);
        }
      }
      // 只有当模型支持 tools 时才传递工具，避免不支持的模型输出 XML 格式
      const toolsToUse = includeTools && supportsTools && filteredTools.length > 0 ? filteredTools : undefined;
      const availableExecutionTools = includeTools ? filteredTools : [];

      const toolAwareSystemPrompt = buildToolContractSystemPrompt(
        systemPrompt,
        availableExecutionTools.length > 0 ? availableExecutionTools : toolsToUse,
      );

      const { standard: apiMessages, fallback: apiMessagesFallback } = await buildConversationMessages({
        messages: conversation,
        systemPrompt: toolAwareSystemPrompt,
        contextText,
        customMemory: memoryText,
        chatMode: currentChatMode,
        maxHistoryMessages: settings.maxHistoryMessages,
        modelId: model,
      });

      // ─────────────────────────────────────────────────────────────────────────
      // Agentic RAG 模式：AI 自主规划检索策略，多轮迭代
      // ─────────────────────────────────────────────────────────────────────────
      if (isAgenticRAGEnabled() && includeTools && !hasHighPriorityContext) {
        const ragConfig = getAgenticRAGConfig();
        const assistantId = nowId();
        const assistantCreatedAt = Date.now();
        
        // 创建一个占位消息，显示正在思考
        setMessages((prev) => [...prev, {
          id: assistantId,
          role: "assistant",
          content: "🧠 正在智能检索...",
          createdAt: assistantCreatedAt,
          model,
          localOnly: true, // 标记为本地消息，不发送给 API
        }]);
        setStreamingMessageId(assistantId);
        
        try {
          // 创建 LLM 调用函数
          const callLLM = async (prompt: string, options?: { temperature?: number; maxTokens?: number }) => {
            const ragMessages: Message[] = [
              { id: nowId(), role: "user", content: prompt, createdAt: Date.now() }
            ];
            
            // 注意：这里不使用 chatMode: "ask"，因为 Agentic RAG 内部有工具调用能力
            // 使用 "agent" 模式或不指定，避免 ASK_MODE_INSTRUCTION 被加入
            const { standard: ragApiMessages } = await buildConversationMessages({
              messages: ragMessages,
              systemPrompt: "你是一个智能检索规划助手，具备联网搜索和笔记检索能力。请严格按照要求返回 JSON 格式。",
              contextText: "",
              customMemory: "",
              chatMode: "agent", // 使用 agent 模式，避免 Ask 模式限制
              modelId: model,
            });
            
          let result = "";
          const ragContextLength = getModelContextLength(settings, model);
          for await (const chunk of streamChatWithRetry(
            {
            apiUrl: apiConfig.apiUrl,
            apiKey: apiConfig.apiKey,
            model,
            protocol: apiConfig.protocol,
            anthropicApiPath: apiConfig.anthropicApiPath,
            temperature: options?.temperature ?? 0.3,
              maxTokens: options?.maxTokens ?? 1000,
              signal: aborter.signal,
              maxContextTokens: ragContextLength,
            },
            ragApiMessages,
            ragApiMessages,
          )) {
              if (chunk.type === "content") {
                result += chunk.content;
              }
            }
            return result;
          };
          
          // 进度回调 - 使用 reasoning 字段显示详细思考过程
          const onProgress = (update: { phase: string; status: string; reasoning: string; step?: any; iteration?: number }) => {
            // 用 reasoning 字段显示思考过程，content 显示当前状态
            updateMessage(assistantId, {
              content: `*${update.status}*`,
              reasoning: update.reasoning,
            });
          };
          
          // 执行 Agentic RAG
          const ragResult = await executeAgenticRAG(processedContent, callLLM, {
            maxIterations: ragConfig.maxIterations || runtimeConfig.maxToolRounds,
            enableReflection: ragConfig.enableReflection,
            onProgress,
          });
          
          // 更新消息为最终答案，保留 reasoning 作为思考过程记录
          setStreamingMessageId(null);
      // 生成检索过程摘要作为 reasoning
          const retrieveSteps = ragResult.steps.filter(s => s.type === "retrieve");
          const correctSteps = ragResult.steps.filter(s => s.type === "correct");
          const ragSummary = [
            `🧠 **Agentic RAG 检索过程**`,
            `- 迭代轮数: ${ragResult.iterations}`,
            `- 检索步骤: ${retrieveSteps.length}${correctSteps.length > 0 ? ` (含 ${correctSteps.length} 次策略修正)` : ""}`,
            ...retrieveSteps.map(s => {
              const status = s.result?.includes("Error") ? "❌" : (s.result?.includes("No ") ? "⚠️" : "✅");
              return `- ${status} ${getToolDisplayName(s.tool || "")}: ${s.reasoning}`;
            }),
            ragResult.strategySummary ? `- 📊 ${ragResult.strategySummary}` : "",
            ragResult.hitLimit ? `- ⚠️ 达到最大轮数限制` : `- ✅ 信息收集完成`,
          ].filter(Boolean).join("\n");
          
          updateMessage(assistantId, {
            content: ragResult.answer,
            reasoning: ragSummary,
            localOnly: false,
          });
          
          // 添加到会话
          conversation.push({
            id: assistantId,
            role: "assistant",
            content: ragResult.answer,
            reasoning: ragSummary,
            createdAt: assistantCreatedAt,
          });
          
        } catch (err: any) {
          const isAbort = String(err?.name ?? "") === "AbortError";
          if (!isAbort) {
            updateMessage(assistantId, {
              content: `检索出错: ${err.message || "未知错误"}`,
              localOnly: false,
            });
          } else {
            // 用户取消，移除占位消息
            setMessages((prev) => prev.filter(m => m.id !== assistantId));
          }
          setStreamingMessageId(null);
        }
        
        // Agentic RAG 完成，跳过普通工具调用流程
        setSending(false);
        if (abortRef.current === aborter) abortRef.current = null;
        
        // 自动缓存会话
        autoCacheSession(currentSession);
        
        return; // 不走普通流程
      }
      // ─────────────────────────────────────────────────────────────────────────

      // 获取模型的上下文长度限制
      const modelContextLength = getModelContextLength(settings, model);

      for await (const chunk of streamChatWithRetry(
        {
          apiUrl: apiConfig.apiUrl,
          apiKey: apiConfig.apiKey,
          model,
          protocol: apiConfig.protocol,
          anthropicApiPath: apiConfig.anthropicApiPath,
          temperature: runtimeConfig.temperature,
          maxTokens: runtimeConfig.maxTokens,
          signal: aborter.signal,
          tools: toolsToUse,
          timeoutMs: settings.streamTimeout,
          maxContextTokens: modelContextLength,
        },
        apiMessages,
        apiMessagesFallback,
      )) {
        if (chunk.type === "reasoning") {
          // 第一次收到 reasoning 时，创建独立的 reasoning 消息
          if (!reasoningMessageId) {
            reasoningMessageId = nowId();
            reasoningCreatedAt = Date.now();
            setStreamingMessageId(reasoningMessageId);
            currentReasoning = chunk.reasoning;
            setMessages((prev) => [...prev, { 
              id: reasoningMessageId!, 
              role: "assistant", 
              content: "", 
              reasoning: currentReasoning,
              createdAt: reasoningCreatedAt!,
              model,
              searchResults: getSearchResultsForMessage(),
            }]);
          } else {
            currentReasoning += chunk.reasoning;
            updateMessage(reasoningMessageId, { reasoning: currentReasoning });
          }
        } else if (chunk.type === "content") {
          // 第一次收到 content 时，创建 assistant 消息（如果还没有 reasoning 消息，或者 reasoning 已完成）
          if (!reasoningMessageId) {
            // 没有 reasoning，直接创建 assistant 消息
            const assistantId = nowId();
            const assistantCreatedAt = Date.now();
            setStreamingMessageId(assistantId);
            setMessages((prev) => [...prev, {
              id: assistantId,
              role: "assistant",
              content: sanitizeContent(chunk.content),
              createdAt: assistantCreatedAt,
              model,
              searchResults: getSearchResultsForMessage(),
            }]);
            currentContent = sanitizeContent(chunk.content);
            reasoningMessageId = assistantId; // 复用这个 ID 作为 assistant ID
          } else if (currentContent === "") {
            // reasoning 完成，创建新的 assistant 消息
            setStreamingMessageId(null); // 停止 reasoning 的流式状态
            const assistantId = nowId();
            const assistantCreatedAt = Date.now();
            setStreamingMessageId(assistantId);
            setMessages((prev) => [...prev, {
              id: assistantId,
              role: "assistant",
              content: sanitizeContent(chunk.content),
              createdAt: assistantCreatedAt,
              model,
              searchResults: getSearchResultsForMessage(),
            }]);
            currentContent = sanitizeContent(chunk.content);
            reasoningMessageId = assistantId; // 更新为 assistant ID
          } else {
            // 继续追加 content
            currentContent = sanitizeContent(currentContent + chunk.content);
            updateMessage(reasoningMessageId, { content: currentContent });
          }
        } else if (chunk.type === "tool_calls" && includeTools) {
          toolCalls = chunk.toolCalls;
        } else if (chunk.type === "done" && chunk.result) {
          // 使用 DSML 清洗后的最终内容，确保 invoke 标签不进入历史
          if (chunk.result.content !== undefined) {
            currentContent = sanitizeContent(chunk.result.content);
            if (reasoningMessageId) {
              updateMessage(reasoningMessageId, { content: currentContent });
            }
          }
          if (includeTools && chunk.result.toolCalls?.length) {
            toolCalls = chunk.result.toolCalls;
          }
        }
      }

      setStreamingMessageId(null);

      const hasAssistantMessage = Boolean(reasoningMessageId);

      // 如果只有 reasoning 没有 content，需要创建 assistant 消息
      const assistantId = hasAssistantMessage ? reasoningMessageId! : nowId();
      const assistantCreatedAt = hasAssistantMessage ? (reasoningCreatedAt || Date.now()) : Date.now();
      
      if (!hasAssistantMessage && !currentContent && toolCalls.length === 0) {
        // 完全空响应
        setMessages((prev) => [...prev, { 
          id: assistantId, 
          role: "assistant", 
          content: "(empty response)", 
          createdAt: assistantCreatedAt,
          model,
          searchResults: getSearchResultsForMessage(),
        }]);
      } else if (!hasAssistantMessage && currentContent) {
        // 有些兼容网关只在 done 阶段返回最终正文，此时也需要补建消息气泡。
        setMessages((prev) => [...prev, {
          id: assistantId,
          role: "assistant",
          content: sanitizeContent(currentContent),
          createdAt: assistantCreatedAt,
          model,
          searchResults: getSearchResultsForMessage(),
        }]);
      } else if (!hasAssistantMessage && !currentContent && toolCalls.length > 0) {
        // 只有 tool calls，创建空 content 的 assistant 消息
        setMessages((prev) => [...prev, { 
          id: assistantId, 
          role: "assistant", 
          content: "", 
          createdAt: assistantCreatedAt,
          model,
          searchResults: getSearchResultsForMessage(),
        }]);
      }

	      conversation.push({
	        id: assistantId,
	        role: "assistant",
	        content: sanitizeContent(currentContent),
	        createdAt: assistantCreatedAt,
	        tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
	        ...(reasoningMessageId ? { reasoning: currentReasoning } : {}),
          searchResults: getSearchResultsForMessage(),
	      });

		      // Handle tool calls with multi-round support
		      let toolRound = 0;
		      let currentToolCalls = toolCalls;
		      let currentAssistantId = assistantId;
		      const allToolResultMessages: Message[] = [];
          const executedToolSignatures = new Set<string>();

      while (currentToolCalls.length > 0 && toolRoundController.canRun(toolRound)) {
        toolRound++;

        updateMessage(currentAssistantId, { tool_calls: currentToolCalls });

        // Keep tool_calls in the conversation snapshot
        const assistantIdx = conversation.findIndex((m) => m.id === currentAssistantId);
        if (assistantIdx >= 0) conversation[assistantIdx].tool_calls = currentToolCalls;

        // Filter out tool calls that have already been executed (by checking existing tool results)
        const executedToolCallIds = new Set(allToolResultMessages.map(m => m.tool_call_id));
        const newToolCalls = currentToolCalls.filter(tc => !executedToolCallIds.has(tc.id));
        
        if (newToolCalls.length === 0) {
          break;
        }
        
        const preToolResultMessages: Message[] = [];
        const routedToolCallsForConversation: ToolCallInfo[] = [];
        const executableToolCalls: ToolCallInfo[] = [];

        for (const tc of newToolCalls) {
          const resolution = resolveToolCallName(tc, availableExecutionTools);
          if (resolution.status === "invalid") {
            routedToolCallsForConversation.push(tc);
            preToolResultMessages.push(createSyntheticToolErrorMessage(tc, resolution.message) as Message);
            continue;
          }

          if (resolution.status === "renamed") {
            console.warn(
              `[Tool Call] Normalized tool name "${resolution.originalName}" -> "${resolution.resolvedName}" (${resolution.reason})`
            );
          }

          const routedToolCall = resolution.toolCall;
          routedToolCallsForConversation.push(routedToolCall);
          const signature = createToolCallSignature(routedToolCall);
          if (executedToolSignatures.has(signature)) {
            preToolResultMessages.push(createSyntheticToolErrorMessage(
              routedToolCall,
              `Error: Repeated tool call skipped: ${routedToolCall.function.name}. Use prior tool results and answer directly.`,
            ) as Message);
            continue;
          }

          executedToolSignatures.add(signature);
          executableToolCalls.push(routedToolCall);
        }

        if (routedToolCallsForConversation.length > 0) {
          currentToolCalls = routedToolCallsForConversation;
          updateMessage(currentAssistantId, { tool_calls: currentToolCalls });
          const routedAssistantIdx = conversation.findIndex((m) => m.id === currentAssistantId);
          if (routedAssistantIdx >= 0) conversation[routedAssistantIdx].tool_calls = currentToolCalls;
        }

        // ── JSON 修复辅助函数 ──────────────────────────────────────────────
        const tryRepairJson = (jsonStr: string): string | null => {
            let repaired = jsonStr.trim();
            
            // Fix 0a: Handle concatenated JSON objects (e.g., {"a":1}{"b":2} -> {"a":1})
            // This happens when AI model incorrectly merges multiple tool calls
            const concatenatedMatch = repaired.match(/^(\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\})(\{.+)$/);
            if (concatenatedMatch) {
              // Take only the first complete JSON object
              repaired = concatenatedMatch[1];
              console.warn('[Tool Call] Detected concatenated JSON, using first object:', repaired);
            }
            
            // Fix 0b: If string doesn't start with {, try to find and extract JSON object
            if (!repaired.startsWith('{')) {
              // Try to find a JSON object pattern
              const jsonMatch = repaired.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/);
              if (jsonMatch) {
                repaired = jsonMatch[0];
              } else {
                // If first char is a digit or other non-{ char followed by ", assume { was corrupted
                // e.g., 0"blockId": 9807} -> {"blockId": 9807}
                const firstQuoteIdx = repaired.indexOf('"');
                if (firstQuoteIdx > 0 && firstQuoteIdx < 5) {
                  repaired = '{' + repaired.slice(firstQuoteIdx);
                }
              }
            }
            
            // Fix 1: Remove duplicate keys (e.g., "key": "val1""key": "val2" -> "key": "val2")
            // This handles cases where AI model outputs duplicate fields
            repaired = repaired.replace(/"([^"]+)":\s*"[^"]*"\s*"(\1)":\s*/g, '"$1": ');
            
            // Fix 2: Replace ) with } at the end if mismatched
            if (repaired.includes(')') && !repaired.includes('(')) {
              repaired = repaired.replace(/\)$/g, '}');
            }
            
            // Fix 3: Ensure proper closing brace
            const openBraces = (repaired.match(/{/g) || []).length;
            const closeBraces = (repaired.match(/}/g) || []).length;
            if (openBraces > closeBraces) {
              repaired = repaired + '}'.repeat(openBraces - closeBraces);
            }
            
            // Fix 4: Remove trailing content after last valid JSON structure
            // Find the last } and truncate anything after it that's not whitespace
            const lastBraceIndex = repaired.lastIndexOf('}');
            if (lastBraceIndex !== -1 && lastBraceIndex < repaired.length - 1) {
              const afterBrace = repaired.slice(lastBraceIndex + 1).trim();
              if (afterBrace && !afterBrace.startsWith(',') && !afterBrace.startsWith(']')) {
                repaired = repaired.slice(0, lastBraceIndex + 1);
              }
            }
            
            // Fix 5: Fix common typos in key names (blockld -> blockId)
            repaired = repaired.replace(/"blockld"/gi, '"blockId"');

            // Fix 6: Remove trailing commas before } or ] (e.g., {"a": 1,} -> {"a": 1})
            repaired = repaired.replace(/,\s*([}\]])/g, '$1');

            // Fix 7: Replace "key": } with "key": null} (AI outputs bare closing brace as value)
            repaired = repaired.replace(/":\s*\}/g, '": null}');

            // Fix 8: Replace "key": ] with "key": [] (AI outputs wrong bracket type)
            repaired = repaired.replace(/":\s*\]/g, '": []');

            // Fix 9: Replace invalid value "key": ] or "key": } when they appear mid-object
            // e.g., "blockIds": }, -> "blockIds": null,
            repaired = repaired.replace(/":\s*\},/g, '": null,');

            try {
              JSON.parse(repaired);
              return repaired;
            } catch {
              return null;
            }
          };

        // ── 单工具执行辅助函数 ──────────────────────────────────────────
        const TOOL_TIMEOUT_MS = 60000;
        const executeSingleToolCall = async (toolCall: ToolCallInfo): Promise<Message> => {
          const toolName = toolCall.function.name;
          let args: any = {};
          let parseError: string | null = null;

          try {
            args = JSON.parse(toolCall.function.arguments);
          } catch (error: any) {
            const repaired = tryRepairJson(toolCall.function.arguments);
            if (repaired) {
              console.warn('[Tool Call] Repaired malformed JSON:', toolCall.function.arguments, '->', repaired);
              try {
                args = JSON.parse(repaired);
              } catch {
                parseError = `Invalid JSON in tool arguments: ${error.message}`;
              }
            } else {
              parseError = `Invalid JSON in tool arguments: ${error.message}`;
            }
          }

          let result: string | undefined;
          if (parseError) {
            result = `Error: ${parseError}\n\nRaw arguments received:\n${toolCall.function.arguments}\n\nPlease provide valid JSON arguments.`;
          } else {
            const isSkillCall = toolName.startsWith("skill_");

            if (isSkillCall) {
              try {
                const resolvedSkillId = await resolveSkillIdFromToolName(toolName);
                if (!resolvedSkillId) {
                  result = `Error: Skill not found for tool: ${toolName}`;
                } else {
                  const skillMode = getSkillToolMode(toolName) || "auto";

                  if (skillMode === "disabled") {
                    result = `Error: Skill is disabled: ${resolvedSkillId.id}`;
                  } else if (skillMode === "auto") {
                    // 自动执行：无需确认，直接加载指令
                    const instructions = await getSkillInstructionsAsync(resolvedSkillId);
                    if (!instructions) {
                      result = `Error: Skill not found: ${resolvedSkillId.id}`;
                    } else {
                      const userInput = args.input || "";
                      result = `${instructions}\n\n## 用户输入\n${userInput}`;
                    }
                  } else {
                    // ask 模式：在对话中内联确认（非模态弹窗）
                    try {
                      const skill = await getSkill(resolvedSkillId.id, (resolvedSkillId as any).isGlobal);
                      if (!skill) {
                        result = `Error: Skill not found: ${resolvedSkillId.id}`;
                      } else {
                        const userApproved = await requestSkillConfirm(skill);
                        if (!userApproved) {
                          result = `用户拒绝执行技能「${skill.name}」。请尝试其他方式或直接回答用户的问题。`;
                        } else {
                          const instructions = await getSkillInstructionsAsync(resolvedSkillId);
                          if (!instructions) {
                            result = `Error: Skill not found: ${resolvedSkillId.id}`;
                          } else {
                            const userInput = args.input || "";
                            result = `${instructions}\n\n## 用户输入\n${userInput}`;
                          }
                        }
                      }
                    } catch (err: any) {
                      result = `Error: Failed to execute skill ${resolvedSkillId.id}: ${err?.message || "Unknown error"}`;
                    }
                  }
                }
              } catch (err: any) {
                result = `Error: Failed to resolve skill for tool ${toolName}: ${err?.message || "Unknown error"}`;
              }
            } else {
              const needsConfirm = shouldAskForTool(toolName);
              let userApproved = true;

              if (needsConfirm) {
                try {
                  const { createToolConfirmPromise } = await import("../components/ToolConfirmDialog");
                  userApproved = await createToolConfirmPromise(toolName, args);
                } catch (confirmErr: any) {
                  result = `Error: Tool confirmation failed: ${confirmErr?.message || "Unknown error"}`;
                }
              }

              if (result === undefined && !userApproved) {
                result = `用户拒绝执行此工具。请尝试其他方式或直接回答用户的问题。`;
              } else if (result === undefined) {
                try {
                  const timeoutPromise = new Promise<string>((_, reject) => {
                    setTimeout(() => reject(new Error(`Tool execution timed out after ${TOOL_TIMEOUT_MS / 1000}s`)), TOOL_TIMEOUT_MS);
                  });
                  result = await Promise.race([
                    executeTool(toolName, args),
                    timeoutPromise
                  ]);
                } catch (err: any) {
                  result = `Error: ${err.message || "Tool execution failed"}`;
                }
              }
            }
          }

          // 强制截断过长的工具结果，防止原始数据污染对话
          const maxChars = Math.max(settings.maxToolResultChars, 0);
          let finalContent = result || "Error: Tool execution returned empty result";
          if (maxChars > 0 && finalContent.length > maxChars) {
            finalContent = finalContent.slice(0, maxChars) +
              `\n\n...[已截断，原长度 ${finalContent.length} 字符]`;
          }

          return {
            id: nowId(),
            role: "tool",
            content: finalContent,
            tool_call_id: toolCall.id,
            name: toolName,
            createdAt: Date.now(),
          };
        };

        // ── 分组：需确认 vs 无需确认 ────────────────────────────────────
        const confirmTools: ToolCallInfo[] = [];
        const parallelTools: ToolCallInfo[] = [];
        for (const tc of executableToolCalls) {
          if (tc.function.name.startsWith("skill_")) {
            const mode = getSkillToolMode(tc.function.name);
            if (mode === "ask") {
              confirmTools.push(tc);  // 需内联确认，顺序执行
            } else {
              parallelTools.push(tc); // auto 模式，无需确认，可并行
            }
          } else if (shouldAskForTool(tc.function.name)) {
            confirmTools.push(tc);
          } else {
            parallelTools.push(tc);
          }
        }

        // ── 并行执行无需确认的工具 ──────────────────────────────────────
        const toolResultMessages: Message[] = [...preToolResultMessages];
        if (parallelTools.length > 0) {
          const parallelResults = await Promise.all(
            parallelTools.map(tc => executeSingleToolCall(tc))
          );
          toolResultMessages.push(...parallelResults);
        }

        // 检查并行结果中是否有直接渲染的（如日记导出）
        const hasDirectRender = toolResultMessages.some(m => m.content.includes("```journal-export"));
        if (hasDirectRender) {
          allToolResultMessages.push(...toolResultMessages);
          conversation.push(...toolResultMessages);
          setMessages((prev) => [...prev, ...toolResultMessages]);
          queueMicrotask(scrollToBottom);
          currentToolCalls = [];
          break;
        }

        // ── 顺序执行需确认的工具 ────────────────────────────────────────
        for (const tc of confirmTools) {
          const msg = await executeSingleToolCall(tc);
          toolResultMessages.push(msg);
          if (msg.content.includes("```journal-export")) {
            allToolResultMessages.push(...toolResultMessages);
            conversation.push(...toolResultMessages);
            setMessages((prev) => [...prev, ...toolResultMessages]);
            queueMicrotask(scrollToBottom);
            currentToolCalls = [];
            break;
          }
        }

        // 如果直接渲染触发了，跳出
        if (currentToolCalls.length === 0) {
          break;
        }

        captureSearchResults(toolResultMessages);
        allToolResultMessages.push(...toolResultMessages);
        conversation.push(...toolResultMessages);
        const hasToolError = toolResultMessages.some(isToolErrorResult);
        const reachedToolRoundLimit = toolRoundController.isReached(toolRound);
        const recoveryReason = hasToolError
          ? "A tool call failed, used an unknown tool, had malformed arguments, or repeated a previous call."
          : reachedToolRoundLimit
          ? `The configured tool round limit (${toolRoundController.limit}) has been reached.`
          : "";
        const enableTools = !hasToolError && !reachedToolRoundLimit;

        setMessages((prev) => [...prev, ...toolResultMessages]);
        queueMicrotask(scrollToBottom);

        // Build messages for next response including all prior tool results
        const { standard, fallback } = await buildConversationMessages({
          messages: conversation,
          systemPrompt: recoveryReason
            ? buildToolRecoverySystemPrompt(toolAwareSystemPrompt, recoveryReason)
            : toolAwareSystemPrompt,
          contextText,
          customMemory: memoryText,
          chatMode: currentChatMode,
          maxHistoryMessages: settings.maxHistoryMessages,
          modelId: model,
        });

        // Stream next response with reasoning support
        let nextContent = "";
        let nextReasoning = "";
        let nextToolCalls: ToolCallInfo[] = [];
        let nextReasoningMessageId: string | null = null;
        let nextReasoningCreatedAt: number | null = null;

        // 获取模型特定的 API 配置
        const toolApiConfig = getModelApiConfig(settings, model);
        const toolContextLength = getModelContextLength(settings, model);

        try {
          for await (const chunk of streamChatWithRetry(
            {
              apiUrl: toolApiConfig.apiUrl,
              apiKey: toolApiConfig.apiKey,
              model,
              protocol: toolApiConfig.protocol,
              temperature: runtimeConfig.temperature,
              maxTokens: runtimeConfig.maxTokens,
              signal: aborter.signal,
              tools: enableTools ? toolsToUse : undefined,
              timeoutMs: settings.streamTimeout,
              maxContextTokens: toolContextLength,
            },
            standard,
            fallback
          )) {
            if (chunk.type === "reasoning") {
              // 第一次收到 reasoning 时，创建独立的 reasoning 消息
              if (!nextReasoningMessageId) {
                nextReasoningMessageId = nowId();
                nextReasoningCreatedAt = Date.now();
                setStreamingMessageId(nextReasoningMessageId);
                nextReasoning = chunk.reasoning;
                setMessages((prev) => [...prev, { 
                  id: nextReasoningMessageId!, 
                  role: "assistant", 
                  content: "", 
                  reasoning: chunk.reasoning,
                  createdAt: nextReasoningCreatedAt!,
                  model,
                  searchResults: getSearchResultsForMessage(),
                }]);
              } else {
                nextReasoning += chunk.reasoning;
                updateMessage(nextReasoningMessageId, { reasoning: nextReasoning });
              }
            } else if (chunk.type === "content") {
              // 第一次收到 content 时，创建 assistant 消息
              if (!nextReasoningMessageId) {
                // 没有 reasoning，直接创建 assistant 消息
                const nextAssistantId = nowId();
                const nextAssistantCreatedAt = Date.now();
                setStreamingMessageId(nextAssistantId);
                setMessages((prev) => [...prev, {
                  id: nextAssistantId,
                  role: "assistant",
                  content: sanitizeContent(chunk.content),
                  createdAt: nextAssistantCreatedAt,
                  model,
                  searchResults: getSearchResultsForMessage(),
                }]);
                nextContent = sanitizeContent(chunk.content);
                nextReasoningMessageId = nextAssistantId;
              } else if (nextContent === "") {
                // reasoning 完成，创建新的 assistant 消息
                setStreamingMessageId(null);
                const nextAssistantId = nowId();
                const nextAssistantCreatedAt = Date.now();
                setStreamingMessageId(nextAssistantId);
                setMessages((prev) => [...prev, {
                  id: nextAssistantId,
                  role: "assistant",
                  content: sanitizeContent(chunk.content),
                  createdAt: nextAssistantCreatedAt,
                  model,
                  searchResults: getSearchResultsForMessage(),
                }]);
                nextContent = sanitizeContent(chunk.content);
                nextReasoningMessageId = nextAssistantId;
              } else {
                // 继续追加 content
                nextContent = sanitizeContent(nextContent + chunk.content);
                updateMessage(nextReasoningMessageId, { content: nextContent });
              }
            } else if (chunk.type === "tool_calls" && enableTools) {
              nextToolCalls = chunk.toolCalls;
            } else if (chunk.type === "done" && chunk.result) {
              if (chunk.result.content !== undefined) {
                nextContent = sanitizeContent(chunk.result.content);
                if (nextReasoningMessageId) {
                  updateMessage(nextReasoningMessageId, { content: nextContent });
                }
              }
              if (enableTools && chunk.result.toolCalls?.length) {
                nextToolCalls = chunk.result.toolCalls;
              }
            }
          }
        } catch (streamErr: any) {
          throw streamErr;
        }

        setStreamingMessageId(null);

        // 确定 assistant 消息的 ID
        const nextAssistantId = nextReasoningMessageId || nowId();
        const nextAssistantCreatedAt = nextReasoningCreatedAt || Date.now();

        if (nextToolCalls.length > 0) {
          if (nextReasoningMessageId) {
            updateMessage(nextReasoningMessageId, { tool_calls: nextToolCalls });
          } else {
            setMessages((prev) => [...prev, {
              id: nextAssistantId,
              role: "assistant",
              content: sanitizeContent(nextContent),
              createdAt: nextAssistantCreatedAt,
              model,
              tool_calls: nextToolCalls,
              searchResults: getSearchResultsForMessage(),
            }]);
          }
        } else if (nextContent.trim().length > 0 && !nextReasoningMessageId) {
          setMessages((prev) => [...prev, {
            id: nextAssistantId,
            role: "assistant",
            content: sanitizeContent(nextContent),
            createdAt: nextAssistantCreatedAt,
            model,
            searchResults: getSearchResultsForMessage(),
          }]);
        }

        // If the model returned nothing, surface a controlled fallback so the user isn't left with an empty bubble.
        if (nextContent.trim().length === 0 && nextToolCalls.length === 0) {
          const toolFallback = sanitizeContent(allToolResultMessages.map((m) => m.content).join("\n\n").trim());
          const fallbackText = recoveryReason
            ? buildEmptyToolRecoveryText(recoveryReason, toolResultMessages)
            : toolFallback || "(empty response from API)";
          if (nextReasoningMessageId) {
            updateMessage(nextReasoningMessageId, { content: fallbackText, searchResults: getSearchResultsForMessage() });
          } else {
            setMessages((prev) => [...prev, { 
              id: nextAssistantId, 
              role: "assistant", 
              content: fallbackText, 
              createdAt: nextAssistantCreatedAt,
              searchResults: getSearchResultsForMessage(),
            }]);
          }
          nextContent = fallbackText;
        }

        conversation.push({
          id: nextAssistantId,
          role: "assistant",
          content: sanitizeContent(nextContent),
          createdAt: nextAssistantCreatedAt,
          tool_calls: nextToolCalls.length > 0 ? nextToolCalls : undefined,
          ...(nextReasoningMessageId ? { reasoning: nextReasoning } : {}),
          searchResults: getSearchResultsForMessage(),
        });

        // Check if model wants to call more tools
        if (nextToolCalls.length > 0 && toolRoundController.canRun(toolRound)) {
          currentToolCalls = nextToolCalls;
          currentAssistantId = nextAssistantId;
          // Continue loop
        } else {
          break;
        }
      }
      
      // Clear error state on successful completion
      // **Feature: chat-ui-enhancement**
      // **Validates: Requirements 11.3**
      setLastError(null);
    } catch (err: any) {
      const isAbort = String(err?.name ?? "") === "AbortError";
      const msg = String(err?.message ?? err ?? "unknown error");
      if (!isAbort) {
        orca.notify("error", msg);
        // Save error state for retry functionality
        // **Feature: chat-ui-enhancement**
        // **Validates: Requirements 11.3**
        setLastError({
          message: msg,
          retryData: { content, files, historyOverride },
        });
      }

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
        const lastUserMsg = messages[lastUserIdx];
        const content = lastUserMsg.content || "";
        const historyBeforeUser = messages.slice(0, lastUserIdx);
        // Resend using the history BEFORE the last user message, and re-using the last user content.
        handleSend(content, lastUserMsg.files, historyBeforeUser);
    }
  }, [messages, sending]);

  /**
   * Retry the last failed request
   * **Feature: chat-ui-enhancement**
   * **Validates: Requirements 11.3**
   */
  const handleRetry = useCallback(() => {
    if (sending || !lastError?.retryData) return;
    
    const { content, files, historyOverride } = lastError.retryData;
    // Clear error before retrying
    setLastError(null);
    // Remove the last error message from the messages list
    setMessages((prev) => {
      // Find and remove the last assistant message that contains error
      const lastAssistantIdx = prev.findLastIndex((m) => m.role === "assistant");
      if (lastAssistantIdx >= 0 && prev[lastAssistantIdx].content?.includes("(error)")) {
        return prev.slice(0, lastAssistantIdx);
      }
      return prev;
    });
    // Retry the request
    handleSend(content, files, historyOverride);
  }, [sending, lastError]);


  function clear() {
    if (abortRef.current) abortRef.current.abort();
    setMessages([]);
    setLastError(null);
  }

  function stop() {
    if (abortRef.current) abortRef.current.abort();
  }

  // 删除单条消息
  const handleDeleteMessage = useCallback((messageId: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
  }, []);

  // 切换消息的重要标记（pinned）
  const handleTogglePinned = useCallback((messageId: string) => {
    setMessages((prev) => prev.map((m) => {
      if (m.id === messageId) {
        const newPinned = !(m as any).pinned;
        if (typeof orca !== "undefined" && orca.notify) {
          orca.notify("success", newPinned ? "已标记为重要" : "已取消重要标记");
        }
        return { ...m, pinned: newPinned };
      }
      return m;
    }));
  }, []);

  // 回档到指定消息（删除该消息及之后的所有消息）
  const handleRollbackToMessage = useCallback((messageId: string) => {
    setMessages((prev) => {
      const index = prev.findIndex((m) => m.id === messageId);
      if (index <= 0) return prev; // 不能回档到第一条消息之前
      return prev.slice(0, index);
    });
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Branch Management Callbacks (对话分支功能)
  // ─────────────────────────────────────────────────────────────────────────

  const handleCreateBranch = useCallback((messageId: string) => {
    try {
      console.log("[Branch] Creating branch at message:", messageId);
      console.log("[Branch] Current messages:", messages.length);
      // createBranch(messages, messageId, branchName?) -> { messages: Message[]; branchId: string }
      const result = createBranch(messages, messageId);
      console.log("[Branch] Result:", {
        branchId: result.branchId,
        messagesCount: result.messages.length,
        lastMessage: result.messages[result.messages.length - 1],
        hasBranches: result.messages[result.messages.length - 1]?.branches?.length,
      });
      setCurrentBranchId(result.branchId);
      setMessages(result.messages);
      orca.notify("success", `已创建新分支，当前在分支: ${result.branchId.slice(0, 10)}...`);
    } catch (err: any) {
      console.error("[Branch] Create failed:", err);
      orca.notify("error", err?.message || "创建分支失败");
    }
  }, [messages]);

  const handleSwitchBranch = useCallback((messageId: string, branchId: string) => {
    try {
      // switchBranch(messages, messageId, branchId) -> Message[]
      const updatedMessages = switchBranch(messages, messageId, branchId);
      setMessages(updatedMessages);
      setCurrentBranchId(branchId);
      orca.notify("success", "已切换分支");
    } catch (err: any) {
      orca.notify("error", err?.message || "切换分支失败");
    }
  }, [messages]);

  const handleDeleteBranch = useCallback((messageId: string, branchId: string) => {
    try {
      // deleteBranch(messages, branchPointId, branchId) -> Message[]
      const updatedMessages = deleteBranch(messages, messageId, branchId);
      setMessages(updatedMessages);
      // 如果删除的是当前分支，重置分支 ID
      if (currentBranchId === branchId) {
        setCurrentBranchId(null);
      }
      orca.notify("success", "已删除分支");
    } catch (err: any) {
      orca.notify("error", err?.message || "删除分支失败");
    }
  }, [messages, currentBranchId]);

  const handleRenameBranch = useCallback((messageId: string, branchId: string, newName: string) => {
    try {
      // renameBranch(messages, branchPointId, branchId, newName) -> Message[]
      const updatedMessages = renameBranch(messages, messageId, branchId, newName);
      setMessages(updatedMessages);
      orca.notify("success", "已重命名分支");
    } catch (err: any) {
      orca.notify("error", err?.message || "重命名分支失败");
    }
  }, [messages]);

  // 生成建议回复 - 根据指定的 AI 消息内容生成
  const createSuggestionGenerator = useCallback(
    (messageContent: string) => async (): Promise<string[]> => {
      const suggestions = await generateSuggestedReplies(messageContent);
      return suggestions;
    },
    []
  );

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
  // 使用 settingsVersion 来强制重新获取设置
  const [settingsVersion, setSettingsVersion] = useState(0);
  const settingsForUi = useMemo(() => getAiChatSettings(pluginNameForUi), [pluginNameForUi, settingsVersion]);
  const selectedModel = (currentSession.model || "").trim() || settingsForUi.selectedModelId;

  // 新的模型选择处理：同时更新 providerId 和 modelId
  const handleModelSelect = useCallback((providerId: string, modelId: string) => {
    setCurrentSession((prev) => ({ ...prev, model: modelId }));
    // 同时更新设置中的选中状态
    updateAiChatSettings("app", pluginNameForUi, {
      selectedProviderId: providerId,
      selectedModelId: modelId,
    }).then(() => {
      setSettingsVersion(v => v + 1); // 触发重新获取设置
    }).catch(err => {
    });
  }, [pluginNameForUi]);

  // 更新设置（用于 ModelSelectorMenu 中的平台配置修改）
  const handleUpdateSettings = useCallback(async (newSettings: AiChatSettings) => {
    try {
      await updateAiChatSettings("app", pluginNameForUi, newSettings);
      setSettingsVersion(v => v + 1); // 触发重新获取设置
    } catch (err: any) {
      orca.notify("error", `保存设置失败: ${String(err?.message ?? err ?? "unknown error")}`);
    }
  }, [pluginNameForUi]);

  // 兼容旧的 handleModelChange（用于 ChatInput）
  const handleModelChange = useCallback((nextModel: string) => {
    setCurrentSession((prev) => ({ ...prev, model: nextModel }));
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  let messageListContent: any[] | any;

  if (messages.length === 0) {
    messageListContent = createElement(EmptyState, {
      onSuggestionClick: (text: string) => handleSend(text),
    });
  } else {
    // 构建 tool 结果映射：toolCallId -> { content, name }
    const toolResultsMap = new Map<string, { content: string; name: string }>();
    messages.forEach((m) => {
      if (m.role === "tool" && m.tool_call_id) {
        toolResultsMap.set(m.tool_call_id, { content: m.content, name: m.name || "" });
      }
    });

    // 计算系统开销 token（系统提示 + 记忆 + 上下文）
    const systemPromptTokens = estimateTokens(buildDynamicSystemPrompt());
    const memoryTokens = estimateTokens(memoryStore.getFullMemoryText() || "");
    // 上下文 token 在 ChatInput 中已经显示，这里只计算基础开销
    const baseOverheadTokens = systemPromptTokens + memoryTokens;

    // 货币符号
    const currencySymbol = settingsForUi.currency === 'CNY' ? '¥' : 
                          settingsForUi.currency === 'EUR' ? '€' : 
                          settingsForUi.currency === 'JPY' ? '¥' : '$';

    // 辅助函数：根据模型名获取价格
    const getModelPrices = (modelName?: string) => {
      const model = modelName || selectedModel;
      // 从 providers 中查找模型价格
      for (const provider of settingsForUi.providers) {
        const found = provider.models.find(m => m.id === model);
        if (found) {
          return {
            inputPrice: found.inputPrice || 0,
            outputPrice: found.outputPrice || 0,
          };
        }
      }
      return { inputPrice: 0, outputPrice: 0 };
    };

    // 计算每条消息的 token 统计和费用
    const tokenStatsMap = new Map<string, { 
      messageTokens: number; 
      cumulativeTokens: number;
      cost: number;
      cumulativeCost: number;
      currencySymbol: string;
      totalInputTokens?: number;
      totalOutputTokens?: number;
      totalInputCost?: number;
      totalOutputCost?: number;
      isLastMessage?: boolean;
    }>();
    let cumulativeTokens = baseOverheadTokens;
    let cumulativeCost = 0;
    
    // 输入/输出分开统计
    let totalInputTokens = baseOverheadTokens; // 系统开销算作输入
    let totalOutputTokens = 0;
    let totalInputCost = 0;
    let totalOutputCost = 0;
    
    // 系统开销按当前模型的输入价格计算
    const currentPrices = getModelPrices(selectedModel);
    const systemOverheadCost = (baseOverheadTokens / 1_000_000) * currentPrices.inputPrice;
    cumulativeCost += systemOverheadCost;
    totalInputCost += systemOverheadCost;
    
    // 过滤掉 tool 消息和 localOnly 消息，获取有效消息列表
    const validMessages = messages.filter(m => m.role !== "tool" && !m.localOnly);
    // 找到最后一条 AI 消息（总统计只显示在 AI 输出上，不显示在用户输入上）
    const lastAiMessage = [...validMessages].reverse().find(m => m.role === "assistant");
    const lastAiMessageId = lastAiMessage?.id || null;
    
    // 遍历有效消息计算 Token（排除 localOnly）
    validMessages.forEach((m) => {
      const messageTokens = estimateTokens(m.content || "") + 
        (m.reasoning ? estimateTokens(m.reasoning) : 0);
      
      // 获取该消息使用的模型价格
      const prices = getModelPrices(m.model);
      const isInput = m.role === "user";
      
      // 计算本条消息费用（用户消息用输入价，AI消息用输出价）
      const messageCost = isInput 
        ? (messageTokens / 1_000_000) * prices.inputPrice
        : (messageTokens / 1_000_000) * prices.outputPrice;
      
      cumulativeTokens += messageTokens;
      cumulativeCost += messageCost;
      
      // 累计输入/输出
      if (isInput) {
        totalInputTokens += messageTokens;
        totalInputCost += messageCost;
      } else {
        totalOutputTokens += messageTokens;
        totalOutputCost += messageCost;
      }
      
      // 只在最后一条 AI 消息上显示总统计
      const isLastAi = m.id === lastAiMessageId;
      
      // 用户消息不显示 token 统计，只有 AI 消息显示
      if (isInput) {
        // 用户消息不添加 tokenStats
        return;
      }
      
      tokenStatsMap.set(m.id, { 
        messageTokens, 
        cumulativeTokens,
        cost: messageCost,
        cumulativeCost,
        currencySymbol,
        // 只在最后一条 AI 消息上附加总计信息
        ...(isLastAi ? {
          totalInputTokens,
          totalOutputTokens,
          totalInputCost,
          totalOutputCost,
          isLastMessage: true,
        } : {}),
      });
    });

    const messageElements: any[] = [];
    
    // 在消息列表顶部显示系统开销
    if (baseOverheadTokens > 0) {
      messageElements.push(
        createElement(
          "div",
          {
            key: "system-overhead",
            style: {
              display: "flex",
              justifyContent: "center",
              padding: "8px 16px",
              marginBottom: "8px",
            },
          },
          createElement(
            "div",
            {
              style: {
                display: "inline-flex",
                alignItems: "center",
                gap: "12px",
                fontSize: "11px",
                color: "var(--orca-color-text-3)",
                background: "var(--orca-color-bg-2)",
                padding: "6px 12px",
                borderRadius: "12px",
                border: "1px solid var(--orca-color-border)",
              },
            },
            withTooltip(
              "系统提示词消耗",
              createElement(
                "span",
                {
                  style: { display: "flex", alignItems: "center", gap: "4px" },
                },
                createElement("i", { className: "ti ti-prompt", style: { fontSize: "12px" } }),
                `提示词 ${formatTokenCount(systemPromptTokens)}`
              )
            ),
            memoryTokens > 0 && withTooltip(
              "记忆消耗（用户画像+记忆）",
              createElement(
                "span",
                {
                  style: { display: "flex", alignItems: "center", gap: "4px" },
                },
                createElement("i", { className: "ti ti-brain", style: { fontSize: "12px" } }),
                `记忆 ${formatTokenCount(memoryTokens)}`
              )
            ),
            withTooltip(
              "基础开销合计",
              createElement(
                "span",
                {
                  style: { 
                    display: "flex", 
                    alignItems: "center", 
                    gap: "4px",
                    fontWeight: 500,
                    color: "var(--orca-color-text-2)",
                  },
                },
                `= ${formatTokenCount(baseOverheadTokens)} tokens`
              )
            )
          )
        )
      );
    }

    messages.forEach((m, i) => {
      // 跳过普通 tool 消息，它们会被合并到 assistant 消息的工具调用区域
      // 但保留包含 journal-export 的 tool 消息，需要单独渲染导出按钮
      if (m.role === "tool" && !m.content.includes("```journal-export")) return;

      // 添加日期分隔符（如果是新的一天）
      // **Feature: chat-ui-enhancement**
      // **Validates: Requirements 4.1**
      const currentDate = new Date(m.createdAt);
      const prevNonToolMessage = messages.slice(0, i).reverse().find(pm => pm.role !== "tool");
      const prevDate = prevNonToolMessage ? new Date(prevNonToolMessage.createdAt) : null;
      
      // 如果是第一条消息或者与前一条消息不是同一天，添加日期分隔符
      if (!prevDate || !isSameDay(currentDate, prevDate)) {
        messageElements.push(
          createElement(DateSeparator, {
            key: `date-sep-${m.id}`,
            date: currentDate,
            label: formatDateSeparator(currentDate),
          })
        );
      }

      // Determine if this is the last message that should offer regeneration (Last AI message)
      const isLastAi = m.role === "assistant" && i === messages.length - 1;

      messageElements.push(
        createElement(MessageItem, {
          key: m.id,
          message: m,
          messageIndex: i,
          isLastAiMessage: isLastAi,
          isStreaming: streamingMessageId === m.id,
          // 选择模式相关
          selectionMode,
          isSelected: selectedMessageIds.has(m.id),
          onToggleSelection: selectionMode ? () => handleToggleMessageSelection(m.id) : undefined,
          onRegenerate: isLastAi ? handleRegenerate : undefined,
          onDelete: () => handleDeleteMessage(m.id),
          onRollback: i > 0 ? () => handleRollbackToMessage(m.id) : undefined,
          onTogglePinned: () => handleTogglePinned(m.id),
          toolResults: m.tool_calls ? toolResultsMap : undefined,
          onSuggestedReply: isLastAi ? (text: string) => handleSend(text) : undefined,
          onGenerateSuggestions: isLastAi && m.content ? createSuggestionGenerator(m.content) : undefined,
          tokenStats: tokenStatsMap.get(m.id),
          onSkillConfirmAction: m.skillConfirm ? handleSkillConfirmAction : undefined,
          // Branch management (对话分支功能)
          currentBranchId,
          onCreateBranch: handleCreateBranch,
          onSwitchBranch: handleSwitchBranch,
          onDeleteBranch: handleDeleteBranch,
          onRenameBranch: handleRenameBranch,
        })
      );
    });

    // Add loading indicator if waiting for response
    const lastMsg = messages[messages.length - 1];
    if (sending && lastMsg && lastMsg.role === "user") {
      messageElements.push(
        createElement(
          "div",
          {
            key: "loading",
            style: {
              ...loadingContainerStyle,
              animation: "messageSlideIn 0.3s ease-out",
            },
          },
          createElement(
            "div",
            {
              style: {
                ...loadingBubbleStyle,
                minHeight: "48px",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              },
            },
            // 添加明显的"正在思考"提示
            createElement(
              "div",
              {
                style: {
                  display: "flex",
                  alignItems: "center",
                  gap: "10px",
                  color: "var(--orca-color-text-2)",
                  fontSize: "14px",
                  fontWeight: 500,
                },
              },
              createElement("i", {
                className: "ti ti-brain",
                style: {
                  fontSize: "20px",
                  color: "var(--orca-color-primary)",
                  animation: "pulse 1.5s ease-in-out infinite",
                },
              }),
              createElement(
                "span",
                {
                  style: {
                    display: "flex",
                    alignItems: "center",
                    gap: "6px",
                  },
                },
                "AI 正在思考",
                createElement(TypingIndicator)
              )
            )
          )
        )
      );
    }

    messageListContent = messageElements;

    // Show error message with retry button if there's a network error
    // **Feature: chat-ui-enhancement**
    // **Validates: Requirements 11.3**
    if (lastError && !sending) {
      messageElements.push(
        createElement(
          "div",
          {
            key: "error-message",
            style: {
              width: "100%",
              display: "flex",
              justifyContent: "flex-start",
              marginBottom: "12px",
            },
          },
          createElement(ErrorMessage, {
            message: lastError.message,
            onRetry: handleRetry,
            isRetrying: sending,
          })
        )
      );
    }

    // 如果在闪卡模式，在消息列表末尾添加闪卡组件
    if (flashcardMode && pendingFlashcards.length > 0) {
      messageElements.push(
        createElement(
          "div",
          {
            key: "flashcard-review",
            style: {
              margin: "12px 0",
              background: "var(--orca-color-bg-2)",
              borderRadius: "12px",
              border: "1px solid var(--orca-color-border)",
              boxShadow: "0 2px 8px rgba(0, 0, 0, 0.04)",
              overflow: "hidden",
            },
          },
          // 闪卡标题栏
          createElement(
            "div",
            {
              style: {
                padding: "10px 16px",
                borderBottom: "1px solid var(--orca-color-border)",
                background: "var(--orca-color-bg-1)",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              },
            },
            createElement("i", {
              className: "ti ti-cards",
              style: { fontSize: "16px", color: "var(--orca-color-primary)" },
            }),
            createElement(
              "span",
              {
                style: {
                  fontSize: "13px",
                  fontWeight: 500,
                  color: "var(--orca-color-text-1)",
                },
              },
              "闪卡复习"
            ),
            createElement(
              "span",
              {
                style: {
                  fontSize: "12px",
                  color: "var(--orca-color-text-3)",
                  marginLeft: "auto",
                },
              },
              `共 ${pendingFlashcards.length} 张`
            )
          ),
          createElement(FlashcardReview, {
            cards: pendingFlashcards,
            initialIndex: flashcardIndex,
            initialKeptCount: flashcardKeptCount,
            initialSkippedCount: flashcardSkippedCount,
            onStateChange: (index: number, kept: number, skipped: number) => {
              setFlashcardIndex(index);
              setFlashcardKeptCount(kept);
              setFlashcardSkippedCount(skipped);
            },
            onKeepCard: async (card: Flashcard) => {
              const { saveCardToJournal } = await import("../services/flashcard-service");
              const result = await saveCardToJournal(card);
              if (result.success) {
                orca.notify("success", "已保存到今日日记");
              } else {
                orca.notify("error", result.message);
              }
            },
            onComplete: (keptCards: Flashcard[]) => {
              // 添加完成消息到聊天记录
              const keptCount = keptCards.length;
              const totalCount = pendingFlashcards.length;
              const summaryMsg: Message = {
                id: nowId(),
                role: "assistant",
                content: `✅ 闪卡复习完成！共 ${totalCount} 张卡片，已保存 ${keptCount} 张到今日日记。`,
                createdAt: Date.now(),
              };
              setMessages((prev) => [...prev, summaryMsg]);
              
              // 完成后延迟关闭闪卡界面，并重置状态
              setTimeout(() => {
                setFlashcardMode(false);
                setPendingFlashcards([]);
                setFlashcardIndex(0);
                setFlashcardKeptCount(0);
                setFlashcardSkippedCount(0);
              }, 500);
            },
            onCancel: () => {
              // 添加取消消息
              const cancelMsg: Message = {
                id: nowId(),
                role: "assistant",
                content: "闪卡复习已取消。",
                createdAt: Date.now(),
              };
              setMessages((prev) => [...prev, cancelMsg]);
              setFlashcardMode(false);
              setPendingFlashcards([]);
              setFlashcardIndex(0);
              setFlashcardKeptCount(0);
              setFlashcardSkippedCount(0);
            },
          })
        )
      );
      messageListContent = messageElements;
    }

    // 如果在多模型模式，在消息列表末尾添加多模型响应组件
    if (isMultiModelMode && multiModelResponses.length > 0) {
      messageElements.push(
        createElement(
          "div",
          {
            key: "multi-model-response",
            style: {
              margin: "16px 0",
              padding: "16px",
              background: "var(--orca-color-bg-2)",
              borderRadius: "16px",
              border: "1px solid var(--orca-color-border)",
            },
          },
          // 标题栏
          createElement(
            "div",
            {
              style: {
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: "12px",
                paddingBottom: "12px",
                borderBottom: "1px solid var(--orca-color-border)",
              },
            },
            createElement(
              "div",
              {
                style: {
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                  fontSize: "14px",
                  fontWeight: 600,
                  color: "var(--orca-color-text-1)",
                },
              },
              createElement("i", { className: "ti ti-layout-columns", style: { fontSize: "18px", color: "var(--orca-color-primary)" } }),
              `多模型对比 (${multiModelResponses.length})`
            ),
            // 关闭按钮
            createElement(
              "button",
              {
                onClick: () => {
                  setIsMultiModelMode(false);
                  setMultiModelResponses([]);
                },
                style: {
                  padding: "4px 8px",
                  border: "1px solid var(--orca-color-border)",
                  borderRadius: "4px",
                  background: "transparent",
                  color: "var(--orca-color-text-2)",
                  cursor: "pointer",
                  fontSize: "12px",
                },
              },
              "关闭对比"
            )
          ),
          // 多模型响应内容
          createElement(MultiModelResponse, {
            responses: multiModelResponses,
            layout: multiModelResponses.length <= 2 ? "side-by-side" : "stacked",
            onCopy: (modelId: string, content: string) => {
              navigator.clipboard.writeText(content).then(() => {
                orca.notify("success", "已复制到剪贴板");
              });
            },
            onAdopt: (modelId: string, content: string) => {
              // 采用某个模型的回答，添加到消息列表
              const info = getModelDisplayInfo(modelId);
              const adoptedMsg: Message = {
                id: nowId(),
                role: "assistant",
                content,
                createdAt: Date.now(),
                model: modelId,
              };
              setMessages((prev) => [...prev, adoptedMsg]);
              setIsMultiModelMode(false);
              setMultiModelResponses([]);
              orca.notify("success", `已采用 ${info.modelLabel} 的回答`);
            },
          })
        )
      );
      messageListContent = messageElements;
    }
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
      // Editable session title
      createElement(EditableTitle, {
        title: displaySessionTitle,
        onSave: (newTitle: string) => {
          if (currentSession.id) {
            handleRenameSession(currentSession.id, newTitle);
          }
        },
      }),
      // New Session Button
      withTooltip(
        "新对话",
        createElement(
          Button,
          {
            variant: "plain",
            onClick: handleNewSession,
          },
          createElement("i", { className: "ti ti-plus" })
        )
      ),
      // Todoist Button
      withTooltip(
        "Todoist 今日任务",
        createElement(
          Button,
          {
            variant: "plain",
            onClick: () => {
              todoistModalStore.viewMode = "today";
              todoistModalStore.showTaskList = true;
            },
          },
          createElement("i", { className: "ti ti-checkbox" })
        )
      ),
      // Skill Manager Button
      withTooltip(
        "技能管理",
        createElement(
          Button,
          {
            variant: "plain",
            onClick: () => setShowSkillManager(true),
          },
          createElement("i", { className: "ti ti-stars" })
        )
      ),
      // Chat History
      createElement(ChatHistoryMenu, {
        sessions,
        activeSessionId: currentSession.id,
        onSelectSession: handleSelectSession,
        onDeleteSession: handleDeleteSession,
        onClearAll: handleClearAllSessions,
        onNewSession: handleNewSession,
        onTogglePin: handleTogglePin,
        onToggleFavorite: handleToggleFavorite,
        onRename: handleRenameSession,
      }),
      // More Menu (Settings, Memory, Clear, Export)
      createElement(HeaderMenu, {
        onClearChat: clear,
        onOpenSettings: () => {
          if (orca.commands?.invokeCommand) {
            orca.commands.invokeCommand("core.openSettings");
          }
        },
        onOpenMemoryManager: handleOpenMemoryManager,
        onOpenStreamSettings: () => setShowStreamSettings(true),
        onOpenWebSearchSettings: () => setShowWebSearchSettings(true),
        onOpenVisionModelSettings: () => setShowVisionModelSettings(true),
        onOpenTodoistSettings: () => setShowTodoistSettings(true),
        onOpenMcpSettings: () => setShowMcpSettings(true),
        onExportMarkdown: () => {
          if (messages.length === 0) {
            orca.notify("warn", "没有可导出的消息");
            return;
          }
          exportSessionAsFile(currentSession);
          orca.notify("success", "已导出 Markdown 文件");
        },
        onSaveToJournal: async () => {
          if (messages.length === 0) {
            orca.notify("warn", "没有可保存的消息");
            return;
          }
          const result = await saveSessionToJournal(currentSession);
          if (result.success) {
            orca.notify("success", result.message);
          } else {
            orca.notify("error", result.message);
          }
        },
        onToggleSelectionMode: handleToggleSelectionMode,
        selectionMode,
        selectedCount: selectedMessageIds.size,
        onSaveSelected: handleSaveSelectedMessages,
      }),
      // Close Button
      withTooltip(
        "Close",
        createElement(
          Button,
          { variant: "plain", onClick: () => closeAiChatPanel(panelId) },
          createElement("i", { className: "ti ti-x" })
        )
      )
    ),
    // Message List or Empty State (wrapped in relative container for ScrollToBottomButton)
    createElement(
      "div",
      {
        style: { position: "relative", flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" },
      },
      createElement(
        "div",
        {
          ref: listRef as any,
          style: messageListStyle,
        },
        ...(Array.isArray(messageListContent) ? messageListContent : [messageListContent])
      ),
      // Scroll to Bottom Button
      // **Feature: chat-ui-enhancement**
      // **Validates: Requirements 4.2, 4.3**
      createElement(ScrollToBottomButton, {
        visible: showScrollToBottom && messages.length > 0,
        onClick: handleScrollToBottom,
      })
    ),
    // Chat Navigation (floating button)
    createElement(ChatNavigation, {
      messages,
      listRef: listRef as any,
      visible: messages.length > 2,
    }),
    // Chat Input
    createElement(ChatInput, {
      onSend: (text: string, files?: FileRef[], clearContext?: boolean) => {
        // clearContext=true 时，传递空历史给 handleSend，但不清空显示的消息
        // 这样 AI 会把这条消息当作新对话的开始，但用户仍能看到之前的消息
        return handleSend(text, files, clearContext ? [] : undefined);
      },
      onStop: stop,
      disabled: sending, // 生成时显示停止按钮
      currentPageId: rootBlockId,
      currentPageTitle,
      settings: settingsForUi,
      selectedModel,
      onModelSelect: handleModelSelect,
      onUpdateSettings: handleUpdateSettings,
      currency: settingsForUi.currency,
    }),
    // Skill Manager Modal
    createElement(SkillManagerModal, {
      isOpen: showSkillManager,
      onClose: () => setShowSkillManager(false),
    }),
    // Stream Settings Modal
    createElement(StreamSettingsModal, {
      isOpen: showStreamSettings,
      onClose: () => setShowStreamSettings(false),
    }),
    // Web Search Settings Modal
    createElement(WebSearchSettingsModal, {
      isOpen: showWebSearchSettings,
      onClose: () => setShowWebSearchSettings(false),
    }),
    // Vision Model Settings Modal
    createElement(VisionModelSettingsModal, {
      isOpen: showVisionModelSettings,
      onClose: () => setShowVisionModelSettings(false),
    }),
    // Todoist Settings Modal
    createElement(TodoistSettingsModal, {
      visible: showTodoistSettings,
      onClose: () => setShowTodoistSettings(false),
    }),
    // MCP Server Settings Modal
    createElement(McpServerSettingsModal, {
      isOpen: showMcpSettings,
      onClose: () => setShowMcpSettings(false),
    }),
    // Global Image Preview Modal
    createElement(GlobalImagePreview),
    // Todoist Modals
    createElement(TodoistModals)
  );
}
