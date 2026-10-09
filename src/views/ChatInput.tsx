/**
 * ChatInput - 整合输入区域组件
 * 包含: Context Chips + @ 触发按钮 + 输入框 + 发送按钮 + 模型选择器 + 文件上传
 */

import type { DbId } from "../orca.d.ts";
import type { AiChatSettings } from "../settings/ai-chat-settings";
import { getModelApiConfig } from "../settings/ai-chat-settings";
import type { FileRef } from "../services/session-service";
import { buildContextForSend } from "../services/notes/context-builder";
import { contextStore, contextKey, addBlockById, clearHighPriorityContexts } from "../store/context-store";
import { estimateTokens, formatTokenCount } from "../utils/token-utils";
import { tooltipText, withTooltip } from "../utils/orca-tooltip";
import {
  uploadFile,
  getFileDisplayUrl,
  getFileIcon,
  getSupportedExtensions,
  isSupportedFile,
} from "../services/file-service";
import ContextChips from "./ContextChips";
import ContextPicker from "./ContextPicker";
import { ModelSelectorButton, WorkDirButton } from "./chat-input";
import { textareaStyle, sendButtonStyle } from "./chat-input";
import { measureMenu } from "./chat-input/chat-input-styles";

const React = window.React as unknown as {
  createElement: typeof window.React.createElement;
  Fragment: typeof window.React.Fragment;
  useRef: <T>(value: T) => { current: T };
  useState: <T>(initial: T | (() => T)) => [T, (next: T | ((prev: T) => T)) => void];
  useCallback: <T extends (...args: any[]) => any>(fn: T, deps: any[]) => T;
  useEffect: (effect: () => void | (() => void), deps?: any[]) => void;
  useMemo: <T>(factory: () => T, deps: any[]) => T;
};
const { createElement, useRef, useState, useCallback, useEffect, useMemo } = React;

const CLEAR_COMMAND = { command: "/clear", description: "清空当前对话", icon: "ti ti-eraser" };

const { useSnapshot } = (window as any).Valtio as {
  useSnapshot: <T extends object>(obj: T) => T;
};
const { Button, ContextMenu } = orca.components || {};

