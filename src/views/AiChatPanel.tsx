import type { PanelProps } from "../orca.d.ts";

import { buildContextForSend } from "../services/context-builder";
import { contextStore, type ContextRef } from "../store/context-store";
import { closeAiChatPanel, getAiChatPluginName } from "../ui/ai-chat-ui";
import { uiStore } from "../store/ui-store";
import { memoryStore } from "../store/memory-store";
import { getMode } from "../store/chat-mode-store";
import { findViewPanelById } from "../utils/panel-tree";
import { generateSuggestedReplies } from "../services/suggestion-service";
import ChatInput from "./ChatInput";
import MarkdownMessage from "../components/MarkdownMessage";
import MessageItem from "./MessageItem";
import ChatHistoryMenu from "./ChatHistoryMenu";
import HeaderMenu from "./HeaderMenu";
import EmptyState from "./EmptyState";
import LoadingDots from "../components/LoadingDots";
import MemoryManager from "./MemoryManager";
import ChatNavigation from "../components/ChatNavigation";
import FlashcardReview, { type Flashcard } from "../components/FlashcardReview";
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
  deleteSession,
  clearAllSessions,
  createNewSession,
  toggleSessionPinned,
  toggleSessionFavorited,
  renameSession,
  autoCacheSession,
  type SavedSession,
  type Message,
  type FileRef,
} from "../services/session-service";
import { sessionStore, updateSessionStore, clearSessionStore } from "../store/session-store";
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

  // Flashcard review state
  const [flashcardMode, setFlashcardMode] = useState(false);
  const [pendingFlashcards, setPendingFlashcards] = useState<Flashcard[]>([]);

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

  const handleNewSession = useCallback(() => {
    const pluginName = getAiChatPluginName();
    const settings = getAiChatSettings(pluginName);
    const defaultModel = resolveAiModel(settings);

    setCurrentSession({ ...createNewSession(), model: defaultModel });
    setMessages([
      {
        id: nowId(),
        role: "assistant",
        content: "新对话已开始，有什么可以帮你的吗？",
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
  const autoCacheTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const hasRealMessages = messages.some((m) => !m.localOnly);
    if (!hasRealMessages || !sessionsLoaded) return;

    // Debounce auto-cache to avoid too frequent saves
    if (autoCacheTimeoutRef.current) {
      clearTimeout(autoCacheTimeoutRef.current);
    }
    autoCacheTimeoutRef.current = setTimeout(async () => {
      const sessionToCache: SavedSession = {
        ...currentSession,
        messages,
        contexts: [...contextStore.selected],
      };
      await autoCacheSession(sessionToCache);
      const data = await loadSessions();
      setSessions(data.sessions);
    }, 2000); // 2 second debounce

    return () => {
      if (autoCacheTimeoutRef.current) {
        clearTimeout(autoCacheTimeoutRef.current);
      }
    };
  }, [messages, currentSession, sessionsLoaded]);

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

  async function handleSend(content: string, files?: FileRef[], historyOverride?: Message[]) {
    if ((!content && (!files || files.length === 0)) || sending) return;

	    const pluginName = getAiChatPluginName();
	    const settings = getAiChatSettings(pluginName);
	    // 工具调用最大轮数：可在设置中配置；若缺失则默认 5（向后兼容）
	    const MAX_TOOL_ROUNDS = settings.maxToolRounds || 5;
	    // 系统提示词模板变量：支持 {maxToolRounds}，按当前 MAX_TOOL_ROUNDS 注入
	    let systemPrompt = settings.systemPrompt.split("{maxToolRounds}").join(String(MAX_TOOL_ROUNDS));

	    // 检测用户指令并追加格式要求
	    let processedContent = content;
	    
	    // /timeline - 时间线格式
	    if (content.includes("/timeline")) {
	      processedContent = processedContent.replace(/\/timeline/g, "").trim();
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
7. 按时间顺序排列`;
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

	    // /localgraph - 链接关系图谱（直接调用工具，不走 AI）
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
	      
	      // 直接调用 executeTool 生成图谱
	      import("../services/ai-tools").then(async ({ executeTool }) => {
	        let toolArgs: any = {};
	        
	        if (cleanedQuery) {
	          // 检查是否是 blockId 格式：纯数字、blockid 123、blockid:123
	          const blockIdMatch = cleanedQuery.match(/^(?:blockid[:\s]*)?(\d+)$/i);
	          if (blockIdMatch) {
	            toolArgs = { blockId: parseInt(blockIdMatch[1], 10) };
	          } else {
	            // 否则当作页面名称
	            toolArgs = { pageName: cleanedQuery };
	          }
	        } else {
	          // 使用当前打开的页面
	          try {
	            const activePanel = orca.state.activePanel;
	            if (activePanel && activePanel !== uiStore.aiChatPanelId) {
	              const vp = orca.nav.findViewPanel(activePanel, orca.state.panels);
	              if (vp?.view === "block" && vp.viewArgs?.blockId) {
	                toolArgs = { blockId: vp.viewArgs.blockId };
	              }
	            }
	          } catch {}
	        }
	        
	        if (!toolArgs.pageName && !toolArgs.blockId) {
	          const assistantMsg: Message = {
	            id: nowId(),
	            role: "assistant",
	            content: "请先选择一个页面，或指定页面名称，例如：/localgraph 阿拉丁",
	            createdAt: Date.now(),
	          };
	          setMessages((prev) => [...prev, assistantMsg]);
	          return;
	        }
	        
	        const result = await executeTool("getBlockLinks", toolArgs);
	        const assistantMsg: Message = {
	          id: nowId(),
	          role: "assistant",
	          content: result,
	          createdAt: Date.now(),
	        };
	        setMessages((prev) => [...prev, assistantMsg]);
	        queueMicrotask(scrollToBottom);
	      });
	      
	      return; // 直接返回，不走 AI
	    }

	    // /card - 闪卡生成模式（直接进入交互界面，不显示 AI 文本回复）
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
	      
	      // 构建闪卡生成的提示
	      const { getFlashcardSystemPrompt, parseFlashcards } = await import("../services/flashcard-service");
	      const flashcardSystemPrompt = systemPrompt + "\n\n" + getFlashcardSystemPrompt();
	      
	      let flashcardPrompt = cardTopic 
	        ? `请结合我们之前的对话，生成关于「${cardTopic}」的闪卡`
	        : "请根据我们的对话内容生成闪卡";
	      
	      // 构建对话历史（用于 AI 理解上下文）
	      // 过滤掉 localOnly 消息，并添加闪卡请求
	      const historyMessages = messages.filter((m) => !m.localOnly);
	      const flashcardRequestMsg: Message = { 
	        id: nowId(), 
	        role: "user", 
	        content: flashcardPrompt, 
	        createdAt: Date.now() 
	      };
	      const conversationForFlashcard: Message[] = [...historyMessages, flashcardRequestMsg];
	      
	      const model = (currentSession.model || "").trim() || resolveAiModel(settings);
	      const memoryText = memoryStore.getFullMemoryText();
	      
	      // 构建上下文
	      let contextText = "";
	      try {
	        const contexts = contextStore.selected;
	        if (contexts.length) {
	          const result = await buildContextForSend(contexts);
	          contextText = result.text;
	        }
	      } catch {}
	      
	      console.log("[Flashcard] Building messages for API, history count:", historyMessages.length);
	      
	      const { standard: apiMessages, fallback: apiMessagesFallback } = await buildConversationMessages({
	        messages: conversationForFlashcard,
	        systemPrompt: flashcardSystemPrompt,
	        contextText,
	        customMemory: memoryText,
	        chatMode: "ask", // 不需要工具
	      });
	      
	      console.log("[Flashcard] API messages built:", apiMessages.length);
	      
	      // 调用 AI 生成闪卡
	      let fullContent = "";
	      const aborter = new AbortController();
	      abortRef.current = aborter;
	      
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
	          apiMessages,
	          apiMessagesFallback,
	        )) {
	          if (chunk.type === "content") {
	            fullContent += chunk.content;
	          }
	        }
	        
	        console.log("[Flashcard] AI response length:", fullContent.length);
	        
	        // 解析闪卡
	        const cards = parseFlashcards(fullContent);
	        console.log("[Flashcard] Parsed cards:", cards.length);
	        
	        if (cards.length > 0) {
	          // 直接进入闪卡交互界面
	          setPendingFlashcards(cards);
	          setFlashcardMode(true);
	        } else {
	          // 没有解析到闪卡，显示 AI 的回复
	          const assistantMsg: Message = {
	            id: nowId(),
	            role: "assistant",
	            content: fullContent || "抱歉，无法生成闪卡。请提供更多上下文或指定主题。",
	            createdAt: Date.now(),
	          };
	          setMessages((prev) => [...prev, assistantMsg]);
	        }
	      } catch (err: any) {
	        console.error("[Flashcard] Error:", err);
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

	    const model = (currentSession.model || "").trim() || resolveAiModel(settings);
	    const validationError = validateAiChatSettingsWithModel(settings, model);
	    if (validationError) {
	      orca.notify("warn", validationError);
      return;
    }

    setSending(true);

    // 先添加用户消息到列表
    const userMsg: Message = { 
      id: nowId(), 
      role: "user", 
      content, 
      createdAt: Date.now(),
      files: files && files.length > 0 ? files : undefined,
    };

    // Use override if provided (for regeneration), otherwise append to current state
    if (historyOverride) {
        setMessages([...historyOverride, userMsg]);
    } else {
        setMessages((prev) => [...prev, userMsg]);
    }
    
    queueMicrotask(scrollToBottom);

    // 发送给 API 的消息使用处理后的内容（去掉指令）
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
          const result = await buildContextForSend(contexts);
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

      // Stream initial response with timeout protection
      let currentContent = "";
      let currentReasoning = "";
      let toolCalls: ToolCallInfo[] = [];
      let reasoningMessageId: string | null = null;
      let reasoningCreatedAt: number | null = null;

      // Get memory text for injection based on current injection mode
      // Uses getFullMemoryText which combines portrait (higher priority) + unextracted memories
      const memoryText = memoryStore.getFullMemoryText();

      const { standard: apiMessages, fallback: apiMessagesFallback } = await buildConversationMessages({
        messages: conversation,
        systemPrompt,
        contextText,
        customMemory: memoryText,
        chatMode: currentChatMode,
      });

      for await (const chunk of streamChatWithRetry(
        {
          apiUrl: settings.apiUrl,
          apiKey: settings.apiKey,
          model,
          temperature: settings.temperature,
          maxTokens: settings.maxTokens,
          signal: aborter.signal,
          tools: includeTools ? TOOLS : undefined,
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
            setMessages((prev) => [...prev, { 
              id: reasoningMessageId!, 
              role: "assistant", 
              content: "", 
              reasoning: chunk.reasoning,
              createdAt: reasoningCreatedAt!,
            }]);
          } else {
            currentReasoning += chunk.reasoning;
            updateMessage(reasoningMessageId, { reasoning: currentReasoning });
          }
          currentReasoning += chunk.reasoning;
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
              content: chunk.content, 
              createdAt: assistantCreatedAt 
            }]);
            currentContent = chunk.content;
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
              content: chunk.content, 
              createdAt: assistantCreatedAt 
            }]);
            currentContent = chunk.content;
            reasoningMessageId = assistantId; // 更新为 assistant ID
          } else {
            // 继续追加 content
            currentContent += chunk.content;
            updateMessage(reasoningMessageId, { content: currentContent });
          }
        } else if (chunk.type === "tool_calls") {
          toolCalls = chunk.toolCalls;
        }
      }

      setStreamingMessageId(null);

      // 如果只有 reasoning 没有 content，需要创建 assistant 消息
      const assistantId = currentContent ? reasoningMessageId! : nowId();
      const assistantCreatedAt = currentContent ? (reasoningCreatedAt || Date.now()) : Date.now();
      
      if (!currentContent && toolCalls.length === 0) {
        if (reasoningMessageId && currentReasoning) {
          // 有 reasoning 但没有 content，创建空的 assistant 消息
          setMessages((prev) => [...prev, { 
            id: assistantId, 
            role: "assistant", 
            content: "(empty response)", 
            createdAt: assistantCreatedAt 
          }]);
        } else {
          // 完全空响应
          setMessages((prev) => [...prev, { 
            id: assistantId, 
            role: "assistant", 
            content: "(empty response)", 
            createdAt: assistantCreatedAt 
          }]);
        }
      } else if (!currentContent && toolCalls.length > 0) {
        // 只有 tool calls，创建空 content 的 assistant 消息
        setMessages((prev) => [...prev, { 
          id: assistantId, 
          role: "assistant", 
          content: "", 
          createdAt: assistantCreatedAt 
        }]);
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

        // Filter out tool calls that have already been executed (by checking existing tool results)
        const executedToolCallIds = new Set(allToolResultMessages.map(m => m.tool_call_id));
        const newToolCalls = currentToolCalls.filter(tc => !executedToolCallIds.has(tc.id));
        
        if (newToolCalls.length === 0) {
          console.log(`[AI] [Round ${toolRound}] All tool calls already executed, skipping`);
          break;
        }
        
        if (newToolCalls.length < currentToolCalls.length) {
          console.log(`[AI] [Round ${toolRound}] Filtered ${currentToolCalls.length - newToolCalls.length} duplicate tool calls`);
        }

        // Execute tools
        const toolResultMessages: Message[] = [];
        for (const toolCall of newToolCalls) {
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
        const { standard, fallback } = await buildConversationMessages({
          messages: conversation,
          systemPrompt,
          contextText,
          customMemory: memoryText,
          chatMode: currentChatMode,
        });

        // Stream next response with reasoning support
        let nextContent = "";
        let nextReasoning = "";
        let nextToolCalls: ToolCallInfo[] = [];
        let nextReasoningMessageId: string | null = null;
        let nextReasoningCreatedAt: number | null = null;
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
              tools: enableTools ? TOOLS : undefined, // Last round: disable tools to force an answer
            },
            standard,
            fallback,
            () => console.log(`[AI] [Round ${toolRound}] Retrying with fallback format...`)
          )) {
            if (chunk.type === "reasoning") {
              // 第一次收到 reasoning 时，创建独立的 reasoning 消息
              if (!nextReasoningMessageId) {
                nextReasoningMessageId = nowId();
                nextReasoningCreatedAt = Date.now();
                setStreamingMessageId(nextReasoningMessageId);
                setMessages((prev) => [...prev, { 
                  id: nextReasoningMessageId!, 
                  role: "assistant", 
                  content: "", 
                  reasoning: chunk.reasoning,
                  createdAt: nextReasoningCreatedAt!,
                }]);
              } else {
                nextReasoning += chunk.reasoning;
                updateMessage(nextReasoningMessageId, { reasoning: nextReasoning });
              }
              nextReasoning += chunk.reasoning;
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
                  content: chunk.content, 
                  createdAt: nextAssistantCreatedAt 
                }]);
                nextContent = chunk.content;
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
                  content: chunk.content, 
                  createdAt: nextAssistantCreatedAt 
                }]);
                nextContent = chunk.content;
                nextReasoningMessageId = nextAssistantId;
              } else {
                // 继续追加 content
                nextContent += chunk.content;
                updateMessage(nextReasoningMessageId, { content: nextContent });
              }
            } else if (chunk.type === "tool_calls" && enableTools) {
              nextToolCalls = chunk.toolCalls;
            }
          }
        } catch (streamErr: any) {
          console.error(`[AI] [Round ${toolRound}] Error during response:`, streamErr);
          throw streamErr;
        }

        setStreamingMessageId(null);

        // 确定 assistant 消息的 ID
        const nextAssistantId = nextReasoningMessageId || nowId();
        const nextAssistantCreatedAt = nextReasoningCreatedAt || Date.now();

        // 如果只有 reasoning 没有 content，需要创建 assistant 消息
        if (!nextContent && toolCalls.length === 0 && !nextReasoningMessageId) {
          setMessages((prev) => [...prev, { 
            id: nextAssistantId, 
            role: "assistant", 
            content: "(empty response)", 
            createdAt: nextAssistantCreatedAt 
          }]);
        }

        if (nextToolCalls.length > 0 && nextReasoningMessageId) {
          updateMessage(nextReasoningMessageId, { tool_calls: nextToolCalls });
        }

        // If the model returned nothing, surface tool outputs so the user isn't left with an empty bubble.
        if (nextContent.trim().length === 0 && nextToolCalls.length === 0) {
          const toolFallback = allToolResultMessages.map((m) => m.content).join("\n\n").trim();
          const fallbackText = toolFallback || "(empty response from API)";
          if (nextReasoningMessageId) {
            updateMessage(nextReasoningMessageId, { content: fallbackText });
          } else {
            setMessages((prev) => [...prev, { 
              id: nextAssistantId, 
              role: "assistant", 
              content: fallbackText, 
              createdAt: nextAssistantCreatedAt 
            }]);
          }
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
            if (nextReasoningMessageId) {
              updateMessage(nextReasoningMessageId, { content: warning || "_[已达到最大工具调用轮数限制]_" });
            }
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
        const lastUserMsg = messages[lastUserIdx];
        const content = lastUserMsg.content || "";
        const historyBeforeUser = messages.slice(0, lastUserIdx);
        // Resend using the history BEFORE the last user message, and re-using the last user content.
        handleSend(content, lastUserMsg.files, historyBeforeUser);
    }
  }, [messages, sending]);


  function clear() {
    if (abortRef.current) abortRef.current.abort();
    setMessages([]);
  }

  function stop() {
    if (abortRef.current) abortRef.current.abort();
  }

  // 删除单条消息
  const handleDeleteMessage = useCallback((messageId: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== messageId));
  }, []);

  // 回档到指定消息（删除该消息及之后的所有消息）
  const handleRollbackToMessage = useCallback((messageId: string) => {
    setMessages((prev) => {
      const index = prev.findIndex((m) => m.id === messageId);
      if (index <= 0) return prev; // 不能回档到第一条消息之前
      return prev.slice(0, index);
    });
  }, []);

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
    // 构建 tool 结果映射：toolCallId -> { content, name }
    const toolResultsMap = new Map<string, { content: string; name: string }>();
    messages.forEach((m) => {
      if (m.role === "tool" && m.tool_call_id) {
        toolResultsMap.set(m.tool_call_id, { content: m.content, name: m.name || "" });
      }
    });

    const messageElements: any[] = [];
    messages.forEach((m, i) => {
      // 跳过 tool 消息，它们会被合并到 assistant 消息的工具调用区域
      if (m.role === "tool") return;

      // Determine if this is the last message that should offer regeneration (Last AI message)
      const isLastAi = m.role === "assistant" && i === messages.length - 1;

      messageElements.push(
        createElement(MessageItem, {
          key: m.id,
          message: m,
          messageIndex: i,
          isLastAiMessage: isLastAi,
          isStreaming: streamingMessageId === m.id,
          onRegenerate: isLastAi ? handleRegenerate : undefined,
          onDelete: () => handleDeleteMessage(m.id),
          onRollback: i > 0 ? () => handleRollbackToMessage(m.id) : undefined,
          toolResults: m.tool_calls ? toolResultsMap : undefined,
          onSuggestedReply: isLastAi ? (text: string) => handleSend(text) : undefined,
          onGenerateSuggestions: isLastAi && m.content ? createSuggestionGenerator(m.content) : undefined,
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
                createElement(LoadingDots)
              )
            )
          )
        )
      );
    }

    messageListContent = messageElements;

    // 如果在闪卡模式，在消息列表末尾添加闪卡组件
    if (flashcardMode && pendingFlashcards.length > 0) {
      messageElements.push(
        createElement(
          "div",
          {
            key: "flashcard-review",
            style: {
              margin: "16px 0",
              padding: "16px",
              background: "var(--orca-color-bg-2)",
              borderRadius: "16px",
              border: "1px solid var(--orca-color-border)",
            },
          },
          createElement(FlashcardReview, {
            cards: pendingFlashcards,
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
              
              // 完成后延迟关闭闪卡界面
              setTimeout(() => {
                setFlashcardMode(false);
                setPendingFlashcards([]);
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
      createElement("div", { style: headerTitleStyle }, "AI Chat"),
      // New Session Button
      createElement(
        Button,
        {
          variant: "plain",
          onClick: handleNewSession,
          title: "新对话",
        },
        createElement("i", { className: "ti ti-plus" })
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
      // More Menu (Settings, Memory, Clear)
      createElement(HeaderMenu, {
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
        handleSend(text, files, clearContext ? [] : undefined);
      },
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
