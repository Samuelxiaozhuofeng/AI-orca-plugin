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
import EnhancedMarkdownMessage from "../components/EnhancedMarkdownMessage";
import ToolStatusIndicator from "../components/ToolStatusIndicator";
import SuggestedReplies from "../components/SuggestedReplies";
import ExtractMemoryButton from "./ExtractMemoryButton";
import type { ExtractedMemory } from "../services/ai/memory-extraction";
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
import type { ToolCallInfo } from "../services/ai/chat-stream-handler";
import { formatTokenCount } from "../utils/token-utils";
import { tooltipText, withTooltip } from "../utils/orca-tooltip";
import { groupSourcesByDomain, normalizeWebSearchResults, type SourceGroup, type WebSearchSource } from "../utils/source-attribution";
import {
  displaySettingsStore,
  fontSizeMap,
  getMessageGap,
  getBubblePadding,
  shouldRenderTimestamp,
} from "../store/display-settings-store";

const React = window.React as unknown as {
  createElement: typeof window.React.createElement;
  useState: <T>(initial: T | (() => T)) => [T, (next: T | ((prev: T) => T)) => void];
  useCallback: <T extends (...args: any[]) => any>(fn: T, deps: any[]) => T;
  useMemo: <T>(factory: () => T, deps: any[]) => T;
  useEffect: (effect: () => void | (() => void), deps?: any[]) => void;
  useRef: <T>(initial: T) => { current: T };
  Fragment: typeof window.React.Fragment;
};
const { createElement, useState, useCallback, useMemo, useEffect, useRef, Fragment } = React;

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

function openExternalUrl(url: string) {
  if (!url) return;
  try {
    orca.invokeBackend("shell-open", url);
  } catch {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}

type SourceAnchor = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
  rowWidth: number;
  rowHeight: number;
};

