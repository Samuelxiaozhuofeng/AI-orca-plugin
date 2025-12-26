/**
 * SortableCategoryList - Draggable category list component
 * Uses native HTML5 drag and drop API
 */

import type { PortraitCategory } from "../../store/memory-store";

const React = window.React as unknown as {
  createElement: typeof window.React.createElement;
  useState: <T>(initial: T | (() => T)) => [T, (next: T | ((prev: T) => T)) => void];
  useCallback: <T extends (...args: any[]) => any>(fn: T, deps: any[]) => T;
};
const { createElement, useState, useCallback } = React;

// ============================================================================
// Types
// ============================================================================

interface SortableCategoryListProps {
  categories: PortraitCategory[];
  collapsedCategories: Set<string>;
  onReorder: (categoryIds: string[]) => void;
  onToggleCollapse: (categoryId: string) => void;
  onCollapseAll: () => void;
  onExpandAll: () => void;
  renderCategory: (category: PortraitCategory, isDragging: boolean, isDropTarget: boolean) => React.ReactNode;
}

// ============================================================================
// Styles
// ============================================================================

const headerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  marginBottom: "12px",
};

const headerTitleStyle: React.CSSProperties = {
  fontSize: "13px",
  color: "var(--orca-color-text-2)",
  display: "flex",
  alignItems: "center",
  gap: "8px",
};

const headerButtonsStyle: React.CSSProperties = {
  display: "flex",
  gap: "4px",
};

const headerBtnStyle: React.CSSProperties = {
  padding: "4px 8px",
  borderRadius: "4px",
  border: "none",
  background: "var(--orca-color-bg-2)",
  color: "var(--orca-color-text-2)",
  fontSize: "11px",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  gap: "4px",
};

const dropIndicatorStyle: React.CSSProperties = {
  height: "3px",
  background: "var(--orca-color-primary, #007bff)",
  borderRadius: "2px",
  margin: "4px 0",
  boxShadow: "0 0 4px var(--orca-color-primary, #007bff)",
};

// ============================================================================
// Component
// ============================================================================

export default function SortableCategoryList({
  categories,
  collapsedCategories,
  onReorder,
  onCollapseAll,
  onExpandAll,
  renderCategory,
}: SortableCategoryListProps) {
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dropTargetId, setDropTargetId] = useState<string | null>(null);
  const [dropPosition, setDropPosition] = useState<"before" | "after" | null>(null);

  const handleDragStart = useCallback((e: React.DragEvent, categoryId: string) => {
    setDraggedId(categoryId);
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", categoryId);
  }, []);

  const handleDragEnd = useCallback(() => {
    if (draggedId && dropTargetId && dropPosition) {
      const draggedIndex = categories.findIndex(c => c.id === draggedId);
      let targetIndex = categories.findIndex(c => c.id === dropTargetId);

      if (draggedIndex !== -1 && targetIndex !== -1 && draggedIndex !== targetIndex) {
        if (dropPosition === "after") {
          targetIndex += 1;
        }
        if (draggedIndex < targetIndex) {
          targetIndex -= 1;
        }

        const newCategories = [...categories];
        const [removed] = newCategories.splice(draggedIndex, 1);
        newCategories.splice(targetIndex, 0, removed);
        onReorder(newCategories.map(c => c.id));
      }
    }

    setDraggedId(null);
    setDropTargetId(null);
    setDropPosition(null);
  }, [draggedId, dropTargetId, dropPosition, categories, onReorder]);

  const handleDragOver = useCallback(
    (e: React.DragEvent, categoryId: string) => {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = "move";

      if (categoryId === draggedId) {
        setDropTargetId(null);
        setDropPosition(null);
        return;
      }

      const rect = e.currentTarget.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      const position = e.clientY < midY ? "before" : "after";

      if (dropTargetId !== categoryId || dropPosition !== position) {
        setDropTargetId(categoryId);
        setDropPosition(position);
      }
    },
    [draggedId, dropTargetId, dropPosition]
  );

  const allCollapsed = categories.length > 0 && categories.every(c => collapsedCategories.has(c.id));
  const allExpanded = categories.length > 0 && categories.every(c => !collapsedCategories.has(c.id));

  if (categories.length === 0) {
    return null;
  }

  return createElement(
    "div",
    { style: { marginTop: "16px" } },
    // Header with collapse/expand buttons
    createElement(
      "div",
      { style: headerStyle },
      createElement(
        "div",
        { style: headerTitleStyle },
        "分类信息",
        createElement("span", { style: { fontSize: "11px", color: "var(--orca-color-text-3)" } }, "(可拖拽排序)")
      ),
      createElement(
        "div",
        { style: headerButtonsStyle },
        createElement(
          "button",
          {
            style: {
              ...headerBtnStyle,
              opacity: allCollapsed ? 0.5 : 1,
            },
            onClick: onCollapseAll,
            title: "折叠全部",
            disabled: allCollapsed,
          },
          createElement("i", { className: "ti ti-fold", style: { fontSize: "12px" } }),
          "折叠"
        ),
        createElement(
          "button",
          {
            style: {
              ...headerBtnStyle,
              opacity: allExpanded ? 0.5 : 1,
            },
            onClick: onExpandAll,
            title: "展开全部",
            disabled: allExpanded,
          },
          createElement("i", { className: "ti ti-fold-up", style: { fontSize: "12px" } }),
          "展开"
        )
      )
    ),
    // Categories list
    categories.map(category => {
      const isDragging = draggedId === category.id;
      const isDropTarget = dropTargetId === category.id;

      return createElement(
        "div",
        {
          key: category.id,
          draggable: true,
          onDragStart: (e: any) => handleDragStart(e, category.id),
          onDragEnd: handleDragEnd,
          onDragOver: (e: any) => handleDragOver(e, category.id),
          style: {
            opacity: isDragging ? 0.5 : 1,
            transition: "opacity 0.2s",
          },
        },
        isDropTarget && dropPosition === "before" && createElement("div", { style: dropIndicatorStyle }),
        renderCategory(category, isDragging, isDropTarget),
        isDropTarget && dropPosition === "after" && createElement("div", { style: dropIndicatorStyle })
      );
    })
  );
}
