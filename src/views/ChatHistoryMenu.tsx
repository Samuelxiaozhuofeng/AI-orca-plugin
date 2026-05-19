/**
 * ChatHistoryMenu - 历史对话菜单组件
 * 
 * 参考目录面板设计：
 * - 磨砂玻璃效果背景
 * - 置顶对话显示在顶部
 * - 支持重命名、置顶、删除操作
 * - 右键菜单操作
 */

import type { SavedSession } from "../services/session-service";
import { formatSessionTime, generateSessionTitle } from "../services/session-service";
import { withTooltip } from "../utils/orca-tooltip";

const React = window.React as unknown as {
  createElement: typeof window.React.createElement;
  useState: <T>(initial: T | (() => T)) => [T, (next: T | ((prev: T) => T)) => void];
  useEffect: (fn: () => void | (() => void), deps: any[]) => void;
  useRef: <T>(value: T) => { current: T };
  useCallback: <T extends (...args: any[]) => any>(fn: T, deps: any[]) => T;
  Fragment: typeof window.React.Fragment;
};
const { createElement, useState, useEffect, useRef, useCallback, Fragment } = React;

const { Button } = orca.components;

// ─────────────────────────────────────────────────────────────────────────────
// 样式定义
// ─────────────────────────────────────────────────────────────────────────────

const panelStyle: React.CSSProperties = {
  position: "absolute",
  top: "100%",
  right: 0,
  marginTop: 4,
  width: 300,
  maxHeight: 480,
  background: "var(--orca-color-bg-1)",
  backdropFilter: "blur(10px)",
  border: "1px solid var(--orca-color-border)",
  borderRadius: "var(--orca-radius-lg)",
  boxShadow: "0 4px 20px rgba(0, 0, 0, 0.15)",
  zIndex: 1000,
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
};

const headerStyle: React.CSSProperties = {
  padding: "14px 16px",
  borderBottom: "1px solid var(--orca-color-border)",
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
};

const headerTitleStyle: React.CSSProperties = {
  fontWeight: 600,
  fontSize: 14,
  color: "var(--orca-color-text-1)",
  display: "flex",
  alignItems: "center",
  gap: 8,
};

const newButtonStyle: React.CSSProperties = {
  background: "var(--orca-color-bg-3)",
  color: "var(--orca-color-text-1)",
  border: "1px solid var(--orca-color-border)",
  borderRadius: 6,
  padding: "5px 10px",
  cursor: "pointer",
  fontSize: 12,
  display: "flex",
  alignItems: "center",
  gap: 4,
  transition: "opacity 0.15s",
};

const listStyle: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: "8px",
};

const emptyStyle: React.CSSProperties = {
  padding: "40px 16px",
  textAlign: "center",
  color: "var(--orca-color-text-3)",
  fontSize: 13,
};

const sessionItemStyle = (isActive: boolean, isPinned: boolean, isHovered: boolean): React.CSSProperties => ({
  padding: "6px 8px",
  marginBottom: 2,
  borderRadius: 6,
  cursor: "pointer",
  background: isActive ? "var(--orca-color-bg-3)" : "transparent",
  border: isPinned ? "1px solid var(--orca-color-primary, #007bff)" : "1px solid transparent",
  display: "flex",
  alignItems: "center",
  gap: 6,
  transition: "all 0.15s ease",
  transform: isHovered ? "translateY(-1px)" : "translateY(0)",
  boxShadow: isHovered ? "0 2px 8px rgba(0,0,0,0.06)" : "none",
});

const sessionIconStyle = (isPinned: boolean): React.CSSProperties => ({
  width: 22,
  height: 22,
  borderRadius: "var(--orca-radius-sm)",
  background: isPinned ? "var(--orca-color-bg-3)" : "var(--orca-color-bg-3)",
  border: isPinned ? "1px solid var(--orca-color-border)" : "none",
  color: isPinned ? "var(--orca-color-text-1)" : "var(--orca-color-text-2)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 11,
  flexShrink: 0,
});

