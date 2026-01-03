import { parseMarkdown, type MarkdownInlineNode, type MarkdownNode, type TableAlignment, type CheckboxItem, type TimelineItem, type CompareItem, type GalleryImage } from "../utils/markdown-renderer";
import LocalGraph from "./LocalGraph";
import MindMapRenderer from "./MindMapRenderer";
import {
  codeBlockContainerStyle,
  codeBlockHeaderStyle,
  codeBlockPreStyle,
  inlineCodeStyle,
  markdownContainerStyle,
  blockQuoteStyle,
  headingStyle,
  linkStyle,
  blockLinkContainerStyle,
  blockLinkTextStyle,
  blockLinkArrowStyle,
  boldStyle,
  paragraphStyle,
  imageStyle,
  imageContainerStyle,
} from "../styles/ai-chat-styles";

const React = window.React as any;
const { createElement, useMemo, useState } = React;

// 图片路径处理工具函数
function resolveImageSrc(src: string): string {
  if (src.startsWith("./") || src.startsWith("../")) {
    const relativePath = src.replace(/^\.\//, "").replace(/^\.\.\//, "");
    const repoDir = orca.state.repoDir;
    if (repoDir) {
      return `file:///${repoDir.replace(/\\/g, "/")}/assets/${relativePath}`;
    }
  } else if (src.startsWith("assets/")) {
    const repoDir = orca.state.repoDir;
    if (repoDir) {
      return `file:///${repoDir.replace(/\\/g, "/")}/${src}`;
    }
  } else if (!src.startsWith("http") && !src.startsWith("file://") && !src.startsWith("data:")) {
    const repoDir = orca.state.repoDir;
    if (repoDir) {
      return `file:///${repoDir.replace(/\\/g, "/")}/assets/${src}`;
    }
  }
  return src;
}

function resolveImageFilePath(src: string): string {
  if (src.startsWith("./") || src.startsWith("../")) {
    const relativePath = src.replace(/^\.\//, "").replace(/^\.\.\//, "");
    const repoDir = orca.state.repoDir;
    if (repoDir) {
      return `${repoDir}\\assets\\${relativePath}`;
    }
  } else if (src.startsWith("assets/")) {
    const repoDir = orca.state.repoDir;
    if (repoDir) {
      return `${repoDir}\\${src.replace(/\//g, "\\")}`;
    }
  } else if (!src.startsWith("http") && !src.startsWith("file://") && !src.startsWith("data:")) {
    const repoDir = orca.state.repoDir;
    if (repoDir) {
      return `${repoDir}\\assets\\${src}`;
    }
  }
  return src;
}

interface Props {
  content: string;
  role: "user" | "assistant" | "tool";
}

// Helper component for Code Block with Copy
function CodeBlock({ language, content }: { language?: string; content: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy:", err);
    }
  };

  return createElement(
    "div",
    {
      style: codeBlockContainerStyle,
    },
    // Header
    createElement(
      "div",
      {
        style: codeBlockHeaderStyle,
      },
      createElement(
        "span",
        { style: { fontFamily: "monospace", fontWeight: 600 } },
        language || "text",
      ),
      createElement(
        "div",
        {
          style: { cursor: "pointer", display: "flex", alignItems: "center", gap: "4px" },
          onClick: handleCopy,
        },
        createElement("i", { className: copied ? "ti ti-check" : "ti ti-copy" }),
        copied ? "Copied!" : "Copy",
      ),
    ),
    // Code content
    createElement(
      "pre",
      {
        style: codeBlockPreStyle,
      },
      content,
    ),
  );
}

// 全局缓存：存储大型日记导出数据
const journalExportCache = new Map<string, { rangeLabel: string; entries: any[] }>();

// Helper component for Journal Export Button
function JournalExportBlock({ content }: { content: string }) {
  const [exporting, setExporting] = useState(false);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null as { rangeLabel: string; entries: any[] } | null);

  // 解析缓存 ID 中的日期信息
  // 格式：cache:year-2025-timestamp 或 cache:month-2025-01-timestamp
  const parseCacheId = (cacheId: string) => {
    const yearMatch = cacheId.match(/^year-(\d{4})-/);
    if (yearMatch) {
      return { type: "year" as const, value: yearMatch[1] };
    }
    const monthMatch = cacheId.match(/^month-(\d{4}-\d{2})-/);
    if (monthMatch) {
      return { type: "month" as const, value: monthMatch[1] };
    }
    return null;
  };

  // 初始化时尝试获取数据
  React.useEffect(() => {
    const trimmed = content.trim();
    
    // 检查是否是缓存 ID
    if (trimmed.startsWith("cache:")) {
      const cacheId = trimmed.substring(6);
      const cached = journalExportCache.get(cacheId);
      if (cached) {
        console.log("[JournalExportBlock] Found cached data:", cacheId);
        setData(cached);
        return;
      }
      
      // 缓存丢失，尝试重新获取
      console.log("[JournalExportBlock] Cache miss, re-fetching:", cacheId);
      const parsed = parseCacheId(cacheId);
      if (parsed) {
        setLoading(true);
        (async () => {
          try {
            const { getJournalsByDateRange } = await import("../services/search-service");
            const results = await getJournalsByDateRange(
              parsed.type,
              parsed.value,
              undefined,
              true,
              parsed.type === "year" ? 366 : 31
            );
            
            const exportData = results
              .map((r: any) => ({
                date: r.title || "",
                content: (r.fullContent || r.content || "").trim(),
                blockId: r.id,
              }))
              .filter((entry: any) => entry.content.length > 0);
            
            const rangeLabel = parsed.type === "year" 
              ? `${parsed.value}年`
              : (() => {
                  const m = parsed.value.match(/^(\d{4})-(\d{2})$/);
                  return m ? `${m[1]}年${parseInt(m[2])}月` : parsed.value;
                })();
            
            const newData = { rangeLabel, entries: exportData };
            journalExportCache.set(cacheId, newData);
            setData(newData);
          } catch (err) {
            console.error("[JournalExportBlock] Failed to re-fetch:", err);
          } finally {
            setLoading(false);
          }
        })();
      }
      return;
    }
    
    // 尝试解析 JSON
    try {
      setData(JSON.parse(trimmed));
    } catch (err) {
      console.error("[JournalExportBlock] JSON parse error:", err);
    }
  }, [content]);

  const handleExport = async () => {
    if (!data) return;
    try {
      setExporting(true);
      const { exportJournalsAsFile } = await import("../services/export-service");
      exportJournalsAsFile(data.entries, data.rangeLabel);
    } catch (err) {
      console.error("Failed to export journals:", err);
      orca.notify("error", "导出失败: " + (err as Error).message);
    } finally {
      setExporting(false);
    }
  };

  const entryCount = data?.entries?.length || 0;
  const rangeLabel = data?.rangeLabel || "";

  return createElement(
    "div",
    {
      style: {
        display: "flex",
        flexDirection: "column",
        gap: "12px",
        padding: "16px",
        background: "var(--orca-color-bg-2)",
        borderRadius: "8px",
        border: "1px solid var(--orca-color-border)",
        marginTop: "8px",
      },
    },
    createElement(
      "div",
      {
        style: {
          display: "flex",
          alignItems: "center",
          gap: "8px",
          color: "var(--orca-color-text-2)",
        },
      },
      createElement("i", { className: loading ? "ti ti-loader" : "ti ti-file-export", style: { fontSize: "20px" } }),
      createElement("span", null, loading ? "加载中..." : `${rangeLabel} - 共 ${entryCount} 篇日记`)
    ),
    createElement(
      "button",
      {
        onClick: handleExport,
        disabled: exporting || loading || entryCount === 0,
        style: {
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "8px",
          padding: "10px 20px",
          background: exporting || loading || entryCount === 0 ? "var(--orca-color-bg-3)" : "#2563eb",
          color: exporting || loading || entryCount === 0 ? "var(--orca-color-text-3)" : "#ffffff",
          border: "none",
          borderRadius: "6px",
          cursor: exporting || loading || entryCount === 0 ? "not-allowed" : "pointer",
          fontSize: "14px",
          fontWeight: 500,
          transition: "all 0.2s",
        },
      },
      createElement("i", { className: exporting ? "ti ti-loader" : "ti ti-download" }),
      exporting ? "导出中..." : loading ? "加载中..." : entryCount === 0 ? "无数据可导出" : "导出为 Markdown 文件"
    ),
    createElement(
      "div",
      {
        style: {
          fontSize: "12px",
          color: "var(--orca-color-text-3)",
        },
      },
      "💡 导出后可使用 ChatGPT、Claude 等 AI 工具进行分析"
    )
  );
}

