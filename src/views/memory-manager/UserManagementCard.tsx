/**
 * UserManagementCard - Card component for user profile management
 * Displays user avatar with emoji, user selector, and action buttons
 * Requirements: 9.1, 9.3, 12.3, 12.4
 */

import type { UserProfile } from "../../store/memory-store";
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
      renderAddUserForm()
    )
  );
}