const sessionContentStyle: React.CSSProperties = {
  flex: 1,
  minWidth: 0,
};

const sessionTitleStyle: React.CSSProperties = {
  fontWeight: 500,
  fontSize: 12,
  color: "var(--orca-color-text-1)",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const sessionMetaStyle: React.CSSProperties = {
  fontSize: 10,
  color: "var(--orca-color-text-3)",
  marginTop: 1,
  display: "flex",
  alignItems: "center",
  gap: 4,
};

const actionButtonStyle: React.CSSProperties = {
  background: "transparent",
  border: "none",
  color: "var(--orca-color-text-3)",
  cursor: "pointer",
  padding: 2,
  borderRadius: 3,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  opacity: 0,
  transition: "opacity 0.15s, color 0.15s",
};

const footerStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderTop: "1px solid var(--orca-color-border)",
};

const clearButtonStyle: React.CSSProperties = {
  width: "100%",
  padding: "8px",
  background: "transparent",
  border: "1px solid var(--orca-color-border)",
  borderRadius: 6,
  color: "var(--orca-color-text-2)",
  cursor: "pointer",
  fontSize: 12,
  transition: "all 0.15s",
};

const renameInputStyle: React.CSSProperties = {
  width: "100%",
  padding: "4px 8px",
  fontSize: 13,
  border: "1px solid var(--orca-color-primary, #007bff)",
  borderRadius: "var(--orca-radius-sm)",
  background: "var(--orca-color-bg-1)",
  color: "var(--orca-color-text-1)",
  outline: "none",
};

// ─────────────────────────────────────────────────────────────────────────────
// Props
// ─────────────────────────────────────────────────────────────────────────────

