/**
 * InjectionModeSelector - 记忆注入模式选择器
 * 显示当前注入模式，支持选择具体用户或全部用户
 * 位于聊天输入区域，与模型选择器并排
 */

import type { InjectionMode, UserProfile } from "../../store/memory-store";
import { memoryStore, memoryStoreState } from "../../store/memory-store";

const React = window.React as unknown as {
  createElement: typeof window.React.createElement;
  useCallback: <T extends (...args: any[]) => any>(fn: T, deps: any[]) => T;
  useMemo: <T>(fn: () => T, deps: any[]) => T;
};
const { createElement, useCallback, useMemo } = React;

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
  width: "24px",
  fontSize: 14,
  color: "var(--orca-color-text-2)",
  borderRadius: "6px",
  background: "transparent",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};

const menuContainerStyle: React.CSSProperties = {
  minWidth: 160,
  padding: 8,
  background: "var(--orca-color-bg-1)",
};

const menuItemStyle = (isSelected: boolean): React.CSSProperties => ({
  display: "flex",
  alignItems: "center",
  gap: 8,
  padding: "8px 12px",
  borderRadius: 6,
  cursor: "pointer",
  background: isSelected ? "var(--orca-color-bg-3)" : "transparent",
  color: isSelected ? "var(--orca-color-primary)" : "var(--orca-color-text-1)",
  transition: "background 0.15s ease",
});

const menuItemIconStyle: React.CSSProperties = {
  fontSize: 14,
  width: 18,
  textAlign: "center",
};

const menuItemLabelStyle: React.CSSProperties = {
  flex: 1,
  fontSize: 13,
};

const menuItemDescStyle: React.CSSProperties = {
  fontSize: 11,
  color: "var(--orca-color-text-3)",
  marginTop: 2,
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 11,
  color: "var(--orca-color-text-3)",
  padding: "8px 12px 4px",
  fontWeight: 500,
};

const dividerStyle: React.CSSProperties = {
  height: 1,
  background: "var(--orca-color-border)",
  margin: "8px 0",
};

// ============================================================================
// Component
// ============================================================================

export default function InjectionModeSelector() {
  const snap = useSnapshot(memoryStoreState);
  const currentMode = snap.injectionMode;
  const users = snap.users as UserProfile[];
  const activeUserId = snap.activeUserId;

  // 获取当前选中的用户（如果是选择具体用户模式）
  const selectedUser = useMemo(() => {
    if (currentMode === "ALL") return null;
    // CURRENT 模式下显示当前活跃用户
    return users.find(u => u.id === activeUserId);
  }, [currentMode, users, activeUserId]);

  // 获取显示标签
  const displayLabel = useMemo(() => {
    if (currentMode === "ALL") return "全部用户";
    return selectedUser ? selectedUser.name : "当前用户";
  }, [currentMode, selectedUser]);

  // 获取显示图标
  const displayIcon = useMemo(() => {
    if (currentMode === "ALL") return "ti-users";
    return "ti-user";
  }, [currentMode]);

  const handleSelectAll = useCallback((close: () => void) => {
    memoryStore.setInjectionMode("ALL");
    close();
  }, []);

  const handleSelectUser = useCallback((userId: string, close: () => void) => {
    // 设置为 CURRENT 模式，并切换活跃用户
    memoryStore.setActiveUser(userId);
    memoryStore.setInjectionMode("CURRENT");
    close();
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
          // 全部用户选项
          createElement(
            "div",
            {
              style: menuItemStyle(currentMode === "ALL"),
              onClick: () => handleSelectAll(close),
              onMouseEnter: (e: any) => {
                if (currentMode !== "ALL") {
                  e.currentTarget.style.background = "var(--orca-color-bg-2)";
                }
              },
              onMouseLeave: (e: any) => {
                e.currentTarget.style.background = currentMode === "ALL" 
                  ? "var(--orca-color-bg-3)" 
                  : "transparent";
              },
            },
            createElement("i", { 
              className: "ti ti-users", 
              style: menuItemIconStyle 
            }),
            createElement(
              "div",
              { style: { flex: 1 } },
              createElement("div", { style: menuItemLabelStyle }, "全部用户"),
              createElement("div", { style: menuItemDescStyle }, "注入所有用户的记忆")
            ),
            currentMode === "ALL" &&
              createElement("i", { 
                className: "ti ti-check", 
                style: { fontSize: 14, color: "var(--orca-color-primary)" } 
              })
          ),
          // 分隔线
          createElement("div", { style: dividerStyle }),
          // 用户列表标题
          createElement("div", { style: sectionTitleStyle }, "选择用户"),
          // 用户列表
          users.map(user => {
            const isSelected = currentMode === "CURRENT" && user.id === activeUserId;
            return createElement(
              "div",
              {
                key: user.id,
                style: menuItemStyle(isSelected),
                onClick: () => handleSelectUser(user.id, close),
                onMouseEnter: (e: any) => {
                  if (!isSelected) {
                    e.currentTarget.style.background = "var(--orca-color-bg-2)";
                  }
                },
                onMouseLeave: (e: any) => {
                  e.currentTarget.style.background = isSelected 
                    ? "var(--orca-color-bg-3)" 
                    : "transparent";
                },
              },
              createElement("span", { 
                style: { ...menuItemIconStyle, fontSize: 16 } 
              }, user.emoji),
              createElement(
                "div",
                { style: { flex: 1 } },
                createElement("div", { style: menuItemLabelStyle }, user.name)
              ),
              isSelected &&
                createElement("i", { 
                  className: "ti ti-check", 
                  style: { fontSize: 14, color: "var(--orca-color-primary)" } 
                })
            );
          })
        ),
    },
    (openMenu: (e: any) => void) =>
      createElement(
        Button,
        {
          variant: "plain",
          onClick: openMenu,
          title: `记忆注入: ${displayLabel}`,
          style: selectorButtonStyle,
        },
        createElement("i", { className: `ti ${displayIcon}` })
      )
  );
}