// Table view types
type TableViewMode = "table" | "card" | "list";

// Helper component for Table with multiple view modes
function TableBlock({ 
  headers, 
  alignments, 
  rows,
  renderInline 
}: { 
  headers: MarkdownInlineNode[][]; 
  alignments: TableAlignment[];
  rows: MarkdownInlineNode[][][];
  renderInline: (node: MarkdownInlineNode, key: number) => any;
}) {
  const [copied, setCopied] = useState(false);
  const [viewMode, setViewMode] = useState("table" as TableViewMode);

  const getTextFromNodes = (nodes: MarkdownInlineNode[]): string => {
    return nodes.map(n => {
      if (n.type === "text") return n.content;
      if (n.type === "code") return `\`${n.content}\``;
      if (n.type === "bold") return `**${getTextFromNodes(n.children)}**`;
      if (n.type === "italic") return `*${getTextFromNodes(n.children)}*`;
      if (n.type === "link") return getTextFromNodes(n.children);
      return "";
    }).join("");
  };

  // Markdown table format
  const getMarkdownTable = (): string => {
    const headerRow = "| " + headers.map(h => getTextFromNodes(h)).join(" | ") + " |";
    const separatorRow = "| " + alignments.map(a => {
      if (a === "center") return ":---:";
      if (a === "right") return "---:";
      return "---";
    }).join(" | ") + " |";
    const dataRows = rows.map(row => 
      "| " + row.map(cell => getTextFromNodes(cell)).join(" | ") + " |"
    ).join("\n");
    return headerRow + "\n" + separatorRow + "\n" + dataRows;
  };

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(getMarkdownTable());
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy table:", err);
    }
  };

  const getAlignClass = (align: TableAlignment): string => {
    if (align === "center") return "align-center";
    if (align === "right") return "align-right";
    return "align-left";
  };

  // Render table view
  const renderTableView = () => createElement(
    "table",
    { className: "md-table" },
    createElement(
      "thead",
      null,
      createElement(
        "tr",
        null,
        ...headers.map((headerCells, colIndex) =>
          createElement(
            "th",
            { key: colIndex, className: getAlignClass(alignments[colIndex]) },
            ...headerCells.map((child, i) => renderInline(child, i))
          )
        )
      )
    ),
    createElement(
      "tbody",
      null,
      ...rows.map((row, rowIndex) =>
        createElement(
          "tr",
          { key: rowIndex },
          ...row.map((cellNodes, colIndex) =>
            createElement(
              "td",
              { key: colIndex, className: getAlignClass(alignments[colIndex]) },
              ...cellNodes.map((child, i) => renderInline(child, i))
            )
          )
        )
      )
    )
  );

  // Render card view
  const renderCardView = () => createElement(
    "div",
    { className: "md-table-cards" },
    ...rows.map((row, rowIndex) =>
      createElement(
        "div",
        { key: rowIndex, className: "md-table-card" },
        ...row.map((cellNodes, colIndex) =>
          createElement(
            "div",
            { key: colIndex, className: "md-table-card-field" },
            createElement(
              "span",
              { className: "md-table-card-label" },
              ...headers[colIndex].map((child, i) => renderInline(child, i))
            ),
            createElement(
              "span",
              { className: "md-table-card-value" },
              ...cellNodes.map((child, i) => renderInline(child, i))
            )
          )
        )
      )
    )
  );

  // Render list view
  const renderListView = () => createElement(
    "div",
    { className: "md-table-list" },
    ...rows.map((row, rowIndex) =>
      createElement(
        "div",
        { key: rowIndex, className: "md-table-list-item" },
        ...row.map((cellNodes, colIndex) =>
          createElement(
            "span",
            { key: colIndex, className: "md-table-list-cell" },
            colIndex > 0 && createElement("span", { className: "md-table-list-sep" }, "·"),
            ...cellNodes.map((child, i) => renderInline(child, i))
          )
        )
      )
    )
  );

  return createElement(
    "div",
    { className: "md-table-container" },
    // Header with view switcher and copy button
    createElement(
      "div",
      { className: "md-table-header" },
      // View mode switcher
      createElement(
        "div",
        { className: "md-table-view-switcher" },
        createElement(
          "div",
          { 
            className: `md-table-view-btn ${viewMode === "table" ? "active" : ""}`,
            onClick: () => setViewMode("table"),
            title: "表格视图"
          },
          createElement("i", { className: "ti ti-table" })
        ),
        createElement(
          "div",
          { 
            className: `md-table-view-btn ${viewMode === "card" ? "active" : ""}`,
            onClick: () => setViewMode("card"),
            title: "卡片视图"
          },
          createElement("i", { className: "ti ti-layout-grid" })
        ),
        createElement(
          "div",
          { 
            className: `md-table-view-btn ${viewMode === "list" ? "active" : ""}`,
            onClick: () => setViewMode("list"),
            title: "列表视图"
          },
          createElement("i", { className: "ti ti-list" })
        )
      ),
      // Copy button
      createElement(
        "div",
        { 
          className: `md-table-copy-btn ${copied ? "copied" : ""}`,
          onClick: handleCopy,
          title: "复制为 Markdown 表格"
        },
        createElement("i", { className: copied ? "ti ti-check" : "ti ti-copy" }),
        copied ? "Copied!" : "Copy"
      )
    ),
    // Content based on view mode
    viewMode === "table" ? renderTableView() :
    viewMode === "card" ? renderCardView() :
    renderListView()
  );
}

