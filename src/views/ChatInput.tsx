/**
 * ChatInput - 整合输入区域组件
 * 包含: Context Chips + @ 触发按钮 + 输入框 + 发送按钮 + 模型选择器 + 文件上传
 */

import type { DbId } from "../orca.d.ts";
import type { AiChatSettings, CurrencyType } from "../settings/ai-chat-settings";
import type { FileRef, VideoProcessMode } from "../services/session-service";
import { buildContextForSend } from "../services/notes/context-builder";
import { contextStore, contextKey, addBlockById, clearHighPriorityContexts } from "../store/context-store";
import { estimateTokens, formatTokenCount, estimateCost, formatCost } from "../utils/token-utils";
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
import { ModelSelectorButton, InjectionModeSelector, ModeSelectorButton } from "./chat-input";
import { loadFromStorage } from "../store/chat-mode-store";
import { textareaStyle, sendButtonStyle } from "./chat-input";
import { MultiModelToggleButton } from "../components/MultiModelSelector";
import { multiModelStore } from "../store/multi-model-store";
import ToolPanel from "../components/ToolPanel";
import { loadToolSettings, toolStore, toggleWebSearch, toggleAgenticRAG } from "../store/tool-store";
import { getAllCommandsInfo } from "../services/commands-loader";
import { listSkills } from "../services/ai/skills-manager";
import type { SkillRef } from "../types/skills";
import { recommendSkills, type SkillRecommendation, getSkillSummary } from "../services/ai/skill-recommender";

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

// 斜杠命令定义 - 带分类
import {
  groupCommandsByCategory,
  fuzzyMatch,
  addRecentCommand,
  getRecentCommands,
  SlashCommand as SlashCommandType,
  SlashCommandCategory,
} from "../utils/chat-ui-utils";

type SlashCommandDef = {
  command: string;
  description: string;
  icon: string;
  category: SlashCommandCategory;
};

const SLASH_COMMANDS: SlashCommandDef[] = [
  // Format 格式类
  { command: "/table", description: "用表格格式展示结果", icon: "ti ti-table", category: "format" },
  { command: "/timeline", description: "以时间线格式展示结果", icon: "ti ti-clock", category: "format" },
  { command: "/compare", description: "对比模式，左右对比展示", icon: "ti ti-columns", category: "format" },
  { command: "/list", description: "用列表格式展示结果", icon: "ti ti-list-check", category: "format" },
  { command: "/steps", description: "分步骤展示操作流程", icon: "ti ti-stairs", category: "format" },
  // Style 风格类
  { command: "/brief", description: "简洁回答，不要长篇大论", icon: "ti ti-bolt", category: "style" },
  { command: "/detail", description: "详细回答，展开说明", icon: "ti ti-file-text", category: "style" },
  { command: "/summary", description: "总结模式，精炼内容要点", icon: "ti ti-list", category: "style" },
  { command: "/eli5", description: "用简单易懂的方式解释", icon: "ti ti-bulb", category: "style" },
  { command: "/formal", description: "正式专业的语气回答", icon: "ti ti-briefcase", category: "style" },
  // Visualization 可视化类
  { command: "/card", description: "生成闪卡，交互式复习并保存", icon: "ti ti-cards", category: "visualization" },
  { command: "/localgraph", description: "显示页面的链接关系图谱", icon: "ti ti-share", category: "visualization" },
  { command: "/diagram", description: "生成流程图或示意图", icon: "ti ti-chart-dots", category: "visualization" },
  // Skill 技能
  { command: "/skill", description: "让 AI 生成技能草稿（可附加需求）", icon: "ti ti-wand", category: "skill" },
  // Todoist 任务管理类
  { command: "/todoist", description: "查看今日 Todoist 任务", icon: "ti ti-checkbox", category: "todoist" },
  { command: "/todoist-all", description: "查看全部未完成任务", icon: "ti ti-list-check", category: "todoist" },
  { command: "/todoist-add", description: "添加新任务（支持自然语言日期）", icon: "ti ti-plus", category: "todoist" },
  { command: "/todoist-done", description: "选择并标记任务完成", icon: "ti ti-circle-check", category: "todoist" },
  { command: "/todoist-ai", description: "AI 模式管理任务（自然语言）", icon: "ti ti-robot", category: "todoist" },
];

// 分类显示名称
const CATEGORY_LABELS: Record<SlashCommandCategory, string> = {
  format: "格式",
  style: "回答风格",
  visualization: "可视化",
  todoist: "Todoist 任务",
  skill: "技能",
  command: "命令",
};

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
  onSend: (message: string, files?: FileRef[], clearContext?: boolean) => void | Promise<void>;
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
  /** 币种设置 */
  currency?: CurrencyType;
};

