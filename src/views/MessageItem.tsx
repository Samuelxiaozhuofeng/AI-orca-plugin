/**
 * MessageItem Component
 *
 * Renders individual chat messages with:
 * - Markdown content rendering
 * - Tool call status indicators (semantic, animated)
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
  Fragment: typeof window.React.Fragment;
};
const { createElement, useState, useCallback, useMemo, Fragment } = React;

// 格式化消息时间
function formatMessageTime(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  
  if (isToday) {
    return date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });
  }
  return date.toLocaleDateString("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

interface MessageItemProps {
  message: Message;
  isLastAiMessage?: boolean;
  isStreaming?: boolean;
  onRegenerate?: () => void;
  onDelete?: () => void;
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
      // Content
      createElement(MarkdownMessage, { content: message.content || "", role: message.role }),

      // Cursor for streaming
      isStreaming &&
        createElement("span", {
          style: cursorStyle,
        }),

      // Tool Calls with Results (unified display)
      // Gemini UX Review: Single status flow instead of separate call/result cards
      message.tool_calls &&
        message.tool_calls.length > 0 &&
        createElement(
          "div",
          { style: { marginTop: "12px" } },
          ...message.tool_calls.map((tc) =>
            createElement(ToolCallWithResult, {
              key: tc.id,
              toolCall: tc,
              result: toolResults?.get(tc.id),
              isLoading: isStreaming || !toolResults?.has(tc.id),
            })
          )
        ),

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
