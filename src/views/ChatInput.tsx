/**
 * ChatInput - 整合输入区域组件
 * 包含: Context Chips + @ 触发按钮 + 输入框 + 发送按钮 + 模型选择器 + 文件上传
 */

import type { DbId } from "../orca.d.ts";
import type { AiModelOption } from "../settings/ai-chat-settings";
import type { FileRef, VideoProcessMode } from "../services/session-service";
import { contextStore } from "../store/context-store";
import {
  uploadFile,
  getFileDisplayUrl,
  getFileIcon,
  getSupportedExtensions,
  isSupportedFile,
} from "../services/file-service";
import ContextChips from "./ContextChips";
import ContextPicker from "./ContextPicker";
import { ModelSelectorButton, InjectionModeSelector, ModeSelectorButton } from "./chat-input";
import { loadFromStorage } from "../store/chat-mode-store";
import { textareaStyle, sendButtonStyle } from "./chat-input";

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
  { command: "/card", description: "生成闪卡，交互式复习并保存", icon: "ti ti-cards" },
  { command: "/timeline", description: "以时间线格式展示结果", icon: "ti ti-clock" },
  { command: "/brief", description: "简洁回答，不要长篇大论", icon: "ti ti-bolt" },
  { command: "/detail", description: "详细回答，展开说明", icon: "ti ti-file-text" },
  { command: "/table", description: "用表格格式展示结果", icon: "ti ti-table" },
  { command: "/summary", description: "总结模式，精炼内容要点", icon: "ti ti-list" },
  { command: "/compare", description: "对比模式，左右对比展示", icon: "ti ti-columns" },
  { command: "/localgraph", description: "显示页面的链接关系图谱", icon: "ti ti-share" },
];

const { useSnapshot } = (window as any).Valtio as {
  useSnapshot: <T extends object>(obj: T) => T;
};
const { Button, CompositionTextArea } = orca.components;