type Props = {
  sessions: SavedSession[];
  activeSessionId: string | null;
  onSelectSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  onClearAll: () => void;
  onNewSession: () => void;
  onTogglePin?: (sessionId: string) => void;
  onToggleFavorite?: (sessionId: string) => void;
  onRename?: (sessionId: string, newTitle: string) => void;
};

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function ChatHistoryMenu({
  sessions,
  activeSessionId,
  onSelectSession,
  onDeleteSession,
  onClearAll,
  onNewSession,
  onTogglePin,
  onToggleFavorite,
  onRename,
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const renameInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setRenamingId(null);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  useEffect(() => {
    if (renamingId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingId]);

  const handleSelect = useCallback((sessionId: string) => {
    if (renamingId) return;
    onSelectSession(sessionId);
    setIsOpen(false);
  }, [renamingId, onSelectSession]);

  const handleDelete = useCallback((e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    onDeleteSession(sessionId);
  }, [onDeleteSession]);

  const handleTogglePin = useCallback((e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    onTogglePin?.(sessionId);
  }, [onTogglePin]);

  const handleToggleFavorite = useCallback((e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    onToggleFavorite?.(sessionId);
  }, [onToggleFavorite]);

  const getDisplayTitle = useCallback((session: SavedSession) => {
    const title = (session.title || "").trim();
    if (title) return title;
    return generateSessionTitle(session.messages || []);
  }, []);

  const handleStartRename = useCallback((e: React.MouseEvent, session: SavedSession) => {
    e.stopPropagation();
    setRenamingId(session.id);
    setRenameValue(getDisplayTitle(session));
  }, []);

  const handleFinishRename = useCallback(() => {
    if (renamingId && renameValue.trim()) {
      onRename?.(renamingId, renameValue.trim());
    }
    setRenamingId(null);
    setRenameValue("");
  }, [renamingId, renameValue, onRename]);

  const handleRenameKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleFinishRename();
    } else if (e.key === "Escape") {
      setRenamingId(null);
      setRenameValue("");
    }
  }, [handleFinishRename]);

  const handleClearAll = useCallback(() => {
    if (sessions.length === 0) return;
    onClearAll();
    setIsOpen(false);
  }, [sessions.length, onClearAll]);

  const handleNewSession = useCallback(() => {
    onNewSession();
    setIsOpen(false);
  }, [onNewSession]);

  // 分组逻辑：
  // - 置顶始终在最前
  // - 收藏独立分组（⭐ 收藏）
  // - 非收藏按时间段分组：今天 / 昨天 / 本周 / 更早
  const now = Date.now();
  const todayStart = new Date(new Date().getFullYear(), new Date().getMonth(), new Date().getDate()).getTime();
  const yesterdayStart = todayStart - 86400000;
  const weekStart = todayStart - 6 * 86400000;

  const pinnedSessions = sessions.filter((s) => s.pinned);

  // 非置顶收藏
  const favoritedSessions = showFavoritesOnly
    ? [] // 收藏视图下不单独显示，合并到下面分组
    : sessions.filter((s) => s.favorited && !s.pinned);

  // 非置顶非收藏，按时间分组
  const nonFavoritedSessions = showFavoritesOnly
    ? sessions.filter((s) => s.favorited && !s.pinned)
    : sessions.filter((s) => !s.pinned && !s.favorited);

  const groupByTime = (list: SavedSession[]) => {
    const today: SavedSession[] = [];
    const yesterday: SavedSession[] = [];
    const thisWeek: SavedSession[] = [];
    const older: SavedSession[] = [];
    for (const s of list) {
      const t = s.updatedAt || s.createdAt;
      if (t >= todayStart) today.push(s);
      else if (t >= yesterdayStart) yesterday.push(s);
      else if (t >= weekStart) thisWeek.push(s);
      else older.push(s);
    }
    return { today, yesterday, thisWeek, older };
  };

  const timeGroups = groupByTime(nonFavoritedSessions);
  const allTimeGroups = [
    { label: "今天", sessions: timeGroups.today },
    { label: "昨天", sessions: timeGroups.yesterday },
    { label: "本周", sessions: timeGroups.thisWeek },
    { label: "更早", sessions: timeGroups.older },
  ].filter((g) => g.sessions.length > 0);

  const totalFiltered = pinnedSessions.length + favoritedSessions.length + nonFavoritedSessions.length;

  // 渲染单个会话项
  function renderSessionItem(session: SavedSession, isPinned: boolean) {
    const isActive = session.id === activeSessionId;
    const isHovered = session.id === hoveredId;
    const isRenaming = session.id === renamingId;

    return createElement(
      "div",
      {
        key: session.id,
        style: sessionItemStyle(isActive, isPinned, isHovered),
        onClick: () => handleSelect(session.id),
        onMouseEnter: () => setHoveredId(session.id),
        onMouseLeave: () => setHoveredId(null),
      },
      createElement(
        "div",
        { style: sessionIconStyle(isPinned) },
        createElement("i", { className: isPinned ? "ti ti-pin-filled" : "ti ti-message" })
      ),
      createElement(
        "div",
        { style: sessionContentStyle },
        isRenaming
          ? createElement("input", {
              ref: renameInputRef as any,
              type: "text",
              value: renameValue,
              onChange: (e: any) => setRenameValue(e.target.value),
              onBlur: handleFinishRename,
              onKeyDown: handleRenameKeyDown,
              onClick: (e: any) => e.stopPropagation(),
              maxLength: 100,
              placeholder: "输入标题",
              style: renameInputStyle,
            })
          : createElement(
              Fragment,
              null,
              createElement("div", { style: sessionTitleStyle }, getDisplayTitle(session)),
              createElement(
                "div",
                { style: sessionMetaStyle },
                createElement("span", null, formatSessionTime(session.updatedAt)),
                createElement("span", null, "·"),
                createElement("span", null, `${session.messageCount ?? session.messages.length} 条`)
              )
            )
      ),
      !isRenaming &&
        createElement(
          "div",
          {
            style: {
              display: "flex",
              gap: 2,
              opacity: isHovered ? 1 : 0,
              transition: "opacity 0.15s",
            },
          },
          onRename &&
            withTooltip(
              "重命名",
              createElement(
                "button",
                {
                  style: { ...actionButtonStyle, opacity: isHovered ? 0.6 : 0 },
                  onClick: (e: any) => handleStartRename(e, session),
                  onMouseOver: (e: any) => {
                    e.currentTarget.style.opacity = "1";
                    e.currentTarget.style.color = "var(--orca-color-primary)";
                  },
                  onMouseOut: (e: any) => {
                    e.currentTarget.style.opacity = "0.6";
                    e.currentTarget.style.color = "var(--orca-color-text-3)";
                  },
                },
                createElement("i", { className: "ti ti-edit", style: { fontSize: 12 } })
              )
            ),
          onTogglePin &&
            withTooltip(
              isPinned ? "取消置顶" : "置顶",
              createElement(
                "button",
                {
                  style: { ...actionButtonStyle, opacity: isHovered ? 0.6 : 0 },
                  onClick: (e: any) => handleTogglePin(e, session.id),
                  onMouseOver: (e: any) => {
                    e.currentTarget.style.opacity = "1";
                    e.currentTarget.style.color = "var(--orca-color-primary)";
                  },
                  onMouseOut: (e: any) => {
                    e.currentTarget.style.opacity = "0.6";
                    e.currentTarget.style.color = "var(--orca-color-text-3)";
                  },
                },
                createElement("i", {
                  className: isPinned ? "ti ti-pinned-off" : "ti ti-pin",
                  style: { fontSize: 12 },
                })
              )
            ),
          onToggleFavorite &&
            withTooltip(
              session.favorited ? "取消收藏" : "收藏",
              createElement(
                "button",
                {
                  style: { ...actionButtonStyle, opacity: isHovered || session.favorited ? 0.6 : 0 },
                  onClick: (e: any) => handleToggleFavorite(e, session.id),
                  onMouseOver: (e: any) => {
                    e.currentTarget.style.opacity = "1";
                    e.currentTarget.style.color = session.favorited ? "var(--orca-color-warning)" : "var(--orca-color-primary)";
                  },
                  onMouseOut: (e: any) => {
                    e.currentTarget.style.opacity = session.favorited ? "0.6" : "0.6";
                    e.currentTarget.style.color = session.favorited ? "var(--orca-color-warning)" : "var(--orca-color-text-3)";
                  },
                },
                createElement("i", {
                  className: session.favorited ? "ti ti-star-filled" : "ti ti-star",
                  style: { fontSize: 12, color: session.favorited ? "var(--orca-color-warning)" : undefined },
                })
              )
            ),
          withTooltip(
            "删除",
            createElement(
              "button",
              {
                style: { ...actionButtonStyle, opacity: isHovered ? 0.6 : 0 },
                onClick: (e: any) => handleDelete(e, session.id),
                onMouseOver: (e: any) => {
                  e.currentTarget.style.opacity = "1";
                  e.currentTarget.style.color = "var(--orca-color-danger, #dc3545)";
                },
                onMouseOut: (e: any) => {
                  e.currentTarget.style.opacity = "0.6";
                  e.currentTarget.style.color = "var(--orca-color-text-3)";
                },
              },
              createElement("i", { className: "ti ti-trash", style: { fontSize: 12 } })
            )
          )
        )
    );
  }

  return createElement(
    "div",
    {
      ref: menuRef as any,
      style: { position: "relative", display: "inline-block" },
    },
    withTooltip(
      "历史对话",
      createElement(
        Button,
        {
          variant: "plain",
          onClick: () => setIsOpen(!isOpen),
        },
        createElement("i", { className: "ti ti-history" })
      )
    ),
    isOpen &&
      createElement(
        "div",
        { style: panelStyle },
        createElement(
          "div",
          { style: headerStyle },
          createElement(
            "div",
            { style: headerTitleStyle },
            createElement("i", { className: "ti ti-messages" }),
            "历史对话"
          ),
          createElement(
            "div",
            { style: { display: "flex", gap: 4 } },
            withTooltip(
              showFavoritesOnly ? "显示全部对话" : "只看收藏",
              createElement(
                "button",
                {
                  onClick: () => setShowFavoritesOnly(!showFavoritesOnly),
                  style: {
                    ...newButtonStyle,
                    background: showFavoritesOnly ? "var(--orca-color-warning)" : "var(--orca-color-bg-3)",
                    color: showFavoritesOnly ? "#000" : "var(--orca-color-text-2)",
                    fontWeight: showFavoritesOnly ? 600 : 400,
                  },
                  onMouseOver: (e: any) => (e.currentTarget.style.opacity = "0.85"),
                  onMouseOut: (e: any) => (e.currentTarget.style.opacity = "1"),
                },
                createElement("i", { 
                  className: showFavoritesOnly ? "ti ti-star-filled" : "ti ti-star", 
                  style: { fontSize: 12 } 
                })
              )
            ),
            withTooltip(
              "新建对话",
              createElement(
                "button",
                {
                  onClick: handleNewSession,
                  style: newButtonStyle,
                  onMouseOver: (e: any) => (e.currentTarget.style.opacity = "0.85"),
                  onMouseOut: (e: any) => (e.currentTarget.style.opacity = "1"),
                },
                createElement("i", { className: "ti ti-plus", style: { fontSize: 12 } }),
                "新建"
              )
            )
          )
        ),
        createElement(
          "div",
          { style: listStyle },
          totalFiltered === 0
            ? createElement("div", { style: emptyStyle }, showFavoritesOnly ? "暂无收藏对话" : "暂无历史对话")
            : createElement(
                Fragment,
                null,
                // ── 置顶 ────────────────────────────────────────────────
                pinnedSessions.length > 0 &&
                  createElement(
                    "div",
                    { style: { marginBottom: 8 } },
                    createElement(
                      "div",
                      {
                        style: {
                          fontSize: 11,
                          color: "var(--orca-color-text-3)",
                          padding: "4px 8px",
                          fontWeight: 500,
                        },
                      },
                      "📌 置顶"
                    ),
                    ...pinnedSessions.map((session) => renderSessionItem(session, true))
                  ),

                // ── 收藏（默认视图显示）─────────────────────────────────
                !showFavoritesOnly && favoritedSessions.length > 0 &&
                  createElement(
                    "div",
                    { style: { marginBottom: 8 } },
                    createElement(
                      "div",
                      {
                        style: {
                          fontSize: 11,
                          color: "var(--orca-color-warning)",
                          padding: "4px 8px",
                          fontWeight: 500,
                        },
                      },
                      "⭐ 收藏"
                    ),
                    ...favoritedSessions.map((session) => renderSessionItem(session, false))
                  ),

                // ── 时间分组（非收藏）───────────────────────────────────
                allTimeGroups.map((group) =>
                  createElement(
                    "div",
                    { key: group.label, style: { marginBottom: 8 } },
                    createElement(
                      "div",
                      {
                        style: {
                          fontSize: 11,
                          color: "var(--orca-color-text-3)",
                          padding: "4px 8px",
                          fontWeight: 500,
                        },
                      },
                      group.label
                    ),
                    ...group.sessions.map((session) => renderSessionItem(session, false))
                  )
                ),
              )
        ),
        nonFavoritedSessions.length > 0 &&
          createElement(
            "div",
            { style: footerStyle },
            createElement(
              "button",
              {
                onClick: handleClearAll,
                style: clearButtonStyle,
                onMouseOver: (e: any) => {
                  e.currentTarget.style.background = "var(--orca-color-danger, #dc3545)";
                  e.currentTarget.style.color = "var(--orca-color-text-inverse)";
                  e.currentTarget.style.borderColor = "var(--orca-color-danger, #dc3545)";
                },
                onMouseOut: (e: any) => {
                  e.currentTarget.style.background = "transparent";
                  e.currentTarget.style.color = "var(--orca-color-text-2)";
                  e.currentTarget.style.borderColor = "var(--orca-color-border)";
                },
              },
              `清空非收藏对话 (${nonFavoritedSessions.length})`
            )
          )
      )
  );
}
