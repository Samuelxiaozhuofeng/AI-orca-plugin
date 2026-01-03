import DisplaySettingsPanel from "./DisplaySettingsPanel";

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
  onOpenCompressionSettings?: () => void;
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
  onOpenCompressionSettings,
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
    createElement(
      Button,
      {
        variant: "plain",
        onClick: () => setIsOpen(!isOpen),
        title: "More options",
      },
      createElement("i", { className: "ti ti-dots-vertical" })
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
          borderRadius: 8,
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
            borderRadius: 8,
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
            onMouseEnter: (e: any) => (e.currentTarget.style.background = "var(--orca-color-bg-2)"),
            onMouseLeave: (e: any) => (e.currentTarget.style.background = "transparent"),
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
            onMouseEnter: (e: any) => (e.currentTarget.style.background = "var(--orca-color-bg-2)"),
            onMouseLeave: (e: any) => (e.currentTarget.style.background = "transparent"),
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
            onMouseEnter: (e: any) => (e.currentTarget.style.background = "var(--orca-color-bg-2)"),
            onMouseLeave: (e: any) => (e.currentTarget.style.background = "transparent"),
          },
          createElement("i", { className: "ti ti-brain" }),
          "记忆管理"
        ),
        // Token Optimization
        onOpenCompressionSettings && createElement(
          "div",
          {
            style: menuItemStyle,
            onClick: () => handleItemClick(onOpenCompressionSettings),
            onMouseEnter: (e: any) => (e.currentTarget.style.background = "var(--orca-color-bg-2)"),
            onMouseLeave: (e: any) => (e.currentTarget.style.background = "transparent"),
          },
          createElement("i", { className: "ti ti-arrows-minimize" }),
          "Token 优化"
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
            onMouseEnter: (e: any) => (e.currentTarget.style.background = "var(--orca-color-bg-2)"),
            onMouseLeave: (e: any) => (e.currentTarget.style.background = "transparent"),
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
            onMouseEnter: (e: any) => (e.currentTarget.style.background = "var(--orca-color-bg-2)"),
            onMouseLeave: (e: any) => (e.currentTarget.style.background = "transparent"),
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
            onMouseEnter: (e: any) => (e.currentTarget.style.background = "var(--orca-color-bg-2)"),
            onMouseLeave: (e: any) => (e.currentTarget.style.background = "transparent"),
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
            onClick: selectedCount && selectedCount > 0 ? () => handleItemClick(onSaveSelected) : undefined,
            onMouseEnter: (e: any) => {
              if (selectedCount && selectedCount > 0) {
                e.currentTarget.style.background = "var(--orca-color-bg-2)";
              }
            },
            onMouseLeave: (e: any) => (e.currentTarget.style.background = "transparent"),
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
            onMouseEnter: (e: any) => (e.currentTarget.style.background = "var(--orca-color-bg-2)"),
            onMouseLeave: (e: any) => (e.currentTarget.style.background = "transparent"),
          },
          createElement("i", { className: "ti ti-trash" }),
          "Clear Chat"
        )
      )
  );
}
