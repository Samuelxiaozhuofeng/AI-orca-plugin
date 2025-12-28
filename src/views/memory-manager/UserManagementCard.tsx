/**
 * UserManagementCard - Card component for user profile management
 * Displays user avatar with emoji, user selector, and action buttons
 * Supports multi-select mode and user disable functionality
 * Requirements: 9.1, 9.3, 12.3, 12.4
 */

import type { UserProfile, InjectionMode } from "../../store/memory-store";
import {
  cardStyle,
  cardHeaderStyle,
  cardTitleStyle,
  cardBodyStyle,
  cardActionsStyle,
  userAvatarStyle,
  userInfoContainerStyle,
  userDetailsStyle,
  userNameRowStyle,
  userNameStyle,
  userStatsStyle,
  userSelectorStyle,
  userActionButtonStyle,
  editInputStyle,
  iconButtonStyle,
} from "./card-styles";

// ============================================================================
// User Tab Styles
// ============================================================================

const userTabsContainerStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "8px",
  marginTop: "12px",
};

const userTabStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "4px",
  padding: "6px 12px",
  borderRadius: "6px",
  border: "1px solid var(--orca-color-border)",
  background: "var(--orca-color-bg-1)",
  color: "var(--orca-color-text-2)",
  fontSize: "13px",
  cursor: "pointer",
  transition: "all 0.15s ease",
};

const userTabActiveStyle: React.CSSProperties = {
  ...userTabStyle,
  borderColor: "var(--orca-color-primary, #007bff)",
  color: "var(--orca-color-primary, #007bff)",
  fontWeight: 500,
};

const userTabDisabledStyle: React.CSSProperties = {
  ...userTabStyle,
  opacity: 0.5,
  textDecoration: "line-through",
};

const userTabSelectedStyle: React.CSSProperties = {
  ...userTabStyle,
  borderColor: "var(--orca-color-success, #28a745)",
  background: "rgba(40, 167, 69, 0.1)",
};

const injectionModeContainerStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "8px",
  marginTop: "12px",
  padding: "8px 12px",
  background: "var(--orca-color-bg-2)",
  borderRadius: "6px",
};

const injectionModeLabelStyle: React.CSSProperties = {
  fontSize: "12px",
  color: "var(--orca-color-text-2)",
  marginRight: "8px",
};

const injectionModeButtonStyle: React.CSSProperties = {
  padding: "4px 10px",
  borderRadius: "4px",
  border: "1px solid var(--orca-color-border)",
  background: "var(--orca-color-bg-1)",
  color: "var(--orca-color-text-2)",
  fontSize: "12px",
  cursor: "pointer",
  transition: "all 0.15s ease",
};

const injectionModeButtonActiveStyle: React.CSSProperties = {
  ...injectionModeButtonStyle,
  borderColor: "var(--orca-color-primary, #007bff)",
  background: "var(--orca-color-primary, #007bff)",
  color: "#fff",
};

const React = window.React as unknown as {
  createElement: typeof window.React.createElement;
  useState: <T>(initial: T | (() => T)) => [T, (next: T | ((prev: T) => T)) => void];
  useCallback: <T extends (...args: any[]) => any>(fn: T, deps: any[]) => T;
};
const { createElement, useState, useCallback } = React;

// ============================================================================
// Types
// ============================================================================

interface UserManagementCardProps {
  users: UserProfile[];
  activeUser: UserProfile | undefined;
  activeUserId: string;
  totalMemoryCount: number;
  enabledMemoryCount: number;
  injectionMode: InjectionMode;
  selectedUserIds: string[];
  onUserChange: (userId: string) => void;
  onAddUser: (name: string) => void;
  onEditUser: (id: string, name: string) => void;
  onDeleteUser: (id: string) => void;
  onAvatarClick: () => void;
  onSetAsSelf?: (id: string | null) => void;
  onToggleUserDisabled?: (id: string) => void;
  onToggleUserSelection?: (id: string) => void;
  onSetInjectionMode?: (mode: InjectionMode) => void;
  onSelectAllUsers?: () => void;
  onDeselectAllUsers?: () => void;
}

// ============================================================================
// Component
// ============================================================================

