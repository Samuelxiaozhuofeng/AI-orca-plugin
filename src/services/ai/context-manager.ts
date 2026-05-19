/**
 * Context Manager Service for AI-orca-plugin
 *
 * Manages conversation context with intelligent compression and summarization
 * to handle long conversations within token limits while preserving important information.
 *
 * Inspired by:
 * - Claude's progressive summarization approach
 * - OpenAI's prompt caching patterns
 * - Gemini's 2M context window management
 */

import type { OpenAIChatMessage } from "./openai-client";

// ============================================================================
// Types & Interfaces
// ============================================================================

export interface ContextManagerOptions {
  /** Maximum tokens for context (default: 8000) */
  maxTokens?: number;
  /** Token threshold to trigger summarization (default: 6000) */
  summarizeThreshold?: number;
  /** Number of recent messages to always preserve (default: 4) */
  preserveRecentCount?: number;
  /** Whether to preserve system messages (default: true) */
  preserveSystemMessages?: boolean;
  /** Summary generation function (if not provided, uses simple truncation) */
  summarizer?: (messages: OpenAIChatMessage[]) => Promise<string>;
}

export interface MessageSegment {
  /** Original messages in this segment */
  messages: OpenAIChatMessage[];
  /** Summary of this segment (if summarized) */
  summary?: string;
  /** Approximate token count */
  tokenCount: number;
  /** Whether this segment is summarized */
  isSummarized: boolean;
  /** Timestamp of the first message */
  startTime?: Date;
  /** Timestamp of the last message */
  endTime?: Date;
}

export interface ContextStats {
  /** Total messages in history */
  totalMessages: number;
  /** Messages after compression */
  compressedMessages: number;
  /** Approximate token count */
  estimatedTokens: number;
  /** Number of summarized segments */
  summarizedSegments: number;
  /** Compression ratio (original / compressed) */
  compressionRatio: number;
}

export interface ManagedContext {
  /** Messages ready for API call */
  messages: OpenAIChatMessage[];
  /** Statistics about the context */
  stats: ContextStats;
  /** Whether context was compressed */
  wasCompressed: boolean;
}

// ============================================================================
// Token Estimation
// ============================================================================

/**
 * Estimate token count for a string
 * Uses simple heuristic: ~4 characters per token for English, ~2 for Chinese
 */
function estimateTokens(text: string): number {
  if (!text) return 0;

  // Count Chinese characters
  const chineseChars = (text.match(/[\u4e00-\u9fff]/g) || []).length;
  // Count other characters
  const otherChars = text.length - chineseChars;

  // Chinese: ~1.5 chars per token, English: ~4 chars per token
  return Math.ceil(chineseChars / 1.5 + otherChars / 4);
}

/**
 * Estimate tokens for a message
 */
function estimateMessageTokens(message: OpenAIChatMessage): number {
  let tokens = 4; // Base tokens for message structure

  if (typeof message.content === "string") {
    tokens += estimateTokens(message.content);
  } else if (Array.isArray(message.content)) {
    for (const part of message.content as any[]) {
      if (part.type === "text") {
        tokens += estimateTokens(part.text || "");
      } else if (part.type === "image_url") {
        tokens += 85; // Base tokens for image reference
      }
    }
  }

  // Add tokens for role
  tokens += estimateTokens(message.role);

  // Add tokens for name if present
  if (message.name) {
    tokens += estimateTokens(message.name) + 1;
  }

  // Tool calls and tool results
  if (message.tool_calls) {
    tokens += estimateTokens(JSON.stringify(message.tool_calls));
  }
  if (message.tool_call_id) {
    tokens += estimateTokens(message.tool_call_id) + 10;
  }

  return tokens;
}

/**
 * Estimate total tokens for message array
 */
export function estimateTotalTokens(messages: OpenAIChatMessage[]): number {
  return messages.reduce((sum, msg) => sum + estimateMessageTokens(msg), 0);
}

// ============================================================================
// Message Compression Utilities
// ============================================================================

/**
 * Extract key information from a message for summarization
 */