const BLOCK_ID_MARKER_RE = /(?:orca-block:|blockid:|block:|blockId["']?\s*[:=]\s*)(\d+)/gi;

function collectBlockIdsFromDragPayload(payload: unknown, out: Set<number>, allowBareNumbers = false): void {
  if (typeof payload === "number" && Number.isFinite(payload)) {
    if (allowBareNumbers) out.add(payload);
    return;
  }
  if (typeof payload === "string") {
    const pattern = allowBareNumbers ? /(?:orca-block:|blockid:|block:|blockId["']?\s*[:=]\s*)?(\d+)/gi : BLOCK_ID_MARKER_RE;
    for (const match of payload.matchAll(pattern)) {
      const id = Number(match[1]);
      if (Number.isFinite(id)) out.add(id);
    }
    return;
  }
  if (Array.isArray(payload)) {
    payload.forEach((item) => collectBlockIdsFromDragPayload(item, out, allowBareNumbers));
    return;
  }
  if (payload && typeof payload === "object") {
    const data = payload as Record<string, unknown>;
    ["blocks", "blockIds", "block_ids", "blockId", "block_id", "id", "ids"].forEach((key) => {
      collectBlockIdsFromDragPayload(data[key], out, true);
    });
  }
}

type Props = {
  onSend: (message: string, files?: FileRef[]) => void | Promise<void>;
  /** 输入框里提交 /clear 时调用（等同 Clear Chat） */
  onClearChat: () => void;
  onStop?: () => void;
  disabled?: boolean;
  currentPageId: DbId | null;
  currentPageTitle: string;
  /** 新的设置结构 */
  settings: AiChatSettings;
  /** 当前选中的模型 ID（可能与 settings.selectedModelId 不同，因为 session 可以覆盖） */
  selectedModel: string;
  /** 选择模型回调 */
  onModelSelect: (providerId: string, modelId: string) => void;
  /** 更新设置回调（用于平台配置修改） */
  onUpdateSettings: (settings: AiChatSettings) => void;
  /** 当前对话选的本机 AI 工作文件夹（空 = 默认文件夹） */
  workDir?: string;
  onWorkDirChange: (workDir: string | undefined) => void;
  /** 本机 AI 中转在完全放开模式下运行：输入框旁常亮红色标签 */
  localCliFullAccess?: boolean;
};

// Enhanced Styles
const inputContainerStyle: React.CSSProperties = {
  padding: "16px",
  borderTop: "none",
  background: "transparent",
};

const TOOLBAR_HIDE_BREAKPOINTS = {
  token: 520,
  workDir: 300,
};

const overflowMenuStyle: React.CSSProperties = {
  minWidth: 240,
  padding: "10px",
  boxSizing: "border-box",
  background: "var(--orca-color-bg-1)",
  display: "flex",
  flexDirection: "column",
  gap: "10px",
  maxHeight: "60vh",
  overflowY: "auto",
};

const overflowItemStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: "10px",
  padding: "6px 8px",
  borderRadius: "6px",
  background: "var(--orca-color-bg-2)",
};

const overflowItemLabelStyle: React.CSSProperties = {
  fontSize: "12px",
  color: "var(--orca-color-text-2)",
};

const textareaWrapperStyle = (focused: boolean, isDragging: boolean = false): React.CSSProperties => ({
  display: "block", // 改为 block 让 textarea 可以自动增高
  background: isDragging 
    ? "var(--orca-color-primary-bg, rgba(0, 123, 255, 0.08))" 
    : "var(--orca-color-bg-2)",
  borderRadius: "24px",
  padding: "12px 16px",
  // 保持边框宽度一致，避免跳动
  border: isDragging
    ? "2px dashed var(--orca-color-primary, #007bff)"
    : focused 
      ? "2px solid var(--orca-color-primary, #007bff)" 
      : "2px solid transparent",
  // 用 box-shadow 模拟普通状态的边框
  boxShadow: isDragging
    ? "0 4px 16px rgba(0,123,255,0.2)"
    : focused
      ? "0 4px 12px rgba(0,123,255,0.12)"
      : "0 0 0 1px var(--orca-color-border), 0 2px 8px rgba(0,0,0,0.04)",
  transition: "all 0.15s ease",
  position: "relative",
});

export default function ChatInput({
  onSend,
  onClearChat,
  onStop,
  disabled = false,
  currentPageId,
  currentPageTitle,
  settings,
  selectedModel,
  onModelSelect,
  onUpdateSettings,
  workDir,
  onWorkDirChange,
  localCliFullAccess,
}: Props) {
  const [text, setText] = useState("");
  const [overflowMenuLayout, setOverflowMenuLayout] = useState<{ width: number; alignment: "left" | "right" }>({ width: 360, alignment: "right" });
  const [pickerOpen, setPickerOpen] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [slashMenuOpen, setSlashMenuOpen] = useState(false);

  const [pendingFiles, setPendingFiles] = useState<FileRef[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [sendSuccess, setSendSuccess] = useState(false);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [toolbarWidth, setToolbarWidth] = useState(0);
  const addContextBtnRef = useRef<HTMLElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const leftToolbarRef = useRef<HTMLDivElement | null>(null);
  const contextSnap = useSnapshot(contextStore);
  const [contextContents, setContextContents] = useState<Map<string, string>>(() => new Map());
  const contextSignature = contextSnap.selected.map((ctx) => contextKey(ctx)).join("|");

  useEffect(() => {
    let cancelled = false;
    const contexts = [...contextSnap.selected];

    if (contexts.length === 0) {
      setContextContents(new Map());
      return;
    }

    Promise.all(contexts.map(async (ctx) => {
      const key = contextKey(ctx);
      try {
        const result = await buildContextForSend([ctx], {
          maxChars: Math.min(settings.maxContextChars || 60_000, 12_000),
          maxBlocks: 120,
        });
        return [key, result.text] as const;
      } catch (err: any) {
        return [key, `Context preview failed: ${String(err?.message ?? err ?? "unknown error")}`] as const;
      }
    })).then((entries) => {
      if (!cancelled) setContextContents(new Map(entries));
    });

    return () => { cancelled = true; };
  }, [contextSignature, settings.maxContextChars]);

  // 自动调整 textarea 高度
  const adjustTextareaHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    // 重置高度以获取正确的 scrollHeight
    textarea.style.height = "auto";
    // 设置新高度，限制最大高度为 360px
    const newHeight = Math.min(textarea.scrollHeight, 360);
    textarea.style.height = `${newHeight}px`;
    // 超过最大高度时显示滚动条
    textarea.style.overflowY = textarea.scrollHeight > 360 ? "auto" : "hidden";
  }, []);

  // 文本变化时调整高度
  useEffect(() => {
    adjustTextareaHeight();
  }, [text, adjustTextareaHeight]);

  // 计算 Token 预估
  const tokenEstimate = useMemo(() => {
    const inputTokens = estimateTokens(text);
    const outputTokens = Math.ceil(inputTokens * 1.5); // 预估输出为输入的 1.5 倍
    return { inputTokens, outputTokens };
  }, [text]);

  const isLocalCli = useMemo(() => getModelApiConfig(settings, selectedModel).protocol === "local-cli", [settings, selectedModel]);

  const overflowFlags = useMemo(() => {
    const width = toolbarWidth || 9999;
    const hideWorkDir = isLocalCli && width < TOOLBAR_HIDE_BREAKPOINTS.workDir;
    const hasOverflow = hideWorkDir;

    return {
      hideWorkDir,
      hasOverflow,
    };
  }, [toolbarWidth, isLocalCli]);

  const showTokenIndicator = tokenEstimate.inputTokens > 0;

  useEffect(() => {
    const query = text.startsWith("/") ? text.slice(1).toLowerCase() : null;
    setSlashMenuOpen(query !== null && !query.includes(" ") && CLEAR_COMMAND.command.startsWith("/" + query));
  }, [text]);

  useEffect(() => {
    const toolbarEl = leftToolbarRef.current;
    if (!toolbarEl || typeof ResizeObserver === "undefined") return;

    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect?.width ?? 0;
      if (width > 0) {
        setToolbarWidth(width);
      }
    });

    observer.observe(toolbarEl);
    return () => observer.disconnect();
  }, []);

  const hasContext = contextSnap.selected.length > 0;
  const canSend = (text.trim().length > 0 || pendingFiles.length > 0 || hasContext) && !disabled && !isSending;

  const handleSend = useCallback(async () => {
    const val = textareaRef.current?.value || text;
    const trimmed = val.trim();
    if ((!trimmed && pendingFiles.length === 0 && !hasContext) || disabled || isSending) return;

    setIsSending(true);
    try {
      const contentToSend = trimmed || (hasContext ? "请基于我提供的上下文回答。" : "");
      if (trimmed === "/clear") {
        onClearChat();
        setText("");
        if (textareaRef.current) {
          textareaRef.current.value = "";
        }
        return;
      }
      await onSend(contentToSend, pendingFiles.length > 0 ? pendingFiles : undefined);
      setText("");
      setPendingFiles([]);
      // 清除拖入的高优先级上下文（发送后自动移除）
      clearHighPriorityContexts();
      if (textareaRef.current) {
        textareaRef.current.value = "";
      }
      // 显示发送成功动画
      setSendSuccess(true);
      setTimeout(() => setSendSuccess(false), 800);
    } finally {
      setIsSending(false);
    }
  }, [disabled, onSend, onClearChat, text, pendingFiles, isSending, hasContext]);

  const handleKeyDown = useCallback(
    (e: any) => {
      // 斜杠菜单键盘导航
      if (slashMenuOpen) {
        if (!(e.nativeEvent?.isComposing || e.keyCode === 229) && (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey))) {
          e.preventDefault();
          setText(CLEAR_COMMAND.command + " ");
          if (textareaRef.current) {
            textareaRef.current.value = CLEAR_COMMAND.command + " ";
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
        if (e.nativeEvent?.isComposing || e.keyCode === 229) return;
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
    [handleSend, slashMenuOpen]
  );

  const handlePickerClose = useCallback(() => {
    setPickerOpen(false);
    setTimeout(() => {
      textareaRef.current?.focus();
    }, 0);
  }, []);

  // 处理文件选择
  const handleFileSelect = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    
    setIsUploading(true);
    const newFiles: FileRef[] = [];
    
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (isSupportedFile(file)) {
        const fileRef = await uploadFile(file);
        if (fileRef) {
          newFiles.push(fileRef);
        }
      } else {
        orca.notify("warn", `不支持的文件类型: ${file.name}`);
      }
    }
    
    if (newFiles.length > 0) {
      setPendingFiles(prev => [...prev, ...newFiles]);
    }
    setIsUploading(false);
  }, []);

  // 点击文件按钮
  const handleFileButtonClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  // 移除待发送的文件
  const handleRemoveFile = useCallback((index: number) => {
    setPendingFiles(prev => prev.filter((_, i) => i !== index));
  }, []);

  // 处理粘贴事件（支持图片粘贴）
  const handlePaste = useCallback(async (e: ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;

    const pastedFiles: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      // 支持图片粘贴
      if (item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) pastedFiles.push(file);
      }
    }

    if (pastedFiles.length > 0) {
      e.preventDefault();
      setIsUploading(true);
      for (const file of pastedFiles) {
        const fileRef = await uploadFile(file);
        if (fileRef) {
          setPendingFiles(prev => [...prev, fileRef]);
        }
      }
      setIsUploading(false);
    }
  }, []);

  // 处理拖拽（支持文件和 Orca 块）
  const handleDrop = useCallback(async (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingFile(false); // 重置拖拽状态
    
    const dataTransfer = e.dataTransfer;
    if (!dataTransfer) return;
    
    // 1. 检查是否是 Orca 块拖拽
    // Orca 使用自定义类型 "orca/xxx"，数据格式为 {"blocks":[blockId]}
    const blockIdSet = new Set<number>();
    
    // 查找 orca/ 开头的数据类型
    for (const type of dataTransfer.types) {
      if (type.startsWith("orca/")) {
        const data = dataTransfer.getData(type);
        if (data) {
          try {
            const parsed = JSON.parse(data);
            collectBlockIdsFromDragPayload(parsed, blockIdSet, true);
          } catch {
            collectBlockIdsFromDragPayload(data, blockIdSet);
          }
        }
      }
    }
    
    // 如果没找到 orca/ 类型，尝试其他格式
    if (blockIdSet.size === 0) {
      const textData = [
        dataTransfer.getData("text/plain"),
        dataTransfer.getData("text/uri-list"),
        dataTransfer.getData("text/html"),
      ].filter(Boolean).join("\n");
      if (textData) {
        collectBlockIdsFromDragPayload(textData, blockIdSet);
      }
    }
    const blockIds = Array.from(blockIdSet);
    
    // 处理找到的块 - 添加为上下文而不是插入文本
    if (blockIds.length > 0) {
      let addedCount = 0;
      
      for (const blockId of blockIds) {
        if (blockId <= 0) continue;
        
        try {
          // 使用 addPageById 将块添加为高优先级上下文（priority=1）
          // 高优先级上下文会排在普通上下文之前，但仍低于系统提示
          const added = addBlockById(blockId, 1);
          if (added) addedCount++;
        } catch (err) {
          console.warn("[ChatInput] Failed to add block as context:", blockId, err);
        }
      }
      
      if (addedCount > 0) {
        // 聚焦输入框
        textareaRef.current?.focus();
        return;
      }
    }
    
    // 2. 处理文件拖拽
    const files = dataTransfer.files;
    if (files && files.length > 0) {
      await handleFileSelect(files);
    }
  }, [handleFileSelect, text]);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  // 处理拖拽进入
  const handleDragEnter = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingFile(true);
  }, []);

  // 处理拖拽离开
  const handleDragLeave = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // 只有当离开整个容器时才重置状态
    const relatedTarget = e.relatedTarget as Node | null;
    const currentTarget = e.currentTarget as Node;
    if (!currentTarget.contains(relatedTarget)) {
      setIsDraggingFile(false);
    }
  }, []);

  return createElement(
    "div",
    { style: inputContainerStyle },

    // Context Chips 区域
    createElement(ContextChips, { items: contextSnap.selected, contextContents }),

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
        style: { ...textareaWrapperStyle(isFocused, isDraggingFile), position: "relative" },
        onDragEnter: handleDragEnter,
        onDragLeave: handleDragLeave,
        onDragOver: handleDragOver,
        onDrop: handleDrop,
      },

      // Drag Overlay (显示拖拽提示)
      isDraggingFile && createElement(
        "div",
        {
          style: {
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            background: "rgba(var(--orca-color-primary-rgb, 0, 123, 255), 0.05)",
            borderRadius: "22px",
            zIndex: 10,
            pointerEvents: "none",
          },
        },
        createElement("i", { 
          className: "ti ti-file-upload", 
          style: { 
            fontSize: "32px", 
            color: "var(--orca-color-primary, #007bff)",
            opacity: 0.8,
          } 
        }),
        createElement("span", {
          style: {
            fontSize: "13px",
            color: "var(--orca-color-primary, #007bff)",
            fontWeight: 500,
          },
        }, "拖放文件或块到此处")
      ),

      // Slash Command Menu - only /clear
      slashMenuOpen && createElement(
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
            maxHeight: "300px",
            overflowY: "auto",
          },
        },
        createElement("div", {
          onClick: () => {
            setText(CLEAR_COMMAND.command + " ");
            if (textareaRef.current) {
              textareaRef.current.value = CLEAR_COMMAND.command + " ";
              textareaRef.current.focus();
            }
            setSlashMenuOpen(false);
          },
          style: {
            padding: "8px 12px",
            cursor: "pointer",
            background: "var(--orca-color-bg-3)",
            display: "flex",
            alignItems: "center",
            gap: "8px",
          },
        },
          createElement("i", {
            className: CLEAR_COMMAND.icon,
            style: { fontSize: "14px", color: "var(--orca-color-primary)", width: "18px", textAlign: "center" }
          }),
          createElement("span", { style: { fontWeight: 600, color: "var(--orca-color-primary)" } }, CLEAR_COMMAND.command),
          createElement("span", { style: { color: "var(--orca-color-text-2)", fontSize: "12px" } }, CLEAR_COMMAND.description)
        )
      ),

      // 文件预览区域
      pendingFiles.length > 0 &&
        createElement(
          "div",
          {
            style: {
              display: "flex",
              flexWrap: "wrap",
              gap: "8px",
              marginBottom: "8px",
            },
          },
          ...pendingFiles.map((file, index) => {
            const isImage = file.category === "image";
            const isVideo = file.category === "video";
            const hasPreview = isImage || (isVideo && file.thumbnail);
            return createElement(
              "div",
              {
                key: `${file.path}-${index}`,
                style: {
                  position: "relative",
                  width: hasPreview ? "60px" : "auto",
                  height: hasPreview ? "60px" : "auto",
                  minWidth: hasPreview ? undefined : "80px",
                  maxWidth: hasPreview ? undefined : "150px",
                  borderRadius: "8px",
                  overflow: "hidden",
                  border: "1px solid var(--orca-color-border)",
                  background: hasPreview ? undefined : "var(--orca-color-bg-3)",
                  padding: hasPreview ? undefined : "8px 12px",
                  display: "flex",
                  flexDirection: hasPreview ? undefined : "column",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: hasPreview ? undefined : "4px",
                },
              },
              // 图片预览
              isImage
                ? createElement("img", {
                    src: getFileDisplayUrl(file),
                    alt: file.name,
                    style: {
                      width: "100%",
                      height: "100%",
                      objectFit: "cover",
                    },
                    onError: (e: any) => {
                      e.target.style.display = "none";
                    },
                  })
              // 视频缩略图预览
              : isVideo && file.thumbnail
                ? [
                    createElement("img", {
                      key: "thumb",
                      src: `data:image/jpeg;base64,${file.thumbnail}`,
                      alt: file.name,
                      style: {
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                      },
                    }),
                    // 视频播放图标
                    createElement("div", {
                      key: "play-icon",
                      style: {
                        position: "absolute",
                        top: "50%",
                        left: "50%",
                        transform: "translate(-50%, -50%)",
                        width: "24px",
                        height: "24px",
                        borderRadius: "50%",
                        background: "rgba(0,0,0,0.6)",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        pointerEvents: "none",
                      },
                    }, createElement("i", { 
                      className: "ti ti-player-play-filled", 
                      style: { color: "#fff", fontSize: "12px" } 
                    })),
                  ]
                : [
                    createElement("i", {
                      key: "icon",
                      className: getFileIcon(file.name, file.mimeType),
                      style: { fontSize: "20px", color: "var(--orca-color-primary)" },
                    }),
                    withTooltip(
                      file.name,
                      createElement(
                        "span",
                        {
                          key: "name",
                          style: {
                            fontSize: "10px",
                            color: "var(--orca-color-text-2)",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            maxWidth: "100%",
                            textAlign: "center",
                          },
                        },
                        file.name.length > 12 ? file.name.slice(0, 10) + "..." : file.name
                      )
                    ),
                  ],
              withTooltip(
                "移除文件",
                createElement(
                  "button",
                  {
                    onClick: () => handleRemoveFile(index),
                    style: {
                      position: "absolute",
                      top: "2px",
                      right: "2px",
                      width: "18px",
                      height: "18px",
                      borderRadius: "50%",
                      background: "rgba(0,0,0,0.6)",
                      color: "#fff",
                      border: "none",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "10px",
                    },
                  },
                  createElement("i", { className: "ti ti-x" })
                )
              )
            );
          }),
        isUploading && createElement(
          "div",
          {
            style: {
              width: "60px",
              height: "60px",
              borderRadius: "8px",
              border: "1px dashed var(--orca-color-border)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--orca-color-text-3)",
            },
          },
          createElement("i", { className: "ti ti-loader", style: { animation: "spin 1s linear infinite" } })
        )
      ),

      // Row 1: TextArea
      createElement("textarea", {
        ref: textareaRef as any,
        placeholder: pendingFiles.length > 0 ? "描述文件或直接发送..." : "Ask AI...",
        value: text,
        onChange: (e: any) => setText(e.target.value),
        onKeyDown: handleKeyDown,
        onFocus: () => setIsFocused(true),
        onBlur: () => setIsFocused(false),
        onPaste: handlePaste,
        onDrop: handleDrop,
        onDragOver: handleDragOver,
        disabled,
        rows: 1,
        style: { 
          ...textareaStyle, 
          width: "100%", 
          background: "transparent", 
          border: "none", 
          padding: 0, 
          minHeight: "24px",
          maxHeight: "360px",
          overflowY: "auto",
          resize: "none",
          outline: "none",
          fontFamily: "inherit",
          fontSize: "15px",
          lineHeight: "1.5",
        },
      }),

      // Row 2: Bottom Toolbar (Tools Left, Send Right)
      createElement(
        "div",
        {
          style: {
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 8,
            marginTop: "8px",
            minWidth: 0,
          },
        },

        // Left Tools: @ Button + File Button + Model Selector
        createElement(
          "div",
          {
            ref: leftToolbarRef as any,
            style: {
              display: "flex",
              gap: 8,
              alignItems: "center",
              flex: 1,
              minWidth: 0,
              overflow: "hidden",
            },
          },
          createElement(
            "div",
            {
              ref: addContextBtnRef as any,
              style: { display: "flex", alignItems: "center" },
            },
            withTooltip(
              "Add Context (@)",
              createElement(
                Button,
                {
                  variant: "plain",
                  onClick: () => setPickerOpen(!pickerOpen),
                  style: { padding: "4px" },
                },
                createElement("i", { className: "ti ti-at" })
              )
            )
          ),
          // File upload button
          createElement(
            "div",
            { style: { display: "flex", alignItems: "center" } },
            createElement("input", {
              ref: fileInputRef as any,
              type: "file",
              accept: getSupportedExtensions(),
              multiple: true,
              style: { display: "none" },
              onChange: (e: any) => handleFileSelect(e.target.files),
            }),
            withTooltip(
              "\u6dfb\u52a0\u6587\u4ef6 (\u56fe\u7247\u3001\u6587\u6863\u3001\u4ee3\u7801\u7b49)",
              createElement(
                Button,
                {
                  variant: "plain",
                  onClick: handleFileButtonClick,
                  style: { padding: "4px" },
                  disabled: isUploading,
                },
                createElement("i", { className: isUploading ? "ti ti-loader" : "ti ti-paperclip" })
              )
            )
          ),
          createElement(ModelSelectorButton, {
            settings,
            onSelect: onModelSelect,
            onUpdateSettings,
          }),
          isLocalCli && !overflowFlags.hideWorkDir && createElement(WorkDirButton, { workDir, onChange: onWorkDirChange }),
          isLocalCli && localCliFullAccess && createElement("span", {
            title: "本机 AI 在完全放开模式下运行：会不经确认直接改文件、跑命令、改笔记",
            style: { flexShrink: 0, padding: "1px 6px", borderRadius: 4, fontSize: 11, whiteSpace: "nowrap", color: "var(--orca-color-danger)", border: "1px solid var(--orca-color-danger)" },
          }, "⚠ 完全放开"),
        ),

        createElement(
          "div",
          { style: { display: "flex", alignItems: "center", gap: 8, flexShrink: 0 } },
          showTokenIndicator && withTooltip(
            tooltipText(`预估输入: ${formatTokenCount(tokenEstimate.inputTokens)} tokens
预估输出: ${formatTokenCount(tokenEstimate.outputTokens)} tokens`),
            createElement(
              "div",
              {
                style: {
                  display: "flex",
                  alignItems: "center",
                  gap: "4px",
                  fontSize: "11px",
                  color: "var(--orca-color-text-3)",
                  padding: "2px 8px",
                  background: "var(--orca-color-bg-3)",
                  borderRadius: "10px",
                  whiteSpace: "nowrap",
                  flexShrink: 0,
                },
              },
              createElement("i", { className: "ti ti-coins", style: { fontSize: "12px" } }),
              `~${formatTokenCount(tokenEstimate.inputTokens)}`
            )
          ),
          overflowFlags.hasOverflow && createElement(
            ContextMenu as any,
            {
              defaultPlacement: "top",
              placement: "vertical",
              alignment: overflowMenuLayout.alignment,
              allowBeyondContainer: true,
              offset: 8,
              menu: (close: () => void) =>
                createElement(
                  "div",
                  { style: { ...overflowMenuStyle, minWidth: Math.min(240, overflowMenuLayout.width), maxWidth: overflowMenuLayout.width } },
                  overflowFlags.hideWorkDir && createElement(
                    "div",
                    { style: overflowItemStyle },
                    createElement("span", { style: overflowItemLabelStyle }, "工作文件夹"),
                    createElement(WorkDirButton, { workDir, onChange: onWorkDirChange })
                  ),
              ),
            },
            (openMenu: (e: any) => void) =>
              withTooltip(
                "\u66f4\u591a\u64cd\u4f5c",
                createElement(
                  Button,
                  {
                    variant: "plain",
                    onClick: (e: any) => {
                      setOverflowMenuLayout(measureMenu(e.currentTarget, "right", 160, 360));
                      openMenu(e);
                    },
                    style: { padding: "4px" },
                  },
                  createElement("i", { className: "ti ti-dots" })
                )
              )
          ),
          // Right Tool: Send/Stop Button
          disabled && onStop
            ? withTooltip(
                "Stop generation",
                createElement(
                  Button,
                  {
                    variant: "solid",
                    onClick: onStop,
                    style: {
                      ...sendButtonStyle(true),
                      borderRadius: "50%",
                      width: "32px",
                      height: "32px",
                      padding: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: "var(--orca-color-error, #cf222e)",
                    },
                  },
                  createElement("i", { className: "ti ti-player-stop" })
                )
              )
            : withTooltip(
                isSending ? "正在发送..." : sendSuccess ? "发送成功" : "发送消息",
                createElement(
                  Button,
                  {
                    variant: "solid",
                    disabled: !canSend,
                    onClick: handleSend,
                    className: isSending ? "send-btn-sending" : sendSuccess ? "send-btn-success" : "",
                    style: {
                      ...sendButtonStyle(canSend || sendSuccess),
                      borderRadius: "50%",
                      width: "32px",
                      height: "32px",
                      padding: 0,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      background: sendSuccess 
                        ? "var(--orca-color-success, #10b981)" 
                        : undefined,
                      transition: "all 0.2s ease",
                    },
                  },
                  createElement("i", {
                    className: sendSuccess 
                      ? "ti ti-check" 
                      : isSending 
                        ? "ti ti-loader" 
                        : "ti ti-arrow-up",
                    style: {
                      ...(isSending ? { animation: "spin 1s linear infinite" } : {}),
                      ...(sendSuccess ? { animation: "sendSuccess 0.4s ease-out" } : {}),
                    },
                  })
                )
              )
        )
      )
    )
  );
}
