export type MarkdownInlineNode =
  | { type: "text"; content: string }
  | { type: "bold"; children: MarkdownInlineNode[] }
  | { type: "italic"; children: MarkdownInlineNode[] }
  | { type: "code"; content: string }
  | { type: "link"; url: string; children: MarkdownInlineNode[] }
  | { type: "image"; src: string; alt: string }
  | { type: "break" };

export type TableAlignment = "left" | "center" | "right" | null;

export type CheckboxItem = {
  checked: boolean;
  children: MarkdownInlineNode[];
};

export type TimelineItem = {
  date: string;
  title: MarkdownInlineNode[];  // 支持链接等 inline 元素
  description?: MarkdownInlineNode[];  // 支持链接等 inline 元素
  category?: string;  // 事件类型：work, fun, study, life 等
};

export type CompareItem = {
  left: MarkdownInlineNode[];
  right: MarkdownInlineNode[];
};

export type GalleryImage = {
  src: string;
  alt: string;
  caption?: string;
};

// 列表项类型，支持嵌套
export type ListItem = {
  content: MarkdownInlineNode[];
  children?: ListItem[]; // 嵌套子列表
};

export type MarkdownNode =
  | { type: "paragraph"; children: MarkdownInlineNode[] }
  | { type: "heading"; level: number; children: MarkdownInlineNode[] }
  | { type: "list"; ordered: boolean; items: ListItem[] }
  | { type: "checklist"; items: CheckboxItem[] }
  | { type: "timeline"; items: TimelineItem[] }
  | { type: "compare"; leftTitle: MarkdownInlineNode[]; rightTitle: MarkdownInlineNode[]; items: CompareItem[] }
  | { type: "localgraph"; blockId: number }
  | { type: "gallery"; images: GalleryImage[] }
  | { type: "quote"; children: MarkdownNode[] }
  | { type: "codeblock"; content: string; language?: string }
  | { type: "table"; headers: MarkdownInlineNode[][]; alignments: TableAlignment[]; rows: MarkdownInlineNode[][][] }
  | { type: "hr" };

function normalizeNewlines(text: string): string {
  return text.replace(/\r\n/g, "\n");
}

function parseParagraphLines(lines: string[]): MarkdownInlineNode[] {
  const children: MarkdownInlineNode[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (i > 0) children.push({ type: "break" });
    children.push(...parseInlineMarkdown(lines[i]));
  }
  return mergeAdjacentTextNodes(children);
}

function mergeAdjacentTextNodes(nodes: MarkdownInlineNode[]): MarkdownInlineNode[] {
  const merged: MarkdownInlineNode[] = [];
  for (const node of nodes) {
    const prev = merged[merged.length - 1];
    if (prev?.type === "text" && node.type === "text") {
      prev.content += node.content;
      continue;
    }
    merged.push(node);
  }
  return merged;
}

/**
 * Parse a table row into cells
 */
function parseTableRow(line: string): string[] {
  // Remove leading/trailing pipes and split by |
  const trimmed = line.trim();
  const withoutPipes = trimmed.startsWith("|") ? trimmed.slice(1) : trimmed;
  const withoutEndPipe = withoutPipes.endsWith("|") ? withoutPipes.slice(0, -1) : withoutPipes;
  return withoutEndPipe.split("|").map(cell => cell.trim());
}

/**
 * Check if a line is a table separator (e.g., |---|:---:|---:|)
 */
function isTableSeparator(line: string): boolean {
  const trimmed = line.trim();
  // Must contain at least one | and consist of |, -, :, and spaces
  if (!trimmed.includes("|")) return false;
  return /^[\s|:\-]+$/.test(trimmed) && trimmed.includes("-");
}

/**
 * Parse table alignment from separator row
 */
function parseTableAlignments(separatorLine: string): TableAlignment[] {
  const cells = parseTableRow(separatorLine);
  return cells.map(cell => {
    const trimmed = cell.trim();
    const hasLeft = trimmed.startsWith(":");
    const hasRight = trimmed.endsWith(":");
    if (hasLeft && hasRight) return "center";
    if (hasRight) return "right";
    if (hasLeft) return "left";
    return null;
  });
}