// Helper component for Checklist (- [ ] / - [x])
// 支持智能识别标题项、子项和普通项
function ChecklistBlock({
  items,
  renderInline,
}: {
  items: CheckboxItem[];
  renderInline: (node: MarkdownInlineNode, key: number) => any;
}) {
  // 分组：将连续的子项归属到前一个标题项下
  const groups: { header?: CheckboxItem; items: CheckboxItem[] }[] = [];
  let currentGroup: { header?: CheckboxItem; items: CheckboxItem[] } = { items: [] };

  for (const item of items) {
    if (item.isHeader) {
      // 保存当前组（如果有内容）
      if (currentGroup.header || currentGroup.items.length > 0) {
        groups.push(currentGroup);
      }
      // 开始新组
      currentGroup = { header: item, items: [] };
    } else {
      currentGroup.items.push(item);
    }
  }
  // 保存最后一组
  if (currentGroup.header || currentGroup.items.length > 0) {
    groups.push(currentGroup);
  }

  // 如果没有任何标题项，使用简单渲染
  const hasHeaders = groups.some((g) => g.header);

  if (!hasHeaders) {
    // 简单模式：所有项平铺
    return createElement(
      "div",
      { className: "md-checklist md-checklist-simple" },
      items.map((item, index) =>
        createElement(
          "div",
          {
            key: index,
            className: `md-checklist-item ${item.checked ? "checked" : ""} ${item.isSubItem ? "md-checklist-subitem" : ""}`,
          },
          createElement(
            "span",
            { className: `md-checkbox ${item.checked ? "checked" : ""}` },
            item.checked && createElement("i", { className: "ti ti-check" })
          ),
          createElement(
            "span",
            { className: "md-checklist-text" },
            item.children.map((child, i) => renderInline(child, i))
          )
        )
      )
    );
  }

  // 分组模式：标题 + 子项，按顺序渲染每个组
  // 计算标题序号（只计算有 header 的组）
  let headerIndex = 0;
  const groupElements = groups.map((group, groupIndex) => {
    const children: any[] = [];

    // 标题项
    if (group.header) {
      headerIndex++;
      children.push(
        createElement(
          "div",
          {
            key: `header-${groupIndex}`,
            className: `md-checklist-header ${group.header.checked ? "checked" : ""}`,
          },
          // 序号标识
          createElement(
            "span",
            { className: "md-checklist-header-index" },
            `${headerIndex}.`
          ),
          createElement(
            "span",
            {
              className: `md-checkbox md-checkbox-header ${group.header.checked ? "checked" : ""}`,
            },
            group.header.checked && createElement("i", { className: "ti ti-check" })
          ),
          createElement(
            "span",
            { className: "md-checklist-header-text" },
            group.header.children.map((child, i) => renderInline(child, i))
          )
        )
      );
    }

    // 子项列表
    if (group.items.length > 0) {
      children.push(
        createElement(
          "div",
          { key: `items-${groupIndex}`, className: "md-checklist-subitems" },
          group.items.map((item, itemIndex) =>
            createElement(
              "div",
              {
                key: itemIndex,
                className: `md-checklist-item ${item.checked ? "checked" : ""} ${item.isSubItem ? "md-checklist-subitem" : ""}`,
              },
              createElement(
                "span",
                { className: `md-checkbox ${item.checked ? "checked" : ""}` },
                item.checked && createElement("i", { className: "ti ti-check" })
              ),
              createElement(
                "span",
                { className: "md-checklist-text" },
                item.children.map((child, i) => renderInline(child, i))
              )
            )
          )
        )
      );
    }

    return createElement(
      "div",
      { key: groupIndex, className: "md-checklist-group" },
      children
    );
  });

  return createElement("div", { className: "md-checklist md-checklist-grouped" }, groupElements);
}

