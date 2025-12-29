/**
 * ContextPicker - @ 触发的上下文选择菜单
 * 
 * 参考目录面板设计：
 * - 磨砂玻璃效果背景
 * - 搜索框在顶部
 * - 分类展示：Active Note、Pages、Tags
 * - 键盘导航支持
 */

import type { DbId } from "../orca.d.ts";
import {
  addCurrentPage,
  addPageById,
  addTagContext,
} from "../store/context-store";

const React = window.React as unknown as {
  createElement: typeof window.React.createElement;
  useEffect: (fn: () => void | (() => void), deps: any[]) => void;
  useMemo: <T>(fn: () => T, deps: any[]) => T;
  useRef: <T>(value: T) => { current: T };
  useState: <T>(initial: T | (() => T)) => [T, (next: T | ((prev: T) => T)) => void];
  useCallback: <T extends (...args: any[]) => any>(fn: T, deps: any[]) => T;
  Fragment: typeof window.React.Fragment;
};
const { createElement, useEffect, useMemo, useRef, useState, useCallback, Fragment } = React;

const { CompositionInput } = orca.components;

type PageItem = { id: DbId; title: string };
type TagItem = { tag: string };

type Props = {
  open: boolean;
  onClose: () => void;
  currentPageId: DbId | null;
  currentPageTitle: string;
  anchorRef?: { current: HTMLElement | null };
};

// ─────────────────────────────────────────────────────────────────────────────
// 样式定义
// ─────────────────────────────────────────────────────────────────────────────

const panelStyle: React.CSSProperties = {
  position: "fixed",
  zIndex: 99999,
  width: 320,
  maxHeight: 420,
  background: "var(--orca-color-bg-1)",
  backdropFilter: "blur(12px)",
  border: "1px solid var(--orca-color-border)",
  borderRadius: 12,
  boxShadow: "0 8px 32px rgba(0, 0, 0, 0.18)",
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
};

const searchContainerStyle: React.CSSProperties = {
  padding: "12px",
  borderBottom: "1px solid var(--orca-color-border)",
};

const searchInputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  fontSize: 14,
  border: "1px solid var(--orca-color-border)",
  borderRadius: 8,
  background: "var(--orca-color-bg-2)",
  color: "var(--orca-color-text-1)",
  outline: "none",
  transition: "border-color 0.15s, box-shadow 0.15s",
};

const listContainerStyle: React.CSSProperties = {
  flex: 1,
  overflowY: "auto",
  padding: "8px",
};

const sectionTitleStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: "var(--orca-color-text-3)",
  padding: "8px 8px 4px",
  textTransform: "uppercase",
  letterSpacing: "0.5px",
};

const itemStyle = (isActive: boolean, isHighlighted: boolean): React.CSSProperties => ({
  padding: "10px 12px",
  marginBottom: 2,
  borderRadius: 8,
  cursor: "pointer",
  background: isHighlighted ? "var(--orca-color-bg-3)" : isActive ? "var(--orca-color-bg-2)" : "transparent",
  display: "flex",
  alignItems: "center",
  gap: 10,
  transition: "background 0.1s ease",
});

const itemIconStyle = (color?: string): React.CSSProperties => ({
  width: 28,
  height: 28,
  borderRadius: 6,
  background: color || "var(--orca-color-bg-3)",
  color: color ? "#fff" : "var(--orca-color-text-2)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  fontSize: 13,
  flexShrink: 0,
});

const itemTextStyle: React.CSSProperties = {
  flex: 1,
  fontSize: 13,
  color: "var(--orca-color-text-1)",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
};

const itemMetaStyle: React.CSSProperties = {
  fontSize: 11,
  color: "var(--orca-color-text-3)",
};

const emptyStyle: React.CSSProperties = {
  padding: "24px 16px",
  textAlign: "center",
  color: "var(--orca-color-text-3)",
  fontSize: 13,
};

