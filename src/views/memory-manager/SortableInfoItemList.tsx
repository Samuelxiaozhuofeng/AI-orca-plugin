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

interface SortableInfoItemListProps {
  category: PortraitCategory;
  onReorder: (itemIds: string[]) => void;
  onEditItem: (itemId: string, label: string, value: string) => void;
  onDeleteItem: (itemId: string) => void;
  onAddValue: (itemId: string, value: string) => void;
  onRemoveValue: (itemId: string, valueIndex: number) => void;
  onUpdateValue?: (itemId: string, valueIndex: number, newValue: string) => void;
}

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
  const [editingValue, setEditingValue] = useState<{ itemId: string; valueIndex: number } | null>(null);
  const [editingText, setEditingText] = useState("");
  const [editingLabelItemId, setEditingLabelItemId] = useState<string | null>(null);
  const [editingLabelText, setEditingLabelText] = useState("");
  // Value chip drag state
  const [draggedValueInfo, setDraggedValueInfo] = useState<{ itemId: string; valueIndex: number } | null>(null);
  const [dropValueTarget, setDropValueTarget] = useState<{ itemId: string; valueIndex: number } | null>(null);
  const labelInputRef = useRef<HTMLInputElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const editInputRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    if (addingValueToId && inputRef.current) inputRef.current.focus();
  }, [addingValueToId]);

  useEffect(() => {
    if (editingValue && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingValue]);

  useEffect(() => {
    if (editingLabelItemId && labelInputRef.current) {
      labelInputRef.current.focus();
      labelInputRef.current.select();
    }
  }, [editingLabelItemId]);

  const handleDragStart = useCallback((e: React.DragEvent, itemId: string) => {
    // If value is being dragged, don't start item drag
    if (draggedValueInfo) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    // Check if the drag started from a value chip (has value-drag data type)
    if (e.dataTransfer.types.includes("application/value-drag")) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }
    setDraggedId(itemId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("application/item-drag", itemId);
  }, [draggedValueInfo]);

  const handleDragEnd = useCallback(() => {
    // Only process if we were dragging an item (not a value)
    if (draggedValueInfo) return;
    
    if (draggedId && dropTargetId && dropPosition) {
      const items = category.items;
      const draggedIndex = items.findIndex(item => item.id === draggedId);
      let targetIndex = items.findIndex(item => item.id === dropTargetId);
      if (draggedIndex !== -1 && targetIndex !== -1 && draggedIndex !== targetIndex) {
        if (dropPosition === "after") targetIndex += 1;
        if (draggedIndex < targetIndex) targetIndex -= 1;
        const newItems = [...items];
        const [removed] = newItems.splice(draggedIndex, 1);
        newItems.splice(targetIndex, 0, removed);
        onReorder(newItems.map(item => item.id));
      }
    }
    setDraggedId(null);
    setDropTargetId(null);
    setDropPosition(null);
  }, [draggedId, dropTargetId, dropPosition, category.items, onReorder, draggedValueInfo]);

  const handleDragOver = useCallback((e: React.DragEvent, itemId: string) => {
    // If dragging a value, don't handle item drag over
    if (draggedValueInfo) {
      return;
    }
    // Check if this is a value drag
    if (e.dataTransfer.types.includes("application/value-drag")) {
      return;
    }
    
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
  }, [draggedId, dropTargetId, dropPosition, draggedValueInfo]);

  const handleAddValue = useCallback((itemId: string) => {
    if (newValue.trim()) {
      onAddValue(itemId, newValue.trim());
      setNewValue("");
      setAddingValueToId(null);
    }
  }, [newValue, onAddValue]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent, itemId: string) => {
    if (e.key === "Enter") handleAddValue(itemId);
    else if (e.key === "Escape") { setNewValue(""); setAddingValueToId(null); }
  }, [handleAddValue]);

  const handleStartEditValue = useCallback((itemId: string, valueIndex: number, currentValue: string) => {
    setEditingValue({ itemId, valueIndex });
    setEditingText(currentValue);
  }, []);

  const handleSaveEditValue = useCallback(() => {
    if (editingValue && editingText.trim() && onUpdateValue) {
      onUpdateValue(editingValue.itemId, editingValue.valueIndex, editingText.trim());
    }
    setEditingValue(null);
    setEditingText("");
  }, [editingValue, editingText, onUpdateValue]);

  const handleStartEditLabel = useCallback((itemId: string, currentLabel: string) => {
    setEditingLabelItemId(itemId);
    setEditingLabelText(currentLabel);
  }, []);

  const handleSaveEditLabel = useCallback((item: PortraitInfoItem) => {
    if (editingLabelItemId) {
      onEditItem(editingLabelItemId, editingLabelText.trim(), item.value);
      setEditingLabelItemId(null);
      setEditingLabelText("");
    }
  }, [editingLabelItemId, editingLabelText, onEditItem]);

  const handleLabelKeyDown = useCallback((e: React.KeyboardEvent, item: PortraitInfoItem) => {
    if (e.key === "Enter") { e.preventDefault(); handleSaveEditLabel(item); }
    else if (e.key === "Escape") { setEditingLabelItemId(null); setEditingLabelText(""); }
  }, [handleSaveEditLabel]);

  // Value chip drag handlers
  const handleValueDragStart = useCallback((e: React.DragEvent, itemId: string, valueIndex: number) => {
    e.stopPropagation();
    // Prevent parent item drag
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("application/value-drag", `${itemId}:${valueIndex}`);
    setDraggedValueInfo({ itemId, valueIndex });
  }, []);

  const handleValueDragEnd = useCallback(() => {
    if (draggedValueInfo && dropValueTarget && onUpdateValue) {
      const { itemId: fromItemId, valueIndex: fromIndex } = draggedValueInfo;
      const { itemId: toItemId, valueIndex: toIndex } = dropValueTarget;
      
      // Only handle reordering within the same item for now
      if (fromItemId === toItemId && fromIndex !== toIndex) {
        const item = category.items.find(i => i.id === fromItemId);
        if (item) {
          const allValues = [item.value, ...(item.values || [])];
          const [movedValue] = allValues.splice(fromIndex, 1);
          allValues.splice(toIndex, 0, movedValue);
          
          // Update primary value and additional values
          const newPrimaryValue = allValues[0];
          const newAdditionalValues = allValues.slice(1);
          
          // Update via onEditItem for primary value change
          onEditItem(fromItemId, item.label, newPrimaryValue);
          
          // Clear and re-add additional values
          // First remove all additional values
          const currentValues = item.values || [];
          for (let i = currentValues.length - 1; i >= 0; i--) {
            onRemoveValue(fromItemId, i);
          }
          // Then add new additional values
          for (const val of newAdditionalValues) {
            onAddValue(fromItemId, val);
          }
        }
      }
    }
    setDraggedValueInfo(null);
    setDropValueTarget(null);
  }, [draggedValueInfo, dropValueTarget, category.items, onEditItem, onAddValue, onRemoveValue, onUpdateValue]);

  const handleValueDragOver = useCallback((e: React.DragEvent, itemId: string, valueIndex: number) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = "move";
    
    if (!draggedValueInfo) return;
    if (draggedValueInfo.itemId !== itemId) return; // Only allow within same item
    if (draggedValueInfo.valueIndex === valueIndex) {
      setDropValueTarget(null);
      return;
    }
    
    setDropValueTarget({ itemId, valueIndex });
  }, [draggedValueInfo]);

  // Value drop indicator style
  const valueDropIndicatorStyle: React.CSSProperties = {
    width: "3px",
    height: "20px",
    background: "var(--orca-color-primary, #007bff)",
    borderRadius: "2px",
    boxShadow: "0 0 4px var(--orca-color-primary, #007bff)",
    flexShrink: 0,
  };


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
      // Only show item drop indicator when not dragging a value
      !draggedValueInfo && isDropTarget && dropPosition === "before" && createElement("div", { style: dropIndicatorStyle }),
      createElement(
        "div",
        {
          style: containerStyle,
          draggable: !draggedValueInfo, // Disable item drag when value is being dragged
          onDragStart: (e: any) => handleDragStart(e, item.id),
          onDragEnd: handleDragEnd,
          onDragOver: (e: any) => handleDragOver(e, item.id),
          onMouseEnter: () => setHoveredItemId(item.id),
          onMouseLeave: () => setHoveredItemId(null),
        },
        isHovered && createElement(
          "button",
          { style: itemDeleteBtnStyle, onClick: (e: any) => { e.stopPropagation(); onDeleteItem(item.id); }, title: "删除" },
          createElement("i", { className: "ti ti-x" })
        ),
        createElement(
          "div",
          { style: itemHeaderStyle },
          createElement("div", { style: dragHandleStyle }, createElement("i", { className: "ti ti-grip-vertical" })),
          item.label ? (
            editingLabelItemId === item.id
              ? createElement("input", {
                  ref: labelInputRef,
                  type: "text",
                  value: editingLabelText,
                  onChange: (e: any) => setEditingLabelText(e.target.value),
                  onKeyDown: (e: any) => handleLabelKeyDown(e, item),
                  onBlur: () => handleSaveEditLabel(item),
                  onClick: (e: any) => e.stopPropagation(),
                  style: { color: "var(--orca-color-text-2)", fontWeight: 500, background: "var(--orca-color-bg-1)", border: "1px solid var(--orca-color-primary)", borderRadius: "4px", padding: "2px 6px", fontSize: "13px", outline: "none", minWidth: "60px" },
                })
              : createElement(
                  "span",
                  { style: { color: "var(--orca-color-text-2)", fontWeight: 500, cursor: "pointer" }, onClick: (e: any) => { e.stopPropagation(); handleStartEditLabel(item.id, item.label); }, title: "点击编辑标签" },
                  item.label + "："
                )
          ) : null
        ),
        createElement(
          "div",
          { style: valuesContainerStyle },
          allValues.flatMap((value, index) => {
            const isEditing = editingValue?.itemId === item.id && editingValue?.valueIndex === index;
            const isDraggingValue = draggedValueInfo?.itemId === item.id && draggedValueInfo?.valueIndex === index;
            const isDropValueTargetHere = dropValueTarget?.itemId === item.id && dropValueTarget?.valueIndex === index;
            
            const elements = [];
            
            // Add drop indicator before this value if it's the drop target
            if (isDropValueTargetHere && draggedValueInfo && draggedValueInfo.valueIndex > index) {
              elements.push(createElement("div", { key: `indicator-${index}`, style: valueDropIndicatorStyle }));
            }
            
            elements.push(createElement(
              "div",
              {
                key: index,
                style: {
                  ...valueChipStyle,
                  position: "relative",
                  background: index === 0 ? "var(--orca-color-bg-1)" : "var(--orca-color-bg-3)",
                  cursor: "grab",
                  border: isEditing ? "1px solid var(--orca-color-primary)" : "1px solid transparent",
                  opacity: isDraggingValue ? 0.5 : 1,
                },
                draggable: !isEditing,
                onDragStart: (e: any) => handleValueDragStart(e, item.id, index),
                onDragEnd: handleValueDragEnd,
                onDragOver: (e: any) => handleValueDragOver(e, item.id, index),
                onDrop: (e: any) => { e.preventDefault(); e.stopPropagation(); },
              },
              createElement("span", { onClick: (e: any) => { e.stopPropagation(); handleStartEditValue(item.id, index, value); }, title: "点击编辑，拖拽排序" }, value),
              index > 0 && createElement("button", { style: valueDeleteBtnStyle, onClick: (e: any) => { e.stopPropagation(); onRemoveValue(item.id, index - 1); }, title: "删除" }, createElement("i", { className: "ti ti-x", style: { fontSize: "10px" } })),
              isEditing && createElement(
                "div",
                { style: floatingEditStyle, onClick: (e: any) => e.stopPropagation() },
                createElement("textarea", {
                  ref: editInputRef,
                  value: editingText,
                  onChange: (e: any) => setEditingText(e.target.value),
                  onKeyDown: (e: any) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSaveEditValue(); } else if (e.key === "Escape") { setEditingValue(null); setEditingText(""); } },
                  style: floatingEditInputStyle,
                  placeholder: "输入新值...",
                }),
                createElement(
                  "div",
                  { style: floatingEditButtonsStyle },
                  createElement("span", { style: { fontSize: "11px", color: "var(--orca-color-text-3)", marginRight: "auto" } }, "Enter 保存，Shift+Enter 换行"),
                  createElement("button", { style: { ...floatingEditBtnStyle, background: "var(--orca-color-bg-3)", color: "var(--orca-color-text-2)" }, onClick: () => { setEditingValue(null); setEditingText(""); } }, "取消"),
                  createElement("button", { style: { ...floatingEditBtnStyle, background: "var(--orca-color-primary)", color: "#fff" }, onClick: handleSaveEditValue }, "保存")
                )
              )
            ));
            
            // Add drop indicator after this value if it's the drop target
            if (isDropValueTargetHere && draggedValueInfo && draggedValueInfo.valueIndex < index) {
              elements.push(createElement("div", { key: `indicator-after-${index}`, style: valueDropIndicatorStyle }));
            }
            
            return elements;
          }),
          isAddingValue
            ? createElement("input", { ref: inputRef, type: "text", placeholder: "输入值...", value: newValue, onChange: (e: any) => setNewValue(e.target.value), onKeyDown: (e: any) => handleKeyDown(e, item.id), onBlur: () => { if (!newValue.trim()) setAddingValueToId(null); }, style: addValueInputStyle })
            : createElement("button", { style: { ...valueChipStyle, background: "transparent", border: "1px dashed var(--orca-color-border)", cursor: "pointer" }, onClick: (e: any) => { e.stopPropagation(); setAddingValueToId(item.id); }, title: "添加值" }, createElement("i", { className: "ti ti-plus", style: { fontSize: "10px" } }))
        )
      ),
      // Only show item drop indicator when not dragging a value
      !draggedValueInfo && isDropTarget && dropPosition === "after" && createElement("div", { style: dropIndicatorStyle })
    );
  };

  if (category.items.length === 0) return null;

  return createElement(
    "div",
    { style: { display: "flex", flexDirection: "column", position: "relative" } },
    editingValue && createElement("div", { style: { position: "fixed", top: 0, left: 0, right: 0, bottom: 0, zIndex: 99 }, onClick: () => { setEditingValue(null); setEditingText(""); } }),
    category.items.map(renderItem)
  );
}
