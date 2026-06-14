import DisplaySettingsPanel from "./DisplaySettingsPanel";
import { withTooltip } from "../utils/orca-tooltip";

const React = window.React as unknown as {
  createElement: typeof window.React.createElement;
  useState: <T>(initial: T | (() => T)) => [T, (next: T | ((prev: T) => T)) => void];
  useEffect: (fn: () => void | (() => void), deps: any[]) => void;
  useRef: <T>(value: T) => { current: T };
};
const { createElement, useState, useEffect, useRef } = React;
const { Button } = orca.components;

interface HeaderMenuProps {
  onClearChat: () => void;
  onOpenSettings: () => void;
  onOpenMemoryManager: () => void;
  onOpenStreamSettings?: () => void;
  onOpenWebSearchSettings?: () => void;
  onOpenVisionModelSettings?: () => void;
  onOpenTodoistSettings?: () => void;
  onOpenMcpSettings?: () => void;
  onExportMarkdown?: () => void;
  onSaveToJournal?: () => void;
  onToggleSelectionMode?: () => void;
  selectionMode?: boolean;
  selectedCount?: number;
  onSaveSelected?: () => void;
}

export default function HeaderMenu({
  onClearChat,
  onOpenSettings,
  onOpenMemoryManager,
  onOpenStreamSettings,
  onOpenWebSearchSettings,
  onOpenVisionModelSettings,
  onOpenTodoistSettings,
  onOpenMcpSettings,
  onExportMarkdown,
  onSaveToJournal,
  onToggleSelectionMode,
  selectionMode,
  selectedCount,
  onSaveSelected,
}: HeaderMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [showDisplaySettings, setShowDisplaySettings] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen && !showDisplaySettings) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setShowDisplaySettings(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen, showDisplaySettings]);

  const menuItemStyle: React.CSSProperties = {
    padding: "10px 16px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: "10px",
    color: "var(--orca-color-text-1)",
    fontSize: "14px",
    transition: "background 0.1s ease",
    userSelect: "none",
  };

  const handleItemClick = (action: () => void) => {
    action();
    setIsOpen(false);
  };

  return createElement(
    "div",
    {
      ref: menuRef as any,
      style: { position: "relative" },
    },
    withTooltip(
      "More options",
      createElement(
        Button,
        {
          variant: "plain",
          onClick: () => setIsOpen(!isOpen),
        },
        createElement("i", { className: "ti ti-dots-vertical" })
      )
    ),
    // Display Settings Panel (shown as a popover)
    showDisplaySettings && createElement(
      "div",
      {
        style: {
          position: "absolute",
          top: "100%",
          right: 0,
          marginTop: 4,
          background: "var(--orca-color-bg-1)",
          border: "1px solid var(--orca-color-border)",
          borderRadius: "var(--orca-radius-md)",
          boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
          zIndex: 101,
          overflow: "hidden",
        },
      },
      createElement(DisplaySettingsPanel, {
        onClose: () => setShowDisplaySettings(false),
      })
    ),
    isOpen &&
      createElement(
        "div",
        {
          style: {
            position: "absolute",
            top: "100%",
            right: 0,
            marginTop: 4,
            width: 180,
            background: "var(--orca-color-bg-1)",
            border: "1px solid var(--orca-color-border)",
            borderRadius: "var(--orca-radius-md)",
            boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
            zIndex: 100,
            overflow: "hidden",
            padding: "4px 0",
          },
        },
        // Display Settings
        createElement(
          "div",
          {
            style: menuItemStyle,
            onClick: () => {
              setIsOpen(false);
              setShowDisplaySettings(true);
            },
            className: "header-menu-item",
          },
          createElement("i", { className: "ti ti-adjustments" }),
          "显示设置"
        ),
        // Settings
        createElement(
          "div",
          {
            style: menuItemStyle,
            onClick: () => handleItemClick(onOpenSettings),
            className: "header-menu-item",
          },
          createElement("i", { className: "ti ti-settings" }),
          "Settings"
        ),
        // Memory Manager
        createElement(
          "div",
          {
            style: menuItemStyle,
            onClick: () => handleItemClick(onOpenMemoryManager),
            className: "header-menu-item",
          },
          createElement("i", { className: "ti ti-brain" }),
          "记忆管理"
        ),
        // Stream Settings
        onOpenStreamSettings && createElement(
          "div",
          {
            style: menuItemStyle,
            onClick: () => handleItemClick(onOpenStreamSettings),
            className: "header-menu-item",
          },
          createElement("i", { className: "ti ti-clock" }),
          "流式 / 工具设置"
        ),
        // Web Search Settings
        onOpenWebSearchSettings && createElement(
          "div",
          {
            style: menuItemStyle,
            onClick: () => handleItemClick(onOpenWebSearchSettings),
            className: "header-menu-item",
          },
          createElement("i", { className: "ti ti-world" }),
          "联网搜索"
        ),
        // Vision Model Settings
        onOpenVisionModelSettings && createElement(
          "div",
          {
            style: menuItemStyle,
            onClick: () => handleItemClick(onOpenVisionModelSettings),
            className: "header-menu-item",
          },
          createElement("i", { className: "ti ti-eye" }),
          "视觉模型"
        ),
        // Todoist Settings
        onOpenTodoistSettings && createElement(
          "div",
          {
            style: menuItemStyle,
            onClick: () => handleItemClick(onOpenTodoistSettings),
            className: "header-menu-item",
          },
          createElement("i", { className: "ti ti-checkbox" }),
          "Todoist"
        ),
        // MCP Server Settings
        onOpenMcpSettings && createElement(
          "div",
          {
            style: menuItemStyle,
            onClick: () => handleItemClick(onOpenMcpSettings),
            className: "header-menu-item",
          },
          createElement("i", { className: "ti ti-plug-connected" }),
          "MCP 服务器"
        ),
        // Divider
        createElement("div", {
          style: {
            height: "1px",
            background: "var(--orca-color-border)",
            margin: "4px 0",
          },
        }),
        // Export as Markdown
        onExportMarkdown && createElement(
          "div",
          {
            style: menuItemStyle,
            onClick: () => handleItemClick(onExportMarkdown),
            className: "header-menu-item",
          },
          createElement("i", { className: "ti ti-file-export" }),
          "导出 Markdown"
        ),
        // Save to Journal
        onSaveToJournal && createElement(
          "div",
          {
            style: menuItemStyle,
            onClick: () => handleItemClick(onSaveToJournal),
            className: "header-menu-item",
          },
          createElement("i", { className: "ti ti-notebook" }),
          "保存到日记"
        ),
        // Selection Mode Toggle
        onToggleSelectionMode && createElement(
          "div",
          {
            style: {
              ...menuItemStyle,
              color: selectionMode ? "var(--orca-color-primary)" : undefined,
            },
            onClick: () => handleItemClick(onToggleSelectionMode),
            className: "header-menu-item",
          },
          createElement("i", { className: selectionMode ? "ti ti-checkbox" : "ti ti-select" }),
          selectionMode ? "退出选择模式" : "选择消息保存"
        ),
        // Save Selected (only show in selection mode)
        selectionMode && onSaveSelected && createElement(
          "div",
          {
            style: {
              ...menuItemStyle,
              color: selectedCount && selectedCount > 0 ? "var(--orca-color-primary)" : "var(--orca-color-text-3)",
            },
            className: "header-menu-item",
            onClick: selectedCount && selectedCount > 0 ? () => handleItemClick(onSaveSelected) : undefined,
          },
          createElement("i", { className: "ti ti-device-floppy" }),
          `保存选中 (${selectedCount || 0})`
        ),
        // Divider
        createElement("div", {
          style: {
            height: "1px",
            background: "var(--orca-color-border)",
            margin: "4px 0",
          },
        }),
        // Clear Chat
        createElement(
          "div",
          {
            style: { ...menuItemStyle, color: "var(--orca-color-danger, #dc3545)" },
            onClick: () => handleItemClick(onClearChat),
            className: "header-menu-item",
          },
          createElement("i", { className: "ti ti-trash" }),
          "Clear Chat"
        )
      )
  );
}