// 时间线事件类型颜色映射
const TIMELINE_CATEGORY_COLORS: Record<string, string> = {
  工作: "#007bff",    // 蓝色
  娱乐: "#e83e8c",    // 粉色
  学习: "#28a745",    // 绿色
  生活: "#fd7e14",    // 橙色
  健康: "#20c997",    // 青色
  旅行: "#6f42c1",    // 紫色
  财务: "#ffc107",    // 黄色
  社交: "#17a2b8",    // 蓝绿色
};

function getTimelineDotColor(category?: string): string {
  if (!category) return "var(--orca-color-primary, #007bff)";
  return TIMELINE_CATEGORY_COLORS[category] || "var(--orca-color-primary, #007bff)";
}

// Helper component for Timeline
function TimelineBlock({ items, renderInline }: { items: TimelineItem[], renderInline: (node: MarkdownInlineNode, key: number) => any }) {
  return createElement(
    "div",
    { className: "md-timeline" },
    ...items.map((item, index) => {
      const dotColor = getTimelineDotColor(item.category);
      // 分离日期和时间：支持 "2024-01-15 14:30" 格式
      const dateTimeParts = item.date.split(" ");
      const datePart = dateTimeParts[0] || item.date;
      const timePart = dateTimeParts[1] || null; // HH:mm 部分
      
      return createElement(
        "div",
        { key: index, className: "md-timeline-item" },
        createElement("div", { 
          className: "md-timeline-dot",
          style: { background: dotColor, boxShadow: `0 0 0 2px ${dotColor}` }
        }),
        createElement(
          "div",
          { className: "md-timeline-content" },
          createElement(
            "div",
            { className: "md-timeline-date", style: { color: dotColor } },
            datePart,
            timePart && createElement(
              "span",
              { className: "md-timeline-time", style: { marginLeft: "8px", opacity: 0.8, fontSize: "0.9em" } },
              timePart
            ),
            item.category && createElement(
              "span",
              { className: "md-timeline-category", style: { background: dotColor } },
              item.category
            )
          ),
          createElement(
            "div",
            { className: "md-timeline-title" },
            ...item.title.map((node, i) => renderInline(node, i))
          ),
          item.description && item.description.length > 0 && createElement(
            "div",
            { className: "md-timeline-desc" },
            ...item.description.map((node, i) => renderInline(node, i))
          )
        )
      );
    })
  );
}

