/**
 * Memory Manager - UI component for managing global memories
 * Redesigned with card-based layout structure
 * Supports multi-user profiles, memory CRUD, and user portraits
 * Requirements: 14.1, 14.5
 */

import {
  memoryStore,
  memoryStoreState,
  type UserProfile,
  type MemoryItem,
} from "../store/memory-store";
import { UserManagementCard } from "./memory-manager";
import { UserPortraitCard } from "./memory-manager";
import { MemoryCard } from "./memory-manager";
import { withTooltip } from "../utils/orca-tooltip";
import {
  modalOverlayStyle,
  modalStyle,
  modalTitleStyle,
  modalButtonsStyle,
  cancelButtonStyle,
  dangerButtonStyle,
  emojiPickerOverlayStyle,
  emojiPickerContainerStyle,
  emojiPickerTitleStyle,
  emojiGridStyle,
  emojiItemStyle,
  emojiInputContainerStyle,
  emojiInputStyle,
  iconButtonStyle,
} from "./memory-manager/card-styles";

const React = window.React as unknown as {
  createElement: typeof window.React.createElement;
  useState: <T>(initial: T | (() => T)) => [T, (next: T | ((prev: T) => T)) => void];
  useEffect: (fn: () => void | (() => void), deps: any[]) => void;
  useRef: <T>(value: T) => { current: T };
  useCallback: <T extends (...args: any[]) => any>(fn: T, deps: any[]) => T;
  useMemo: <T>(fn: () => T, deps: any[]) => T;
};
const { createElement, useState, useEffect, useRef, useCallback, useMemo } = React;