const loadingStyle: React.CSSProperties = {
  padding: "24px 16px",
  textAlign: "center",
  color: "var(--orca-color-text-3)",
  fontSize: 13,
};

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function ContextPicker({
  open,
  onClose,
  currentPageId,
  currentPageTitle,
  anchorRef,
}: Props) {
  const [searchText, setSearchText] = useState("");
  const [pages, setPages] = useState<PageItem[]>([]);
  const [tags, setTags] = useState<TagItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(0);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  // 加载数据
  useEffect(() => {
    if (!open) return;
    let mounted = true;

    setLoading(true);
    setSearchText("");
    setHighlightIndex(0);

    async function load() {
      await Promise.all([
        loadPagesAsync(mounted, setPages),
        loadTagsAsync(mounted, setTags),
      ]);
      if (mounted) setLoading(false);
    }
    load();

    // 聚焦搜索框
    setTimeout(() => searchInputRef.current?.focus(), 50);

    return () => { mounted = false; };
  }, [open]);

  // 点击外部关闭
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onCloseRef.current();
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // 构建扁平化的选项列表用于键盘导航
  const allItems = useMemo(() => {
    const items: Array<{ type: "active" | "page" | "tag"; data: any }> = [];
    const q = searchText.toLowerCase().trim();

    // Active Note
    if (currentPageId != null) {
      if (!q || currentPageTitle.toLowerCase().includes(q) || "active".includes(q)) {
        items.push({ type: "active", data: { id: currentPageId, title: currentPageTitle } });
      }
    }

    // Pages - 搜索时显示更多，无搜索时显示全部
    const filteredPages = q ? pages.filter(p => p.title.toLowerCase().includes(q)) : pages;
    for (const page of filteredPages.slice(0, 100)) {
      items.push({ type: "page", data: page });
    }

    // Tags - 搜索时显示更多，无搜索时显示全部
    const filteredTags = q ? tags.filter(t => t.tag.toLowerCase().includes(q)) : tags;
    for (const tag of filteredTags.slice(0, 100)) {
      items.push({ type: "tag", data: tag });
    }

    return items;
  }, [searchText, pages, tags, currentPageId, currentPageTitle]);

  // 键盘导航
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === "Escape") {
      onCloseRef.current();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlightIndex(i => Math.min(i + 1, allItems.length - 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlightIndex(i => Math.max(i - 1, 0));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const item = allItems[highlightIndex];
      if (item) handleSelectItem(item);
      return;
    }
  }, [allItems, highlightIndex]);

  // 选择处理
  const handleSelectItem = useCallback((item: { type: string; data: any }) => {
    if (item.type === "active") {
      addCurrentPage(item.data.id, item.data.title || "Active Note");
      orca.notify("success", "已添加当前页面");
    } else if (item.type === "page") {
      addPageById(item.data.id);
      orca.notify("success", `已添加 "${item.data.title}"`);
    } else if (item.type === "tag") {
      addTagContext(item.data.tag);
      orca.notify("success", `已添加 #${item.data.tag}`);
    }
    onCloseRef.current();
  }, []);

  if (!open) return null;

  // 计算位置
  const positionStyle: React.CSSProperties = {};
  if (anchorRef?.current) {
    const rect = anchorRef.current.getBoundingClientRect();
    const viewportPadding = 8;
    const menuWidth = 320;
    const menuMaxHeight = 420;
    const gap = 8;

    let left = rect.left;
    left = Math.max(viewportPadding, Math.min(left, window.innerWidth - menuWidth - viewportPadding));
    positionStyle.left = left;

    const spaceAbove = rect.top;
    const spaceBelow = window.innerHeight - rect.bottom;

    if (spaceAbove > spaceBelow && spaceAbove > menuMaxHeight * 0.5) {
      positionStyle.bottom = window.innerHeight - rect.top + gap;
      positionStyle.maxHeight = Math.min(menuMaxHeight, spaceAbove - viewportPadding);
    } else {
      positionStyle.top = rect.bottom + gap;
      positionStyle.maxHeight = Math.min(menuMaxHeight, spaceBelow - viewportPadding);
    }
  } else {
    positionStyle.top = 100;
    positionStyle.left = 100;
  }

  // 分组渲染
  const hasActiveNote = currentPageId != null && allItems.some(i => i.type === "active");
  const pageItems = allItems.filter(i => i.type === "page");
  const tagItems = allItems.filter(i => i.type === "tag");

  let itemIndex = 0;

  return createElement(
    "div",
    {
      ref: menuRef as any,
      style: { ...panelStyle, ...positionStyle },
      onKeyDown: handleKeyDown,
    },
    // 搜索框
    createElement(
      "div",
      { style: searchContainerStyle },
      createElement(CompositionInput as any, {
        ref: searchInputRef as any,
        value: searchText,
        onChange: (e: any) => {
          setSearchText(e.target.value);
          setHighlightIndex(0);
        },
        placeholder: "搜索页面或标签...",
        style: searchInputStyle,
      })
    ),
    // 列表
    createElement(
      "div",
      { style: listContainerStyle },
      loading
        ? createElement("div", { style: loadingStyle }, 
            createElement("i", { className: "ti ti-loader", style: { animation: "spin 1s linear infinite", marginRight: 8 } }),
            "加载中..."
          )
        : allItems.length === 0
          ? createElement("div", { style: emptyStyle }, "未找到匹配项")
          : createElement(
              Fragment,
              null,
              // Active Note
              hasActiveNote && createElement(
                Fragment,
                null,
                createElement("div", { style: sectionTitleStyle }, "当前页面"),
                ...allItems.filter(i => i.type === "active").map(item => {
                  const idx = itemIndex++;
                  return renderItem(item, idx === highlightIndex, idx);
                })
              ),
              // Pages
              pageItems.length > 0 && createElement(
                Fragment,
                null,
                createElement("div", { style: sectionTitleStyle }, `页面 (${pageItems.length})`),
                ...pageItems.map(item => {
                  const idx = itemIndex++;
                  return renderItem(item, idx === highlightIndex, idx);
                })
              ),
              // Tags
              tagItems.length > 0 && createElement(
                Fragment,
                null,
                createElement("div", { style: sectionTitleStyle }, `标签 (${tagItems.length})`),
                ...tagItems.map(item => {
                  const idx = itemIndex++;
                  return renderItem(item, idx === highlightIndex, idx);
                })
              )
            )
    )
  );

  function renderItem(item: { type: string; data: any }, isHighlighted: boolean, index: number) {
    const iconColor = item.type === "active" 
      ? "var(--orca-color-primary, #007bff)" 
      : item.type === "tag" 
        ? "var(--orca-color-success, #28a745)" 
        : undefined;

    const icon = item.type === "active" 
      ? "ti ti-star-filled" 
      : item.type === "tag" 
        ? "ti ti-hash" 
        : "ti ti-file-text";

    const text = item.type === "tag" ? item.data.tag : item.data.title;

    return createElement(
      "div",
      {
        key: `${item.type}-${item.type === "tag" ? item.data.tag : item.data.id}`,
        style: itemStyle(false, isHighlighted),
        onClick: () => handleSelectItem(item),
        onMouseEnter: () => setHighlightIndex(index),
      },
      createElement(
        "div",
        { style: itemIconStyle(iconColor) },
        createElement("i", { className: icon })
      ),
      createElement("span", { style: itemTextStyle }, text),
      item.type === "active" && createElement("span", { style: itemMetaStyle }, "当前")
    );
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 数据加载函数
// ─────────────────────────────────────────────────────────────────────────────

async function loadPagesAsync(mounted: boolean, setter: (items: PageItem[]) => void) {
  try {
    // 增加 pageSize 到 1000 以获取更多页面
    const result = await orca.invokeBackend("get-aliased-blocks", "", 0, 1000);
    if (!mounted) return;

    const items: PageItem[] = [];
    let blocks: any[] = [];

    if (Array.isArray(result)) {
      if (result.length === 2 && typeof result[0] === "number") {
        blocks = result[1] || [];
      } else {
        blocks = result;
      }
    }

    const aliasResult = await orca.invokeBackend("get-aliases", "", 0, 1000);
    const tagBlockIds = new Set<number>();
    if (Array.isArray(aliasResult) && aliasResult.length === 2 && typeof aliasResult[0] === "number") {
      for (const id of aliasResult[1] || []) {
        tagBlockIds.add(id);
      }
    }

    for (const b of blocks) {
      if (b && typeof b.id === "number") {
        if (tagBlockIds.has(b.id)) continue;
        if (b.parent != null) continue;
        const title = safeText(b) || `Page ${b.id}`;
        items.push({ id: b.id as DbId, title });
      }
    }

    if (items.length === 0) {
      const stateBlocks = orca.state.blocks;
      for (const key of Object.keys(stateBlocks)) {
        const block = stateBlocks[key];
        if (!block) continue;
        if (block.parent != null) continue;
        if (tagBlockIds.has(block.id as number)) continue;
        const title = safeText(block) || `Page ${block.id}`;
        items.push({ id: block.id as DbId, title });
      }
    }

    items.sort((a, b) => a.title.localeCompare(b.title));
    if (mounted) setter(items);
  } catch (err) {
    console.error("[ContextPicker] Failed to load pages:", err);
    if (mounted) setter([]);
  }
}

async function loadTagsAsync(mounted: boolean, setter: (items: TagItem[]) => void) {
  try {
    // 增加 pageSize 到 1000 以获取更多标签
    const result = await orca.invokeBackend("get-aliases", "", 0, 1000);
    if (!mounted) return;

    let blockIds: number[] = [];
    if (Array.isArray(result) && result.length === 2 && typeof result[0] === "number") {
      blockIds = result[1] || [];
    }

    if (blockIds.length === 0) {
      setter([]);
      return;
    }

    const blocksResult = await orca.invokeBackend("get-blocks", blockIds);
    const blocks = Array.isArray(blocksResult) ? blocksResult : [];

    const tagSet = new Set<string>();
    for (const block of blocks) {
      if (block?.aliases?.length > 0) {
        for (const alias of block.aliases) {
          if (typeof alias === "string" && alias.trim()) {
            tagSet.add(alias.trim());
          }
        }
      }
    }

    if (mounted) setter(Array.from(tagSet).sort().map(tag => ({ tag })));
  } catch (err) {
    console.error("[ContextPicker] Failed to load tags:", err);
    if (mounted) setter([]);
  }
}

function safeText(block: any): string {
  if (!block) return "";
  if (typeof block.text === "string" && block.text.trim()) return block.text.trim();
  if (Array.isArray(block.content)) {
    return block.content
      .map((f: any) => (f?.t === "text" && typeof f.v === "string" ? f.v : ""))
      .join("")
      .trim();
  }
  return "";
}
