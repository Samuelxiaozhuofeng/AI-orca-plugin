import type { PanelProps } from "../orca.d.ts";

import { buildContextForSend } from "../services/notes/context-builder";
import { contextKey, contextStore } from "../store/context-store";
import { closeAiChatPanel, getAiChatPluginName } from "../ui/ai-chat-ui";
import { uiStore } from "../store/ui-store";
import { findViewPanelById } from "../utils/panel-tree";
import { estimateTokens, formatTokenCount } from "../utils/token-utils";
import { isSameDay, formatDateSeparator, getTimeGreeting } from "../utils/chat-ui-utils";
import { withTooltip } from "../utils/orca-tooltip";
import ChatInput from "./ChatInput";
import MessageItem from "./MessageItem";
import DateSeparator from "../components/DateSeparator";
import ScrollToBottomButton from "../components/ScrollToBottomButton";
import ErrorMessage from "../components/ErrorMessage";
import ChatHistoryMenu from "./ChatHistoryMenu";
import HeaderMenu from "./HeaderMenu";
import EmptyState from "./EmptyState";
import TypingIndicator from "../components/TypingIndicator";
import ChatNavigation from "../components/ChatNavigation";
import GlobalImagePreview from "../components/GlobalImagePreview";
import { toBody } from "../utils/modal-dismiss";
import McpServerSettingsModal from "./McpServerSettingsModal";
import { injectChatStyles } from "../styles/chat-animations";
import {
  getAiChatSettings,
  getModelApiConfig,
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
import { updateSessionStore, clearSessionStore } from "../store/session-store";
import { executeTool, getToolsForDraggedContext, getTools } from "../services/ai/ai-tools";
import { nowId, safeText } from "../utils/text-utils";
import { buildConversationMessages } from "../services/ai/message-builder";
import { streamChatWithRetry, type ToolCallInfo } from "../services/ai/chat-stream-handler";
import { buildLocalCliContext } from "../services/ai/local-cli-context";
import { LOCAL_CLI_ABORT_NOTE, BANNER_RE, bannerOf, getLastLocalCliMode, type LocalCliRun } from "../services/ai/local-cli-client";
import { pickLocalCliResume } from "../services/ai/local-cli-resume";
import { createChatRequestOwner, loadIfLatest } from "../utils/chat-request-owner";
import { createPendingSave } from "../utils/pending-save";
import { sanitizeContent } from "../services/ai/openai-client";
import {
  createSyntheticToolErrorMessage,
  createToolCallSignature,
  resolveToolCallName,
} from "../services/ai/tool-call-router";
import { createToolRoundLimit } from "../services/ai/tool-round-limit";
import { ensureMcpServersReady } from "../services/external/mcp-server-manager";
import {
  panelContainerStyle,
  headerStyle,
  headerTitleStyle,
  messageListStyle,
  loadingContainerStyle,
  loadingBubbleStyle,
} from "../styles/ai-chat-styles";
import {
  createBranch,
  switchBranch,
  stashCurrentBranch,
  deleteBranch,
  renameBranch,
} from "../services/branch-service";

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
    if (!(e.nativeEvent?.isComposing || e.keyCode === 229) && e.key === "Enter") {
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

  // MCP server settings modal state
  const [showMcpSettings, setShowMcpSettings] = useState(false);

  // Message selection mode state (for batch save)
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedMessageIds, setSelectedMessageIds] = useState<Set<string>>(new Set());



  // Scroll to bottom button state
  // **Feature: chat-ui-enhancement**
  // **Validates: Requirements 4.2, 4.3**
  const [showScrollToBottom, setShowScrollToBottom] = useState(false);

  const listRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // 删消息 / 回档 / 分支变动就 +1：本机 AI 一轮准备或进行中历史被改过，不续接、收尾也不记续接点
  const ccHistoryGenRef = useRef(0);
  // 新对话 / 切换对话时作废旧请求；handleSend 内用它包装界面写入（消息、错误、生成状态）
  const chatOwnerRef = useRef(createChatRequestOwner());
  // 对话选择的归属：只有最后一次选择 / 新建的加载结果才上屏
  const selectionOwnerRef = useRef(createChatRequestOwner());
  const setMessagesUnguarded = setMessages;
  const setLastErrorUnguarded = setLastError;
  const setSendingUnguarded = setSending;
  const setStreamingMessageIdUnguarded = setStreamingMessageId;
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
  const updateMessageUnguarded = updateMessage;

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

    // 读列表之前就登记归属：读的途中用户已新建 / 切换对话，就不再恢复上次的活动对话，免得盖掉用户的选择
    loadIfLatest(selectionOwnerRef.current, async () => {
      const data = await loadSessions();
      setSessions(data.sessions);
      // 加载完整会话数据（包含消息）
      return data.activeSessionId ? loadFullSession(data.activeSessionId) : null;
    }).then((active) => {
      if (active) {
        // 恢复会话
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
      setSessionsLoaded(true);
    });
  }, []);

  // 自动保存的防抖（1 秒）；离开对话前 flush，免得最后一条回复还没存就被取消
  const [pendingSave] = useState(() => createPendingSave(1000));
  // 新建 / 切换对话的序号：切换中途等待时又点了别的，只认最后一次
  const switchSeqRef = useRef(0);

  // 作废进行中的请求：中止（本机 AI 会随之结束子进程、关闭确认弹窗）、
  // 清掉生成状态；旧请求之后的界面写入一律丢弃
  const abandonCurrentRequest = () => {
    chatOwnerRef.current.invalidate();
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = null;
    setSending(false);
    setStreamingMessageId(null);
  };

  const handleNewSession = useCallback(() => {
    const pluginName = getAiChatPluginName();
    const settings = getAiChatSettings(pluginName);
    const defaultModel = settings.selectedModelId;

    switchSeqRef.current++;
    abandonCurrentRequest();
    selectionOwnerRef.current.invalidate();
    // 立即补存离开的对话（快照此刻同步拍下；写入串行，先于新对话的保存落地）
    void pendingSave.flush();

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
  }, [currentSession.id]);

  // preloaded：已在手的对话（如笔记里聊天块的副本），不从存档读
  const handleSelectSession = useCallback(async (sessionId: string, preloaded?: SavedSession) => {
    const seq = ++switchSeqRef.current;
    // 点的就是界面上正显示的对话：界面已是最新，不重读（重读可能拿到旧缓存盖掉新消息）；
    // 序号已自增，切走途中又点回来时，那次还没完成的切换会作废
    if (sessionId === currentSession.id) return;
    // 切换对话：中止进行中的生成（旧请求的后续写入一律丢弃），并补存离开的对话
    abandonCurrentRequest();
    // 快照已当场拍下；等写完再读目标对话，快速切回时才读得到刚补存的内容
    await pendingSave.flush();
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
    const session = await loadIfLatest(selectionOwnerRef.current, async () => preloaded ?? loadFullSession(sessionId));
    // 没加载到，或期间又选了别的 / 新建了对话
    if (!session || seq !== switchSeqRef.current) return;
    // 等待期间输入框可用，这时发出的请求属于离开的对话，作废掉免得回复写进目标对话
    abandonCurrentRequest();
    // 等待期间对离开的对话做的修改（如换文件夹）也补存，免得被下面的整体替换取消
    void pendingSave.flush();

    setCurrentSession({
      ...session,
      model: (session.model || "").trim() || defaultModel,
    });
    setMessages(session.messages.length > 0 ? session.messages : []);
    contextStore.selected = session.contexts || [];

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
    const deletingCurrent = currentSession.id === sessionId;
    // 删当前对话：先停掉生成，免得删的过程中又登记保存把它写回来
    if (deletingCurrent) abandonCurrentRequest();
    await pendingSave.flush();
    await deleteSession(sessionId);
    const data = await loadSessions();
    setSessions(data.sessions);
    if (deletingCurrent) {
      pendingSave.cancel();
      handleNewSession();
    }
  }, [currentSession.id, handleNewSession]);

  const handleClearAllSessions = useCallback(async () => {
    // 先存好当前对话，再按服务里的最新索引（补存可能改了收藏状态）判断它会不会被清掉；
    // 会被清掉就先停生成再补存一次，免得删的过程中又登记保存把它写回来
    await pendingSave.flush();
    const latest = await loadSessions();
    if (!latest.sessions.find(s => s.id === currentSession.id)?.favorited) {
      abandonCurrentRequest();
      await pendingSave.flush();
    }
    await clearAllSessions();
    const data = await loadSessions();
    setSessions(data.sessions);
    // 如果当前会话被清理了，切换到剩余会话或创建新会话
    if (!data.sessions.find(s => s.id === currentSession.id)) {
      pendingSave.cancel();
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

  // Auto-cache session when messages change (debounced)
  useEffect(() => {
    const hasRealMessages = messages.some((m) => !m.localOnly);
    if (!hasRealMessages || !sessionsLoaded) return;

    // Debounce auto-cache to avoid too frequent saves
    // 两步：触发时先同步拍下离开时的快照（滚动位置等），再排队写入
    pendingSave.schedule(() => {
      const sessionToCache: SavedSession = {
        ...currentSession,
        messages,
        contexts: [...contextSnap.selected],
        scrollPosition: listRef.current?.scrollTop ?? currentSession.scrollPosition,
      };
      return async () => {
        await autoCacheSession(sessionToCache);
        const data = await loadSessions();
        setSessions(data.sessions);
      };
    });

    return () => pendingSave.cancel();
  }, [messages, currentSession, sessionsLoaded, contextSnap.selected]);

  // 笔记里聊天块点「继续对话」：按切换对话的流程载入那份副本（面板已开或刚打开都走这里）
  useEffect(() => {
    const copy = uiStore.pendingChatSession;
    if (!copy) return;
    uiStore.pendingChatSession = null;
    void handleSelectSession(copy.id, JSON.parse(JSON.stringify(copy)));
  }, [uiSnap.pendingChatSession]);

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
    const ccHistoryGenAtSend = ccHistoryGenRef.current;
    if (!content && (!files || files.length === 0)) return;

    // 归属登记：作废并中止上一请求；被接替或换对话后，本次请求的界面写入一律丢弃，
    // 中止器生来即中止、不登记进 abortRef
    const req = chatOwnerRef.current.begin();
    const setMessages = req.guard(setMessagesUnguarded);
    const setLastError = req.guard(setLastErrorUnguarded);
    const setSending = req.guard(setSendingUnguarded);
    const setStreamingMessageId = req.guard(setStreamingMessageIdUnguarded);
    const updateMessage = req.guard(updateMessageUnguarded);

    // 如果正在生成：上一请求已在 begin() 中止，它的收尾作废，由本次请求接管生成状态
    if (sending) {
      setSending(false);
      setStreamingMessageId(null);
      // 等待一小段时间让 abort 生效
      await new Promise(resolve => setTimeout(resolve, 100));
      if (!req.isCurrent()) return;
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
	    if (!req.isCurrent()) return;
	    // 0 表示不设置固定工具轮数上限，依靠重复/错误/取消等状态退出（Codex 式 agent loop）。
	    const toolRoundLimit = runtimeConfig.maxToolRounds;
	    const toolRoundController = createToolRoundLimit(toolRoundLimit);

	    // 系统提示词
	    const systemPrompt = buildDynamicSystemPrompt({
      hasMcpTools: getDiscoveredTools().length > 0,
      hasDraggedContext: contextStore.selected.length > 0,
      repoId: getCurrentRepoId(),
    });

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
    if (!req.isCurrent()) return;

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

    // 用户发送消息时，重置为自动滚动状态并滚动到底部
    isNearBottomRef.current = true;
    queueMicrotask(scrollToBottom);

    const userMsgForApi: Message = {
      id: userMsg.id, 
      role: "user", 
      content, 
      createdAt: userMsg.createdAt,
      files: userMsg.files,
    };

    const aborter = req.newAborter(abortRef);
    // 本机 AI 续接：本轮运行结果与回复消息 id，收尾时写回（只写回仍属本请求的对话）
    const setCurrentSessionGuarded = req.guard(setCurrentSession);
    const ccRun: LocalCliRun = {};
    let ccAssistantId: string | null = null;
    let ccPartial = false;
    let ccErrored = false;
    // 本次流里创建的助手消息（思考 / 正文各一条时各记一条），流结束时写 durationMs
    // start = 模型第一个字到达的时刻；本机 AI 的模式横幅不算输出，横幅之后才开始计时
    const streamedMsgs: Array<{ id: string; start?: number }> = [];
    const isBannerOnly = (text: string) => text.replace(BANNER_RE, "") === "";
    const stampDurations = () => {
      const pending = streamedMsgs.splice(0).filter((p) => p.start !== undefined);
      if (pending.length === 0) return;
      const now = Date.now();
      setMessages((prev) => prev.map((m) => {
        const hit = pending.find((p) => p.id === m.id);
        return hit ? { ...m, durationMs: now - hit.start! } : m;
      }));
    };

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
- For Orca Note notes, journals, pages, blocks, tags, timeline extraction, or local repository content, prefer the matching mcp__orca-note__* tool.
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

      // 获取模型特定的 API 配置
      const apiConfig = getModelApiConfig(settings, model);

      // 根据是否有拖入的块来选择工具列表
      // 有拖入块时禁用搜索类工具，强制 AI 使用已提供的上下文
      const hasHighPriorityContext = highPriorityContexts.length > 0;

      const baseTools = hasHighPriorityContext
        ? getToolsForDraggedContext()
        : getTools();

      
      // 检查模型是否支持原生 function calling
      const supportsTools = modelSupportsTools(settings, model);
      
      // 调试日志：显示加载的工具数量
      if (baseTools.length > 0) {
        if (supportsTools) {
          console.log(`[AiChatPanel] 工具: ${baseTools.length} 个工具`);
        } else {
          console.log(`[AiChatPanel] 模型 ${model} 不支持 tools 能力，跳过工具加载`);
        }
      }
      // 只有当模型支持 tools 时才传递工具，避免不支持的模型输出 XML 格式
      const toolsToUse = supportsTools && baseTools.length > 0 ? baseTools : undefined;
      const availableExecutionTools = baseTools;

      const toolAwareSystemPrompt = buildToolContractSystemPrompt(
        systemPrompt,
        availableExecutionTools.length > 0 ? availableExecutionTools : toolsToUse,
      );

      const { standard: apiMessages, fallback: apiMessagesFallback } = await buildConversationMessages({
        messages: conversation,
        systemPrompt: toolAwareSystemPrompt,
        contextText,
        maxHistoryMessages: settings.maxHistoryMessages,
        modelId: model,
      });

      // 获取模型的上下文长度限制
      const modelContextLength = getModelContextLength(settings, model);

      // 历史在准备期间被改过就不续接；决定续接后先撤掉旧续接点，只由本请求正常 / 停止收尾写回新的
      const ccResume = apiConfig.protocol === "local-cli" && req.isCurrent() && ccHistoryGenRef.current === ccHistoryGenAtSend
        ? pickLocalCliResume(baseMessages, currentSession.ccHead)
        : undefined;
      if (ccResume) setCurrentSessionGuarded((prev) => ({ ...prev, ccHead: undefined }));

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
          timeoutMs: 30000,
          maxContextTokens: modelContextLength,
          localCli: apiConfig.protocol === "local-cli"
            ? buildLocalCliContext(currentSession.id, {
                contextText,
                workDir: currentSession.workDir,
                resume: ccResume,
                run: ccRun,
                isCurrent: req.isCurrent,
              })
            : undefined,
        },
        apiMessages,
        apiMessagesFallback,
      )) {
        if (chunk.type === "reasoning" || (chunk.type === "content" && !(apiConfig.protocol === "local-cli" && isBannerOnly(chunk.content)))) {
          const t = Date.now();
          for (const p of streamedMsgs) p.start ??= t;
        }
        if (chunk.type === "reasoning") {
          // 第一次收到 reasoning 时，创建独立的 reasoning 消息
          if (!reasoningMessageId) {
            reasoningMessageId = nowId();
            reasoningCreatedAt = Date.now();
            streamedMsgs.push({ id: reasoningMessageId, start: reasoningCreatedAt });
            setStreamingMessageId(reasoningMessageId);
            currentReasoning = chunk.reasoning;
            setMessages((prev) => [...prev, { 
              id: reasoningMessageId!, 
              role: "assistant", 
              content: "", 
              reasoning: currentReasoning,
              createdAt: reasoningCreatedAt!,
              model,
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
            streamedMsgs.push({ id: assistantId, start: apiConfig.protocol === "local-cli" && isBannerOnly(chunk.content) ? undefined : assistantCreatedAt });
            setStreamingMessageId(assistantId);
            setMessages((prev) => [...prev, {
              id: assistantId,
              role: "assistant",
              content: sanitizeContent(chunk.content),
              createdAt: assistantCreatedAt,
              model,
            }]);
            currentContent = sanitizeContent(chunk.content);
            reasoningMessageId = assistantId; // 复用这个 ID 作为 assistant ID
          } else if (currentContent === "") {
            // reasoning 完成，创建新的 assistant 消息
            setStreamingMessageId(null); // 停止 reasoning 的流式状态
            stampDurations(); // 思考消息到此结束
            const assistantId = nowId();
            const assistantCreatedAt = Date.now();
            streamedMsgs.push({ id: assistantId, start: assistantCreatedAt });
            setStreamingMessageId(assistantId);
            setMessages((prev) => [...prev, {
              id: assistantId,
              role: "assistant",
              content: sanitizeContent(chunk.content),
              createdAt: assistantCreatedAt,
              model,
            }]);
            currentContent = sanitizeContent(chunk.content);
            reasoningMessageId = assistantId; // 更新为 assistant ID
          } else {
            // 继续追加 content
            currentContent = sanitizeContent(currentContent + chunk.content);
            updateMessage(reasoningMessageId, { content: currentContent });
          }
        } else if (chunk.type === "tool_calls") {
          toolCalls = chunk.toolCalls;
        } else if (chunk.type === "done" && chunk.result) {
          // 使用 DSML 清洗后的最终内容，确保 invoke 标签不进入历史
          if (chunk.result.content !== undefined) {
            currentContent = sanitizeContent(chunk.result.content);
            if (reasoningMessageId) {
              updateMessage(reasoningMessageId, { content: currentContent });
            }
          }
          if (chunk.result.toolCalls?.length) {
            toolCalls = chunk.result.toolCalls;
          }
        }
        ccAssistantId = reasoningMessageId;
      }

      stampDurations();
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
        }]);
      } else if (!hasAssistantMessage && currentContent) {
        // 有些兼容网关只在 done 阶段返回最终正文，此时也需要补建消息气泡。
        setMessages((prev) => [...prev, {
          id: assistantId,
          role: "assistant",
          content: sanitizeContent(currentContent),
          createdAt: assistantCreatedAt,
          model,
        }]);
      } else if (!hasAssistantMessage && !currentContent && toolCalls.length > 0) {
        // 只有 tool calls，创建空 content 的 assistant 消息
        setMessages((prev) => [...prev, { 
          id: assistantId, 
          role: "assistant", 
          content: "", 
          createdAt: assistantCreatedAt,
          model,
        }]);
      }
      ccAssistantId = assistantId;

	      conversation.push({
	        id: assistantId,
	        role: "assistant",
	        content: sanitizeContent(currentContent),
	        createdAt: assistantCreatedAt,
	        tool_calls: toolCalls.length > 0 ? toolCalls : undefined,
	        ...(reasoningMessageId ? { reasoning: currentReasoning } : {}),
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

        // ── 并行执行无需确认的工具 ──────────────────────────────────────
        const toolResultMessages: Message[] = [...preToolResultMessages];
        if (executableToolCalls.length > 0) {
          const parallelResults = await Promise.all(
            executableToolCalls.map(tc => executeSingleToolCall(tc))
          );
          toolResultMessages.push(...parallelResults);
        }

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
              timeoutMs: 30000,
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
                streamedMsgs.push({ id: nextReasoningMessageId, start: nextReasoningCreatedAt });
                setStreamingMessageId(nextReasoningMessageId);
                nextReasoning = chunk.reasoning;
                setMessages((prev) => [...prev, { 
                  id: nextReasoningMessageId!, 
                  role: "assistant", 
                  content: "", 
                  reasoning: chunk.reasoning,
                  createdAt: nextReasoningCreatedAt!,
                  model,
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
                streamedMsgs.push({ id: nextAssistantId, start: nextAssistantCreatedAt });
                setStreamingMessageId(nextAssistantId);
                setMessages((prev) => [...prev, {
                  id: nextAssistantId,
                  role: "assistant",
                  content: sanitizeContent(chunk.content),
                  createdAt: nextAssistantCreatedAt,
                  model,
                }]);
                nextContent = sanitizeContent(chunk.content);
                nextReasoningMessageId = nextAssistantId;
              } else if (nextContent === "") {
                // reasoning 完成，创建新的 assistant 消息
                setStreamingMessageId(null);
                stampDurations(); // 思考消息到此结束
                const nextAssistantId = nowId();
                const nextAssistantCreatedAt = Date.now();
                streamedMsgs.push({ id: nextAssistantId, start: nextAssistantCreatedAt });
                setStreamingMessageId(nextAssistantId);
                setMessages((prev) => [...prev, {
                  id: nextAssistantId,
                  role: "assistant",
                  content: sanitizeContent(chunk.content),
                  createdAt: nextAssistantCreatedAt,
                  model,
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

        stampDurations();
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
            }]);
          }
        } else if (nextContent.trim().length > 0 && !nextReasoningMessageId) {
          setMessages((prev) => [...prev, {
            id: nextAssistantId,
            role: "assistant",
            content: sanitizeContent(nextContent),
            createdAt: nextAssistantCreatedAt,
            model,
          }]);
        }

        // If the model returned nothing, surface a controlled fallback so the user isn't left with an empty bubble.
        if (nextContent.trim().length === 0 && nextToolCalls.length === 0) {
          const toolFallback = sanitizeContent(allToolResultMessages.map((m) => m.content).join("\n\n").trim());
          const fallbackText = recoveryReason
            ? buildEmptyToolRecoveryText(recoveryReason, toolResultMessages)
            : toolFallback || "(empty response from API)";
          if (nextReasoningMessageId) {
            updateMessage(nextReasoningMessageId, { content: fallbackText });
          } else {
            setMessages((prev) => [...prev, { 
              id: nextAssistantId, 
              role: "assistant", 
              content: fallbackText, 
              createdAt: nextAssistantCreatedAt,
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
      ccPartial = true;
      const isAbort = String(err?.name ?? "") === "AbortError";
      ccErrored = !isAbort;
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

      // 本机 AI 中止：在原消息末尾注明已执行的操作不会撤销（setMessages 已校验仍属当前对话）
      const isLocalCli = getModelApiConfig(settings, model).protocol === "local-cli";
      const localCliAbort = isAbort && isLocalCli;
      setMessages((prev) => {
        const lastIdx = prev.findIndex((m, i) => m.role === "assistant" && i === prev.length - 1);
        if (lastIdx >= 0) {
          return prev.map((m, i) => {
            if (i !== lastIdx) return m;
            if (localCliAbort) return { ...m, content: m.content ? `${m.content}\n\n${LOCAL_CLI_ABORT_NOTE}` : LOCAL_CLI_ABORT_NOTE };
            // 本机 AI 出错：正文开头已有模式行，错误要追加而不是被 || 吞掉
            if (!isAbort && isLocalCli && m.content) return { ...m, content: `${m.content}\n\n(error) ${msg}` };
            return { ...m, content: m.content || (isAbort ? "(stopped)" : `(error) ${msg}`) };
          });
        }
        return prev;
      });
    } finally {
      stampDurations(); // 停止 / 出错时流没走到正常结尾，这里补写
      // 新中转报了会话（正常 / 停止 / 出错都算）：记到本轮回复上，并记为对话的续接点；续接失败且没新会话 → 清掉续接点
      const ccSid = ccRun.sid;
      const ccMsgId = ccAssistantId;
      // 出错（非停止）或本轮进行中删过消息：不记续接点，下次整段新开
      const ccHeadOk = !ccErrored && ccHistoryGenRef.current === ccHistoryGenAtSend;
      if (ccSid && ccMsgId) {
        updateMessage(ccMsgId, { cc: { sid: ccSid, ...(ccRun.uuid ? { uuid: ccRun.uuid } : {}), ...(ccPartial ? { partial: true as const } : {}) } });
        setCurrentSessionGuarded((prev) => ({ ...prev, ccHead: ccHeadOk ? { sid: ccSid, msgId: ccMsgId } : undefined }));
      } else if (ccRun.resumeFailed || !ccHeadOk) {
        setCurrentSessionGuarded((prev) => ({ ...prev, ccHead: undefined }));
      }
      if (abortRef.current === aborter) abortRef.current = null;
      setSending(false);
      setStreamingMessageId(null);
      queueMicrotask(scrollToBottom);
    }
  }

  // 重试 / 重新生成的回调按 messages 等缓存，直接调 handleSend 会拿到旧渲染里的会话（旧模型、旧文件夹）
  const handleSendRef = useRef(handleSend);
  handleSendRef.current = handleSend;

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
        handleSendRef.current(content, lastUserMsg.files, historyBeforeUser);
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
    handleSendRef.current(content, files, historyOverride);
  }, [sending, lastError]);


  function clear() {
    // 作废进行中的请求（含还在准备、没开始生成的），免得它之后又把回复写进清空后的对话
    abandonCurrentRequest();
    invalidateCcHead();
    setMessages([]);
    setLastError(null);
    // 空状态立刻同步进关闭补存和存档：不然关面板时会把清空前的快照写回去，再打开旧内容复活
    const emptied: SavedSession = { ...currentSession, ccHead: undefined, messages: [], contexts: [...contextSnap.selected] };
    updateSessionStore(emptied, [], emptied.contexts);
    pendingSave.schedule(() => async () => {
      // 从没存过的对话不必留一条空记录
      const data = await loadSessions();
      if (!data.sessions.some((s) => s.id === emptied.id)) return;
      await autoCacheSession(emptied);
      setSessions((await loadSessions()).sessions);
    });
    void pendingSave.flush();
  }

  function stop() {
    if (abortRef.current) abortRef.current.abort();
  }

  // 历史被删 / 回档 / 换分支：本机 AI 下次不直接续接，整段新开；进行中的那轮收尾也不再记续接点
  const invalidateCcHead = useCallback(() => {
    ccHistoryGenRef.current++;
    setCurrentSession((prev) => (prev.ccHead ? { ...prev, ccHead: undefined } : prev));
  }, []);

  // 删除单条消息
  const handleDeleteMessage = useCallback((messageId: string) => {
    const target = messages.find((m) => m.id === messageId);
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
    // 删了 AI 看过的内容：下次本机 AI 不直接续接，整段新开
    if (target && !target.localOnly) invalidateCcHead();
  }, [messages, invalidateCcHead]);

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
    invalidateCcHead();
    setMessages((prev) => {
      const index = prev.findIndex((m) => m.id === messageId);
      if (index <= 0) return prev; // 不能回档到第一条消息之前
      return prev.slice(0, index);
    });
  }, [invalidateCcHead]);

  // ─────────────────────────────────────────────────────────────────────────
  // Branch Management Callbacks (对话分支功能)
  // ─────────────────────────────────────────────────────────────────────────

  const handleCreateBranch = useCallback((messageId: string) => {
    try {
      console.log("[Branch] Creating branch at message:", messageId);
      console.log("[Branch] Current messages:", messages.length);
      // createBranch(messages, messageId, branchName?) -> { messages: Message[]; branchId: string }
      // 已在某个分支里：先把它的内容存回去，再开新分支
      const result = createBranch(stashCurrentBranch(messages, messageId), messageId);
      // 换掉分支点之后的内容前停掉生成，免得后面的回复写进另一个分支
      abandonCurrentRequest();
      console.log("[Branch] Result:", {
        branchId: result.branchId,
        messagesCount: result.messages.length,
        lastMessage: result.messages[result.messages.length - 1],
        hasBranches: result.messages[result.messages.length - 1]?.branches?.length,
      });
      invalidateCcHead();
      setMessages(result.messages);
      orca.notify("success", `已创建新分支，当前在分支: ${result.branchId.slice(0, 10)}...`);
    } catch (err: any) {
      console.error("[Branch] Create failed:", err);
      orca.notify("error", err?.message || "创建分支失败");
    }
  }, [messages]);

  const handleSwitchBranch = useCallback((messageId: string, branchId: string) => {
    try {
      // 先把离开的分支存回去，再换成目标分支的内容
      // 点的就是正显示的分支：什么都不做，也不打断生成
      if (messages.find((m) => m.id === messageId)?.activeBranchId === branchId) return;
      const updatedMessages = switchBranch(stashCurrentBranch(messages, messageId), messageId, branchId);
      abandonCurrentRequest();
      invalidateCcHead();
      setMessages(updatedMessages);
      orca.notify("success", "已切换分支");
    } catch (err: any) {
      orca.notify("error", err?.message || "切换分支失败");
    }
  }, [messages]);

  const handleDeleteBranch = useCallback((messageId: string, branchId: string) => {
    try {
      // deleteBranch(messages, branchPointId, branchId) -> Message[]
      let updatedMessages = deleteBranch(messages, messageId, branchId);
      // 删的是正显示的分支：改显示剩下的第一个分支（删掉的内容不再存回）
      const point = updatedMessages.find((m) => m.id === messageId);
      if (point?.activeBranchId === branchId && point.branches?.length && point.branches.every((b) => b.id !== branchId)) {
        updatedMessages = switchBranch(updatedMessages, messageId, point.branches[0].id);
        abandonCurrentRequest();
      }
      invalidateCcHead();
      setMessages(updatedMessages);
      orca.notify("success", "已删除分支");
    } catch (err: any) {
      orca.notify("error", err?.message || "删除分支失败");
    }
  }, [messages]);

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

  // 本机 AI 工作文件夹：写进当前会话，随会话自动保存
  const handleWorkDirChange = useCallback((workDir: string | undefined) => {
    setCurrentSession((prev) => ({ ...prev, workDir }));
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

    // 计算系统开销 token（系统提示 + 上下文）
    const systemPromptTokens = estimateTokens(buildDynamicSystemPrompt());
    // 上下文 token 在 ChatInput 中已经显示，这里只计算基础开销
    const baseOverheadTokens = systemPromptTokens;

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

    // 本机 AI 模式行：和上一条回复的一样就不显示（只在首条和模型/模式/文件夹变了时显示）
    let prevBanner: string | null = null;
    messages.forEach((m, i) => {
      let shown = m;
      if (m.role === "assistant") {
        const banner = bannerOf(m.content);
        if (banner && banner === prevBanner) shown = { ...m, content: m.content.replace(BANNER_RE, "") };
        if (banner) prevBanner = banner;
      }
      // 跳过普通 tool 消息，它们会被合并到 assistant 消息的工具调用区域
      if (m.role === "tool") return;
      // 旧数据兼容：隐藏旧版技能确认 / 草稿卡片（只跳过渲染，不改存档）
      if (m.skillConfirm || m.skillDraft) return;

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
          message: shown,
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
          // Branch management (对话分支功能)
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
      // Chat History
      createElement(ChatHistoryMenu, {
        sessions,
        activeSessionId: currentSession.id,
        onSelectSession: handleSelectSession,
        onDeleteSession: handleDeleteSession,
        onClearAll: handleClearAllSessions,
        onTogglePin: handleTogglePin,
        onToggleFavorite: handleToggleFavorite,
        onRename: handleRenameSession,
      }),
      // More Menu (Settings, Clear, Export)
      createElement(HeaderMenu, {
        onClearChat: clear,
        onOpenSettings: () => {
          if (orca.commands?.invokeCommand) {
            orca.commands.invokeCommand("core.openSettings");
          }
        },
        onOpenMcpSettings: () => setShowMcpSettings(true),
        onExportMarkdown: () => {
          if (messages.length === 0) {
            orca.notify("warn", "没有可导出的消息");
            return;
          }
          exportSessionAsFile({ ...currentSession, messages });
          orca.notify("success", "已导出 Markdown 文件");
        },
        onSaveToJournal: async () => {
          if (messages.length === 0) {
            orca.notify("warn", "没有可保存的消息");
            return;
          }
          const result = await saveSessionToJournal({ ...currentSession, messages });
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
      onSend: (text: string, files?: FileRef[]) => handleSend(text, files),
      onClearChat: clear,
      onStop: stop,
      disabled: sending, // 生成时显示停止按钮
      currentPageId: rootBlockId,
      currentPageTitle,
      settings: settingsForUi,
      selectedModel,
      onModelSelect: handleModelSelect,
      onUpdateSettings: handleUpdateSettings,
      workDir: currentSession.workDir,
      onWorkDirChange: handleWorkDirChange,
      // 中转是全局一个模式：先看本次运行中转报告的，没有再看本对话最近一条模式行
      localCliFullAccess: (getLastLocalCliMode() ?? ([...messages].reverse().map((m) => m.role === "assistant" ? bannerOf(m.content) : null).find(Boolean)?.includes("完全放开") ? "full" : null)) === "full",
    }),
    // MCP Server Settings Modal
    toBody(createElement(McpServerSettingsModal, {
      isOpen: showMcpSettings,
      onClose: () => setShowMcpSettings(false),
    })),
    // Global Image Preview Modal
    toBody(createElement(GlobalImagePreview))
  );
}
