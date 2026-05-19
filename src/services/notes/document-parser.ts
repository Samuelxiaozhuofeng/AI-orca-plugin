/**
 * Document Parser Service
 * 解析 PDF、Word、Excel、PPTX 等文档格式
 * 使用动态导入实现按需加载
 * 
 * 设计思路借鉴 markitdown：输出结构化 Markdown 而非纯文本
 * - Word: mammoth → HTML → Markdown（保留标题/列表/表格/链接）
 * - Excel: 生成 Markdown 表格（保留数据结构）
 * - PPTX: JSZip 解压 + XML 解析（提取幻灯片内容）
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
 * 解析 PPTX 文件 (.pptx)
 * PPTX 本质是 ZIP 文件，包含 XML 格式的幻灯片内容
 * 不需要新依赖：JSZip 已在 xlsx 库中内置
 */
export async function parsePptx(arrayBuffer: ArrayBuffer, fileName: string): Promise<string> {
  try {
    // xlsx 内置了 JSZip，我们通过它读取 ZIP
    const XLSX = await import("xlsx");
    // @ts-ignore xlsx 内部使用 JSZip，通过 cfb/zip 读取
    const zip = XLSX.read(arrayBuffer, { type: "array", bookSheets: true });

    // 直接使用 JSZip 来解析 PPTX
    // 由于 xlsx 的 JSZip 不直接暴露，我们手动解析 ZIP 结构
    // 改用更可靠的方式：用原生方式解析 PPTX XML
    return await parsePptxFromZip(arrayBuffer, fileName);
  } catch (error) {
    console.error("[document-parser] PPTX parse error:", error);
    return `[PPTX文件: ${fileName}] (解析失败: ${error})`;
  }
}

/**
 * 从 PPTX ZIP 中提取幻灯片文本
 * PPTX 结构：
 *   ppt/slides/slide1.xml, slide2.xml, ...
 *   每个 slide XML 中 <a:t> 标签包含文本
 */
async function parsePptxFromZip(arrayBuffer: ArrayBuffer, fileName: string): Promise<string> {
  // 使用 Blob + Response 解压 ZIP（浏览器兼容方式）
  // 注：如果环境支持 DecompressionStream，可以直接解压
  // 这里使用简单的 ZIP 解析器
  const zipEntries = parseZipEntries(new Uint8Array(arrayBuffer));

  // 找到所有 slide 文件
  const slideEntries = zipEntries
    .filter((e) => /^ppt\/slides\/slide\d+\.xml$/i.test(e.name))
    .sort((a, b) => {
      const numA = parseInt(a.name.match(/slide(\d+)/)?.[1] || "0");
      const numB = parseInt(b.name.match(/slide(\d+)/)?.[1] || "0");
      return numA - numB;
    });

  if (slideEntries.length === 0) {
    return `[PPTX文件: ${fileName}] (未找到幻灯片内容)`;
  }

  const slides: string[] = [];
  const decoder = new TextDecoder("utf-8");

  for (const entry of slideEntries) {
    const xml = decoder.decode(entry.data);
    const slideNum = entry.name.match(/slide(\d+)/)?.[1] || "?";

    // 解析 XML 提取文本
    const doc = new DOMParser().parseFromString(xml, "application/xml");

    // 提取所有文本段落 <a:p> → 包含 <a:r>/<a:t>
    const paragraphs: string[] = [];
    const pElements = doc.querySelectorAll("p");

    for (const p of pElements) {
      // 收集段落内所有 <a:t> 文本
      const texts: string[] = [];
      const tElements = p.querySelectorAll("t");
      for (const t of tElements) {
        const text = t.textContent?.trim();
        if (text) texts.push(text);
      }

      if (texts.length > 0) {
        const line = texts.join("");
        paragraphs.push(line);
      }
    }

    if (paragraphs.length > 0) {
      // 第一行通常是标题
      const title = paragraphs[0];
      const body = paragraphs.slice(1).join("\n");
      slides.push(`### Slide ${slideNum}: ${title}${body ? "\n" + body : ""}`);
    }
  }

  if (slides.length === 0) {
    return `[PPTX文件: ${fileName}] (幻灯片内容为空)`;
  }

  return `[PPTX文件: ${fileName}, ${slides.length}页]\n\n${slides.join("\n\n")}`;
}

/**
 * 简易 ZIP 解析器（不需要外部依赖）
 * 只支持 Stored 和 Deflate 压缩方式，足够处理 Office XML 文件
 */
