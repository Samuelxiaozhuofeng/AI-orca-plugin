/**
 * MessageItem Component
 *
 * Renders individual chat messages with:
 * - Markdown content rendering
 * - Reasoning/thinking display (collapsible)
 * - Tool call status indicators (semantic, animated, auto-collapse when done)
 * - Action bar (copy, regenerate, extract memory)
 * - File attachments (images, documents, code, data)
 *
 * Gemini UX Review: Tool calls now use inline status flow instead of technical cards
 */

import MarkdownMessage from "../components/MarkdownMessage";
import ToolStatusIndicator from "../components/ToolStatusIndicator";
import SuggestedReplies from "../components/SuggestedReplies";
import ExtractMemoryButton from "./ExtractMemoryButton";
import type { ExtractedMemory } from "../services/memory-extraction";
import { getFileDisplayUrl, getFileIcon, getFileFullPath } from "../services/file-service";
import { saveSingleMessageToJournal } from "../services/export-service";
import {
  messageRowStyle,
  messageBubbleStyle,
  cursorStyle,
  actionBarStyle,
  actionButtonStyle,
  messageTimeStyle,
} from "../styles/ai-chat-styles";
import type { Message } from "../services/session-service";
import type { ToolCallInfo } from "../services/chat-stream-handler";
import { formatTokenCount } from "../utils/token-utils";
import {
  displaySettingsStore,
  fontSizeMap,
  getMessageGap,
  getBubblePadding,
  shouldRenderTimestamp,
} from "../store/display-settings-store";

// DEBUG: Check if all components are defined
console.log("[MessageItem] Component imports check:", {
  MarkdownMessage: typeof MarkdownMessage,
  ToolStatusIndicator: typeof ToolStatusIndicator,
  SuggestedReplies: typeof SuggestedReplies,
  ExtractMemoryButton: typeof ExtractMemoryButton,
});

const React = window.React as unknown as {
  createElement: typeof window.React.createElement;
  useState: <T>(initial: T | (() => T)) => [T, (next: T | ((prev: T) => T)) => void];
  useCallback: <T extends (...args: any[]) => any>(fn: T, deps: any[]) => T;
  useMemo: <T>(factory: () => T, deps: any[]) => T;
  useEffect: (effect: () => void | (() => void), deps?: any[]) => void;
  Fragment: typeof window.React.Fragment;
};
const { createElement, useState, useCallback, useMemo, useEffect, Fragment } = React;

const { ContextMenu, Menu, MenuText } = orca.components;

const { useSnapshot } = (window as any).Valtio as {
  useSnapshot: <T extends object>(proxyObject: T) => T;
};

// 格式化消息时间
function formatMessageTime(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();

  // 获取今天和昨天的日期边界
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterdayStart = todayStart - 24 * 60 * 60 * 1000;
  const dateTime = date.getTime();

  if (dateTime >= todayStart) {
    // 今天：只显示时间
    return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  } else if (dateTime >= yesterdayStart) {
    // 昨天
    return "昨天 " + date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  } else {
    // 更早：显示日期
    return `${date.getMonth() + 1}月${date.getDate()}日 ` +
      date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  }
}

/**
 * 解析推理内容，提取步骤信息
 * 识别常见的步骤模式：
 * - 数字编号：1. 2. 3. 或 1) 2) 3)
 * - 步骤关键词：首先、其次、然后、最后、第一步、第二步等
 * - Markdown 标题：## 或 ###
 */
function parseReasoningSteps(reasoning: string): { steps: string[]; summary: string } {
  if (!reasoning) return { steps: [], summary: "" };

  const lines = reasoning.split("\n").filter(line => line.trim());
  const steps: string[] = [];
  
  // 步骤匹配模式
  const stepPatterns = [
    /^(\d+)[.、)]\s*(.+)/,           // 1. xxx 或 1、xxx 或 1) xxx
    /^第[一二三四五六七八九十\d]+步[：:]\s*(.+)/,  // 第一步：xxx
    /^(首先|其次|然后|接着|最后|另外|此外)[，,：:]\s*(.+)/,  // 首先，xxx
    /^#{2,3}\s*(.+)/,                // ## xxx 或 ### xxx
    /^[-*]\s*(.+)/,                  // - xxx 或 * xxx (列表项)
  ];

  for (const line of lines) {
    const trimmedLine = line.trim();
    for (const pattern of stepPatterns) {
      const match = trimmedLine.match(pattern);
      if (match) {
        // 提取步骤内容（取最后一个捕获组或整个匹配）
        const stepContent = match[match.length - 1] || match[1] || trimmedLine;
        if (stepContent && stepContent.length > 5) { // 过滤太短的内容
          steps.push(stepContent.slice(0, 50) + (stepContent.length > 50 ? "..." : ""));
        }
        break;
      }
    }
  }

  // 生成摘要：取前两个步骤或推理内容的前100字符
  let summary = "";
  if (steps.length > 0) {
    summary = steps.slice(0, 2).join(" → ");
    if (steps.length > 2) {
      summary += ` → ... (共${steps.length}步)`;
    }
  } else {
    // 没有识别到步骤，取前100字符作为摘要
    const cleanText = reasoning.replace(/\n+/g, " ").trim();
    summary = cleanText.slice(0, 80) + (cleanText.length > 80 ? "..." : "");
  }

  return { steps, summary };
}

