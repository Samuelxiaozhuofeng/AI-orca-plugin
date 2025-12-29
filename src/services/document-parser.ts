/**
 * Document Parser Service
 * 解析 PDF、Word、Excel 等文档格式
 * 使用动态导入实现按需加载
 */

/**
 * 解析 Excel 文件 (.xlsx, .xls)
 */
export async function parseExcel(arrayBuffer: ArrayBuffer, fileName: string): Promise<string> {
  try {
    const XLSX = await import("xlsx");
    const workbook = XLSX.read(arrayBuffer, { type: "array" });
    const results: string[] = [];

    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const csv = XLSX.utils.sheet_to_csv(sheet);
      if (csv.trim()) {
        results.push(`## Sheet: ${sheetName}\n\`\`\`csv\n${csv}\n\`\`\``);
      }
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
 */
export async function parseWord(arrayBuffer: ArrayBuffer, fileName: string): Promise<string> {
  try {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ arrayBuffer });
    const text = result.value.trim();

    if (!text) {
      return `[Word文档: ${fileName}] (空文档或无法解析)`;
    }

    return `[Word文档: ${fileName}]\n\n${text}`;
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
