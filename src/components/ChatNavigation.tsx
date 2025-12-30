/**
 * ChatNavigation - 对话目录导航组件
 * 
 * 参考 Gemini 沉浸式阅读伴侣的目录设计：
 * - 右侧浮动目录面板
 * - 磨砂玻璃效果背景
 * - 用户消息作为主锚点（带高亮背景）
 * - AI 回复中的标题作为子锚点（带层级缩进）
 * - 丝滑滚动动画
 */

import type { Message } from "../services/session-service";

const React = window.React as unknown as {
  createElement: typeof window.React.createElement;
  useState: <T>(initial: T | (() => T)) => [T, (next: T | ((prev: T) => T)) => void];
  useCallback: <T extends (...args: any[]) => any>(fn: T, deps: any[]) => T;
  useMemo: <T>(factory: () => T, deps: any[]) => T;
  useEffect: (fn: () => void | (() => void), deps: any[]) => void;
  useRef: <T>(value: T) => { current: T };
};
const { createElement, useState, useCallback, useMemo, useEffect, useRef } = React;

interface ChatNavigationProps {
  messages: Message[];
  listRef: React.RefObject<HTMLDivElement>;
  visible?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// 样式定义 - 参考 Gemini 目录面板设计
// ─────────────────────────────────────────────────────────────────────────────

// 目录按钮
const tocFabStyle: React.CSSProperties = {
  position: "absolute",
  right: "16px",
  bottom: "80px",
  width: "40px",
  height: "40px",
  borderRadius: "50%",
  background: "var(--orca-color-bg-1)",
  border: "1px solid var(--orca-color-border)",
  boxShadow: "0 4px 12px rgba(0, 0, 0, 0.1)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  cursor: "pointer",
  zIndex: 100,
  transition: "all 0.3s ease",
  opacity: 0.6,
};

const tocFabHoverStyle: React.CSSProperties = {
  ...tocFabStyle,
  opacity: 1,
  transform: "scale(1.1)",
  boxShadow: "0 6px 16px rgba(0, 0, 0, 0.15)",
};

// 目录面板 - 磨砂玻璃效果（暗色模式适配）
const tocPanelStyle: React.CSSProperties = {
  position: "absolute",
  top: "60px",
  right: "-300px",
  width: "280px",
  maxHeight: "calc(100% - 140px)",
  background: "var(--orca-color-bg-1)",
  backdropFilter: "blur(10px)",
  borderRadius: "16px",
  boxShadow: "0 0 20px rgba(0, 0, 0, 0.15)",
  zIndex: 101,
  padding: "0",
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
  border: "1px solid var(--orca-color-border)",
  transition: "right 0.4s cubic-bezier(0.19, 1, 0.22, 1)",
};

const tocPanelActiveStyle: React.CSSProperties = {
  ...tocPanelStyle,
  right: "16px",
};

// 面板头部
const tocHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  alignItems: "center",
  padding: "14px 16px",
  borderBottom: "1px solid var(--orca-color-border)",
};

const tocTitleStyle: React.CSSProperties = {
  fontWeight: 600,
  fontSize: "14px",
  color: "var(--orca-color-text-1)",
  display: "flex",
  alignItems: "center",
  gap: "8px",
};

const tocCloseStyle: React.CSSProperties = {
  cursor: "pointer",
  color: "var(--orca-color-text-3)",
  fontSize: "16px",
  width: "24px",
  height: "24px",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  borderRadius: "50%",
  transition: "all 0.2s ease",
};

// 目录列表
const tocListStyle: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: "8px 10px",
};

// 用户消息锚点 - 主锚点样式（暗色模式适配）
const tocUserItemStyle: React.CSSProperties = {
  fontWeight: 500,
  background: "var(--orca-color-bg-3)",
  color: "var(--orca-color-text-1)",
  marginTop: "12px",
  marginBottom: "4px",
  padding: "10px 12px",
  borderRadius: "10px",
  fontSize: "13px",
  border: "1px solid var(--orca-color-border)",
  cursor: "pointer",
  transition: "all 0.2s ease",
  display: "flex",
  alignItems: "center",
  gap: "8px",
};

