/**
 * UserManagementCard - Card component for user profile management
 * Displays user avatar with emoji, user selector, and action buttons
 * Supports user disable functionality via right-click
 * Supports collapse/expand
 * Requirements: 9.1, 9.3, 12.3, 12.4
 */

import type { UserProfile } from "../../store/memory-store";
import {
  cardStyle,
  cardHeaderStyle,
  cardHeaderCollapsedStyle,
  cardTitleStyle,
  cardCollapseIconStyle,
  cardBodyStyle,
  cardActionsStyle,
  userAvatarStyle,
  userInfoContainerStyle,
  userDetailsStyle,
  userNameRowStyle,
  userStatsStyle,
  userActionButtonStyle,
  iconButtonStyle,
} from "./card-styles";

// ============================================================================
// User Tab Styles - Modern Pill Design
// ============================================================================

const userTabsContainerStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "6px",
  marginTop: "12px",
};

const userTabStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: "5px",
  padding: "4px 10px",
  borderRadius: "16px",
  border: "1px solid var(--orca-color-border)",
  background: "var(--orca-color-bg-1)",
  color: "var(--orca-color-text-2)",
  fontSize: "12px",
  cursor: "pointer",
  transition: "all 0.15s ease",
};

const userTabActiveStyle: React.CSSProperties = {
  ...userTabStyle,
  borderColor: "var(--orca-color-text-1)",
  background: "var(--orca-color-bg-3)",
  color: "var(--orca-color-text-1)",
  fontWeight: 500,
};

const userTabDisabledStyle: React.CSSProperties = {
  ...userTabStyle,
  opacity: 0.4,
  textDecoration: "line-through",
};

// Badge style for memory count
const userTabBadgeStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  minWidth: "16px",
  height: "16px",
  padding: "0 4px",
  borderRadius: "8px",
  background: "var(--orca-color-bg-3)",
  color: "var(--orca-color-text-3)",
  fontSize: "10px",
  fontWeight: 500,
};

