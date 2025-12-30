/**
 * MessageList - 共享的消息列表渲染组件
 * 
 * 被以下组件复用：
 * - AiChatPanel: 聊天面板
 * - AiChatBlockRenderer: 保存到笔记的对话块
 * 
 * 任何样式或功能更改都会自动同步到所有使用场景
 */

import MessageItem from "../views/MessageItem";
import type { Message } from "../services/session-service";
import type { ExtractedMemory } from "../services/memory-extraction";
import { messageListStyle } from "../styles/ai-chat-styles";

const React = window.React as unknown as {
  createElement: typeof window.React.createElement;
};
const { createElement } = React;

/** Token 统计信息 */
export interface TokenStats {
  messageTokens: number;
  cumulativeTokens: number;
  cost?: number;
  cumulativeCost?: number;
  currencySymbol?: string;
  totalInputTokens?: number;
  totalOutputTokens?: number;
  totalInputCost?: number;
  totalOutputCost?: number;
  isLastMessage?: boolean;
}

/** MessageList Props */
export interface MessageListProps {
  /** 消息列表 */
  messages: Message[];
  /** 正在流式输出的消息 ID */
  streamingMessageId?: string | null;
  /** 工具调用结果映射 */
  toolResultsMap?: Map<string, { content: string; name: string }>;
  /** Token 统计映射 */
  tokenStatsMap?: Map<string, TokenStats>;
  /** 是否只读模式（保存的对话块使用） */
  readonly?: boolean;
  /** 自定义容器样式 */
  style?: React.CSSProperties;
  /** 自定义类名 */
  className?: string;
  /** 是否处于选择模式 */
  selectionMode?: boolean;
  /** 已选中的消息 ID 集合 */
  selectedMessageIds?: Set<string>;
  /** 切换消息选中状态回调 */
  onToggleMessageSelection?: (messageId: string) => void;
  
  // ─────────────────────────────────────────────────────────────────────────
  // 交互回调（readonly=true 时不需要）
  // ─────────────────────────────────────────────────────────────────────────
  
  /** 重新生成回调 */
  onRegenerate?: () => void;
  /** 删除消息回调 */
  onDeleteMessage?: (messageId: string) => void;
  /** 回档到消息回调 */
  onRollbackToMessage?: (messageId: string) => void;
  /** 切换消息置顶回调 */
  onTogglePinned?: (messageId: string) => void;
  /** 建议回复点击回调 */
  onSuggestedReply?: (text: string) => void;
  /** 生成建议回调 */
  onGenerateSuggestions?: (content: string) => () => Promise<string[]>;
  /** 提取记忆回调 */
  onExtractMemory?: (memories: ExtractedMemory[]) => void;
  /** 获取对话上下文（用于记忆提取） */
  getConversationContext?: (messageIndex: number) => string;
}

/**
 * MessageList 组件
 * 渲染消息列表，支持交互模式和只读模式
 */
export default function MessageList({
  messages,
  streamingMessageId,
  toolResultsMap,
  tokenStatsMap,
  readonly = false,
  style,
  className,
  selectionMode = false,
  selectedMessageIds,
  onToggleMessageSelection,
  onRegenerate,
  onDeleteMessage,
  onRollbackToMessage,
  onTogglePinned,
  onSuggestedReply,
  onGenerateSuggestions,
  onExtractMemory,
  getConversationContext,
}: MessageListProps) {
  const containerStyle: React.CSSProperties = {
    ...messageListStyle,
    ...style,
  };

  const messageElements: any[] = [];

  messages.forEach((m: Message, i: number) => {
    // 跳过 tool 消息，它们会被合并到 assistant 消息的工具调用区域
    if (m.role === "tool") return;

    const isLastAi = m.role === "assistant" && i === messages.length - 1;
    const isStreaming = readonly ? false : streamingMessageId === m.id;

    // Debug log for readonly mode
    if (readonly && m.reasoning) {
      console.log("[MessageList] Readonly message with reasoning:", m.id, "isStreaming:", isStreaming);
    }

    messageElements.push(
      createElement(MessageItem, {
        key: m.id || `msg-${i}`,
        message: m,
        messageIndex: i,
        isLastAiMessage: isLastAi,
        isStreaming,
        // 选择模式相关
        selectionMode: readonly ? false : selectionMode,
        isSelected: selectedMessageIds?.has(m.id) || false,
        onToggleSelection: readonly ? undefined : (selectionMode && onToggleMessageSelection ? () => onToggleMessageSelection(m.id) : undefined),
        // 只读模式下不传递交互回调
        onRegenerate: readonly ? undefined : (isLastAi ? onRegenerate : undefined),
        onDelete: readonly ? undefined : (onDeleteMessage ? () => onDeleteMessage(m.id) : undefined),
        onRollback: readonly ? undefined : (i > 0 && onRollbackToMessage ? () => onRollbackToMessage(m.id) : undefined),
        onTogglePinned: readonly ? undefined : (onTogglePinned ? () => onTogglePinned(m.id) : undefined),
        toolResults: m.tool_calls ? toolResultsMap : undefined,
        onSuggestedReply: readonly ? undefined : (isLastAi ? onSuggestedReply : undefined),
        onGenerateSuggestions: readonly ? undefined : (isLastAi && m.content && onGenerateSuggestions ? onGenerateSuggestions(m.content) : undefined),
        tokenStats: tokenStatsMap?.get(m.id),
        conversationContext: readonly ? undefined : (getConversationContext ? getConversationContext(i) : undefined),
        onExtractMemory: readonly ? undefined : onExtractMemory,
      })
    );
  });

  return createElement(
    "div",
    {
      style: containerStyle,
      className,
    },
    ...messageElements
  );
}