/**
 * ReasoningBlock - 显示 AI 推理过程（可折叠）
 * 类似 Cherry Studio 的显示方式：显示为独立的消息块
 * 
 * 增强功能：
 * - 步骤进度指示（流式时显示）
 * - 完成摘要
 * - 折叠时显示时长和步骤数
 */
function ReasoningBlock({ reasoning, isStreaming }: { reasoning: string; isStreaming?: boolean }) {
  const [isExpanded, setIsExpanded] = useState(false); // 默认折叠
  const [showActions, setShowActions] = useState(false);
  const [startTime] = useState(() => Date.now()); // 记录开始时间
  const [elapsedTime, setElapsedTime] = useState(0);
  
  // 流式时更新耗时
  useEffect(() => {
    if (isStreaming) {
      const timer = setInterval(() => {
        setElapsedTime(Math.round((Date.now() - startTime) / 1000));
      }, 1000);
      return () => clearInterval(timer);
    } else {
      // 流式结束时，计算最终耗时
      setElapsedTime(Math.round((Date.now() - startTime) / 1000));
    }
  }, [isStreaming, startTime]);
  
  if (!reasoning) return null;

  // 解析步骤信息
  const { steps, summary } = useMemo(() => parseReasoningSteps(reasoning), [reasoning]);
  const stepCount = steps.length || Math.max(1, Math.floor(reasoning.length / 200)); // 估算步骤数
  
  // 计算推理时间（流式时使用实时计时，否则估算）
  const displayTime = isStreaming ? elapsedTime : Math.max(1, Math.round(reasoning.length / 100));

  // 复制功能
  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(reasoning).then(() => {
      if (typeof orca !== "undefined" && orca.notify) {
        orca.notify("success", "已复制推理内容");
      }
    });
  }, [reasoning]);

  // 当前步骤索引（流式时根据内容长度估算）
  const currentStepIndex = isStreaming 
    ? Math.min(steps.length - 1, Math.floor(reasoning.length / 200))
    : steps.length - 1;

  return createElement(
    "div",
    {
      style: {
        marginBottom: "12px",
        borderRadius: "8px",
        border: "1px solid var(--orca-color-border)",
        background: "var(--orca-color-bg-2)",
        overflow: "hidden",
      },
      onMouseEnter: () => setShowActions(true),
      onMouseLeave: () => setShowActions(false),
    },
    // Header - 显示 "已深度思考 (用时 X 秒, Y 步)"
    createElement(
      "div",
      {
        onClick: () => setIsExpanded(!isExpanded),
        style: {
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "10px 14px",
          cursor: "pointer",
          background: "var(--orca-color-bg-3)",
          userSelect: "none",
          transition: "background 0.2s",
          position: "relative",
        },
        onMouseEnter: (e: any) => {
          e.currentTarget.style.background = "var(--orca-color-bg-4)";
        },
        onMouseLeave: (e: any) => {
          e.currentTarget.style.background = "var(--orca-color-bg-3)";
        },
      },
      createElement("i", {
        className: isStreaming ? "ti ti-loader" : "ti ti-brain",
        style: {
          fontSize: "16px",
          color: "var(--orca-color-primary)",
          animation: isStreaming ? "spin 1s linear infinite" : undefined,
        },
      }),
      createElement(
        "div",
        { 
          style: { 
            flex: 1,
            display: "flex",
            flexDirection: "column",
            gap: "2px",
          } 
        },
        // 主标题
        createElement(
          "span",
          { 
            style: { 
              fontSize: "13px", 
              fontWeight: 500, 
              color: "var(--orca-color-text-1)",
            } 
          },
          isStreaming 
            ? `深度思考中... (${elapsedTime}秒)`
            : `已深度思考 (${displayTime}秒, ${stepCount}步)`
        ),
        // 折叠时显示摘要
        !isExpanded && !isStreaming && summary && createElement(
          "span",
          {
            style: {
              fontSize: "11px",
              color: "var(--orca-color-text-3)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              maxWidth: "300px",
            },
          },
          summary
        ),
        // 流式时显示当前步骤
        isStreaming && steps.length > 0 && createElement(
          "span",
          {
            style: {
              fontSize: "11px",
              color: "var(--orca-color-text-2)",
              display: "flex",
              alignItems: "center",
              gap: "4px",
            },
          },
          createElement("i", {
            className: "ti ti-arrow-right",
            style: { fontSize: "10px", color: "var(--orca-color-primary)" },
          }),
          steps[currentStepIndex] || "分析中..."
        )
      ),
      // 步骤进度指示器（流式时显示）
      isStreaming && steps.length > 1 && createElement(
        "div",
        {
          style: {
            display: "flex",
            alignItems: "center",
            gap: "3px",
            marginRight: "8px",
          },
        },
        ...steps.slice(0, Math.min(5, steps.length)).map((_, idx) => 
          createElement("div", {
            key: idx,
            style: {
              width: "6px",
              height: "6px",
              borderRadius: "50%",
              background: idx <= currentStepIndex 
                ? "var(--orca-color-primary)" 
                : "var(--orca-color-border)",
              transition: "background 0.3s",
            },
          })
        ),
        steps.length > 5 && createElement(
          "span",
          { style: { fontSize: "10px", color: "var(--orca-color-text-3)" } },
          `+${steps.length - 5}`
        )
      ),
      // 操作按钮（始终占据空间，通过透明度控制显示）
      !isStreaming && createElement(
        "div",
        {
          style: {
            display: "flex",
            gap: "4px",
            marginRight: "8px",
            opacity: showActions ? 1 : 0,
            pointerEvents: showActions ? "auto" : "none",
            transition: "opacity 0.2s",
          },
          onClick: (e: any) => e.stopPropagation(), // 防止触发折叠
        },
        // 复制按钮
        createElement(
          "button",
          {
            onClick: handleCopy,
            style: {
              padding: "4px 8px",
              border: "none",
              borderRadius: "4px",
              background: "var(--orca-color-bg-4)",
              color: "var(--orca-color-text-2)",
              cursor: "pointer",
              fontSize: "12px",
              display: "flex",
              alignItems: "center",
              gap: "4px",
              transition: "all 0.2s",
            },
            title: "复制推理内容",
          },
          createElement("i", {
            className: "ti ti-copy",
            style: { fontSize: "14px" },
          })
        )
      ),
      createElement("i", {
        className: isExpanded ? "ti ti-chevron-up" : "ti ti-chevron-down",
        style: { 
          fontSize: "14px", 
          color: "var(--orca-color-text-3)",
        },
      })
    ),
    // 完成摘要（非流式、折叠状态、有步骤时显示）
    !isStreaming && !isExpanded && steps.length > 0 && createElement(
      "div",
      {
        style: {
          padding: "8px 14px",
          borderTop: "1px solid var(--orca-color-border)",
          background: "var(--orca-color-bg-2)",
        },
      },
      // 步骤列表预览（最多显示3个）
      createElement(
        "div",
        {
          style: {
            display: "flex",
            flexDirection: "column",
            gap: "4px",
          },
        },
        ...steps.slice(0, 3).map((step, idx) =>
          createElement(
            "div",
            {
              key: idx,
              style: {
                display: "flex",
                alignItems: "center",
                gap: "6px",
                fontSize: "11px",
                color: "var(--orca-color-text-2)",
              },
            },
            createElement("span", {
              style: {
                width: "16px",
                height: "16px",
                borderRadius: "50%",
                background: "var(--orca-color-primary)",
                color: "white",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "10px",
                fontWeight: 600,
                flexShrink: 0,
              },
            }, String(idx + 1)),
            createElement("span", {
              style: {
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              },
            }, step)
          )
        ),
        steps.length > 3 && createElement(
          "div",
          {
            style: {
              fontSize: "11px",
              color: "var(--orca-color-text-3)",
              paddingLeft: "22px",
              fontStyle: "italic",
            },
          },
          `还有 ${steps.length - 3} 个步骤...`
        )
      )
    ),
    // Content - 推理内容（可展开查看，支持 Markdown 渲染）
    isExpanded && createElement(
      "div",
      {
        style: {
          padding: "12px 14px",
          fontSize: "13px",
          color: "var(--orca-color-text-2)",
          lineHeight: 1.6,
          maxHeight: "400px",
          overflowY: "auto",
          borderTop: "1px solid var(--orca-color-border)",
        },
      },
      createElement(MarkdownMessage, { content: reasoning, role: "assistant" })
    )
  );
}

