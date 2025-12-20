import type { DbId } from "../orca.d.ts";
import { contextStore } from "../store/context-store";
import ContextChips from "./ContextChips";
import ContextPicker from "./ContextPicker";

const React = window.React as unknown as {
  createElement: typeof window.React.createElement;
  useRef: <T>(value: T) => { current: T };
  useState: <T>(
    initial: T | (() => T),
  ) => [T, (next: T | ((prev: T) => T)) => void];
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
};

/**
 * ChatInput - 整合输入区域组件
 * 包含: Context Chips + @ 触发按钮 + 输入框 + 发送按钮
 */
export default function ChatInput({
  onSend,
  disabled = false,
  currentPageId,
  currentPageTitle,
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
    {
      style: {
        padding: "16px",
        borderTop: "1px solid var(--orca-color-border)",
        background: "var(--orca-color-bg-1)",
        // Glassmorphism effect removed to fix fixed-position child (ContextPicker)
        // backdropFilter: "blur(10px)", 
        position: "relative",
        zIndex: 20,
      },
    },

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
        {
            style: {
                display: "flex",
                flexDirection: "column",
                gap: "8px",
                background: "var(--orca-color-bg-2)",
                borderRadius: "24px",
                padding: "12px 16px",
                border: isFocused 
                    ? "1px solid var(--orca-color-primary, #007bff)" 
                    : "1px solid var(--orca-color-border)",
                boxShadow: isFocused 
                    ? "0 4px 12px rgba(0,0,0,0.05)" 
                    : "0 2px 8px rgba(0,0,0,0.02)",
                transition: "all 0.2s ease",
            }
        },
        // Toolbar (Context button)
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
                    style: {
                        padding: "2px 8px",
                        height: "24px",
                        fontSize: 12,
                        color: "var(--orca-color-text-2)",
                        borderRadius: "12px",
                        background: "var(--orca-color-bg-3)",
                    },
                },
                createElement("i", { className: "ti ti-at", style: { marginRight: 4 } }),
                "Add context"
            )
        ),
        // TextArea and Send Button Row
        createElement(
            "div",
            {
                style: {
                    display: "flex",
                    gap: 8,
                    alignItems: "flex-end",
                }
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
                style: {
                    flex: 1,
                    resize: "none",
                    minHeight: 24,
                    maxHeight: 200,
                    background: "transparent",
                    border: "none",
                    padding: 0,
                    outline: "none",
                    lineHeight: "1.5",
                    fontSize: "15px",
                },
            }),
            createElement(
                Button,
                {
                    variant: "solid",
                    disabled: !canSend,
                    onClick: handleSend,
                    style: {
                        borderRadius: "50%",
                        width: "32px",
                        height: "32px",
                        minWidth: "32px",
                        padding: 0,
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        opacity: canSend ? 1 : 0.5,
                        transition: "opacity 0.2s",
                    }
                },
                disabled 
                    ? createElement("i", { className: "ti ti-dots" })
                    : createElement("i", { className: "ti ti-arrow-up" })
            )
        )
    )
  );
}

