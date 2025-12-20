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
  useState: <T>(
    initial: T | (() => T),
  ) => [T, (next: T | ((prev: T) => T)) => void];
  useCallback: <T extends (...args: any[]) => any>(fn: T, deps: any[]) => T;
};
const { createElement, useEffect, useMemo, useRef, useState, useCallback } = React;

const { Button, CompositionInput } = orca.components;

type PageItem = {
  id: DbId;
  title: string;
};

type TagItem = {
  tag: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  currentPageId: DbId | null;
  currentPageTitle: string;
  anchorRef?: { current: HTMLElement | null };
};

/**
 * Context Picker - @ 触发的悬浮选择菜单
 * 支持: Active Note, Pages 列表, Tags 列表, 搜索
 */
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
  const [activeSubmenu, setActiveSubmenu] = useState<"pages" | "tags" | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose; // Keep ref updated

  // 加载页面和标签列表
  useEffect(() => {
    if (!open) return;
    let mounted = true;

    setLoading(true);
    setActiveSubmenu(null);
    setSearchText("");

    async function load() {
      await Promise.all([
        loadPagesAsync(mounted, setPages),
        loadTagsAsync(mounted, setTags),
      ]);
      if (mounted) setLoading(false);
    }
    load();

    return () => {
      mounted = false;
    };
  }, [open]);

  // 点击外部关闭
  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      const menu = menuRef.current;
      if (menu && !menu.contains(e.target as Node)) {
        onCloseRef.current();
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]); // Removed onClose from deps to prevent re-registration

  // 键盘 Escape 关闭
  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCloseRef.current();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open]); // Removed onClose from deps to prevent re-registration

  async function loadPagesAsync(
    mounted: boolean,
    setter: (items: PageItem[]) => void,
  ) {
    try {
      // 使用 get-aliased-blocks 获取所有带别名的 blocks（包含页面信息）
      // 参数: keyword, pageNum, pageSize
      const result = await orca.invokeBackend("get-aliased-blocks", "", 0, 200);

      console.log("[ContextPicker] get-aliased-blocks result:", result);

      if (!mounted) return;

      const items: PageItem[] = [];
      let blocks: any[] = [];

      // 解析返回格式 - 可能是 [count, blocks[]] 或直接是 blocks[]
      if (Array.isArray(result)) {
        if (result.length === 2 && typeof result[0] === "number") {
          blocks = result[1] || [];
        } else {
          blocks = result;
        }
      }

      // 获取 tag block IDs 用于过滤
      const aliasResult = await orca.invokeBackend("get-aliases", "", 0, 200);
      const tagBlockIds = new Set<number>();
      if (Array.isArray(aliasResult) && aliasResult.length === 2 && typeof aliasResult[0] === "number") {
        for (const id of (aliasResult[1] || [])) {
          tagBlockIds.add(id);
        }
      }

      console.log("[ContextPicker] Tag block IDs to exclude:", tagBlockIds.size);

      // 从返回的 blocks 中筛选页面（排除 tag blocks）
      for (const b of blocks) {
        if (b && typeof b.id === "number") {
          // 跳过 tag blocks
          if (tagBlockIds.has(b.id)) continue;

          // 只要根块（无 parent）
          if (b.parent != null) continue;

          const title = safeText(b) || `Page ${b.id}`;
          items.push({ id: b.id as DbId, title });
        }
      }

      // 如果上面没有找到页面，回退到 state.blocks
      if (items.length === 0) {
        const stateBlocks = orca.state.blocks;
        for (const key of Object.keys(stateBlocks)) {
          const block = stateBlocks[key];
          if (!block) continue;

          const hasParent = block.parent != null;
          const isTagBlock = tagBlockIds.has(block.id as number);

          if (!hasParent && !isTagBlock) {
            const title = safeText(block) || `Page ${block.id}`;
            items.push({ id: block.id as DbId, title });
          }
        }
      }

      items.sort((a, b) => a.title.localeCompare(b.title));

      console.log("[ContextPicker] Pages loaded:", items.length);
      if (mounted) setter(items);
    } catch (err) {
      console.error("[ContextPicker] Failed to load pages:", err);
      if (mounted) setter([]);
    }
  }

  async function loadTagsAsync(
    mounted: boolean,
    setter: (items: TagItem[]) => void,
  ) {
    try {
      // get-aliases 返回 [count, blockIds[]] - 需要用 get-blocks 获取所有 tag blocks
      const result = await orca.invokeBackend("get-aliases", "", 0, 200);

      if (!mounted) return;

      let blockIds: number[] = [];

      // 解析返回格式：[count, blockIds[]]
      if (Array.isArray(result) && result.length === 2 && typeof result[0] === "number") {
        blockIds = result[1] || [];
      }

      console.log("[ContextPicker] Tag block IDs:", blockIds.length);

      if (blockIds.length === 0) {
        setter([]);
        return;
      }

      // 始终使用 get-blocks API 获取所有 tag blocks 的完整数据
      const blocksResult = await orca.invokeBackend("get-blocks", blockIds);
      console.log("[ContextPicker] get-blocks result:", blocksResult);

      const blocks = Array.isArray(blocksResult) ? blocksResult : [];

      // 收集所有别名
      const tagSet = new Set<string>();
      for (const block of blocks) {
        if (block && block.aliases && block.aliases.length > 0) {
          for (const alias of block.aliases) {
            if (typeof alias === "string" && alias.trim()) {
              tagSet.add(alias.trim());
            }
          }
        }
      }

      const validAliases = Array.from(tagSet);
      console.log("[ContextPicker] Tags loaded:", validAliases.length, validAliases);

      if (mounted) setter(validAliases.sort().map((tag) => ({ tag })));
    } catch (err) {
      console.error("[ContextPicker] Failed to load tags:", err);
      if (mounted) setter([]);
    }
  }

  // 过滤后的列表
  const filteredPages = useMemo(() => {
    if (!searchText.trim()) return pages;
    const q = searchText.toLowerCase();
    return pages.filter((p) => p.title.toLowerCase().includes(q));
  }, [pages, searchText]);

  const filteredTags = useMemo(() => {
    if (!searchText.trim()) return tags;
    const q = searchText.toLowerCase();
    return tags.filter((t) => t.tag.toLowerCase().includes(q));
  }, [tags, searchText]);

  // 选择处理
  const handleSelectActivePage = useCallback(() => {
    if (currentPageId != null) {
      addCurrentPage(currentPageId, currentPageTitle || "Active Note");
      orca.notify("success", "Added active page to context");
    }
    onClose();
  }, [currentPageId, currentPageTitle, onClose]);

  const handleSelectPage = useCallback((page: PageItem) => {
    addPageById(page.id);
    orca.notify("success", `Added "${page.title}" to context`);
    onClose();
  }, [onClose]);

  const handleSelectTag = useCallback((tag: TagItem) => {
    addTagContext(tag.tag);
    orca.notify("success", `Added #${tag.tag} to context`);
    onClose();
  }, [onClose]);

  if (!open) return null;

  const menuStyle: any = {
    position: "fixed",
    zIndex: 99999,
    background: "var(--orca-color-bg-1)",
    border: "1px solid var(--orca-color-border)",
    borderRadius: 8,
    boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
    minWidth: 240,
    maxWidth: 320,
    maxHeight: 400,
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
  };

  // 定位菜单
  if (anchorRef?.current) {
    const rect = anchorRef.current.getBoundingClientRect();
    const viewportPadding = 8;
    const menuMaxWidth = 320;
    const menuMaxHeight = 400;
    const gap = 4;

    let left = rect.left;
    // Removed default "top" calculation here

    left = Math.max(
      viewportPadding,
      Math.min(left, window.innerWidth - menuMaxWidth - viewportPadding),
    );

    menuStyle.left = left;

    // Smart positioning: Prefer "bottom" (show above) if space below is limited
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;
    
    // If space below is less than menu height AND space above is larger, show above
    // Assuming button is at bottom, spaceBelow is small
    const showAbove = spaceBelow < menuMaxHeight && spaceAbove > spaceBelow;

    if (showAbove) {
        // Position using 'bottom' property so it grows upwards from the button
        menuStyle.bottom = window.innerHeight - rect.top + gap;
        menuStyle.maxHeight = Math.min(menuMaxHeight, spaceAbove - viewportPadding);
        menuStyle.top = "auto";
        // Also ensure flex direction is column-reverse if we want items to grow up? 
        // No, standard list is fine, just the container box moves up.
    } else {
        // Standard drop-down
        menuStyle.top = rect.bottom + gap;
        menuStyle.maxHeight = Math.min(menuMaxHeight, spaceBelow - viewportPadding);
        menuStyle.bottom = "auto";
    }
  } else {
    menuStyle.top = 8;
    menuStyle.left = 8;
  }

  const itemStyle: any = {
    padding: "8px 12px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    gap: 8,
    borderBottom: "1px solid var(--orca-color-border)",
  };

  const itemHoverStyle = {
    background: "var(--orca-color-bg-hover)",
  };

  return createElement(
    "div",
    {
      ref: menuRef as any,
      style: menuStyle,
    },
    // Active Note 快捷选项
    currentPageId != null &&
      createElement(
        "div",
        {
          style: { ...itemStyle, fontWeight: 500 },
          onClick: handleSelectActivePage,
          onMouseEnter: (e: any) => Object.assign(e.currentTarget.style, itemHoverStyle),
          onMouseLeave: (e: any) => (e.currentTarget.style.background = ""),
        },
        createElement("i", { className: "ti ti-star", style: { color: "var(--orca-color-primary-5)" } }),
        createElement("span", null, "Active Note"),
        createElement(
          "span",
          { style: { opacity: 0.6, fontSize: 12, marginLeft: "auto", maxWidth: 100, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" } },
          currentPageTitle || "Current page"
        )
      ),

    // Pages 子菜单入口
    createElement(
      "div",
      {
        style: itemStyle,
        onClick: () => setActiveSubmenu(activeSubmenu === "pages" ? null : "pages"),
        onMouseEnter: (e: any) => Object.assign(e.currentTarget.style, itemHoverStyle),
        onMouseLeave: (e: any) => (e.currentTarget.style.background = ""),
      },
      createElement("i", { className: "ti ti-file-text" }),
      createElement("span", { style: { flex: 1 } }, "Pages"),
      createElement("i", { className: activeSubmenu === "pages" ? "ti ti-chevron-down" : "ti ti-chevron-right", style: { opacity: 0.5 } })
    ),

    // Pages 列表（展开时）
    activeSubmenu === "pages" &&
      createElement(
        "div",
        { style: { maxHeight: 200, overflow: "auto", borderBottom: "1px solid var(--orca-color-border)" } },
        loading
          ? createElement("div", { style: { padding: 12, opacity: 0.6 } }, "Loading...")
          : filteredPages.length === 0
            ? createElement("div", { style: { padding: 12, opacity: 0.6 } }, "No pages found")
            : filteredPages.slice(0, 50).map((page) =>
                createElement(
                  "div",
                  {
                    key: `page-${page.id}`,
                    style: { padding: "6px 12px 6px 28px", cursor: "pointer", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
                    onClick: () => handleSelectPage(page),
                    onMouseEnter: (e: any) => Object.assign(e.currentTarget.style, itemHoverStyle),
                    onMouseLeave: (e: any) => (e.currentTarget.style.background = ""),
                  },
                  page.title
                )
              )
      ),

    // Tags 子菜单入口
    createElement(
      "div",
      {
        style: itemStyle,
        onClick: () => setActiveSubmenu(activeSubmenu === "tags" ? null : "tags"),
        onMouseEnter: (e: any) => Object.assign(e.currentTarget.style, itemHoverStyle),
        onMouseLeave: (e: any) => (e.currentTarget.style.background = ""),
      },
      createElement("i", { className: "ti ti-tag" }),
      createElement("span", { style: { flex: 1 } }, "Tags"),
      createElement("i", { className: activeSubmenu === "tags" ? "ti ti-chevron-down" : "ti ti-chevron-right", style: { opacity: 0.5 } })
    ),

    // Tags 列表（展开时）
    activeSubmenu === "tags" &&
      createElement(
        "div",
        { style: { maxHeight: 200, overflow: "auto", borderBottom: "1px solid var(--orca-color-border)" } },
        loading
          ? createElement("div", { style: { padding: 12, opacity: 0.6 } }, "Loading...")
          : filteredTags.length === 0
            ? createElement("div", { style: { padding: 12, opacity: 0.6 } }, "No tags found")
            : filteredTags.slice(0, 50).map((tag) =>
                createElement(
                  "div",
                  {
                    key: `tag-${tag.tag}`,
                    style: { padding: "6px 12px 6px 28px", cursor: "pointer" },
                    onClick: () => handleSelectTag(tag),
                    onMouseEnter: (e: any) => Object.assign(e.currentTarget.style, itemHoverStyle),
                    onMouseLeave: (e: any) => (e.currentTarget.style.background = ""),
                  },
                  `#${tag.tag}`
                )
              )
      ),

    // 搜索框
    createElement(
      "div",
      { style: { padding: 8, borderTop: "1px solid var(--orca-color-border)" } },
      createElement(CompositionInput as any, {
        value: searchText,
        onChange: (e: any) => setSearchText(e.target.value),
        placeholder: "Search pages or tags...",
        style: { width: "100%", fontSize: 13 },
      })
    )
  );
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