// Helper component for Compare (left-right comparison view)
function CompareBlock({ 
  leftTitle, 
  rightTitle, 
  items, 
  renderInline 
}: { 
  leftTitle: MarkdownInlineNode[]; 
  rightTitle: MarkdownInlineNode[]; 
  items: CompareItem[];
  renderInline: (node: MarkdownInlineNode, key: number) => any;
}) {
  return createElement(
    "div",
    { className: "md-compare" },
    // Header row with titles
    createElement(
      "div",
      { className: "md-compare-header" },
      createElement(
        "div",
        { className: "md-compare-title md-compare-left" },
        ...leftTitle.map((node, i) => renderInline(node, i))
      ),
      createElement("div", { className: "md-compare-divider" }),
      createElement(
        "div",
        { className: "md-compare-title md-compare-right" },
        ...rightTitle.map((node, i) => renderInline(node, i))
      )
    ),
    // Content rows
    ...items.map((item, index) =>
      createElement(
        "div",
        { key: index, className: "md-compare-row" },
        createElement(
          "div",
          { className: "md-compare-cell md-compare-left" },
          ...item.left.map((node, i) => renderInline(node, i))
        ),
        createElement("div", { className: "md-compare-divider" }),
        createElement(
          "div",
          { className: "md-compare-cell md-compare-right" },
          ...item.right.map((node, i) => renderInline(node, i))
        )
      )
    )
  );
}

// Helper component for Gallery (image grid with lightbox)
function GalleryBlock({ images }: { images: GalleryImage[] }) {
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const [viewMode, setViewMode] = useState("grid" as "grid" | "masonry" | "list");
  
  const openInSystem = (src: string) => {
    orca.invokeBackend("shell-open", resolveImageFilePath(src));
  };
  
  const closeLightbox = () => setSelectedIndex(-1);
  
  const showPrev = () => {
    if (selectedIndex > 0) setSelectedIndex(selectedIndex - 1);
  };
  
  const showNext = () => {
    if (selectedIndex < images.length - 1) setSelectedIndex(selectedIndex + 1);
  };
  
  // Keyboard navigation
  const handleKeyDown = (e: any) => {
    if (selectedIndex < 0) return;
    if (e.key === "Escape") closeLightbox();
    if (e.key === "ArrowLeft") showPrev();
    if (e.key === "ArrowRight") showNext();
  };
  
  // Grid view
  const renderGridView = () => createElement(
    "div",
    { className: "md-gallery-grid" },
    ...images.map((img, index) =>
      createElement(
        "div",
        { 
          key: index, 
          className: "md-gallery-item",
          onClick: () => setSelectedIndex(index),
        },
        createElement("img", {
          src: resolveImageSrc(img.src),
          alt: img.alt || `Image ${index + 1}`,
          className: "md-gallery-thumb",
          onError: (e: any) => { e.target.style.display = "none"; },
        }),
        img.caption && createElement(
          "div",
          { className: "md-gallery-caption" },
          img.caption
        )
      )
    )
  );
  
  // List view
  const renderListView = () => createElement(
    "div",
    { className: "md-gallery-list" },
    ...images.map((img, index) =>
      createElement(
        "div",
        { 
          key: index, 
          className: "md-gallery-list-item",
          onClick: () => setSelectedIndex(index),
        },
        createElement("img", {
          src: resolveImageSrc(img.src),
          alt: img.alt || `Image ${index + 1}`,
          className: "md-gallery-list-thumb",
          onError: (e: any) => { e.target.style.display = "none"; },
        }),
        createElement(
          "div",
          { className: "md-gallery-list-info" },
          createElement("div", { className: "md-gallery-list-title" }, img.alt || `Image ${index + 1}`),
          img.caption && createElement("div", { className: "md-gallery-list-caption" }, img.caption)
        )
      )
    )
  );
  
  // Lightbox
  const renderLightbox = () => {
    if (selectedIndex < 0) return null;
    const img = images[selectedIndex];
    
    return createElement(
      "div",
      { 
        className: "md-gallery-lightbox",
        onClick: closeLightbox,
        onKeyDown: handleKeyDown,
        tabIndex: 0,
      },
      createElement(
        "div",
        { 
          className: "md-gallery-lightbox-content",
          onClick: (e: any) => e.stopPropagation(),
        },
        // Close button
        createElement(
          "button",
          { className: "md-gallery-lightbox-close", onClick: closeLightbox },
          createElement("i", { className: "ti ti-x" })
        ),
        // Navigation
        selectedIndex > 0 && createElement(
          "button",
          { className: "md-gallery-lightbox-prev", onClick: showPrev },
          createElement("i", { className: "ti ti-chevron-left" })
        ),
        selectedIndex < images.length - 1 && createElement(
          "button",
          { className: "md-gallery-lightbox-next", onClick: showNext },
          createElement("i", { className: "ti ti-chevron-right" })
        ),
        // Image
        createElement("img", {
          src: resolveImageSrc(img.src),
          alt: img.alt || "",
          className: "md-gallery-lightbox-img",
        }),
        // Info bar
        createElement(
          "div",
          { className: "md-gallery-lightbox-info" },
          createElement("span", null, `${selectedIndex + 1} / ${images.length}`),
          img.alt && createElement("span", { className: "md-gallery-lightbox-alt" }, img.alt),
          createElement(
            "button",
            { 
              className: "md-gallery-lightbox-open",
              onClick: () => openInSystem(img.src),
              title: "在系统中打开",
            },
            createElement("i", { className: "ti ti-external-link" })
          )
        )
      )
    );
  };
  
  return createElement(
    "div",
    { className: "md-gallery" },
    // Toolbar
    createElement(
      "div",
      { className: "md-gallery-toolbar" },
      createElement("span", { className: "md-gallery-count" }, `${images.length} 张图片`),
      createElement(
        "div",
        { className: "md-gallery-view-switcher" },
        createElement(
          "button",
          { 
            className: `md-gallery-view-btn ${viewMode === "grid" ? "active" : ""}`,
            onClick: () => setViewMode("grid"),
            title: "网格视图",
          },
          createElement("i", { className: "ti ti-layout-grid" })
        ),
        createElement(
          "button",
          { 
            className: `md-gallery-view-btn ${viewMode === "list" ? "active" : ""}`,
            onClick: () => setViewMode("list"),
            title: "列表视图",
          },
          createElement("i", { className: "ti ti-list" })
        )
      )
    ),
    // Content
    viewMode === "grid" ? renderGridView() : renderListView(),
    // Lightbox
    renderLightbox()
  );
}

