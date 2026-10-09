/**
 * MemoryCard - Card component for displaying and managing memory items
 * Includes search, add, edit, delete, and toggle functionality
 * Requirements: 14.3, 14.4, 9.2
 */

import type { MemoryItem } from "../../store/memory-store";
import { withTooltip } from "../../utils/orca-tooltip";
import {
  cardStyle,
  cardHeaderStyle,
  cardHeaderCollapsedStyle,
  cardTitleStyle,
  cardCollapseIconStyle,
  cardBodyStyle,
  cardActionsStyle,
  memoryToolbarStyle,
  memorySearchInputStyle,
  memoryAddButtonStyle,
  memoryListStyle,
  memoryItemStyle,
  memoryItemDisabledStyle,
  memoryContentStyle,
  memoryActionsStyle,
  memoryCheckboxStyle,
  emptyStateStyle,
  emptyStateDecorationStyle,
  emptyStateDecorationLeftStyle,
  emptyIconContainerStyle,
  emptyIconInnerStyle,
  emptyIconStyle,
  emptyTitleStyle,
  emptyDescStyle,
  emptyHighlightStyle,
  emptyAddButtonStyle,
  editInputStyle,
  iconButtonStyle,
} from "./card-styles";

const React = window.React as unknown as {
  createElement: typeof window.React.createElement;
  useState: <T>(initial: T | (() => T)) => [T, (next: T | ((prev: T) => T)) => void];
  useCallback: <T extends (...args: any[]) => any>(fn: T, deps: any[]) => T;
  useRef: <T>(value: T) => { current: T };
};
const { createElement, useState, useCallback, useRef } = React;

// ============================================================================
// Types
// ============================================================================

interface MemoryCardProps {
  memories: MemoryItem[];
  searchKeyword: string;
  onSearchChange: (keyword: string) => void;
  onAddMemory: (content: string) => void;
  onEditMemory: (id: string, content: string) => void;
  onDeleteMemory: (id: string) => void;
  onToggleMemory: (id: string) => void;
  onToggleExtracted?: (id: string) => void;
  onRegeneratePortrait?: (memoryId: string) => void;
}

// ============================================================================
// Component
// ============================================================================