function SourceCardPanel({
  group,
  anchor,
  onClose,
  onHoverStart,
  onHoverEnd,
}: {
  group: SourceGroup;
  anchor: SourceAnchor | null;
  onClose: () => void;
  onHoverStart: () => void;
  onHoverEnd: () => void;
}) {
  const isNarrow = typeof window !== "undefined" && window.innerWidth < 900;
  const panelWidth = 260;
  const edgePadding = 12;
  const panelMaxHeight = 220;
  const offsetGap = 8;
  const totalSources = group.sources.length;
  const [activeIndex, setActiveIndex] = useState(0);
  const clampedIndex = totalSources > 0 ? Math.min(activeIndex, totalSources - 1) : 0;
  const activeSource = totalSources > 0 ? group.sources[clampedIndex] : null;
  const canNavigate = totalSources > 1;

  useEffect(() => {
    setActiveIndex(0);
  }, [group.id]);

  let top = edgePadding;
  let left = edgePadding;

  if (anchor) {
    const spaceBelow = anchor.rowHeight - anchor.bottom;
    const spaceAbove = anchor.top;
    const openAbove = !isNarrow && spaceBelow < 180 && spaceAbove > spaceBelow;

    top = openAbove
      ? Math.max(edgePadding, anchor.top - panelMaxHeight - offsetGap)
      : anchor.bottom + offsetGap;

    if (!isNarrow) {
      left = anchor.left;
      if (left + panelWidth > anchor.rowWidth - edgePadding) {
        left = Math.max(edgePadding, anchor.rowWidth - panelWidth - edgePadding);
      }
      if (left < edgePadding) left = edgePadding;
    }
  }

  const containerStyle: React.CSSProperties = {
    position: "absolute",
    top,
    left: isNarrow ? edgePadding : left,
    right: isNarrow ? edgePadding : "auto",
    width: isNarrow ? `calc(100% - ${edgePadding * 2}px)` : panelWidth,
    maxWidth: isNarrow ? `calc(100% - ${edgePadding * 2}px)` : panelWidth,
    background: "var(--orca-color-bg-1)",
    border: "1px solid var(--orca-color-border)",
    borderRadius: 12,
    boxShadow: "0 8px 24px rgba(0,0,0,0.08)",
    padding: 10,
    zIndex: 20,
  };

  return createElement(
    "div",
    {
      style: containerStyle,
      onMouseEnter: onHoverStart,
      onMouseLeave: onHoverEnd,
      onClick: (e: any) => e.stopPropagation(),
    },
    createElement(
      "div",
      {
        style: {
          display: "flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 8,
        },
      },
      withTooltip(
        activeSource?.domain || group.label,
        createElement(
          "div",
          {
            style: {
              fontSize: "12px",
              fontWeight: 600,
              color: "var(--orca-color-text-2)",
              flex: 1,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            },
          },
          activeSource?.domain || group.label
        )
      ),
      canNavigate &&
        createElement(
          "div",
          {
            style: {
              display: "inline-flex",
              alignItems: "center",
              gap: 4,
              color: "var(--orca-color-text-3)",
              fontSize: "11px",
            },
          },
          withTooltip(
            "Previous",
            createElement(
              "button",
              {
                style: {
                  background: "transparent",
                  border: "none",
                  color: "var(--orca-color-text-3)",
                  cursor: "pointer",
                  padding: 2,
                },
                onClick: (e: any) => {
                  e.stopPropagation();
                  setActiveIndex((prev) => (prev - 1 + totalSources) % totalSources);
                },
              },
              createElement("i", { className: "ti ti-chevron-left", style: { fontSize: "13px" } })
            )
          ),
          createElement("span", null, `${clampedIndex + 1}/${totalSources}`),
          withTooltip(
            "Next",
            createElement(
              "button",
              {
                style: {
                  background: "transparent",
                  border: "none",
                  color: "var(--orca-color-text-3)",
                  cursor: "pointer",
                  padding: 2,
                },
                onClick: (e: any) => {
                  e.stopPropagation();
                  setActiveIndex((prev) => (prev + 1) % totalSources);
                },
              },
              createElement("i", { className: "ti ti-chevron-right", style: { fontSize: "13px" } })
            )
          )
        ),
      withTooltip(
        "Close",
        createElement(
          "button",
          {
            style: {
              background: "transparent",
              border: "none",
              color: "var(--orca-color-text-3)",
              cursor: "pointer",
              padding: 2,
            },
            onClick: onClose,
          },
          createElement("i", { className: "ti ti-x", style: { fontSize: "14px" } })
        )
      )
    ),
    activeSource &&
      createElement(
        "div",
        {
          style: {
            border: "1px solid var(--orca-color-border)",
            borderRadius: 10,
            padding: "8px 10px",
            background: "var(--orca-color-bg-2)",
            maxHeight: isNarrow ? "none" : panelMaxHeight,
            overflow: "hidden",
          },
        },
        createElement(
          "div",
          {
            style: {
              display: "flex",
              alignItems: "flex-start",
              gap: 8,
              marginBottom: 6,
            },
          },
          createElement(
            "div",
            {
              style: {
                flex: 1,
                fontSize: "13px",
                fontWeight: 600,
                color: "var(--orca-color-text-1)",
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
              },
            },
            activeSource.title
          ),
          withTooltip(
            "Open source",
            createElement(
              "button",
              {
                style: {
                  background: "transparent",
                  border: "none",
                  color: "var(--orca-color-text-3)",
                  cursor: "pointer",
                  padding: 2,
                },
                onClick: (e: any) => {
                  e.stopPropagation();
                  openExternalUrl(activeSource.url);
                },
              },
              createElement("i", { className: "ti ti-external-link", style: { fontSize: "13px" } })
            )
          )
        ),
        createElement(
          "div",
          {
            style: {
              fontSize: "11px",
              color: "var(--orca-color-text-3)",
              marginBottom: activeSource.snippet ? 6 : 0,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            },
          },
          activeSource.domain || activeSource.url
        ),
        activeSource.snippet &&
          createElement(
            "div",
            {
              style: {
                fontSize: "12px",
                color: "var(--orca-color-text-2)",
                lineHeight: 1.4,
                display: "-webkit-box",
                WebkitLineClamp: 2,
                WebkitBoxOrient: "vertical",
                overflow: "hidden",
                marginBottom: 6,
              },
            },
            activeSource.snippet
          )
      )
  );
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
        withTooltip(
          "复制推理内容",
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
            },
            createElement("i", {
              className: "ti ti-copy",
              style: { fontSize: "14px" },
            })
          )
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
                background: "var(--orca-color-bg-3)",
                border: "1px solid var(--orca-color-border)",
                color: "var(--orca-color-text-1)",
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
  // Skill confirm actions (inline)
  onSkillConfirmAction?: (messageId: string, approved: boolean) => void;
  // Skill draft actions (save/discard)
  onSkillDraftAction?: (messageId: string, action: "save" | "discard") => void;
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
  // Branch management (对话分支功能)
  currentBranchId?: string | null;
  onCreateBranch?: (messageId: string) => void;
  onSwitchBranch?: (messageId: string, branchId: string) => void;
  onDeleteBranch?: (messageId: string, branchId: string) => void;
  onRenameBranch?: (messageId: string, branchId: string, newName: string) => void;
}

/**
 * Render a tool call with its result using ToolStatusIndicator
 * Gemini UX Review: Unified tool call + result display
 * Enhanced: Detect error state from result content
 */