// Helper: Check if a link node will be rendered as a dot (meaningless reference)
function isBlockDotLink(node: MarkdownInlineNode): boolean {
  if (node.type !== "link") return false;
  if (!node.url.startsWith("orca-block:")) return false;
  const linkText = node.children.map(c => c.type === "text" ? c.content : "").join("").trim();
  return (
    /^\d+$/.test(linkText) ||
    /^blockid[:：]?\d+$/i.test(linkText) ||
    /^块\s*ID\s*[:：]?\s*\d+$/i.test(linkText) ||
    /^(查看|详情|点击|跳转|打开|前往|查看详情|点击查看|查看更多|小圆点|View|Click|Open)$/i.test(linkText)
  );
}

// Helper: Clean up brackets/commas around block dots in inline nodes
function cleanupDotPunctuation(nodes: MarkdownInlineNode[]): MarkdownInlineNode[] {
  const result: MarkdownInlineNode[] = [];
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const prevIsDot = i > 0 && isBlockDotLink(nodes[i - 1]);
    const nextIsDot = i < nodes.length - 1 && isBlockDotLink(nodes[i + 1]);
    
    if (node.type === "text" && (prevIsDot || nextIsDot)) {
      // Remove brackets and commas around dots
      let cleaned = node.content;
      if (nextIsDot) {
        // Before a dot: remove trailing ( （ [ 【
        cleaned = cleaned.replace(/[(\[（【]+\s*$/, "");
      }
      if (prevIsDot) {
        // After a dot: remove leading ) ） ] 】 , ，
        cleaned = cleaned.replace(/^\s*[)\]）】,，]+/, "");
      }
      if (prevIsDot && nextIsDot) {
        // Between dots: remove , ， and spaces
        cleaned = cleaned.replace(/^[\s,，]+$/, "");
      }
      if (cleaned) {
        result.push({ type: "text", content: cleaned });
      }
    } else {
      result.push(node);
    }
  }
  return result;
}

