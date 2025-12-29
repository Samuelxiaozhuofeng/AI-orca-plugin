/**
 * InjectionModeSelector - 记忆注入模式选择器
 * 显示当前注入模式，支持选择具体用户或全部用户
 * 支持多选模式：可以选择多个用户的记忆进行注入
 * 支持预设：保存和加载用户选择预设
 * 使用紧凑网格布局，适合大量用户
 */

import type { InjectionMode, UserProfile, SelectionPreset } from "../../store/memory-store";
import { memoryStore, memoryStoreState } from "../../store/memory-store";

const React = window.React as unknown as {
  createElement: typeof window.React.createElement;
  useCallback: <T extends (...args: any[]) => any>(fn: T, deps: any[]) => T;
  useMemo: <T>(fn: () => T, deps: any[]) => T;
  useState: <T>(initial: T | (() => T)) => [T, (next: T | ((prev: T) => T)) => void];
};
const { createElement, useCallback, useMemo, useState } = React;

const { useSnapshot } = (window as any).Valtio as {
  useSnapshot: <T extends object>(obj: T) => T;
};

const { Button, ContextMenu } = orca.components;

// ============================================================================
// Styles
// ============================================================================

const selectorButtonStyle: React.CSSProperties = {
  padding: "4px",
  height: "24px",
  minWidth: "24px",
  fontSize: 14,
  color: "var(--orca-color-text-2)",
  borderRadius: "6px",
  background: "transparent",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "4px",
};

const menuContainerStyle: React.CSSProperties = {
  width: 280,
  maxHeight: 360,
  padding: 10,
  background: "var(--orca-color-bg-1)",
  display: "flex",
  flexDirection: "column",
};

const modeTabsStyle: React.CSSProperties = {
  display: "flex",
  background: "var(--orca-color-bg-2)",
  borderRadius: "8px",
  padding: "3px",
  marginBottom: "10px",
  flexShrink: 0,
};

const modeTabStyle = (isActive: boolean): React.CSSProperties => ({
  flex: 1,
  padding: "5px 6px",
  borderRadius: "6px",
  border: "none",
  background: isActive ? "var(--orca-color-bg-1)" : "transparent",
  color: isActive ? "var(--orca-color-primary)" : "var(--orca-color-text-2)",
  fontSize: "11px",
  fontWeight: isActive ? 500 : 400,
  cursor: "pointer",
  transition: "all 0.15s ease",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  gap: "3px",
  boxShadow: isActive ? "0 1px 3px rgba(0, 0, 0, 0.08)" : "none",
});

// 紧凑网格布局
const userGridStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "6px",
  maxHeight: "160px",
  overflowY: "auto",
  padding: "2px",
};

// 用户标签样式 - 紧凑 pill
const userPillStyle = (isSelected: boolean): React.CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  gap: "4px",
  padding: "4px 8px",
  borderRadius: "14px",
  border: isSelected 
    ? "1px solid var(--orca-color-primary)" 
    : "1px solid var(--orca-color-border)",
  background: isSelected ? "rgba(0, 123, 255, 0.1)" : "var(--orca-color-bg-2)",
  color: isSelected ? "var(--orca-color-primary)" : "var(--orca-color-text-2)",
  fontSize: "12px",
  cursor: "pointer",
  transition: "all 0.15s ease",
  whiteSpace: "nowrap",
});

const userPillEmojiStyle: React.CSSProperties = {
  fontSize: "13px",
};

const userPillNameStyle: React.CSSProperties = {
  maxWidth: "60px",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap",
};

const userPillBadgeStyle: React.CSSProperties = {
  fontSize: "9px",
  padding: "1px 4px",
  borderRadius: "6px",
  background: "var(--orca-color-bg-3)",
  color: "var(--orca-color-text-3)",
  marginLeft: "2px",
};

const actionBarStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  paddingTop: "8px",
  borderTop: "1px solid var(--orca-color-border)",
  marginTop: "8px",
  flexShrink: 0,
};

const actionButtonStyle: React.CSSProperties = {
  padding: "3px 6px",
  borderRadius: "4px",
  border: "none",
  background: "transparent",
  color: "var(--orca-color-text-2)",
  fontSize: "11px",
  cursor: "pointer",
  transition: "all 0.15s ease",
};