// AI 标题锚点 - 子锚点样式
const tocHeadingItemStyle = (level: number): React.CSSProperties => ({
  cursor: "pointer",
  padding: "6px 10px",
  paddingLeft: level === 1 ? "12px" : level === 2 ? "24px" : "36px",
  borderRadius: "6px",
  transition: "background 0.2s ease",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
  fontSize: level === 1 ? "13px" : "12px",
  color: level === 1 ? "var(--orca-color-text-1)" : "var(--orca-color-text-2)",
  fontWeight: level === 1 ? 500 : 400,
  borderLeft: level === 1 ? "3px solid var(--orca-color-primary)" : "none",
  opacity: level === 3 ? 0.7 : level === 2 ? 0.85 : 1,
});

// 空状态
const tocEmptyStyle: React.CSSProperties = {
  textAlign: "center",
  color: "var(--orca-color-text-3)",
  marginTop: "40px",
  fontSize: "13px",
};

// 序号标签
const indexBadgeStyle: React.CSSProperties = {
  fontSize: "10px",
  color: "var(--orca-color-text-3)",
  background: "var(--orca-color-bg-3)",
  padding: "2px 6px",
  borderRadius: "4px",
  fontWeight: 500,
};

// ─────────────────────────────────────────────────────────────────────────────
// 工具函数
// ─────────────────────────────────────────────────────────────────────────────

