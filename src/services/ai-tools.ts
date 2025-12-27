/**
 * AI Tools for Orca AI Chat
 * This file defines the available tools for the AI model and their implementations.
 * It interacts with the Orca Host API to perform actions like searching, reading, 
 * and creating blocks.
 */

import type { OpenAITool } from "./openai-client";
import {
  searchBlocksByTag,
  searchBlocksByText,
  queryBlocksByTag,
  queryBlocksAdvanced,
  getTagSchema,
  getPageByName,
  searchBlocksByReference,
  getRecentJournals,
  getTodayJournal,
} from "./search-service";
import {
  formatBlockResult,
  addLinkPreservationNote
} from "../utils/block-link-enhancer";
import type { 
  QueryCondition, 
  QueryCombineMode 
} from "../utils/query-types";
import { uiStore } from "../store/ui-store";

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AI Tool Definitions (JSON Schema for OpenAI)
 * ═══════════════════════════════════════════════════════════════════════════
 */
export const TOOLS: OpenAITool[] = [
  {
    type: "function",
    function: {
      name: "searchBlocksByTag",
      description: `根据标签精准搜索笔记。支持搜索单个标签（如 #TODO）或多个标签。
使用建议：
- 用户问"有多少条X"时，用 countOnly:true 只返回数量
- 用户要"列出所有X"时，用 briefMode:true 返回简洁列表
- 用户要"详细看看"时，用默认模式返回完整内容
- 结果超过50条时，用 offset 分页获取更多`,
      parameters: {
        type: "object",
        properties: {
          tag_query: {
            type: "string",
            description: "标签查询字符串，如 '#tag1' 或 '#tag1 #tag2'",
          },
          maxResults: {
            type: "number",
            description: "返回的最大结果数（默认 20，最大 50）",
          },
          offset: {
            type: "number",
            description: "跳过前 N 条结果（用于分页，如 offset:50 获取第51-100条）",
          },
          countOnly: {
            type: "boolean",
            description: "仅返回总数统计，不返回内容（用于回答'有多少条'类问题）",
          },
          briefMode: {
            type: "boolean",
            description: "简洁模式：返回标题+摘要，不返回完整内容（用于列表概览）",
          },
        },
        required: ["tag_query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "searchBlocksByText",
      description: `全文搜索笔记内容。适合查找包含特定关键词或短语的笔记。
使用建议：
- 用户问"有多少条包含X的笔记"时，用 countOnly:true
- 用户要"列出包含X的笔记"时，用 briefMode:true
- 结果超过50条时，用 offset 分页`,
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "搜索关键词或短语",
          },
          maxResults: {
            type: "number",
            description: "返回的最大结果数（默认 20，最大 50）",
          },
          offset: {
            type: "number",
            description: "跳过前 N 条结果（用于分页）",
          },
          countOnly: {
            type: "boolean",
            description: "仅返回总数统计（用于回答'有多少条'类问题）",
          },
          briefMode: {
            type: "boolean",
            description: "简洁模式：返回标题+摘要（用于列表概览）",
          },
        },
        required: ["query"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query_blocks_by_tag",
      description: "使用标签和属性过滤器搜索笔记（高级搜索）。当你需要查找具有特定属性值的标签笔记时使用。例如，查找 #book 标签且 'status' 属性为 'reading' 的笔记。",
      parameters: {
        type: "object",
        properties: {
          tagName: {
            type: "string",
            description: "标签名称（不带 #）",
          },
          filters: {
            type: "array",
            description: "属性过滤器列表",
            items: {
              type: "object",
              properties: {
                name: { type: "string", description: "属性名称" },
                op: { 
                  type: "string", 
                  enum: ["==", "!=", ">", "<", ">=", "<=", "contains"],
                  description: "操作符" 
                },
                value: { 
                  type: ["string", "number", "boolean"], 
                  description: "属性值" 
                },
              },
              required: ["name", "op", "value"],
            },
          },
          maxResults: {
            type: "number",
            description: "最大结果数",
          },
        },
        required: ["tagName"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query_blocks",
      description: "组合多种条件进行复杂搜索。支持标签、文本、任务状态、日记范围等条件的 AND/OR 组合。这是最强大的搜索工具。",
      parameters: {
        type: "object",
        properties: {
          conditions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                type: { 
                  type: "string", 
                  enum: ["tag", "text", "task", "journal", "ref", "block", "blockMatch"] 
                },
                name: { type: "string", description: "标签名 (用于 type: tag)" },
                text: { type: "string", description: "关键词 (用于 type: text)" },
                completed: { type: "boolean", description: "任务完成状态 (用于 type: task)" },
                startOffset: { type: "number", description: "相对今天的起始天数，如 -7 表示 7 天前 (用于 type: journal)" },
                endOffset: { type: "number", description: "相对今天的结束天数，0 表示今天 (用于 type: journal)" },
                blockId: { type: "number", description: "目标块 ID (用于 type: ref/blockMatch)" },
                hasTags: { type: "boolean", description: "是否必须有标签 (用于 type: block)" },
              },
              required: ["type"],
            },
          },
          combineMode: {
            type: "string",
            enum: ["and", "or"],
            description: "条件组合方式，默认 'and'",
          },
          maxResults: {
            type: "number",
            description: "返回的最大结果数（默认 20，最大 50）",
          },
        },
        required: ["conditions"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getRecentJournals",
      description: "获取最近几天的日记条目。当你需要了解用户最近的动态、计划或记录时使用。",
      parameters: {
        type: "object",
        properties: {
          days: {
            type: "number",
            description: "追溯的天数（默认 7）",
          },
          includeChildren: {
            type: "boolean",
            description: "是否包含日记条目的子块（默认 true）",
          },
          maxResults: {
            type: "number",
            description: "最大结果数",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getTodayJournal",
      description: "获取今日日记的完整内容。当你需要了解用户今天的计划、记录或待办事项时使用。这是最常用的日记查询工具。",
      parameters: {
        type: "object",
        properties: {
          includeChildren: {
            type: "boolean",
            description: "是否包含日记条目的子块（默认 true）",
          },
          createIfNotExists: {
            type: "boolean",
            description: "如果今日日记不存在，是否自动创建（默认 false）",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_tag_schema",
      description: "获取特定标签的架构定义，包括其所有可用属性的名称、类型和选项值。在使用 query_blocks_by_tag 之前，如果你不确定属性名或枚举值，请先调用此工具。",
      parameters: {
        type: "object",
        properties: {
          tagName: {
            type: "string",
            description: "标签名称（不带 #）",
          },
        },
        required: ["tagName"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "searchBlocksByReference",
      description: `搜索引用了特定页面的所有笔记（反向链接）。
使用建议：
- 用户问"有多少笔记引用了X"时，用 countOnly:true
- 用户要"列出引用X的笔记"时，用 briefMode:true
- 结果超过50条时，用 offset 分页获取更多`,
      parameters: {
        type: "object",
        properties: {
          pageName: {
            type: "string",
            description: "引用的页面名称（不带 [[ ]]）",
          },
          maxResults: {
            type: "number",
            description: "返回的最大结果数（默认 20，最大 50）",
          },
          offset: {
            type: "number",
            description: "跳过前 N 条结果（用于分页）",
          },
          countOnly: {
            type: "boolean",
            description: "仅返回总数统计（用于回答'有多少条'类问题）",
          },
          briefMode: {
            type: "boolean",
            description: "简洁模式：返回标题+摘要（用于列表概览）",
          },
        },
        required: ["pageName"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getPage",
      description: "根据名称读取完整页面的内容。当你从搜索结果中找到感兴趣的页面时，使用此工具阅读其详细内容。支持追溯到页面根节点。",
      parameters: {
        type: "object",
        properties: {
          pageName: {
            type: "string",
            description: "页面名称",
          },
          includeChildren: {
            type: "boolean",
            description: "是否包含所有子块内容（默认 true）",
          },
        },
        required: ["pageName"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "createBlock",
      description: "在指定位置创建新笔记条目。你需要提供参考块 ID 以及新内容插入的位置（如子块末尾、当前块之后等）。",
      parameters: {
        type: "object",
        properties: {
          refBlockId: {
            type: "number",
            description: "参考块的 ID。你也可以提供 pageName 替代此参数。",
          },
          pageName: {
            type: "string",
            description: "页面名称。如果提供了此项，将在该页面末尾创建块。",
          },
          content: {
            type: "string",
            description: "笔记内容（支持 Markdown）",
          },
          position: {
            type: "string",
            enum: ["firstChild", "lastChild", "before", "after"],
            description: "相对于参考块的插入位置，默认为 'lastChild' (作为子块末尾)",
          },
        },
        required: ["content"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "createPage",
      description: "为现有块创建页面别名（将其提升为标题页面）。",
      parameters: {
        type: "object",
        properties: {
          blockId: {
            type: "number",
            description: "目标块 ID",
          },
          pageName: {
            type: "string",
            description: "新页面名称",
          },
        },
        required: ["blockId", "pageName"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "insertTag",
      description: "为指定块添加标签。支持同时设置标签属性（如 #book {status: 'reading'}）。",
      parameters: {
        type: "object",
        properties: {
          blockId: {
            type: "number",
            description: "目标块 ID",
          },
          tagName: {
            type: "string",
            description: "标签名（不带 #）",
          },
          properties: {
            type: "array",
            description: "标签属性列表（可选）",
            items: {
              type: "object",
              properties: {
                name: { type: "string", description: "属性名" },
                value: { type: ["string", "number", "boolean"], description: "属性值" },
              },
              required: ["name", "value"],
            },
          },
        },
        required: ["blockId", "tagName"],
      },
    },
  },
];

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Tool Implementation Logic
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * 获取块的根页面 ID（向上追溯到 parent === null 的块）
 */
async function getRootBlockId(blockId: number): Promise<number | undefined> {
  let currentId = blockId;
  let safetyCounter = 0;

  try {
    while (safetyCounter < 20) {
      const block = orca.state.blocks[currentId] || await orca.invokeBackend("get-block", currentId);
      if (!block) return currentId;
      if (!block.parent) return block.id;
      currentId = block.parent;
      safetyCounter++;
    }
  } catch (error) {
    console.warn(`[getRootBlockId] Error tracing root for block ${blockId}:`, error);
  }
  return currentId;
}

/**
 * 将任意输入转换为有限数字。
 */
function toFiniteNumber(val: any): number | undefined {
  if (val === null || val === undefined) return undefined;
  const num = Number(val);
  return Number.isFinite(num) ? num : undefined;
}

/**
 * 规范化日记偏移量。
 */
function normalizeJournalOffset(val: any, defaultVal: number): number {
  const num = Number(val);
  return Number.isFinite(num) ? Math.trunc(num) : defaultVal;
}

/**
 * 生成搜索结果的上限警告信息
 * @param resultCount - 实际返回的结果数
 * @param maxResults - 请求的最大结果数
 * @param actualLimit - 实际应用的上限（考虑系统最大值）
 */
function buildLimitWarning(resultCount: number, maxResults: number, actualLimit: number = 50): string {
  if (resultCount >= actualLimit) {
    return `\n\n⚠️ **注意：结果已达到上限 (${actualLimit} 条)**\n实际匹配的笔记可能更多。如需获取完整列表，请：\n1. 使用更精确的搜索条件缩小范围\n2. 或分批查询（如按时间范围分段）`;
  }
  return "";
}

/**
 * 格式化简洁模式的搜索结果（标题+摘要+ID）
 */
function formatBriefResult(result: any, index: number): string {
  const title = result.title || `(Block ${result.id})`;
  // 提取内容摘要（前80字符）
  const content = result.content || result.fullContent || "";
  const summary = content.length > 80 
    ? content.substring(0, 80).replace(/\n/g, " ") + "..."
    : content.replace(/\n/g, " ");
  
  if (summary && summary !== title) {
    return `${index + 1}. **${title}** [${result.id}](orca-block:${result.id})\n   ${summary}`;
  }
  return `${index + 1}. **${title}** [${result.id}](orca-block:${result.id})`;
}

/**
 * 格式化仅统计模式的结果
 */
function formatCountOnlyResult(
  count: number,
  queryDesc: string,
  hitLimit: boolean,
  limit: number
): string {
  if (hitLimit) {
    return `📊 统计结果：找到 **至少 ${count} 条** ${queryDesc}\n⚠️ 已达到查询上限 (${limit})，实际数量可能更多。`;
  }
  return `📊 统计结果：找到 **${count} 条** ${queryDesc}`;
}

/**
 * 主入口：处理 AI 调用的工具。
 */
export async function executeTool(toolName: string, args: any): Promise<string> {
  try {
    if (toolName === "searchBlocksByTag") {
      try {
        const tagQuery = args.tag_query || args.tagQuery || args.tag;
        
        // Early validation: check for undefined tagQuery
        if (!tagQuery) {
          console.error("[Tool] searchBlocksByTag: Missing tag_query parameter. Args:", args);
          return "Error: Missing tag_query parameter. Please specify which tag to search for.";
        }
        
        const countOnly = args.countOnly === true;
        const briefMode = args.briefMode === true;
        const offset = Math.max(0, Math.trunc(args.offset || 0));
        const requestedMax = args.maxResults || (countOnly ? 200 : 20);
        const actualLimit = Math.min(requestedMax, countOnly ? 200 : 50);
        // Fetch extra to support offset
        const fetchLimit = offset + actualLimit;
        
        console.log(`[Tool] searchBlocksByTag: "${tagQuery}" (countOnly=${countOnly}, briefMode=${briefMode}, offset=${offset})`);
        const allResults = await searchBlocksByTag(tagQuery, Math.min(fetchLimit, 200));
        const results = allResults.slice(offset, offset + actualLimit);
        const totalFetched = allResults.length;
        console.log(`[Tool] searchBlocksByTag found ${totalFetched} total, returning ${results.length} (offset=${offset})`);

        if (results.length === 0) {
          if (offset > 0 && totalFetched > 0) {
            return `No more results after offset ${offset}. Total found: ${totalFetched} block(s).`;
          }
          return countOnly 
            ? formatCountOnlyResult(0, `标签 "${tagQuery}" 的笔记`, false, actualLimit)
            : `No blocks found with tag query "${tagQuery}".`;
        }

        // Count only mode - just return the count
        if (countOnly) {
          return formatCountOnlyResult(totalFetched, `标签 "${tagQuery}" 的笔记`, totalFetched >= fetchLimit, fetchLimit);
        }

        const preservationNote = addLinkPreservationNote(results.length);
        const summary = briefMode
          ? results.map((r: any, i: number) => formatBriefResult(r, i + offset)).join("\n")
          : results.map((r: any, i: number) => formatBlockResult(r, i + offset)).join("\n\n");
        
        // Build pagination info
        let paginationInfo = "";
        if (offset > 0 || totalFetched >= fetchLimit) {
          paginationInfo = `\n\n📄 显示第 ${offset + 1}-${offset + results.length} 条`;
          if (totalFetched >= fetchLimit) {
            paginationInfo += `（可能还有更多，用 offset:${offset + actualLimit} 获取下一页）`;
          }
        }
        const limitWarning = totalFetched >= fetchLimit ? buildLimitWarning(totalFetched, requestedMax, fetchLimit) : "";

        return `${preservationNote}Found ${results.length} block(s) with tag "${tagQuery}":\n${summary}${paginationInfo}${limitWarning}`;
      } catch (err: any) {
        console.error(`[Tool] Error in searchBlocksByTag:`, err);
        return `Error searching by tag: ${err.message}`;
      }
    } else if (toolName === "searchBlocksByText") {
      try {
        const query = args.query;
        const countOnly = args.countOnly === true;
        const countOnly = args.countOnly === true;
        const briefMode = args.briefMode === true;
        const offset = Math.max(0, Math.trunc(args.offset || 0));
        const requestedMax = args.maxResults || (countOnly ? 200 : 20);
        const actualLimit = Math.min(requestedMax, countOnly ? 200 : 50);
        const fetchLimit = offset + actualLimit;

        console.log(`[Tool] searchBlocksByText: "${query}" (countOnly=${countOnly}, briefMode=${briefMode}, offset=${offset})`);
        const allResults = await searchBlocksByText(query, Math.min(fetchLimit, 200));
        const results = allResults.slice(offset, offset + actualLimit);
        const totalFetched = allResults.length;
        console.log(`[Tool] searchBlocksByText found ${totalFetched} total, returning ${results.length} (offset=${offset})`);

        if (results.length === 0) {
          if (offset > 0 && totalFetched > 0) {
            return `No more results after offset ${offset}. Total found: ${totalFetched} block(s).`;
          }
          return countOnly
            ? formatCountOnlyResult(0, `包含 "${query}" 的笔记`, false, actualLimit)
            : `No blocks found matching text "${query}".`;
        }

        // Count only mode
        if (countOnly) {
          return formatCountOnlyResult(totalFetched, `包含 "${query}" 的笔记`, totalFetched >= fetchLimit, fetchLimit);
        }

        const preservationNote = addLinkPreservationNote(results.length);
        const summary = briefMode
          ? results.map((r: any, i: number) => formatBriefResult(r, i + offset)).join("\n")
          : results.map((r: any, i: number) => formatBlockResult(r, i + offset)).join("\n\n");
        
        // Build pagination info
        let paginationInfo = "";
        if (offset > 0 || totalFetched >= fetchLimit) {
          paginationInfo = `\n\n📄 显示第 ${offset + 1}-${offset + results.length} 条`;
          if (totalFetched >= fetchLimit) {
            paginationInfo += `（可能还有更多，用 offset:${offset + actualLimit} 获取下一页）`;
          }
        }
        const limitWarning = totalFetched >= fetchLimit ? buildLimitWarning(totalFetched, requestedMax, fetchLimit) : "";

        return `${preservationNote}Found ${results.length} block(s) matching "${query}":\n${summary}${paginationInfo}${limitWarning}`;
      } catch (err: any) {
        console.error(`[Tool] Error in searchBlocksByText:`, err);
        return `Error searching by text: ${err.message}`;
      }
    } else if (toolName === "query_blocks_by_tag") {
      try {
        const tagName = args.tagName;
        
        // Early validation: check for undefined tagName
        if (!tagName) {
          console.error("[Tool] query_blocks_by_tag: Missing tagName parameter. Args:", args);
          return "Error: Missing tagName parameter. Please specify which tag to search for.";
        }
        
        let filters = args.filters || args.properties || [];
        const requestedMax = args.maxResults || 20;
        const actualLimit = Math.min(requestedMax, 50);

        // Handle case where AI passes filters as a JSON string instead of array
        if (typeof filters === "string") {
          try {
            filters = JSON.parse(filters);
          } catch (parseErr) {
            console.warn("[Tool] Failed to parse filters string:", filters);
            filters = [];
          }
        }

        console.log(`[Tool] query_blocks_by_tag: #${tagName}`, { filters, maxResults: actualLimit });
        const results = await queryBlocksByTag(tagName, { properties: filters, maxResults: actualLimit });
        console.log(`[Tool] query_blocks_by_tag found ${results.length} results`);

        if (results.length === 0) {
          const filterDesc = filters.length > 0 ? " with specified filters" : "";
          return `No blocks found for #${tagName}${filterDesc}. This is the complete result - no further queries needed.`;
        }

        const preservationNote = addLinkPreservationNote(results.length);
        const summary = results.map((r: any, i: number) => formatBlockResult(r, i)).join("\n\n");
        const limitWarning = buildLimitWarning(results.length, requestedMax, actualLimit);

        // Add explicit completion indicator to prevent unnecessary follow-up queries
        return `${preservationNote}✅ Search complete. Found ${results.length} block(s) for #${tagName}:\n${summary}${limitWarning}\n\n---\n📋 Above are all matching results. You can directly reference these blocks using the blockid format shown.${results.length >= actualLimit ? " Note: More results may exist beyond the limit." : " No further queries needed."}`;
      } catch (err: any) {
        console.error(`[Tool] Error in query_blocks_by_tag:`, err);
        return `Error querying tag with filters: ${err.message}`;
      }
    } else if (toolName === "getRecentJournals") {
      try {
        let days = args.days ?? 7;
        const includeChildren = args.includeChildren !== false; // default true
        const maxResults = args.maxResults ?? 20;

        if (Array.isArray(days)) {
          days = days[0];
        }

        const normalizedDays = Number.isFinite(Number(days))
          ? Math.abs(Math.trunc(Number(days)))
          : 7;
        const normalizedMaxResults = Math.min(
          Math.max(1, Number.isFinite(Number(maxResults)) ? Math.trunc(Number(maxResults)) : 20),
          50
        );

        console.log("[Tool] getRecentJournals:", {
          days: normalizedDays,
          includeChildren,
          maxResults: normalizedMaxResults,
        });

        const results = await getRecentJournals(
          normalizedDays,
          includeChildren,
          normalizedMaxResults
        );
        console.log(`[Tool] getRecentJournals found ${results.length} results`);

        if (results.length === 0) {
          return `No journal entries found in the last ${normalizedDays} day(s).`;
        }

        const preservationNote = addLinkPreservationNote(results.length);
        const summary = results.map((r: any, i: number) => formatBlockResult(r, i)).join("\n\n");

        return `${preservationNote}Found ${results.length} journal entries in the last ${normalizedDays} day(s):\n${summary}`;
      } catch (err: any) {
        console.error(`[Tool] Error in getRecentJournals:`, err);
        return `Error getting recent journals: ${err.message}`;
      }
    } else if (toolName === "getTodayJournal") {
      try {
        const includeChildren = args.includeChildren !== false; // default true
        const createIfNotExists = args.createIfNotExists === true; // default false

        console.log("[Tool] getTodayJournal:", { includeChildren, createIfNotExists });

        // Get today's date in YYYY-MM-DD format
        const today = new Date();
        const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

        try {
          // Use the dedicated getTodayJournal function from search-service
          // This uses get-journal-block backend API with data-type="journal"
          const todayJournal = await getTodayJournal(includeChildren);
          
          if (todayJournal) {
            const preservationNote = addLinkPreservationNote(1);
            const formatted = formatBlockResult(todayJournal, 0);
            return `${preservationNote}Today's journal (${todayStr}):\n${formatted}`;
          }
        } catch (journalErr: any) {
          console.log(`[Tool] getTodayJournal: Journal not found, error: ${journalErr.message}`);
        }

        // No journal found for today
        if (createIfNotExists) {
          // Try to create today's journal by navigating to it
          try {
            const journalPageName = todayStr;
            const pageResult = await getPageByName(journalPageName, true);
            if (pageResult && pageResult.id) {
              return `Created today's journal: [${todayStr}](orca-block:${pageResult.id})\n\nThe journal is empty. You can add content using createBlock with this block ID.`;
            }
          } catch (createErr: any) {
            console.error(`[Tool] Error creating today's journal:`, createErr);
          }
          return `Could not create today's journal. Please create it manually.`;
        }

        return `No journal entry found for today (${todayStr}). Use createIfNotExists: true to create one.`;
      } catch (err: any) {
        console.error(`[Tool] Error in getTodayJournal:`, err);
        return `Error getting today's journal: ${err.message}`;
      }
    } else if (toolName === "query_blocks") {
      try {
        // Advanced query with multiple conditions
        const conditions = args.conditions;
        const combineMode = args.combineMode || "and";
        const requestedMax = args.maxResults || 50;
        const actualLimit = Math.min(requestedMax, 50);

        if (!Array.isArray(conditions) || conditions.length === 0) {
          return "Error: At least one condition is required for query_blocks.";
        }

        console.log("[Tool] query_blocks:", { conditions, combineMode, maxResults: actualLimit });

        const convertedConditions: QueryCondition[] = conditions.map((c: any) => {
          switch (c.type) {
            case "tag":
              return { type: "tag" as const, name: c.name || "" };
            case "text":
              return { type: "text" as const, text: c.text || "" };
            case "task":
              return { type: "task" as const, completed: c.completed };
            case "journal":
              let startOffset = normalizeJournalOffset(c.startOffset, -7);
              let endOffset = normalizeJournalOffset(c.endOffset, 0);
              if (startOffset > endOffset) {
                [startOffset, endOffset] = [endOffset, startOffset];
              }
              return {
                type: "journal" as const,
                start: { type: "relative" as const, value: startOffset, unit: "d" as const },
                end: { type: "relative" as const, value: endOffset, unit: "d" as const },
              };
            case "ref":
              return { type: "ref" as const, blockId: c.blockId || 0 };
            case "block":
              return { type: "block" as const, hasTags: c.hasTags };
            case "blockMatch":
              return { type: "blockMatch" as const, blockId: c.blockId || 0 };
            default:
              return { type: "tag" as const, name: "" };
          }
        });

        const results = await queryBlocksAdvanced({
          conditions: convertedConditions,
          combineMode: combineMode as QueryCombineMode,
          pageSize: actualLimit,
        });
        console.log(`[Tool] query_blocks found ${results.length} results`);

        if (results.length === 0) {
          return `No blocks found matching the ${combineMode.toUpperCase()} query.`;
        }

        const preservationNote = addLinkPreservationNote(results.length);
        const summary = results.map((r: any, i: number) => formatBlockResult(r, i)).join("\n\n");
        const limitWarning = buildLimitWarning(results.length, requestedMax, actualLimit);

        return `${preservationNote}Found ${results.length} block(s) matching ${combineMode.toUpperCase()} query:\n${summary}${limitWarning}`;
      } catch (err: any) {
        console.error(`[Tool] Error in query_blocks:`, err);
        return `Error executing complex query: ${err.message}`;
      }
    } else if (toolName === "get_tag_schema") {
      try {
        let tagName = args.tagName || args.tag_name || args.tag;

        if (Array.isArray(tagName)) {
          tagName = tagName[0];
        }

        if (!tagName) {
          console.error("[Tool] Missing tag name parameter");
          return "Error: Missing tag name parameter";
        }

        console.log(`[Tool] get_tag_schema: "${tagName}"`);
        const schema = await getTagSchema(tagName);
        console.log(`[Tool] get_tag_schema found ${schema.properties.length} properties`);

        if (schema.properties.length === 0) {
          return `Tag "${tagName}" found but has no properties defined.`;
        }

        let result = `Schema for tag "${schema.tagName}":\n\n`;
        schema.properties.forEach((prop: any, i: number) => {
          result += `${i + 1}. **${prop.name}** (${prop.typeName}, type code: ${prop.type})\n`;
          if (prop.options && prop.options.length > 0) {
            result += `   Options:\n`;
            prop.options.forEach((opt: any) => {
              result += `   - "${opt.label}" → value: ${opt.value}\n`;
            });
          }
        });

        result += `\n**Usage tip**: When querying with property filters, use the numeric values shown above for choice properties.\n`;
        return result;
      } catch (err: any) {
        console.error(`[Tool] Error in get_tag_schema:`, err);
        return `Error getting schema for tag "${args.tagName}": ${err.message}`;
      }
    } else if (toolName === "searchBlocksByReference") {
      try {
        let pageName = args.pageName || args.page_name || args.page || args.alias || args.name 
          || args.query || args.reference || args.target || args.text || args.blockName
          || args.searchText || args.pageTitle || args.title || args.reference_page_name;
        const countOnly = args.countOnly === true;
        const briefMode = args.briefMode === true;
        const offset = Math.max(0, Math.trunc(args.offset || 0));
        const requestedMax = args.maxResults || (countOnly ? 200 : 50);
        const actualLimit = Math.min(requestedMax, countOnly ? 200 : 50);
        const fetchLimit = offset + actualLimit;

        if (Array.isArray(pageName)) {
          pageName = pageName[0];
        }

        if (!pageName) {
          console.error("[Tool] Missing page name parameter. Args:", args);
          return "Error: Missing page name parameter. Please specify which page to find references to.";
        }

        console.log("[Tool] searchBlocksByReference:", { pageName, maxResults: actualLimit, countOnly, briefMode, offset });

        const allResults = await searchBlocksByReference(pageName, Math.min(fetchLimit, 200));
        const results = allResults.slice(offset, offset + actualLimit);
        const totalFetched = allResults.length;
        console.log(`[Tool] searchBlocksByReference found ${totalFetched} total, returning ${results.length} (offset=${offset})`);

        if (results.length === 0) {
          if (offset > 0 && totalFetched > 0) {
            return `No more results after offset ${offset}. Total found: ${totalFetched} block(s).`;
          }
          return countOnly
            ? formatCountOnlyResult(0, `引用 "[[${pageName}]]" 的笔记`, false, actualLimit)
            : `No blocks found referencing "[[${pageName}]]".`;
        }

        // Count only mode
        if (countOnly) {
          return formatCountOnlyResult(totalFetched, `引用 "[[${pageName}]]" 的笔记`, totalFetched >= fetchLimit, fetchLimit);
        }

        const preservationNote = addLinkPreservationNote(results.length);
        const summary = briefMode
          ? results.map((r: any, i: number) => formatBriefResult(r, i + offset)).join("\n")
          : results.map((r: any, i: number) => formatBlockResult(r, i + offset)).join("\n\n");
        
        // Build pagination info
        let paginationInfo = "";
        if (offset > 0 || totalFetched >= fetchLimit) {
          paginationInfo = `\n\n📄 显示第 ${offset + 1}-${offset + results.length} 条`;
          if (totalFetched >= fetchLimit) {
            paginationInfo += `（可能还有更多，用 offset:${offset + actualLimit} 获取下一页）`;
          }
        }
        const limitWarning = totalFetched >= fetchLimit ? buildLimitWarning(totalFetched, requestedMax, fetchLimit) : "";

        return `${preservationNote}Found ${results.length} block(s) referencing "[[${pageName}]]":\n${summary}${paginationInfo}${limitWarning}`;
      } catch (err: any) {
        console.error(`[Tool] Error in searchBlocksByReference:`, err);
        return `Error searching references to "${args.pageName}": ${err.message}`;
      }
    } else if (toolName === "getPage") {
      try {
        let pageName = args.pageName || args.page_name || args.page || args.name || args.alias || args.title;
        const includeChildren = args.includeChildren !== false;

        if (Array.isArray(pageName)) {
          pageName = pageName[0];
        }

        if (!pageName) {
          console.error("[Tool] Missing page name parameter");
          return "Error: Missing page name parameter.";
        }

        console.log("[Tool] getPage:", { pageName, includeChildren });

        try {
          const result = await getPageByName(pageName, includeChildren);
          const linkTitle = result.title.replace(/[\[\]]/g, "");
          const body = result.fullContent ?? result.content;

          return `# ${linkTitle}\n\n${body}\n\n---\n📄 [查看原页面](orca-block:${result.id})`;
        } catch (error: any) {
          if (error.message?.includes("not found")) {
            return `Page "${pageName}" not found.`;
          }
          throw error;
        }
      } catch (err: any) {
        console.error(`[Tool] Error in getPage:`, err);
        return `Error getting page "${args.pageName}": ${err.message}`;
      }
    } else if (toolName === "createBlock") {
      try {
        let refBlockIdRaw = args.refBlockId ?? args.ref_block_id ?? args.blockId ?? args.block_id;

        if (typeof refBlockIdRaw === "string") {
          const match = refBlockIdRaw.match(/^orca-block:(\d+)$/);
          if (match) refBlockIdRaw = parseInt(match[1], 10);
        }

        let refBlockId = toFiniteNumber(refBlockIdRaw);
        const pageName = args.pageName || args.page_name || args.page || args.title;

        if (!refBlockId && pageName) {
          try {
            const pageResult = await getPageByName(pageName, false);
            refBlockId = pageResult.id;
          } catch (error: any) {
             return `Error: Page "${pageName}" not found.`;
          }
        }

        if (refBlockId === undefined) {
          return "Error: Missing reference. Please provide either refBlockId or pageName.";
        }

        const position = ["before", "after", "firstChild", "lastChild"].includes(args.position) ? args.position : "lastChild";
        const content = args.content || args.text || "";

        if (!content || content.trim().length === 0) {
          return "Error: Content cannot be empty.";
        }

        let refBlock = orca.state.blocks[refBlockId] || await orca.invokeBackend("get-block", refBlockId);
        if (!refBlock) return `Error: Block ${refBlockId} not found.`;

        // Navigation check
        const targetRootBlockId = await getRootBlockId(refBlockId);
        let currentRootBlockId: number | undefined = undefined;
        let targetPanelId: string | undefined = undefined;

        try {
          const activePanelId = orca.state.activePanel;
          if (activePanelId !== uiStore.aiChatPanelId) {
            targetPanelId = activePanelId;
            const activePanel = orca.nav.findViewPanel(activePanelId, orca.state.panels);
            if (activePanel?.view === "block" && activePanel.viewArgs?.blockId) {
              currentRootBlockId = await getRootBlockId(activePanel.viewArgs.blockId);
            }
          }
        } catch (error) {}

        const needsNavigation = !targetRootBlockId || !currentRootBlockId || (targetRootBlockId !== currentRootBlockId);
        if (needsNavigation) {
          if (targetPanelId) orca.nav.replace("block", { blockId: refBlockId }, targetPanelId);
          else orca.nav.openInLastPanel("block", { blockId: refBlockId });
          await new Promise(resolve => setTimeout(resolve, 100));
        }

        let newBlockIds: any;
        await orca.commands.invokeGroup(async () => {
          newBlockIds = await orca.commands.invokeEditorCommand(
            "core.editor.batchInsertText",
            null, refBlock, position, content, false, false
          );
        }, { topGroup: true, undoable: true });

        const newBlockId = Array.isArray(newBlockIds) ? newBlockIds[0] : newBlockIds;
        
        if (newBlockId === undefined || newBlockId === null) {
          // Try to get the last child of refBlock as fallback
          await new Promise(resolve => setTimeout(resolve, 50));
          const updatedRefBlock = orca.state.blocks[refBlockId];
          if (updatedRefBlock?.children && updatedRefBlock.children.length > 0) {
            const lastChildId = updatedRefBlock.children[updatedRefBlock.children.length - 1];
            return `Created new block: [${lastChildId}](orca-block:${lastChildId})`;
          }
          return `Block created but ID not returned. Please check the target location.`;
        }
        
        return `Created new block: [${newBlockId}](orca-block:${newBlockId})`;
      } catch (err: any) {
        console.error(`[Tool] Error in createBlock:`, err);
        return `Error creating block: ${err.message}`;
      }
    } else if (toolName === "createPage") {
      try {
        const blockId = toFiniteNumber(args.blockId || args.block_id || args.id);
        const pageName = args.pageName || args.page_name || args.name || args.alias;

        if (!blockId || !pageName) return "Error: Missing blockId or pageName.";

        await orca.commands.invokeEditorCommand("core.editor.createAlias", null, pageName, blockId, true);
        return `Created page [[${pageName}]] for block ${blockId}`;
      } catch (err: any) {
        return `Error creating page: ${err.message}`;
      }
    } else if (toolName === "insertTag") {
      try {
        const blockId = toFiniteNumber(args.blockId || args.block_id || args.id);
        const tagName = args.tagName || args.tag_name || args.tag;
        const properties = args.properties || args.props;

        if (!blockId || !tagName) return "Error: Missing blockId or tagName.";

        // Navigation check
        const targetRootBlockId = await getRootBlockId(blockId);
        let currentRootBlockId: number | undefined = undefined;
        let targetPanelId: string | undefined = undefined;

        try {
          if (orca.state.activePanel !== uiStore.aiChatPanelId) {
            targetPanelId = orca.state.activePanel;
            const activePanel = orca.nav.findViewPanel(targetPanelId, orca.state.panels);
            if (activePanel?.view === "block" && activePanel.viewArgs?.blockId) {
              currentRootBlockId = await getRootBlockId(activePanel.viewArgs.blockId);
            }
          }
        } catch (error) {}

        if (!targetRootBlockId || !currentRootBlockId || (targetRootBlockId !== currentRootBlockId)) {
          if (targetPanelId) orca.nav.replace("block", { blockId }, targetPanelId);
          else orca.nav.openInLastPanel("block", { blockId });
          await new Promise(resolve => setTimeout(resolve, 100));
        }

        const tagProperties = properties && Array.isArray(properties)
          ? properties.map((prop: any) => ({ name: prop.name, value: prop.value }))
          : undefined;

        await orca.commands.invokeGroup(async () => {
          await orca.commands.invokeEditorCommand("core.editor.insertTag", null, blockId, tagName, tagProperties);
        }, { topGroup: true, undoable: true });

        return `Added tag #${tagName} to block ${blockId}`;
      } catch (err: any) {
        return `Error inserting tag: ${err.message}`;
      }
    } else {
      console.error("[Tool] Unknown tool:", toolName);
      return `Unknown tool: ${toolName}`;
    }
  } catch (error: any) {
    console.error("[Tool] Error:", error);
    return `Error executing ${toolName}: ${error?.message ?? error}`;
  }
}