const selectedCountStyle: React.CSSProperties = {
  fontSize: "11px",
  color: "var(--orca-color-text-3)",
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: "10px",
  color: "var(--orca-color-text-3)",
  padding: "6px 2px 4px",
  fontWeight: 500,
  textTransform: "uppercase",
  letterSpacing: "0.5px",
  flexShrink: 0,
};

// 预设样式 - 更紧凑
const presetGridStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "4px",
  marginBottom: "6px",
};

const presetPillStyle = (isActive: boolean): React.CSSProperties => ({
  display: "inline-flex",
  alignItems: "center",
  gap: "4px",
  padding: "3px 8px",
  borderRadius: "10px",
  border: isActive 
    ? "1px solid var(--orca-color-primary)" 
    : "1px solid var(--orca-color-border)",
  background: isActive ? "rgba(0, 123, 255, 0.1)" : "var(--orca-color-bg-2)",
  color: isActive ? "var(--orca-color-primary)" : "var(--orca-color-text-2)",
  fontSize: "11px",
  cursor: "pointer",
  transition: "all 0.15s ease",
});

const presetDeleteStyle: React.CSSProperties = {
  padding: "0",
  border: "none",
  background: "transparent",
  color: "var(--orca-color-text-3)",
  fontSize: "10px",
  cursor: "pointer",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  opacity: 0.5,
  marginLeft: "2px",
  transition: "all 0.15s ease",
};

const savePresetRowStyle: React.CSSProperties = {
  display: "flex",
  gap: "4px",
  marginTop: "6px",
  paddingTop: "6px",
  borderTop: "1px solid var(--orca-color-border)",
  flexShrink: 0,
};

const savePresetInputStyle: React.CSSProperties = {
  flex: 1,
  padding: "4px 8px",
  borderRadius: "4px",
  border: "1px solid var(--orca-color-border)",
  background: "var(--orca-color-bg-2)",
  color: "var(--orca-color-text-1)",
  fontSize: "11px",
  outline: "none",
};

// ============================================================================
// Component
// ============================================================================