// 截取消息预览
function getPreview(content: string, maxLength = 30): string {
  if (!content) return "(空消息)";
  const cleaned = content
    .replace(/```[\s\S]*?```/g, "[代码]")
    .replace(/`[^`]+`/g, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/[#*_~]/g, "")
    .replace(/\n+/g, " ")
    .trim();
  
  if (cleaned.length <= maxLength) return cleaned;
  return cleaned.substring(0, maxLength) + "...";
}

// 从 AI 回复中提取标题
function extractHeadings(content: string): Array<{ level: number; text: string }> {
  if (!content) return [];
  const headings: Array<{ level: number; text: string }> = [];
  const lines = content.split("\n");
  
  for (const line of lines) {
    const match = line.match(/^(#{1,3})\s+(.+)$/);
    if (match) {
      headings.push({
        level: match[1].length,
        text: match[2].trim(),
      });
    }
  }
  
  return headings;
}

// ─────────────────────────────────────────────────────────────────────────────
// 组件
// ─────────────────────────────────────────────────────────────────────────────

export default function ChatNavigation({ messages, listRef, visible = true }: ChatNavigationProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const panelRef = useRef<HTMLDivElement | null>(null);

  // 构建目录结构：用户消息 + AI 回复中的标题
  const tocItems = useMemo(() => {
    const items: Array<{
      type: "user" | "heading";
      index: number;
      userIndex?: number;
      content: string;
      level?: number;
      messageId: string;
      headingId?: string; // 标题的 DOM ID，用于精确跳转
    }> = [];
    
    let userCount = 0;
    
    messages.forEach((msg, index) => {
      if (msg.role === "user" && !msg.localOnly) {
        userCount++;
        items.push({
          type: "user",
          index,
          userIndex: userCount,
          content: msg.content,
          messageId: msg.id,
        });
      } else if (msg.role === "assistant" && msg.content) {
        // 提取 AI 回复中的标题
        const headings = extractHeadings(msg.content);
        headings.forEach((h) => {
          // 生成与 MarkdownMessage 中相同的 headingId
          const headingId = `heading-${h.text
            .toLowerCase()
            .replace(/[^\w\u4e00-\u9fa5\s-]/g, "")
            .replace(/\s+/g, "-")
            .substring(0, 50)}`;
          items.push({
            type: "heading",
            index,
            content: h.text,
            level: h.level,
            messageId: msg.id,
            headingId,
          });
        });
      }
    });
    
    return items;
  }, [messages]);

  // 用户消息数量
  const userCount = useMemo(() => {
    return tocItems.filter((item) => item.type === "user").length;
  }, [tocItems]);

  // 点击外部关闭面板
  useEffect(() => {
    if (!isOpen) return;
    
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (panelRef.current && !panelRef.current.contains(target)) {
        setIsOpen(false);
      }
    };
    
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // 丝滑滚动到指定消息或标题
  const scrollToMessage = useCallback((index: number, headingId?: string) => {
    if (!listRef.current) return;
    
    // 如果有 headingId，尝试直接跳转到标题元素
    if (headingId) {
      const headingElement = listRef.current.querySelector(`#${CSS.escape(headingId)}`);
      if (headingElement) {
        headingElement.scrollIntoView({ behavior: "smooth", block: "center" });
        // 高亮效果
        headingElement.classList.add("chat-nav-highlight");
        setTimeout(() => headingElement.classList.remove("chat-nav-highlight"), 1500);
        setIsOpen(false);
        return;
      }
    }
    
    // 回退到消息级别的跳转
    const messageElements = listRef.current.querySelectorAll("[data-message-index]");
    const targetElement = Array.from(messageElements).find(
      (el) => el.getAttribute("data-message-index") === String(index)
    );
    
    if (targetElement) {
      // 丝滑滚动
      targetElement.scrollIntoView({ behavior: "smooth", block: "start" });
      // 高亮效果
      targetElement.classList.add("chat-nav-highlight");
      setTimeout(() => targetElement.classList.remove("chat-nav-highlight"), 1500);
    } else {
      const allMessages = listRef.current.children;
      if (allMessages[index]) {
        allMessages[index].scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }
    
    setIsOpen(false);
  }, [listRef]);

  // 如果没有内容，不显示导航
  if (!visible || userCount === 0) return null;

  return createElement(
    "div",
    { ref: panelRef },
    // 目录按钮
    createElement(
      "div",
      {
        style: isHovered ? tocFabHoverStyle : tocFabStyle,
        onClick: () => setIsOpen(!isOpen),
        onMouseEnter: () => setIsHovered(true),
        onMouseLeave: () => setIsHovered(false),
        title: "对话目录",
      },
      createElement("i", {
        className: "ti ti-list-tree",
        style: { fontSize: "18px", color: "var(--orca-color-text-1)" },
      })
    ),
    // 目录面板
    createElement(
      "div",
      { style: isOpen ? tocPanelActiveStyle : tocPanelStyle },
      // 头部
      createElement(
        "div",
        { style: tocHeaderStyle },
        createElement(
          "div",
          { style: tocTitleStyle },
          createElement("i", { className: "ti ti-list-tree" }),
          `目录`
        ),
        createElement(
          "div",
          {
            style: tocCloseStyle,
            onClick: () => setIsOpen(false),
            onMouseEnter: (e: any) => {
              e.currentTarget.style.background = "var(--orca-color-bg-3)";
              e.currentTarget.style.color = "var(--orca-color-text-1)";
            },
            onMouseLeave: (e: any) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = "var(--orca-color-text-3)";
            },
            title: "关闭目录",
          },
          createElement("i", { className: "ti ti-x" })
        )
      ),
      // 目录列表
      createElement(
        "div",
        { style: tocListStyle },
        tocItems.length === 0
          ? createElement("div", { style: tocEmptyStyle }, "暂无对话")
          : tocItems.map((item, i) => {
              if (item.type === "user") {
                return createElement(
                  "div",
                  {
                    key: `user-${item.messageId}`,
                    style: tocUserItemStyle,
                    onClick: () => scrollToMessage(item.index),
                    onMouseEnter: (e: any) => {
                      e.currentTarget.style.background = "var(--orca-color-bg-2)";
                      e.currentTarget.style.borderColor = "var(--orca-color-primary)";
                      e.currentTarget.style.boxShadow = "0 2px 8px rgba(0,0,0,0.1)";
                    },
                    onMouseLeave: (e: any) => {
                      e.currentTarget.style.background = "var(--orca-color-bg-3)";
                      e.currentTarget.style.borderColor = "var(--orca-color-border)";
                      e.currentTarget.style.boxShadow = "none";
                    },
                  },
                  createElement("span", { style: indexBadgeStyle }, `#${item.userIndex}`),
                  createElement("span", { style: { flex: 1, overflow: "hidden", textOverflow: "ellipsis" } }, getPreview(item.content))
                );
              } else {
                return createElement(
                  "div",
                  {
                    key: `heading-${item.messageId}-${i}`,
                    style: tocHeadingItemStyle(item.level || 1),
                    onClick: () => scrollToMessage(item.index, item.headingId),
                    onMouseEnter: (e: any) => {
                      e.currentTarget.style.background = "var(--orca-color-bg-3)";
                    },
                    onMouseLeave: (e: any) => {
                      e.currentTarget.style.background = "transparent";
                    },
                  },
                  item.content
                );
              }
            })
      )
    )
  );
}
