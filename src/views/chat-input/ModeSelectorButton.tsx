/**
 * ModeSelectorButton - Chat mode selector component
 * Displays current mode (Agent/Ask) with icon
 * Provides dropdown menu for mode selection
 * In Agent mode, shows tool management button
 * 
 * Requirements: 1.1, 1.2, 1.3, 6.1, 6.2, 6.3, 6.4
 */

import type { ChatMode } from "../../store/chat-mode-store";
import { chatModeStore, setMode } from "../../store/chat-mode-store";
import { toolStore, toggleToolPanel } from "../../store/tool-store";

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
// Mode Configuration
// ============================================================================

interface ModeConfig {
  icon: string;
  label: string;
  description: string;
}

const MODE_CONFIGS: Record<ChatMode, ModeConfig> = {
  agent: {
    icon: "ti ti-bolt",
    label: "Agent",
    description: "AI 自动执行工具调用，无需确认",
  },
  ask: {
    icon: "ti ti-message-circle",
    label: "Ask",
    description: "AI 仅回答问题，不执行任何操作",
  },
};

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
  minWidth: 200,
  padding: 8,
  background: "var(--orca-color-bg-1)",
};

const menuItemStyle = (isSelected: boolean): React.CSSProperties => ({
  display: "flex",
  alignItems: "center",
  gap: 10,
  padding: "10px 12px",
  borderRadius: 6,
  cursor: "pointer",
  background: isSelected ? "var(--orca-color-bg-3)" : "transparent",
  color: isSelected ? "var(--orca-color-primary)" : "var(--orca-color-text-1)",
  transition: "background 0.15s ease",
});

const menuItemIconStyle: React.CSSProperties = {
  fontSize: 16,
  width: 24,
  textAlign: "center",
};

const menuItemContentStyle: React.CSSProperties = {
  flex: 1,
  display: "flex",
  flexDirection: "column",
  gap: 2,
};

const menuItemLabelStyle: React.CSSProperties = {
  fontSize: 13,
  fontWeight: 500,
};

const menuItemDescStyle: React.CSSProperties = {
  fontSize: 11,
  color: "var(--orca-color-text-3)",
  lineHeight: 1.3,
};

const checkIconStyle: React.CSSProperties = {
  fontSize: 14,
  color: "var(--orca-color-primary)",
};

// ============================================================================
// Component
// ============================================================================

export default function ModeSelectorButton() {
  const snap = useSnapshot(chatModeStore);
  const toolSnap = useSnapshot(toolStore);
  const currentMode = snap.mode as ChatMode;
  const isAgentMode = currentMode === "agent";

  // Get current mode config
  const currentConfig = useMemo(() => {
    return MODE_CONFIGS[currentMode];
  }, [currentMode]);

  // Handle mode selection
  const handleSelectMode = useCallback((mode: ChatMode, close: () => void) => {
    setMode(mode);
    close();
  }, []);

  // Handle tool button click
  const handleToolClick = useCallback(() => {
    toggleToolPanel();
  }, []);

  // Render menu item
  const renderMenuItem = useCallback(
    (mode: ChatMode, close: () => void) => {
      const config = MODE_CONFIGS[mode];
      const isSelected = mode === currentMode;

      return createElement(
        "div",
        {
          key: mode,
          style: menuItemStyle(isSelected),
          onClick: () => handleSelectMode(mode, close),
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
        // Icon
        createElement("i", { className: config.icon, style: menuItemIconStyle }),
        // Content
        createElement(
          "div",
          { style: menuItemContentStyle },
          createElement("div", { style: menuItemLabelStyle }, config.label),
          createElement("div", { style: menuItemDescStyle }, config.description)
        ),
        // Check mark for selected
        isSelected &&
          createElement("i", {
            className: "ti ti-check",
            style: checkIconStyle,
          })
      );
    },
    [currentMode, handleSelectMode]
  );

  // Render menu
  const renderMenu = useCallback(
    (close: () => void) => {
      return createElement(
        "div",
        { style: menuContainerStyle },
        renderMenuItem("agent", close),
        renderMenuItem("ask", close)
      );
    },
    [renderMenuItem]
  );

  return createElement(
    "div",
    { style: { display: "flex", alignItems: "center", gap: 4 } },
    // Tool button (only in Agent mode)
    isAgentMode && createElement(
      Button,
      {
        variant: "plain",
        onClick: handleToolClick,
        title: "工具管理",
        style: {
          ...selectorButtonStyle,
          color: toolSnap.showPanel ? "var(--orca-color-primary)" : "var(--orca-color-text-2)",
        },
      },
      createElement("i", { className: "ti ti-tool" })
    ),
    // Mode selector
    createElement(
      ContextMenu as any,
      {
        defaultPlacement: "top",
        placement: "vertical",
        alignment: "left",
        allowBeyondContainer: true,
        offset: 8,
        menu: renderMenu,
      },
      (openMenu: (e: any) => void) =>
        createElement(
          Button,
          {
            variant: "plain",
            onClick: openMenu,
            title: `${currentConfig.label}: ${currentConfig.description}`,
            style: selectorButtonStyle,
          },
          createElement("i", { className: currentConfig.icon })
        )
    )
  );
}