type Props = {
  onSend: (message: string, files?: FileRef[], clearContext?: boolean) => void | Promise<void>;
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
  const [pendingFiles, setPendingFiles] = useState<FileRef[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [clearContextPending, setClearContextPending] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const addContextBtnRef = useRef<HTMLElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
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

  const canSend = (text.trim().length > 0 || pendingFiles.length > 0) && !disabled && !isSending;

  const handleSend = useCallback(async () => {
    const val = textareaRef.current?.value || text;
    const trimmed = val.trim();
    if ((!trimmed && pendingFiles.length === 0) || disabled || isSending) return;

    setIsSending(true);
    try {
      await onSend(trimmed, pendingFiles.length > 0 ? pendingFiles : undefined, clearContextPending);
      setText("");
      setPendingFiles([]);
      setClearContextPending(false);
      if (textareaRef.current) {
        textareaRef.current.value = "";
      }
    } finally {
      setIsSending(false);
    }
  }, [disabled, onSend, text, pendingFiles, clearContextPending, isSending]);

  // 处理清除上下文按钮点击
  const handleClearContextClick = useCallback(() => {
    if (clearContextPending) {
      // 如果已经是清除上下文状态，且没有输入内容，则撤销
      const val = textareaRef.current?.value || text;
      if (!val.trim() && pendingFiles.length === 0) {
        setClearContextPending(false);
      }
    } else {
      setClearContextPending(true);
    }
  }, [clearContextPending, text, pendingFiles]);

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

  // 设置视频处理模式
  const handleSetVideoMode = useCallback((index: number, mode: VideoProcessMode) => {
    setPendingFiles(prev => prev.map((file, i) => {
      if (i === index && file.category === "video") {
        return { ...file, videoMode: mode };
      }
      return file;
    }));
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

  // 处理拖拽
  const handleDrop = useCallback(async (e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    const files = e.dataTransfer?.files;
    if (files) {
      await handleFileSelect(files);
    }
  }, [handleFileSelect]);

  const handleDragOver = useCallback((e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
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
            createElement("i", { 
              className: cmd.icon, 
              style: { 
                fontSize: "14px", 
                color: "var(--orca-color-primary)",
                width: "18px",
                textAlign: "center",
              } 
            }),
            createElement("span", { style: { fontWeight: 600, color: "var(--orca-color-primary)" } }, cmd.command),
            createElement("span", { style: { color: "var(--orca-color-text-2)", fontSize: "12px" } }, cmd.description)
          )
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
                    // 视频模式切换按钮
                    createElement(
                      "div",
                      {
                        key: "video-mode",
                        style: {
                          position: "absolute",
                          bottom: "2px",
                          left: "2px",
                          display: "flex",
                          gap: "2px",
                        },
                      },
                      createElement(
                        "button",
                        {
                          onClick: (e: any) => {
                            e.stopPropagation();
                            handleSetVideoMode(index, "full");
                          },
                          style: {
                            padding: "2px 5px",
                            fontSize: "9px",
                            border: file.videoMode !== "audio-only" ? "1px solid var(--orca-color-primary)" : "1px solid rgba(255,255,255,0.3)",
                            borderRadius: "3px",
                            cursor: "pointer",
                            background: file.videoMode !== "audio-only" ? "var(--orca-color-primary)" : "rgba(0,0,0,0.6)",
                            color: "#fff",
                            fontWeight: file.videoMode !== "audio-only" ? "600" : "400",
                          },
                          title: "完整识别（画面+音频）",
                        },
                        "全"
                      ),
                      createElement(
                        "button",
                        {
                          onClick: (e: any) => {
                            e.stopPropagation();
                            handleSetVideoMode(index, "audio-only");
                          },
                          style: {
                            padding: "2px 5px",
                            fontSize: "9px",
                            border: file.videoMode === "audio-only" ? "1px solid var(--orca-color-primary)" : "1px solid rgba(255,255,255,0.3)",
                            borderRadius: "3px",
                            cursor: "pointer",
                            background: file.videoMode === "audio-only" ? "var(--orca-color-primary)" : "rgba(0,0,0,0.6)",
                            color: "#fff",
                            fontWeight: file.videoMode === "audio-only" ? "600" : "400",
                          },
                          title: "仅音频识别",
                        },
                        "音"
                      )
                    ),
                  ]
                : [
                    createElement("i", {
                      key: "icon",
                      className: getFileIcon(file.name, file.mimeType),
                      style: { fontSize: "20px", color: "var(--orca-color-primary)" },
                    }),
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
                        title: file.name,
                      },
                      file.name.length > 12 ? file.name.slice(0, 10) + "..." : file.name
                    ),
                    // 视频模式切换按钮（无缩略图时）
                    isVideo &&
                      createElement(
                        "div",
                        {
                          key: "video-mode",
                          style: {
                            display: "flex",
                            gap: "2px",
                            marginTop: "2px",
                          },
                        },
                        createElement(
                          "button",
                          {
                            onClick: (e: any) => {
                              e.stopPropagation();
                              handleSetVideoMode(index, "full");
                            },
                            style: {
                              padding: "2px 5px",
                              fontSize: "9px",
                              border: file.videoMode !== "audio-only" ? "1px solid var(--orca-color-primary)" : "1px solid var(--orca-color-border)",
                              borderRadius: "3px",
                              cursor: "pointer",
                              background: file.videoMode !== "audio-only" ? "var(--orca-color-primary)" : "var(--orca-color-bg-1)",
                              color: file.videoMode !== "audio-only" ? "#fff" : "var(--orca-color-text-2)",
                              fontWeight: file.videoMode !== "audio-only" ? "600" : "400",
                            },
                            title: "完整识别（画面+音频）",
                          },
                          "全"
                        ),
                        createElement(
                          "button",
                          {
                            onClick: (e: any) => {
                              e.stopPropagation();
                              handleSetVideoMode(index, "audio-only");
                            },
                            style: {
                              padding: "2px 5px",
                              fontSize: "9px",
                              border: file.videoMode === "audio-only" ? "1px solid var(--orca-color-primary)" : "1px solid var(--orca-color-border)",
                              borderRadius: "3px",
                              cursor: "pointer",
                              background: file.videoMode === "audio-only" ? "var(--orca-color-primary)" : "var(--orca-color-bg-1)",
                              color: file.videoMode === "audio-only" ? "#fff" : "var(--orca-color-text-2)",
                              fontWeight: file.videoMode === "audio-only" ? "600" : "400",
                            },
                            title: "仅音频识别",
                          },
                          "音"
                        )
                      ),
                  ],
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
                  title: "移除文件",
                },
                createElement("i", { className: "ti ti-x" })
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

      // 清除上下文提示标签
      clearContextPending && createElement(
        "div",
        {
          style: {
            display: "flex",
            alignItems: "center",
            gap: "6px",
            padding: "4px 10px",
            marginBottom: "8px",
            background: "var(--orca-color-warning-bg, rgba(255, 193, 7, 0.1))",
            border: "1px solid var(--orca-color-warning, #ffc107)",
            borderRadius: "6px",
            fontSize: "12px",
            color: "var(--orca-color-warning, #ffc107)",
            cursor: "pointer",
          },
          onClick: handleClearContextClick,
          title: "点击撤销清除上下文",
        },
        createElement("i", { className: "ti ti-refresh", style: { fontSize: "14px" } }),
        "清除上下文",
        createElement("span", { style: { color: "var(--orca-color-text-3)", marginLeft: "4px" } }, "(点击撤销)")
      ),

      // Row 1: TextArea
      createElement(CompositionTextArea as any, {
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
        style: { ...textareaStyle, width: "100%", background: "transparent", border: "none", padding: 0, minHeight: "24px" },
      }),

      // Row 2: Bottom Toolbar (Tools Left, Send Right)
      createElement(
        "div",
        { style: { display: "flex", justifyContent: "space-between", alignItems: "center" } },
        
        // Left Tools: @ Button + File Button + Clear Context + Model Selector + Injection Mode Selector
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
          // 文件上传按钮
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
            createElement(
              Button,
              {
                variant: "plain",
                onClick: handleFileButtonClick,
                title: "添加文件 (图片、文档、代码等)",
                style: { padding: "4px" },
                disabled: isUploading,
              },
              createElement("i", { className: isUploading ? "ti ti-loader" : "ti ti-paperclip" })
            )
          ),
          // 清除上下文按钮
          createElement(
            Button,
            {
              variant: "plain",
              onClick: handleClearContextClick,
              title: clearContextPending ? "撤销清除上下文" : "清除上下文（开始新对话）",
              style: { 
                padding: "4px",
                color: clearContextPending ? "var(--orca-color-warning, #ffc107)" : undefined,
              },
            },
            createElement("i", { className: "ti ti-refresh" })
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
                title: isSending ? "正在加载内容..." : "发送消息",
                style: { 
                  ...sendButtonStyle(canSend), 
                  borderRadius: "50%", 
                  width: "32px", 
                  height: "32px", 
                  padding: 0, 
                  display: "flex", 
                  alignItems: "center", 
                  justifyContent: "center",
                  opacity: isSending ? 0.7 : 1,
                },
              },
              createElement("i", { 
                className: isSending ? "ti ti-loader" : "ti ti-arrow-up",
                style: isSending ? {
                  animation: "spin 1s linear infinite",
                } : undefined,
              })
            )
      )
    )
  );
}
