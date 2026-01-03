/**
 * DisplaySettingsPanel Component
 * 显示设置面板
 * 
 * Provides UI controls for:
 * - Font size selection (小/中/大)
 * - Compact mode toggle
 * - Timestamp visibility toggle
 * 
 * **Feature: chat-ui-enhancement**
 * **Validates: Requirements 12.1, 12.2, 12.3**
 */

import {
  displaySettingsStore,
  setFontSize,
  setCompactMode,
  setShowTimestamps,
  FontSize,
  fontSizeMap,
} from "../store/display-settings-store";

const React = window.React as unknown as {
  createElement: typeof window.React.createElement;
  useState: <T>(initial: T | (() => T)) => [T, (next: T | ((prev: T) => T)) => void];
  useEffect: (fn: () => void | (() => void), deps: any[]) => void;
};
const { createElement, useState, useEffect } = React;

const { useSnapshot } = (window as any).Valtio as {
  useSnapshot: <T extends object>(proxyObject: T) => T;
};

interface DisplaySettingsPanelProps {
  onClose?: () => void;
}

// Font size options with labels
const fontSizeOptions: { value: FontSize; label: string }[] = [
  { value: "small", label: "小" },
  { value: "medium", label: "中" },
  { value: "large", label: "大" },
];

export default function DisplaySettingsPanel({ onClose }: DisplaySettingsPanelProps) {
  const settings = useSnapshot(displaySettingsStore);

  // Styles
  const panelStyle: React.CSSProperties = {
    padding: "16px",
    minWidth: "240px",
  };

  const titleStyle: React.CSSProperties = {
    fontSize: "14px",
    fontWeight: 600,
    color: "var(--orca-color-text-1)",
    marginBottom: "16px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
  };

  const sectionStyle: React.CSSProperties = {
    marginBottom: "16px",
  };

  const labelStyle: React.CSSProperties = {
    fontSize: "13px",
    color: "var(--orca-color-text-2)",
    marginBottom: "8px",
    display: "block",
  };

  const fontSizeButtonGroupStyle: React.CSSProperties = {
    display: "flex",
    gap: "4px",
    background: "var(--orca-color-bg-2)",
    borderRadius: "6px",
    padding: "4px",
  };

  const fontSizeButtonStyle = (isActive: boolean): React.CSSProperties => ({
    flex: 1,
    padding: "6px 12px",
    border: "none",
    borderRadius: "4px",
    background: isActive ? "var(--orca-color-primary)" : "transparent",
    color: isActive ? "white" : "var(--orca-color-text-2)",
    fontSize: "13px",
    fontWeight: isActive ? 500 : 400,
    cursor: "pointer",
    transition: "all 0.2s",
  });

  const toggleRowStyle: React.CSSProperties = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "8px 0",
  };

  const toggleLabelStyle: React.CSSProperties = {
    fontSize: "13px",
    color: "var(--orca-color-text-1)",
    display: "flex",
    alignItems: "center",
    gap: "8px",
  };

  const toggleSwitchStyle = (isOn: boolean): React.CSSProperties => ({
    width: "36px",
    height: "20px",
    borderRadius: "10px",
    background: isOn ? "var(--orca-color-primary)" : "var(--orca-color-bg-3)",
    border: `1px solid ${isOn ? "var(--orca-color-primary)" : "var(--orca-color-border)"}`,
    position: "relative",
    cursor: "pointer",
    transition: "all 0.2s",
  });

  const toggleKnobStyle = (isOn: boolean): React.CSSProperties => ({
    width: "16px",
    height: "16px",
    borderRadius: "50%",
    background: "white",
    position: "absolute",
    top: "1px",
    left: isOn ? "17px" : "1px",
    transition: "left 0.2s",
    boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
  });

  const previewStyle: React.CSSProperties = {
    marginTop: "16px",
    padding: "12px",
    background: "var(--orca-color-bg-2)",
    borderRadius: "8px",
    border: "1px solid var(--orca-color-border)",
  };

  const previewLabelStyle: React.CSSProperties = {
    fontSize: "11px",
    color: "var(--orca-color-text-3)",
    marginBottom: "8px",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
  };

  const previewMessageStyle: React.CSSProperties = {
    fontSize: fontSizeMap[settings.fontSize],
    color: "var(--orca-color-text-1)",
    padding: settings.compactMode ? "8px 12px" : "12px 16px",
    background: "var(--orca-color-bg-1)",
    borderRadius: "8px",
    marginBottom: settings.compactMode ? "6px" : "12px",
  };

  return createElement(
    "div",
    { style: panelStyle },
    // Title
    createElement(
      "div",
      { style: titleStyle },
      createElement(
        "span",
        { style: { display: "flex", alignItems: "center", gap: "8px" } },
        createElement("i", { className: "ti ti-adjustments", style: { fontSize: "16px" } }),
        "显示设置"
      ),
      onClose && createElement(
        "button",
        {
          onClick: onClose,
          style: {
            border: "none",
            background: "transparent",
            cursor: "pointer",
            padding: "4px",
            color: "var(--orca-color-text-3)",
          },
        },
        createElement("i", { className: "ti ti-x", style: { fontSize: "16px" } })
      )
    ),

    // Font Size Section
    createElement(
      "div",
      { style: sectionStyle },
      createElement("label", { style: labelStyle }, "字体大小"),
      createElement(
        "div",
        { style: fontSizeButtonGroupStyle },
        ...fontSizeOptions.map((option) =>
          createElement(
            "button",
            {
              key: option.value,
              style: fontSizeButtonStyle(settings.fontSize === option.value),
              onClick: () => setFontSize(option.value),
            },
            option.label
          )
        )
      )
    ),

    // Compact Mode Toggle
    createElement(
      "div",
      { style: toggleRowStyle },
      createElement(
        "span",
        { style: toggleLabelStyle },
        createElement("i", { className: "ti ti-layout-distribute-vertical", style: { fontSize: "16px", color: "var(--orca-color-text-3)" } }),
        "紧凑模式"
      ),
      createElement(
        "div",
        {
          style: toggleSwitchStyle(settings.compactMode) as any,
          onClick: () => setCompactMode(!settings.compactMode),
        },
        createElement("div", { style: toggleKnobStyle(settings.compactMode) })
      )
    ),

    // Timestamp Toggle
    createElement(
      "div",
      { style: toggleRowStyle },
      createElement(
        "span",
        { style: toggleLabelStyle },
        createElement("i", { className: "ti ti-clock", style: { fontSize: "16px", color: "var(--orca-color-text-3)" } }),
        "显示时间戳"
      ),
      createElement(
        "div",
        {
          style: toggleSwitchStyle(settings.showTimestamps) as any,
          onClick: () => setShowTimestamps(!settings.showTimestamps),
        },
        createElement("div", { style: toggleKnobStyle(settings.showTimestamps) })
      )
    ),

    // Preview Section
    createElement(
      "div",
      { style: previewStyle },
      createElement("div", { style: previewLabelStyle }, "预览"),
      createElement(
        "div",
        { style: previewMessageStyle },
        "这是一条示例消息"
      ),
      settings.showTimestamps && createElement(
        "div",
        {
          style: {
            fontSize: "11px",
            color: "var(--orca-color-text-3)",
            textAlign: "right",
          },
        },
        "14:30"
      )
    )
  );
}