interface MessageItemProps {
  message: Message;
  messageIndex?: number; // 消息在列表中的索引，用于目录导航
  isLastAiMessage?: boolean;
  isStreaming?: boolean;
  // 选择模式相关
  selectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelection?: () => void;
  onRegenerate?: () => void;
  onDelete?: () => void;
  onRollback?: () => void; // 回档到此消息（删除此消息及之后的所有消息）
  onTogglePinned?: () => void; // 切换消息的重要标记
  // Tool result mapping: toolCallId -> result content
  toolResults?: Map<string, { content: string; name: string }>;
  // Conversation context for memory extraction (all messages up to this point)
  conversationContext?: string;
  // Callback when memories are extracted from this message
  onExtractMemory?: (memories: ExtractedMemory[]) => void;
  // Callback when user clicks a suggested reply
  onSuggestedReply?: (text: string) => void;
  // Callback to generate AI-powered suggestions
  onGenerateSuggestions?: () => Promise<string[]>;
  // Token statistics for this message
  tokenStats?: {
    messageTokens: number;      // 当前消息的 token 数
    cumulativeTokens: number;   // 累计到此消息的 token 数
    cost?: number;              // 本条消息费用
    cumulativeCost?: number;    // 累计费用
    currencySymbol?: string;    // 货币符号
    // 新增：输入/输出分开统计（用于最后一条消息显示总计）
    totalInputTokens?: number;  // 总输入 token
    totalOutputTokens?: number; // 总输出 token
    totalInputCost?: number;    // 总输入费用
    totalOutputCost?: number;   // 总输出费用
    isLastMessage?: boolean;    // 是否是最后一条消息
  };
}

