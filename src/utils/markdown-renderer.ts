export type MarkdownInlineNode =
  | { type: "text"; content: string }
  | { type: "bold"; children: MarkdownInlineNode[] }
  | { type: "italic"; children: MarkdownInlineNode[] }
  | { type: "code"; content: string }
  | { type: "link"; url: string; children: MarkdownInlineNode[] }
  | { type: "break" };

export type TableAlignment = "left" | "center" | "right" | null;

export type TaskPriority = "high" | "medium" | "low" | null;
export type TaskStatus = "todo" | "done" | "in-progress" | "cancelled";

export type CheckboxItem = {
  checked: boolean;
  children: MarkdownInlineNode[];
};

export type TaskCardData = {
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate?: string;
  tags: string[];
  blockId?: number;
};

export type MarkdownNode =
  | { type: "paragraph"; children: MarkdownInlineNode[] }
  | { type: "heading"; level: number; children: MarkdownInlineNode[] }
  | { type: "list"; ordered: boolean; items: MarkdownInlineNode[][] }
  | { type: "checklist"; items: CheckboxItem[] }
  | { type: "taskcard"; task: TaskCardData }
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
 * Parse task card from special format:
 * ```task
 * title: Task title
 * status: todo|done|in-progress|cancelled
 * priority: high|medium|low
 * due: 2024-01-01
 * tags: #tag1, #tag2
 * block: 1234
 * ```
 * Or detect from content patterns
 */
function parseTaskCard(content: string): TaskCardData | null {
  const lines = content.trim().split("\n");
  const task: TaskCardData = {
    title: "",
    status: "todo",
    priority: null,
    tags: [],
  };

  for (const line of lines) {
    const [key, ...valueParts] = line.split(":");
    const value = valueParts.join(":").trim();
    
    switch (key.trim().toLowerCase()) {
      case "title":
        task.title = value;
        break;
      case "status":
        if (["todo", "done", "in-progress", "cancelled"].includes(value.toLowerCase())) {
          task.status = value.toLowerCase() as TaskStatus;
        }
        break;
      case "priority":
        if (["high", "medium", "low"].includes(value.toLowerCase())) {
          task.priority = value.toLowerCase() as TaskPriority;
        }
        break;
      case "due":
        task.dueDate = value;
        break;
      case "tags":
        task.tags = value.split(",").map(t => t.trim()).filter(Boolean);
        break;
      case "block":
        const blockId = parseInt(value, 10);
        if (blockId > 0) task.blockId = blockId;
        break;
    }
  }

  return task.title ? task : null;
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

  const lines = normalizeNewlines(text).split("\n");
  const nodes: MarkdownNode[] = [];

  let inCodeBlock = false;
  let codeBlockLang = "";
  let codeBlockLines: string[] = [];

  let paragraphLines: string[] = [];
  let currentList: { ordered: boolean; items: MarkdownInlineNode[][] } | null = null;
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
    nodes.push({
      type: "list",
      ordered: currentList.ordered,
      items: currentList.items,
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
    
    // Check if it's a task code block
    if (codeBlockLang.toLowerCase() === "task") {
      const taskData = parseTaskCard(codeBlockLines.join("\n"));
      if (taskData) {
        nodes.push({
          type: "taskcard",
          task: taskData,
        });
        inCodeBlock = false;
        codeBlockLang = "";
        codeBlockLines = [];
        return;
      }
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

    // Lists (group consecutive items)
    const orderedMatch = rawLine.match(/^\s*(\d+)\.\s+(.*)$/);
    const unorderedMatch = rawLine.match(/^\s*([-*+])\s+(.*)$/);
    if (orderedMatch || unorderedMatch) {
      flushParagraph();
      flushChecklist();
      const ordered = !!orderedMatch;
      const itemText = (orderedMatch ? orderedMatch[2] : unorderedMatch?.[2]) ?? "";

      if (!currentList || currentList.ordered !== ordered) {
        flushList();
        currentList = { ordered, items: [] };
      }

      currentList.items.push(parseInlineMarkdown(itemText));
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

  return nodes;
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
      const blockIdMatch = text.slice(i).match(/^blockid:(\d+)/i);
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
    }

    buffer += ch;
    i += 1;
  }

  flushBuffer();
  return nodes;
}
