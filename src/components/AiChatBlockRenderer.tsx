/**
 * AiChatBlockRenderer - AI 对话块自定义渲染器
 * 用于在 Orca 笔记中渲染保存的 AI 对话
 * 
 * 功能：
 * - 继续对话 - 在 AI 面板中继续对话
 * - 导出 - 导出为 Markdown/JSON 文件
 * - 搜索 - 在对话内容中搜索
 * - 消息统计 - token 数、字数
 * - 时间戳 - 每条消息的时间
 */

import type { Block, DbId } from "../orca.d.ts";
import MessageList from "./MessageList";
import ChatNavigation from "./ChatNavigation";
import type { Message } from "../services/session-service";
import { estimateTokens } from "../utils/token-utils";
import { withTooltip } from "../utils/orca-tooltip";

const React = window.React as unknown as {
  createElement: typeof window.React.createElement;
  useState: <T>(initial: T | (() => T)) => [T, (next: T | ((prev: T) => T)) => void];
  useEffect: (fn: () => void | (() => void), deps: any[]) => void;
  useMemo: <T>(fn: () => T, deps: any[]) => T;
  useRef: <T>(value: T) => { current: T };
  useCallback: <T extends (...args: any[]) => any>(fn: T, deps: any[]) => T;
};
const { createElement, useState, useEffect, useMemo, useRef, useCallback } = React;
const { useSnapshot } = (window as any).Valtio as {
  useSnapshot: <T extends object>(obj: T) => T;
};
const { BlockShell, BlockChildren } = orca.components;

/** 渲染器 Props */
type Props = {
  panelId: string;
  blockId: DbId;
  rndId: string;
  blockLevel: number;
  indentLevel: number;
  mirrorId?: DbId;
  withBreadcrumb?: boolean;
  initiallyCollapsed?: boolean;
  renderingMode?: "normal" | "simple" | "simple-children" | "readonly";
  title?: string;
  messages?: Message[];
  model?: string;
  createdAt?: number;
};

