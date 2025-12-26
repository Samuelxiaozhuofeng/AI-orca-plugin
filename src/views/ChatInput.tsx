/**
 * ChatInput - 整合输入区域组件
 * 包含: Context Chips + @ 触发按钮 + 输入框 + 发送按钮 + 模型选择器 + Skill选择器
 */

import type { DbId } from "../orca.d.ts";
import type { AiModelOption } from "../settings/ai-chat-settings";
import type { Skill } from "../store/skill-store";
import { contextStore } from "../store/context-store";
import { skillStore, clearSkill } from "../store/skill-store";
import ContextChips from "./ContextChips";
import ContextPicker from "./ContextPicker";
import SkillPicker from "./SkillPicker";
import { ModelSelectorButton, InjectionModeSelector } from "./chat-input";
import {
  containerStyle,
  inputWrapperStyle,
  toolbarStyle,
  addContextButtonStyle,
  textareaStyle,
  sendButtonStyle,
} from "./chat-input";

const React = window.React as unknown as {
  createElement: typeof window.React.createElement;
  useRef: <T>(value: T) => { current: T };
  useState: <T>(initial: T | (() => T)) => [T, (next: T | ((prev: T) => T)) => void];
  useCallback: <T extends (...args: any[]) => any>(fn: T, deps: any[]) => T;
};
const { createElement, useRef, useState, useCallback } = React;

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

// Enhanced Styles from UI_REFACTOR.md
const inputContainerStyle: React.CSSProperties = {
  padding: "16px",
  borderTop: "1px solid var(--orca-color-border)",
  background: "var(--orca-color-bg-1)",
  // backdropFilter: "blur(10px)", // Optional if environment supports it
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
  const [skillPickerOpen, setSkillPickerOpen] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const addContextBtnRef = useRef<HTMLElement | null>(null);
  const skillBtnRef = useRef<HTMLElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const contextSnap = useSnapshot(contextStore);
  const skillSnap = useSnapshot(skillStore);

  const canSend = text.trim().length > 0 && !disabled;

  const handleSend = useCallback(() => {
    const val = textareaRef.current?.value || text;
    const trimmed = val.trim();
    if (!trimmed || disabled) return;

    onSend(trimmed);
    setText("");
    // Also clear DOM directly to ensure UI reflects the change immediately
    if (textareaRef.current) {
      textareaRef.current.value = "";
    }
  }, [disabled, onSend, text]);

  const handleKeyDown = useCallback(
    (e: any) => {
      // Enter 发送，Shift+Enter 换行
      if (e.key === "Enter" && !e.shiftKey) {
        if (e.nativeEvent?.isComposing) return;
        e.preventDefault();
        handleSend();
        return;
      }
      // @ 触发 context picker（仅当在行首或空格后输入 @）
      if (e.key === "@") {
        const value = e.target.value || "";
        const pos = e.target.selectionStart || 0;
        const charBefore = pos > 0 ? value[pos - 1] : "";
        if (pos === 0 || charBefore === " " || charBefore === "\n") {
          e.preventDefault();
          setPickerOpen(true);
        }
      }
      // / 触发 skill picker（仅当在行首或空格后输入 /）
      if (e.key === "/") {
        const value = e.target.value || "";
        const pos = e.target.selectionStart || 0;
        const charBefore = pos > 0 ? value[pos - 1] : "";
        if (pos === 0 || charBefore === " " || charBefore === "\n") {
          e.preventDefault();
          setSkillPickerOpen(true);
        }
      }
    },
    [handleSend]
  );

  const handlePickerClose = useCallback(() => {
    setPickerOpen(false);
    // Restore focus to textarea after picker closes
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 0);
  }, []);

  const handleSkillPickerClose = useCallback(() => {
    setSkillPickerOpen(false);
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 0);
  }, []);

  const handleSkillSelect = useCallback((skill: Skill) => {
    // Skill 已在 SkillPicker 中通过 setActiveSkill 设置
    setSkillPickerOpen(false);
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 0);
  }, []);

  return createElement(
    "div",
    { style: inputContainerStyle },

    // Active Skill 指示器
    skillSnap.activeSkill && createElement(
      "div",
      {
        style: {
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "8px 12px",
          marginBottom: 8,
          background: "var(--orca-color-primary-1, #e3f2fd)",
          borderRadius: 8,
          fontSize: 13,
        },
      },
      createElement("i", { 
        className: skillSnap.activeSkill.type === "tools" ? "ti ti-tool" : "ti ti-sparkles",
        style: { color: "var(--orca-color-primary)" },
      }),
      createElement("span", { style: { flex: 1 } }, `技能: ${skillSnap.activeSkill.name}`),
      createElement(
        Button,
        {
          variant: "plain",
          onClick: () => clearSkill(),
          style: { padding: 2 },
        },
        createElement("i", { className: "ti ti-x", style: { fontSize: 14 } })
      )
    ),

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

    // Skill Picker 悬浮菜单
    createElement(SkillPicker, {
      open: skillPickerOpen,
      onClose: handleSkillPickerClose,
      onSelect: handleSkillSelect,
      anchorRef: skillBtnRef as any,
    }),

    // Input Wrapper
    createElement(
      "div",
      { style: textareaWrapperStyle(isFocused) },

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
        
        // Left Tools: @ Button + / Skill Button + Model Selector + Injection Mode Selector
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
          createElement(
            "div",
            {
              ref: skillBtnRef as any,
              style: { display: "flex", alignItems: "center" },
            },
            createElement(
              Button,
              {
                variant: "plain",
                onClick: () => setSkillPickerOpen(!skillPickerOpen),
                title: "Select Skill (/)",
                style: { padding: "4px" },
              },
              createElement("i", { className: "ti ti-sparkles" })
            )
          ),
          createElement(ModelSelectorButton, {
            modelOptions,
            selectedModel,
            onModelChange,
            onAddModel,
          }),
          createElement(InjectionModeSelector, null)
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
                  background: "var(--orca-color-error, #cf222e)" // Use error color for stop action
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