interface ZipEntry {
  name: string;
  data: Uint8Array;
}

function parseZipEntries(data: Uint8Array): ZipEntry[] {
  const entries: ZipEntry[] = [];
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  let offset = 0;

  while (offset < data.length - 4) {
    const sig = view.getUint32(offset, true);
    if (sig !== 0x04034b50) break; // Local file header signature

    const compressionMethod = view.getUint16(offset + 8, true);
    const compressedSize = view.getUint32(offset + 18, true);
    const uncompressedSize = view.getUint32(offset + 22, true);
    const fileNameLen = view.getUint16(offset + 26, true);
    const extraLen = view.getUint16(offset + 28, true);

    const nameBytes = data.slice(offset + 30, offset + 30 + fileNameLen);
    const name = new TextDecoder().decode(nameBytes);

    const dataStart = offset + 30 + fileNameLen + extraLen;
    const rawData = data.slice(dataStart, dataStart + compressedSize);

    // 只处理我们需要的 XML 文件
    if (name.endsWith(".xml") || name.endsWith(".rels")) {
      try {
        let fileData: Uint8Array;
        if (compressionMethod === 0) {
          // Stored (无压缩)
          fileData = rawData;
        } else if (compressionMethod === 8) {
          // Deflate - 使用 DecompressionStream（现代浏览器支持）
          fileData = decompressDeflateSync(rawData, uncompressedSize);
        } else {
          offset = dataStart + compressedSize;
          continue;
        }
        entries.push({ name, data: fileData });
      } catch (e) {
        console.warn(`[document-parser] Failed to decompress ${name}:`, e);
      }
    }

    offset = dataStart + compressedSize;
  }

  return entries;
}

/**
 * 同步 Deflate 解压（使用 pako-lite 风格的原始 inflate）
 * 浏览器环境可用 DecompressionStream 但它是异步的
 * 这里用简易方式：先尝试 DecompressionStream polyfill，失败则跳过
 */
function decompressDeflateSync(compressed: Uint8Array, expectedSize: number): Uint8Array {
  // 使用 Response + DecompressionStream（现代浏览器原生支持）
  // 但由于是同步上下文，这里用一个小技巧：
  // 构造一个包含 zlib header 的流来利用浏览器的解压能力
  // 实际上在同步环境中，我们直接返回原始数据让 DOMParser 尝试解析
  // 对于大多数 PPTX 文件，XML 通常是 Deflate 压缩的
  
  // 简易 inflate 实现（基于 RFC 1951）
  return inflateRaw(compressed, expectedSize);
}