function extractKeyInfo(message: OpenAIChatMessage): string {
  const role = message.role;
  let content = "";

  if (typeof message.content === "string") {
    content = message.content;
  } else if (Array.isArray(message.content)) {
    content = (message.content as any[])
      .filter((p: any) => p.type === "text")
      .map((p: any) => p.text)
      .join(" ");
  }

  // Truncate very long content
  if (content.length > 500) {
    content = content.slice(0, 500) + "...";
  }

  // Handle tool calls
  if (message.tool_calls && message.tool_calls.length > 0) {
    const toolNames = message.tool_calls.map((tc) => tc.function?.name).filter(Boolean);
    content += ` [Tool calls: ${toolNames.join(", ")}]`;
  }

  return `${role}: ${content}`;
}

/**
 * Create a summary message from a set of messages
 */
function createSummaryMessage(
  summary: string,
  messageCount: number
): OpenAIChatMessage {
  return {
    role: "system",
    content: `[Previous conversation summary (${messageCount} messages compressed)]:\n${summary}`,
  };
}

/**
 * Simple default summarizer - extracts key points
 */
function defaultSummarizer(messages: OpenAIChatMessage[]): string {
  const points: string[] = [];

  // Extract user questions/requests (longer excerpts)
  const userMessages = messages.filter((m) => m.role === "user");
  if (userMessages.length > 0) {
    const topics = userMessages
      .map((m) => {
        const content =
          typeof m.content === "string"
            ? m.content
            : ((m.content as unknown) as any[] | undefined)?.find((p: any) => p.type === "text")?.text || "";
        return content.slice(0, 200).trim();
      })
      .filter((t) => t.length > 0);

    if (topics.length > 0) {
      points.push(`用户讨论: ${topics.slice(0, 5).join(" | ")}`);
    }
  }

  // Extract tool calls with results summary
  const assistantMessages = messages.filter((m) => m.role === "assistant");
  const toolCalls = assistantMessages.flatMap((m) => m.tool_calls || []);
  const toolResults = messages.filter((m) => m.role === "tool");

  if (toolCalls.length > 0 || toolResults.length > 0) {
    const toolCallNames = [...new Set(toolCalls.map((tc) => tc.function?.name).filter(Boolean))];
    const toolSummary: string[] = [];
    if (toolCallNames.length > 0) {
      toolSummary.push(`调用工具: ${toolCallNames.join(", ")}`);
    }
    // Include key data from tool results
    const resultPreviews: string[] = [];
    for (const tr of toolResults.slice(0, 5)) {
      const content = typeof tr.content === "string" ? tr.content : "";
      if (content.length > 0) {
        // Extract success/error and first data
        try {
          const parsed = JSON.parse(content);
          const preview: any = {};
          if (parsed.success !== undefined) preview.success = parsed.success;
          if (parsed.totalCount !== undefined) preview.totalCount = parsed.totalCount;
          if (parsed.error) preview.error = parsed.error;
          if (parsed.message) preview.message = parsed.message;
          resultPreviews.push(JSON.stringify(preview));
        } catch {
          resultPreviews.push(content.slice(0, 100));
        }
      }
    }
    if (resultPreviews.length > 0) {
      toolSummary.push(`工具结果: ${resultPreviews.join("; ")}`);
    }
    points.push(toolSummary.join(" | "));
  }

  // Include abbreviated key exchanges
  const keyExchanges: string[] = [];
  for (let i = 0; i < Math.min(messages.length, 8); i += 2) {
    const userMsg = messages[i];
    const assistantMsg = messages[i + 1];

    if (userMsg?.role === "user") {
      const userContent =
        typeof userMsg.content === "string"
          ? userMsg.content.slice(0, 150)
          : "[complex content]";
      let exchangeText = `Q: ${userContent}`;

      if (assistantMsg?.role === "assistant") {
        const assistantContent =
          typeof assistantMsg.content === "string"
            ? assistantMsg.content.slice(0, 150)
            : assistantMsg.tool_calls
            ? `[called: ${assistantMsg.tool_calls.map((t) => t.function?.name).join(", ")}]`
            : "[complex response]";
        exchangeText += ` → A: ${assistantContent}`;
      }
      keyExchanges.push(exchangeText);
    }
  }

  if (keyExchanges.length > 0) {
    points.push(`关键交互:\n${keyExchanges.join("\n")}`);
  }

  return points.join("\n\n");
}

// ============================================================================
// Context Manager Class
// ============================================================================

/**
 * Manages conversation context with compression and summarization
 */
export class ContextManager {
  private options: Required<ContextManagerOptions>;
  private segments: MessageSegment[] = [];
  private systemMessages: OpenAIChatMessage[] = [];

