/**
 * ChatInput - 整合输入区域组件
 * 包含: Context Chips + @ 触发按钮 + 输入框 + 发送按钮 + 模型选择器
 */

import type { DbId } from "../orca.d.ts";
import type { AiModelOption } from "../settings/ai-chat-settings";
import { contextStore } from "../store/context-store";
import ContextChips from "./ContextChips";
import ContextPicker from "./ContextPicker";
import { ModelSelectorButton, InjectionModeSelector, ModeSelectorButton } from "./chat-input";
import { loadFromStorage } from "../store/chat-mode-store";
import {
  textareaStyle,
  sendButtonStyle,
} from "./chat-input";

const React = window.React as unknown as {
  createElement: typeof window.React.createElement;
  useRef: <T>(value: T) => { current: T };
  useState: <T>(initial: T | (() => T)) => [T, (next: T | ((prev: T) => T)) => void];
  useCallback: <T extends (...args: any[]) => any>(fn: T, deps: any[]) => T;
  useEffect: (effect: () => void | (() => void), deps?: any[]) => void;
  useMemo: <T>(factory: () => T, deps: any[]) => T;
};
const { createElement, useRef, useState, useCallback, useEffect, useMemo } = React;

// 斜杠命令定义
const SLASH_COMMANDS = [
  { command: "/timeline", description: "以时间线格式展示结果" },
];

const { useSnapshot } = (window as any).Valtio as {
  useSnapshot: <T extends object>(obj: T) => T;
};
const { Button, CompositionTextArea } = orca.components;

type Props = {
  onSend: (message: string) => void;
  onStop?: () => void;
  disabled?: boolean;
  currentPageId: DbId | null;
  currentPageTitle: string;
  modelOptions: AiModelOption[];
  selectedModel: string;
  onModelChange: (model: string) => void;
  onAddModel?: (model: string) => void | Promise<void>;
};

// Enhanced Styles
const inputContainerStyle: React.CSSProperties = {
  padding: "16px",
  borderTop: "1px solid var(--orca-color-border)",
  background: "var(--orca-color-bg-1)",
};

const textareaWrapperStyle = (focused: boolean): React.CSSProperties => ({
  display: "flex",
  flexDirection: "column",
  gap: "8px",
  background: "var(--orca-color-bg-2)",
  borderRadius: "24px",
  padding: "12px 16px",
  border: focused 
    ? "1px solid var(--orca-color-primary, #007bff)" 
    : "1px solid var(--orca-color-border)",
  boxShadow: focused
    ? "0 4px 12px rgba(0,123,255,0.12)"
    : "0 2px 8px rgba(0,0,0,0.04)",
  transition: "all 0.2s ease",
});