export default function InjectionModeSelector() {
  const snap = useSnapshot(memoryStoreState);
  const currentMode = snap.injectionMode;
  const users = snap.users as UserProfile[];
  const activeUserId = snap.activeUserId;
  const selectedUserIds = snap.selectedUserIds || [];
  const memories = snap.memories;
  const presets = (snap.selectionPresets || []) as SelectionPreset[];

  const [showSavePreset, setShowSavePreset] = useState(false);
  const [presetName, setPresetName] = useState("");

  // 只显示未禁用的用户
  const enabledUsers = useMemo(() => {
    return users.filter(u => !u.isDisabled);
  }, [users]);

  // 获取用户的记忆数量
  const getMemoryCount = useCallback((userId: string) => {
    return memories.filter(m => m.userId === userId).length;
  }, [memories]);

  // 获取显示图标和标签
  const { displayIcon } = useMemo(() => {
    if (currentMode === "ALL") {
      return { displayIcon: "ti-users" };
    }
    if (currentMode === "SELECTED") {
      return { displayIcon: "ti-list-check" };
    }
    return { displayIcon: "ti-user" };
  }, [currentMode]);

  const handleModeChange = useCallback((mode: InjectionMode) => {
    memoryStore.setInjectionMode(mode);
  }, []);

  const handleToggleUser = useCallback((userId: string) => {
    memoryStore.toggleUserSelection(userId);
  }, []);

  const handleSelectAll = useCallback(() => {
    memoryStore.selectAllUsers();
  }, []);

  const handleDeselectAll = useCallback(() => {
    memoryStore.deselectAllUsers();
  }, []);

  const handleSelectCurrentUser = useCallback((userId: string, close: () => void) => {
    memoryStore.setActiveUser(userId);
    memoryStore.setInjectionMode("CURRENT");
    close();
  }, []);

  const handleSavePreset = useCallback(() => {
    if (presetName.trim() && selectedUserIds.length > 0) {
      memoryStore.saveSelectionPreset(presetName.trim());
      setPresetName("");
      setShowSavePreset(false);
    }
  }, [presetName, selectedUserIds]);

  const handleLoadPreset = useCallback((presetId: string) => {
    memoryStore.loadSelectionPreset(presetId);
  }, []);

  const handleDeletePreset = useCallback((presetId: string, e: any) => {
    e.stopPropagation();
    memoryStore.deleteSelectionPreset(presetId);
  }, []);

  return createElement(
    ContextMenu as any,
    {
      defaultPlacement: "top",
      placement: "vertical",
      alignment: "left",
      allowBeyondContainer: true,
      offset: 8,
      menu: (close: () => void) =>
        createElement(
          "div",
          { style: menuContainerStyle },
          // Mode Tabs
          createElement(
            "div",
            { style: modeTabsStyle },
            createElement(
              "button",
              {
                style: modeTabStyle(currentMode === "ALL"),
                onClick: () => handleModeChange("ALL"),
                title: "注入所有用户的记忆",
              },
              createElement("i", { className: "ti ti-users", style: { fontSize: "11px" } }),
              "全部"
            ),
            createElement(
              "button",
              {
                style: modeTabStyle(currentMode === "CURRENT"),
                onClick: () => handleModeChange("CURRENT"),
                title: "只注入当前用户的记忆",
              },
              createElement("i", { className: "ti ti-user", style: { fontSize: "11px" } }),
              "当前"
            ),
            createElement(
              "button",
              {
                style: modeTabStyle(currentMode === "SELECTED"),
                onClick: () => handleModeChange("SELECTED"),
                title: "选择多个用户的记忆进行注入",
              },
              createElement("i", { className: "ti ti-list-check", style: { fontSize: "11px" } }),
              "多选"
            )
          ),

          // Presets (only in SELECTED mode)
          currentMode === "SELECTED" && presets.length > 0 && [
            createElement("div", { key: "preset-title", style: sectionTitleStyle }, "预设"),
            createElement(
              "div",
              { key: "preset-grid", style: presetGridStyle },
              ...presets.map(preset => {
                const isActive = preset.userIds.length === selectedUserIds.length &&
                  preset.userIds.every(id => selectedUserIds.includes(id));
                return createElement(
                  "div",
                  {
                    key: preset.id,
                    style: presetPillStyle(isActive),
                    onClick: () => handleLoadPreset(preset.id),
                    onMouseEnter: (e: any) => {
                      if (!isActive) {
                        e.currentTarget.style.background = "var(--orca-color-bg-3)";
                      }
                    },
                    onMouseLeave: (e: any) => {
                      e.currentTarget.style.background = isActive 
                        ? "rgba(0, 123, 255, 0.1)" 
                        : "var(--orca-color-bg-2)";
                    },
                  },
                  createElement("i", { className: "ti ti-bookmark", style: { fontSize: "10px" } }),
                  preset.name,
                  createElement(
                    "button",
                    {
                      style: presetDeleteStyle,
                      onClick: (e: any) => handleDeletePreset(preset.id, e),
                      title: "删除预设",
                      onMouseEnter: (e: any) => {
                        e.currentTarget.style.opacity = "1";
                        e.currentTarget.style.color = "var(--orca-color-danger, #dc3545)";
                      },
                      onMouseLeave: (e: any) => {
                        e.currentTarget.style.opacity = "0.5";
                        e.currentTarget.style.color = "var(--orca-color-text-3)";
                      },
                    },
                    createElement("i", { className: "ti ti-x" })
                  )
                );
              })
            ),
          ],

          // User section title
          (currentMode === "SELECTED" || currentMode === "CURRENT") && 
            createElement("div", { style: sectionTitleStyle }, "用户"),

          // User Grid - 紧凑网格布局
          createElement(
            "div",
            { style: userGridStyle },
            ...enabledUsers.map(user => {
              const memoryCount = getMemoryCount(user.id);
              
              let isSelected = false;
              let onClick: () => void;
              
              if (currentMode === "ALL") {
                isSelected = true;
                onClick = () => {};
              } else if (currentMode === "SELECTED") {
                isSelected = selectedUserIds.includes(user.id);
                onClick = () => handleToggleUser(user.id);
              } else {
                isSelected = user.id === activeUserId;
                onClick = () => handleSelectCurrentUser(user.id, close);
              }

              return createElement(
                "div",
                {
                  key: user.id,
                  style: userPillStyle(isSelected),
                  onClick: currentMode !== "ALL" ? onClick : undefined,
                  title: `${user.name} (${memoryCount}条记忆)`,
                  onMouseEnter: (e: any) => {
                    if (currentMode !== "ALL") {
                      e.currentTarget.style.borderColor = "var(--orca-color-primary)";
                      if (!isSelected) {
                        e.currentTarget.style.background = "var(--orca-color-bg-3)";
                      }
                    }
                  },
                  onMouseLeave: (e: any) => {
                    e.currentTarget.style.borderColor = isSelected 
                      ? "var(--orca-color-primary)" 
                      : "var(--orca-color-border)";
                    e.currentTarget.style.background = isSelected 
                      ? "rgba(0, 123, 255, 0.1)" 
                      : "var(--orca-color-bg-2)";
                  },
                },
                createElement("span", { style: userPillEmojiStyle }, user.emoji),
                createElement("span", { style: userPillNameStyle }, user.name),
                memoryCount > 0 && createElement(
                  "span",
                  { style: userPillBadgeStyle },
                  memoryCount
                )
              );
            })
          ),

          // Action Bar (only in SELECTED mode)
          currentMode === "SELECTED" && createElement(
            "div",
            { style: actionBarStyle },
            createElement(
              "span",
              { style: selectedCountStyle },
              `${selectedUserIds.length}/${enabledUsers.length}`
            ),
            createElement(
              "div",
              { style: { display: "flex", gap: "4px" } },
              createElement(
                "button",
                {
                  style: actionButtonStyle,
                  onClick: handleSelectAll,
                  onMouseEnter: (e: any) => {
                    e.currentTarget.style.background = "var(--orca-color-bg-2)";
                  },
                  onMouseLeave: (e: any) => {
                    e.currentTarget.style.background = "transparent";
                  },
                },
                "全选"
              ),
              createElement(
                "button",
                {
                  style: actionButtonStyle,
                  onClick: handleDeselectAll,
                  onMouseEnter: (e: any) => {
                    e.currentTarget.style.background = "var(--orca-color-bg-2)";
                  },
                  onMouseLeave: (e: any) => {
                    e.currentTarget.style.background = "transparent";
                  },
                },
                "清空"
              ),
              selectedUserIds.length > 0 && createElement(
                "button",
                {
                  style: { ...actionButtonStyle, color: "var(--orca-color-primary)" },
                  onClick: () => setShowSavePreset(true),
                  onMouseEnter: (e: any) => {
                    e.currentTarget.style.background = "var(--orca-color-bg-2)";
                  },
                  onMouseLeave: (e: any) => {
                    e.currentTarget.style.background = "transparent";
                  },
                  title: "保存为预设",
                },
                createElement("i", { className: "ti ti-bookmark-plus", style: { fontSize: "12px" } })
              )
            )
          ),

          // Save Preset Input
          currentMode === "SELECTED" && showSavePreset && createElement(
            "div",
            { style: savePresetRowStyle },
            createElement("input", {
              type: "text",
              placeholder: "预设名称...",
              value: presetName,
              onChange: (e: any) => setPresetName(e.target.value),
              style: savePresetInputStyle,
              autoFocus: true,
              onKeyDown: (e: any) => {
                if (e.key === "Enter") handleSavePreset();
                if (e.key === "Escape") {
                  setShowSavePreset(false);
                  setPresetName("");
                }
              },
            }),
            createElement(
              "button",
              {
                style: { ...actionButtonStyle, color: "var(--orca-color-primary)" },
                onClick: handleSavePreset,
                disabled: !presetName.trim(),
              },
              createElement("i", { className: "ti ti-check" })
            ),
            createElement(
              "button",
              {
                style: actionButtonStyle,
                onClick: () => {
                  setShowSavePreset(false);
                  setPresetName("");
                },
              },
              createElement("i", { className: "ti ti-x" })
            )
          )
        ),
    },
    (openMenu: (e: any) => void) =>
      createElement(
        Button,
        {
          variant: "plain",
          onClick: openMenu,
          title: `记忆注入模式`,
          style: selectorButtonStyle,
        },
        createElement("i", { className: `ti ${displayIcon}` }),
        currentMode === "SELECTED" && selectedUserIds.length > 0 && createElement(
          "span",
          { 
            style: { 
              fontSize: "11px", 
              color: "var(--orca-color-primary)",
              fontWeight: 500,
            } 
          },
          selectedUserIds.length
        )
      )
  );
}