  constructor(options: ContextManagerOptions = {}) {
    this.options = {
      maxTokens: options.maxTokens ?? 8000,
      summarizeThreshold: options.summarizeThreshold ?? 6000,
      preserveRecentCount: options.preserveRecentCount ?? 4,
      preserveSystemMessages: options.preserveSystemMessages ?? true,
      summarizer: options.summarizer ?? (async (msgs) => defaultSummarizer(msgs)),
    };
  }

  /**
   * Add messages to the context
   */
  addMessages(messages: OpenAIChatMessage[]): void {
    // Separate system messages
    const systemMsgs = messages.filter((m) => m.role === "system");
    const otherMsgs = messages.filter((m) => m.role !== "system");

    // Store system messages separately
    if (this.options.preserveSystemMessages && systemMsgs.length > 0) {
      this.systemMessages = systemMsgs;
    }

    // Add other messages as a new segment
    if (otherMsgs.length > 0) {
      const tokenCount = estimateTotalTokens(otherMsgs);
      this.segments.push({
        messages: otherMsgs,
        tokenCount,
        isSummarized: false,
        startTime: new Date(),
        endTime: new Date(),
      });
    }
  }

  /**
   * Add a single message
   */
  addMessage(message: OpenAIChatMessage): void {
    this.addMessages([message]);
  }

  /**
   * Get current token estimate
   */
  getTokenCount(): number {
    const systemTokens = estimateTotalTokens(this.systemMessages);
    const segmentTokens = this.segments.reduce((sum, seg) => sum + seg.tokenCount, 0);
    return systemTokens + segmentTokens;
  }

  /**
   * Check if compression is needed
   */
  needsCompression(): boolean {
    return this.getTokenCount() > this.options.summarizeThreshold;
  }

  /**
   * Compress older segments by summarizing them
   */
  async compress(): Promise<void> {
    if (!this.needsCompression()) return;

    // Keep recent segments intact
    const preserveCount = Math.min(
      this.options.preserveRecentCount,
      this.segments.length
    );
    const recentSegments = this.segments.slice(-preserveCount);
    const oldSegments = this.segments.slice(0, -preserveCount);

    if (oldSegments.length === 0) {
      // Can't compress further - all segments are recent
      return;
    }

    // Merge old segments that aren't summarized yet
    const unsummarizedMessages: OpenAIChatMessage[] = [];
    const summarizedSegments: MessageSegment[] = [];

    for (const segment of oldSegments) {
      if (segment.isSummarized) {
        summarizedSegments.push(segment);
      } else {
        unsummarizedMessages.push(...segment.messages);
      }
    }

    // Summarize unsummarized messages
    if (unsummarizedMessages.length > 0) {
      const summary = await this.options.summarizer(unsummarizedMessages);
      const summaryMessage = createSummaryMessage(
        summary,
        unsummarizedMessages.length
      );

      summarizedSegments.push({
        messages: [summaryMessage],
        summary,
        tokenCount: estimateMessageTokens(summaryMessage),
        isSummarized: true,
        startTime: oldSegments[0]?.startTime,
        endTime: oldSegments[oldSegments.length - 1]?.endTime,
      });
    }

    // Rebuild segments
    this.segments = [...summarizedSegments, ...recentSegments];
  }

  /**
   * Get managed context ready for API call
   */
  async getContext(): Promise<ManagedContext> {
    const originalTokens = this.getTokenCount();
    let wasCompressed = false;

    // Compress if needed
    if (this.needsCompression()) {
      await this.compress();
      wasCompressed = true;
    }

    // Build final message array
    const messages: OpenAIChatMessage[] = [];

    // Add system messages first
    if (this.options.preserveSystemMessages) {
      messages.push(...this.systemMessages);
    }

    // Add segment messages
    for (const segment of this.segments) {
      messages.push(...segment.messages);
    }

    // Calculate stats
    const finalTokens = estimateTotalTokens(messages);
    const totalOriginalMessages =
      this.systemMessages.length +
      this.segments.reduce(
        (sum, seg) => sum + (seg.isSummarized ? 0 : seg.messages.length),
        0
      );

    return {
      messages,
      stats: {
        totalMessages: totalOriginalMessages,
        compressedMessages: messages.length,
        estimatedTokens: finalTokens,
        summarizedSegments: this.segments.filter((s) => s.isSummarized).length,
        compressionRatio:
          wasCompressed && finalTokens > 0 ? originalTokens / finalTokens : 1,
      },
      wasCompressed,
    };
  }

