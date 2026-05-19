/**
 * HTML to Markdown Converter
 * 使用浏览器原生 DOMParser 递归遍历 DOM 树生成 Markdown
 * 借鉴 markitdown 的设计思路，保留文档结构（标题、列表、表格、链接等）
 */

/**
 * 将 HTML 字符串转换为 Markdown
 */
export function htmlToMarkdown(html: string): string {
  if (!html || !html.trim()) return "";

  const doc = new DOMParser().parseFromString(html, "text/html");

  // 优先使用 <article>、<main> 或 <body>
  const root =
    doc.querySelector("article") ||
    doc.querySelector("main") ||
    doc.body;

  if (!root) return "";

  const md = processNode(root, { listDepth: 0, ordered: false, index: 0 });

  // 清理：合并连续空行为最多两个换行
  return md
    .replace(/[ \t]+$/gm, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ─── internal ────────────────────────────────────────────────────────────────

interface Ctx {
  listDepth: number;
  ordered: boolean;
  index: number;
}

function processChildren(el: Node, ctx: Ctx): string {
  let out = "";
  el.childNodes.forEach((child) => {
    out += processNode(child, ctx);
  });
  return out;
}

function processNode(node: Node, ctx: Ctx): string {
  // 文本节点
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent ?? "";
  }

  if (node.nodeType !== Node.ELEMENT_NODE) return "";

  const el = node as HTMLElement;
  const tag = el.tagName.toLowerCase();

  // 跳过不需要的标签
  if (["script", "style", "noscript", "nav", "footer", "header"].includes(tag)) {
    return "";
  }

  const children = () => processChildren(el, ctx);

  switch (tag) {
    // ── 标题 ──
    case "h1": return `\n\n# ${children().trim()}\n\n`;
    case "h2": return `\n\n## ${children().trim()}\n\n`;
    case "h3": return `\n\n### ${children().trim()}\n\n`;
    case "h4": return `\n\n#### ${children().trim()}\n\n`;
    case "h5": return `\n\n##### ${children().trim()}\n\n`;
    case "h6": return `\n\n###### ${children().trim()}\n\n`;

    // ── 段落 / 换行 ──
    case "p":
      return `\n\n${children().trim()}\n\n`;
    case "br":
      return "\n";

    // ── 行内格式 ──
    case "strong":
    case "b": {
      const inner = children().trim();
      return inner ? `**${inner}**` : "";
    }
    case "em":
    case "i": {
      const inner = children().trim();
      return inner ? `*${inner}*` : "";
    }
    case "del":
    case "s": {
      const inner = children().trim();
      return inner ? `~~${inner}~~` : "";
    }
    case "code": {
      // 如果父元素是 pre，由 pre 处理
      if (el.parentElement?.tagName.toLowerCase() === "pre") {
        return el.textContent ?? "";
      }
      const inner = el.textContent ?? "";
      return inner ? `\`${inner}\`` : "";
    }
    case "mark": {
      const inner = children().trim();
      return inner ? `==${inner}==` : "";
    }

    // ── 代码块 ──
    case "pre": {
      const codeEl = el.querySelector("code");
      let lang = "";
      if (codeEl?.className) {
        const m = codeEl.className.match(/language-(\w+)/);
        if (m) lang = m[1];
      }
      const code = (codeEl?.textContent ?? el.textContent ?? "").replace(/\n+$/, "");
      return `\n\n\`\`\`${lang}\n${code}\n\`\`\`\n\n`;
    }

    // ── 引用 ──
    case "blockquote": {
      const inner = children().trim();
      const quoted = inner.split("\n").map((line) => `> ${line}`).join("\n");
      return `\n\n${quoted}\n\n`;
    }

    // ── 链接 ──
    case "a": {
      const href = el.getAttribute("href") || "";
      const text = children().trim();
      if (!text) return "";
      if (!href || href.startsWith("#") || href === "javascript:void(0)") return text;
      return `[${text}](${href})`;
    }

    // ── 图片 ──
    case "img": {
      const alt = el.getAttribute("alt") || "image";
      const src = el.getAttribute("src") || "";
      return src ? `![${alt}](${src})` : "";
    }

    // ── 列表 ──
    case "ul": {
      let result = "\n";
      let idx = 0;
      el.childNodes.forEach((child) => {
        if ((child as HTMLElement).tagName?.toLowerCase() === "li") {
          result += processNode(child, { listDepth: ctx.listDepth + 1, ordered: false, index: idx });
          idx++;
        }
      });
      return result + (ctx.listDepth === 0 ? "\n" : "");
    }
    case "ol": {
      let result = "\n";
      let idx = 0;
      el.childNodes.forEach((child) => {
        if ((child as HTMLElement).tagName?.toLowerCase() === "li") {
          result += processNode(child, { listDepth: ctx.listDepth + 1, ordered: true, index: idx });
          idx++;
        }
      });
      return result + (ctx.listDepth === 0 ? "\n" : "");
    }
    case "li": {
      const indent = "  ".repeat(Math.max(0, ctx.listDepth - 1));
      const marker = ctx.ordered ? `${ctx.index + 1}. ` : "- ";
      const inner = processChildren(el, ctx).trim();
      return `${indent}${marker}${inner}\n`;
    }

    // ── 表格 ──
    case "table":
      return "\n\n" + convertTable(el) + "\n\n";

    // ── 水平线 ──
    case "hr":
      return "\n\n---\n\n";

    // ── 透传容器 ──
    case "div":
    case "section":
    case "article":
    case "main":
    case "span":
    case "figure":
    case "figcaption":
    case "details":
    case "summary":
    case "tbody":
    case "thead":
    case "tfoot":
    case "tr":
    case "th":
    case "td":
      return children();

    default:
      return children();
  }
}

// ─── 表格转换 ────────────────────────────────────────────────────────────────

function convertTable(tableEl: HTMLElement): string {
  const rows: string[][] = [];
  let hasHeader = false;

  // 提取表头
  const thead = tableEl.querySelector("thead");
  if (thead) {
    thead.querySelectorAll("tr").forEach((tr) => {
      const cells = extractRowCells(tr);
      if (cells.length > 0) {
        rows.push(cells);
        hasHeader = true;
      }
    });
  }

  // 提取表体
  const bodies = tableEl.querySelectorAll("tbody");
  if (bodies.length > 0) {
    bodies.forEach((tbody) => {
      tbody.querySelectorAll("tr").forEach((tr) => {
        rows.push(extractRowCells(tr));
      });
    });
  } else {
    // 没有 tbody，直接取 tr（跳过 thead 里已处理的）
    tableEl.querySelectorAll(":scope > tr").forEach((tr) => {
      rows.push(extractRowCells(tr));
    });
  }

  if (rows.length === 0) return "";

  // 如果没有 thead 但第一行包含 th，视为表头
  if (!hasHeader) {
    const firstRow = tableEl.querySelector("tr");
    if (firstRow && firstRow.querySelector("th")) {
      hasHeader = true;
    }
  }

  // 对齐列数
  const maxCols = Math.max(...rows.map((r) => r.length));
  rows.forEach((row) => {
    while (row.length < maxCols) row.push("");
  });

  // 构建 Markdown 表格
  const lines: string[] = [];
  lines.push("| " + rows[0].join(" | ") + " |");
  lines.push("| " + rows[0].map(() => "---").join(" | ") + " |");
  for (let i = 1; i < rows.length; i++) {
    lines.push("| " + rows[i].join(" | ") + " |");
  }

  return lines.join("\n");
}

function extractRowCells(tr: Element): string[] {
  const cells: string[] = [];
  tr.querySelectorAll("th, td").forEach((cell) => {
    let text = (cell.textContent ?? "").replace(/\s+/g, " ").trim();
    // 移除引用标记 [1], [2] 等
    text = text.replace(/\[\d+\]/g, "");
    // 转义管道符
    text = text.replace(/\|/g, "\\|");

    const colspan = parseInt(cell.getAttribute("colspan") || "1", 10);
    cells.push(text);
    for (let i = 1; i < colspan; i++) {
      cells.push("");
    }
  });
  return cells;
}