export default function UserManagementCard({
  users,
  activeUser,
  activeUserId,
  totalMemoryCount,
  enabledMemoryCount,
  injectionMode,
  selectedUserIds,
  onUserChange,
  onAddUser,
  onEditUser,
  onDeleteUser,
  onAvatarClick,
  onSetAsSelf,
  onToggleUserDisabled,
  onToggleUserSelection,
  onSetInjectionMode,
  onSelectAllUsers,
  onDeselectAllUsers,
}: UserManagementCardProps) {
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [newUserName, setNewUserName] = useState("");
  const [isEditingUser, setIsEditingUser] = useState(false);
  const [editingUserName, setEditingUserName] = useState("");
  const [isAvatarHovered, setIsAvatarHovered] = useState(false);

  // ─────────────────────────────────────────────────────────────────────────
  // Handlers
  // ─────────────────────────────────────────────────────────────────────────

  const handleUserSelectChange = useCallback((e: any) => {
    onUserChange(e.target.value);
  }, [onUserChange]);

  const handleStartAddUser = useCallback(() => {
    setIsAddingUser(true);
    setNewUserName("");
  }, []);

  const handleConfirmAddUser = useCallback(() => {
    if (newUserName.trim()) {
      onAddUser(newUserName.trim());
      setNewUserName("");
      setIsAddingUser(false);
    }
  }, [newUserName, onAddUser]);

  const handleCancelAddUser = useCallback(() => {
    setIsAddingUser(false);
    setNewUserName("");
  }, []);

  const handleStartEditUser = useCallback(() => {
    if (activeUser) {
      setIsEditingUser(true);
      setEditingUserName(activeUser.name);
    }
  }, [activeUser]);

  const handleConfirmEditUser = useCallback(() => {
    if (activeUser && editingUserName.trim()) {
      onEditUser(activeUser.id, editingUserName.trim());
      setIsEditingUser(false);
      setEditingUserName("");
    }
  }, [activeUser, editingUserName, onEditUser]);

  const handleCancelEditUser = useCallback(() => {
    setIsEditingUser(false);
    setEditingUserName("");
  }, []);

  const handleDeleteUser = useCallback(() => {
    if (activeUser && !activeUser.isDefault) {
      onDeleteUser(activeUser.id);
    }
  }, [activeUser, onDeleteUser]);

  const handleToggleSelf = useCallback(() => {
    if (activeUser && onSetAsSelf) {
      // Toggle: if already self, clear it; otherwise set as self
      onSetAsSelf(activeUser.isSelf ? null : activeUser.id);
    }
  }, [activeUser, onSetAsSelf]);

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  const renderAvatar = () => {
    const avatarCurrentStyle = isAvatarHovered
      ? { ...userAvatarStyle, transform: "scale(1.05)", boxShadow: "0 4px 12px rgba(0, 0, 0, 0.2)" }
      : userAvatarStyle;

    return createElement(
      "div",
      {
        style: avatarCurrentStyle,
        onClick: onAvatarClick,
        onMouseEnter: () => setIsAvatarHovered(true),
        onMouseLeave: () => setIsAvatarHovered(false),
        title: "点击更换头像",
      },
      activeUser?.emoji || "D"
    );
  };

  const renderUserSelector = () => {
    if (isEditingUser) {
      return createElement(
        "div",
        { style: { display: "flex", gap: "8px", flex: 1 } },
        createElement("input", {
          type: "text",
          value: editingUserName,
          onChange: (e: any) => setEditingUserName(e.target.value),
          style: { ...userSelectorStyle, flex: 1 },
          autoFocus: true,
          onKeyDown: (e: any) => {
            if (e.key === "Enter") handleConfirmEditUser();
            if (e.key === "Escape") handleCancelEditUser();
          },
        }),
        createElement(
          "button",
          {
            style: { ...iconButtonStyle, color: "var(--orca-color-primary)" },
            onClick: handleConfirmEditUser,
            title: "保存",
          },
          createElement("i", { className: "ti ti-check" })
        ),
        createElement(
          "button",
          {
            style: iconButtonStyle,
            onClick: handleCancelEditUser,
            title: "取消",
          },
          createElement("i", { className: "ti ti-x" })
        )
      );
    }

    return createElement(
      "select",
      {
        style: userSelectorStyle,
        value: activeUserId,
        onChange: handleUserSelectChange,
      },
      users.map((user) =>
        createElement(
          "option",
          { key: user.id, value: user.id },
          `${user.emoji} ${user.name}${user.isDefault ? " (默认)" : ""}`
        )
      )
    );
  };

  const renderAddUserForm = () => {
    if (!isAddingUser) return null;

    return createElement(
      "div",
      { style: { display: "flex", gap: "8px", marginTop: "12px" } },
      createElement("input", {
        type: "text",
        placeholder: "输入新用户名...",
        value: newUserName,
        onChange: (e: any) => setNewUserName(e.target.value),
        style: { ...userSelectorStyle, flex: 1 },
        autoFocus: true,
        onKeyDown: (e: any) => {
          if (e.key === "Enter") handleConfirmAddUser();
          if (e.key === "Escape") handleCancelAddUser();
        },
      }),
      createElement(
        "button",
        {
          style: { ...iconButtonStyle, color: "var(--orca-color-primary)" },
          onClick: handleConfirmAddUser,
          title: "确认添加",
        },
        createElement("i", { className: "ti ti-check" })
      ),
      createElement(
        "button",
        {
          style: iconButtonStyle,
          onClick: handleCancelAddUser,
          title: "取消",
        },
        createElement("i", { className: "ti ti-x" })
      )
    );
  };

  // Render user tabs for quick switching
  const renderUserTabs = () => {
    if (users.length <= 1) return null;

    const isSelectMode = injectionMode === 'SELECTED';

    return createElement(
      "div",
      { style: userTabsContainerStyle },
      users.map((user) => {
        const isActive = user.id === activeUserId;
        const isDisabled = user.isDisabled;
        const isSelected = selectedUserIds.includes(user.id);
        
        // Determine style based on state
        let tabStyle = userTabStyle;
        if (isDisabled) {
          tabStyle = userTabDisabledStyle;
        } else if (isSelectMode && isSelected) {
          tabStyle = userTabSelectedStyle;
        } else if (isActive) {
          tabStyle = userTabActiveStyle;
        }

        return createElement(
          "button",
          {
            key: user.id,
            style: tabStyle,
            onClick: (e: any) => {
              // Ctrl/Cmd + click to toggle selection in SELECTED mode
              if (isSelectMode && (e.ctrlKey || e.metaKey) && onToggleUserSelection) {
                onToggleUserSelection(user.id);
              } else if (!isActive) {
                onUserChange(user.id);
              }
            },
            onContextMenu: (e: any) => {
              e.preventDefault();
              // Right-click to toggle disabled
              if (onToggleUserDisabled) {
                onToggleUserDisabled(user.id);
              }
            },
            title: isDisabled 
              ? `${user.name} (已禁用 - 右键启用)` 
              : isSelectMode 
                ? `${user.name} (Ctrl+点击切换选中, 右键禁用)` 
                : `${user.name} (右键禁用)`,
            onMouseEnter: (e: any) => {
              if (!isActive && !isDisabled) {
                e.currentTarget.style.background = "var(--orca-color-bg-3)";
                e.currentTarget.style.borderColor = "var(--orca-color-primary, #007bff)";
              }
            },
            onMouseLeave: (e: any) => {
              if (!isActive && !isDisabled && !(isSelectMode && isSelected)) {
                e.currentTarget.style.background = "var(--orca-color-bg-1)";
                e.currentTarget.style.borderColor = "var(--orca-color-border)";
              }
            },
          },
          // Checkbox for SELECTED mode
          isSelectMode && createElement(
            "span",
            { 
              style: { 
                width: "14px", 
                height: "14px", 
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              } 
            },
            createElement("i", { 
              className: isSelected ? "ti ti-checkbox" : "ti ti-square",
              style: { fontSize: "14px" }
            })
          ),
          createElement("span", null, user.emoji),
          createElement("span", null, user.name),
          // Disabled indicator
          isDisabled && createElement("i", { 
            className: "ti ti-ban", 
            style: { fontSize: "12px", marginLeft: "2px" } 
          })
        );
      })
    );
  };

  const renderActionButtons = () => {
    if (isEditingUser) return null;

    const isSelf = activeUser?.isSelf;

    return createElement(
      "div",
      { style: cardActionsStyle },
      // Set as self button
      onSetAsSelf &&
        createElement(
          "button",
          {
            style: {
              ...userActionButtonStyle,
              color: isSelf ? "var(--orca-color-primary, #007bff)" : undefined,
            },
            onClick: handleToggleSelf,
            title: isSelf ? "取消设为我自己" : "设为我自己",
            onMouseEnter: (e: any) => {
              e.currentTarget.style.background = "var(--orca-color-bg-3)";
            },
            onMouseLeave: (e: any) => {
              e.currentTarget.style.background = "transparent";
            },
          },
          createElement("i", { className: isSelf ? "ti ti-user-check" : "ti ti-user-heart" })
        ),
      createElement(
        "button",
        {
          style: userActionButtonStyle,
          onClick: handleStartAddUser,
          title: "添加用户",
          onMouseEnter: (e: any) => {
            e.currentTarget.style.background = "var(--orca-color-bg-3)";
          },
          onMouseLeave: (e: any) => {
            e.currentTarget.style.background = "transparent";
          },
        },
        createElement("i", { className: "ti ti-user-plus" })
      ),
      createElement(
        "button",
        {
          style: userActionButtonStyle,
          onClick: handleStartEditUser,
          title: "编辑用户名",
          onMouseEnter: (e: any) => {
            e.currentTarget.style.background = "var(--orca-color-bg-3)";
          },
          onMouseLeave: (e: any) => {
            e.currentTarget.style.background = "transparent";
          },
        },
        createElement("i", { className: "ti ti-pencil" })
      ),
      !activeUser?.isDefault &&
        createElement(
          "button",
          {
            style: { ...userActionButtonStyle, color: "var(--orca-color-danger, #dc3545)" },
            onClick: handleDeleteUser,
            title: "删除用户",
            onMouseEnter: (e: any) => {
              e.currentTarget.style.background = "var(--orca-color-bg-3)";
            },
            onMouseLeave: (e: any) => {
              e.currentTarget.style.background = "transparent";
            },
          },
          createElement("i", { className: "ti ti-trash" })
        )
    );
  };

  // Render injection mode selector
  const renderInjectionModeSelector = () => {
    if (!onSetInjectionMode) return null;

    const modes: { value: InjectionMode; label: string; icon: string }[] = [
      { value: 'ALL', label: '全部', icon: 'ti ti-users' },
      { value: 'CURRENT', label: '当前', icon: 'ti ti-user' },
      { value: 'SELECTED', label: '多选', icon: 'ti ti-list-check' },
    ];

    return createElement(
      "div",
      { style: injectionModeContainerStyle },
      createElement("span", { style: injectionModeLabelStyle }, "注入模式:"),
      ...modes.map(mode => 
        createElement(
          "button",
          {
            key: mode.value,
            style: injectionMode === mode.value ? injectionModeButtonActiveStyle : injectionModeButtonStyle,
            onClick: () => onSetInjectionMode(mode.value),
            title: mode.value === 'ALL' 
              ? '注入所有用户的记忆' 
              : mode.value === 'CURRENT' 
                ? '只注入当前用户的记忆'
                : '注入选中用户的记忆 (Ctrl+点击用户标签选择)',
            onMouseEnter: (e: any) => {
              if (injectionMode !== mode.value) {
                e.currentTarget.style.background = "var(--orca-color-bg-3)";
              }
            },
            onMouseLeave: (e: any) => {
              if (injectionMode !== mode.value) {
                e.currentTarget.style.background = "var(--orca-color-bg-1)";
              }
            },
          },
          createElement("i", { className: mode.icon, style: { marginRight: "4px" } }),
          mode.label
        )
      ),
      // Select all / Deselect all buttons for SELECTED mode
      injectionMode === 'SELECTED' && onSelectAllUsers && onDeselectAllUsers && createElement(
        "div",
        { style: { marginLeft: "auto", display: "flex", gap: "4px" } },
        createElement(
          "button",
          {
            style: { ...injectionModeButtonStyle, padding: "4px 8px" },
            onClick: onSelectAllUsers,
            title: "全选",
          },
          createElement("i", { className: "ti ti-checks" })
        ),
        createElement(
          "button",
          {
            style: { ...injectionModeButtonStyle, padding: "4px 8px" },
            onClick: onDeselectAllUsers,
            title: "取消全选",
          },
          createElement("i", { className: "ti ti-square" })
        )
      )
    );
  };

  return createElement(
    "div",
    { style: cardStyle },
    // Card Header
    createElement(
      "div",
      { style: cardHeaderStyle },
      createElement(
        "div",
        { style: cardTitleStyle },
        createElement("i", { className: "ti ti-user" }),
        "用户管理"
      ),
      renderActionButtons()
    ),
    // Card Body
    createElement(
      "div",
      { style: cardBodyStyle },
      createElement(
        "div",
        { style: userInfoContainerStyle },
        renderAvatar(),
        createElement(
          "div",
          { style: userDetailsStyle },
          createElement(
            "div",
            { style: userNameRowStyle },
            renderUserSelector()
          ),
          createElement(
            "div",
            { style: userStatsStyle },
            `${totalMemoryCount} 条记忆 · ${enabledMemoryCount} 条启用`
          )
        )
      ),
      renderInjectionModeSelector(),
      renderUserTabs(),
      renderAddUserForm()
    )
  );
}