/** 工具栏按钮组件 */
function ToolbarButton({ icon, label, onClick, disabled }: {
  icon: string;
  label: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return withTooltip(
    label,
    createElement(
      "button",
      {
        onClick,
        disabled,
        style: {
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "6px",
          fontSize: "14px",
          background: "transparent",
          border: "1px solid var(--orca-color-border)",
          borderRadius: "6px",
          color: disabled ? "var(--orca-color-text-3)" : "var(--orca-color-text-2)",
          cursor: disabled ? "not-allowed" : "pointer",
          transition: "all 0.2s",
          userSelect: "none",
        },
      },
      createElement("i", { className: `ti ti-${icon}` })
    )
  );
}

export default function AiChatBlockRenderer({
  panelId,
  blockId,
  rndId,
  blockLevel,
  indentLevel,
  mirrorId,
  withBreadcrumb,
  initiallyCollapsed,
  renderingMode,
  title: propTitle,
  messages: propMessages,
  model: propModel,
  createdAt: propCreatedAt,
}: Props) {
  const { blocks } = useSnapshot(orca.state);
  const block = blocks[mirrorId ?? blockId] as any;
  const [expanded, setExpanded] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // 从 block._repr 或 props 获取数据
  const repr = block?._repr || {};
  const title = propTitle || repr.title || "AI 对话";
  const messages: Message[] = propMessages || repr.messages || [];
  const model = propModel || repr.model || "";
  const createdAt = propCreatedAt || repr.createdAt;
  const targetBlockId = mirrorId ?? blockId;

  // Debug: 检查消息中的 contextRefs
  useEffect(() => {
    if (messages.length > 0) {
      const msgsWithRefs = messages.filter(m => m.contextRefs && m.contextRefs.length > 0);
      if (msgsWithRefs.length > 0) {
        console.log("[AiChatBlockRenderer] Messages with contextRefs:", msgsWithRefs.map(m => ({
          role: m.role,
          contextRefs: m.contextRefs,
        })));
      }
    }
  }, [messages]);

  // 备注标题状态
  const [note, setNote] = useState("");
  const [isEditingNote, setIsEditingNote] = useState(false);
  const [noteValue, setNoteValue] = useState("");
  const noteInputRef = useRef<HTMLInputElement | null>(null);

  // 加载备注
  useEffect(() => {
    const loadNote = async () => {
      try {
        const pluginName = "ai-chat";
        const key = `block-note-${targetBlockId}`;
        const saved = await orca.plugins.getData(pluginName, key);
        if (saved && typeof saved === "string") {
          setNote(saved);
        }
      } catch (err) {
        // 忽略
      }
    };
    loadNote();
  }, [targetBlockId]);

  // 保存备注
  const handleSaveNote = useCallback(async () => {
    const trimmed = noteValue.trim();
    try {
      const pluginName = "ai-chat";
      const key = `block-note-${targetBlockId}`;
      await orca.plugins.setData(pluginName, key, trimmed);
      setNote(trimmed);
      setIsEditingNote(false);
      if (trimmed) {
        orca.notify("success", "备注已保存");
      }
    } catch (err) {
      console.error("[AiChatBlockRenderer] Failed to save note:", err);
      orca.notify("error", "保存备注失败");
    }
  }, [targetBlockId, noteValue]);

  // 开始编辑备注
  const handleStartEditNote = useCallback(() => {
    setNoteValue(note);
    setIsEditingNote(true);
    setTimeout(() => noteInputRef.current?.focus(), 50);
  }, [note]);

  // 计算统计信息
  const stats = useMemo(() => {
    let totalChars = 0;
    let totalTokens = 0;
    let userMessages = 0;
    let aiMessages = 0;
    
    for (const msg of messages) {
      const content = msg.content || "";
      totalChars += content.length;
      totalTokens += estimateTokens(content);
      if (msg.role === "user") userMessages++;
      else if (msg.role === "assistant") aiMessages++;
    }
    
    return { totalChars, totalTokens, userMessages, aiMessages };
  }, [messages]);

  // 搜索过滤消息
  const filteredMessages = useMemo(() => {
    if (!searchQuery.trim()) return messages;
    const query = searchQuery.toLowerCase();
    return messages.filter(m => 
      (m.content || "").toLowerCase().includes(query)
    );
  }, [messages, searchQuery]);

  // 显示的消息（折叠时只显示前3条）
  const displayMessages = useMemo(() => {
    const msgs = showSearch ? filteredMessages : messages;
    if (!msgs || !Array.isArray(msgs)) return [];
    if (expanded || showSearch) return msgs;
    return msgs.slice(0, 3);
  }, [messages, filteredMessages, expanded, showSearch]);

  const hasMore = messages && messages.length > 3 && !showSearch;
  
  // 消息数量 <= 4 时不限制高度
  const shouldLimitHeight = messages && messages.length > 4;


  // 继续对话
  const handleContinueChat = useCallback(async () => {
    try {
      // 导入 session-service 和 ui 模块
      const { createNewSession } = await import("../services/session-service");
      const { openAiChatPanel } = await import("../ui/ai-chat-ui");
      const { updateSessionStore } = await import("../store/session-store");
      
      // 创建新会话并加载消息
      const newSession = {
        ...createNewSession(),
        title,
        model: model || undefined,
        messages: [...messages],
      };
      
      // 更新 session store
      updateSessionStore(newSession, messages, []);
      
      // 打开 AI 面板
      openAiChatPanel();
      
      orca.notify("success", "已加载对话，可以继续聊天");
    } catch (err) {
      console.error("[AiChatBlockRenderer] Continue chat error:", err);
      orca.notify("error", "加载对话失败");
    }
  }, [title, model, messages]);

  // 导出为 Markdown
  const handleExportMarkdown = useCallback(() => {
    let md = `# ${title}\n\n`;
    if (model) md += `**模型**: ${model}\n\n`;
    if (createdAt) md += `**时间**: ${new Date(createdAt).toLocaleString("zh-CN")}\n\n`;
    md += `---\n\n`;
    
    for (const msg of messages) {
      const role = msg.role === "user" ? "👤 用户" : "🤖 AI";
      const time = msg.createdAt ? new Date(msg.createdAt).toLocaleTimeString("zh-CN") : "";
      md += `### ${role}${time ? ` (${time})` : ""}\n\n`;
      md += `${msg.content || ""}\n\n`;
    }
    
    const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.slice(0, 30)}.md`;
    a.click();
    URL.revokeObjectURL(url);
    orca.notify("success", "已导出为 Markdown");
  }, [title, model, createdAt, messages]);

  // 导出为 JSON
  const handleExportJson = useCallback(() => {
    const data = {
      title,
      model,
      createdAt,
      exportedAt: Date.now(),
      messages: messages.map(m => ({
        role: m.role,
        content: m.content,
        createdAt: m.createdAt,
        reasoning: m.reasoning,
      })),
    };
    
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${title.slice(0, 30)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    orca.notify("success", "已导出为 JSON");
  }, [title, model, createdAt, messages]);

  // 复制全部对话内容
  const handleCopyAll = useCallback(() => {
    let text = "";
    for (const msg of messages) {
      const role = msg.role === "user" ? "用户" : "AI";
      text += `【${role}】\n${msg.content || ""}\n\n`;
    }
    navigator.clipboard.writeText(text.trim()).then(() => {
      orca.notify("success", "已复制对话内容");
    }).catch(() => {
      orca.notify("error", "复制失败");
    });
  }, [messages]);

  // 切换搜索
  const handleToggleSearch = useCallback(() => {
    setShowSearch(prev => {
      if (!prev) {
        setTimeout(() => searchInputRef.current?.focus(), 100);
      } else {
        setSearchQuery("");
      }
      return !prev;
    });
  }, []);

  const childrenBlocks = useMemo(
    () =>
      createElement(BlockChildren as any, {
        block: block as Block,
        panelId,
        blockLevel,
        indentLevel,
        renderingMode,
      }),
    [block?.children]
  );


  // 标题栏
  const headerJsx = createElement(
    "div",
    {
      style: {
        padding: "12px 16px",
        borderBottom: "1px solid var(--orca-color-border)",
        background: "var(--orca-color-bg-2)",
        userSelect: "none",
      },
    },
    // 第一行：备注（大字体），默认显示标题
    createElement(
      "div",
      {
        style: {
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        },
      },
      // 左侧：图标和备注
      createElement(
        "div",
        { style: { display: "flex", alignItems: "center", gap: "6px", flex: 1, minWidth: 0 } },
        createElement("i", {
          className: "ti ti-message-chatbot",
          style: { fontSize: "18px", color: "var(--orca-color-primary)", flexShrink: 0 },
        }),
        isEditingNote
          ? createElement("input", {
              ref: noteInputRef as any,
              type: "text",
              value: noteValue,
              onChange: (e: any) => setNoteValue(e.target.value),
              onBlur: handleSaveNote,
              onKeyDown: (e: any) => {
                if (!(e.nativeEvent?.isComposing || e.keyCode === 229) && e.key === "Enter") handleSaveNote();
                if (e.key === "Escape") setIsEditingNote(false);
              },
              placeholder: title || "添加备注...",
              style: {
                flex: 1,
                fontWeight: 600,
                fontSize: "15px",
                color: "var(--orca-color-text-1)",
                border: "1px solid var(--orca-color-primary)",
                borderRadius: "4px",
                padding: "2px 8px",
                background: "var(--orca-color-bg-1)",
                outline: "none",
              },
            })
          : createElement(
              "span",
              {
                style: {
                  flex: 1,
                  fontWeight: 600,
                  fontSize: "15px",
                  color: "var(--orca-color-text-1)",
                  cursor: "pointer",
                  padding: "2px 4px",
                  borderRadius: "4px",
                  transition: "background 0.15s",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                },
                onClick: handleStartEditNote,
                onMouseOver: (e: any) => {
                  e.currentTarget.style.background = "var(--orca-color-bg-3)";
                },
                onMouseOut: (e: any) => {
                  e.currentTarget.style.background = "transparent";
                },
              },
              note || title || "点击添加备注..."
            )
      ),
      // 右侧：模型和时间
      createElement(
        "div",
        { style: { fontSize: "11px", color: "var(--orca-color-text-3)", display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 } },
        model && createElement(
          "span",
          {
            style: {
              background: "var(--orca-color-bg-3)",
              padding: "2px 8px",
              borderRadius: "4px",
            },
          },
          model
        ),
        createdAt && new Date(createdAt).toLocaleDateString("zh-CN")
      )
    )
  );

  // 工具栏
  const toolbarJsx = createElement(
    "div",
    {
      style: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "8px 16px",
        borderBottom: "1px solid var(--orca-color-border)",
        background: "var(--orca-color-bg-1)",
        gap: "8px",
        flexWrap: "wrap",
        userSelect: "none",
      },
    },
    // 左侧：操作按钮
    createElement(
      "div",
      { style: { display: "flex", gap: "6px", flexWrap: "wrap" } },
      createElement(ToolbarButton, {
        icon: "player-play",
        label: "继续对话",
        onClick: handleContinueChat,
      }),
      createElement(ToolbarButton, {
        icon: "copy",
        label: "复制全部",
        onClick: handleCopyAll,
      }),
      createElement(ToolbarButton, {
        icon: "search",
        label: showSearch ? "关闭搜索" : "搜索",
        onClick: handleToggleSearch,
      }),
      createElement(ToolbarButton, {
        icon: "markdown",
        label: "导出 MD",
        onClick: handleExportMarkdown,
      }),
      createElement(ToolbarButton, {
        icon: "json",
        label: "导出 JSON",
        onClick: handleExportJson,
      }),
      createElement(ToolbarButton, {
        icon: isFullscreen ? "arrows-minimize" : "arrows-maximize",
        label: isFullscreen ? "退出全屏" : "全屏",
        onClick: () => setIsFullscreen(!isFullscreen),
      })
    ),
    // 右侧：统计信息
    createElement(
      "div",
      { style: { display: "flex", gap: "12px", fontSize: "11px", color: "var(--orca-color-text-3)" } },
      createElement("span", null, `${stats.userMessages} 问 / ${stats.aiMessages} 答`),
      createElement("span", null, `${stats.totalChars.toLocaleString()} 字`),
      createElement("span", null, `~${stats.totalTokens.toLocaleString()} tokens`)
    )
  );

  // 搜索栏
  const searchBarJsx = showSearch && createElement(
    "div",
    {
      style: {
        padding: "8px 16px",
        borderBottom: "1px solid var(--orca-color-border)",
        background: "var(--orca-color-bg-1)",
      },
    },
    createElement(
      "div",
      {
        style: {
          display: "flex",
          alignItems: "center",
          gap: "8px",
          background: "var(--orca-color-bg-2)",
          borderRadius: "6px",
          padding: "6px 12px",
        },
      },
      createElement("i", {
        className: "ti ti-search",
        style: { color: "var(--orca-color-text-3)", fontSize: "14px" },
      }),
      createElement("input", {
        ref: searchInputRef as any,
        value: searchQuery,
        onChange: (e: any) => setSearchQuery(e.target.value),
        placeholder: "搜索对话内容...",
        style: {
          flex: 1,
          border: "none",
          background: "transparent",
          outline: "none",
          fontSize: "13px",
          color: "var(--orca-color-text-1)",
        },
      }),
      searchQuery && createElement(
        "span",
        { style: { fontSize: "11px", color: "var(--orca-color-text-3)" } },
        `${filteredMessages.length} / ${messages.length}`
      ),
      searchQuery && createElement("i", {
        className: "ti ti-x",
        onClick: () => setSearchQuery(""),
        style: { color: "var(--orca-color-text-3)", cursor: "pointer", fontSize: "14px" },
      })
    )
  );


  // 内容 JSX
  const contentJsx = createElement(
    "div",
    {
      style: {
        background: "var(--orca-color-bg-1)",
        borderRadius: isFullscreen ? "0" : "12px",
        border: isFullscreen ? "none" : "1px solid var(--orca-color-border)",
        overflow: "hidden",
        userSelect: "text",
        WebkitUserSelect: "text",
        // 全屏样式
        ...(isFullscreen ? {
          position: "fixed",
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          zIndex: 9999,
          display: "flex",
          flexDirection: "column",
        } : {
          position: "relative",
        }),
      } as React.CSSProperties,
      // 允许复制事件正常传播
      onCopy: (e: any) => {
        // 不阻止默认行为，让浏览器处理复制
        e.stopPropagation();
      },
    },
    // 标题栏
    headerJsx,
    // 工具栏
    toolbarJsx,
    // 搜索栏
    searchBarJsx,
    // 消息列表外层容器
    createElement(
      "div",
      {
        style: {
          position: "relative",
          overflow: "hidden",
          flex: isFullscreen ? 1 : undefined,
        },
      },
      // 消息列表滚动容器
      createElement(
        "div",
        {
          ref: listRef as any,
          style: {
            maxHeight: isFullscreen ? "100%" : (shouldLimitHeight ? (expanded || showSearch ? "800px" : "400px") : "none"),
            height: isFullscreen ? "100%" : undefined,
            overflow: shouldLimitHeight ? "auto" : "visible",
          },
        },
        // 搜索无结果提示
        showSearch && searchQuery && filteredMessages.length === 0
          ? createElement(
              "div",
              {
                style: {
                  padding: "32px",
                  textAlign: "center",
                  color: "var(--orca-color-text-3)",
                },
              },
              createElement("i", {
                className: "ti ti-search-off",
                style: { fontSize: "32px", marginBottom: "8px", display: "block" },
              }),
              `未找到包含 "${searchQuery}" 的消息`
            )
          : createElement(MessageList, {
              messages: displayMessages,
              readonly: true,
              style: { padding: "16px" },
            })
      ),
      // 目录导航
      displayMessages.length > 2 && !showSearch && createElement(ChatNavigation, {
        messages: displayMessages,
        listRef: listRef as any,
        visible: true,
      })
    ),
    // 展开/收起按钮
    hasMore &&
      createElement(
        "div",
        {
          style: {
            textAlign: "center",
            padding: "12px",
            borderTop: "1px dashed var(--orca-color-border)",
            background: "var(--orca-color-bg-2)",
          },
        },
        createElement(
          "button",
          {
            onClick: () => setExpanded(!expanded),
            style: {
              background: "var(--orca-color-bg-3)",
              border: "1px solid var(--orca-color-border)",
              color: "var(--orca-color-primary)",
              cursor: "pointer",
              fontSize: "12px",
              padding: "6px 16px",
              borderRadius: "16px",
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              transition: "all 0.2s",
            },
          },
          createElement("i", { className: expanded ? "ti ti-chevron-up" : "ti ti-chevron-down" }),
          expanded ? "收起" : `展开剩余 ${messages.length - 3} 条`
        )
      )
  );

  return createElement(BlockShell as any, {
    panelId,
    blockId,
    rndId,
    mirrorId,
    blockLevel,
    indentLevel,
    withBreadcrumb,
    initiallyCollapsed,
    renderingMode,
    reprClassName: "aichat-repr-conversation",
    contentClassName: "aichat-repr-conversation-content",
    contentJsx,
    childrenJsx: childrenBlocks,
    droppable: true,
    editable: false,    // 禁用编辑，启用上下插入块功能
    selfFoldable: true, // 启用自折叠功能
  });
}