const { useSnapshot } = (window as any).Valtio as {
  useSnapshot: <T extends object>(obj: T) => T;
};
const { Button } = orca.components;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface MemoryManagerProps {
  onBack: () => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Styles
// ─────────────────────────────────────────────────────────────────────────────

const containerStyle: React.CSSProperties = {
  height: "100%",
  width: "100%",
  display: "flex",
  flexDirection: "column",
  background: "var(--orca-color-bg-1)",
  color: "var(--orca-color-text-1)",
};

const headerStyle: React.CSSProperties = {
  padding: "12px 16px",
  display: "flex",
  alignItems: "center",
  gap: 12,
  borderBottom: "1px solid var(--orca-color-border)",
  background: "var(--orca-color-bg-1)",
};

const headerTitleStyle: React.CSSProperties = {
  fontWeight: 600,
  fontSize: "16px",
  flex: 1,
  display: "flex",
  alignItems: "center",
  gap: "8px",
};

const betaBadgeStyle: React.CSSProperties = {
  fontSize: "10px",
  padding: "2px 6px",
  borderRadius: "4px",
  background: "var(--orca-color-bg-3)",
  border: "1px solid var(--orca-color-border)",
  color: "var(--orca-color-text-2)",
  fontWeight: 500,
};

const contentStyle: React.CSSProperties = {
  flex: 1,
  overflow: "auto",
  padding: "16px",
};

// Common emoji list for picker
const COMMON_EMOJIS = [
  "😀", "😊", "🙂", "😎", "🤓", "🧐", "🤔", "😇",
  "👤", "👨", "👩", "🧑", "👦", "👧", "🧒", "👴",
  "👵", "🐱", "🐶", "🐼", "🦊", "🐰", "🐻", "🦁",
  "🌟", "⭐", "🔥", "💎", "🎯", "🎨", "🎭", "🎪",
  "📚", "💻", "🎮", "🎵", "🎬", "📷", "✈️", "🚀",
];

// ─────────────────────────────────────────────────────────────────────────────
// Main Component
// ─────────────────────────────────────────────────────────────────────────────

export default function MemoryManager({ onBack }: MemoryManagerProps) {
  const storeSnap = useSnapshot(memoryStoreState);
  
  // Internal state
  const [searchKeyword, setSearchKeyword] = useState("");
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<string | null>(null);
  const [deleteType, setDeleteType] = useState<'user' | 'memory' | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [customEmoji, setCustomEmoji] = useState("");
  const [isGeneratingPortrait, setIsGeneratingPortrait] = useState(false);
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  // Abort controller for cancelling portrait generation
  const portraitAbortRef = useRef<AbortController | null>(null);
  // Tag editing state
  const [showTagEditor, setShowTagEditor] = useState(false);
  const [tagEditorMode, setTagEditorMode] = useState<'add' | 'edit'>('add');
  const [tagEditorEmoji, setTagEditorEmoji] = useState("");
  const [tagEditorLabel, setTagEditorLabel] = useState("");
  const [showTagEmojiPicker, setShowTagEmojiPicker] = useState(false);
  // Track newly added tags for highlighting
  const [newTagIds, setNewTagIds] = useState<Set<string>>(new Set());

  // Get active user and their memories
  const activeUser = useMemo(() => {
    return storeSnap.users.find(u => u.id === storeSnap.activeUserId);
  }, [storeSnap.users, storeSnap.activeUserId]);

  const userMemories = useMemo(() => {
    return storeSnap.memories.filter(m => m.userId === storeSnap.activeUserId);
  }, [storeSnap.memories, storeSnap.activeUserId]);

  // Filter memories by search keyword
  const filteredMemories = useMemo(() => {
    if (!searchKeyword.trim()) return userMemories;
    const keyword = searchKeyword.toLowerCase();
    return userMemories.filter(m => m.content.toLowerCase().includes(keyword));
  }, [userMemories, searchKeyword]);

  // Get user portrait
  const userPortrait = useMemo(() => {
    return storeSnap.portraits.find(p => p.userId === storeSnap.activeUserId);
  }, [storeSnap.portraits, storeSnap.activeUserId]);

  // Statistics
  const totalCount = userMemories.length;
  const enabledCount = userMemories.filter(m => m.isEnabled).length;

  // ─────────────────────────────────────────────────────────────────────────
  // User Management Handlers
  // ─────────────────────────────────────────────────────────────────────────

  const handleUserChange = useCallback((userId: string) => {
    memoryStore.setActiveUser(userId);
    setSearchKeyword("");
  }, []);

  const handleAddUser = useCallback((name: string) => {
    const user = memoryStore.createUser(name);
    if (user) {
      memoryStore.setActiveUser(user.id);
    }
  }, []);

  const handleEditUser = useCallback((id: string, name: string) => {
    memoryStore.updateUser(id, name);
  }, []);

  const handleDeleteUserClick = useCallback((id: string) => {
    setShowDeleteConfirm(id);
    setDeleteType('user');
  }, []);

  const handleConfirmDeleteUser = useCallback(() => {
    if (showDeleteConfirm && deleteType === 'user') {
      memoryStore.deleteUser(showDeleteConfirm);
      setShowDeleteConfirm(null);
      setDeleteType(null);
    }
  }, [showDeleteConfirm, deleteType]);

  // ─────────────────────────────────────────────────────────────────────────
  // Emoji Picker Handlers
  // ─────────────────────────────────────────────────────────────────────────

  const handleAvatarClick = useCallback(() => {
    setShowEmojiPicker(true);
    setCustomEmoji("");
  }, []);

  const handleSelectEmoji = useCallback((emoji: string) => {
    if (activeUser) {
      memoryStore.updateUserEmoji(activeUser.id, emoji);
      setShowEmojiPicker(false);
      setCustomEmoji("");
    }
  }, [activeUser]);

  const handleCustomEmojiSubmit = useCallback(() => {
    if (customEmoji.trim() && activeUser) {
      memoryStore.updateUserEmoji(activeUser.id, customEmoji.trim());
      setShowEmojiPicker(false);
      setCustomEmoji("");
    }
  }, [customEmoji, activeUser]);

  const handleCloseEmojiPicker = useCallback(() => {
    setShowEmojiPicker(false);
    setCustomEmoji("");
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Memory Management Handlers
  // ─────────────────────────────────────────────────────────────────────────

  const handleAddMemory = useCallback((content: string) => {
    memoryStore.addMemory(content);
  }, []);

  const handleEditMemory = useCallback((id: string, content: string) => {
    memoryStore.updateMemory(id, content);
  }, []);

  const handleDeleteMemoryClick = useCallback((id: string) => {
    setShowDeleteConfirm(id);
    setDeleteType('memory');
  }, []);

  const handleConfirmDeleteMemory = useCallback(() => {
    if (showDeleteConfirm && deleteType === 'memory') {
      memoryStore.deleteMemory(showDeleteConfirm);
      setShowDeleteConfirm(null);
      setDeleteType(null);
    }
  }, [showDeleteConfirm, deleteType]);

  const handleToggleMemory = useCallback((id: string) => {
    memoryStore.toggleMemory(id);
  }, []);

  const handleToggleExtracted = useCallback((id: string) => {
    memoryStore.toggleMemoryExtracted(id);
  }, []);

  const handleCancelDelete = useCallback(() => {
    setShowDeleteConfirm(null);
    setDeleteType(null);
  }, []);

  // ─────────────────────────────────────────────────────────────────────────
  // Portrait Deduplication Helper
  // ─────────────────────────────────────────────────────────────────────────

  // Filter out duplicate tags and category items, and merge categories with same title
  const deduplicatePortrait = useCallback((newPortrait: any, existingPortrait: typeof userPortrait) => {
    if (!existingPortrait) return newPortrait;
    
    // Filter tags
    const filteredTags = (newPortrait.tags || []).filter((tag: any) => {
      const normalizedLabel = tag.label.toLowerCase().replace(/\s+/g, '');
      return !existingPortrait.tags.some(existingTag => {
        const existingLabel = existingTag.label.toLowerCase().replace(/\s+/g, '');
        return normalizedLabel.includes(existingLabel) || existingLabel.includes(normalizedLabel);
      });
    });
    
    // Process categories - merge items into existing categories with same title
    const mergedCategories: typeof existingPortrait.categories = [...existingPortrait.categories];
    
    for (const newCategory of (newPortrait.categories || [])) {
      // Filter out duplicate items
      const filteredItems = (newCategory.items || []).filter((item: any) => {
        const normalizedValue = item.value.toLowerCase().replace(/\s+/g, '');
        // Check against all existing category items
        for (const existingCategory of existingPortrait.categories) {
          for (const existingItem of existingCategory.items) {
            const existingValue = existingItem.value.toLowerCase().replace(/\s+/g, '');
            if (normalizedValue.includes(existingValue) || existingValue.includes(normalizedValue)) {
              return false;
            }
          }
        }
        return true;
      });
      
      if (filteredItems.length === 0) continue;
      
      // Find existing category with same title (case-insensitive)
      const normalizedTitle = newCategory.title.toLowerCase().replace(/\s+/g, '');
      const existingCategoryIndex = mergedCategories.findIndex(c => 
        c.title.toLowerCase().replace(/\s+/g, '') === normalizedTitle
      );
      
      if (existingCategoryIndex >= 0) {
        // Merge items into existing category
        mergedCategories[existingCategoryIndex] = {
          ...mergedCategories[existingCategoryIndex],
          items: [...mergedCategories[existingCategoryIndex].items, ...filteredItems],
        };
      } else {
        // Add as new category
        mergedCategories.push({ ...newCategory, items: filteredItems });
      }
    }
    
    // Return only the new tags and the difference in categories
    const newCategoriesOnly = mergedCategories.slice(existingPortrait.categories.length);
    const updatedExistingCategories = mergedCategories.slice(0, existingPortrait.categories.length);
    
    return { 
      tags: filteredTags, 
      categories: newCategoriesOnly,
      updatedCategories: updatedExistingCategories,
    };
  }, []);

  // Generate portrait from a single memory
  const handleRegeneratePortraitFromMemory = useCallback(async (memoryId: string) => {
    if (!activeUser) return;
    
    const memory = userMemories.find(m => m.id === memoryId);
    if (!memory) return;

    // Cancel any existing generation
    if (portraitAbortRef.current) {
      portraitAbortRef.current.abort();
    }
    
    // Create new abort controller
    const abortController = new AbortController();
    portraitAbortRef.current = abortController;

    setIsGeneratingPortrait(true);
    try {
      const { generatePortrait } = await import("../services/portrait-generation");
      const result = await generatePortrait([memory], abortController.signal);
      
      // Check if aborted
      if (abortController.signal.aborted) {
        return;
      }
      
      if (result.success && result.portrait) {
        // Merge new tags and categories with existing portrait, with deduplication
        const existingPortrait = userPortrait;
        const deduped = deduplicatePortrait(result.portrait, existingPortrait);
        
        // Check if there's any new content or updates
        const hasNewContent = deduped.tags.length > 0 || deduped.categories.length > 0;
        const hasUpdates = deduped.updatedCategories?.some((cat: any, idx: number) => 
          cat.items.length > (existingPortrait?.categories[idx]?.items.length || 0)
        );
        
        if (hasNewContent || hasUpdates) {
          // Use updated categories (with merged items) + new categories
          const finalCategories = [
            ...(deduped.updatedCategories || existingPortrait?.categories || []),
            ...deduped.categories,
          ];
          
          memoryStore.updatePortrait(activeUser.id, {
            tags: [...(existingPortrait?.tags || []), ...deduped.tags],
            categories: finalCategories,
          });
        } else {
          // Notify user that content already exists
          if (typeof orca !== "undefined" && orca.notify) {
            orca.notify("info", "该信息已存在于印象中");
          }
        }
        
        // Mark the memory as extracted
        memoryStore.markMemoryAsExtracted(memoryId);
      } else if (result.error) {
        if (typeof orca !== "undefined" && orca.notify) {
          orca.notify("error", result.error);
        }
      }
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        console.log("[MemoryManager] Portrait generation cancelled");
        return;
      }
      console.error("[MemoryManager] Failed to generate portrait from memory:", error);
    } finally {
      if (!abortController.signal.aborted) {
        setIsGeneratingPortrait(false);
      }
      portraitAbortRef.current = null;
    }
  }, [activeUser, userMemories, userPortrait, deduplicatePortrait]);

  // ─────────────────────────────────────────────────────────────────────────
  // Portrait Handlers
  // ─────────────────────────────────────────────────────────────────────────

  // Cancel portrait generation
  const handleCancelPortraitGeneration = useCallback(() => {
    if (portraitAbortRef.current) {
      portraitAbortRef.current.abort();
      portraitAbortRef.current = null;
    }
    setIsGeneratingPortrait(false);
  }, []);

  const handleGeneratePortrait = useCallback(async () => {
    if (!activeUser || userMemories.length === 0) return;
    
    // Cancel any existing generation
    if (portraitAbortRef.current) {
      portraitAbortRef.current.abort();
    }
    
    // Create new abort controller
    const abortController = new AbortController();
    portraitAbortRef.current = abortController;
    
    setIsGeneratingPortrait(true);
    // Clear new tag highlights when generating fresh
    setNewTagIds(new Set());
    try {
      // Import and use portrait generation service
      const { generatePortrait } = await import("../services/portrait-generation");
      const result = await generatePortrait(userMemories, abortController.signal);
      
      // Check if aborted
      if (abortController.signal.aborted) {
        return;
      }
      
      if (result.success && result.portrait) {
        memoryStore.updatePortrait(activeUser.id, {
          tags: result.portrait.tags,
          categories: result.portrait.categories,
        });
      } else if (result.error) {
        console.warn("[MemoryManager] Portrait generation failed:", result.error);
        if (typeof orca !== "undefined" && orca.notify) {
          orca.notify("error", result.error);
        }
      }
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        console.log("[MemoryManager] Portrait generation cancelled");
        return;
      }
      console.error("[MemoryManager] Failed to generate portrait:", error);
    } finally {
      if (!abortController.signal.aborted) {
        setIsGeneratingPortrait(false);
      }
      portraitAbortRef.current = null;
    }
  }, [activeUser, userMemories]);

  // Refresh AI impression - regenerate based on current portrait categories
  const handleRefreshAIImpression = useCallback(async () => {
    if (!activeUser || !userPortrait || userPortrait.categories.length === 0) {
      if (typeof orca !== "undefined" && orca.notify) {
        orca.notify("warn", "请先添加分类信息后再刷新 AI 印象");
      }
      return;
    }
    
    // Cancel any existing generation
    if (portraitAbortRef.current) {
      portraitAbortRef.current.abort();
    }
    
    // Create new abort controller
    const abortController = new AbortController();
    portraitAbortRef.current = abortController;
    
    setIsGeneratingPortrait(true);
    try {
      const { refreshPortraitFromCategories } = await import("../services/portrait-generation");
      const result = await refreshPortraitFromCategories(
        userPortrait.categories,
        userPortrait.tags,
        abortController.signal
      );
      
      if (abortController.signal.aborted) {
        return;
      }
      
      if (result.success && result.portrait && result.portrait.tags.length > 0) {
        // Track new tag IDs for highlighting
        const newIds = new Set<string>();
        
        // Filter out duplicate tags
        const existingLabels = new Set(userPortrait.tags.map(t => t.label.toLowerCase()));
        const newTags = result.portrait.tags.filter(tag => 
          !existingLabels.has(tag.label.toLowerCase())
        );
        
        if (newTags.length > 0) {
          newTags.forEach(tag => newIds.add(tag.id));
          
          memoryStore.updatePortrait(activeUser.id, {
            tags: [...userPortrait.tags, ...newTags],
            categories: userPortrait.categories,
          });
          
          setNewTagIds(newIds);
          
          if (typeof orca !== "undefined" && orca.notify) {
            orca.notify("success", `已更新 AI 印象，新增 ${newTags.length} 个标签`);
          }
        } else {
          if (typeof orca !== "undefined" && orca.notify) {
            orca.notify("info", "AI 印象已是最新，无需更新");
          }
        }
      } else if (result.error) {
        if (typeof orca !== "undefined" && orca.notify) {
          orca.notify("error", result.error);
        }
      }
    } catch (error: any) {
      if (error?.name === 'AbortError') {
        console.log("[MemoryManager] AI impression refresh cancelled");
        return;
      }
      console.error("[MemoryManager] Failed to refresh AI impression:", error);
    } finally {
      if (!abortController.signal.aborted) {
        setIsGeneratingPortrait(false);
      }
      portraitAbortRef.current = null;
    }
  }, [activeUser, userPortrait]);

  const handleEditTag = useCallback((tagId: string) => {
    if (!userPortrait) return;
    const tag = userPortrait.tags.find(t => t.id === tagId);
    if (tag) {
      setEditingTagId(tagId);
      setTagEditorEmoji(tag.emoji);
      setTagEditorLabel(tag.label);
      setTagEditorMode('edit');
      setShowTagEditor(true);
    }
  }, [userPortrait]);

  const handleDeleteTag = useCallback((tagId: string) => {
    if (activeUser) {
      memoryStore.deletePortraitTag(activeUser.id, tagId);
    }
  }, [activeUser]);

  const handleUpdateTagLabel = useCallback((tagId: string, label: string) => {
    if (activeUser) {
      memoryStore.updatePortraitTag(activeUser.id, tagId, { label });
    }
  }, [activeUser]);

  const handleEditInfoItem = useCallback((categoryId: string, itemId: string, label: string, value: string) => {
    // Info item editing is now handled inline in UserPortraitCard
    // This callback is kept for direct store updates from inline editing
    if (activeUser) {
      memoryStore.updatePortraitInfoItem(activeUser.id, categoryId, itemId, {
        label,
        value,
      });
    }
  }, [activeUser]);

  const handleDeleteInfoItem = useCallback((categoryId: string, itemId: string) => {
    if (activeUser) {
      memoryStore.deletePortraitInfoItem(activeUser.id, categoryId, itemId);
    }
  }, [activeUser]);

  const handleAddTag = useCallback(() => {
    setEditingTagId(null);
    setTagEditorEmoji("😀");
    setTagEditorLabel("");
    setTagEditorMode('add');
    setShowTagEditor(true);
  }, []);

  // Category management handlers
  const handleAddCategory = useCallback((title: string) => {
    if (activeUser) {
      memoryStore.addPortraitCategory(activeUser.id, title);
    }
  }, [activeUser]);

  const handleEditCategoryTitle = useCallback((categoryId: string, title: string) => {
    if (activeUser) {
      memoryStore.updatePortraitCategoryTitle(activeUser.id, categoryId, title);
    }
  }, [activeUser]);

  const handleDeleteCategory = useCallback((categoryId: string) => {
    if (activeUser) {
      memoryStore.deletePortraitCategory(activeUser.id, categoryId);
    }
  }, [activeUser]);

  const handleAddInfoItem = useCallback((categoryId: string, label: string, value: string) => {
    if (activeUser) {
      memoryStore.addPortraitInfoItem(activeUser.id, categoryId, label, value);
    }
  }, [activeUser]);

  // Tag editor handlers
  const handleTagEditorSave = useCallback(() => {
    if (!activeUser || !tagEditorEmoji || !tagEditorLabel.trim()) return;
    
    if (tagEditorMode === 'add') {
      memoryStore.addPortraitTag(activeUser.id, {
        emoji: tagEditorEmoji,
        label: tagEditorLabel.trim(),
      });
    } else if (editingTagId) {
      memoryStore.updatePortraitTag(activeUser.id, editingTagId, {
        emoji: tagEditorEmoji,
        label: tagEditorLabel.trim(),
      });
    }
    
    setShowTagEditor(false);
    setEditingTagId(null);
    setTagEditorEmoji("");
    setTagEditorLabel("");
  }, [activeUser, tagEditorMode, editingTagId, tagEditorEmoji, tagEditorLabel]);

  const handleTagEditorCancel = useCallback(() => {
    setShowTagEditor(false);
    setEditingTagId(null);
    setTagEditorEmoji("");
    setTagEditorLabel("");
    setShowTagEmojiPicker(false);
  }, []);

  const handleTagEmojiSelect = useCallback((emoji: string) => {
    setTagEditorEmoji(emoji);
    setShowTagEmojiPicker(false);
  }, []);

  // InfoItem reorder and value management handlers
  const handleReorderInfoItems = useCallback((categoryId: string, itemIds: string[]) => {
    if (activeUser) {
      memoryStore.reorderPortraitInfoItems(activeUser.id, categoryId, itemIds);
    }
  }, [activeUser]);

  const handleAddInfoItemValue = useCallback((categoryId: string, itemId: string, value: string) => {
    if (activeUser) {
      memoryStore.addPortraitInfoItemValue(activeUser.id, categoryId, itemId, value);
    }
  }, [activeUser]);

  const handleRemoveInfoItemValue = useCallback((categoryId: string, itemId: string, valueIndex: number) => {
    if (activeUser) {
      memoryStore.removePortraitInfoItemValue(activeUser.id, categoryId, itemId, valueIndex);
    }
  }, [activeUser]);

  const handleUpdateInfoItemValue = useCallback((categoryId: string, itemId: string, valueIndex: number, newValue: string) => {
    if (activeUser) {
      memoryStore.updatePortraitInfoItemValue(activeUser.id, categoryId, itemId, valueIndex, newValue);
    }
  }, [activeUser]);

  const handleReorderCategories = useCallback((categoryIds: string[]) => {
    if (activeUser) {
      memoryStore.reorderPortraitCategories(activeUser.id, categoryIds);
    }
  }, [activeUser]);


  // ─────────────────────────────────────────────────────────────────────────
  // Render Helpers
  // ─────────────────────────────────────────────────────────────────────────

  const renderHeader = () => {
    return createElement(
      "div",
      { style: headerStyle },
      withTooltip(
        "返回",
        createElement(
          Button,
          {
            variant: "plain",
            onClick: onBack,
          },
          createElement("i", { className: "ti ti-arrow-left" })
        )
      ),
      createElement(
        "div",
        { style: headerTitleStyle },
        "记忆管理",
        createElement("span", { style: betaBadgeStyle }, "Beta")
      )
    );
  };

  const renderDeleteConfirmModal = () => {
    if (!showDeleteConfirm) return null;

    const isUserDelete = deleteType === 'user';
    const title = isUserDelete ? "删除用户" : "删除记忆";
    const message = isUserDelete
      ? "确定要删除此用户吗？该用户的所有记忆也将被删除。此操作无法撤销。"
      : "确定要删除此记忆吗？此操作无法撤销。";

    return createElement(
      "div",
      { style: modalOverlayStyle, onClick: handleCancelDelete },
      createElement(
        "div",
        {
          style: modalStyle,
          onClick: (e: any) => e.stopPropagation(),
        },
        createElement("div", { style: modalTitleStyle }, title),
        createElement("div", { style: { color: "var(--orca-color-text-2)" } }, message),
        createElement(
          "div",
          { style: modalButtonsStyle },
          createElement(
            "button",
            { style: cancelButtonStyle, onClick: handleCancelDelete },
            "取消"
          ),
          createElement(
            "button",
            {
              style: dangerButtonStyle,
              onClick: isUserDelete ? handleConfirmDeleteUser : handleConfirmDeleteMemory,
            },
            "删除"
          )
        )
      )
    );
  };

  const renderEmojiPicker = () => {
    if (!showEmojiPicker) return null;

    return createElement(
      "div",
      { style: emojiPickerOverlayStyle, onClick: handleCloseEmojiPicker },
      createElement(
        "div",
        {
          style: emojiPickerContainerStyle,
          onClick: (e: any) => e.stopPropagation(),
        },
        createElement("div", { style: emojiPickerTitleStyle }, "选择头像"),
        createElement(
          "div",
          { style: emojiGridStyle },
          COMMON_EMOJIS.map((emoji) =>
            createElement(
              "div",
              {
                key: emoji,
                style: emojiItemStyle,
                onClick: () => handleSelectEmoji(emoji),
                onMouseEnter: (e: any) => {
                  e.currentTarget.style.background = "var(--orca-color-bg-3)";
                },
                onMouseLeave: (e: any) => {
                  e.currentTarget.style.background = "transparent";
                },
              },
              emoji
            )
          )
        ),
        createElement(
          "div",
          { style: emojiInputContainerStyle },
          createElement("input", {
            type: "text",
            placeholder: "输入自定义字符...",
            value: customEmoji,
            onChange: (e: any) => setCustomEmoji(e.target.value),
            style: emojiInputStyle,
            maxLength: 2,
            onKeyDown: (e: any) => {
              if (!(e.nativeEvent?.isComposing || e.keyCode === 229) && e.key === "Enter") handleCustomEmojiSubmit();
            },
          }),
          withTooltip(
            "确认",
            createElement(
              "button",
              {
                style: { ...iconButtonStyle, color: "var(--orca-color-primary)" },
                onClick: handleCustomEmojiSubmit,
              },
              createElement("i", { className: "ti ti-check" })
            )
          )
        )
      )
    );
  };

  const renderTagEditor = () => {
    if (!showTagEditor) return null;

    const title = tagEditorMode === 'add' ? "添加印象标签" : "编辑印象标签";

    return createElement(
      "div",
      { style: modalOverlayStyle, onClick: handleTagEditorCancel },
      createElement(
        "div",
        {
          style: { ...modalStyle, minWidth: "360px" },
          onClick: (e: any) => e.stopPropagation(),
        },
        createElement("div", { style: modalTitleStyle }, title),
        // Emoji selector
        createElement(
          "div",
          { style: { marginBottom: "16px" } },
          createElement("div", { style: { fontSize: "13px", color: "var(--orca-color-text-2)", marginBottom: "8px" } }, "选择 Emoji"),
          createElement(
            "div",
            { style: { display: "flex", alignItems: "center", gap: "12px" } },
            withTooltip(
              "选择 Emoji",
              createElement(
                "button",
                {
                  style: {
                    width: "48px",
                    height: "48px",
                    borderRadius: "8px",
                    border: "1px solid var(--orca-color-border)",
                    background: "var(--orca-color-bg-2)",
                    fontSize: "24px",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  },
                  onClick: () => setShowTagEmojiPicker(!showTagEmojiPicker),
                },
                tagEditorEmoji || "😊"
              )
            ),
            showTagEmojiPicker && createElement(
              "div",
              {
                style: {
                  position: "absolute",
                  marginTop: "200px",
                  marginLeft: "60px",
                  background: "var(--orca-color-bg-1)",
                  borderRadius: "8px",
                  padding: "12px",
                  boxShadow: "0 4px 16px rgba(0, 0, 0, 0.2)",
                  zIndex: 1001,
                },
              },
              createElement(
                "div",
                { style: { ...emojiGridStyle, maxHeight: "150px", width: "240px" } },
                COMMON_EMOJIS.map((emoji) =>
                  createElement(
                    "div",
                    {
                      key: emoji,
                      style: emojiItemStyle,
                      onClick: () => handleTagEmojiSelect(emoji),
                      onMouseEnter: (e: any) => {
                        e.currentTarget.style.background = "var(--orca-color-bg-3)";
                      },
                      onMouseLeave: (e: any) => {
                        e.currentTarget.style.background = "transparent";
                      },
                    },
                    emoji
                  )
                )
              )
            )
          )
        ),
        // Label input
        createElement(
          "div",
          { style: { marginBottom: "16px" } },
          createElement("div", { style: { fontSize: "13px", color: "var(--orca-color-text-2)", marginBottom: "8px" } }, "标签描述"),
          createElement("input", {
            type: "text",
            placeholder: "输入标签描述（2-6字）...",
            value: tagEditorLabel,
            onChange: (e: any) => setTagEditorLabel(e.target.value),
            style: {
              ...emojiInputStyle,
              width: "100%",
              boxSizing: "border-box",
            },
            maxLength: 10,
            onKeyDown: (e: any) => {
              if (!(e.nativeEvent?.isComposing || e.keyCode === 229) && e.key === "Enter" && tagEditorLabel.trim()) handleTagEditorSave();
            },
          })
        ),
        // Buttons
        createElement(
          "div",
          { style: modalButtonsStyle },
          createElement(
            "button",
            { style: cancelButtonStyle, onClick: handleTagEditorCancel },
            "取消"
          ),
          createElement(
            "button",
            {
              style: {
                ...cancelButtonStyle,
                background: tagEditorLabel.trim() ? "var(--orca-color-bg-3)" : "var(--orca-color-bg-2)",
                color: "var(--orca-color-text-1)",
                border: "1px solid var(--orca-color-border)",
                opacity: tagEditorLabel.trim() ? 1 : 0.5,
                cursor: tagEditorLabel.trim() ? "pointer" : "not-allowed",
              },
              onClick: tagEditorLabel.trim() ? handleTagEditorSave : undefined,
              disabled: !tagEditorLabel.trim(),
            },
            "保存"
          )
        )
      )
    );
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Main Render
  // ─────────────────────────────────────────────────────────────────────────

  return createElement(
    "div",
    { style: containerStyle },
    renderHeader(),
    createElement(
      "div",
      { style: contentStyle },
      // User Management Card
      createElement(UserManagementCard, {
        users: storeSnap.users as UserProfile[],
        activeUser: activeUser as UserProfile | undefined,
        activeUserId: storeSnap.activeUserId,
        totalMemoryCount: totalCount,
        enabledMemoryCount: enabledCount,
        onUserChange: handleUserChange,
        onAddUser: handleAddUser,
        onEditUser: handleEditUser,
        onDeleteUser: handleDeleteUserClick,
        onAvatarClick: handleAvatarClick,
        onSetAsSelf: (id: string | null) => memoryStore.setUserAsSelf(id),
        onToggleUserDisabled: (id: string) => memoryStore.toggleUserDisabled(id),
        getMemoryCountForUser: (userId: string) => storeSnap.memories.filter(m => m.userId === userId).length,
      }),
      // User Portrait Card
      createElement(UserPortraitCard, {
        portrait: userPortrait,
        hasMemories: userMemories.length > 0,
        isGenerating: isGeneratingPortrait,
        onGeneratePortrait: handleGeneratePortrait,
        onCancelGeneration: handleCancelPortraitGeneration,
        onEditTag: handleEditTag,
        onUpdateTagLabel: handleUpdateTagLabel,
        onDeleteTag: handleDeleteTag,
        onEditInfoItem: handleEditInfoItem,
        onDeleteInfoItem: handleDeleteInfoItem,
        onAddTag: handleAddTag,
        onAddCategory: handleAddCategory,
        onEditCategoryTitle: handleEditCategoryTitle,
        onDeleteCategory: handleDeleteCategory,
        onAddInfoItem: handleAddInfoItem,
        onReorderInfoItems: handleReorderInfoItems,
        onAddInfoItemValue: handleAddInfoItemValue,
        onRemoveInfoItemValue: handleRemoveInfoItemValue,
        onUpdateInfoItemValue: handleUpdateInfoItemValue,
        onReorderCategories: handleReorderCategories,
        onRefreshAIImpression: handleRefreshAIImpression,
        newTagIds: newTagIds,
      }),
      // Memory Card
      createElement(MemoryCard, {
        memories: filteredMemories as MemoryItem[],
        searchKeyword,
        onSearchChange: setSearchKeyword,
        onAddMemory: handleAddMemory,
        onEditMemory: handleEditMemory,
        onDeleteMemory: handleDeleteMemoryClick,
        onToggleMemory: handleToggleMemory,
        onToggleExtracted: handleToggleExtracted,
        onRegeneratePortrait: handleRegeneratePortraitFromMemory,
      })
    ),
    renderDeleteConfirmModal(),
    renderEmojiPicker(),
    renderTagEditor()
  );
}