const userTabBadgeActiveStyle: React.CSSProperties = {
  ...userTabBadgeStyle,
  background: "var(--orca-color-bg-2)",
  color: "var(--orca-color-text-2)",
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
  onUserChange: (userId: string) => void;
  onAddUser: (name: string) => void;
  onEditUser: (id: string, name: string) => void;
  onDeleteUser: (id: string) => void;
  onAvatarClick: () => void;
  onSetAsSelf?: (id: string | null) => void;
  onToggleUserDisabled?: (id: string) => void;
  getMemoryCountForUser?: (userId: string) => number;
  defaultCollapsed?: boolean;
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
  onUserChange,
  onAddUser,
  onEditUser,
  onDeleteUser,
  onAvatarClick,
  onSetAsSelf,
  onToggleUserDisabled,
  getMemoryCountForUser,
  defaultCollapsed = false,
}: UserManagementCardProps) {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
  const [isAddingUser, setIsAddingUser] = useState(false);
  const [newUserName, setNewUserName] = useState("");
  const [isEditingUser, setIsEditingUser] = useState(false);
  const [editingUserName, setEditingUserName] = useState("");
  const [isAvatarHovered, setIsAvatarHovered] = useState(false);

  // ─────────────────────────────────────────────────────────────────────────
  // Handlers
  // ─────────────────────────────────────────────────────────────────────────

  const handleToggleCollapse = useCallback(() => {
    setIsCollapsed(prev => !prev);
  }, []);

  const handleStartAddUser = useCallback((e: any) => {
    e.stopPropagation();
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

  const handleStartEditUser = useCallback((e: any) => {
    e.stopPropagation();
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

  const handleDeleteUser = useCallback((e: any) => {
    e.stopPropagation();
    if (activeUser && !activeUser.isDefault) {
      onDeleteUser(activeUser.id);
    }
  }, [activeUser, onDeleteUser]);

  const handleToggleSelf = useCallback((e: any) => {
    e.stopPropagation();
    if (activeUser && onSetAsSelf) {
      onSetAsSelf(activeUser.isSelf ? null : activeUser.id);
    }
  }, [activeUser, onSetAsSelf]);

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  const renderAvatar = () => {
    const avatarCurrentStyle = isAvatarHovered
      ? { ...userAvatarStyle, transform: "scale(1.05)", background: "var(--orca-color-bg-2)" }
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

  const renderUserInfo = () => {
    if (isEditingUser) {
      return createElement(
        "div",
        { style: { display: "flex", gap: "6px", flex: 1 } },
        createElement("input", {
          type: "text",
          value: editingUserName,
          onChange: (e: any) => setEditingUserName(e.target.value),
          style: {
            flex: 1,
            padding: "6px 10px",
            borderRadius: "6px",
            border: "1px solid var(--orca-color-border)",
            background: "var(--orca-color-bg-1)",
            color: "var(--orca-color-text-1)",
            fontSize: "13px",
            outline: "none",
          },
          autoFocus: true,
          onKeyDown: (e: any) => {
            if (e.key === "Enter") handleConfirmEditUser();
            if (e.key === "Escape") handleCancelEditUser();
          },
        }),
        createElement(
          "button",
          {
            style: { ...iconButtonStyle, color: "var(--orca-color-success, #28a745)" },
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

    // 直接显示当前用户名
    return createElement(
      "div",
      { style: { fontSize: "14px", fontWeight: 500, color: "var(--orca-color-text-1)" } },
      activeUser?.name || "用户"
    );
  };

  const renderAddUserForm = () => {
    if (!isAddingUser) return null;

    return createElement(
      "div",
      { style: { display: "flex", gap: "6px", marginTop: "10px" } },
      createElement("input", {
        type: "text",
        placeholder: "输入新用户名...",
        value: newUserName,
        onChange: (e: any) => setNewUserName(e.target.value),
        style: {
          flex: 1,
          padding: "6px 10px",
          borderRadius: "6px",
          border: "1px solid var(--orca-color-border)",
          background: "var(--orca-color-bg-1)",
          color: "var(--orca-color-text-1)",
          fontSize: "13px",
          outline: "none",
        },
        autoFocus: true,
        onKeyDown: (e: any) => {
          if (e.key === "Enter") handleConfirmAddUser();
          if (e.key === "Escape") handleCancelAddUser();
        },
      }),
      createElement(
        "button",
        {
          style: { ...iconButtonStyle, color: "var(--orca-color-success, #28a745)" },
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

    return createElement(
      "div",
      { style: userTabsContainerStyle },
      users.map((user) => {
        const isActive = user.id === activeUserId;
        const isDisabled = user.isDisabled;
        const memoryCount = getMemoryCountForUser ? getMemoryCountForUser(user.id) : 0;
        
        let tabStyle = userTabStyle;
        if (isDisabled) {
          tabStyle = userTabDisabledStyle;
        } else if (isActive) {
          tabStyle = userTabActiveStyle;
        }

        const badgeStyle = isActive ? userTabBadgeActiveStyle : userTabBadgeStyle;

        return createElement(
          "button",
          {
            key: user.id,
            style: tabStyle,
            onClick: () => {
              if (!isActive) {
                onUserChange(user.id);
              }
            },
            onContextMenu: (e: any) => {
              e.preventDefault();
              if (onToggleUserDisabled) {
                onToggleUserDisabled(user.id);
              }
            },
            title: isDisabled 
              ? `${user.name} (已禁用 - 右键启用)` 
              : `${user.name} (右键禁用)`,
            onMouseEnter: (e: any) => {
              if (!isActive && !isDisabled) {
                e.currentTarget.style.background = "var(--orca-color-bg-2)";
                e.currentTarget.style.borderColor = "var(--orca-color-text-2)";
              }
            },
            onMouseLeave: (e: any) => {
              if (!isActive && !isDisabled) {
                e.currentTarget.style.background = "var(--orca-color-bg-1)";
                e.currentTarget.style.borderColor = "var(--orca-color-border)";
              }
            },
          },
          createElement("span", null, user.emoji),
          createElement("span", null, user.name),
          memoryCount > 0 && createElement("span", { style: badgeStyle }, memoryCount),
          isDisabled && createElement("i", { 
            className: "ti ti-ban", 
            style: { fontSize: "11px", opacity: 0.6 } 
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
      { style: cardActionsStyle, onClick: (e: any) => e.stopPropagation() },
      onSetAsSelf &&
        createElement(
          "button",
          {
            style: {
              ...userActionButtonStyle,
              color: isSelf ? "var(--orca-color-text-1)" : undefined,
            },
            onClick: handleToggleSelf,
            title: isSelf ? "取消设为我自己" : "设为我自己",
            onMouseEnter: (e: any) => {
              e.currentTarget.style.background = "var(--orca-color-bg-2)";
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
            e.currentTarget.style.background = "var(--orca-color-bg-2)";
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
            e.currentTarget.style.background = "var(--orca-color-bg-2)";
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
              e.currentTarget.style.background = "var(--orca-color-bg-2)";
            },
            onMouseLeave: (e: any) => {
              e.currentTarget.style.background = "transparent";
            },
          },
          createElement("i", { className: "ti ti-trash" })
        )
    );
  };

  return createElement(
    "div",
    { style: cardStyle },
    // Card Header - clickable for collapse
    createElement(
      "div",
      { 
        style: isCollapsed ? cardHeaderCollapsedStyle : cardHeaderStyle,
        onClick: handleToggleCollapse,
      },
      createElement(
        "div",
        { style: cardTitleStyle },
        createElement("i", { 
          className: isCollapsed ? "ti ti-chevron-right" : "ti ti-chevron-down", 
          style: cardCollapseIconStyle 
        }),
        createElement("i", { className: "ti ti-user" }),
        "用户管理",
        // 折叠时显示当前用户
        isCollapsed && activeUser && createElement(
          "span",
          { style: { fontWeight: 400, color: "var(--orca-color-text-2)", marginLeft: "8px" } },
          `${activeUser.emoji} ${activeUser.name}`
        )
      ),
      !isCollapsed && renderActionButtons()
    ),
    // Card Body - only show when not collapsed
    !isCollapsed && createElement(
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
            renderUserInfo()
          ),
          createElement(
            "div",
            { style: userStatsStyle },
            `${totalMemoryCount} 条记忆 · ${enabledMemoryCount} 条启用`
          )
        )
      ),
      renderUserTabs(),
      renderAddUserForm()
    )
  );
}