// Enhanced Styles
const inputContainerStyle: React.CSSProperties = {
  padding: "16px",
  borderTop: "none",
  background: "transparent",
};

const TOOLBAR_HIDE_BREAKPOINTS = {
  token: 520,
  rag: 440,
  web: 400,
  multi: 360,
  injection: 320,
  mode: 280,
  clear: 240,
};

const overflowMenuStyle: React.CSSProperties = {
  minWidth: 240,
  padding: "10px",
  background: "var(--orca-color-bg-1)",
  display: "flex",
  flexDirection: "column",
  gap: "10px",
  maxHeight: "60vh",
  overflowY: "auto",
};

const overflowSectionTitleStyle: React.CSSProperties = {
  fontSize: "11px",
  fontWeight: 600,
  color: "var(--orca-color-text-3)",
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

const overflowToggleButtonStyle: React.CSSProperties = {
  padding: "4px",
  borderRadius: "4px",
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
  onStop,
  disabled = false,
  currentPageId,
  currentPageTitle,
  settings,
  selectedModel,
  onModelSelect,
  onUpdateSettings,
  currency = "USD",
}: Props) {
  const [text, setText] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [slashMenuOpen, setSlashMenuOpen] = useState(false);
  const [slashMenuIndex, setSlashMenuIndex] = useState(0);
  const slashMenuRef = useRef<HTMLDivElement | null>(null);

  // Skill 菜单状态
  const [availableSkills, setAvailableSkills] = useState<SkillRef[]>([]);
  const [skillMenuOpen, setSkillMenuOpen] = useState(false);
  const [skillMenuIndex, setSkillMenuIndex] = useState(0);
  const skillMenuRef = useRef<HTMLDivElement | null>(null);
  
  // Skill 推荐状态
  const [skillRecommendations, setSkillRecommendations] = useState<SkillRecommendation[]>([]);
  const [showSkillRecommendations, setShowSkillRecommendations] = useState(false);
  const recommendationTimeoutRef = useRef<any>(null);
  
  const [pendingFiles, setPendingFiles] = useState<FileRef[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [clearContextPending, setClearContextPending] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [sendSuccess, setSendSuccess] = useState(false);
  const [isDraggingFile, setIsDraggingFile] = useState(false);
  const [toolbarWidth, setToolbarWidth] = useState(0);
  const [availableCommands, setAvailableCommands] = useState<{ name: string; description: string }[]>([]);
  const addContextBtnRef = useRef<HTMLElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const leftToolbarRef = useRef<HTMLDivElement | null>(null);
  const contextSnap = useSnapshot(contextStore);
  const toolSnap = useSnapshot(toolStore);
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

  // 获取当前选中模型的价格信息
  const selectedModelInfo = useMemo(() => {
    // 从 settings.providers 中查找当前选中的模型
    for (const provider of settings.providers) {
      const model = provider.models.find(m => m.id === selectedModel);
      if (model) {
        return {
          inputPrice: model.inputPrice,
          outputPrice: model.outputPrice,
        };
      }
    }
    return { inputPrice: 0, outputPrice: 0 };
  }, [settings.providers, selectedModel]);

  // 计算 Token 预估
  const tokenEstimate = useMemo(() => {
    const inputTokens = estimateTokens(text);
    const outputTokens = Math.ceil(inputTokens * 1.5); // 预估输出为输入的 1.5 倍
    const inputPrice = selectedModelInfo?.inputPrice ?? 0;
    const outputPrice = selectedModelInfo?.outputPrice ?? 0;
    const cost = estimateCost(inputTokens, outputTokens, inputPrice, outputPrice);
    return { inputTokens, outputTokens, cost };
  }, [text, selectedModelInfo]);

  const overflowFlags = useMemo(() => {
    const width = toolbarWidth || 9999;
    const hideRag = width < TOOLBAR_HIDE_BREAKPOINTS.rag;
    const hideWeb = width < TOOLBAR_HIDE_BREAKPOINTS.web;
    const hideMulti = width < TOOLBAR_HIDE_BREAKPOINTS.multi;
    const hideInjection = width < TOOLBAR_HIDE_BREAKPOINTS.injection;
    const hideMode = width < TOOLBAR_HIDE_BREAKPOINTS.mode;
    const hideClear = width < TOOLBAR_HIDE_BREAKPOINTS.clear;
    const hasOverflow = hideRag || hideWeb || hideMulti || hideInjection || hideMode || hideClear;

    return {
      hideRag,
      hideWeb,
      hideMulti,
      hideInjection,
      hideMode,
      hideClear,
      hasOverflow,
    };
  }, [toolbarWidth]);

  const showModeSection = overflowFlags.hideMulti || overflowFlags.hideInjection || overflowFlags.hideMode;
  const showToolSection = overflowFlags.hideWeb || overflowFlags.hideRag;
  const showTokenIndicator = tokenEstimate.inputTokens > 0;

  // 检测是否显示斜杠命令菜单 - 使用模糊匹配
  const filteredCommands = useMemo(() => {
    if (!text.startsWith("/")) return [];
    const query = text.slice(1).toLowerCase(); // 移除开头的 /
    if (query.includes(" ")) return []; // 如果有空格，不显示菜单
    
    // 合并内置命令和文件命令
    const allCommands: SlashCommandDef[] = [
      ...SLASH_COMMANDS,
      ...availableCommands.map(cmd => ({
        command: `/${cmd.name}`,
        description: cmd.description || "自定义命令",
        icon: "ti ti-file-text",
        category: "command" as SlashCommandCategory,
      }))
    ];
    
    // 使用模糊匹配过滤命令
    return allCommands.filter(cmd => {
      const cmdName = cmd.command.slice(1); // 移除命令开头的 /
      return fuzzyMatch(query, cmdName);
    });
  }, [text, availableCommands]);

  // 检测是否显示 Skill 菜单 - 使用模糊匹配
  const filteredSkills = useMemo(() => {
    if (!text.startsWith("#")) return [];
    const query = text.slice(1).toLowerCase(); // 移除开头的 #
    if (query.includes(" ")) return []; // 如果有空格，不显示菜单
    
    // 使用模糊匹配过滤 Skills (按名称匹配)
    return availableSkills.filter(skill =>
      fuzzyMatch(query, skill.name)
    );
  }, [text, availableSkills]);

  // 获取最近使用的命令
  const recentCommands = useMemo(() => {
    const recent = getRecentCommands();
    return SLASH_COMMANDS.filter(cmd => recent.includes(cmd.command));
  }, []);

  // 创建扁平化的菜单项列表（用于键盘导航）
  const flatMenuItems = useMemo(() => {
    const query = text.startsWith("/") ? text.slice(1).toLowerCase() : "";
    if (query) {
      // 有查询时，直接返回过滤结果
      return filteredCommands;
    }
    // 无查询时，按最近使用 + 分类顺序排列
    const items: SlashCommandDef[] = [];
    const recentCmds = recentCommands.filter(cmd => 
      filteredCommands.some(fc => fc.command === cmd.command)
    );
    items.push(...recentCmds);
    
    const grouped = groupCommandsByCategory(filteredCommands as SlashCommandType[]);
    const categories: SlashCommandCategory[] = ["format", "style", "visualization", "skill", "command", "todoist"];
    for (const category of categories) {
      const cmds = grouped[category];
      for (const cmd of cmds) {
        // 跳过已在最近使用中的命令
        if (!recentCmds.some(rc => rc.command === cmd.command)) {
          items.push(cmd as SlashCommandDef);
        }
      }
    }
    return items;
  }, [text, filteredCommands, recentCommands]);

  useEffect(() => {
    if (filteredCommands.length > 0 && text.startsWith("/") && !text.includes(" ")) {
      setSlashMenuOpen(true);
      setSlashMenuIndex(0);
    } else {
      setSlashMenuOpen(false);
    }
  }, [filteredCommands, text]);

  // Skill 菜单显示逻辑
  useEffect(() => {
    if (filteredSkills.length > 0 && text.startsWith("#") && !text.includes(" ")) {
      setSkillMenuOpen(true);
      setSkillMenuIndex(0);
    } else {
      setSkillMenuOpen(false);
    }
  }, [filteredSkills, text]);

  // Skill 自动推荐逻辑（防抖动）
  useEffect(() => {
    // 清除之前的定时器
    if (recommendationTimeoutRef.current) {
      clearTimeout(recommendationTimeoutRef.current);
    }
    
    // 如果输入为空或以 / 或 # 开头，不显示推荐
    if (!text || text.startsWith("/") || text.startsWith("#") || text.length < 4) {
      setSkillRecommendations([]);
      setShowSkillRecommendations(false);
      return;
    }
    
    // 防抖动：500ms 后才进行推荐
    recommendationTimeoutRef.current = setTimeout(async () => {
      try {
        const recommendations = await recommendSkills(text, 2, 0.2);
        setSkillRecommendations(recommendations);
        setShowSkillRecommendations(recommendations.length > 0);
      } catch (err) {
        console.error('[ChatInput] Failed to get skill recommendations:', err);
      }
    }, 500);
    
    return () => {
      if (recommendationTimeoutRef.current) {
        clearTimeout(recommendationTimeoutRef.current);
      }
    };
  }, [text]);

  // 斜杠菜单键盘导航时自动滚动到选中项
  useEffect(() => {
    if (!slashMenuOpen || !slashMenuRef.current) return;
    const container = slashMenuRef.current;
    const selectedItem = container.querySelector(`[data-slash-index="${slashMenuIndex}"]`) as HTMLElement;
    if (selectedItem) {
      selectedItem.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [slashMenuIndex, slashMenuOpen]);

  // Skill 菜单键盘导航时自动滚动到选中项
  useEffect(() => {
    if (!skillMenuOpen || !skillMenuRef.current) return;
    const container = skillMenuRef.current;
    const selectedItem = container.querySelector(`[data-skill-index="${skillMenuIndex}"]`) as HTMLElement;
    if (selectedItem) {
      selectedItem.scrollIntoView({ block: "nearest", behavior: "smooth" });
    }
  }, [skillMenuIndex, skillMenuOpen]);

  // Load chat mode from storage on mount (Requirements: 5.2)
  useEffect(() => {
    // Load settings asynchronously
    Promise.all([
      loadFromStorage(),
      loadToolSettings(),
      getAllCommandsInfo(),
      listSkills()
    ]).then(([, , commands, skills]) => {
      setAvailableCommands(commands);
      setAvailableSkills(skills);
    }).catch(error => {
      console.error('[ChatInput] Failed to load initial settings:', error);
    });
  }, []);

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
      await onSend(contentToSend, pendingFiles.length > 0 ? pendingFiles : undefined, clearContextPending);
      setText("");
      setPendingFiles([]);
      setClearContextPending(false);
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
  }, [disabled, onSend, text, pendingFiles, clearContextPending, isSending, hasContext]);

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
      // Skill 菜单键盘导航
      if (skillMenuOpen && filteredSkills.length > 0) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setSkillMenuIndex(i => (i + 1) % filteredSkills.length);
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setSkillMenuIndex(i => (i - 1 + filteredSkills.length) % filteredSkills.length);
          return;
        }
        if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
          e.preventDefault();
          const skill = filteredSkills[skillMenuIndex];
          if (skill) {
            setText(`#${skill.id} `);
            if (textareaRef.current) {
              textareaRef.current.value = `#${skill.id} `;
            }
          }
          setSkillMenuOpen(false);
          return;
        }
        if (e.key === "Escape") {
          e.preventDefault();
          setSkillMenuOpen(false);
          return;
        }
      }

      // 斜杠菜单键盘导航
      if (slashMenuOpen && flatMenuItems.length > 0) {
        if (e.key === "ArrowDown") {
          e.preventDefault();
          setSlashMenuIndex(i => (i + 1) % flatMenuItems.length);
          return;
        }
        if (e.key === "ArrowUp") {
          e.preventDefault();
          setSlashMenuIndex(i => (i - 1 + flatMenuItems.length) % flatMenuItems.length);
          return;
        }
        if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
          e.preventDefault();
          const cmd = flatMenuItems[slashMenuIndex];
          if (cmd) {
            setText(cmd.command + " ");
            if (textareaRef.current) {
              textareaRef.current.value = cmd.command + " ";
            }
            // 保存到最近使用
            addRecentCommand(cmd.command);
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
    [handleSend, slashMenuOpen, flatMenuItems, slashMenuIndex, skillMenuOpen, filteredSkills, skillMenuIndex]
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
          // 高优先级上下文会排在普通上下文之前，但仍低于记忆和用户印象
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

      // Tool Panel (only in Agent mode)
      createElement(ToolPanel, null),

      // Slash Command Menu - Enhanced with categories and recent commands
      slashMenuOpen && filteredCommands.length > 0 && createElement(
        "div",
        {
          ref: slashMenuRef,
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
        // 渲染命令菜单内容
        (() => {
          const elements: any[] = [];
          let globalIndex = 0;
          const query = text.slice(1).toLowerCase();
          
          // 如果没有输入查询，显示分类视图
          if (!query) {
            // 最近使用区域
            const recentCmds = recentCommands.filter(cmd => 
              filteredCommands.some(fc => fc.command === cmd.command)
            );
            
            if (recentCmds.length > 0) {
              elements.push(
                createElement("div", {
                  key: "recent-header",
                  style: {
                    padding: "6px 12px",
                    fontSize: "11px",
                    fontWeight: 600,
                    color: "var(--orca-color-text-3)",
                    background: "var(--orca-color-bg-2)",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                  },
                }, "最近使用")
              );
              
              for (const cmd of recentCmds) {
                const currentIndex = globalIndex++;
                elements.push(
                  createElement("div", {
                    key: `recent-${cmd.command}`,
                    "data-slash-index": currentIndex,
                    onClick: () => {
                      setText(cmd.command + " ");
                      if (textareaRef.current) {
                        textareaRef.current.value = cmd.command + " ";
                        textareaRef.current.focus();
                      }
                      addRecentCommand(cmd.command);
                      setSlashMenuOpen(false);
                    },
                    style: {
                      padding: "8px 12px",
                      cursor: "pointer",
                      background: currentIndex === slashMenuIndex ? "var(--orca-color-bg-3)" : "transparent",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    },
                  },
                    createElement("i", { 
                      className: cmd.icon, 
                      style: { fontSize: "14px", color: "var(--orca-color-primary)", width: "18px", textAlign: "center" } 
                    }),
                    createElement("span", { style: { fontWeight: 600, color: "var(--orca-color-primary)" } }, cmd.command),
                    createElement("span", { style: { color: "var(--orca-color-text-2)", fontSize: "12px" } }, cmd.description)
                  )
                );
              }
            }
            
            // 按分类分组显示
            const grouped = groupCommandsByCategory(filteredCommands as SlashCommandType[]);
            const categories: SlashCommandCategory[] = ["format", "style", "visualization", "skill", "command", "todoist"];
            
            for (const category of categories) {
              const cmds = grouped[category];
              if (cmds.length === 0) continue;
              
              // 分类标题
              elements.push(
                createElement("div", {
                  key: `header-${category}`,
                  style: {
                    padding: "6px 12px",
                    fontSize: "11px",
                    fontWeight: 600,
                    color: "var(--orca-color-text-3)",
                    background: "var(--orca-color-bg-2)",
                    textTransform: "uppercase",
                    letterSpacing: "0.5px",
                  },
                }, CATEGORY_LABELS[category])
              );
              
              // 分类下的命令
              for (const cmd of cmds) {
                // 跳过已在最近使用中显示的命令
                if (recentCmds.some(rc => rc.command === cmd.command)) continue;
                
                const currentIndex = globalIndex++;
                elements.push(
                  createElement("div", {
                    key: cmd.command,
                    "data-slash-index": currentIndex,
                    onClick: () => {
                      setText(cmd.command + " ");
                      if (textareaRef.current) {
                        textareaRef.current.value = cmd.command + " ";
                        textareaRef.current.focus();
                      }
                      addRecentCommand(cmd.command);
                      setSlashMenuOpen(false);
                    },
                    style: {
                      padding: "8px 12px",
                      cursor: "pointer",
                      background: currentIndex === slashMenuIndex ? "var(--orca-color-bg-3)" : "transparent",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                    },
                  },
                    createElement("i", { 
                      className: cmd.icon, 
                      style: { fontSize: "14px", color: "var(--orca-color-primary)", width: "18px", textAlign: "center" } 
                    }),
                    createElement("span", { style: { fontWeight: 600, color: "var(--orca-color-primary)" } }, cmd.command),
                    createElement("span", { style: { color: "var(--orca-color-text-2)", fontSize: "12px" } }, cmd.description)
                  )
                );
              }
            }
          } else {
            // 有查询时，显示扁平的过滤结果
            for (const cmd of filteredCommands) {
              const currentIndex = globalIndex++;
              elements.push(
                createElement("div", {
                  key: cmd.command,
                  "data-slash-index": currentIndex,
                  onClick: () => {
                    setText(cmd.command + " ");
                    if (textareaRef.current) {
                      textareaRef.current.value = cmd.command + " ";
                      textareaRef.current.focus();
                    }
                    addRecentCommand(cmd.command);
                    setSlashMenuOpen(false);
                  },
                  style: {
                    padding: "8px 12px",
                    cursor: "pointer",
                    background: currentIndex === slashMenuIndex ? "var(--orca-color-bg-3)" : "transparent",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  },
                },
                  createElement("i", { 
                    className: cmd.icon, 
                    style: { fontSize: "14px", color: "var(--orca-color-primary)", width: "18px", textAlign: "center" } 
                  }),
                  createElement("span", { style: { fontWeight: 600, color: "var(--orca-color-primary)" } }, cmd.command),
                  createElement("span", { style: { color: "var(--orca-color-text-2)", fontSize: "12px" } }, cmd.description),
                  createElement("span", { 
                    style: { 
                      marginLeft: "auto", 
                      fontSize: "10px", 
                      color: "var(--orca-color-text-4)",
                      padding: "2px 6px",
                      background: "var(--orca-color-bg-3)",
                      borderRadius: "4px",
                    } 
                  }, CATEGORY_LABELS[cmd.category])
                )
              );
            }
          }
          
          return elements;
        })()
      ),

      // Skill Menu
      skillMenuOpen && filteredSkills.length > 0 && createElement(
        "div",
        {
          ref: skillMenuRef,
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
        // 标题
        createElement("div", {
          style: {
            padding: "6px 12px",
            fontSize: "11px",
            fontWeight: 600,
            color: "var(--orca-color-text-3)",
            background: "var(--orca-color-bg-2)",
            textTransform: "uppercase",
            letterSpacing: "0.5px",
          },
        }, "\u6280\u80fd (Skills)"),
        // Skill 列表
        ...filteredSkills.map((skill, index) => 
          createElement("div", {
            key: skill.id,
            "data-skill-index": index,
            onClick: () => {
              const triggerName = skill.name || skill.id;
              setText(`#${triggerName} `);
              if (textareaRef.current) {
                textareaRef.current.value = `#${triggerName} `;
                textareaRef.current.focus();
              }
              setSkillMenuOpen(false);
            },
            style: {
              padding: "8px 12px",
              cursor: "pointer",
              background: index === skillMenuIndex ? "var(--orca-color-bg-3)" : "transparent",
              display: "flex",
              alignItems: "center",
              gap: "8px",
            },
          },
            createElement("i", { 
              className: "ti ti-wand", 
              style: { fontSize: "14px", color: "var(--orca-color-success, #10b981)", width: "18px", textAlign: "center" } 
            }),
            createElement("span", { style: { fontWeight: 600, color: "var(--orca-color-success, #10b981)" } }, `#${skill.name || skill.id}`),
            skill.scope !== "local" && createElement("span", {
              style: {
                fontSize: "10px",
                color: "var(--orca-color-text-4)",
                padding: "2px 6px",
                background: "var(--orca-color-bg-3)",
                borderRadius: "4px",
                marginLeft: "auto"
              }
            }, skill.scope === "global" ? "\u5168\u5c40" : "\u5c40\u90e8")
          )
        )
      ),

      // Skill 推荐提示条
      showSkillRecommendations && skillRecommendations.length > 0 && !slashMenuOpen && !skillMenuOpen && createElement(
        "div",
        {
          style: {
            display: "flex",
            alignItems: "center",
            gap: "8px",
            padding: "8px 12px",
            marginBottom: "8px",
            background: "linear-gradient(90deg, rgba(16, 185, 129, 0.08) 0%, rgba(16, 185, 129, 0.02) 100%)",
            border: "1px solid rgba(16, 185, 129, 0.2)",
            borderRadius: "8px",
            fontSize: "12px",
          },
        },
        createElement("i", { 
          className: "ti ti-sparkles", 
          style: { fontSize: "14px", color: "var(--orca-color-success, #10b981)" } 
        }),
        createElement("span", { 
          style: { color: "var(--orca-color-text-2)", marginRight: "4px" } 
        }, "\u63a8\u8350\u6280\u80fd:"),
        ...skillRecommendations.map((rec, index) => 
          createElement(
            "button",
            {
              key: rec.skill.id,
              onClick: () => {
                setText(`#${rec.skill.id} ${text}`);
                if (textareaRef.current) {
                  textareaRef.current.value = `#${rec.skill.id} ${text}`;
                  textareaRef.current.focus();
                }
                setShowSkillRecommendations(false);
              },
              style: {
                padding: "4px 10px",
                fontSize: "12px",
                fontWeight: 500,
                border: "1px solid rgba(16, 185, 129, 0.3)",
                borderRadius: "6px",
                cursor: "pointer",
                color: "var(--orca-color-success, #10b981)",
                display: "flex",
                alignItems: "center",
                gap: "4px",
              },
              className: "skill-rec-btn",
              title: `${getSkillSummary(rec.skill)}\n${rec.matchReason}`,
            },
            createElement("i", { className: "ti ti-wand", style: { fontSize: "12px" } }),
            rec.skill.name || rec.skill.id
          )
        ),
        createElement(
          "button",
          {
            onClick: () => setShowSkillRecommendations(false),
            style: {
              marginLeft: "auto",
              padding: "2px",
              border: "none",
              background: "transparent",
              cursor: "pointer",
              color: "var(--orca-color-text-3)",
              display: "flex",
              alignItems: "center",
            },
            title: "\u5173\u95ed\u63a8\u8350",
          },
          createElement("i", { className: "ti ti-x", style: { fontSize: "14px" } })
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
                      withTooltip(
                        "完整识别（画面+音频）",
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
                              border: "1px solid var(--orca-color-border)",
                              borderRadius: "3px",
                              cursor: "pointer",
                              background: file.videoMode !== "audio-only" ? "var(--orca-color-bg-3)" : "rgba(0,0,0,0.6)",
                              color: file.videoMode !== "audio-only" ? "var(--orca-color-text-1)" : "#fff",
                              fontWeight: file.videoMode !== "audio-only" ? "600" : "400",
                            },
                          },
                          "全"
                        )
                      ),
                      withTooltip(
                        "仅音频识别",
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
                              border: "1px solid var(--orca-color-border)",
                              borderRadius: "3px",
                              cursor: "pointer",
                              background: file.videoMode === "audio-only" ? "var(--orca-color-bg-3)" : "rgba(0,0,0,0.6)",
                              color: file.videoMode === "audio-only" ? "var(--orca-color-text-1)" : "#fff",
                              fontWeight: file.videoMode === "audio-only" ? "600" : "400",
                            },
                          },
                          "音"
                        )
                      )
                    ),
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
                        withTooltip(
                          "完整识别（画面+音频）",
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
                                border: "1px solid var(--orca-color-border)",
                                borderRadius: "3px",
                                cursor: "pointer",
                                background: file.videoMode !== "audio-only" ? "var(--orca-color-bg-3)" : "var(--orca-color-bg-1)",
                                color: file.videoMode !== "audio-only" ? "var(--orca-color-text-1)" : "var(--orca-color-text-2)",
                                fontWeight: file.videoMode !== "audio-only" ? "600" : "400",
                              },
                            },
                            "全"
                          )
                        ),
                        withTooltip(
                          "仅音频识别",
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
                                border: "1px solid var(--orca-color-border)",
                                borderRadius: "3px",
                                cursor: "pointer",
                                background: file.videoMode === "audio-only" ? "var(--orca-color-bg-3)" : "var(--orca-color-bg-1)",
                                color: file.videoMode === "audio-only" ? "var(--orca-color-text-1)" : "var(--orca-color-text-2)",
                                fontWeight: file.videoMode === "audio-only" ? "600" : "400",
                              },
                            },
                            "音"
                          )
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

      // 清除上下文提示标签
      clearContextPending && withTooltip(
        "点击撤销清除上下文",
        createElement(
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
          },
          createElement("i", { className: "ti ti-refresh", style: { fontSize: "14px" } }),
          "清除上下文",
          createElement("span", { style: { color: "var(--orca-color-text-3)", marginLeft: "4px" } }, "(点击撤销)")
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

        // Left Tools: @ Button + File Button + Clear Context + Model Selector + Injection Mode Selector
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
          !overflowFlags.hideClear && withTooltip(
            clearContextPending ? "\u64a4\u9500\u6e05\u9664\u4e0a\u4e0b\u6587" : "\u6e05\u9664\u4e0a\u4e0b\u6587\uff08\u5f00\u59cb\u65b0\u5bf9\u8bdd\uff09",
            createElement(
              Button,
              {
                variant: "plain",
                onClick: handleClearContextClick,
                style: {
                  padding: "4px",
                  color: clearContextPending ? "var(--orca-color-warning, #ffc107)" : undefined,
                },
              },
              createElement("i", { className: "ti ti-refresh" })
            )
          ),
          !overflowFlags.hideMulti && createElement(MultiModelToggleButton, {
            settings,
          }),
          !overflowFlags.hideInjection && createElement(InjectionModeSelector, null),
          !overflowFlags.hideMode && createElement(ModeSelectorButton, null),
          !overflowFlags.hideWeb && withTooltip(
            toolSnap.webSearchEnabled ? "\u5173\u95ed\u8054\u7f51\u641c\u7d22" : "\u5f00\u542f\u8054\u7f51\u641c\u7d22",
            createElement(
              Button,
              {
                variant: "plain",
                onClick: toggleWebSearch,
                style: {
                  padding: "4px",
                  color: toolSnap.webSearchEnabled ? "var(--orca-color-primary, #007bff)" : undefined,
                  background: toolSnap.webSearchEnabled ? "var(--orca-color-primary-bg, rgba(0, 123, 255, 0.1))" : undefined,
                  borderRadius: "4px",
                },
              },
              createElement("i", { className: "ti ti-world-search" })
            )
          ),
          !overflowFlags.hideRag && withTooltip(
            tooltipText(
              toolSnap.agenticRAGEnabled
                ? "\u5173\u95ed\u6df1\u5ea6\u68c0\u7d22\uff08Agentic RAG\uff09\\n\u5f53\u524d\uff1aAI \u4f1a\u591a\u8f6e\u8fed\u4ee3\u68c0\u7d22\uff0c\u6d88\u8017\u66f4\u591atoken"
                : "\u5f00\u542f\u6df1\u5ea6\u68c0\u7d22\uff08Agentic RAG\uff09\\n\u5f00\u542f\u540e\uff1aAI \u4f1a\u81ea\u4e3b\u89c4\u5212\u68c0\u7d22\u7b56\u7565\uff0c\u591a\u8f6e\u8fed\u4ee3\u76f4\u5230\u4fe1\u606f\u5145\u8db3"
            ),
            createElement(
              Button,
              {
                variant: "plain",
                onClick: toggleAgenticRAG,
                style: {
                  padding: "4px",
                  color: toolSnap.agenticRAGEnabled ? "var(--orca-color-warning, #f59e0b)" : undefined,
                  background: toolSnap.agenticRAGEnabled ? "rgba(245, 158, 11, 0.1)" : undefined,
                  borderRadius: "4px",
                },
              },
              createElement("i", { className: "ti ti-brain" })
            )
          ),
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
              alignment: "right",
              allowBeyondContainer: true,
              offset: 8,
              menu: (close: () => void) =>
                createElement(
                  "div",
                  { style: overflowMenuStyle },
                  overflowFlags.hideClear && createElement("div", { style: overflowSectionTitleStyle }, "\u5feb\u6377\u64cd\u4f5c"),
                  overflowFlags.hideClear && createElement(
                    "div",
                    {
                      style: overflowItemStyle,
                      onClick: () => {
                        handleClearContextClick();
                        close();
                      },
                    },
                    createElement("span", { style: overflowItemLabelStyle }, clearContextPending ? "\u64a4\u9500\u6e05\u9664\u4e0a\u4e0b\u6587" : "\u6e05\u9664\u4e0a\u4e0b\u6587"),
                    createElement("i", { className: "ti ti-refresh", style: { fontSize: "14px" } })
                  ),
                  showModeSection && createElement("div", { style: overflowSectionTitleStyle }, "\u6a21\u5f0f"),
                  overflowFlags.hideMulti && createElement(
                    "div",
                    { style: overflowItemStyle },
                    createElement("span", { style: overflowItemLabelStyle }, "\u591a\u6a21\u578b\u5e76\u884c"),
                    createElement(MultiModelToggleButton, { settings })
                  ),
                  overflowFlags.hideInjection && createElement(
                    "div",
                    { style: overflowItemStyle },
                    createElement("span", { style: overflowItemLabelStyle }, "\u6ce8\u5165\u6a21\u5f0f"),
                    createElement(InjectionModeSelector, null)
                  ),
                  overflowFlags.hideMode && createElement(
                    "div",
                    { style: overflowItemStyle },
                    createElement("span", { style: overflowItemLabelStyle }, "\u5bf9\u8bdd\u6a21\u5f0f"),
                    createElement(ModeSelectorButton, null)
                  ),
                  showToolSection && createElement("div", { style: overflowSectionTitleStyle }, "\u5de5\u5177"),
                  overflowFlags.hideWeb && createElement(
                    "div",
                    { style: overflowItemStyle },
                    createElement("span", { style: overflowItemLabelStyle }, "\u8054\u7f51\u641c\u7d22"),
                    withTooltip(
                      toolSnap.webSearchEnabled ? "\u5173\u95ed\u8054\u7f51\u641c\u7d22" : "\u5f00\u542f\u8054\u7f51\u641c\u7d22",
                      createElement(
                        Button,
                        {
                          variant: "plain",
                          onClick: toggleWebSearch,
                          style: {
                            ...overflowToggleButtonStyle,
                            color: toolSnap.webSearchEnabled ? "var(--orca-color-primary, #007bff)" : undefined,
                            background: toolSnap.webSearchEnabled ? "var(--orca-color-primary-bg, rgba(0, 123, 255, 0.1))" : undefined,
                          },
                        },
                        createElement("i", { className: "ti ti-world-search" })
                      )
                    )
                  ),
                  overflowFlags.hideRag && createElement(
                    "div",
                    { style: overflowItemStyle },
                    createElement("span", { style: overflowItemLabelStyle }, "\u6df1\u5ea6\u68c0\u7d22"),
                    withTooltip(
                      toolSnap.agenticRAGEnabled ? "\u5173\u95ed\u6df1\u5ea6\u68c0\u7d22" : "\u5f00\u542f\u6df1\u5ea6\u68c0\u7d22",
                      createElement(
                        Button,
                        {
                          variant: "plain",
                          onClick: toggleAgenticRAG,
                          style: {
                            ...overflowToggleButtonStyle,
                            color: toolSnap.agenticRAGEnabled ? "var(--orca-color-warning, #f59e0b)" : undefined,
                            background: toolSnap.agenticRAGEnabled ? "rgba(245, 158, 11, 0.1)" : undefined,
                          },
                        },
                        createElement("i", { className: "ti ti-brain" })
                      )
                    )
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
                    onClick: openMenu,
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