/** 最小化 Deflate (raw) 解压实现 */
function inflateRaw(src: Uint8Array, outSize: number): Uint8Array {
  const out = new Uint8Array(outSize);
  let sPos = 0; // source bit position
  let oPos = 0; // output byte position

  function readBits(n: number): number {
    let val = 0;
    for (let i = 0; i < n; i++) {
      const byteIdx = sPos >> 3;
      const bitIdx = sPos & 7;
      if (byteIdx < src.length) {
        val |= ((src[byteIdx] >> bitIdx) & 1) << i;
      }
      sPos++;
    }
    return val;
  }

  // Huffman 解码表
  function buildHuffmanTable(lengths: number[]): { code: number; len: number }[][] {
    const maxBits = Math.max(...lengths.filter((l) => l > 0));
    const table: { code: number; len: number }[][] = [];
    for (let i = 0; i <= maxBits; i++) table.push([]);
    
    const blCount = new Array(maxBits + 1).fill(0);
    for (const l of lengths) if (l > 0) blCount[l]++;
    
    const nextCode = new Array(maxBits + 1).fill(0);
    let code = 0;
    for (let bits = 1; bits <= maxBits; bits++) {
      code = (code + blCount[bits - 1]) << 1;
      nextCode[bits] = code;
    }
    
    for (let n = 0; n < lengths.length; n++) {
      const len = lengths[n];
      if (len > 0) {
        table[len].push({ code: nextCode[len], len: n });
        nextCode[len]++;
      }
    }
    return table;
  }

  function decodeSymbol(table: { code: number; len: number }[][]): number {
    let code = 0;
    for (let bits = 1; bits < table.length; bits++) {
      code = (code << 1) | readBits(1);
      for (const entry of table[bits]) {
        if (entry.code === code) return entry.len;
      }
    }
    return -1;
  }

  const LENS_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15];

  // 固定 Huffman 表
  function fixedLitLenTable(): { code: number; len: number }[][] {
    const lengths = new Array(288);
    for (let i = 0; i <= 143; i++) lengths[i] = 8;
    for (let i = 144; i <= 255; i++) lengths[i] = 9;
    for (let i = 256; i <= 279; i++) lengths[i] = 7;
    for (let i = 280; i <= 287; i++) lengths[i] = 8;
    return buildHuffmanTable(lengths);
  }

  function fixedDistTable(): { code: number; len: number }[][] {
    const lengths = new Array(32).fill(5);
    return buildHuffmanTable(lengths);
  }

  const LEN_BASE = [3,4,5,6,7,8,9,10,11,13,15,17,19,23,27,31,35,43,51,59,67,83,99,115,131,163,195,227,258];
  const LEN_EXTRA = [0,0,0,0,0,0,0,0,1,1,1,1,2,2,2,2,3,3,3,3,4,4,4,4,5,5,5,5,0];
  const DIST_BASE = [1,2,3,4,5,7,9,13,17,25,33,49,65,97,129,193,257,385,513,769,1025,1537,2049,3073,4097,6145,8193,12289,16385,24577];
  const DIST_EXTRA = [0,0,0,0,1,1,2,2,3,3,4,4,5,5,6,6,7,7,8,8,9,9,10,10,11,11,12,12,13,13];

  let bFinal = 0;
  while (!bFinal && oPos < outSize) {
    bFinal = readBits(1);
    const bType = readBits(2);

    if (bType === 0) {
      // 无压缩块
      sPos = ((sPos + 7) >> 3) << 3; // align to byte
      const len = readBits(16);
      readBits(16); // nlen (complement)
      const byteStart = sPos >> 3;
      for (let i = 0; i < len && oPos < outSize; i++) {
        out[oPos++] = src[byteStart + i];
      }
      sPos = (byteStart + len) << 3;
    } else {
      let litLenTable: { code: number; len: number }[][];
      let distTable: { code: number; len: number }[][];

      if (bType === 1) {
        litLenTable = fixedLitLenTable();
        distTable = fixedDistTable();
      } else {
        // Dynamic Huffman
        const hLit = readBits(5) + 257;
        const hDist = readBits(5) + 1;
        const hCLen = readBits(4) + 4;

        const codeLengths = new Array(19).fill(0);
        for (let i = 0; i < hCLen; i++) {
          codeLengths[LENS_ORDER[i]] = readBits(3);
        }
        const codeTable = buildHuffmanTable(codeLengths);

        const allLengths: number[] = [];
        while (allLengths.length < hLit + hDist) {
          const sym = decodeSymbol(codeTable);
          if (sym < 16) {
            allLengths.push(sym);
          } else if (sym === 16) {
            const repeat = readBits(2) + 3;
            const last = allLengths[allLengths.length - 1] || 0;
            for (let i = 0; i < repeat; i++) allLengths.push(last);
          } else if (sym === 17) {
            const repeat = readBits(3) + 3;
            for (let i = 0; i < repeat; i++) allLengths.push(0);
          } else if (sym === 18) {
            const repeat = readBits(7) + 11;
            for (let i = 0; i < repeat; i++) allLengths.push(0);
          }
        }

        litLenTable = buildHuffmanTable(allLengths.slice(0, hLit));
        distTable = buildHuffmanTable(allLengths.slice(hLit, hLit + hDist));
      }

      while (oPos < outSize) {
        const sym = decodeSymbol(litLenTable);
        if (sym < 0 || sym === 256) break;
        if (sym < 256) {
          out[oPos++] = sym;
        } else {
          const lenIdx = sym - 257;
          const length = LEN_BASE[lenIdx] + readBits(LEN_EXTRA[lenIdx]);
          const distIdx = decodeSymbol(distTable);
          const distance = DIST_BASE[distIdx] + readBits(DIST_EXTRA[distIdx]);
          for (let i = 0; i < length && oPos < outSize; i++) {
            out[oPos] = out[oPos - distance];
            oPos++;
          }
        }
      }
    }
  }

  return out.slice(0, oPos);
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

  // PPTX
  if (ext === "pptx" || mimeType.includes("presentationml")) {
    return parsePptx(arrayBuffer, fileName);
  }

  // PDF
  if (ext === "pdf" || mimeType === "application/pdf") {
    return parsePdf(arrayBuffer, fileName);
  }

  return null;
}
