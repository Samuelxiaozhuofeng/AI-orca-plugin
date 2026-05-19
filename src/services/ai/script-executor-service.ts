/**
 * Script Executor Service for Orca AI Chat
 * 
 * 提供数据分析能力，让 AI 可以通过执行 JavaScript 代码来分析笔记数据。
 */

// 脚本执行结果
export interface ScriptExecutionResult {
  success: boolean;
  output: string;
  error?: string;
  executionTime: number;
}

// 脚本执行配置
export interface ScriptExecutorConfig {
  timeout: number;
}

const DEFAULT_CONFIG: ScriptExecutorConfig = {
  timeout: 30000,
};

let currentConfig: ScriptExecutorConfig = { ...DEFAULT_CONFIG };

export async function checkScriptEnvironment(): Promise<{
  available: boolean;
  version?: string;
  error?: string;
}> {
  return { available: true, version: "JavaScript (Browser)" };
}

/**
 * 在沙箱中执行 JavaScript 代码
 */
export async function executeScript(
  code: string,
  context: Record<string, any> = {}
): Promise<ScriptExecutionResult> {
  const startTime = Date.now();

  try {
    const outputs: string[] = [];
    
    const sandbox = {
      console: {
        log: (...args: any[]) => {
          outputs.push(args.map(arg => 
            typeof arg === "object" ? JSON.stringify(arg, null, 2) : String(arg)
          ).join(" "));
        },
        error: (...args: any[]) => {
          outputs.push("[ERROR] " + args.map(arg => 
            typeof arg === "object" ? JSON.stringify(arg, null, 2) : String(arg)
          ).join(" "));
        },
        warn: (...args: any[]) => {
          outputs.push("[WARN] " + args.map(arg => 
            typeof arg === "object" ? JSON.stringify(arg, null, 2) : String(arg)
          ).join(" "));
        },
      },
      JSON, Math, Date, Array, Object, String, Number, Boolean, RegExp,
      ...context,
    };

    const paramNames = Object.keys(sandbox);
    const paramValues = Object.values(sandbox);

    const sandboxedFn = new Function(...paramNames, `"use strict"; ${code}`);

    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error("执行超时")), currentConfig.timeout);
    });

    const executionPromise = new Promise<any>((resolve, reject) => {
      try {
        const result = sandboxedFn(...paramValues);
        if (result instanceof Promise) {
          result.then(resolve).catch(reject);
        } else {
          resolve(result);
        }
      } catch (e) {
        reject(e);
      }
    });

    const result = await Promise.race([executionPromise, timeoutPromise]);

    if (result !== undefined) {
      outputs.push(typeof result === "object" ? JSON.stringify(result, null, 2) : String(result));
    }

    return {
      success: true,
      output: outputs.join("\n"),
      executionTime: Date.now() - startTime,
    };
  } catch (e: any) {
    return {
      success: false,
      output: "",
      error: e.message || String(e),
      executionTime: Date.now() - startTime,
    };
  }
}


/**
 * 从 block.content 提取纯文本内容
 */
function extractBlockText(content: any): string {
  if (!content) return "";
  if (typeof content === "string") return content;
  
  if (Array.isArray(content)) {
    return content.map((fragment: any) => {
      if (!fragment) return "";
      if (typeof fragment.v === "string") return fragment.v;
      if (typeof fragment.v === "number") return String(fragment.v);
      if (fragment.v && typeof fragment.v === "object") {
        return fragment.v.text || fragment.v.title || fragment.v.name || "";
      }
      return "";
    }).join("");
  }
  
  try { return String(content); } catch { return ""; }
}

/**
 * 获取笔记数据用于分析（从内存）
 */
export async function getNotesDataForAnalysis(options: {
  maxBlocks?: number;
  includeContent?: boolean;
  includeMetadata?: boolean;
} = {}): Promise<{
  blocks: any[];
  totalCount: number;
  truncated: boolean;
}> {
  const { maxBlocks = 10000, includeContent = true, includeMetadata = true } = options;

  const allBlocks = orca.state.blocks;
  const blockIds = Object.keys(allBlocks).filter(id => !isNaN(Number(id)));
  
  const blocks: any[] = [];

  for (const id of blockIds) {
    if (blocks.length >= maxBlocks) break;
    
    const block = allBlocks[id];
    if (!block) continue;

    const blockData: any = { id: block.id };

    if (includeContent) {
      blockData.content = extractBlockText(block.content);
    }

    if (includeMetadata) {
      blockData.created = block.created;
      blockData.modified = block.modified;
      blockData.parent = block.parent;
      if (block.aliases && block.aliases.length > 0) {
        blockData.aliases = block.aliases;
      }
      if (block.properties && block.properties.length > 0) {
        blockData.properties = block.properties.map((p: any) => ({ name: p.name, value: p.value }));
      }
    }

    blocks.push(blockData);
  }

  return {
    blocks,
    totalCount: blockIds.length,
    truncated: blockIds.length > maxBlocks,
  };
}

/**
 * 统计笔记数据
 */