/**
 * Check if a line looks like a table row
 */
function isTableRow(line: string): boolean {
  const trimmed = line.trim();
  return trimmed.includes("|") && !trimmed.startsWith(">") && !trimmed.match(/^\s*```/);
}

/**
 * Check if a line is a checkbox item: - [ ] or - [x] or - [X]
 */
function isCheckboxLine(line: string): { checked: boolean; text: string } | null {
  const match = line.match(/^\s*[-*+]\s+\[([ xX])\]\s*(.*)$/);
  if (!match) return null;
  return {
    checked: match[1].toLowerCase() === "x",
    text: match[2],
  };
}

/**
 * Parse compare from code block content
 * Format:
 * 左侧标题 | 右侧标题
 * ---
 * 左侧内容 | 右侧内容
 */
function parseCompare(content: string): { leftTitle: MarkdownInlineNode[]; rightTitle: MarkdownInlineNode[]; items: CompareItem[] } | null {
  const lines = content.trim().split("\n").filter(l => l.trim());
  if (lines.length < 2) return null;
  
  // First line: titles
  const titleParts = lines[0].split("|").map(p => p.trim());
  if (titleParts.length < 2) return null;
  
  const leftTitle = parseInlineMarkdown(titleParts[0]);
  const rightTitle = parseInlineMarkdown(titleParts[1]);
  
  // Find separator line (---)
  let startIdx = 1;
  if (lines[1].trim().match(/^-+$/)) {
    startIdx = 2;
  }
  
  // Parse items
  const items: CompareItem[] = [];
  for (let i = startIdx; i < lines.length; i++) {
    const parts = lines[i].split("|").map(p => p.trim());
    if (parts.length >= 2) {
      items.push({
        left: parseInlineMarkdown(parts[0]),
        right: parseInlineMarkdown(parts[1]),
      });
    }
  }
  
  return items.length > 0 ? { leftTitle, rightTitle, items } : null;
}

/**
 * Parse gallery from code block content
 * Format: Each line is an image entry
 * - Simple: image_path
 * - With alt: image_path | alt_text
 * - With caption: image_path | alt_text | caption
 * - Markdown image: ![alt](src)
 */
function parseGallery(content: string): GalleryImage[] | null {
  const lines = content.trim().split("\n").filter(l => l.trim());
  if (lines.length === 0) return null;
  
  const images: GalleryImage[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    
    // Try markdown image format: ![alt](src)
    const mdMatch = trimmed.match(/^!\[([^\]]*)\]\(([^)]+)\)(?:\s*\|\s*(.+))?$/);
    if (mdMatch) {
      images.push({
        src: mdMatch[2],
        alt: mdMatch[1] || "",
        caption: mdMatch[3]?.trim(),
      });
      continue;
    }
    
    // Try pipe-separated format: src | alt | caption
    const parts = trimmed.split("|").map(p => p.trim());
    if (parts[0]) {
      images.push({
        src: parts[0],
        alt: parts[1] || "",
        caption: parts[2],
      });
    }
  }
  
  return images.length > 0 ? images : null;
}

/**
 * Parse timeline from code block content
 * Format: date | title | description (optional) | category (optional)
 * Title supports inline markdown (links, bold, etc.)
 * Category determines dot color: work(blue), fun(pink), study(green), life(orange)
 */
function parseTimeline(content: string): TimelineItem[] | null {
  const lines = content.trim().split("\n").filter(l => l.trim());
  if (lines.length === 0) return null;
  
  const items: TimelineItem[] = [];
  for (const line of lines) {
    const parts = line.split("|").map(p => p.trim());
    if (parts.length >= 2 && parts[0] && parts[1]) {
      items.push({
        date: parts[0],
        title: parseInlineMarkdown(parts[1]),  // 解析为 inline nodes 支持链接
        description: parts[2] ? parseInlineMarkdown(parts[2]) : undefined,  // 解析为 inline nodes 支持链接
        category: parts[3]?.toLowerCase() || undefined,  // 事件类型
      });
    }
  }
  
  return items.length > 0 ? items : null;
}



/**
 * Check if a paragraph contains only a single image (no other content)
 */
function isImageOnlyParagraph(node: MarkdownNode): node is { type: "paragraph"; children: MarkdownInlineNode[] } {
  if (node.type !== "paragraph") return false;
  const children = node.children;
  // Filter out breaks and empty text
  const meaningful = children.filter(c => {
    if (c.type === "break") return false;
    if (c.type === "text" && !c.content.trim()) return false;
    return true;
  });
  return meaningful.length === 1 && meaningful[0].type === "image";
}

/**
 * Extract image info from an image-only paragraph
 */
function extractImageFromParagraph(node: MarkdownNode): GalleryImage | null {
  if (!isImageOnlyParagraph(node)) return null;
  const imgNode = node.children.find(c => c.type === "image");
  if (!imgNode || imgNode.type !== "image") return null;
  return { src: imgNode.src, alt: imgNode.alt };
}

/**
 * Post-process: merge consecutive image-only paragraphs into gallery blocks
 * Only merges when there are 2+ consecutive images
 */
function mergeConsecutiveImages(nodes: MarkdownNode[]): MarkdownNode[] {
  const result: MarkdownNode[] = [];
  let imageBuffer: GalleryImage[] = [];
  
  const flushImageBuffer = () => {
    if (imageBuffer.length === 0) return;
    if (imageBuffer.length === 1) {
      // Single image: keep as paragraph
      result.push({
        type: "paragraph",
        children: [{ type: "image", src: imageBuffer[0].src, alt: imageBuffer[0].alt }],
      });
    } else {
      // Multiple images: create gallery
      result.push({
        type: "gallery",
        images: imageBuffer,
      });
    }
    imageBuffer = [];
  };
  
  for (const node of nodes) {
    const img = extractImageFromParagraph(node);
    if (img) {
      imageBuffer.push(img);
    } else {
      flushImageBuffer();
      result.push(node);
    }
  }
  
  flushImageBuffer();
  return result;
}

/**
 * Markdown Parser
 * - Parses block-level structure (headings, lists, quotes, code fences, paragraphs)
 * - Parses inline emphasis/code/link inside blocks
 *
 * Notes:
 * - We re-parse the full message each render to keep streaming-safe: chunk boundaries won't
 *   break inline syntax like `**bold**`.
 */
export function parseMarkdown(text: string): MarkdownNode[] {
  if (!text) return [];

  // Check for [GRAPH_REQUEST:blockId] marker and extract blockId
  // This is a fallback when AI doesn't call the tool properly
  const graphRequestMatch = text.match(/\[GRAPH_REQUEST:(\d+)\]/);
  if (graphRequestMatch) {
    const blockId = parseInt(graphRequestMatch[1], 10);
    if (blockId > 0) {
      // Remove the marker from text and add localgraph node
      text = text.replace(/\[GRAPH_REQUEST:\d+\]/g, "").trim();
      const nodes: MarkdownNode[] = [];
      
      // If there's remaining text, parse it first
      if (text) {
        const remainingNodes = parseMarkdownInternal(text);
        nodes.push(...remainingNodes);
      }
      
      // Always add the localgraph at the end
      nodes.push({ type: "localgraph", blockId });
      return nodes;
    }
  }

  return parseMarkdownInternal(text);
}

function parseMarkdownInternal(text: string): MarkdownNode[] {
  if (!text) return [];

  const lines = normalizeNewlines(text).split("\n");
  const nodes: MarkdownNode[] = [];

  let inCodeBlock = false;
  let codeBlockLang = "";
  let codeBlockLines: string[] = [];

  let paragraphLines: string[] = [];
  let currentList: {
    ordered: boolean;
    items: ListItem[];
    indentStack?: { indent: number; items: ListItem[] }[];
  } | null = null;
  let currentChecklist: CheckboxItem[] | null = null;

  const flushParagraph = () => {
    if (!paragraphLines.length) return;
    nodes.push({
      type: "paragraph",
      children: parseParagraphLines(paragraphLines),
    });
    paragraphLines = [];
  };

  const flushList = () => {
    if (!currentList) return;
    // 从 indentStack 的根层级获取 items
    const rootItems = currentList.indentStack?.[0]?.items ?? currentList.items;
    nodes.push({
      type: "list",
      ordered: currentList.ordered,
      items: rootItems,
    });
    currentList = null;
  };

  const flushChecklist = () => {
    if (!currentChecklist) return;
    nodes.push({
      type: "checklist",
      items: currentChecklist,
    });
    currentChecklist = null;
  };

  const flushCodeBlock = () => {
    if (!inCodeBlock) return;
    
    // Check if it's a timeline code block
    if (codeBlockLang.toLowerCase() === "timeline") {
      const timelineItems = parseTimeline(codeBlockLines.join("\n"));
      if (timelineItems) {
        nodes.push({
          type: "timeline",
          items: timelineItems,
        });
        inCodeBlock = false;
        codeBlockLang = "";
        codeBlockLines = [];
        return;
      }
    }
    
    // Check if it's a compare code block
    if (codeBlockLang.toLowerCase() === "compare") {
      const compareData = parseCompare(codeBlockLines.join("\n"));
      if (compareData) {
        nodes.push({
          type: "compare",
          leftTitle: compareData.leftTitle,
          rightTitle: compareData.rightTitle,
          items: compareData.items,
        });
        inCodeBlock = false;
        codeBlockLang = "";
        codeBlockLines = [];
        return;
      }
    }
    
    // Check if it's a gallery code block
    if (codeBlockLang.toLowerCase() === "gallery" || codeBlockLang.toLowerCase() === "images") {
      const galleryImages = parseGallery(codeBlockLines.join("\n"));
      if (galleryImages) {
        nodes.push({
          type: "gallery",
          images: galleryImages,
        });
        inCodeBlock = false;
        codeBlockLang = "";
        codeBlockLines = [];
        return;
      }
    }
    
    // Check if it's a localgraph code block
    if (codeBlockLang.toLowerCase() === "localgraph") {
      const blockIdStr = codeBlockLines.join("\n").trim();
      const blockId = parseInt(blockIdStr, 10);
      if (blockId > 0) {
        nodes.push({
          type: "localgraph",
          blockId,
        });
        inCodeBlock = false;
        codeBlockLang = "";
        codeBlockLines = [];
        return;
      }
    }
    
    // Intercept graph/mermaid/dot code blocks - AI sometimes returns these despite instructions
    // Try to extract blockId from the content and convert to localgraph
    const graphLangs = ["graph", "mermaid", "flowchart", "dot", "graphviz", "diagram"];
    if (graphLangs.includes(codeBlockLang.toLowerCase())) {
      const content = codeBlockLines.join("\n");
      // Try to find block IDs in the content (e.g., "14772", "blockid:14772", "orca-block:14772", links like "14772[title]")
      // Look for patterns like: blockId=14772, block_id: 14772, orca-block:14772, or standalone 4+ digit numbers
      const blockIdPatterns = [
        /blockId[=:]\s*(\d+)/i,
        /block_id[=:]\s*(\d+)/i,
        /orca-block:(\d+)/i,
        /\b(\d{4,})\b/,  // 4+ digit numbers (likely block IDs)
      ];
      
      let blockId = 0;
      for (const pattern of blockIdPatterns) {
        const match = content.match(pattern);
        if (match) {
          blockId = parseInt(match[1], 10);
          if (blockId > 0) break;
        }
      }
      
      if (blockId > 0) {
        console.log(`[markdown-renderer] Intercepted ${codeBlockLang} block, converting to localgraph with blockId=${blockId}`);
        nodes.push({
          type: "localgraph",
          blockId,
        });
        inCodeBlock = false;
        codeBlockLang = "";
        codeBlockLines = [];
        return;
      }
      // If no valid blockId found, fall through to render as regular code block
    }
    
    nodes.push({
      type: "codeblock",
      content: codeBlockLines.join("\n"),
      language: codeBlockLang || undefined,
    });
    inCodeBlock = false;
    codeBlockLang = "";
    codeBlockLines = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];

    const fenceMatch = rawLine.match(/^\s*```(.*)$/);
    if (fenceMatch) {
      flushParagraph();
      flushList();
      if (inCodeBlock) {
        flushCodeBlock();
      } else {
        inCodeBlock = true;
        codeBlockLang = (fenceMatch[1] ?? "").trim();
        codeBlockLines = [];
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockLines.push(rawLine);
      continue;
    }

    if (rawLine.trim() === "") {
      flushParagraph();
      flushList();
      continue;
    }

    // Horizontal rule: ---, ***, ___
    if (/^\s*([-*_])\s*\1\s*\1\s*$/.test(rawLine) || /^\s*[-*_]{3,}\s*$/.test(rawLine)) {
      flushParagraph();
      flushList();
      nodes.push({ type: "hr" });
      continue;
    }

    // Blockquote (group consecutive quote lines)
    if (rawLine.trimStart().startsWith(">")) {
      flushParagraph();
      flushList();

      const quoteLines: string[] = [];
      let j = i;
      while (j < lines.length) {
        const line = lines[j];
        if (line.trimStart().startsWith(">")) {
          quoteLines.push(line.replace(/^\s*> ?/, ""));
          j += 1;
          continue;
        }
        if (line.trim() === "") {
          quoteLines.push("");
          j += 1;
          continue;
        }
        break;
      }

      nodes.push({
        type: "quote",
        children: parseMarkdown(quoteLines.join("\n")),
      });

      i = j - 1;
      continue;
    }

    // Headings (1-6)
    const headingMatch = rawLine.match(/^\s*(#{1,6})\s+(.+?)\s*$/);
    if (headingMatch) {
      flushParagraph();
      flushList();
      nodes.push({
        type: "heading",
        level: headingMatch[1].length,
        children: parseInlineMarkdown(headingMatch[2]),
      });
      continue;
    }

    // Table detection: header row followed by separator row
    if (isTableRow(rawLine) && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      flushParagraph();
      flushList();

      const headerCells = parseTableRow(rawLine);
      const alignments = parseTableAlignments(lines[i + 1]);
      const rows: MarkdownInlineNode[][][] = [];

      // Skip header and separator
      let j = i + 2;
      
      // Collect data rows
      while (j < lines.length && isTableRow(lines[j]) && !isTableSeparator(lines[j])) {
        const rowCells = parseTableRow(lines[j]);
        // Pad or trim to match header column count
        while (rowCells.length < headerCells.length) rowCells.push("");
        if (rowCells.length > headerCells.length) rowCells.length = headerCells.length;
        
        rows.push(rowCells.map(cell => parseInlineMarkdown(cell)));
        j++;
      }

      nodes.push({
        type: "table",
        headers: headerCells.map(cell => parseInlineMarkdown(cell)),
        alignments,
        rows,
      });

      i = j - 1;
      continue;
    }

    // Checkbox list detection: - [ ] or - [x]
    const checkboxData = isCheckboxLine(rawLine);
    if (checkboxData) {
      flushParagraph();
      flushList();
      
      if (!currentChecklist) {
        currentChecklist = [];
      }
      
      currentChecklist.push({
        checked: checkboxData.checked,
        children: parseInlineMarkdown(checkboxData.text),
      });
      continue;
    }

    // Lists (group consecutive items with nesting support)
    const orderedMatch = rawLine.match(/^(\s*)(\d+)\.\s+(.*)$/);
    const unorderedMatch = rawLine.match(/^(\s*)([-*+])\s+(.*)$/);
    if (orderedMatch || unorderedMatch) {
      flushParagraph();
      flushChecklist();
      const indent = (orderedMatch ? orderedMatch[1] : unorderedMatch?.[1])?.length ?? 0;
      const ordered = !!orderedMatch;
      const itemText = (orderedMatch ? orderedMatch[3] : unorderedMatch?.[3]) ?? "";

      if (!currentList || currentList.ordered !== ordered) {
        flushList();
        currentList = { ordered, items: [], indentStack: [{ indent: 0, items: [] }] };
      }

      // 处理缩进层级
      const stack = currentList.indentStack!;
      const newItem: { content: MarkdownInlineNode[]; children?: any[] } = {
        content: parseInlineMarkdown(itemText),
      };

      // 找到合适的父级
      while (stack.length > 1 && indent <= stack[stack.length - 1].indent) {
        stack.pop();
      }

      if (indent > stack[stack.length - 1].indent) {
        // 创建新的嵌套层级
        const parent = stack[stack.length - 1].items;
        const lastItem = parent[parent.length - 1];
        if (lastItem && !lastItem.children) {
          lastItem.children = [];
        }
        if (lastItem) {
          stack.push({ indent, items: lastItem.children! });
        }
      }

      stack[stack.length - 1].items.push(newItem);
      continue;
    }

    if (currentList) flushList();
    if (currentChecklist) flushChecklist();
    paragraphLines.push(rawLine);
  }

  flushParagraph();
  flushList();
  flushChecklist();
  if (inCodeBlock) flushCodeBlock();

  // Post-process: merge consecutive image-only paragraphs into galleries
  return mergeConsecutiveImages(nodes);
}

function parseInlineMarkdown(text: string, depth = 0, insideLink = false): MarkdownInlineNode[] {
  if (!text) return [];
  const maxDepth = 10;

  const nodes: MarkdownInlineNode[] = [];
  let buffer = "";

  const pushText = (value: string) => {
    if (!value) return;
    const prev = nodes[nodes.length - 1];
    if (prev?.type === "text") {
      prev.content += value;
      return;
    }
    nodes.push({ type: "text", content: value });
  };

  const flushBuffer = () => {
    if (!buffer) return;
    pushText(buffer);
    buffer = "";
  };

  for (let i = 0; i < text.length; ) {
    const ch = text[i];

    // Escape sequence: keep the escaped char verbatim.
    if (ch === "\\" && i + 1 < text.length) {
      const next = text[i + 1];
      if (next === "\\" || next === "*" || next === "`" || next === "[" || next === "]" || next === "(" || next === ")") {
        buffer += next;
        i += 2;
        continue;
      }
    }

    // Inline code: `...`
    if (ch === "`") {
      const end = text.indexOf("`", i + 1);
      if (end !== -1) {
        flushBuffer();
        nodes.push({ type: "code", content: text.slice(i + 1, end) });
        i = end + 1;
        continue;
      }
    }

    // Image: ![alt](url) - must check before link since it starts with !
    if (ch === "!" && text[i + 1] === "[") {
      const closeBracket = text.indexOf("]", i + 2);
      if (closeBracket !== -1 && text[closeBracket + 1] === "(") {
        const closeParen = text.indexOf(")", closeBracket + 2);
        if (closeParen !== -1) {
          const alt = text.slice(i + 2, closeBracket);
          const src = text.slice(closeBracket + 2, closeParen);
          flushBuffer();
          nodes.push({
            type: "image",
            src,
            alt,
          });
          i = closeParen + 1;
          continue;
        }
      }
    }

    // Link: [label](url) - but not if we're already inside a link
    if (ch === "[" && !insideLink) {
      const closeBracket = text.indexOf("]", i + 1);
      if (closeBracket !== -1 && text[closeBracket + 1] === "(") {
        const closeParen = text.indexOf(")", closeBracket + 2);
        if (closeParen !== -1) {
          const label = text.slice(i + 1, closeBracket);
          const url = text.slice(closeBracket + 2, closeParen);
          flushBuffer();
          nodes.push({
            type: "link",
            url,
            children: depth < maxDepth ? parseInlineMarkdown(label, depth + 1, true) : [{ type: "text", content: label }],
          });
          i = closeParen + 1;
          continue;
        }
      }
    }

    // Bold: **...**
    if (text.startsWith("**", i)) {
      const end = text.indexOf("**", i + 2);
      if (end !== -1) {
        const inner = text.slice(i + 2, end);
        flushBuffer();
        nodes.push({
          type: "bold",
          children: depth < maxDepth ? parseInlineMarkdown(inner, depth + 1, insideLink) : [{ type: "text", content: inner }],
        });
        i = end + 2;
        continue;
      }
    }

    // Italic: *...*
    if (ch === "*") {
      const prevCh = i > 0 ? text[i - 1] : "";
      const nextCh = i + 1 < text.length ? text[i + 1] : "";
      const couldBeItalic = prevCh !== "*" && nextCh !== "*";
      if (!couldBeItalic) {
        buffer += ch;
        i += 1;
        continue;
      }

      const end = text.indexOf("*", i + 1);
      if (end !== -1) {
        const inner = text.slice(i + 1, end);
        const isLikelyItalic =
          inner.length > 0 && inner.trim() !== "" && !/^\s/.test(inner) && !/\s$/.test(inner);
        if (isLikelyItalic) {
          flushBuffer();
          nodes.push({
            type: "italic",
            children: depth < maxDepth ? parseInlineMarkdown(inner, depth + 1, insideLink) : [{ type: "text", content: inner }],
          });
          i = end + 1;
          continue;
        }
      }
    }

    // Block ID reference: "blockid:123" format (only outside of links)
    // This is the preferred format for AI to return block references
    if (!insideLink) {
      // Handle orca-block:123 format (direct block reference)
      const orcaBlockMatch = text.slice(i).match(/^orca-block:(\d+)/i);
      if (orcaBlockMatch) {
        const blockId = parseInt(orcaBlockMatch[1], 10);
        if (blockId > 0) {
          flushBuffer();
          nodes.push({
            type: "link",
            url: `orca-block:${blockId}`,
            children: [{ type: "text", content: `${blockId}` }],
          });
          i += orcaBlockMatch[0].length;
          continue;
        }
      }

      // Handle blockid:123 or blockid 123 format (with optional colon/space)
      const blockIdMatch = text.slice(i).match(/^blockid[:：\s]*(\d+)/i);
      if (blockIdMatch) {
        const blockId = parseInt(blockIdMatch[1], 10);
        if (blockId > 0) {
          flushBuffer();
          nodes.push({
            type: "link",
            url: `orca-block:${blockId}`,
            children: [{ type: "text", content: `块 ID: ${blockId}` }],
          });
          i += blockIdMatch[0].length;
          continue;
        }
      }

      // Block reference: "block #123", "Block 123", "块 #123", "笔记 #123", "(block #123)"
      // Convert to clickable orca-block links at AST level (safe from code block pollution)
      const blockRefMatch = text.slice(i).match(/^(?:\(?\s*)(?:block|Block|块|笔记)\s*#?(\d+)(?:\s*\)?)/);
      if (blockRefMatch) {
        const blockId = parseInt(blockRefMatch[1], 10);
        if (blockId > 0) {
          flushBuffer();
          nodes.push({
            type: "link",
            url: `orca-block:${blockId}`,
            children: [{ type: "text", content: blockRefMatch[0].trim() }],
          });
          i += blockRefMatch[0].length;
          continue;
        }
      }

      // Fallback: [数字] format - AI sometimes uses this despite instructions
      // Only match if it looks like a block ID (reasonable range: 3+ digits)
      // and not part of a markdown link (no following parenthesis)
      const bracketNumMatch = text.slice(i).match(/^\[(\d{3,})\](?!\()/);
      if (bracketNumMatch) {
        const blockId = parseInt(bracketNumMatch[1], 10);
        if (blockId > 0) {
          flushBuffer();
          nodes.push({
            type: "link",
            url: `orca-block:${blockId}`,
            children: [{ type: "text", content: `${blockId}` }],
          });
          i += bracketNumMatch[0].length;
          continue;
        }
      }
    }

    buffer += ch;
    i += 1;
  }

  flushBuffer();
  return nodes;
}
