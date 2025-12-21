/**
 * ChatInput - 整合输入区域组件
 * 包含: Context Chips + @ 触发按钮 + 输入框 + 发送按钮 + 模型选择器
 */

import type { DbId } from "../orca.d.ts";
import type { AiModelOption } from "../settings/ai-chat-settings";
import { contextStore } from "../store/context-store";
import ContextChips from "./ContextChips";
import ContextPicker from "./ContextPicker";
import { ModelSelectorButton } from "./chat-input";
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
  disabled?: boolean;
  currentPageId: DbId | null;
  currentPageTitle: string;
  modelOptions: AiModelOption[];
  selectedModel: string;
  onModelChange: (model: string) => void;
  onAddModel?: (model: string) => void | Promise<void>;
};

export default function ChatInput({
  onSend,
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
  const addContextBtnRef = useRef<HTMLElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const contextSnap = useSnapshot(contextStore);

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

  return createElement(
    "div",
    { style: containerStyle },

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
      { style: inputWrapperStyle(isFocused) },

      // Toolbar (Context button + Model selector)
      createElement(
        "div",
        { style: toolbarStyle },
        createElement(
          "div",
          {
            ref: addContextBtnRef as any,
            style: { display: "flex", alignItems: "center", gap: 8 },
          },
          createElement(
            Button,
            {
              variant: "plain",
              onClick: () => setPickerOpen(!pickerOpen),
              style: addContextButtonStyle,
            },
            createElement("i", { className: "ti ti-at", style: { marginRight: 4 } }),
            "Add context"
          )
        ),
        createElement(ModelSelectorButton, {
          modelOptions,
          selectedModel,
          onModelChange,
          onAddModel,
        })
      ),

      // TextArea and Send Button Row
      createElement(
        "div",
        {
          style: {
            display: "flex",
            gap: 8,
            alignItems: "flex-end",
          },
        },
        createElement(CompositionTextArea as any, {
          ref: textareaRef as any,
          placeholder: "Type a message... (@ for context)",
          value: text,
          onChange: (e: any) => setText(e.target.value),
          onKeyDown: handleKeyDown,
          onFocus: () => setIsFocused(true),
          onBlur: () => setIsFocused(false),
          disabled,
          style: textareaStyle,
        }),
        createElement(
          Button,
          {
            variant: "solid",
            disabled: !canSend,
            onClick: handleSend,
            style: sendButtonStyle(canSend),
          },
          disabled
            ? createElement("i", { className: "ti ti-dots" })
            : createElement("i", { className: "ti ti-arrow-up" })
        )
      )
    )
  );
}
