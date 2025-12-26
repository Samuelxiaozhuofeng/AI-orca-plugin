/**
 * SortableInfoItemList - Draggable info item list component with multi-value support
 * Uses native HTML5 drag and drop API (no external dependencies)
 */

import type { PortraitInfoItem, PortraitCategory } from "../../store/memory-store";

const React = window.React as unknown as {
  createElement: typeof window.React.createElement;
  useState: <T>(initial: T | (() => T)) => [T, (next: T | ((prev: T) => T)) => void];
  useCallback: <T extends (...args: any[]) => any>(fn: T, deps: any[]) => T;
  useRef: <T>(value: T) => { current: T };
  useEffect: (fn: () => void | (() => void), deps: any[]) => void;
};
const { createElement, useState, useCallback, useRef, useEffect } = React;

// ============================================================================
// Types
// ============================================================================

interface SortableInfoItemListProps {
  category: PortraitCategory;
  onReorder: (itemIds: string[]) => void;
  onEditItem: (itemId: string, label: string, value: string) => void;
  onDeleteItem: (itemId: string) => void;
  onAddValue: (itemId: string, value: string) => void;
  onRemoveValue: (itemId: string, valueIndex: number) => void;
  onUpdateValue?: (itemId: string, valueIndex: number, newValue: string) => void;
}

// ============================================================================
// Styles
// ============================================================================

const itemContainerStyle: React.CSSProperties = {
  position: "relative",
  display: "flex",
  flexDirection: "column",
  gap: "4px",
  padding: "8px 12px",
  borderRadius: "6px",
  background: "var(--orca-color-bg-2)",
  fontSize: "13px",
  color: "var(--orca-color-text-1)",
  userSelect: "none",
  transition: "box-shadow 0.2s, border-color 0.2s, opacity 0.2s",
  border: "1px solid transparent",
  marginBottom: "6px",
};

const itemHeaderStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "6px",
};

const dragHandleStyle: React.CSSProperties = {
  cursor: "grab",
  color: "var(--orca-color-text-3)",
  fontSize: "14px",
  padding: "2px",
  display: "flex",
  alignItems: "center",
};

const itemDeleteBtnStyle: React.CSSProperties = {
  position: "absolute",
  top: "-6px",
  right: "-6px",
  width: "16px",
  height: "16px",
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
  zIndex: 1,
};

const valuesContainerStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "6px",
  marginTop: "4px",
  marginLeft: "22px",
};

const valueChipStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "4px",
  padding: "3px 8px",
  borderRadius: "4px",
  background: "var(--orca-color-bg-1)",
  fontSize: "12px",
  color: "var(--orca-color-text-1)",
  cursor: "default",
};

const valueDeleteBtnStyle: React.CSSProperties = {
  width: "14px",
  height: "14px",
  borderRadius: "50%",
  border: "none",
  background: "transparent",
  color: "var(--orca-color-text-3)",
  fontSize: "10px",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 0,
};

const addValueInputStyle: React.CSSProperties = {
  padding: "3px 8px",
  borderRadius: "4px",
  border: "1px solid var(--orca-color-border)",
  background: "var(--orca-color-bg-1)",
  color: "var(--orca-color-text-1)",
  fontSize: "12px",
  outline: "none",
  minWidth: "80px",
  maxWidth: "150px",
};

const dropIndicatorStyle: React.CSSProperties = {
  height: "3px",
  background: "var(--orca-color-primary, #007bff)",
  borderRadius: "2px",
  margin: "4px 0",
  boxShadow: "0 0 4px var(--orca-color-primary, #007bff)",
};

const floatingEditStyle: React.CSSProperties = {
  position: "absolute",
  top: "100%",
  left: "0",
  marginTop: "4px",
  padding: "12px",
  background: "var(--orca-color-bg-1)",
  borderRadius: "8px",
  boxShadow: "0 4px 16px rgba(0, 0, 0, 0.25)",
  border: "1px solid var(--orca-color-border)",
  zIndex: 100,
  display: "flex",
  flexDirection: "column",
  gap: "10px",
  minWidth: "370px",
  maxWidth: "470px",
};

const floatingEditInputStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderRadius: "4px",
  border: "1px solid var(--orca-color-primary)",
  background: "var(--orca-color-bg-2)",
  color: "var(--orca-color-text-1)",
  fontSize: "14px",
  outline: "none",
  width: "100%",
  minHeight: "100px",
  resize: "vertical",
  lineHeight: "1.5",
  fontFamily: "inherit",
  boxSizing: "border-box",
};

const floatingEditButtonsStyle: React.CSSProperties = {
  display: "flex",
  gap: "8px",
  justifyContent: "flex-end",
};

const floatingEditBtnStyle: React.CSSProperties = {
  padding: "6px 10px",
  borderRadius: "4px",
  border: "none",
  fontSize: "12px",
  cursor: "pointer",
};

// ============================================================================
// SortableInfoItemList Component
// ============================================================================

export default function SortableInfoItemList({
  category,
  onReorder,
  onEditItem,
  onDeleteItem,
  onAddValue,
  onRemoveValue,
  onUpdateValue,
}: SortableInfoItemListProps) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [dropPosition, setDropPosition] = useState<"before" | "after" | null>(null);
  const [hoveredItemId, setHoveredItemId] = useState<string | null>(null);
  const [addingValueToId, setAddingValueToId] = useState<string | null>(null);
  const [newValue, setNewValue] = useState("");
  // Editing state: { itemId, valueIndex } where valueIndex 0 = primary value, >0 = additional values
  const [editingValue, setEditingValue] = useState<{ itemId: string; valueIndex: number } | null>(null);
  const [editingText, setEditingText] = useState("");
  const inputRef = useRef<HTMLInputElement | null>(null);
  const editInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (addingValueToId && inputRef.current) {
      inputRef.current.focus();
    }
  }, [addingValueToId]);

  useEffect(() => {
    if (editingValue && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingValue]);

  const handleDragStart = useCallback((e: React.DragEvent, itemId: string) => {
    setDraggedId(itemId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", itemId);
  }, []);

  const handleDragEnd = useCallback(() => {
    if (draggedId && dropTargetId && dropPosition) {
      const items = category.items;
      const draggedIndex = items.findIndex(item => item.id === draggedId);
      let targetIndex = items.findIndex(item => item.id === dropTargetId);

      if (draggedIndex !== -1 && targetIndex !== -1 && draggedIndex !== targetIndex) {
        // Adjust target index based on drop position
        if (dropPosition === "after") {
          targetIndex += 1;
        }
        // If dragging from before target, adjust
        if (draggedIndex < targetIndex) {
          targetIndex -= 1;
        }

        const newItems = [...items];
        const [removed] = newItems.splice(draggedIndex, 1);
        newItems.splice(targetIndex, 0, removed);
        onReorder(newItems.map(item => item.id));
      }
    }

    setDraggedId(null);
    setDropTargetId(null);
    setDropPosition(null);
  }, [draggedId, dropTargetId, dropPosition, category.items, onReorder]);

  const handleDragOver = useCallback((e: React.DragEvent, itemId: string) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";

    if (itemId === draggedId) {
      setDropTargetId(null);
      setDropPosition(null);
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    const midY = rect.top + rect.height / 2;
    const position = e.clientY < midY ? "before" : "after";

    if (dropTargetId !== itemId || dropPosition !== position) {
      setDropTargetId(itemId);
      setDropPosition(position);
    }
  }, [draggedId, dropTargetId, dropPosition]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    // Only clear if leaving the actual target, not entering a child
    const relatedTarget = e.relatedTarget as HTMLElement;
    if (!e.currentTarget.contains(relatedTarget)) {
      // Don't clear immediately, let dragOver on another item set new target
    }
  }, []);

  const handleAddValue = useCallback((itemId: string) => {
    if (newValue.trim()) {
      onAddValue(itemId, newValue.trim());
      setNewValue("");
      setAddingValueToId(null);
    }
  }, [newValue, onAddValue]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent, itemId: string) => {
    if (e.key === "Enter") {
      handleAddValue(itemId);
    } else if (e.key === "Escape") {
      setNewValue("");
      setAddingValueToId(null);
    }
  }, [handleAddValue]);

  const handleStartEditValue = useCallback((itemId: string, valueIndex: number, currentValue: string) => {
    setEditingValue({ itemId, valueIndex });
    setEditingText(currentValue);
  }, []);

  const handleSaveEditValue = useCallback(() => {
    if (editingValue && editingText.trim()) {
      if (onUpdateValue) {
        onUpdateValue(editingValue.itemId, editingValue.valueIndex, editingText.trim());
      }
      setEditingValue(null);
      setEditingText("");
    }
  }, [editingValue, editingText, onUpdateValue]);

  const handleEditKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSaveEditValue();
    } else if (e.key === "Escape") {
      setEditingValue(null);
      setEditingText("");
    }
  }, [handleSaveEditValue]);

  const renderItem = (item: PortraitInfoItem) => {
    const isDragging = draggedId === item.id;
    const isHovered = hoveredItemId === item.id;
    const isDropTarget = dropTargetId === item.id;
    const isAddingValue = addingValueToId === item.id;
    const values = item.values || [];
    const allValues = [item.value, ...values];

    const containerStyle: React.CSSProperties = {
      ...itemContainerStyle,
      opacity: isDragging ? 0.5 : 1,
      borderColor: isDropTarget ? "var(--orca-color-primary)" : "transparent",
    };

    return createElement(
      "div",
      { key: item.id },
      // Drop indicator before
      isDropTarget && dropPosition === "before" && createElement("div", { style: dropIndicatorStyle }),
      createElement(
        "div",
        {
          style: containerStyle,
          draggable: true,
          onDragStart: (e: any) => handleDragStart(e, item.id),
          onDragEnd: handleDragEnd,
          onDragOver: (e: any) => handleDragOver(e, item.id),
          onDragLeave: handleDragLeave,
          onMouseEnter: () => setHoveredItemId(item.id),
          onMouseLeave: () => setHoveredItemId(null),
        },
        // Delete button
        isHovered &&
          createElement(
            "button",
            {
              style: itemDeleteBtnStyle,
              onClick: (e: any) => {
                e.stopPropagation();
                onDeleteItem(item.id);
              },
              title: "删除",
            },
            createElement("i", { className: "ti ti-x" })
          ),
        // Item header
        createElement(
          "div",
          { style: itemHeaderStyle },
          // Drag handle
          createElement(
            "div",
            { style: dragHandleStyle },
            createElement("i", { className: "ti ti-grip-vertical" })
          ),
          // Label and primary value
          item.label
            ? createElement(
                "span",
                {
                  style: {
                    color: "var(--orca-color-text-2)",
                    fontWeight: 500,
                    cursor: "pointer",
                  },
                  onClick: () => onEditItem(item.id, item.label, item.value),
                  title: "点击编辑",
                },
                `${item.label}：`
              )
            : createElement(
                "span",
                {
                  style: { cursor: "pointer" },
                  onClick: () => onEditItem(item.id, item.label, item.value),
                  title: "点击编辑",
                },
                item.value
              )
        ),
        // Values list
        createElement(
          "div",
          { style: valuesContainerStyle },
          allValues.map((value, index) => {
            const isEditing = editingValue?.itemId === item.id && editingValue?.valueIndex === index;
            
            return createElement(
              "div",
              {
                key: index,
                style: {
                  ...valueChipStyle,
                  position: "relative",
                  background: index === 0 ? "var(--orca-color-bg-1)" : "var(--orca-color-bg-3)",
                  cursor: "pointer",
                  borderColor: isEditing ? "var(--orca-color-primary)" : "transparent",
                  border: isEditing ? "1px solid var(--orca-color-primary)" : "1px solid transparent",
                },
              },
              createElement(
                "span",
                {
                  onClick: (e: any) => {
                    e.stopPropagation();
                    handleStartEditValue(item.id, index, value);
                  },
                  title: "点击编辑",
                },
                value
              ),
              index > 0 &&
                createElement(
                  "button",
                  {
                    style: valueDeleteBtnStyle,
                    onClick: (e: any) => {
                      e.stopPropagation();
                      onRemoveValue(item.id, index - 1);
                    },
                    title: "删除",
                  },
                  createElement("i", { className: "ti ti-x", style: { fontSize: "10px" } })
                ),
              // Floating edit popup
              isEditing &&
                createElement(
                  "div",
                  {
                    style: floatingEditStyle,
                    onClick: (e: any) => e.stopPropagation(),
                  },
                  createElement("textarea", {
                    ref: editInputRef,
                    value: editingText,
                    onChange: (e: any) => setEditingText(e.target.value),
                    onKeyDown: (e: any) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSaveEditValue();
                      } else if (e.key === "Escape") {
                        setEditingValue(null);
                        setEditingText("");
                      }
                    },
                    style: floatingEditInputStyle,
                    placeholder: "输入新值...",
                  }),
                  createElement(
                    "div",
                    { style: floatingEditButtonsStyle },
                    createElement(
                      "span",
                      { style: { fontSize: "11px", color: "var(--orca-color-text-3)", marginRight: "auto" } },
                      "Enter 保存，Shift+Enter 换行"
                    ),
                    createElement(
                      "button",
                      {
                        style: {
                          ...floatingEditBtnStyle,
                          background: "var(--orca-color-bg-3)",
                          color: "var(--orca-color-text-2)",
                        },
                        onClick: () => {
                          setEditingValue(null);
                          setEditingText("");
                        },
                      },
                      "取消"
                    ),
                    createElement(
                      "button",
                      {
                        style: {
                          ...floatingEditBtnStyle,
                          background: "var(--orca-color-primary)",
                          color: "#fff",
                        },
                        onClick: handleSaveEditValue,
                      },
                      "保存"
                    )
                  )
                )
            );
          }),
          // Add value input/button
          isAddingValue
            ? createElement("input", {
                ref: inputRef,
                type: "text",
                placeholder: "输入值...",
                value: newValue,
                onChange: (e: any) => setNewValue(e.target.value),
                onKeyDown: (e: any) => handleKeyDown(e, item.id),
                onBlur: () => {
                  if (!newValue.trim()) {
                    setAddingValueToId(null);
                  }
                },
                style: addValueInputStyle,
              })
            : createElement(
                "button",
                {
                  style: {
                    ...valueChipStyle,
                    background: "transparent",
                    border: "1px dashed var(--orca-color-border)",
                    cursor: "pointer",
                  },
                  onClick: (e: any) => {
                    e.stopPropagation();
                    setAddingValueToId(item.id);
                  },
                  title: "添加值",
                },
                createElement("i", { className: "ti ti-plus", style: { fontSize: "10px" } })
              )
        )
      ),
      // Drop indicator after
      isDropTarget && dropPosition === "after" && createElement("div", { style: dropIndicatorStyle })
    );
  };

  if (category.items.length === 0) {
    return null;
  }

  // Overlay style for clicking outside to close
  const overlayStyle: React.CSSProperties = {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 99,
  };

  return createElement(
    "div",
    { style: { display: "flex", flexDirection: "column", position: "relative" } },
    // Invisible overlay to catch clicks outside when editing
    editingValue &&
      createElement("div", {
        style: overlayStyle,
        onClick: () => {
          setEditingValue(null);
          setEditingText("");
        },
      }),
    category.items.map(renderItem)
  );
}