function ToolCallWithResult({
  toolCall,
  result,
  isLoading,
  index,
}: {
  toolCall: ToolCallInfo;
  result?: { content: string; name: string };
  isLoading: boolean;
  index?: number;
}) {
  // 检测结果是否为错误
  // 更精确的错误判断：只有明确的错误格式才标记为失败
  const isError = result?.content?.startsWith("Error:") ||
                  result?.content?.startsWith("Wikipedia 查询失败:") ||
                  result?.content?.startsWith("❌");
  const status = isLoading ? "loading" : isError ? "failed" : result ? "success" : "loading";

  // 计算动画延迟（stagger 效果）
  const animationDelay = index !== undefined ? `${index * 0.1}s` : "0s";

  return createElement(
    "div",
    {
      style: {
        animation: "messageFadeSlideIn 0.3s ease-out forwards",
        animationDelay,
        opacity: 0,
      },
    },
    createElement(ToolStatusIndicator, {
      toolName: toolCall.function.name,
      status,
      args: toolCall.function.arguments,
      result: result?.content,
      error: isError ? result?.content : undefined,
    })
  );
}

/**
 * CollapsibleToolCalls - 可折叠的工具调用列表
 * 流式传输时展开，完成后自动折叠
 * 
 * Enhanced features:
 * - Shows parallel progress indicator (x/y 完成)
 * - Shows success/error counts
 * - Displays error tools with red indicators
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

  // 统计成功/失败数量
  const { successCount, errorCount } = useMemo(() => {
    if (!toolResults) return { successCount: 0, errorCount: 0 };
    let success = 0;
    let errors = 0;
    toolCalls.forEach((tc) => {
      const result = toolResults.get(tc.id);
      if (result) {
        // 更精确的错误判断：只有明确的错误格式才标记为失败
        const isError = result.content?.startsWith("Error:") ||
                       result.content?.startsWith("Wikipedia 查询失败:") ||
                       result.content?.startsWith("❌");
        if (isError) {
          errors++;
        } else {
          success++;
        }
      }
    });
    return { successCount: success, errorCount: errors };
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

  // 格式化进度字符串 - 显示成功/失败数
  const progressText = allCompleted
    ? (errorCount > 0 
        ? `${successCount} 成功, ${errorCount} 失败`
        : `${toolCount} 完成`)
    : `${completedCount}/${toolCount} 完成`;

  // 获取每个工具的状态信息
  const getToolStatus = (index: number): { color: string; status: "pending" | "running" | "success" | "error" } => {
    const tc = toolCalls[index];
    const result = toolResults?.get(tc.id);
    if (!result) {
      return isStreaming 
        ? { color: "var(--orca-color-warning)", status: "running" }
        : { color: "var(--orca-color-text-3)", status: "pending" };
    }
    // 更精确的错误判断：只有明确的错误格式才标记为失败
    const isError = result.content?.startsWith("Error:") ||
                   result.content?.startsWith("Wikipedia 查询失败:") ||
                   result.content?.startsWith("❌");
    return isError 
      ? { color: "var(--orca-color-danger, #dc3545)", status: "error" }
      : { color: "var(--orca-color-success, #22c55e)", status: "success" };
  };

  // 进度条组件 - 显示每个工具的状态
  const renderProgressBar = () => {
    return createElement(
      "div",
      {
        style: {
          display: "flex",
          alignItems: "center",
          gap: "3px",
          marginLeft: "8px",
          padding: "2px 6px",
          background: "var(--orca-color-bg-3)",
          borderRadius: "10px",
        },
      },
      ...toolCalls.map((_, i) => {
        const { color, status } = getToolStatus(i);
        return createElement("span", {
          key: i,
          style: {
            width: "8px",
            height: "8px",
            borderRadius: "50%",
            background: color,
            transition: "all 0.3s ease",
            boxShadow: status === "running" ? `0 0 6px ${color}` : "none",
            animation: status === "running" ? "pulse 1.5s ease-in-out infinite" : "none",
          },
        });
      })
    );
  };

  // 折叠状态的摘要头部
  const collapsedHeader = createElement(
    "div",
    {
      onClick: () => setIsExpanded(true),
      style: {
        display: "flex",
        alignItems: "center",
        gap: "8px",
        padding: "8px 12px",
        borderRadius: "8px",
        background: errorCount > 0
          ? "color-mix(in srgb, var(--orca-color-danger, #dc3545) 6%, transparent)"
          : "var(--orca-color-bg-2)",
        border: errorCount > 0
          ? "1px solid color-mix(in srgb, var(--orca-color-danger, #dc3545) 15%, transparent)"
          : "1px solid var(--orca-color-border)",
        cursor: "pointer",
        fontSize: "13px",
        color: "var(--orca-color-text-2)",
        transition: "all 0.2s ease",
      },
    },
    // 工具图标
    createElement("i", {
      className: errorCount > 0 ? "ti ti-alert-circle" : "ti ti-tools",
      style: { 
        fontSize: "15px", 
        color: errorCount > 0 ? "var(--orca-color-danger, #dc3545)" : "var(--orca-color-primary)",
      },
    }),
    // 状态文字
    createElement(
      "span",
      { style: { fontWeight: 500 } },
      `已执行 ${progressText}`
    ),
    // 进度条
    renderProgressBar(),
    // 展开箭头
    createElement("i", {
      className: "ti ti-chevron-down",
      style: { fontSize: "14px", marginLeft: "auto", opacity: 0.6 },
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
        gap: "8px",
        padding: "8px 12px",
        marginBottom: "10px",
        borderRadius: "8px",
        background: errorCount > 0
          ? "color-mix(in srgb, var(--orca-color-danger, #dc3545) 6%, transparent)"
          : "var(--orca-color-bg-2)",
        border: errorCount > 0
          ? "1px solid color-mix(in srgb, var(--orca-color-danger, #dc3545) 15%, transparent)"
          : "1px solid var(--orca-color-border)",
        cursor: "pointer",
        fontSize: "13px",
        color: "var(--orca-color-text-2)",
        transition: "all 0.2s ease",
      },
    },
    // 动态图标
    createElement("i", {
      className: isStreaming && !allCompleted 
        ? "ti ti-loader-2" 
        : errorCount > 0 
          ? "ti ti-alert-circle" 
          : "ti ti-tools",
      style: {
        fontSize: "15px",
        color: errorCount > 0 ? "var(--orca-color-danger, #dc3545)" : "var(--orca-color-primary)",
        animation: isStreaming && !allCompleted ? "spin 1s linear infinite" : undefined,
      },
    }),
    // 状态文字
    createElement(
      "span",
      { style: { fontWeight: 500 } },
      isStreaming && !allCompleted
        ? `执行中 ${progressText}`
        : `${toolCount} 个工具调用 (${progressText})`
    ),
    // 进度条
    renderProgressBar(),
    // 折叠箭头
    createElement("i", {
      className: "ti ti-chevron-up",
      style: { fontSize: "14px", marginLeft: "auto", opacity: 0.6 },
    })
  );

  // 工具调用列表 - 使用 stagger 动画
  const toolList = toolCalls.map((tc, index) =>
    createElement(ToolCallWithResult, {
      key: tc.id,
      toolCall: tc,
      result: toolResults?.get(tc.id),
      isLoading: isStreaming || !toolResults?.has(tc.id),
      index,
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
  
  // 如果包含 journal-export 代码块，使用 MarkdownMessage 渲染
  const hasJournalExport = message.content.includes("```journal-export");
  console.log("[ToolResultItem] content:", message.content.substring(0, 100), "hasJournalExport:", hasJournalExport);
  
  if (hasJournalExport) {
    return createElement(
      "div",
      { style: { ...messageRowStyle("assistant"), justifyContent: "flex-start" } },
      createElement(
        "div",
        { style: { maxWidth: "90%", width: "100%" } },
        createElement(MarkdownMessage, {
          content: message.content,
          role: "tool",
        })
      )
    );
  }

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
  onSkillConfirmAction,
  onSkillDraftAction,
  tokenStats,
  // Branch management
  currentBranchId,
  onCreateBranch,
  onSwitchBranch,
  onDeleteBranch,
  onRenameBranch,
}: MessageItemProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isExtractDropdownOpen, setIsExtractDropdownOpen] = useState(false);
  const messageRowRef = useRef<HTMLDivElement | null>(null);
  const sourcePanelHoverRef = useRef(false);
  const closeSourcePanelTimerRef = useRef<number | null>(null);
  const isUser = message.role === "user";
  const isTool = message.role === "tool";
  const isAssistant = message.role === "assistant";
  const isPinned = (message as any).pinned === true;
  const skillConfirm = message.skillConfirm;
  const skillDraft = message.skillDraft;

  const handleSkillConfirm = useCallback(
    (approved: boolean) => {
      if (onSkillConfirmAction) {
        onSkillConfirmAction(message.id, approved);
      }
    },
    [message.id, onSkillConfirmAction]
  );

  const handleSkillDraft = useCallback(
    (action: "save" | "discard") => {
      if (onSkillDraftAction) {
        onSkillDraftAction(message.id, action);
      }
    },
    [message.id, onSkillDraftAction]
  );

  // Display settings from store
  const displaySettings = useSnapshot(displaySettingsStore);
  const showTimestamp = shouldRenderTimestamp(displaySettings.showTimestamps);

  // Keep action bar visible when dropdown is open
  const showActionBar = isHovered || isExtractDropdownOpen;

  const skillDraftStatusLabel = useMemo(() => {
    switch (skillDraft?.status) {
      case "generating":
        return "生成中";
      case "saving":
        return "保存中";
      case "draft":
        return "待确认";
      case "saved":
        return "已保存";
      case "discarded":
        return "已放弃";
      case "error":
        return "保存失败";
      default:
        return "";
    }
  }, [skillDraft?.status]);

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

  // Extract search results from tool results for auto-enhancement
  const [sourceGroups, setSourceGroups] = useState<SourceGroup[]>([]);
  const [sourceResults, setSourceResults] = useState<WebSearchSource[]>([]);
  const [activeSourceGroupId, setActiveSourceGroupId] = useState<string | null>(null);
  const [sourceAnchor, setSourceAnchor] = useState<SourceAnchor | null>(null);
  const [activeBadgeKey, setActiveBadgeKey] = useState<string | null>(null);
  const clearSourcePanelTimer = useCallback(() => {
    if (closeSourcePanelTimerRef.current) {
      window.clearTimeout(closeSourcePanelTimerRef.current);
      closeSourcePanelTimerRef.current = null;
    }
  }, []);

  const scheduleCloseSourcePanel = useCallback(() => {
    clearSourcePanelTimer();
    closeSourcePanelTimerRef.current = window.setTimeout(() => {
      if (sourcePanelHoverRef.current) return;
      setActiveSourceGroupId(null);
      setActiveBadgeKey(null);
      setSourceAnchor(null);
    }, 160);
  }, [clearSourcePanelTimer]);

  const handleHoverSourceGroup = useCallback((groupId: string, anchorRect?: DOMRect, badgeKey?: string) => {
    clearSourcePanelTimer();
    setActiveSourceGroupId(groupId);
    setActiveBadgeKey(badgeKey || null);
    const rowRect = messageRowRef.current?.getBoundingClientRect();
    if (rowRect && anchorRect) {
      setSourceAnchor({
        left: anchorRect.left - rowRect.left,
        top: anchorRect.top - rowRect.top,
        right: anchorRect.right - rowRect.left,
        bottom: anchorRect.bottom - rowRect.top,
        width: anchorRect.width,
        height: anchorRect.height,
        rowWidth: rowRect.width,
        rowHeight: rowRect.height,
      });
      return;
    }
    setSourceAnchor(null);
  }, [clearSourcePanelTimer]);

  const handleLeaveSourceGroup = useCallback(() => {
    scheduleCloseSourcePanel();
  }, [scheduleCloseSourcePanel]);
  
  useEffect(() => {
    if (message.searchResults && message.searchResults.length > 0) {
      const normalized = normalizeWebSearchResults(message.searchResults);
      const groups = groupSourcesByDomain(normalized);
      setSourceGroups(groups);
      setSourceResults(normalized);
      setActiveSourceGroupId((prev) => {
        const next = prev && groups.some(g => g.id === prev) ? prev : null;
        if (!next) {
          setSourceAnchor(null);
          setActiveBadgeKey(null);
        }
        return next;
      });
      return;
    }

    if (!message.tool_calls || !toolResults) {
      setSourceGroups([]);
      setSourceResults([]);
      setActiveSourceGroupId(null);
      setActiveBadgeKey(null);
      setSourceAnchor(null);
      return;
    }
    
    // Import and extract search results
    import("../services/ai/ai-tools").then(({ extractSearchResultsFromToolResults }) => {
      const results = normalizeWebSearchResults(extractSearchResultsFromToolResults(toolResults));
      const groups = groupSourcesByDomain(results);
      setSourceGroups(groups);
      setSourceResults(results);
      setActiveSourceGroupId((prev) => {
        const next = prev && groups.some(g => g.id === prev) ? prev : null;
        if (!next) {
          setSourceAnchor(null);
          setActiveBadgeKey(null);
        }
        return next;
      });
    }).catch(() => {
      setSourceGroups([]);
      setSourceResults([]);
      setActiveSourceGroupId(null);
      setActiveBadgeKey(null);
      setSourceAnchor(null);
    });
  }, [message.id, message.searchResults, message.tool_calls, toolResults]);
  
  useEffect(() => {
    return () => {
      if (closeSourcePanelTimerRef.current) {
        window.clearTimeout(closeSourcePanelTimerRef.current);
      }
    };
  }, []);

  // Check if any tool calls are still loading
  const toolCallsLoading = useMemo(() => {
    if (!message.tool_calls || !toolResults) return true;
    return message.tool_calls.some((tc) => !toolResults.has(tc.id));
  }, [message.tool_calls, toolResults]);

  const activeSourceGroup = useMemo(
    () => sourceGroups.find((group) => group.id === activeSourceGroupId) || null,
    [sourceGroups, activeSourceGroupId]
  );
  const showSourcePanel = isAssistant && !!activeSourceGroup;

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
    position: "relative",
  };

  // Apply display settings to message bubble
  const messageBubbleWithSettings: React.CSSProperties = {
    ...messageBubbleStyle(message.role),
    padding: getBubblePadding(displaySettings.compactMode),
    fontSize: fontSizeMap[displaySettings.fontSize],
  };
  const messageBubbleWithSources: React.CSSProperties = messageBubbleWithSettings;

  return createElement(
    "div",
    {
      ref: messageRowRef,
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
          style: messageBubbleWithSources,
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
            return withTooltip(
              file.name,
              createElement(
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
              )
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
            withTooltip(
              img.name,
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
        ...message.contextRefs.map((ref, idx) => withTooltip(
          ref.blockId ? "点击跳转到页面" : undefined,
          createElement(
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
            },
            createElement("i", {
              className: ref.kind === "page" ? "ti ti-file-text" : "ti ti-hash",
              style: { fontSize: "12px" },
            }),
            ref.title
          )
        ))
      ),

      // Skill Confirm (inline)
      skillConfirm &&
        createElement(
          "div",
          {
            style: {
              padding: "12px 16px",
              background: "var(--orca-color-bg-2)",
              borderRadius: 8,
              border: "1px solid var(--orca-color-warning, #ffc107)",
              marginBottom: 8,
            },
          },
          createElement(
            "div",
            {
              style: {
                display: "flex",
                alignItems: "center",
                gap: 8,
                marginBottom: 8,
                color: "var(--orca-color-warning, #ffc107)",
                fontWeight: 500,
                fontSize: 13,
              },
            },
            createElement("i", { className: "ti ti-alert-triangle", style: { fontSize: 16 } }),
            `AI 请求执行技能: ${skillConfirm.skillName}`
          ),
          createElement(
            "pre",
            {
              style: {
                margin: "8px 0",
                padding: 8,
                background: "var(--orca-color-bg-1)",
                borderRadius: 4,
                fontSize: 11,
                fontFamily: "monospace",
                color: "var(--orca-color-text-2)",
                whiteSpace: "pre-wrap",
                wordBreak: "break-all",
                maxHeight: 120,
                overflow: "auto",
              },
            },
            skillConfirm.steps.join("\n")
          ),
          skillConfirm.status === "pending"
            ? createElement(
                "div",
                {
                  style: {
                    display: "flex",
                    gap: 8,
                    justifyContent: "flex-end",
                    marginTop: 8,
                  },
                },
                createElement(
                  "button",
                  {
                    onClick: () => handleSkillConfirm(false),
                    style: {
                      padding: "6px 12px",
                      borderRadius: 4,
                      border: "1px solid var(--orca-color-border)",
                      background: "var(--orca-color-bg-1)",
                      color: "var(--orca-color-text-2)",
                      cursor: "pointer",
                      fontSize: 12,
                    },
                  },
                  "拒绝"
                ),
                createElement(
                  "button",
                  {
                    onClick: () => handleSkillConfirm(true),
                    style: {
                      padding: "6px 12px",
                      borderRadius: 4,
                      border: "1px solid var(--orca-color-border)",
                      background: "var(--orca-color-bg-3)",
                      color: "var(--orca-color-text-1)",
                      cursor: "pointer",
                      fontSize: 12,
                    },
                  },
                  "允许"
                )
              )
            : createElement(
                "div",
                {
                  style: {
                    display: "flex",
                    justifyContent: "flex-end",
                    marginTop: 8,
                    fontSize: 12,
                    color:
                      skillConfirm.status === "approved"
                        ? "var(--orca-color-success)"
                        : "var(--orca-color-danger)",
                  },
                },
                skillConfirm.status === "approved" ? "已允许" : "已拒绝"
              )
        ),

      // Skill Draft (inline)
      skillDraft &&
        createElement(
          "div",
          {
            style: {
              padding: "12px 16px",
              background: "var(--orca-color-bg-2)",
              borderRadius: 8,
              border: "1px solid var(--orca-color-border)",
              marginBottom: 8,
            },
          },
          createElement(
            "div",
            {
              style: {
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                marginBottom: 8,
                fontWeight: 500,
                fontSize: 13,
                color: "var(--orca-color-text-1)",
              },
            },
            createElement(
              "div",
              { style: { display: "flex", alignItems: "center", gap: 8 } },
              createElement("i", { className: "ti ti-wand", style: { fontSize: 16 } }),
              "技能草稿"
            ),
            skillDraftStatusLabel &&
              createElement(
                "span",
                {
                  style: {
                    fontSize: 11,
                    padding: "2px 6px",
                    borderRadius: 10,
                    background: "var(--orca-color-bg-1)",
                    color: "var(--orca-color-text-3)",
                  },
                },
                skillDraftStatusLabel
              )
          ),
          createElement(
            "pre",
            {
              style: {
                margin: "8px 0",
                padding: 8,
                background: "var(--orca-color-bg-1)",
                borderRadius: 4,
                fontSize: 11,
                fontFamily: "monospace",
                color: "var(--orca-color-text-2)",
                whiteSpace: "pre-wrap",
                wordBreak: "break-word",
                maxHeight: 260,
                overflow: "auto",
              },
            },
            message.content || ""
          ),
          skillDraft.error &&
            createElement(
              "div",
              { style: { color: "var(--orca-color-danger)", fontSize: 12, marginTop: 6 } },
              skillDraft.error
            ),
          skillDraft.status === "saved" &&
            createElement(
              "div",
              { style: { color: "var(--orca-color-success)", fontSize: 12, marginTop: 6 } },
              skillDraft.folderName ? `已保存：${skillDraft.folderName}` : "已保存"
            ),
          (skillDraft.status === "draft" || skillDraft.status === "error") &&
            createElement(
              "div",
              {
                style: {
                  display: "flex",
                  gap: 8,
                  justifyContent: "flex-end",
                  marginTop: 8,
                },
              },
              createElement(
                "button",
                {
                  onClick: () => handleSkillDraft("discard"),
                  style: {
                    padding: "6px 12px",
                    borderRadius: 4,
                    border: "1px solid var(--orca-color-border)",
                    background: "var(--orca-color-bg-1)",
                    color: "var(--orca-color-text-2)",
                    cursor: "pointer",
                    fontSize: 12,
                  },
                },
                "放弃"
              ),
              createElement(
                "button",
                {
                  onClick: () => handleSkillDraft("save"),
                  style: {
                    padding: "6px 12px",
                    borderRadius: 4,
                    border: "1px solid var(--orca-color-border)",
                    background: "var(--orca-color-bg-3)",
                    color: "var(--orca-color-text-1)",
                    cursor: "pointer",
                    fontSize: 12,
                  },
                },
                "保存"
              )
            )
        ),

      // Content - 使用增强版Markdown组件支持图片和引用
      !skillDraft &&
        createElement(EnhancedMarkdownMessage, { 
          content: message.content || "", 
          role: message.role,
          autoParseEnhancements: true,
          enableAutoEnhancement: false, // 完全禁用自动增强，避免干扰流式渲染
          sourceGroups: sourceGroups,
          sourceResults: sourceResults,
          activeSourceGroupId: activeSourceGroupId,
          activeBadgeKey: activeBadgeKey,
          onHoverSourceGroup: handleHoverSourceGroup,
          onLeaveSourceGroup: handleLeaveSourceGroup,
        }),

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

      // Branch Indicator (显示该消息的分支)
      message.branches &&
        message.branches.length > 0 &&
        createElement(
          "div",
          {
            style: {
              display: "flex",
              alignItems: "center",
              gap: "8px",
              marginTop: "10px",
              padding: "8px 12px",
              background: "rgba(99, 102, 241, 0.08)",
              border: "1px solid color-mix(in srgb, var(--orca-color-primary) 20%, transparent)",
              borderRadius: "8px",
              fontSize: "12px",
            },
          },
          // 分支图标
          createElement("i", {
            className: "ti ti-git-branch",
            style: { fontSize: "14px", color: "var(--orca-color-primary)" },
          }),
          // 分支标签
          createElement(
            "span",
            { style: { color: "var(--orca-color-text-2)", fontWeight: 500 } },
            `${message.branches.length} 个分支:`
          ),
          // 分支列表
          ...message.branches.map((branch, idx) =>
            createElement(
              "button",
              {
                key: branch.id,
                onClick: (e: any) => {
                  e.stopPropagation();
                  if (onSwitchBranch) {
                    onSwitchBranch(message.id, branch.id);
                  }
                },
                style: {
                  padding: "4px 10px",
                  borderRadius: "4px",
                  border: currentBranchId === branch.id 
                    ? "1px solid var(--orca-color-primary)"
                    : "1px solid var(--orca-color-border)",
                  background: currentBranchId === branch.id
                    ? "color-mix(in srgb, var(--orca-color-primary) 15%, transparent)"
                    : "var(--orca-color-bg-2)",
                  color: currentBranchId === branch.id
                    ? "var(--orca-color-primary)"
                    : "var(--orca-color-text-2)",
                  cursor: "pointer",
                  fontSize: "11px",
                  fontWeight: currentBranchId === branch.id ? 600 : 400,
                  transition: "all 0.2s ease",
                },
              },
              branch.name || `分支 ${idx + 1}`
            )
          )
        ),

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
          tokenStats && withTooltip(
            tooltipText(`本条消息: ${tokenStats.messageTokens} tokens${tokenStats.cost ? ` (${tokenStats.currencySymbol || '$'}${tokenStats.cost.toFixed(4)})` : ''}\n累计上下文: ${tokenStats.cumulativeTokens} tokens${tokenStats.cumulativeCost ? ` (${tokenStats.currencySymbol || '$'}${tokenStats.cumulativeCost.toFixed(4)})` : ''}`),
            createElement(
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

      showSourcePanel && activeSourceGroup &&
        createElement(SourceCardPanel, {
          group: activeSourceGroup,
          anchor: sourceAnchor,
          onHoverStart: () => {
            sourcePanelHoverRef.current = true;
            clearSourcePanelTimer();
          },
          onHoverEnd: () => {
            sourcePanelHoverRef.current = false;
            scheduleCloseSourcePanel();
          },
          onClose: () => {
            sourcePanelHoverRef.current = false;
            clearSourcePanelTimer();
            setActiveSourceGroupId(null);
            setActiveBadgeKey(null);
            setSourceAnchor(null);
          },
        }),

      // Action Bar - with slide-in animation
      showActionBar && createElement(
        "div",
        {
          className: "action-bar-enter",
          style: {
            ...actionBarStyle,
            opacity: 1,
            pointerEvents: "auto",
          },
        },
        // Copy Button
        withTooltip(
          "Copy message",
          createElement(
            "button",
            {
              className: "action-bar-btn",
              style: actionButtonStyle,
              onClick: handleCopy,
            },
            createElement("i", { className: "ti ti-copy" })
          )
        ),
        // Pin Button (标记重要，压缩时保留)
        onTogglePinned &&
          !isStreaming &&
          withTooltip(
            isPinned ? "取消重要标记" : "标记为重要（压缩时保留）",
            createElement(
              "button",
              {
                className: "action-bar-btn",
                style: {
                  ...actionButtonStyle,
                  color: isPinned ? "var(--orca-color-warning)" : undefined,
                },
                onClick: onTogglePinned,
              },
              createElement("i", { className: isPinned ? "ti ti-pin-filled" : "ti ti-pin" })
            )
          ),
        // Delete Button
        onDelete &&
          !isStreaming &&
          withTooltip(
            "删除此消息",
            createElement(
              "button",
              {
                className: "action-bar-btn",
                style: actionButtonStyle,
                onClick: onDelete,
              },
              createElement("i", { className: "ti ti-trash" })
            )
          ),
        // Rollback Button (回档到此消息之前)
        onRollback &&
          !isStreaming &&
          withTooltip(
            "回档到此处（删除此消息及之后的所有消息）",
            createElement(
              "button",
              {
                className: "action-bar-btn",
                style: actionButtonStyle,
                onClick: onRollback,
              },
              createElement("i", { className: "ti ti-arrow-back-up" })
            )
          ),
        // Save to Journal Button (保存单条消息到日记)
        !isStreaming &&
          message.content &&
          withTooltip(
            "保存到日记",
            createElement(
              "button",
              {
                className: "action-bar-btn",
                style: actionButtonStyle,
                onClick: async () => {
                  const result = await saveSingleMessageToJournal(message, message.model);
                  if (result.success) {
                    orca.notify("success", result.message);
                  } else {
                    orca.notify("error", result.message);
                  }
                },
              },
              createElement("i", { className: "ti ti-notebook" })
            )
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
          withTooltip(
            "Regenerate response",
            createElement(
              "button",
              {
                className: "action-bar-btn",
                style: actionButtonStyle,
                onClick: onRegenerate,
              },
              createElement("i", { className: "ti ti-refresh" })
            )
          ),
        // Branch Button (从此处创建分支 - 仅 AI 消息)
        isAssistant &&
          !isStreaming &&
          onCreateBranch &&
          withTooltip(
            "从此处创建分支",
            createElement(
              "button",
              {
                className: "action-bar-btn",
                style: actionButtonStyle,
                onClick: () => onCreateBranch(message.id),
              },
              createElement("i", { className: "ti ti-git-branch" })
            )
          )
      )
    )
    )
  );
}