export async function analyzeNotesStats(): Promise<{
  totalBlocks: number;
  totalCharacters: number;
  totalWords: number;
  blocksByType: Record<string, number>;
  recentActivity: { today: number; thisWeek: number; thisMonth: number };
}> {
  const { blocks } = await getNotesDataForAnalysis();
  
  let totalCharacters = 0;
  let totalWords = 0;
  const blocksByType: Record<string, number> = {};
  
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const weekStart = todayStart - 7 * 24 * 60 * 60 * 1000;
  const monthStart = todayStart - 30 * 24 * 60 * 60 * 1000;
  
  let todayCount = 0, weekCount = 0, monthCount = 0;

  for (const block of blocks) {
    if (block.content) {
      totalCharacters += block.content.length;
      totalWords += block.content.split(/\s+/).filter((w: string) => w).length;
    }
    
    const type = block.type || "text";
    blocksByType[type] = (blocksByType[type] || 0) + 1;
    
    const modified = block.modified ? new Date(block.modified).getTime() : 0;
    if (modified >= todayStart) todayCount++;
    if (modified >= weekStart) weekCount++;
    if (modified >= monthStart) monthCount++;
  }

  return {
    totalBlocks: blocks.length,
    totalCharacters,
    totalWords,
    blocksByType,
    recentActivity: { today: todayCount, thisWeek: weekCount, thisMonth: monthCount },
  };
}


/**
 * 搜索关键词出现次数 - 使用 searchBlocksByText 获取真实数据
 */
export async function searchKeywordOccurrences(keyword: string): Promise<{
  keyword: string;
  totalOccurrences: number;
  blocksWithKeyword: number;
  topBlocks: Array<{ id: number; content: string; occurrences: number }>;
}> {
  // 动态导入 search-service
  const { searchBlocksByText } = await import("../notes/search-service");
  
  console.log(`[ScriptExecutor] Searching for keyword: "${keyword}"`);
  
  // 搜索包含关键词的块（最多200个）
  const searchResults = await searchBlocksByText(keyword, 200);
  
  console.log(`[ScriptExecutor] Found ${searchResults.length} blocks containing "${keyword}"`);
  
  // 转义正则特殊字符并创建正则
  function escapeRegex(str: string): string {
    return str.replace(/[.*+?^${}()|[\]\\]/g, (m) => "\\" + m);
  }
  const pattern = new RegExp(escapeRegex(keyword), "gi");
  
  let totalOccurrences = 0;
  const blockResults: Array<{ id: number; content: string; occurrences: number }> = [];

  for (const result of searchResults) {
    const content = result.fullContent || result.content || "";
    if (!content) continue;
    
    const matches = content.match(pattern);
    const count = matches ? matches.length : 0;
    
    if (count > 0) {
      totalOccurrences += count;
      blockResults.push({
        id: result.id,
        content: content.substring(0, 200) + (content.length > 200 ? "..." : ""),
        occurrences: count,
      });
    }
  }

  blockResults.sort((a, b) => b.occurrences - a.occurrences);

  return {
    keyword,
    totalOccurrences,
    blocksWithKeyword: blockResults.length,
    topBlocks: blockResults.slice(0, 10),
  };
}

/**
 * 词频统计
 */
export async function analyzeWordFrequency(topN: number = 50): Promise<{
  totalWords: number;
  uniqueWords: number;
  topWords: Array<{ word: string; count: number }>;
}> {
  const { blocks } = await getNotesDataForAnalysis();
  
  const wordCounts: Record<string, number> = {};
  let totalWords = 0;

  for (const block of blocks) {
    if (!block.content) continue;
    
    const words = block.content
      .split(/[\s\n\r\t,.!?;:'"()[\]{}，。！？；：""''（）【】《》]+/)
      .filter((w: string) => w.length > 1);
    
    for (const word of words) {
      const normalized = word.toLowerCase();
      wordCounts[normalized] = (wordCounts[normalized] || 0) + 1;
      totalWords++;
    }
  }

  const sortedWords = Object.entries(wordCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([word, count]) => ({ word, count }));

  return { totalWords, uniqueWords: Object.keys(wordCounts).length, topWords: sortedWords };
}

/**
 * 格式化执行结果
 */
export function formatExecutionResult(result: ScriptExecutionResult): string {
  if (!result.success) {
    return `❌ 分析执行失败\n\n**错误信息：**\n\`\`\`\n${result.error || "Unknown error"}\n\`\`\`\n\n**执行时间：** ${result.executionTime}ms`;
  }

  try {
    const jsonOutput = JSON.parse(result.output);
    return `✅ 分析完成\n\n**执行时间：** ${result.executionTime}ms\n\n**分析结果：**\n\`\`\`json\n${JSON.stringify(jsonOutput, null, 2)}\n\`\`\``;
  } catch {
    return `✅ 分析完成\n\n**执行时间：** ${result.executionTime}ms\n\n**输出：**\n\`\`\`\n${result.output}\n\`\`\``;
  }
}