  /**
   * Reset the context manager
   */
  reset(): void {
    this.segments = [];
    this.systemMessages = [];
  }

  /**
   * Get statistics about current context
   */
  getStats(): ContextStats {
    const totalMessages =
      this.systemMessages.length +
      this.segments.reduce((sum, seg) => sum + seg.messages.length, 0);

    return {
      totalMessages,
      compressedMessages: totalMessages,
      estimatedTokens: this.getTokenCount(),
      summarizedSegments: this.segments.filter((s) => s.isSummarized).length,
      compressionRatio: 1,
    };
  }
}

// ============================================================================
// Standalone Functions
// ============================================================================

/**
 * Compress messages to fit within token limit
 * Simple standalone function for quick compression without full context management
 */
export async function compressMessages(
  messages: OpenAIChatMessage[],
  maxTokens: number,
  options: {
    preserveRecentCount?: number;
    preserveSystemMessages?: boolean;
    summarizer?: (messages: OpenAIChatMessage[]) => Promise<string>;
  } = {}
): Promise<ManagedContext> {
  const {
    preserveRecentCount = 4,
    preserveSystemMessages = true,
    summarizer = async (msgs) => defaultSummarizer(msgs),
  } = options;

  const currentTokens = estimateTotalTokens(messages);

  // No compression needed
  if (currentTokens <= maxTokens) {
    return {
      messages,
      stats: {
        totalMessages: messages.length,
        compressedMessages: messages.length,
        estimatedTokens: currentTokens,
        summarizedSegments: 0,
        compressionRatio: 1,
      },
      wasCompressed: false,
    };
  }

  // Separate system messages
  const systemMessages = preserveSystemMessages
    ? messages.filter((m) => m.role === "system")
    : [];
  const otherMessages = preserveSystemMessages
    ? messages.filter((m) => m.role !== "system")
    : messages;

  // Preserve recent messages
  const recentMessages = otherMessages.slice(-preserveRecentCount);
  const olderMessages = otherMessages.slice(0, -preserveRecentCount);

  // If no older messages to compress, return as-is
  if (olderMessages.length === 0) {
    return {
      messages,
      stats: {
        totalMessages: messages.length,
        compressedMessages: messages.length,
        estimatedTokens: currentTokens,
        summarizedSegments: 0,
        compressionRatio: 1,
      },
      wasCompressed: false,
    };
  }

  // Summarize older messages
  const summary = await summarizer(olderMessages);
  const summaryMessage = createSummaryMessage(summary, olderMessages.length);

  // Build compressed message array
  const compressedMessages: OpenAIChatMessage[] = [
    ...systemMessages,
    summaryMessage,
    ...recentMessages,
  ];

  const compressedTokens = estimateTotalTokens(compressedMessages);

  return {
    messages: compressedMessages,
    stats: {
      totalMessages: messages.length,
      compressedMessages: compressedMessages.length,
      estimatedTokens: compressedTokens,
      summarizedSegments: 1,
      compressionRatio: currentTokens / compressedTokens,
    },
    wasCompressed: true,
  };
}

/**
 * Smart message truncation - removes middle messages while preserving context
 */
export function truncateMiddle(
  messages: OpenAIChatMessage[],
  maxTokens: number,
  preserveEnds: number = 3
): OpenAIChatMessage[] {
  const currentTokens = estimateTotalTokens(messages);

  if (currentTokens <= maxTokens) {
    return messages;
  }

  // Preserve system messages
  const systemMessages = messages.filter((m) => m.role === "system");
  const nonSystemMessages = messages.filter((m) => m.role !== "system");

  if (nonSystemMessages.length <= preserveEnds * 2) {
    return messages; // Not enough messages to truncate
  }

  // Keep first and last N messages
  const firstMessages = nonSystemMessages.slice(0, preserveEnds);
  const lastMessages = nonSystemMessages.slice(-preserveEnds);

  // Add truncation indicator
  const truncationIndicator: OpenAIChatMessage = {
    role: "system",
    content: `[...${nonSystemMessages.length - preserveEnds * 2} messages omitted for context length...]`,
  };

  return [
    ...systemMessages,
    ...firstMessages,
    truncationIndicator,
    ...lastMessages,
  ];
}