function renderInlineNode(node: MarkdownInlineNode, key: number): any {
  switch (node.type) {
    case "text":
      return createElement(React.Fragment, { key }, node.content);

    case "break":
      return createElement("br", { key });

    case "bold":
      return createElement(
        "strong",
        {
          key,
          style: boldStyle,
        },
        ...node.children.map((child, i) => renderInlineNode(child, i)),
      );

    case "italic":
      return createElement(
        "em",
        { key, style: { fontStyle: "italic" } },
        ...node.children.map((child, i) => renderInlineNode(child, i)),
      );

    case "code":
      return createElement(
        "code",
        {
          key,
          style: inlineCodeStyle,
        },
        node.content,
      );

    case "image":
      return createElement(
        "span",
        { key, style: imageContainerStyle },
        createElement("img", {
          src: resolveImageSrc(node.src),
          alt: node.alt || "image",
          style: imageStyle,
          onClick: () => {
            orca.invokeBackend("shell-open", resolveImageFilePath(node.src));
          },
          onError: (e: any) => {
            console.warn("[MarkdownMessage] Image not found:", node.src);
            e.target.style.display = "none";
          },
        })
      );

    case "link":
      // Check if this is an orca-block link
      const isBlockLink = node.url.startsWith("orca-block:");
      if (isBlockLink) {
        const blockId = parseInt(node.url.replace("orca-block:", ""), 10);
        
        // Navigation handler with error handling and feedback
        const handleBlockNavigation = (e: any) => {
          e.preventDefault();
          e.stopPropagation();
          
          // Validate block ID
          if (isNaN(blockId) || blockId <= 0) {
            console.error("[MarkdownMessage] Invalid block ID:", blockId);
            return;
          }
          
          try {
            // Open in last panel (non-current panel)
            orca.nav.openInLastPanel("block", { blockId });
          } catch (error) {
            console.error("[MarkdownMessage] Navigation failed:", error);
          }
        };

        // Check if link text is a "meaningless reference" that should be rendered as a dot
        // Rules (strict):
        // 1. Pure numbers only (e.g., "123", "14817")
        // 2. blockid:xxx format (e.g., "blockid:14772")
        // 3. 块 ID: xxx format (e.g., "块 ID: 14184")
        // 4. Exact match action words only (e.g., "查看详情", "点击")
        // 5. "小圆点" literal (AI sometimes uses this)
        // Real titles (even short ones like "日记", "想法") should show text
        const linkText = node.children.map(c => c.type === "text" ? c.content : "").join("").trim();
        
        const isPureNumber = /^\d+$/.test(linkText);
        const isBlockIdFormat = /^orca-block[:：]?\d+$/i.test(linkText) || 
                               /^blockid[:：]?\d+$/i.test(linkText) || 
                               /^块\s*ID\s*[:：]?\s*\d+$/i.test(linkText);
        const isActionWord = /^(查看|详情|点击|跳转|打开|前往|查看详情|点击查看|查看更多|小圆点|View|Click|Open)$/i.test(linkText);
        
        // 只有当链接文本看起来像是 blockId 引用时，才检查数字一致性
        // 普通标题（如 "P2511 - 运动健身减肥"）不需要检查
        const looksLikeBlockIdRef = isPureNumber || isBlockIdFormat;
        
        if (looksLikeBlockIdRef) {
          // 提取链接文本中的数字
          const linkTextNumberMatch = linkText.match(/(\d+)/);
          const linkTextNumber = linkTextNumberMatch ? parseInt(linkTextNumberMatch[1], 10) : null;
          
          // 检查数字是否与 blockId 一致
          if (linkTextNumber !== null && linkTextNumber !== blockId) {
            console.warn(`[MarkdownMessage] Block ID mismatch: linkText="${linkText}" (${linkTextNumber}) vs url blockId=${blockId}`);
            
            // 渲染为带警告样式的链接，使用 URL 中的 blockId 进行预览和跳转
            return createElement(
              orca.components.BlockPreviewPopup,
              { key, blockId, delay: 300 },
              createElement(
                "span",
                {
                  style: {
                    ...blockLinkContainerStyle,
                    borderColor: "rgba(255, 100, 100, 0.3)",
                    background: "rgba(255, 100, 100, 0.05)",
                  },
                  onClick: handleBlockNavigation,
                  title: `⚠️ 链接文本(${linkTextNumber})与实际块ID(${blockId})不匹配`,
                },
                // 显示实际的 blockId 而不是错误的链接文本
                createElement(
                  "span",
                  { style: { ...blockLinkTextStyle, color: "var(--orca-color-warning, #f59e0b)" } },
                  `块 ${blockId}`,
                ),
                createElement(
                  "span",
                  { style: { ...blockLinkArrowStyle, color: "var(--orca-color-warning, #f59e0b)" } },
                  createElement("i", { className: "ti ti-alert-triangle" }),
                ),
              )
            );
          }
        }
        
        const isBlockIdOnly = isPureNumber || isBlockIdFormat || isActionWord;

        // Render as small dot if it's just a block ID reference
        if (isBlockIdOnly) {
          // Use blockId to determine color for visual distinction
          const dotColors = ["#007bff", "#28a745", "#fd7e14", "#6f42c1", "#e83e8c"];
          const dotColor = dotColors[blockId % dotColors.length];
          
          return createElement(
            orca.components.BlockPreviewPopup,
            { key, blockId, delay: 300 },
            createElement(
              "span",
              {
                className: "md-block-dot",
                style: { background: dotColor, color: dotColor },
                onClick: handleBlockNavigation,
              }
            )
          );
        }
        
        // Wrap with BlockPreviewPopup for hover preview (full link style)
        return createElement(
          orca.components.BlockPreviewPopup,
          { key, blockId, delay: 300 },
          createElement(
            "span",
            {
              style: blockLinkContainerStyle,
              onClick: handleBlockNavigation,
              onMouseEnter: (e: any) => {
                e.currentTarget.style.background = "rgba(0, 123, 255, 0.08)";
                e.currentTarget.style.borderColor = "rgba(0, 123, 255, 0.2)";
                e.currentTarget.style.transform = "translateX(2px)";
              },
              onMouseLeave: (e: any) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.borderColor = "transparent";
                e.currentTarget.style.transform = "translateX(0)";
              },
            },
            // Link text
            createElement(
              "span",
              { style: blockLinkTextStyle },
              ...node.children.map((child, i) => renderInlineNode(child, i)),
            ),
            // Jump arrow icon
            createElement(
              "span",
              {
                style: blockLinkArrowStyle,
                onMouseEnter: (e: any) => {
                  e.currentTarget.style.transform = "translateX(2px)";
                },
                onMouseLeave: (e: any) => {
                  e.currentTarget.style.transform = "translateX(0)";
                },
              },
              createElement("i", { className: "ti ti-arrow-right" }),
            ),
          )
        );
      }
      // Normal external link
      return createElement(
        "a",
        {
          key,
          href: node.url,
          target: "_blank",
          rel: "noopener noreferrer",
          title: node.url,
          style: linkStyle,
          onClick: (e: any) => {
            // Allow default behavior for external links
          },
        },
        ...node.children.map((child, i) => renderInlineNode(child, i)),
      );


    default:
      return null;
  }
}

