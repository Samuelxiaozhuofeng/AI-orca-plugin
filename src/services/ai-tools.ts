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
      description: `根据标签精准搜索笔记。支持搜索单个标签（如 #TODO）或多个标签（如 #TODO #Project）。这是获取结构化数据的最佳方式。
⚠️ 仅用于简单标签搜索，不涉及属性过滤。如需过滤属性值（如 Status=xxx），请用 query_blocks_by_tag`,
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
          countOnly: {
            type: "boolean",
            description: "仅返回总数统计，不返回内容（用于回答'有多少条'类问题）",
          },
          briefMode: {
            type: "boolean",
            description: "简洁模式：返回标题+摘要，不返回完整内容（用于列表概览）",
          },
          sortBy: {
            type: "string",
            enum: ["created", "modified"],
            description: "排序字段：created（创建时间）或 modified（修改时间）",
          },
          sortOrder: {
            type: "string",
            enum: ["asc", "desc"],
            description: "排序顺序：asc（升序/最早）或 desc（降序/最新），默认 desc",
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
      description: `全文搜索笔记。当你需要查找包含特定内容、短语或关键词的笔记时使用。适合进行模糊搜索或查找具体文本。
⚠️ 如果用户明确提到标签（如 #xxx），应优先使用 searchBlocksByTag`,
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
          countOnly: {
            type: "boolean",
            description: "仅返回总数统计（用于回答'有多少条'类问题）",
          },
          briefMode: {
            type: "boolean",
            description: "简洁模式：返回标题+摘要（用于列表概览）",
          },
          sortBy: {
            type: "string",
            enum: ["created", "modified"],
            description: "排序字段",
          },
          sortOrder: {
            type: "string",
            enum: ["asc", "desc"],
            description: "排序顺序，默认 desc",
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
      description: `使用标签和属性过滤器搜索笔记（高级搜索）。当你需要查找具有特定属性值的标签笔记时使用。
例如：查找 #Task 标签且 Status 属性为 'Canceled' 的笔记。
⚠️ value 直接用文本值（如 "Canceled"、"Done"），不要用数字编码`,
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
                  description: "操作符",
                },
                value: {
                  type: "string",
                  description: "属性值（直接用文本，如 Canceled、Done、reading）",
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
      description: `获取最近几天的日记条目。当你需要了解用户最近的动态、计划或记录时使用。
⚠️ 如果只需要今天的日记，请使用 getTodayJournal（更高效）`,
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
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_tag_schema",
      description: `获取特定标签的架构定义，包括其所有可用属性的名称、类型和选项值。
⚠️ 仅在用户明确要求查看标签结构时使用
❌ 不要在查询前调用此工具，直接用 query_blocks_by_tag 查询即可`,
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
      description: "搜索引用了特定页面的所有笔记（反向链接）。这有助于发现不同笔记之间的关联。输入参数为页面标题或文件名。",
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
          countOnly: {
            type: "boolean",
            description: "仅返回总数统计",
          },
          briefMode: {
            type: "boolean",
            description: "简洁模式：返回标题+摘要",
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
      name: "getBlock",
      description: `根据块 ID 获取单个块的详细内容。当你需要查看某个特定块的完整内容时使用。
⚠️ 如果要查看页面内容，优先使用 getPage（按名称查找更方便）`,
      parameters: {
        type: "object",
        properties: {
          blockId: {
            type: "number",
            description: "块的 ID（数字）",
          },
          includeChildren: {
            type: "boolean",
            description: "是否包含所有子块内容（默认 true）",
          },
          includeMeta: {
            type: "boolean",
            description: "是否包含元数据（创建时间、修改时间）",
          },
        },
        required: ["blockId"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getBlockMeta",
      description: "批量获取多个块的元数据（创建时间、修改时间等）。适用于需要查询多个笔记时间信息的场景，如'最近修改的笔记'、'按时间排序'等。单个块请用 getBlock 的 includeMeta 参数。",
      parameters: {
        type: "object",
        properties: {
          blockIds: {
            type: "array",
            description: "块 ID 列表（数字数组）",
            items: {
              type: "number",
            },
          },
          fields: {
            type: "array",
            description: "要获取的字段列表，可选值：created（创建时间）、modified（修改时间）、tags（标签）、properties（属性）。不传则返回所有字段。",
            items: {
              type: "string",
              enum: ["created", "modified", "tags", "properties"],
            },
          },
        },
        required: ["blockIds"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "createBlock",
      description: `在指定位置创建新笔记条目。你需要提供参考块 ID 以及新内容插入的位置（如子块末尾、当前块之后等）。
⚠️ 内容格式要求：
- 使用纯文本或 Markdown 格式
- 不要包含 orca-block:xxx 这种内部链接格式
- 如需引用页面，使用 [[页面名称]] 格式`,
      parameters: {
        type: "object",
        properties: {
          refBlockId: {
            type: "number",
            description: "参考块的 ID（与 pageName 二选一）",
          },
          pageName: {
            type: "string",
            description: "页面名称。如果提供了此项，将在该页面末尾创建块（推荐使用）",
          },
          content: {
            type: "string",
            description: "笔记内容（纯文本或 Markdown，不要用 orca-block 链接）",
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
                value: { type: "string", description: "属性值（字符串形式）" },
              },
              required: ["name", "value"],
            },
          },
        },
        required: ["blockId", "tagName"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getBlockLinks",
      description: `获取指定页面或块的出链和入链（反链）列表。返回引用关系的详细信息。
⚠️ 此工具仅返回链接数据的文本列表，不会生成可视化图谱
❌ 如果用户要求"显示图谱"、"链接图"、"关系图"，请告知用户使用 /localgraph 命令`,
      parameters: {
        type: "object",
        properties: {
          blockId: {
            type: "number",
            description: "要查询链接关系的块 ID（与 pageName 二选一）",
          },
          pageName: {
            type: "string",
            description: "要查询链接关系的页面名称（与 blockId 二选一）",
          },
        },
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
 * 从 block.content 提取纯文本内容
 * block.content 可能是字符串或 ContentFragment[] 数组
 */
function extractBlockText(content: any): string {
  if (!content) return "";
  
  // 如果已经是字符串，直接返回
  if (typeof content === "string") return content;
  
  // 如果是数组（ContentFragment[]），提取每个 fragment 的文本
  if (Array.isArray(content)) {
    return content.map((fragment: any) => {
      if (!fragment) return "";
      // fragment.v 是值，可能是字符串或其他类型
      if (typeof fragment.v === "string") return fragment.v;
      if (typeof fragment.v === "number") return String(fragment.v);
      // 对于复杂类型（如嵌套对象），尝试提取
      if (fragment.v && typeof fragment.v === "object") {
        // 可能是链接等，尝试获取显示文本
        return fragment.v.text || fragment.v.title || fragment.v.name || "";
      }
      return "";
    }).join("");
  }
  
  // 其他情况，尝试转字符串
  try {
    return String(content);
  } catch {
    return "";
  }
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
  // 清理标题中的链接格式，避免嵌套
  // 优先使用 tags (aliases)，然后是 title
  let title: string;
  if (Array.isArray(result.tags) && result.tags.length > 0) {
    // tags 字段存储的是 aliases
    const validTags = result.tags.filter((t: any) => typeof t === "string" && t.trim());
    title = validTags.length > 0 ? validTags.join(" / ") : (result.title || `Block #${result.id}`);
  } else {
    title = result.title || `Block #${result.id}`;
  }
  
  title = title.replace(/\[([^\]]+)\]\(orca-block:\d+\)/g, "$1"); // 移除已有的 block link
  title = title.replace(/[\[\]]/g, ""); // 移除方括号
  
  if (!title || title.trim() === "" || title === "(untitled)") {
    title = `Block #${result.id}`;
  }
  
  // 提取内容摘要（前80字符），同样清理链接格式
  let content = result.content || result.fullContent || "";
  content = content.replace(/\[([^\]]+)\]\(orca-block:\d+\)/g, "$1");
  const summary = content.length > 80 
    ? content.substring(0, 80).replace(/\n/g, " ") + "..."
    : content.replace(/\n/g, " ");
  
  if (summary && summary.trim() && summary !== title) {
    return `${index + 1}. [${title}](orca-block:${result.id})\n   ${summary}`;
  }
  return `${index + 1}. [${title}](orca-block:${result.id})`;
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
        const sortBy = args.sortBy as "created" | "modified" | undefined;
        const sortOrder = (args.sortOrder || "desc") as "asc" | "desc";
        // Fetch extra to support offset and sorting
        const fetchLimit = offset + actualLimit;
        
        console.log(`[Tool] searchBlocksByTag: "${tagQuery}" (countOnly=${countOnly}, briefMode=${briefMode}, offset=${offset}, sortBy=${sortBy})`);
        let allResults = await searchBlocksByTag(tagQuery, Math.min(fetchLimit, 200));
        
        // Sort results if sortBy is specified
        if (sortBy && allResults.length > 0) {
          allResults = [...allResults].sort((a: any, b: any) => {
            const aTime = a[sortBy] ? new Date(a[sortBy]).getTime() : 0;
            const bTime = b[sortBy] ? new Date(b[sortBy]).getTime() : 0;
            return sortOrder === "desc" ? bTime - aTime : aTime - bTime;
          });
        }
        
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
        const sortInfo = sortBy ? `\n🔄 按${sortBy === "created" ? "创建时间" : "修改时间"}${sortOrder === "desc" ? "降序" : "升序"}排列` : "";

        return `${preservationNote}Found ${results.length} block(s) with tag "${tagQuery}":${sortInfo}\n${summary}${paginationInfo}${limitWarning}`;
      } catch (err: any) {
        console.error(`[Tool] Error in searchBlocksByTag:`, err);
        return `Error searching by tag: ${err.message}`;
      }
    } else if (toolName === "searchBlocksByText") {
      try {
        const query = args.query;
        const countOnly = args.countOnly === true;
        const briefMode = args.briefMode === true;
        const offset = Math.max(0, Math.trunc(args.offset || 0));
        const requestedMax = args.maxResults || (countOnly ? 200 : 20);
        const actualLimit = Math.min(requestedMax, countOnly ? 200 : 50);
        const sortBy = args.sortBy as "created" | "modified" | undefined;
        const sortOrder = (args.sortOrder || "desc") as "asc" | "desc";
        const fetchLimit = offset + actualLimit;

        console.log(`[Tool] searchBlocksByText: "${query}" (countOnly=${countOnly}, briefMode=${briefMode}, offset=${offset}, sortBy=${sortBy})`);
        let allResults = await searchBlocksByText(query, Math.min(fetchLimit, 200));
        
        // Sort results if sortBy is specified
        if (sortBy && allResults.length > 0) {
          allResults = [...allResults].sort((a: any, b: any) => {
            const aTime = a[sortBy] ? new Date(a[sortBy]).getTime() : 0;
            const bTime = b[sortBy] ? new Date(b[sortBy]).getTime() : 0;
            return sortOrder === "desc" ? bTime - aTime : aTime - bTime;
          });
        }
        
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
        const sortInfo = sortBy ? `\n🔄 按${sortBy === "created" ? "创建时间" : "修改时间"}${sortOrder === "desc" ? "降序" : "升序"}排列` : "";

        return `${preservationNote}Found ${results.length} block(s) matching "${query}":${sortInfo}\n${summary}${paginationInfo}${limitWarning}`;
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

        console.log("[Tool] getTodayJournal:", { includeChildren });

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

        return `No journal entry found for today (${todayStr}). Please create it manually in Orca.`;
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
    } else if (toolName === "getBlock") {
      try {
        let blockIdRaw = args.blockId || args.block_id || args.id;
        const includeChildren = args.includeChildren !== false;
        const includeMeta = args.includeMeta === true;

        // Handle orca-block:xxx and blockid:xxx formats
        if (typeof blockIdRaw === "string") {
          const match = blockIdRaw.match(/^(?:orca-block:|blockid:)?(\d+)$/i);
          if (match) blockIdRaw = parseInt(match[1], 10);
        }

        const blockId = toFiniteNumber(blockIdRaw);

        if (!blockId) {
          console.error("[Tool] Missing or invalid blockId parameter");
          return "Error: Missing or invalid blockId parameter. Please provide a valid block ID number.";
        }

        console.log("[Tool] getBlock:", { blockId, includeChildren, includeMeta });

        // Get block from state or backend
        let block = orca.state.blocks[blockId] || await orca.invokeBackend("get-block", blockId);
        if (!block) {
          return `Block ${blockId} not found.`;
        }

        // Format date helper
        const formatDate = (date: any): string => {
          if (!date) return "未知";
          const d = new Date(date);
          if (isNaN(d.getTime())) return "未知";
          const year = d.getFullYear();
          const month = String(d.getMonth() + 1).padStart(2, "0");
          const day = String(d.getDate()).padStart(2, "0");
          const hour = String(d.getHours()).padStart(2, "0");
          const min = String(d.getMinutes()).padStart(2, "0");
          return `${year}-${month}-${day} ${hour}:${min}`;
        };

        // Build content - extract text from content (may be string or ContentFragment[])
        let content = extractBlockText(block.content);
        // Ensure content is a string before splitting
        const contentStr = typeof content === "string" ? content : "";
        
        // Extract title: priority is aliases > first line of content
        let title: string;
        if (Array.isArray(block.aliases) && block.aliases.length > 0) {
          // Use aliases (page names) joined with " / "
          const validAliases = block.aliases
            .map((a: any) => String(a).trim())
            .filter((a: string) => a.length > 0);
          title = validAliases.length > 0 
            ? validAliases.join(" / ")
            : contentStr.split("\n")[0]?.substring(0, 50) || `Block #${blockId}`;
        } else {
          title = contentStr.split("\n")[0]?.substring(0, 50) || `Block #${blockId}`;
        }
        title = title.replace(/[\[\]]/g, "");

        // Get children content if requested
        let childrenContent = "";
        if (includeChildren && block.children && block.children.length > 0) {
          const childContents: string[] = [];
          for (const childId of block.children) {
            const childBlock = orca.state.blocks[childId] || await orca.invokeBackend("get-block", childId);
            if (childBlock && childBlock.content) {
              const childText = extractBlockText(childBlock.content);
              if (childText) {
                childContents.push(`  - ${childText}`);
              }
            }
          }
          if (childContents.length > 0) {
            childrenContent = "\n\n**子块内容：**\n" + childContents.join("\n");
          }
        }

        // Build meta info if requested
        let metaInfo = "";
        if (includeMeta) {
          const metaParts: string[] = [];
          if (block.created) metaParts.push(`创建: ${formatDate(block.created)}`);
          if (block.modified) metaParts.push(`修改: ${formatDate(block.modified)}`);
          if (metaParts.length > 0) {
            metaInfo = `\n📅 ${metaParts.join(" | ")}`;
          }
        }

        return `# ${title}${metaInfo}\n\n${content}${childrenContent}\n\n---\n📄 [查看原块](orca-block:${blockId})`;
      } catch (err: any) {
        console.error(`[Tool] Error in getBlock:`, err);
        return `Error getting block ${args.blockId}: ${err.message}`;
      }
    } else if (toolName === "getBlockMeta") {
      try {
        // Support both single blockId and batch blockIds
        let blockIds: number[] = [];
        
        if (args.blockIds && Array.isArray(args.blockIds)) {
          blockIds = args.blockIds.map((id: any) => {
            if (typeof id === "string") {
              const match = id.match(/^(?:orca-block:|blockid:)?(\d+)$/i);
              if (match) return parseInt(match[1], 10);
            }
            return toFiniteNumber(id);
          }).filter((id: number | undefined): id is number => !!id);
        } else {
          // Fallback for single blockId (backward compatibility)
          let blockIdRaw = args.blockId || args.block_id || args.id;
          if (typeof blockIdRaw === "string") {
            const match = blockIdRaw.match(/^(?:orca-block:|blockid:)?(\d+)$/i);
            if (match) blockIdRaw = parseInt(match[1], 10);
          }
          const singleId = toFiniteNumber(blockIdRaw);
          if (singleId) blockIds = [singleId];
        }

        const fields: string[] = args.fields || ["created", "modified", "tags", "properties"];

        if (blockIds.length === 0) {
          console.error("[Tool] getBlockMeta: Missing or invalid blockIds");
          return "Error: Missing or invalid blockIds parameter.";
        }

        // Limit batch size
        if (blockIds.length > 100) {
          blockIds = blockIds.slice(0, 100);
        }

        console.log("[Tool] getBlockMeta:", { blockIds: blockIds.length, fields });

        // Format date helper
        const formatDate = (date: any): string => {
          if (!date) return "未知";
          const d = new Date(date);
          if (isNaN(d.getTime())) return "未知";
          const year = d.getFullYear();
          const month = String(d.getMonth() + 1).padStart(2, "0");
          const day = String(d.getDate()).padStart(2, "0");
          const hour = String(d.getHours()).padStart(2, "0");
          const min = String(d.getMinutes()).padStart(2, "0");
          return `${year}-${month}-${day} ${hour}:${min}`;
        };

        // Fetch all blocks
        const results: string[] = [];
        for (const blockId of blockIds) {
          const block = orca.state.blocks[blockId] || await orca.invokeBackend("get-block", blockId);
          if (!block) {
            results.push(`- blockid:${blockId} - 未找到`);
            continue;
          }

          const parts: string[] = [`blockid:${blockId}`];
          if (fields.includes("created")) {
            parts.push(`创建: ${formatDate(block.created)}`);
          }
          if (fields.includes("modified")) {
            parts.push(`修改: ${formatDate(block.modified)}`);
          }
          if (fields.includes("tags") && block.aliases && block.aliases.length > 0) {
            parts.push(`标签: ${block.aliases.map((t: string) => `#${t}`).join(", ")}`);
          }
          if (fields.includes("properties") && block.properties && block.properties.length > 0) {
            const props = block.properties.map((p: any) => `${p.name}: ${p.value}`).join(", ");
            parts.push(`属性: ${props}`);
          }
          results.push(`- ${parts.join(" | ")}`);
        }

        return `📋 ${blockIds.length} 个块的元数据：\n${results.join("\n")}`;
      } catch (err: any) {
        console.error(`[Tool] Error in getBlockMeta:`, err);
        return `Error getting block metadata: ${err.message}`;
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
            return `✅ Created new block: [${lastChildId}](orca-block:${lastChildId})\n⚠️ 创建成功，请勿重复调用 createBlock！`;
          }
          return `Block created but ID not returned. Please check the target location.`;
        }
        
        return `✅ Created new block: [${newBlockId}](orca-block:${newBlockId})\n⚠️ 创建成功，请勿重复调用 createBlock！`;
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
    } else if (toolName === "getBlockLinks") {
      try {
        let blockId: number | null = null;
        let blockData: any = null;
        
        // 支持通过 pageName 查找
        const pageName = args.pageName || args.page_name || args.page || args.name;
        if (pageName && typeof pageName === "string") {
          // 通过页面名称查找，直接获取 block 数据
          const block = await orca.invokeBackend("get-block-by-alias", pageName);
          if (block) {
            blockId = block.id;
            blockData = block;
          } else {
            return `Error: 找不到名为 "${pageName}" 的页面。`;
          }
        } else {
          // 通过 blockId 查找
          let blockIdRaw = args.blockId || args.block_id || args.id;
          if (typeof blockIdRaw === "string") {
            const match = blockIdRaw.match(/^(?:orca-block:|blockid:)?(\d+)$/i);
            if (match) blockIdRaw = parseInt(match[1], 10);
          }
          blockId = toFiniteNumber(blockIdRaw) ?? null;
          if (blockId) {
            // 先尝试从 state 获取，否则从 backend 获取
            blockData = orca.state.blocks[blockId];
            if (!blockData) {
              const result = await orca.invokeBackend("get-block", blockId);
              if (result) blockData = result;
            }
          }
        }
        
        if (!blockId) return "Error: 请提供 blockId 或 pageName 参数。";
        if (!blockData) return `Error: Block ${blockId} not found.`;

        const getTitle = async (id: number): Promise<string> => {
          let b = orca.state.blocks[id];
          if (!b) {
            try {
              b = await orca.invokeBackend("get-block", id);
            } catch {}
          }
          if (!b) return `Block ${id}`;
          const rawText = b.text || b.content || "";
          const text = typeof rawText === "string" ? rawText.split("\n")[0]?.trim() || "" : "";
          return text.length > 40 ? text.substring(0, 40) + "..." : (text || `Block ${id}`);
        };

        const centerTitle = await getTitle(blockId);
        const refs = blockData.refs || [];
        const backRefs = blockData.backRefs || [];
        const outCount = refs.length;
        const inCount = backRefs.length;

        // 返回链接列表（不返回 localgraph 代码块）
        if (outCount === 0 && inCount === 0) {
          return `[${centerTitle}](orca-block:${blockId}) 暂无链接关系。`;
        }
        
        let result = `[${centerTitle}](orca-block:${blockId}) 的链接关系：\n\n`;
        
        // 出链列表
        if (outCount > 0) {
          result += `**出链 (${outCount})**:\n`;
          for (const ref of refs.slice(0, 20)) {
            const targetId = ref.to;
            const title = await getTitle(targetId);
            result += `- [${title}](orca-block:${targetId})\n`;
          }
          if (outCount > 20) result += `- ...还有 ${outCount - 20} 个\n`;
          result += "\n";
        }
        
        // 入链（反链）列表
        if (inCount > 0) {
          result += `**入链/反链 (${inCount})**:\n`;
          for (const ref of backRefs.slice(0, 20)) {
            const sourceId = ref.from;
            const title = await getTitle(sourceId);
            result += `- [${title}](orca-block:${sourceId})\n`;
          }
          if (inCount > 20) result += `- ...还有 ${inCount - 20} 个\n`;
        }
        
        return result.trim();
      } catch (err: any) {
        return `Error getting block links: ${err.message}`;
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
