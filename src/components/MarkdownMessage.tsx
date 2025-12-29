import { parseMarkdown, type MarkdownInlineNode, type MarkdownNode, type TableAlignment, type CheckboxItem, type TimelineItem, type CompareItem, type GalleryImage } from "../utils/markdown-renderer";
import LocalGraph from "./LocalGraph";
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
function ChecklistBlock({
  items,
  renderInline,
}: {
  items: CheckboxItem[];
  renderInline: (node: MarkdownInlineNode, key: number) => any;
}) {
  return createElement(
    "div",
    { className: "md-checklist" },
    ...items.map((item, index) =>
      createElement(
        "div",
        { key: index, className: `md-checklist-item ${item.checked ? "checked" : ""}` },
        createElement(
          "span",
          { className: `md-checkbox ${item.checked ? "checked" : ""}` },
          item.checked && createElement("i", { className: "ti ti-check" })
        ),
        createElement(
          "span",
          { className: "md-checklist-text" },
          ...item.children.map((child, i) => renderInline(child, i))
        )
      )
    )
  );
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
  
  // Build full image path
  const getImageSrc = (src: string): string => {
    if (src.startsWith("./") || src.startsWith("../")) {
      const relativePath = src.replace(/^\.\//, "");
      const repoDir = orca.state.repoDir;
      if (repoDir) {
        return `file:///${repoDir.replace(/\\/g, "/")}/assets/${relativePath}`;
      }
    }
    return src;
  };
  
  // Get native path for shell-open
  const getImageFilePath = (src: string): string => {
    if (src.startsWith("./") || src.startsWith("../")) {
      const relativePath = src.replace(/^\.\//, "");
      const repoDir = orca.state.repoDir;
      if (repoDir) {
        return `${repoDir}\\assets\\${relativePath}`;
      }
    }
    return src;
  };
  
  const openInSystem = (src: string) => {
    orca.invokeBackend("shell-open", getImageFilePath(src));
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
          src: getImageSrc(img.src),
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
          src: getImageSrc(img.src),
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
          src: getImageSrc(img.src),
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
      // Convert relative path to absolute path
      // Relative paths like "./image.avif" are stored relative to the repo's assets folder
      let imageSrc = node.src;
      let imageFilePath = node.src; // Keep original for shell-open
      if (node.src.startsWith("./") || node.src.startsWith("../")) {
        const relativePath = node.src.replace(/^\.\//, "");
        // Build absolute path using repoDir + assets folder
        const repoDir = orca.state.repoDir;
        if (repoDir) {
          // Use file:// protocol for img src
          imageSrc = `file:///${repoDir.replace(/\\/g, "/")}/assets/${relativePath}`;
          // Keep native path for shell-open
          imageFilePath = `${repoDir}\\assets\\${relativePath}`;
        }
      }
      
      // Use native img tag for file:// protocol support
      return createElement(
        "span",
        { key, style: imageContainerStyle },
        createElement("img", {
          src: imageSrc,
          alt: node.alt || "image",
          style: imageStyle,
          onClick: () => {
            // Use Orca's shell-open to open image with system default viewer
            orca.invokeBackend("shell-open", imageFilePath);
          },
          onError: (e: any) => {
            console.error("[MarkdownMessage] Image load failed:", imageSrc);
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
        const isBlockIdOnly = 
          /^\d+$/.test(linkText) || // Pure numbers only
          /^blockid[:：]?\d+$/i.test(linkText) || // blockid:xxx format
          /^块\s*ID\s*[:：]?\s*\d+$/i.test(linkText) || // 块 ID: xxx format
          /^(查看|详情|点击|跳转|打开|前往|查看详情|点击查看|查看更多|小圆点|View|Click|Open)$/i.test(linkText); // Exact match action words

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