export default function MemoryCard({
  memories,
  searchKeyword,
  onSearchChange,
  onAddMemory,
  onEditMemory,
  onDeleteMemory,
  onToggleMemory,
  onToggleExtracted,
  onRegeneratePortrait,
}: MemoryCardProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isAddingMemory, setIsAddingMemory] = useState(false);
  const [newMemoryContent, setNewMemoryContent] = useState("");
  const [editingMemoryId, setEditingMemoryId] = useState<string | null>(null);
  const [editingContent, setEditingContent] = useState("");
  const [hoveredMemoryId, setHoveredMemoryId] = useState<string | null>(null);
  
  // Ref to preserve scroll position when switching between editing memories
  const scrollPositionRef = useRef<number>(0);
  const listContainerRef = useRef<HTMLDivElement | null>(null);

  // ─────────────────────────────────────────────────────────────────────────
  // Handlers
  // ─────────────────────────────────────────────────────────────────────────

  const handleStartAddMemory = useCallback(() => {
    setIsAddingMemory(true);
    setNewMemoryContent("");
  }, []);

  const handleConfirmAddMemory = useCallback(() => {
    if (newMemoryContent.trim()) {
      onAddMemory(newMemoryContent.trim());
      setNewMemoryContent("");
      setIsAddingMemory(false);
    }
  }, [newMemoryContent, onAddMemory]);

  const handleCancelAddMemory = useCallback(() => {
    setIsAddingMemory(false);
    setNewMemoryContent("");
  }, []);

  const handleStartEditMemory = useCallback((memory: MemoryItem) => {
    // Save current scroll position before switching
    if (listContainerRef.current) {
      scrollPositionRef.current = listContainerRef.current.scrollTop;
    }
    setEditingMemoryId(memory.id);
    setEditingContent(memory.content);
  }, []);

  const handleSaveEditMemory = useCallback(() => {
    if (editingMemoryId && editingContent.trim()) {
      onEditMemory(editingMemoryId, editingContent.trim());
    }
    setEditingMemoryId(null);
    setEditingContent("");
  }, [editingMemoryId, editingContent, onEditMemory]);

  const handleCancelEditMemory = useCallback((originalContent: string) => {
    setEditingMemoryId(null);
    setEditingContent("");
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Render Helpers
  // ─────────────────────────────────────────────────────────────────────────

  const renderToolbar = () => {
    return createElement(
      "div",
      { style: memoryToolbarStyle },
      createElement("input", {
        type: "text",
        placeholder: "🔍 搜索记忆...",
        value: searchKeyword,
        onChange: (e: any) => onSearchChange(e.target.value),
        style: memorySearchInputStyle,
        onFocus: (e: any) => {
          e.currentTarget.style.borderColor = "var(--orca-color-primary)";
          e.currentTarget.style.boxShadow = "0 0 0 3px rgba(0, 123, 255, 0.1)";
        },
        onBlur: (e: any) => {
          e.currentTarget.style.borderColor = "var(--orca-color-border)";
          e.currentTarget.style.boxShadow = "none";
        },
      }),
      createElement(
        "button",
        {
          style: memoryAddButtonStyle,
          onClick: handleStartAddMemory,
          onMouseEnter: (e: any) => {
            e.currentTarget.style.transform = "translateY(-1px)";
            e.currentTarget.style.boxShadow = "0 4px 12px rgba(0, 123, 255, 0.3)";
          },
          onMouseLeave: (e: any) => {
            e.currentTarget.style.transform = "translateY(0)";
            e.currentTarget.style.boxShadow = "0 2px 6px rgba(0, 123, 255, 0.2)";
          },
        },
        createElement("i", { className: "ti ti-plus" }),
        "添加记忆"
      )
    );
  };

  const renderAddMemoryForm = () => {
    if (!isAddingMemory) return null;

    return createElement(
      "div",
      { style: { ...memoryItemStyle, background: "var(--orca-color-bg-2)", marginBottom: "12px" } },
      createElement("textarea", {
        placeholder: "输入记忆内容，例如：我叫张三、我偏好使用 TypeScript...",
        value: newMemoryContent,
        onChange: (e: any) => setNewMemoryContent(e.target.value),
        style: editInputStyle,
        autoFocus: true,
        onKeyDown: (e: any) => {
          if (!(e.nativeEvent?.isComposing || e.keyCode === 229) && e.key === "Enter" && e.ctrlKey) handleConfirmAddMemory();
          if (e.key === "Escape") handleCancelAddMemory();
        },
      }),
      createElement(
        "div",
        { style: memoryActionsStyle },
        withTooltip(
          "添加 (Ctrl+Enter)",
          createElement(
            "button",
            {
              style: { ...iconButtonStyle, color: "var(--orca-color-primary)" },
              onClick: handleConfirmAddMemory,
            },
            createElement("i", { className: "ti ti-check" })
          )
        ),
        withTooltip(
          "取消 (Esc)",
          createElement(
            "button",
            {
              style: iconButtonStyle,
              onClick: handleCancelAddMemory,
            },
            createElement("i", { className: "ti ti-x" })
          )
        )
      )
    );
  };

  const renderMemoryItem = (memory: MemoryItem) => {
    const isEditing = editingMemoryId === memory.id;
    const isHovered = hoveredMemoryId === memory.id;

    // Inline editable input style - match display style exactly
    const inlineInputStyle: React.CSSProperties = {
      flex: 1,
      padding: "0",
      margin: "0",
      border: "none",
      background: "transparent",
      color: "var(--orca-color-text-1)",
      fontSize: "14px",
      lineHeight: "1.6",
      outline: "none",
      resize: "none",
      fontFamily: "inherit",
      minHeight: "20px",
      width: "100%",
      wordBreak: "break-word",
      whiteSpace: "pre-wrap",
      overflowWrap: "break-word",
      paddingTop: "1px",
    };

    // Memory item container style - back to single row
    const itemContainerStyle: React.CSSProperties = {
      position: "relative",
      display: "flex",
      alignItems: "flex-start",
      gap: "10px",
      padding: "8px 10px",
      borderRadius: "6px",
      background: memory.isExtracted 
        ? "var(--orca-color-bg-2)" 
        : "var(--orca-color-bg-1)",
      opacity: memory.isEnabled ? 1 : 0.5,
      borderLeft: memory.isExtracted 
        ? "3px solid var(--orca-color-primary, #007bff)" 
        : "3px solid transparent",
    };

    // Delete button style (absolute positioned)
    const deleteBtnStyle: React.CSSProperties = {
      position: "absolute",
      top: "-6px",
      right: "-6px",
      width: "18px",
      height: "18px",
      borderRadius: "50%",
      border: "none",
      background: "var(--orca-color-danger, #dc3545)",
      color: "#fff",
      fontSize: "10px",
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 0,
    };

    // Generate portrait button style (absolute positioned, left of delete)
    const generateBtnStyle: React.CSSProperties = {
      position: "absolute",
      top: "-6px",
      right: "16px",
      width: "18px",
      height: "18px",
      borderRadius: "50%",
      border: "1px solid var(--orca-color-border)",
      background: "var(--orca-color-bg-3)",
      color: "var(--orca-color-text-1)",
      fontSize: "10px",
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 0,
    };

    // Extracted toggle button style (absolute positioned, left of generate)
    const extractedBtnStyle: React.CSSProperties = {
      position: "absolute",
      top: "-6px",
      right: "38px",
      width: "18px",
      height: "18px",
      borderRadius: "50%",
      border: "none",
      background: memory.isExtracted 
        ? "var(--orca-color-success, #28a745)" 
        : "var(--orca-color-text-3, #999)",
      color: "#fff",
      fontSize: "10px",
      cursor: "pointer",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      padding: 0,
    };

    return createElement(
      "div",
      {
        key: memory.id,
        style: itemContainerStyle,
        onMouseEnter: () => setHoveredMemoryId(memory.id),
        onMouseLeave: () => setHoveredMemoryId(null),
      },
      // Checkbox
      withTooltip(
        memory.isEnabled ? "点击禁用" : "点击启用",
        createElement("input", {
          type: "checkbox",
          checked: memory.isEnabled,
          onChange: () => onToggleMemory(memory.id),
          style: { ...memoryCheckboxStyle, marginTop: "2px" },
        })
      ),
      // Content - editable or display (same visual style)
      isEditing
        ? createElement("textarea", {
            value: editingContent,
            onChange: (e: any) => {
              setEditingContent(e.target.value);
            },
            onBlur: handleSaveEditMemory,
            onKeyDown: (e: any) => {
              if (!(e.nativeEvent?.isComposing || e.keyCode === 229) && e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSaveEditMemory();
              }
              if (e.key === "Escape") {
                e.preventDefault();
                handleCancelEditMemory(memory.content);
              }
            },
            autoFocus: true,
            style: { 
              ...memoryContentStyle, 
              cursor: "text", 
              whiteSpace: "pre-wrap",
              outline: "none",
              minHeight: "20px",
              border: "none",
              background: "transparent",
              resize: "none",
              fontFamily: "inherit",
              fontSize: "inherit",
              lineHeight: "inherit",
              padding: "0",
              margin: "0",
              width: "100%",
              overflow: "hidden",
              color: memory.isExtracted 
                ? "var(--orca-color-text-2)" 
                : "var(--orca-color-text-1)",
            },
            ref: (el: any) => {
              if (el) {
                // Auto-resize textarea to fit content
                el.style.height = "auto";
                el.style.height = el.scrollHeight + "px";
                // Restore scroll position
                if (listContainerRef.current && scrollPositionRef.current > 0) {
                  requestAnimationFrame(() => {
                    if (listContainerRef.current) {
                      listContainerRef.current.scrollTop = scrollPositionRef.current;
                    }
                  });
                }
              }
            },
          })
        : withTooltip(
            "点击编辑",
            createElement(
              "div",
              {
                style: { 
                  ...memoryContentStyle, 
                  cursor: "text", 
                  whiteSpace: "pre-wrap",
                  color: memory.isExtracted 
                    ? "var(--orca-color-text-2)" 
                    : "var(--orca-color-text-1)",
                },
                onClick: () => handleStartEditMemory(memory),
              },
              memory.content,
              // Extracted badge
              memory.isExtracted && createElement(
                "span",
                {
                  style: {
                    marginLeft: "8px",
                    fontSize: "10px",
                    padding: "1px 4px",
                    borderRadius: "3px",
                    background: "var(--orca-color-bg-3)",
                    border: "1px solid var(--orca-color-border)",
                    color: "var(--orca-color-text-2)",
                    verticalAlign: "middle",
                  },
                },
                "已提取"
              )
            )
          ),
      // Extracted toggle button (shown on hover)
      isHovered &&
        !isEditing &&
        onToggleExtracted &&
        withTooltip(
          memory.isExtracted ? "标记为未提取" : "标记为已提取",
          createElement(
            "button",
            {
              style: extractedBtnStyle,
              onClick: (e: any) => {
                e.stopPropagation();
                onToggleExtracted(memory.id);
              },
            },
            createElement("i", { className: memory.isExtracted ? "ti ti-check" : "ti ti-bookmark" })
          )
        ),
      // Generate portrait button (shown on hover)
      isHovered &&
        !isEditing &&
        onRegeneratePortrait &&
        withTooltip(
          "生成印象",
          createElement(
            "button",
            {
              style: generateBtnStyle,
              onClick: (e: any) => {
                e.stopPropagation();
                onRegeneratePortrait(memory.id);
              },
            },
            createElement("i", { className: "ti ti-sparkles" })
          )
        ),
      // Delete button (shown on hover)
      isHovered &&
        !isEditing &&
        withTooltip(
          "删除",
          createElement(
            "button",
            {
              style: deleteBtnStyle,
              onClick: (e: any) => {
                e.stopPropagation();
                onDeleteMemory(memory.id);
              },
            },
            createElement("i", { className: "ti ti-x" })
          )
        )
    );
  };

  const renderEmptyState = () => {
    return createElement(
      "div",
      { style: emptyStateStyle },
      // Decorative background elements
      createElement("div", { style: emptyStateDecorationStyle }),
      createElement("div", { style: emptyStateDecorationLeftStyle }),
      // Icon with layered design
      createElement(
        "div",
        { style: emptyIconContainerStyle },
        createElement(
          "div",
          { style: emptyIconInnerStyle },
          createElement("div", { style: emptyIconStyle }, "🧠")
        )
      ),
      // Title
      createElement("div", { style: emptyTitleStyle }, "开始记录您的记忆"),
      // Description with highlighted text
      createElement(
        "div",
        { style: emptyDescStyle },
        "添加您的个人信息和偏好，让 AI ",
        createElement("span", { style: emptyHighlightStyle }, "记住您"),
        "。",
        createElement("br"),
        "例如：",
        createElement("span", { style: emptyHighlightStyle }, "「我叫张三」"),
        "、",
        createElement("span", { style: emptyHighlightStyle }, "「我偏好 TypeScript」"),
        "。"
      ),
      // Prominent add button
      createElement(
        "button",
        {
          style: emptyAddButtonStyle,
          onClick: handleStartAddMemory,
          onMouseEnter: (e: any) => {
            e.currentTarget.style.transform = "translateY(-3px) scale(1.02)";
            e.currentTarget.style.boxShadow = "0 10px 28px rgba(0, 123, 255, 0.45)";
          },
          onMouseLeave: (e: any) => {
            e.currentTarget.style.transform = "translateY(0) scale(1)";
            e.currentTarget.style.boxShadow = "0 6px 20px rgba(0, 123, 255, 0.4)";
          },
        },
        createElement("i", { className: "ti ti-plus", style: { fontSize: "20px" } }),
        "添加第一条记忆"
      )
    );
  };

  const renderMemoryList = () => {
    if (memories.length === 0 && !isAddingMemory) {
      return renderEmptyState();
    }

    return createElement(
      "div",
      { 
        style: memoryListStyle,
        ref: (el: any) => { listContainerRef.current = el; },
      },
      renderAddMemoryForm(),
      memories.map(renderMemoryItem)
    );
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Main Render
  // ─────────────────────────────────────────────────────────────────────────

  return createElement(
    "div",
    { style: cardStyle },
    // Card Header (clickable to toggle collapse)
    createElement(
      "div",
      {
        style: isCollapsed ? cardHeaderCollapsedStyle : cardHeaderStyle,
        onClick: () => setIsCollapsed(!isCollapsed),
      },
      createElement(
        "div",
        { style: cardTitleStyle },
        createElement("i", {
          className: `ti ti-chevron-${isCollapsed ? "right" : "down"}`,
          style: cardCollapseIconStyle,
        }),
        createElement("i", { className: "ti ti-brain" }),
        "全局记忆",
        createElement(
          "span",
          { style: { fontSize: "12px", color: "var(--orca-color-text-2)", fontWeight: 400 } },
          `(${memories.length})`
        )
      )
    ),
    // Card Body (hidden when collapsed)
    !isCollapsed &&
      createElement(
        "div",
        { style: cardBodyStyle },
        renderToolbar(),
        renderMemoryList()
      )
  );
}
