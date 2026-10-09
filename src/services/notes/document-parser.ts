/**
 * Document Parser Service
 * 解析 PDF、Word、Excel 文档格式
 * 使用动态导入实现按需加载
 * 
 * 设计思路借鉴 markitdown：输出结构化 Markdown 而非纯文本
 * - Word: mammoth → HTML → Markdown（保留标题/列表/表格/链接）
 * - Excel: 生成 Markdown 表格（保留数据结构）
 * - PDF: unpdf 提取文本（保持不变）
 */

import { htmlToMarkdown } from "../../utils/html-to-markdown";

/**
 * 解析 Excel 文件 (.xlsx, .xls)
 * 改进：生成 Markdown 表格代替 CSV，保留数据结构
 */
export async function parseExcel(arrayBuffer: ArrayBuffer, fileName: string): Promise<string> {
  try {
    const XLSX = await import("xlsx");
    const workbook = XLSX.read(arrayBuffer, { type: "array" });
    const results: string[] = [];

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const data: any[][] = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });

      if (!data || data.length === 0) continue;

      // 过滤全空行
      const rows = data.filter((row) => row.some((cell: any) => String(cell).trim() !== ""));
      if (rows.length === 0) continue;

      // 对齐列数
      const maxCols = Math.max(...rows.map((r) => r.length));
      const normalized = rows.map((row) => {
        const cells = [];
        for (let i = 0; i < maxCols; i++) {
          const val = row[i] ?? "";
          // 转义管道符，替换换行
          cells.push(String(val).replace(/\|/g, "\\|").replace(/\n/g, " "));
        }
        return cells;
      });

      // 构建 Markdown 表格
      const lines: string[] = [];
      // 表头
      lines.push("| " + normalized[0].join(" | ") + " |");
      lines.push("| " + normalized[0].map(() => "---").join(" | ") + " |");
      // 数据行
      for (let i = 1; i < normalized.length; i++) {
        lines.push("| " + normalized[i].join(" | ") + " |");
      }

      const table = lines.join("\n");
      results.push(
        workbook.SheetNames.length > 1
          ? `## Sheet: ${sheetName}\n\n${table}`
          : table
      );
    }

    if (results.length === 0) {
      return `[Excel文件: ${fileName}] (空文件或无法解析)`;
    }

    return `[Excel文件: ${fileName}]\n\n${results.join("\n\n")}`;
  } catch (error) {
    console.error("[document-parser] Excel parse error:", error);
    return `[Excel文件: ${fileName}] (解析失败: ${error})`;
  }
}

/**
 * 解析 Word 文档 (.docx)
 * 改进：使用 convertToHtml() 保留文档结构，再转为 Markdown
 */
export async function parseWord(arrayBuffer: ArrayBuffer, fileName: string): Promise<string> {
  try {
    const mammoth = await import("mammoth");
    const result = await mammoth.convertToHtml({ arrayBuffer });
    const html = result.value.trim();

    if (!html) {
      return `[Word文档: ${fileName}] (空文档或无法解析)`;
    }

    // HTML → Markdown，保留标题/列表/表格/链接等结构
    const markdown = htmlToMarkdown(html);

    if (!markdown) {
      // fallback: 如果 DOM 转换失败，使用纯文本
      const textResult = await mammoth.extractRawText({ arrayBuffer });
      return `[Word文档: ${fileName}]\n\n${textResult.value.trim()}`;
    }

    // 记录转换警告（如有）
    if (result.messages?.length > 0) {
      const warnings = result.messages
        .filter((m: any) => m.type === "warning")
        .map((m: any) => m.message);
      if (warnings.length > 0) {
        console.warn("[document-parser] Word conversion warnings:", warnings);
      }
    }

    return `[Word文档: ${fileName}]\n\n${markdown}`;
  } catch (error) {
    console.error("[document-parser] Word parse error:", error);
    return `[Word文档: ${fileName}] (解析失败: ${error})`;
  }
}

/**
 * 解析 PDF 文件
 * 注意：PDF 解析在某些环境下可能不稳定
 */
export async function parsePdf(arrayBuffer: ArrayBuffer, fileName: string): Promise<string> {
  try {
    const { extractText } = await import("unpdf");
    
    const result = await extractText(new Uint8Array(arrayBuffer));
    // result.text 可能是 string 或 string[]
    const textContent = Array.isArray(result.text) ? result.text.join("\n") : result.text;
    const text = textContent?.trim();

    if (!text) {
      return `[PDF文件: ${fileName}] (空文件或无法提取文本，可能是扫描版PDF)`;
    }

    const pageCount = result.totalPages || "未知";
    return `[PDF文件: ${fileName}, ${pageCount}页]\n\n${text}`;
  } catch (error: any) {
    console.error("[document-parser] PDF parse error:", error);
    // 如果解析失败，返回友好提示
    return `[PDF文件: ${fileName}] (PDF解析暂不可用，建议复制文本内容或转换为其他格式)`;
  }
}

/**
 * 根据文件类型解析文档
 */
export async function parseDocument(
  arrayBuffer: ArrayBuffer,
  fileName: string,
  mimeType: string
): Promise<string | null> {
  const ext = fileName.split(".").pop()?.toLowerCase();

  // Excel
  if (ext === "xlsx" || ext === "xls" || mimeType.includes("spreadsheet") || mimeType.includes("excel")) {
    return parseExcel(arrayBuffer, fileName);
  }

  // Word
  if (ext === "docx" || mimeType.includes("wordprocessingml")) {
    return parseWord(arrayBuffer, fileName);
  }

  // PDF
  if (ext === "pdf" || mimeType === "application/pdf") {
    return parsePdf(arrayBuffer, fileName);
  }

  return null;
}
