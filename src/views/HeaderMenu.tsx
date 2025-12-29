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
}

export default function HeaderMenu({
  onClearChat,
  onOpenSettings,
  onOpenMemoryManager,
}: HeaderMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

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