/**
 * Extract conversation topics for context awareness
 */
export function extractTopics(messages: OpenAIChatMessage[]): string[] {
  const topics = new Set<string>();

  for (const message of messages) {
    if (message.role !== "user") continue;

    const content =
      typeof message.content === "string"
        ? message.content
        : ((message.content as unknown) as any[] | undefined)?.find((p: any) => p.type === "text")?.text || "";

    // Simple keyword extraction (could be enhanced with NLP)
    // Match Chinese words (2-4 chars) and English words (3+ chars)
    const chineseWords = content.match(/[\u4e00-\u9fff]{2,4}/g) || [];
    const englishWords = (content.match(/[a-zA-Z]{3,}/g) || []).map((w: string) =>
      w.toLowerCase()
    );

    // Filter common words
    const stopWords = new Set([
      "the",
      "this",
      "that",
      "what",
      "how",
      "when",
      "where",
      "why",
      "can",
      "could",
      "would",
      "should",
      "please",
      "help",
      "want",
      "need",
      "like",
      "的",
      "是",
      "在",
      "了",
      "有",
      "我",
      "你",
      "他",
      "她",
      "它",
      "们",
      "这",
      "那",
      "什么",
      "怎么",
      "为什么",
      "可以",
      "能",
      "要",
      "想",
      "帮",
      "请",
    ]);

    for (const word of [...chineseWords, ...englishWords]) {
      if (!stopWords.has(word) && word.length >= 2) {
        topics.add(word);
      }
    }
  }

  // Return top topics (most frequent would be better with counting)
  return Array.from(topics).slice(0, 10);
}

// ============================================================================
// HISTORY_SNIP: 智能裁剪旧工具结果（参考 CoreCoder）
// 工具结果超过 N 轮后裁剪为摘要，节省 token
// ============================================================================

interface SnipOptions {
  /** 保留最近 N 个"用户-助手"轮次的工具结果完整内容（默认 3） */
  preserveRecentTurns?: number;
  /** 工具结果超过此字符数才裁剪（默认 300） */
  minLengthToSnip?: number;
}

/**
 * 裁剪旧工具大结果，保留最近几轮的完整内容。
 * 不删除消息，只把旧工具结果替换为短标记，保留消息结构。
 */
export function snipOldToolResults(
  messages: OpenAIChatMessage[],
  options: SnipOptions = {}
): OpenAIChatMessage[] {
  const { preserveRecentTurns = 3, minLengthToSnip = 300 } = options;

  // 找到所有"用户消息"的索引作为轮次边界
  const turnBoundaries: number[] = [];
  for (let i = 0; i < messages.length; i++) {
    if (messages[i].role === "user") {
      turnBoundaries.push(i);
    }
  }

  if (turnBoundaries.length <= preserveRecentTurns) {
    return messages; // 轮次不足，无需裁剪
  }

  // 最近 N 轮起始位置
  const recentStart = turnBoundaries[turnBoundaries.length - preserveRecentTurns];

  const result = messages.map((msg, idx) => {
    // 只处理旧轮次的 tool 消息
    if (msg.role !== "tool" || idx >= recentStart) return msg;

    const content = typeof msg.content === "string" ? msg.content : "";
    if (content.length <= minLengthToSnip) return msg;

    // 提取关键信息作为摘要
    let snippet = "";
    try {
      const parsed = JSON.parse(content);
      if (parsed.success !== undefined) {
        snippet = `[已裁剪] success=${parsed.success}`;
      } else if (parsed.error) {
        snippet = `[已裁剪] error: ${parsed.error.slice(0, 60)}`;
      } else {
        snippet = `[已裁剪] ${content.slice(0, 80)}...`;
      }
    } catch {
      snippet = `[已裁剪] ${content.slice(0, 80)}...`;
    }

    return { ...msg, content: snippet };
  });

  const snippedCount = result.filter(
    (m, i) => m.role === "tool" && i < recentStart && m.content !== messages[i].content
  ).length;

  if (snippedCount > 0) {
    console.log(`[HISTORY_SNIP] 裁剪了 ${snippedCount} 个旧工具结果 (保留最近 ${preserveRecentTurns} 轮)`);
  }

  return result;
}
