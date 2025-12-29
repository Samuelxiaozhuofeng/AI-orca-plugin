/**
 * UserPortraitCard - Card component for displaying AI-generated user portrait
 * Shows impression tags and categorized details
 * Requirements: 15.1, 15.2, 15.4, 15.5
 */

import type {
  UserPortrait,
  PortraitTag,
  PortraitCategory,
  PortraitInfoItem,
} from "../../store/memory-store";
import {
  cardStyle,
  cardHeaderStyle,
  cardHeaderCollapsedStyle,
  cardTitleStyle,
  cardCollapseIconStyle,
  cardBodyStyle,
  generateButtonStyle,
  portraitEmptyStyle,
} from "./card-styles";
import SortableInfoItemList from "./SortableInfoItemList";
import SortableCategoryList from "./SortableCategoryList";

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

interface UserPortraitCardProps {
  portrait: UserPortrait | undefined;
  hasMemories: boolean;
  isGenerating: boolean;
  onGeneratePortrait: () => void;
  onCancelGeneration?: () => void;
  onEditTag: (tagId: string) => void;
  onUpdateTagLabel?: (tagId: string, label: string) => void;
  onDeleteTag: (tagId: string) => void;
  onEditInfoItem: (categoryId: string, itemId: string, label: string, value: string) => void;
  onDeleteInfoItem: (categoryId: string, itemId: string) => void;
  onAddTag: () => void;
  onAddCategory: (title: string) => void;
  onEditCategoryTitle: (categoryId: string, title: string) => void;
  onDeleteCategory: (categoryId: string) => void;
  onAddInfoItem: (categoryId: string, label: string, value: string) => void;
  // New props for info item management
  onReorderInfoItems?: (categoryId: string, itemIds: string[]) => void;
  onAddInfoItemValue?: (categoryId: string, itemId: string, value: string) => void;
  onRemoveInfoItemValue?: (categoryId: string, itemId: string, valueIndex: number) => void;
  onUpdateInfoItemValue?: (categoryId: string, itemId: string, valueIndex: number, newValue: string) => void;
  onReorderCategories?: (categoryIds: string[]) => void;
  // Refresh AI impression
  onRefreshAIImpression?: () => void;
  // Track newly added tags for highlighting
  newTagIds?: Set<string>;
}

// ============================================================================
// Component
// ============================================================================

