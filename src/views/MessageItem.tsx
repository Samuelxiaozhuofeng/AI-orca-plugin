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
import ExtractMemoryButton from "./ExtractMemoryButton";
import type { ExtractedMemory } from "../services/memory-extraction";
import { getFileDisplayUrl, getFileIcon, getFileFullPath } from "../services/file-service";
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

const React = window.React as unknown as {
  createElement: typeof window.React.createElement;
  useState: <T>(initial: T | (() => T)) => [T, (next: T | ((prev: T) => T)) => void];
  useCallback: <T extends (...args: any[]) => any>(fn: T, deps: any[]) => T;
  useMemo: <T>(factory: () => T, deps: any[]) => T;
  useEffect: (effect: () => void | (() => void), deps?: any[]) => void;
  Fragment: typeof window.React.Fragment;
};
const { createElement, useState, useCallback, useMemo, useEffect, Fragment } = React;

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
 * ReasoningBlock - 显示 AI 推理过程（可折叠）
 */
function ReasoningBlock({ reasoning, isStreaming }: { reasoning: string; isStreaming?: boolean }) {
  const [isExpanded, setIsExpanded] = useState(true);
  
  // 流式传输时自动展开，完成后自动折叠
  useEffect(() => {
    if (!isStreaming && reasoning) {
      // 延迟折叠，让用户看到完成状态
      const timer = setTimeout(() => setIsExpanded(false), 500);
      return () => clearTimeout(timer);
    }
  }, [isStreaming, reasoning]);

  if (!reasoning) return null;

  return createElement(
    "div",
    {
      style: {
        marginBottom: "8px",
        borderRadius: "8px",
        border: "1px solid var(--orca-color-border)",
        background: "var(--orca-color-bg-2)",
        overflow: "hidden",
      },
    },
    // Header
    createElement(
      "div",
      {
        onClick: () => setIsExpanded(!isExpanded),
        style: {
          display: "flex",
          alignItems: "center",
          gap: "6px",
          padding: "8px 12px",
          cursor: "pointer",
          background: "var(--orca-color-bg-3)",
          userSelect: "none",
        },
      },
      createElement("i", {
        className: isStreaming ? "ti ti-loader" : "ti ti-brain",
        style: {
          fontSize: "14px",
          color: "var(--orca-color-primary)",
          animation: isStreaming ? "spin 1s linear infinite" : undefined,
        },
      }),
      createElement(
        "span",
        { style: { fontSize: "12px", fontWeight: 500, color: "var(--orca-color-text-2)" } },
        isStreaming ? "思考中..." : "思考过程"
      ),
      createElement("i", {
        className: isExpanded ? "ti ti-chevron-up" : "ti ti-chevron-down",
        style: { fontSize: "12px", color: "var(--orca-color-text-3)", marginLeft: "auto" },
      })
    ),
    // Content
    isExpanded && createElement(
      "div",
      {
        style: {
          padding: "8px 12px",
          fontSize: "13px",
          color: "var(--orca-color-text-2)",
          lineHeight: 1.5,
          whiteSpace: "pre-wrap",
          maxHeight: "300px",
          overflowY: "auto",
        },
      },
      reasoning
    )
  );
}

interface MessageItemProps {
  message: Message;
  isLastAiMessage?: boolean;
  isStreaming?: boolean;
  onRegenerate?: () => void;
  onDelete?: () => void;
  onRollback?: () => void; // 回档到此消息（删除此消息及之后的所有消息）
  // Tool result mapping: toolCallId -> result content
  toolResults?: Map<string, { content: string; name: string }>;
  // Conversation context for memory extraction (all messages up to this point)
  conversationContext?: string;
  // Callback when memories are extracted from this message
  onExtractMemory?: (memories: ExtractedMemory[]) => void;
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
  const completedCount = toolResults ? toolCalls.filter((tc) => toolResults.has(tc.id)).length : 0;

  return createElement(
    "div",
    { style: { marginTop: "12px" } },
    // 折叠头部
    !isExpanded && createElement(
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
      `已执行 ${completedCount}/${toolCount} 个工具`,
      createElement("i", {
        className: "ti ti-chevron-down",
        style: { fontSize: "12px", marginLeft: "auto" },
      })
    ),
    // 展开的工具调用列表
    isExpanded && createElement(
      "div",
      { style: { position: "relative" } },
      // 折叠按钮（仅在完成后显示）
      allCompleted && !isStreaming && createElement(
        "button",
        {
          onClick: () => setIsExpanded(false),
          style: {
            position: "absolute",
            top: "0",
            right: "0",
            padding: "2px 6px",
            fontSize: "11px",
            color: "var(--orca-color-text-3)",
            background: "transparent",
            border: "none",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            gap: "2px",
          },
          title: "折叠工具调用",
        },
        createElement("i", { className: "ti ti-chevron-up", style: { fontSize: "12px" } }),
        "折叠"
      ),
      ...toolCalls.map((tc) =>
        createElement(ToolCallWithResult, {
          key: tc.id,
          toolCall: tc,
          result: toolResults?.get(tc.id),
          isLoading: isStreaming || !toolResults?.has(tc.id),
        })
      )
    )
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
  isLastAiMessage,
  isStreaming,
  onRegenerate,
  onDelete,
  onRollback,
  toolResults,
  conversationContext,
  onExtractMemory,
}: MessageItemProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isExtractDropdownOpen, setIsExtractDropdownOpen] = useState(false);
  const isUser = message.role === "user";
  const isTool = message.role === "tool";
  const isAssistant = message.role === "assistant";

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

  // Check if any tool calls are still loading
  const toolCallsLoading = useMemo(() => {
    if (!message.tool_calls || !toolResults) return true;
    return message.tool_calls.some((tc) => !toolResults.has(tc.id));
  }, [message.tool_calls, toolResults]);

  // Special handling for tool result messages (standalone)
  if (isTool) {
    return createElement(ToolResultItem, { message });
  }

  return createElement(
    "div",
    {
      style: messageRowStyle(message.role),
      onMouseEnter: () => setIsHovered(true),
      onMouseLeave: () => setIsHovered(false),
    },
    createElement(
      "div",
      {
        style: messageBubbleStyle(message.role),
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
      // Reasoning/Thinking (显示 AI 推理过程)
      message.reasoning && createElement(ReasoningBlock, {
        reasoning: message.reasoning,
        isStreaming,
      }),

      // Content
      createElement(MarkdownMessage, { content: message.content || "", role: message.role }),

      // Cursor for streaming
      isStreaming &&
        createElement("span", {
          style: cursorStyle,
        }),

      // Tool Calls with Results (unified display, auto-collapse when done)
      message.tool_calls &&
        message.tool_calls.length > 0 &&
        createElement(CollapsibleToolCalls, {
          toolCalls: message.tool_calls,
          toolResults,
          isStreaming,
        }),

      // Message Time
      message.createdAt &&
        createElement(
          "div",
          { style: messageTimeStyle(message.role) },
          formatMessageTime(message.createdAt)
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
  );
}