function renderBlockNode(node: MarkdownNode, key: number): any {
  switch (node.type) {
    case "heading": {
      const HeadingTag = `h${node.level}` as any;
      // 生成标题的文本内容用于创建 ID
      const headingText = node.children
        .map((c) => (c.type === "text" ? c.content : ""))
        .join("")
        .trim();
      // 创建 slug ID：移除特殊字符，空格转为连字符
      const headingId = `heading-${headingText
        .toLowerCase()
        .replace(/[^\w\u4e00-\u9fa5\s-]/g, "")
        .replace(/\s+/g, "-")
        .substring(0, 50)}`;
      return createElement(
        HeadingTag,
        {
          key,
          id: headingId,
          "data-heading-text": headingText,
          style: headingStyle(node.level),
        },
        ...node.children.map((child, i) => renderInlineNode(child, i)),
      );
    }

    case "paragraph": {
      const cleanedChildren = cleanupDotPunctuation(node.children);
      return createElement(
        "p",
        {
          key,
          style: paragraphStyle,
        },
        ...cleanedChildren.map((child, i) => renderInlineNode(child, i)),
      );
    }

    case "list": {
      const ListTag = (node.ordered ? "ol" : "ul") as any;
      const listClass = node.ordered ? "md-list md-list-ordered" : "md-list md-list-unordered";

      // 递归渲染列表项
      const renderListItem = (item: any, itemIndex: number): any => {
        return createElement(
          "li",
          {
            key: itemIndex,
            className: "md-list-item",
          },
          // 渲染项目内容
          ...item.content.map((child: any, i: number) => renderInlineNode(child, i)),
          // 渲染嵌套子列表
          item.children && item.children.length > 0 && createElement(
            ListTag,
            {
              className: listClass + " md-list-nested",
            },
            ...item.children.map((subItem: any, subIndex: number) => renderListItem(subItem, subIndex))
          )
        );
      };

      return createElement(
        ListTag,
        {
          key,
          className: listClass,
        },
        ...node.items.map((item, itemIndex) => renderListItem(item, itemIndex)),
      );
    }

    case "quote":
      return createElement(
        "blockquote",
        {
          key,
          style: blockQuoteStyle,
        },
        ...node.children.map((child, i) => renderBlockNode(child, i)),
      );

    case "codeblock":
      // 特殊处理 journal-export 代码块
      if (node.language === "journal-export") {
        return createElement(JournalExportBlock, {
          key,
          content: node.content,
        });
      }
      return createElement(CodeBlock, {
        key,
        language: node.language,
        content: node.content,
      });

    case "table": {
      return createElement(TableBlock, {
        key,
        headers: node.headers,
        alignments: node.alignments,
        rows: node.rows,
        renderInline: renderInlineNode,
      });
    }

    case "checklist": {
      return createElement(ChecklistBlock, {
        key,
        items: node.items,
        renderInline: renderInlineNode,
      });
    }

    case "timeline": {
      return createElement(TimelineBlock, {
        key,
        items: node.items,
        renderInline: renderInlineNode,
      });
    }

    case "compare": {
      return createElement(CompareBlock, {
        key,
        leftTitle: node.leftTitle,
        rightTitle: node.rightTitle,
        items: node.items,
        renderInline: renderInlineNode,
      });
    }

    case "localgraph": {
      return createElement(LocalGraph, {
        key,
        blockId: node.blockId,
      });
    }

    case "mindmap": {
      return createElement(MindMapRenderer, {
        key,
        blockId: node.blockId,
      });
    }

    case "gallery": {
      return createElement(GalleryBlock, {
        key,
        images: node.images,
      });
    }

    case "hr":
      return createElement("hr", { key, className: "md-hr" });

    default:
      return null;
  }
}

export default function MarkdownMessage({ content, role }: Props) {
  // 预处理：清理 AI 输出中多余的标注符号
  const cleanedContent = useMemo(() => {
    let text = content;
    
    // 保留 [GRAPH_REQUEST:blockId] 标记，不要清理
    const graphRequestMarker = text.match(/\[GRAPH_REQUEST:\d+\]/g) || [];
    
    // 清理中文方括号引用标注：【引用】
    text = text.replace(/【([^】]+)】/g, '$1');
    
    // 清理英文方括号，但保留 Markdown 语法和 GRAPH_REQUEST 标记
    // 使用更精确的方式：先标记需要保留的，再清理其他的
    // 保留：[text](url) 链接、![alt](url) 图片、[ ] 和 [x] 任务列表、[GRAPH_REQUEST:xxx]
    text = text.replace(/\[([^\]]*)\]/g, (match, p1, offset) => {
      // 保留 GRAPH_REQUEST 标记
      if (match.startsWith('[GRAPH_REQUEST:')) return match;
      // 检查后面是否跟着 (url) - 这是链接或图片语法
      const afterMatch = text.slice(offset + match.length);
      if (afterMatch.startsWith('(')) return match;
      // 检查前面是否是 ! - 这是图片语法的一部分
      if (offset > 0 && text[offset - 1] === '!') return match;
      // 保留任务列表 [ ] 和 [x]
      if (p1.trim() === '' || p1.trim().toLowerCase() === 'x') return match;
      // 其他情况：去掉括号，保留内容
      return p1;
    });
    
    // 清理中文圆括号引用标注：（引用）
    text = text.replace(/（([^）]+)）/g, '$1');
    
    return text;
  }, [content]);
  
  const nodes = useMemo(() => parseMarkdown(cleanedContent), [cleanedContent]);

  return createElement(
    "div",
    {
      style: markdownContainerStyle(role),
    },
    ...nodes.map((node: MarkdownNode, index: number) => renderBlockNode(node, index)),
  );
}

// 导出缓存供外部使用
export { journalExportCache };