export default function UserPortraitCard({
  portrait,
  hasMemories,
  isGenerating,
  onGeneratePortrait,
  onCancelGeneration,
  onEditTag,
  onUpdateTagLabel,
  onDeleteTag,
  onEditInfoItem,
  onDeleteInfoItem,
  onAddTag,
  onAddCategory,
  onEditCategoryTitle,
  onDeleteCategory,
  onAddInfoItem,
  onReorderInfoItems,
  onAddInfoItemValue,
  onRemoveInfoItemValue,
  onUpdateInfoItemValue,
  onReorderCategories,
  onRefreshAIImpression,
  newTagIds,
}: UserPortraitCardProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [hoveredTagId, setHoveredTagId] = useState<string | null>(null);
  const [hoveredItemKey, setHoveredItemKey] = useState<string | null>(null);
  const [hoveredCategoryId, setHoveredCategoryId] = useState<string | null>(null);
  // Inline editing states
  const [editingCategoryId, setEditingCategoryId] = useState<string | null>(null);
  const [editingCategoryTitle, setEditingCategoryTitle] = useState("");
  const [addingInfoToCategoryId, setAddingInfoToCategoryId] = useState<string | null>(null);
  const [newInfoLabel, setNewInfoLabel] = useState("");
  const [newInfoValue, setNewInfoValue] = useState("");
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCategoryTitle, setNewCategoryTitle] = useState("");
  // Category collapse states
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  // Info item modal editing states
  const [showInfoItemModal, setShowInfoItemModal] = useState(false);
  const [editingInfoCategoryId, setEditingInfoCategoryId] = useState<string | null>(null);
  const [editingInfoItemId, setEditingInfoItemId] = useState<string | null>(null);
  const [editingInfoLabel, setEditingInfoLabel] = useState("");
  const [editingInfoValue, setEditingInfoValue] = useState("");

  // ─────────────────────────────────────────────────────────────────────────
  // Render Helpers
  // ─────────────────────────────────────────────────────────────────────────

  // Tag style - simple pill design
  const tagStyle: React.CSSProperties = {
    position: "relative",
    display: "inline-flex",
    alignItems: "center",
    gap: "4px",
    padding: "4px 10px",
    borderRadius: "4px",
    background: "var(--orca-color-bg-1)",
    fontSize: "13px",
    color: "var(--orca-color-text-1)",
    maxWidth: "100%",
    wordBreak: "break-word",
  };

  // New tag style with highlight
  const newTagStyle: React.CSSProperties = {
    ...tagStyle,
    background: "rgba(40, 167, 69, 0.15)",
    border: "1px solid rgba(40, 167, 69, 0.4)",
    color: "var(--orca-color-text-1)",
  };

  const tagDeleteBtnStyle: React.CSSProperties = {
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
  };

  const renderTag = (tag: PortraitTag) => {
    const isHovered = hoveredTagId === tag.id;
    const isNew = newTagIds?.has(tag.id);

    // Display mode only - AI tags are not editable
    return createElement(
      "div",
      {
        key: tag.id,
        style: isNew ? newTagStyle : tagStyle,
        onMouseEnter: () => setHoveredTagId(tag.id),
        onMouseLeave: () => setHoveredTagId(null),
        title: isNew ? "新增印象" : undefined,
      },
      createElement("span", null, tag.emoji),
      createElement("span", null, tag.label),
      isNew && createElement(
        "span",
        {
          style: {
            marginLeft: "4px",
            fontSize: "10px",
            color: "rgba(40, 167, 69, 0.9)",
            fontWeight: 500,
          },
        },
        "新"
      ),
      isHovered &&
        createElement(
          "button",
          {
            style: tagDeleteBtnStyle,
            onClick: (e: any) => {
              e.stopPropagation();
              onDeleteTag(tag.id);
            },
            title: "删除",
          },
          createElement("i", { className: "ti ti-x" })
        )
    );
  };

  const renderTags = () => {
    if (!portrait || portrait.tags.length === 0) return null;

    const tagsContainerStyle: React.CSSProperties = {
      display: "flex",
      flexWrap: "wrap",
      gap: "8px",
      marginBottom: "12px",
    };

    const addTagBtnStyle: React.CSSProperties = {
      display: "inline-flex",
      alignItems: "center",
      gap: "4px",
      padding: "4px 10px",
      borderRadius: "4px",
      background: "transparent",
      border: "1px dashed var(--orca-color-border)",
      fontSize: "13px",
      color: "var(--orca-color-text-2)",
      cursor: "pointer",
    };

    const refreshBtnStyle: React.CSSProperties = {
      display: "inline-flex",
      alignItems: "center",
      gap: "4px",
      padding: "4px 10px",
      borderRadius: "4px",
      background: "transparent",
      border: "1px solid var(--orca-color-border)",
      fontSize: "13px",
      color: "var(--orca-color-text-2)",
      cursor: isGenerating ? "not-allowed" : "pointer",
      opacity: isGenerating ? 0.6 : 1,
    };

    const tagsHeaderStyle: React.CSSProperties = {
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      marginBottom: "8px",
    };

    return createElement(
      "div",
      null,
      createElement(
        "div",
        { style: tagsHeaderStyle },
        createElement(
          "div",
          { style: { fontSize: "12px", color: "var(--orca-color-text-2)" } },
          "AI 印象"
        ),
        onRefreshAIImpression && createElement(
          "button",
          {
            style: refreshBtnStyle,
            onClick: isGenerating ? undefined : onRefreshAIImpression,
            title: isGenerating ? "正在生成..." : "刷新 AI 印象",
            onMouseEnter: (e: any) => {
              if (!isGenerating) {
                e.currentTarget.style.background = "var(--orca-color-bg-3)";
                e.currentTarget.style.borderColor = "var(--orca-color-primary)";
                e.currentTarget.style.color = "var(--orca-color-primary)";
              }
            },
            onMouseLeave: (e: any) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.borderColor = "var(--orca-color-border)";
              e.currentTarget.style.color = "var(--orca-color-text-2)";
            },
          },
          createElement("i", {
            className: isGenerating ? "ti ti-loader" : "ti ti-refresh",
            style: isGenerating ? { animation: "spin 1s linear infinite" } : undefined,
          }),
          isGenerating ? "生成中" : "刷新"
        )
      ),
      createElement(
        "div",
        { style: tagsContainerStyle },
        portrait.tags.map(renderTag),
        createElement(
          "button",
          {
            style: addTagBtnStyle,
            onClick: onAddTag,
            title: "添加标签",
          },
          createElement("i", { className: "ti ti-plus", style: { fontSize: "12px" } }),
          "添加"
        )
      )
    );
  };

  // Info item style with absolute positioned delete button
  const infoItemContainerStyle: React.CSSProperties = {
    position: "relative",
  };

  const infoItemStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    padding: "6px 10px",
    background: "var(--orca-color-bg-2)",
    borderRadius: "4px",
    fontSize: "13px",
    color: "var(--orca-color-text-1)",
    cursor: "pointer",
  };

  const infoLabelStyle: React.CSSProperties = {
    color: "var(--orca-color-text-2)",
    marginRight: "6px",
    flexShrink: 0,
  };

  const infoDeleteBtnStyle: React.CSSProperties = {
    position: "absolute",
    top: "50%",
    right: "-8px",
    transform: "translateY(-50%)",
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
  };

  const renderInfoItem = (category: PortraitCategory, item: PortraitInfoItem) => {
    const itemKey = `${category.id}-${item.id}`;
    const isHovered = hoveredItemKey === itemKey;

    const handleStartEditInfoItem = () => {
      setEditingInfoCategoryId(category.id);
      setEditingInfoItemId(item.id);
      setEditingInfoLabel(item.label);
      setEditingInfoValue(item.value);
      setShowInfoItemModal(true);
    };

    // Display mode only - click to open modal
    return createElement(
      "div",
      {
        key: item.id,
        style: infoItemContainerStyle,
        onMouseEnter: () => setHoveredItemKey(itemKey),
        onMouseLeave: () => setHoveredItemKey(null),
      },
      createElement(
        "div",
        {
          style: { ...infoItemStyle, cursor: "pointer" },
          onClick: handleStartEditInfoItem,
          title: "点击编辑",
        },
        item.label && createElement("span", { style: infoLabelStyle }, `${item.label}：`),
        createElement("span", { style: { flex: 1 } }, item.value)
      ),
      isHovered &&
        createElement(
          "button",
          {
            style: infoDeleteBtnStyle,
            onClick: (e: any) => {
              e.stopPropagation();
              onDeleteInfoItem(category.id, item.id);
            },
            title: "删除",
          },
          createElement("i", { className: "ti ti-x" })
        )
    );
  };

  const renderCategory = (category: PortraitCategory) => {
    // Use items array directly
    const items = category.items || [];
    const isHovered = hoveredCategoryId === category.id;
    const isEditingTitle = editingCategoryId === category.id;
    const isAddingInfo = addingInfoToCategoryId === category.id;
    const isCategoryCollapsed = collapsedCategories.has(category.id);

    const toggleCategoryCollapse = () => {
      setCollapsedCategories((prev) => {
        const next = new Set(prev);
        if (next.has(category.id)) {
          next.delete(category.id);
        } else {
          next.add(category.id);
        }
        return next;
      });
    };

    // Category title style - larger and bold
    const categoryTitleContainerStyle: React.CSSProperties = {
      position: "relative",
      display: "flex",
      alignItems: "center",
      gap: "6px",
      marginBottom: isCategoryCollapsed ? "0" : "8px",
      cursor: "pointer",
    };

    const categoryTitleTextStyle: React.CSSProperties = {
      fontSize: "14px",
      color: "var(--orca-color-text-1)",
      fontWeight: 600,
    };

    const categoryTitleInputStyle: React.CSSProperties = {
      fontSize: "14px",
      color: "var(--orca-color-text-1)",
      fontWeight: 600,
      padding: "2px 6px",
      border: "1px solid var(--orca-color-primary)",
      borderRadius: "4px",
      background: "var(--orca-color-bg-2)",
      outline: "none",
      minWidth: "80px",
    };

    const categoryDeleteBtnStyle: React.CSSProperties = {
      position: "absolute",
      top: "-4px",
      right: "-4px",
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
    };

    const collapseIconStyle: React.CSSProperties = {
      fontSize: "12px",
      color: "var(--orca-color-text-2)",
      transition: "transform 0.2s",
    };

    const addInfoBtnStyle: React.CSSProperties = {
      display: "inline-flex",
      alignItems: "center",
      gap: "4px",
      padding: "4px 8px",
      borderRadius: "4px",
      background: "transparent",
      border: "1px dashed var(--orca-color-border)",
      fontSize: "12px",
      color: "var(--orca-color-text-2)",
      cursor: "pointer",
    };

    const addInfoFormStyle: React.CSSProperties = {
      display: "flex",
      flexDirection: "column",
      gap: "6px",
      padding: "8px",
      background: "var(--orca-color-bg-2)",
      borderRadius: "4px",
    };

    const addInfoInputStyle: React.CSSProperties = {
      padding: "6px 8px",
      border: "1px solid var(--orca-color-border)",
      borderRadius: "4px",
      background: "var(--orca-color-bg-1)",
      color: "var(--orca-color-text-1)",
      fontSize: "13px",
      outline: "none",
    };

    const addInfoActionsStyle: React.CSSProperties = {
      display: "flex",
      gap: "6px",
      justifyContent: "flex-end",
    };

    const addInfoActionBtnStyle: React.CSSProperties = {
      padding: "4px 10px",
      borderRadius: "4px",
      border: "none",
      fontSize: "12px",
      cursor: "pointer",
    };

    return createElement(
      "div",
      {
        key: category.id,
        style: { marginBottom: "12px", position: "relative" },
        onMouseEnter: () => setHoveredCategoryId(category.id),
        onMouseLeave: () => setHoveredCategoryId(null),
      },
      // Category title (collapsible and editable)
      createElement(
        "div",
        { style: categoryTitleContainerStyle },
        // Collapse icon
        createElement("i", {
          className: `ti ti-chevron-${isCategoryCollapsed ? "right" : "down"}`,
          style: collapseIconStyle,
          onClick: toggleCategoryCollapse,
        }),
        isEditingTitle
          ? createElement("input", {
              type: "text",
              value: editingCategoryTitle,
              onChange: (e: any) => setEditingCategoryTitle(e.target.value),
              onBlur: () => {
                if (editingCategoryTitle.trim()) {
                  onEditCategoryTitle(category.id, editingCategoryTitle.trim());
                }
                setEditingCategoryId(null);
                setEditingCategoryTitle("");
              },
              onKeyDown: (e: any) => {
                if (e.key === "Enter" && editingCategoryTitle.trim()) {
                  onEditCategoryTitle(category.id, editingCategoryTitle.trim());
                  setEditingCategoryId(null);
                  setEditingCategoryTitle("");
                }
                if (e.key === "Escape") {
                  setEditingCategoryId(null);
                  setEditingCategoryTitle("");
                }
              },
              style: categoryTitleInputStyle,
              autoFocus: true,
              onClick: (e: any) => e.stopPropagation(),
            })
          : createElement(
              "div",
              {
                style: { display: "flex", alignItems: "center", gap: "6px", flex: 1 },
                onClick: toggleCategoryCollapse,
              },
              createElement(
                "span",
                {
                  style: categoryTitleTextStyle,
                  onClick: (e: any) => {
                    e.stopPropagation();
                    setEditingCategoryId(category.id);
                    setEditingCategoryTitle(category.title);
                  },
                  title: "点击编辑分类名称",
                },
                category.title
              ),
              createElement(
                "span",
                { style: { fontSize: "12px", color: "var(--orca-color-text-2)" } },
                `(${items.length})`
              )
            ),
        // Delete category button (shown on hover)
        isHovered &&
          !isEditingTitle &&
          createElement(
            "button",
            {
              style: categoryDeleteBtnStyle,
              onClick: (e: any) => {
                e.stopPropagation();
                onDeleteCategory(category.id);
              },
              title: "删除分类",
            },
            createElement("i", { className: "ti ti-x" })
          )
      ),
      // Individual info items (hidden when collapsed)
      !isCategoryCollapsed &&
        createElement(
          "div",
          { style: { display: "flex", flexDirection: "column", gap: "6px", marginLeft: "18px" } },
          // Use SortableInfoItemList if handlers are provided
          onReorderInfoItems && onAddInfoItemValue && onRemoveInfoItemValue
            ? createElement(SortableInfoItemList, {
                category,
                onReorder: (itemIds: string[]) => onReorderInfoItems(category.id, itemIds),
                onEditItem: (itemId: string, label: string, value: string) =>
                  onEditInfoItem(category.id, itemId, label, value),
                onDeleteItem: (itemId: string) => onDeleteInfoItem(category.id, itemId),
                onAddValue: (itemId: string, value: string) =>
                  onAddInfoItemValue(category.id, itemId, value),
                onRemoveValue: (itemId: string, valueIndex: number) =>
                  onRemoveInfoItemValue(category.id, itemId, valueIndex),
                onUpdateValue: onUpdateInfoItemValue
                  ? (itemId: string, valueIndex: number, newValue: string) =>
                      onUpdateInfoItemValue(category.id, itemId, valueIndex, newValue)
                  : undefined,
              })
            : items.map((item) => renderInfoItem(category, item)),
          // Add info item form or button
          isAddingInfo
            ? createElement(
                "div",
                { style: addInfoFormStyle },
                createElement("input", {
                  type: "text",
                  placeholder: "标签（可选，如：姓名）",
                  value: newInfoLabel,
                  onChange: (e: any) => setNewInfoLabel(e.target.value),
                  style: addInfoInputStyle,
                }),
                createElement("input", {
                  type: "text",
                  placeholder: "内容（必填）",
                  value: newInfoValue,
                  onChange: (e: any) => setNewInfoValue(e.target.value),
                  style: addInfoInputStyle,
                  autoFocus: true,
                  onKeyDown: (e: any) => {
                    if (e.key === "Enter" && newInfoValue.trim()) {
                      onAddInfoItem(category.id, newInfoLabel.trim(), newInfoValue.trim());
                      setAddingInfoToCategoryId(null);
                      setNewInfoLabel("");
                      setNewInfoValue("");
                    }
                    if (e.key === "Escape") {
                      setAddingInfoToCategoryId(null);
                      setNewInfoLabel("");
                      setNewInfoValue("");
                    }
                  },
                }),
                createElement(
                  "div",
                  { style: addInfoActionsStyle },
                  createElement(
                    "button",
                    {
                      style: { ...addInfoActionBtnStyle, background: "var(--orca-color-bg-3)", color: "var(--orca-color-text-2)" },
                      onClick: () => {
                        setAddingInfoToCategoryId(null);
                        setNewInfoLabel("");
                        setNewInfoValue("");
                      },
                    },
                    "取消"
                  ),
                  createElement(
                    "button",
                    {
                      style: {
                        ...addInfoActionBtnStyle,
                        background: newInfoValue.trim() ? "var(--orca-color-primary)" : "var(--orca-color-bg-3)",
                        color: newInfoValue.trim() ? "#fff" : "var(--orca-color-text-2)",
                        cursor: newInfoValue.trim() ? "pointer" : "not-allowed",
                      },
                      onClick: () => {
                        if (newInfoValue.trim()) {
                          onAddInfoItem(category.id, newInfoLabel.trim(), newInfoValue.trim());
                          setAddingInfoToCategoryId(null);
                          setNewInfoLabel("");
                          setNewInfoValue("");
                        }
                      },
                    },
                    "添加"
                  )
                )
              )
            : createElement(
                "button",
                {
                  style: addInfoBtnStyle,
                  onClick: () => setAddingInfoToCategoryId(category.id),
                  title: "添加信息",
                },
                createElement("i", { className: "ti ti-plus", style: { fontSize: "10px" } }),
                "添加"
              )
        )
    );
  };

  // Collapse/expand all categories handlers
  const handleCollapseAll = useCallback(() => {
    if (portrait?.categories) {
      setCollapsedCategories(new Set(portrait.categories.map(c => c.id)));
    }
  }, [portrait?.categories]);

  const handleExpandAll = useCallback(() => {
    setCollapsedCategories(new Set());
  }, []);

  const handleToggleCategoryCollapse = useCallback((categoryId: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }
      return next;
    });
  }, []);

  const renderCategories = () => {
    const addCategoryBtnStyle: React.CSSProperties = {
      display: "inline-flex",
      alignItems: "center",
      gap: "4px",
      padding: "6px 12px",
      borderRadius: "4px",
      background: "transparent",
      border: "1px dashed var(--orca-color-border)",
      fontSize: "13px",
      color: "var(--orca-color-text-2)",
      cursor: "pointer",
      marginTop: "8px",
    };

    const addCategoryFormStyle: React.CSSProperties = {
      display: "flex",
      gap: "8px",
      alignItems: "center",
      marginTop: "8px",
    };

    const addCategoryInputStyle: React.CSSProperties = {
      flex: 1,
      padding: "6px 10px",
      border: "1px solid var(--orca-color-primary)",
      borderRadius: "4px",
      background: "var(--orca-color-bg-2)",
      color: "var(--orca-color-text-1)",
      fontSize: "13px",
      outline: "none",
    };

    const addCategoryActionBtnStyle: React.CSSProperties = {
      padding: "6px 10px",
      borderRadius: "4px",
      border: "none",
      fontSize: "12px",
      cursor: "pointer",
    };

    // Use SortableCategoryList if reorder handler is provided
    const categoriesContent = onReorderCategories && portrait?.categories
      ? createElement(SortableCategoryList, {
          categories: portrait.categories,
          collapsedCategories,
          onReorder: onReorderCategories,
          onToggleCollapse: handleToggleCategoryCollapse,
          onCollapseAll: handleCollapseAll,
          onExpandAll: handleExpandAll,
          renderCategory: (category: PortraitCategory, isDragging: boolean, isDropTarget: boolean) => 
            renderCategory(category),
        })
      : createElement(
          "div",
          { style: { marginTop: "16px" } },
          portrait?.categories.map(renderCategory)
        );

    return createElement(
      "div",
      null,
      categoriesContent,
      // Add category form or button
      isAddingCategory
        ? createElement(
            "div",
            { style: addCategoryFormStyle },
            createElement("input", {
              type: "text",
              placeholder: "输入分类名称...",
              value: newCategoryTitle,
              onChange: (e: any) => setNewCategoryTitle(e.target.value),
              style: addCategoryInputStyle,
              autoFocus: true,
              onKeyDown: (e: any) => {
                if (e.key === "Enter" && newCategoryTitle.trim()) {
                  onAddCategory(newCategoryTitle.trim());
                  setIsAddingCategory(false);
                  setNewCategoryTitle("");
                }
                if (e.key === "Escape") {
                  setIsAddingCategory(false);
                  setNewCategoryTitle("");
                }
              },
            }),
            createElement(
              "button",
              {
                style: { ...addCategoryActionBtnStyle, background: "var(--orca-color-bg-3)", color: "var(--orca-color-text-2)" },
                onClick: () => {
                  setIsAddingCategory(false);
                  setNewCategoryTitle("");
                },
              },
              "取消"
            ),
            createElement(
              "button",
              {
                style: {
                  ...addCategoryActionBtnStyle,
                  background: newCategoryTitle.trim() ? "var(--orca-color-primary)" : "var(--orca-color-bg-3)",
                  color: newCategoryTitle.trim() ? "#fff" : "var(--orca-color-text-2)",
                  cursor: newCategoryTitle.trim() ? "pointer" : "not-allowed",
                },
                onClick: () => {
                  if (newCategoryTitle.trim()) {
                    onAddCategory(newCategoryTitle.trim());
                    setIsAddingCategory(false);
                    setNewCategoryTitle("");
                  }
                },
              },
              "添加"
            )
          )
        : createElement(
            "button",
            {
              style: addCategoryBtnStyle,
              onClick: () => setIsAddingCategory(true),
              title: "添加分类",
            },
            createElement("i", { className: "ti ti-plus", style: { fontSize: "12px" } }),
            "添加分类"
          )
    );
  };

  const renderEmptyState = () => {
    if (!hasMemories) {
      return createElement(
        "div",
        { style: portraitEmptyStyle },
        createElement("i", { className: "ti ti-mood-empty", style: { fontSize: "32px", marginBottom: "8px", opacity: 0.5 } }),
        createElement("div", null, "请先添加一些记忆"),
        createElement("div", { style: { fontSize: "12px", marginTop: "4px" } }, "AI 将根据记忆生成用户印象")
      );
    }

    if (!portrait || (portrait.tags.length === 0 && portrait.categories.length === 0)) {
      return createElement(
        "div",
        { style: portraitEmptyStyle },
        createElement("i", { className: "ti ti-sparkles", style: { fontSize: "32px", marginBottom: "8px", opacity: 0.5 } }),
        createElement("div", null, "暂无用户印象"),
        createElement("div", { style: { fontSize: "12px", marginTop: "4px" } }, "点击下方按钮让 AI 生成印象")
      );
    }

    return null;
  };

  const renderGenerateButton = () => {
    if (!hasMemories) return null;

    // When generating, show cancel button
    if (isGenerating) {
      const cancelButtonStyle: React.CSSProperties = {
        ...generateButtonStyle,
        borderColor: "var(--orca-color-danger, #dc3545)",
        color: "var(--orca-color-danger, #dc3545)",
        cursor: "pointer",
      };

      return createElement(
        "button",
        {
          style: cancelButtonStyle,
          onClick: onCancelGeneration,
          onMouseEnter: (e: any) => {
            e.currentTarget.style.background = "rgba(220, 53, 69, 0.1)";
          },
          onMouseLeave: (e: any) => {
            e.currentTarget.style.background = "transparent";
          },
        },
        createElement("i", { className: "ti ti-loader", style: { animation: "spin 1s linear infinite" } }),
        "取消生成"
      );
    }

    return createElement(
      "button",
      {
        style: generateButtonStyle,
        onClick: onGeneratePortrait,
        onMouseEnter: (e: any) => {
          e.currentTarget.style.background = "var(--orca-color-bg-3)";
          e.currentTarget.style.borderColor = "var(--orca-color-primary)";
          e.currentTarget.style.color = "var(--orca-color-primary)";
        },
        onMouseLeave: (e: any) => {
          e.currentTarget.style.background = "transparent";
          e.currentTarget.style.borderColor = "var(--orca-color-border)";
          e.currentTarget.style.color = "var(--orca-color-text-2)";
        },
      },
      createElement("i", { className: "ti ti-sparkles" }),
      "生成印象"
    );
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Main Render
  // ─────────────────────────────────────────────────────────────────────────

  // Info item edit modal handlers
  const handleSaveInfoItemModal = () => {
    if (editingInfoCategoryId && editingInfoItemId && editingInfoValue.trim()) {
      onEditInfoItem(editingInfoCategoryId, editingInfoItemId, editingInfoLabel.trim(), editingInfoValue.trim());
    }
    setShowInfoItemModal(false);
    setEditingInfoCategoryId(null);
    setEditingInfoItemId(null);
    setEditingInfoLabel("");
    setEditingInfoValue("");
  };

  const handleCancelInfoItemModal = () => {
    setShowInfoItemModal(false);
    setEditingInfoCategoryId(null);
    setEditingInfoItemId(null);
    setEditingInfoLabel("");
    setEditingInfoValue("");
  };

  // Modal styles
  const modalOverlayStyle: React.CSSProperties = {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: "rgba(0, 0, 0, 0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1000,
  };

  const modalContentStyle: React.CSSProperties = {
    background: "var(--orca-color-bg-1)",
    borderRadius: "8px",
    padding: "16px",
    minWidth: "300px",
    maxWidth: "400px",
    boxShadow: "0 4px 20px rgba(0, 0, 0, 0.3)",
  };

  const modalTitleStyle: React.CSSProperties = {
    fontSize: "14px",
    fontWeight: 600,
    marginBottom: "12px",
    color: "var(--orca-color-text-1)",
  };

  const modalInputStyle: React.CSSProperties = {
    width: "100%",
    padding: "8px 10px",
    borderRadius: "4px",
    border: "1px solid var(--orca-color-border)",
    background: "var(--orca-color-bg-2)",
    color: "var(--orca-color-text-1)",
    fontSize: "13px",
    outline: "none",
    boxSizing: "border-box",
    marginBottom: "10px",
  };

  const modalButtonsStyle: React.CSSProperties = {
    display: "flex",
    justifyContent: "flex-end",
    gap: "8px",
    marginTop: "12px",
  };

  const modalBtnStyle: React.CSSProperties = {
    padding: "6px 14px",
    borderRadius: "4px",
    border: "none",
    fontSize: "13px",
    cursor: "pointer",
  };

  const renderInfoItemModal = () => {
    if (!showInfoItemModal) return null;

    const horizontalFormStyle: React.CSSProperties = {
      display: "flex",
      alignItems: "center",
      gap: "8px",
      marginBottom: "12px",
    };

    const labelInputStyle: React.CSSProperties = {
      ...modalInputStyle,
      width: "100px",
      flexShrink: 0,
      marginBottom: 0,
    };

    const valueInputStyle: React.CSSProperties = {
      ...modalInputStyle,
      flex: 1,
      marginBottom: 0,
    };

    return createElement(
      "div",
      { style: modalOverlayStyle, onClick: handleCancelInfoItemModal },
      createElement(
        "div",
        { style: { ...modalContentStyle, minWidth: "400px" }, onClick: (e: any) => e.stopPropagation() },
        createElement("div", { style: modalTitleStyle }, "编辑信息"),
        createElement(
          "div",
          { style: horizontalFormStyle },
          createElement("input", {
            type: "text",
            placeholder: "标签",
            value: editingInfoLabel,
            onChange: (e: any) => setEditingInfoLabel(e.target.value),
            style: labelInputStyle,
          }),
          createElement("span", { style: { color: "var(--orca-color-text-2)" } }, "："),
          createElement("input", {
            type: "text",
            placeholder: "内容（必填）",
            value: editingInfoValue,
            onChange: (e: any) => setEditingInfoValue(e.target.value),
            style: valueInputStyle,
            autoFocus: true,
            onKeyDown: (e: any) => {
              if (e.key === "Enter" && editingInfoValue.trim()) {
                handleSaveInfoItemModal();
              }
              if (e.key === "Escape") {
                handleCancelInfoItemModal();
              }
            },
          })
        ),
        createElement(
          "div",
          { style: { fontSize: "11px", color: "var(--orca-color-text-3)", marginBottom: "8px" } },
          "Enter 保存，Escape 取消"
        ),
        createElement(
          "div",
          { style: modalButtonsStyle },
          createElement(
            "button",
            {
              style: { ...modalBtnStyle, background: "var(--orca-color-bg-3)", color: "var(--orca-color-text-2)" },
              onClick: handleCancelInfoItemModal,
            },
            "取消"
          ),
          createElement(
            "button",
            {
              style: {
                ...modalBtnStyle,
                background: editingInfoValue.trim() ? "var(--orca-color-primary)" : "var(--orca-color-bg-3)",
                color: editingInfoValue.trim() ? "#fff" : "var(--orca-color-text-2)",
                cursor: editingInfoValue.trim() ? "pointer" : "not-allowed",
              },
              onClick: editingInfoValue.trim() ? handleSaveInfoItemModal : undefined,
            },
            "保存"
          )
        )
      )
    );
  };

  const hasContent = portrait && (portrait.tags.length > 0 || portrait.categories.length > 0);
  const tagCount = portrait?.tags.length || 0;
  const categoryCount = portrait?.categories.length || 0;

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
        createElement("i", { className: "ti ti-id-badge-2" }),
        "用户印象",
        hasContent &&
          createElement(
            "span",
            { style: { fontSize: "12px", color: "var(--orca-color-text-2)", fontWeight: 400 } },
            `(${tagCount}标签, ${categoryCount}分类)`
          )
      )
    ),
    // Card Body (hidden when collapsed)
    !isCollapsed &&
      createElement(
        "div",
        { style: cardBodyStyle },
        hasContent
          ? createElement(
              "div",
              null,
              renderTags(),
              renderCategories(),
              createElement("div", { style: { marginTop: "12px" } }, renderGenerateButton())
            )
          : createElement("div", null, renderEmptyState(), renderGenerateButton())
      ),
    // Info item edit modal
    renderInfoItemModal()
  );
}
