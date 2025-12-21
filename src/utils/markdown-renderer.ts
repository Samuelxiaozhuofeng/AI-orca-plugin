export type MarkdownInlineNode =
  | { type: "text"; content: string }
  | { type: "bold"; children: MarkdownInlineNode[] }
  | { type: "italic"; children: MarkdownInlineNode[] }
  | { type: "code"; content: string }
  | { type: "link"; url: string; children: MarkdownInlineNode[] }
  | { type: "break" };

export type MarkdownNode =
  | { type: "paragraph"; children: MarkdownInlineNode[] }
  | { type: "heading"; level: number; children: MarkdownInlineNode[] }
  | { type: "list"; ordered: boolean; items: MarkdownInlineNode[][] }
  | { type: "quote"; children: MarkdownNode[] }
  | { type: "codeblock"; content: string; language?: string };

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

  const flushCodeBlock = () => {
    if (!inCodeBlock) return;
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

    // Lists (group consecutive items)
    const orderedMatch = rawLine.match(/^\s*(\d+)\.\s+(.*)$/);
    const unorderedMatch = rawLine.match(/^\s*([-*+])\s+(.*)$/);
    if (orderedMatch || unorderedMatch) {
      flushParagraph();
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
    paragraphLines.push(rawLine);
  }

  flushParagraph();
  flushList();
  if (inCodeBlock) flushCodeBlock();

  return nodes;
}

function parseInlineMarkdown(text: string, depth = 0): MarkdownInlineNode[] {
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

    // Link: [label](url)
    if (ch === "[") {
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
            children: depth < maxDepth ? parseInlineMarkdown(label, depth + 1) : [{ type: "text", content: label }],
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
          children: depth < maxDepth ? parseInlineMarkdown(inner, depth + 1) : [{ type: "text", content: inner }],
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
            children: depth < maxDepth ? parseInlineMarkdown(inner, depth + 1) : [{ type: "text", content: inner }],
          });
          i = end + 1;
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
