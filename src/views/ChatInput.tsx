import type { DbId } from "../orca.d.ts";
import { contextStore } from "../store/context-store";
import ContextChips from "./ContextChips";
import ContextPicker from "./ContextPicker";
import type { AiModelOption } from "../settings/ai-chat-settings";

const React = window.React as unknown as {
  createElement: typeof window.React.createElement;
  useRef: <T>(value: T) => { current: T };
  useState: <T>(
    initial: T | (() => T),
  ) => [T, (next: T | ((prev: T) => T)) => void];
  useMemo: <T>(fn: () => T, deps: any[]) => T;
  useCallback: <T extends (...args: any[]) => any>(fn: T, deps: any[]) => T;
};
const { createElement, useRef, useState, useMemo, useCallback } = React;

const { useSnapshot } = (window as any).Valtio as {
  useSnapshot: <T extends object>(obj: T) => T;
};
const { Button, CompositionTextArea, ContextMenu, Menu, MenuText, MenuTitle, MenuSeparator, Input } =
  orca.components;

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

/**
 * ChatInput - 整合输入区域组件
 * 包含: Context Chips + @ 触发按钮 + 输入框 + 发送按钮
 */
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
  const [modelFilter, setModelFilter] = useState("");
  const [modelDraft, setModelDraft] = useState("");
  const [addingModel, setAddingModel] = useState(false);
  const addContextBtnRef = useRef<HTMLElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const contextSnap = useSnapshot(contextStore);

  const canSend = text.trim().length > 0 && !disabled;

  const selectedModelLabel = useMemo(() => {
    const hit = modelOptions.find((o) => o.value === selectedModel);
    return hit?.label || selectedModel || "Select model";
  }, [modelOptions, selectedModel]);

  const filteredModelOptions = useMemo(() => {
    const q = modelFilter.trim().toLowerCase();
    if (!q) return modelOptions;
    return modelOptions.filter((o) => {
      const label = (o.label || "").toLowerCase();
      const value = (o.value || "").toLowerCase();
      return label.includes(q) || value.includes(q);
    });
  }, [modelFilter, modelOptions]);

  const modelGroups = useMemo(() => {
    const order = ["Built-in", "Custom", "Other"];
    const grouped = new Map<string, AiModelOption[]>();
    for (const opt of filteredModelOptions) {
      const g = opt.group || "Other";
      const arr = grouped.get(g);
      if (arr) arr.push(opt);
      else grouped.set(g, [opt]);
    }
    const keys = [
      ...order.filter((k) => grouped.has(k)),
      ...[...grouped.keys()].filter((k) => !order.includes(k)).sort(),
    ];
    return keys.map((k) => ({ group: k, options: grouped.get(k) || [] }));
  }, [filteredModelOptions]);

  const handleAddModel = useCallback(
    async (close: () => void) => {
      const next = modelDraft.trim();
      if (!next) return;

      // If already exists, just select it.
      if (modelOptions.some((o) => o.value === next)) {
        onModelChange(next);
        setModelDraft("");
        close();
        return;
      }

      if (!onAddModel) {
        onModelChange(next);
        setModelDraft("");
        close();
        return;
      }

      try {
        setAddingModel(true);
        await onAddModel(next);
        onModelChange(next);
        setModelDraft("");
        close();
      } finally {
        setAddingModel(false);
      }
    },
    [modelDraft, modelOptions, onAddModel, onModelChange],
  );

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
                style: {
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                },
            },
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
              ),
            ),
            createElement(
              ContextMenu as any,
              {
                defaultPlacement: "top",
                placement: "vertical",
                alignment: "right",
                allowBeyondContainer: true,
                offset: 8,
                menu: (close: () => void) => {
                  const menuItems: any[] = [];
                  if (modelGroups.length === 0) {
                    menuItems.push(
                      createElement(MenuText as any, {
                        key: "empty",
                        title: "No models found",
                        disabled: true,
                      }),
                    );
                  } else {
                    for (let i = 0; i < modelGroups.length; i++) {
                      const { group, options } = modelGroups[i];
                      menuItems.push(createElement(MenuTitle as any, { key: `t:${group}`, title: group }));
                      menuItems.push(
                        ...options.map((opt) => {
                          const isSelected = opt.value === selectedModel;
                          const subtitle = opt.label === opt.value ? undefined : opt.value;
                          return createElement(MenuText as any, {
                            key: opt.value,
                            title: opt.label,
                            subtitle,
                            postIcon: isSelected ? "ti ti-check" : undefined,
                            onClick: () => {
                              if (opt.value !== selectedModel) onModelChange(opt.value);
                              close();
                            },
                          });
                        }),
                      );
                      if (i !== modelGroups.length - 1) {
                        menuItems.push(createElement(MenuSeparator as any, { key: `s:${group}` }));
                      }
                    }
                  }

                  return createElement(
                    "div",
                    {
                      style: {
                        width: 520,
                        padding: 12,
                        background: "var(--orca-color-bg-1)",
                      },
                    },
                    createElement(
                      "div",
                      { style: { display: "flex", gap: 12 } },
                      // Left: model list
                      createElement(
                        "div",
                        {
                          style: {
                            flex: 1,
                            minWidth: 0,
                            borderRight: "1px solid var(--orca-color-border)",
                            paddingRight: 12,
                          },
                        },
                        createElement(Input as any, {
                          placeholder: "Filter models…",
                          value: modelFilter,
                          onChange: (e: any) => setModelFilter(e.target.value),
                          pre: createElement("i", { className: "ti ti-search" }),
                        }),
                        createElement(
                          "div",
                          {
                            style: {
                              marginTop: 8,
                              maxHeight: 280,
                              overflow: "auto",
                              paddingRight: 4,
                            },
                          },
                          createElement(
                            Menu as any,
                            { keyboardNav: true, navDirection: "vertical" },
                            ...menuItems,
                          ),
                        ),
                      ),
                      // Right: add model
                      createElement(
                        "div",
                        { style: { width: 220, flexShrink: 0 } },
                        createElement(
                          "div",
                          {
                            style: {
                              fontSize: 12,
                              fontWeight: 600,
                              marginBottom: 8,
                              color: "var(--orca-color-text-1)",
                            },
                          },
                          "Add model",
                        ),
                        createElement(Input as any, {
                          placeholder: "e.g. gpt-4.1-mini",
                          value: modelDraft,
                          onChange: (e: any) => setModelDraft(e.target.value),
                          onKeyDown: (e: any) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              void handleAddModel(close);
                            }
                          },
                          pre: createElement("i", { className: "ti ti-plus" }),
                        }),
                        createElement(
                          Button,
                          {
                            variant: "solid",
                            disabled: addingModel || !modelDraft.trim(),
                            onClick: () => void handleAddModel(close),
                            style: { marginTop: 8, width: "100%" },
                          },
                          addingModel ? "Adding..." : "Add",
                        ),
                        createElement(
                          "div",
                          {
                            style: {
                              marginTop: 8,
                              fontSize: 11,
                              color: "var(--orca-color-text-3)",
                              lineHeight: 1.4,
                            },
                          },
                          "Models share the same API URL/Key (for now).",
                        ),
                      ),
                    ),
                  );
                },
              },
              (openMenu: (e: any) => void) =>
                createElement(
                  Button,
                  {
                    variant: "plain",
                    onClick: openMenu,
                    title: `Model: ${selectedModel}`,
                    style: {
                      padding: "2px 10px",
                      height: "24px",
                      fontSize: 12,
                      color: "var(--orca-color-text-2)",
                      borderRadius: "12px",
                      background: "var(--orca-color-bg-3)",
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      maxWidth: 240,
                    },
                  },
                  createElement("i", { className: "ti ti-cpu" }),
                  createElement(
                    "span",
                    {
                      style: {
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                        maxWidth: 170,
                      },
                    },
                    selectedModelLabel,
                  ),
                  createElement("i", { className: "ti ti-chevron-up" }),
                ),
            ),
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
