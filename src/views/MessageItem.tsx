/**
 * MessageItem Component
 *
 * Renders individual chat messages with:
 * - Markdown content rendering
 * - Tool call status indicators (semantic, animated)
 * - Tool confirmation cards for Supervised mode
 * - Action bar (copy, regenerate, extract memory)
 *
 * Gemini UX Review: Tool calls now use inline status flow instead of technical cards
 */

import MarkdownMessage from "../components/MarkdownMessage";
import ToolStatusIndicator from "../components/ToolStatusIndicator";
import ToolConfirmationCard from "./ToolConfirmationCard";
import ExtractMemoryButton from "./ExtractMemoryButton";
import type { ExtractedMemory } from "../services/memory-extraction";
import {
  messageRowStyle,
  messageBubbleStyle,
  cursorStyle,
  actionBarStyle,
  actionButtonStyle,
} from "../styles/ai-chat-styles";
import type { Message } from "../services/session-service";
import type { ToolCallInfo } from "../services/chat-stream-handler";
import {
  chatModeStore,
  type PendingToolCall,
  getPendingToolCalls,
  approveAllToolCalls,
  rejectAllToolCalls,
} from "../store/chat-mode-store";

const React = window.React as unknown as {
  createElement: typeof window.React.createElement;
  useState: <T>(initial: T | (() => T)) => [T, (next: T | ((prev: T) => T)) => void];
  useCallback: <T extends (...args: any[]) => any>(fn: T, deps: any[]) => T;
  useMemo: <T>(factory: () => T, deps: any[]) => T;
  Fragment: typeof window.React.Fragment;
};
const { createElement, useState, useCallback, useMemo, Fragment } = React;

const { useSnapshot } = (window as any).Valtio as {
  useSnapshot: <T extends object>(obj: T) => T;
};

interface MessageItemProps {
  message: Message;
  isLastAiMessage?: boolean;
  isStreaming?: boolean;
  onRegenerate?: () => void;
  // Tool result mapping: toolCallId -> result content
  toolResults?: Map<string, { content: string; name: string }>;
  // Conversation context for memory extraction (all messages up to this point)
  conversationContext?: string;
  // Callback when memories are extracted from this message
  onExtractMemory?: (memories: ExtractedMemory[]) => void;
  // Callback when a tool call is approved (for Supervised mode)
  onToolApproved?: (toolCall: PendingToolCall) => void;
  // Callback when a tool call is rejected (for Supervised mode)
  onToolRejected?: (toolCall: PendingToolCall) => void;
  // Callback when all tool calls are batch approved
  onBatchApprove?: (toolCalls: PendingToolCall[]) => void;
  // Callback when all tool calls are batch rejected
  onBatchReject?: (toolCalls: PendingToolCall[]) => void;
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
  toolResults,
  conversationContext,
  onExtractMemory,
  onToolApproved,
  onToolRejected,
  onBatchApprove,
  onBatchReject,
}: MessageItemProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [isExtractDropdownOpen, setIsExtractDropdownOpen] = useState(false);
  const isUser = message.role === "user";
  const isTool = message.role === "tool";
  const isAssistant = message.role === "assistant";

  // Subscribe to chat mode store for reactive updates
  const modeSnap = useSnapshot(chatModeStore);

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

  // Get pending tool calls for this message in Supervised mode
  // Only show confirmation cards for the last assistant message with tool calls
  const pendingToolCallsForMessage = useMemo(() => {
    // Only show in supervised mode
    if (modeSnap.mode !== 'supervised') return [];
    // Only for assistant messages with tool calls
    if (!isAssistant || !message.tool_calls || message.tool_calls.length === 0) return [];
    // Only show if this is the last AI message (where tool calls are pending)
    if (!isLastAiMessage) return [];
    
    // Get all pending tool calls from the store
    return modeSnap.pendingToolCalls.filter(tc => tc.status === 'pending');
  }, [modeSnap.mode, modeSnap.pendingToolCalls, isAssistant, message.tool_calls, isLastAiMessage]);

  // Check if we should show pending tool confirmation cards instead of regular tool status
  const hasPendingToolCalls = pendingToolCallsForMessage.length > 0;

  // Show batch actions when there are multiple pending tool calls
  const showBatchActions = pendingToolCallsForMessage.length > 1;

  // Handle batch approve all pending tool calls
  const handleBatchApprove = useCallback(() => {
    const approved = approveAllToolCalls();
    onBatchApprove?.(approved);
  }, [onBatchApprove]);

  // Handle batch reject all pending tool calls
  const handleBatchReject = useCallback(() => {
    const rejected = rejectAllToolCalls();
    onBatchReject?.(rejected);
  }, [onBatchReject]);

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
      // Content
      createElement(MarkdownMessage, { content: message.content || "", role: message.role }),

      // Cursor for streaming
      isStreaming &&
        createElement("span", {
          style: cursorStyle,
        }),

      // Pending Tool Calls Confirmation (Supervised mode)
      // Show confirmation cards when there are pending tool calls
      hasPendingToolCalls &&
        createElement(
          "div",
          { style: { marginTop: "12px" } },
          // Batch action buttons when multiple tool calls are pending
          showBatchActions &&
            createElement(
              "div",
              {
                style: {
                  display: "flex",
                  gap: "8px",
                  justifyContent: "flex-end",
                  marginBottom: "10px",
                  padding: "8px 0",
                  borderBottom: "1px solid var(--orca-color-border)",
                },
              },
              createElement(
                "span",
                {
                  style: {
                    flex: 1,
                    fontSize: "12px",
                    color: "var(--orca-color-text-2)",
                    display: "flex",
                    alignItems: "center",
                  },
                },
                `${pendingToolCallsForMessage.length} 个操作待确认`
              ),
              createElement(
                "button",
                {
                  style: {
                    padding: "4px 10px",
                    fontSize: "12px",
                    fontWeight: 500,
                    borderRadius: "6px",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                    border: "1px solid var(--orca-color-border)",
                    background: "var(--orca-color-bg-3)",
                    color: "var(--orca-color-text-2)",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                  },
                  onClick: handleBatchReject,
                  title: "跳过全部操作",
                },
                createElement("i", { className: "ti ti-x" }),
                "全部跳过"
              ),
              createElement(
                "button",
                {
                  style: {
                    padding: "4px 10px",
                    fontSize: "12px",
                    fontWeight: 500,
                    borderRadius: "6px",
                    cursor: "pointer",
                    transition: "all 0.15s ease",
                    border: "none",
                    background: "var(--orca-color-success, #00c853)",
                    color: "var(--orca-color-text-inverse, #fff)",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                  },
                  onClick: handleBatchApprove,
                  title: "批准全部操作",
                },
                createElement("i", { className: "ti ti-checks" }),
                "全部批准"
              )
            ),
          // Individual tool confirmation cards
          ...pendingToolCallsForMessage.map((tc) =>
            createElement(ToolConfirmationCard, {
              key: tc.id,
              toolCall: tc,
              onApprove: onToolApproved,
              onReject: onToolRejected,
            })
          )
        ),

      // Tool Calls with Results (unified display)
      // Only show when NOT in pending confirmation state
      // Gemini UX Review: Single status flow instead of separate call/result cards
      !hasPendingToolCalls &&
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