/**
 * Render a tool call with its result using ToolStatusIndicator
 * Gemini UX Review: Unified tool call + result display
 */
function ToolCallWithResult({
  toolCall,
  result,
  isLoading,
}: {
  toolCall: ToolCallInfo;
  result?: { content: string; name: string };
  isLoading: boolean;
}) {
  const status = isLoading ? "loading" : result ? "success" : "loading";

  return createElement(ToolStatusIndicator, {
    toolName: toolCall.function.name,
    status,
    args: toolCall.function.arguments,
    result: result?.content,
  });
}

/**
 * CollapsibleToolCalls - 可折叠的工具调用列表
 * 流式传输时展开，完成后自动折叠
 * 
 * Enhanced features (Requirements 10.3):
 * - Shows parallel progress indicator (x/y 完成)
 */
function CollapsibleToolCalls({
  toolCalls,
  toolResults,
  isStreaming,
}: {
  toolCalls: ToolCallInfo[];
  toolResults?: Map<string, { content: string; name: string }>;
  isStreaming?: boolean;
}) {
  const [isExpanded, setIsExpanded] = useState(true);

  // 检查是否所有工具调用都已完成
  const allCompleted = useMemo(() => {
    if (!toolResults) return false;
    return toolCalls.every((tc) => toolResults.has(tc.id));
  }, [toolCalls, toolResults]);

  // 流式传输时展开，完成后自动折叠
  useEffect(() => {
    if (!isStreaming && allCompleted) {
      const timer = setTimeout(() => setIsExpanded(false), 800);
      return () => clearTimeout(timer);
    }
  }, [isStreaming, allCompleted]);

  const toolCount = toolCalls.length;
  const completedCount = toolResults
    ? toolCalls.filter((tc) => toolResults.has(tc.id)).length
    : 0;

  // Format progress string (Requirements 10.3)
  const progressText = `${completedCount}/${toolCount} 完成`;

  // 折叠状态的摘要头部
  const collapsedHeader = createElement(
    "div",
    {
      onClick: () => setIsExpanded(true),
      style: {
        display: "flex",
        alignItems: "center",
        gap: "6px",
        padding: "6px 10px",
        borderRadius: "6px",
        background: "var(--orca-color-bg-2)",
        border: "1px solid var(--orca-color-border)",
        cursor: "pointer",
        fontSize: "12px",
        color: "var(--orca-color-text-2)",
      },
    },
    createElement("i", {
      className: "ti ti-tools",
      style: { fontSize: "14px", color: "var(--orca-color-primary)" },
    }),
    // Progress indicator (Requirements 10.3)
    createElement(
      "span",
      {
        style: {
          display: "inline-flex",
          alignItems: "center",
          gap: "4px",
        },
      },
      `已执行 ${progressText}`,
      // Progress bar
      toolCount > 1 && createElement(
        "span",
        {
          style: {
            display: "inline-flex",
            alignItems: "center",
            gap: "2px",
            marginLeft: "4px",
          },
        },
        ...Array.from({ length: toolCount }, (_, i) =>
          createElement("span", {
            key: i,
            style: {
              width: "6px",
              height: "6px",
              borderRadius: "50%",
              background: i < completedCount
                ? "var(--orca-color-success)"
                : "var(--orca-color-border)",
              transition: "background 0.3s",
            },
          })
        )
      )
    ),
    createElement("i", {
      className: "ti ti-chevron-down",
      style: { fontSize: "12px", marginLeft: "auto" },
    })
  );

  // 展开状态的头部（带折叠按钮和进度指示）
  const expandedHeader = createElement(
    "div",
    {
      onClick: () => setIsExpanded(false),
      style: {
        display: "flex",
        alignItems: "center",
        gap: "6px",
        padding: "6px 10px",
        marginBottom: "8px",
        borderRadius: "6px",
        background: "var(--orca-color-bg-2)",
        border: "1px solid var(--orca-color-border)",
        cursor: "pointer",
        fontSize: "12px",
        color: "var(--orca-color-text-2)",
      },
    },
    createElement("i", {
      className: isStreaming && !allCompleted ? "ti ti-loader" : "ti ti-tools",
      style: {
        fontSize: "14px",
        color: "var(--orca-color-primary)",
        animation: isStreaming && !allCompleted ? "spin 1s linear infinite" : undefined,
      },
    }),
    // Progress indicator (Requirements 10.3)
    createElement(
      "span",
      {
        style: {
          display: "inline-flex",
          alignItems: "center",
          gap: "4px",
        },
      },
      isStreaming && !allCompleted
        ? `工具执行中 ${progressText}`
        : `${toolCount} 个工具调用 (${progressText})`,
      // Progress dots for multiple tools
      toolCount > 1 && createElement(
        "span",
        {
          style: {
            display: "inline-flex",
            alignItems: "center",
            gap: "2px",
            marginLeft: "4px",
          },
        },
        ...Array.from({ length: toolCount }, (_, i) =>
          createElement("span", {
            key: i,
            style: {
              width: "6px",
              height: "6px",
              borderRadius: "50%",
              background: i < completedCount
                ? "var(--orca-color-success)"
                : isStreaming
                  ? "var(--orca-color-warning)"
                  : "var(--orca-color-border)",
              transition: "background 0.3s",
            },
          })
        )
      )
    ),
    createElement("i", {
      className: "ti ti-chevron-up",
      style: { fontSize: "12px", marginLeft: "auto" },
    })
  );

  // 工具调用列表
  const toolList = toolCalls.map((tc) =>
    createElement(ToolCallWithResult, {
      key: tc.id,
      toolCall: tc,
      result: toolResults?.get(tc.id),
      isLoading: isStreaming || !toolResults?.has(tc.id),
    })
  );

  return createElement(
    "div",
    {
      style: {
        marginTop: "12px",
      },
    },
    isExpanded
      ? createElement("div", null, expandedHeader, ...toolList)
      : collapsedHeader
  );
}