export default function ChatInput({
  onSend,
  onStop,
  disabled = false,
  currentPageId,
  currentPageTitle,
  modelOptions,
  selectedModel,
  onModelChange,
  onAddModel,
}: Props) {
  const [text, setText] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [slashMenuOpen, setSlashMenuOpen] = useState(false);
  const [slashMenuIndex, setSlashMenuIndex] = useState(0);
  const addContextBtnRef = useRef<HTMLElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const contextSnap = useSnapshot(contextStore);

  // 检测是否显示斜杠命令菜单
  const filteredCommands = useMemo(() => {
    if (!text.startsWith("/")) return [];
    const query = text.toLowerCase();
    return SLASH_COMMANDS.filter(cmd => cmd.command.toLowerCase().startsWith(query));
  }, [text]);

  useEffect(() => {
    if (filteredCommands.length > 0 && text.startsWith("/") && !text.includes(" ")) {
      setSlashMenuOpen(true);
      setSlashMenuIndex(0);
    } else {
      setSlashMenuOpen(false);
    }
  }, [filteredCommands, text]);

  // Load chat mode from storage on mount (Requirements: 5.2)
  useEffect(() => {
    loadFromStorage();
  }, []);

  const canSend = text.trim().length > 0 && !disabled;

  const handleSend = useCallback(() => {
    const val = textareaRef.current?.value || text;
    const trimmed = val.trim();
    if (!trimmed || disabled) return;

    onSend(trimmed);
    setText("");
    if (textareaRef.current) {
      textareaRef.current.value = "";
    }
  }, [disabled, onSend, text]);

  const handleKeyDown = useCallback(
    (e: any) => {
      // 斜杠菜单键盘导航
      if (slashMenuOpen && filteredCommands.length > 0) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setSlashMenuIndex(i => (i + 1) % filteredCommands.length);
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setSlashMenuIndex(i => (i - 1 + filteredCommands.length) % filteredCommands.length);
          return;
        }
        if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
          e.preventDefault();
          const cmd = filteredCommands[slashMenuIndex];
          if (cmd) {
            setText(cmd.command + " ");
            if (textareaRef.current) {
              textareaRef.current.value = cmd.command + " ";
            }
          }
          setSlashMenuOpen(false);
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          setSlashMenuOpen(false);
          return;
        }
      }

      if (e.key === "Enter" && !e.shiftKey) {
        if (e.nativeEvent?.isComposing) return;
        e.preventDefault();
        handleSend();
        return;
      }
      if (e.key === "@") {
        const value = e.target.value || "";
        const pos = e.target.selectionStart || 0;
        const charBefore = pos > 0 ? value[pos - 1] : "";
        if (pos === 0 || charBefore === " " || charBefore === "\n") {
          e.preventDefault();
          setPickerOpen(true);
        }
      }
    },
    [handleSend, slashMenuOpen, filteredCommands, slashMenuIndex]
  );

  const handlePickerClose = useCallback(() => {
    setPickerOpen(false);
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 0);
  }, []);

  return createElement(
    "div",
    { style: inputContainerStyle },

    // Context Chips 区域
    createElement(ContextChips, { items: contextSnap.selected }),

    // Context Picker 悬浮菜单
    createElement(ContextPicker, {
      open: pickerOpen,
      onClose: handlePickerClose,
      currentPageId,
      currentPageTitle,
      anchorRef: addContextBtnRef as any,
    }),

    // Input Wrapper
    createElement(
      "div",
      { style: { ...textareaWrapperStyle(isFocused), position: "relative" } },

      // Slash Command Menu
      slashMenuOpen && filteredCommands.length > 0 && createElement(
        "div",
        {
          style: {
            position: "absolute",
            bottom: "100%",
            left: 0,
            right: 0,
            marginBottom: "4px",
            background: "var(--orca-color-bg-1)",
            border: "1px solid var(--orca-color-border)",
            borderRadius: "8px",
            boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
            overflow: "hidden",
            zIndex: 100,
          },
        },
        ...filteredCommands.map((cmd, index) =>
          createElement(
            "div",
            {
              key: cmd.command,
              onClick: () => {
                setText(cmd.command + " ");
                if (textareaRef.current) {
                  textareaRef.current.value = cmd.command + " ";
                  textareaRef.current.focus();
                }
                setSlashMenuOpen(false);
              },
              style: {
                padding: "8px 12px",
                cursor: "pointer",
                background: index === slashMenuIndex ? "var(--orca-color-bg-3)" : "transparent",
                display: "flex",
                alignItems: "center",
                gap: "8px",
              },
            },
            createElement("span", { style: { fontWeight: 600, color: "var(--orca-color-primary)" } }, cmd.command),
            createElement("span", { style: { color: "var(--orca-color-text-2)", fontSize: "12px" } }, cmd.description)
          )
        )
      ),

      // Row 1: TextArea
      createElement(CompositionTextArea as any, {
        ref: textareaRef as any,
        placeholder: "Ask AI...",
        value: text,
        onChange: (e: any) => setText(e.target.value),
        onKeyDown: handleKeyDown,
        onFocus: () => setIsFocused(true),
        onBlur: () => setIsFocused(false),
        disabled,
        style: { ...textareaStyle, width: "100%", background: "transparent", border: "none", padding: 0, minHeight: "24px" },
      }),

      // Row 2: Bottom Toolbar (Tools Left, Send Right)
      createElement(
        "div",
        { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } },
        
        // Left Tools: @ Button + Model Selector + Injection Mode Selector
        createElement(
          "div",
          { style: { display: "flex", gap: 8, alignItems: "center" } },
          createElement(
            "div",
            {
              ref: addContextBtnRef as any,
              style: { display: "flex", alignItems: "center" },
            },
            createElement(
              Button,
              {
                variant: "plain",
                onClick: () => setPickerOpen(!pickerOpen),
                title: "Add Context (@)",
                style: { padding: "4px" },
              },
              createElement("i", { className: "ti ti-at" })
            )
          ),
          createElement(ModelSelectorButton, {
            modelOptions,
            selectedModel,
            onModelChange,
            onAddModel,
          }),
          createElement(InjectionModeSelector, null),
          createElement(ModeSelectorButton, null)
        ),

        // Right Tool: Send/Stop Button
        disabled && onStop
          ? createElement(
              Button,
              {
                variant: "solid",
                onClick: onStop,
                title: "Stop generation",
                style: { 
                  ...sendButtonStyle(true), 
                  borderRadius: "50%", 
                  width: "32px", 
                  height: "32px", 
                  padding: 0, 
                  display: "flex", 
                  alignItems: "center", 
                  justifyContent: "center",
                  background: "var(--orca-color-error, #cf222e)"
                },
              },
              createElement("i", { className: "ti ti-player-stop" })
            )
          : createElement(
              Button,
              {
                variant: "solid",
                disabled: !canSend,
                onClick: handleSend,
                style: { ...sendButtonStyle(canSend), borderRadius: "50%", width: "32px", height: "32px", padding: 0, display: "flex", alignItems: "center", justifyContent: "center" },
              },
              createElement("i", { className: "ti ti-arrow-up" })
            )
      )
    )
  );
}