/**
 * Tool result item for standalone tool messages (role='tool')
 * Gemini UX Review: Uses semantic status indicator instead of technical card
 */
function ToolResultItem({ message }: { message: Message }) {
  const toolName = message.name || "Unknown Tool";

  return createElement(
    "div",
    { style: { ...messageRowStyle("tool"), justifyContent: "flex-start" } },
    createElement(
      "div",
      { style: { maxWidth: "90%", width: "100%" } },
      createElement(ToolStatusIndicator, {
        toolName,
        status: "success",
        result: message.content,
      })
    )
  );
}

export default function MessageItem({
  message,
  messageIndex,
  isLastAiMessage,
  isStreaming,
  selectionMode,
  isSelected,
  onToggleSelection,
  onRegenerate,
  onDelete,
  onRollback,
  onTogglePinned,
  toolResults,
  conversationContext,
  onExtractMemory,
  onSuggestedReply,
  onGenerateSuggestions,
  tokenStats,
}: MessageItemProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isExtractDropdownOpen, setIsExtractDropdownOpen] = useState(false);
  const isUser = message.role === "user";
  const isTool = message.role === "tool";
  const isAssistant = message.role === "assistant";
  const isPinned = (message as any).pinned === true;

  // Display settings from store
  const displaySettings = useSnapshot(displaySettingsStore);
  const showTimestamp = shouldRenderTimestamp(displaySettings.showTimestamps);

  // Keep action bar visible when dropdown is open
  const showActionBar = isHovered || isExtractDropdownOpen;

  const handleCopy = useCallback(() => {
    if (message.content) {
      navigator.clipboard.writeText(message.content).then(() => {
        // Optional: toast notification
        if (typeof orca !== "undefined" && orca.notify) {
          orca.notify("success", "Copied to clipboard");
        }
      });
    }
  }, [message.content]);

  // 复制选中的文本
  const handleCopySelection = useCallback(() => {
    const selection = window.getSelection();
    const selectedText = selection?.toString();
    if (selectedText) {
      navigator.clipboard.writeText(selectedText).then(() => {
        if (typeof orca !== "undefined" && orca.notify) {
          orca.notify("success", "已复制选中内容");
        }
      });
    }
  }, []);

  // 检查是否有选中的文本
  const hasSelection = useCallback(() => {
    const selection = window.getSelection();
    return selection && selection.toString().length > 0;
  }, []);

  // Check if any tool calls are still loading
  const toolCallsLoading = useMemo(() => {
    if (!message.tool_calls || !toolResults) return true;
    return message.tool_calls.some((tc) => !toolResults.has(tc.id));
  }, [message.tool_calls, toolResults]);

  // Special handling for tool result messages (standalone)
  if (isTool) {
    return createElement(ToolResultItem, { message });
  }

  // 选择模式下的样式
  const selectionModeStyle: React.CSSProperties = selectionMode ? {
    cursor: "pointer",
    border: isSelected ? "2px solid var(--orca-color-primary)" : "2px solid transparent",
    borderRadius: "12px",
    transition: "border-color 0.2s",
  } : {};

  // Apply display settings to message row
  const messageRowWithSettings: React.CSSProperties = {
    ...messageRowStyle(message.role),
    marginBottom: `${getMessageGap(displaySettings.compactMode)}px`,
  };

  // Apply display settings to message bubble
  const messageBubbleWithSettings: React.CSSProperties = {
    ...messageBubbleStyle(message.role),
    padding: getBubblePadding(displaySettings.compactMode),
    fontSize: fontSizeMap[displaySettings.fontSize],
  };

  return createElement(
    "div",
    {
      style: { ...messageRowWithSettings, ...selectionModeStyle },
      "data-message-index": messageIndex,
      "data-message-id": message.id,
      onMouseEnter: () => setIsHovered(true),
      onMouseLeave: () => setIsHovered(false),
      onClick: selectionMode && onToggleSelection ? onToggleSelection : undefined,
    },
    // 选择模式下显示复选框
    selectionMode && createElement(
      "div",
      {
        style: {
          position: "absolute",
          left: isUser ? "auto" : "8px",
          right: isUser ? "8px" : "auto",
          top: "8px",
          zIndex: 10,
        },
      },
      createElement("i", {
        className: isSelected ? "ti ti-checkbox" : "ti ti-square",
        style: {
          fontSize: "20px",
          color: isSelected ? "var(--orca-color-primary)" : "var(--orca-color-text-3)",
        },
      })
    ),
    createElement(
      ContextMenu as any,
      {
        menu: (close: () => void) => createElement(
          Menu as any,
          null,
          // 复制选中内容（仅当有选中时显示）
          hasSelection() && createElement(MenuText as any, {
            preIcon: "ti ti-copy",
            title: "复制选中内容",
            onClick: () => {
              handleCopySelection();
              close();
            },
          }),
          // 复制全部内容
          message.content && createElement(MenuText as any, {
            preIcon: "ti ti-clipboard",
            title: "复制全部内容",
            onClick: () => {
              handleCopy();
              close();
            },
          })
        ),
      },
      (open: (e: any) => void) => createElement(
        "div",
        {
          style: messageBubbleWithSettings,
          className: `message-bubble-${message.role}`,
          onContextMenu: open,
        },
      // 文件显示（图片和其他文件）
      message.files &&
        message.files.length > 0 &&
        createElement(
          "div",
          {
            style: {
              display: "flex",
              flexWrap: "wrap",
              gap: "8px",
              marginBottom: message.content ? "8px" : "0",
            },
          },
          ...message.files.map((file, index) => {
            const isImage = file.category === "image";
            return createElement(
              "div",
              {
                key: `${file.path}-${index}`,
                style: {
                  borderRadius: "8px",
                  overflow: "hidden",
                  maxWidth: isImage ? "200px" : "180px",
                  cursor: "pointer",
                  border: isImage ? undefined : "1px solid var(--orca-color-border)",
                  background: isImage ? undefined : "var(--orca-color-bg-2)",
                  padding: isImage ? undefined : "8px 12px",
                  display: isImage ? undefined : "flex",
                  alignItems: isImage ? undefined : "center",
                  gap: isImage ? undefined : "8px",
                },
                onClick: () => {
                  orca.invokeBackend("shell-open", getFileFullPath(file));
                },
                title: file.name,
              },
              isImage
                ? createElement("img", {
                    src: getFileDisplayUrl(file),
                    alt: file.name,
                    style: {
                      maxWidth: "100%",
                      maxHeight: "200px",
                      objectFit: "contain",
                      display: "block",
                    },
                    onError: (e: any) => {
                      e.target.style.display = "none";
                    },
                  })
                : [
                    createElement("i", {
                      key: "icon",
                      className: getFileIcon(file.name, file.mimeType),
                      style: { fontSize: "18px", color: "var(--orca-color-primary)" },
                    }),
                    createElement("span", {
                      key: "name",
                      style: {
                        fontSize: "12px",
                        color: "var(--orca-color-text-1)",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      },
                    }, file.name),
                  ]
            );
          })
        ),
      // 兼容旧版 images 字段
      message.images &&
        message.images.length > 0 &&
        !message.files &&
        createElement(
          "div",
          {
            style: {
              display: "flex",
              flexWrap: "wrap",
              gap: "8px",
              marginBottom: message.content ? "8px" : "0",
            },
          },
          ...message.images.map((img, index) =>
            createElement(
              "div",
              {
                key: `${img.path}-${index}`,
                style: {
                  borderRadius: "8px",
                  overflow: "hidden",
                  maxWidth: "200px",
                  cursor: "pointer",
                },
                onClick: () => {
                  orca.invokeBackend("shell-open", getFileFullPath(img));
                },
                title: img.name,
              },
              createElement("img", {
                src: getFileDisplayUrl(img),
                alt: img.name,
                style: {
                  maxWidth: "100%",
                  maxHeight: "200px",
                  objectFit: "contain",
                  display: "block",
                },
                onError: (e: any) => {
                  e.target.style.display = "none";
                },
              })
            )
          )
        ),
      // Reasoning/Thinking (显示 AI 推理过程) - 只在 assistant 消息中显示
      isAssistant && message.reasoning && createElement(ReasoningBlock, {
        reasoning: message.reasoning,
        isStreaming,
      }),

      // Context References (显示用户消息关联的上下文引用)
      isUser && message.contextRefs && message.contextRefs.length > 0 && createElement(
        "div",
        {
          style: {
            display: "flex",
            flexWrap: "wrap",
            gap: "6px",
            marginBottom: "8px",
          },
        },
        ...message.contextRefs.map((ref, idx) => createElement(
          "span",
          {
            key: idx,
            style: {
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              fontSize: "12px",
              color: "var(--orca-color-primary)",
              background: "var(--orca-color-bg-3)",
              padding: "2px 8px",
              borderRadius: "4px",
              border: "1px solid var(--orca-color-border)",
              cursor: ref.blockId ? "pointer" : "default",
            },
            onClick: ref.blockId ? (e: any) => {
              e.preventDefault();
              e.stopPropagation();
              // 跳转到页面
              try {
                orca.nav.openInLastPanel("block", { blockId: ref.blockId });
              } catch (error) {
                console.error("[MessageItem] Navigation failed:", error);
              }
            } : undefined,
            title: ref.blockId ? "点击跳转到页面" : undefined,
          },
          createElement("i", {
            className: ref.kind === "page" ? "ti ti-file-text" : "ti ti-hash",
            style: { fontSize: "12px" },
          }),
          ref.title
        ))
      ),

      // Content
      createElement(MarkdownMessage, { content: message.content || "", role: message.role }),

      // Cursor for streaming - 如果内容为空，显示"正在输出"提示
      isStreaming &&
        (message.content && message.content.length > 0
          ? createElement("span", {
              style: cursorStyle,
            })
          : createElement(
              "div",
              {
                style: {
                  display: "flex",
                  alignItems: "center",
                  gap: "6px",
                  color: "var(--orca-color-text-3)",
                  fontSize: "13px",
                  fontStyle: "italic",
                  marginTop: "4px",
                },
              },
              createElement("i", {
                className: "ti ti-dots",
                style: {
                  fontSize: "16px",
                  animation: "pulse 1.5s ease-in-out infinite",
                },
              }),
              "正在输出"
            )),

      // Tool Calls with Results (unified display, auto-collapse when done)
      message.tool_calls &&
        message.tool_calls.length > 0 &&
        createElement(CollapsibleToolCalls, {
          toolCalls: message.tool_calls,
          toolResults,
          isStreaming,
        }),

      // Suggested Replies (only for last AI message, after streaming completes)
      isAssistant &&
        isLastAiMessage &&
        !isStreaming &&
        message.content &&
        onSuggestedReply &&
        onGenerateSuggestions &&
        createElement(SuggestedReplies, {
          onReplyClick: onSuggestedReply,
          onGenerate: onGenerateSuggestions,
        }),

      // Message Time and Token Stats
      (message.createdAt || tokenStats || (isAssistant && message.model)) &&
        createElement(
          "div",
          { 
            style: {
              ...messageTimeStyle(message.role),
              display: "flex",
              alignItems: "center",
              gap: "8px",
              flexWrap: "wrap",
            } 
          },
          // 时间 (controlled by showTimestamps setting)
          showTimestamp && message.createdAt && formatMessageTime(message.createdAt),
          // Token 统计
          tokenStats && createElement(
            "span",
            {
              style: {
                display: "inline-flex",
                alignItems: "center",
                gap: "4px",
                fontSize: "11px",
                color: "var(--orca-color-text-3)",
                background: "var(--orca-color-bg-3)",
                padding: "2px 6px",
                borderRadius: "4px",
              },
              title: `本条消息: ${tokenStats.messageTokens} tokens${tokenStats.cost ? ` (${tokenStats.currencySymbol || '$'}${tokenStats.cost.toFixed(4)})` : ''}\n累计上下文: ${tokenStats.cumulativeTokens} tokens${tokenStats.cumulativeCost ? ` (${tokenStats.currencySymbol || '$'}${tokenStats.cumulativeCost.toFixed(4)})` : ''}`,
            },
            createElement("i", {
              className: "ti ti-chart-bar",
              style: { fontSize: "10px" },
            }),
            `${formatTokenCount(tokenStats.messageTokens)}`,
            createElement(
              "span",
              { style: { opacity: 0.6 } },
              `/ ${formatTokenCount(tokenStats.cumulativeTokens)}`
            ),
            // 显示本条消息费用（如果有）
            tokenStats.cost !== undefined && tokenStats.cost > 0 && createElement(
              "span",
              { 
                style: { 
                  marginLeft: "4px",
                  color: "var(--orca-color-warning)",
                  fontWeight: 500,
                } 
              },
              `${tokenStats.currencySymbol || '$'}${tokenStats.cost < 0.001 ? tokenStats.cost.toFixed(5) : tokenStats.cost < 0.01 ? tokenStats.cost.toFixed(4) : tokenStats.cost.toFixed(3)}`
            )
          ),
          // 模型名称（仅 AI 消息，显示在最右边）
          isAssistant && message.model && createElement(
            "span",
            {
              style: {
                fontSize: "11px",
                color: "var(--orca-color-primary)",
                background: "var(--orca-color-bg-3)",
                padding: "2px 6px",
                borderRadius: "4px",
              },
            },
            message.model
          ),
          // 最后一条消息显示总计统计
          tokenStats?.isLastMessage && createElement(
            "div",
            {
              style: {
                display: "flex",
                alignItems: "center",
                gap: "8px",
                fontSize: "11px",
                color: "var(--orca-color-text-2)",
                background: "var(--orca-color-bg-3)",
                padding: "4px 8px",
                borderRadius: "4px",
                marginTop: "4px",
                width: "100%",
              },
            },
            createElement("i", { className: "ti ti-calculator", style: { fontSize: "12px" } }),
            createElement("span", { style: { fontWeight: 500 } }, "总计:"),
            // 输入
            createElement(
              "span",
              { style: { display: "flex", alignItems: "center", gap: "2px" } },
              createElement("i", { className: "ti ti-arrow-up", style: { fontSize: "10px", color: "var(--orca-color-success)" } }),
              `${formatTokenCount(tokenStats.totalInputTokens || 0)}`,
              tokenStats.totalInputCost !== undefined && tokenStats.totalInputCost > 0 && createElement(
                "span",
                { style: { color: "var(--orca-color-success)", marginLeft: "2px" } },
                `(${tokenStats.currencySymbol || '$'}${tokenStats.totalInputCost < 0.001 ? tokenStats.totalInputCost.toFixed(5) : tokenStats.totalInputCost.toFixed(4)})`
              )
            ),
            // 输出
            createElement(
              "span",
              { style: { display: "flex", alignItems: "center", gap: "2px" } },
              createElement("i", { className: "ti ti-arrow-down", style: { fontSize: "10px", color: "var(--orca-color-primary)" } }),
              `${formatTokenCount(tokenStats.totalOutputTokens || 0)}`,
              tokenStats.totalOutputCost !== undefined && tokenStats.totalOutputCost > 0 && createElement(
                "span",
                { style: { color: "var(--orca-color-primary)", marginLeft: "2px" } },
                `(${tokenStats.currencySymbol || '$'}${tokenStats.totalOutputCost < 0.001 ? tokenStats.totalOutputCost.toFixed(5) : tokenStats.totalOutputCost.toFixed(4)})`
              )
            ),
            // 总费用
            tokenStats.cumulativeCost !== undefined && tokenStats.cumulativeCost > 0 && createElement(
              "span",
              { style: { fontWeight: 600, color: "var(--orca-color-warning)", marginLeft: "4px" } },
              `= ${tokenStats.currencySymbol || '$'}${tokenStats.cumulativeCost < 0.01 ? tokenStats.cumulativeCost.toFixed(4) : tokenStats.cumulativeCost.toFixed(3)}`
            )
          )
        ),

      // Action Bar
      createElement(
        "div",
        {
          style: {
            ...actionBarStyle,
            opacity: showActionBar ? 1 : 0,
            pointerEvents: showActionBar ? "auto" : "none",
          },
        },
        // Copy Button
        createElement(
          "button",
          {
            style: actionButtonStyle,
            onClick: handleCopy,
            title: "Copy message",
          },
          createElement("i", { className: "ti ti-copy" })
        ),
        // Pin Button (标记重要，压缩时保留)
        onTogglePinned &&
          !isStreaming &&
          createElement(
            "button",
            {
              style: {
                ...actionButtonStyle,
                color: isPinned ? "var(--orca-color-warning)" : undefined,
              },
              onClick: onTogglePinned,
              title: isPinned ? "取消重要标记" : "标记为重要（压缩时保留）",
            },
            createElement("i", { className: isPinned ? "ti ti-pin-filled" : "ti ti-pin" })
          ),
        // Delete Button
        onDelete &&
          !isStreaming &&
          createElement(
            "button",
            {
              style: actionButtonStyle,
              onClick: onDelete,
              title: "删除此消息",
            },
            createElement("i", { className: "ti ti-trash" })
          ),
        // Rollback Button (回档到此消息之前)
        onRollback &&
          !isStreaming &&
          createElement(
            "button",
            {
              style: actionButtonStyle,
              onClick: onRollback,
              title: "回档到此处（删除此消息及之后的所有消息）",
            },
            createElement("i", { className: "ti ti-arrow-back-up" })
          ),
        // Save to Journal Button (保存单条消息到日记)
        !isStreaming &&
          message.content &&
          createElement(
            "button",
            {
              style: actionButtonStyle,
              onClick: async () => {
                const result = await saveSingleMessageToJournal(message, message.model);
                if (result.success) {
                  orca.notify("success", result.message);
                } else {
                  orca.notify("error", result.message);
                }
              },
              title: "保存到日记",
            },
            createElement("i", { className: "ti ti-notebook" })
          ),
        // Extract Memory Button (Only for AI messages with content)
        isAssistant &&
          message.content &&
          conversationContext &&
          onExtractMemory &&
          !isStreaming &&
          createElement(ExtractMemoryButton, {
            conversationContext,
            onExtracted: onExtractMemory,
            onDropdownVisibilityChange: setIsExtractDropdownOpen,
          }),
        // Regenerate Button (Only for last AI message)
        !isUser &&
          isLastAiMessage &&
          onRegenerate &&
          createElement(
            "button",
            {
              style: actionButtonStyle,
              onClick: onRegenerate,
              title: "Regenerate response",
            },
            createElement("i", { className: "ti ti-refresh" })
          )
      )
    )
    )
  );
}
