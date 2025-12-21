/**
 * AI Tools Module
 * Defines available tools for AI and executes tool calls
 */

import type { OpenAITool } from "./openai-client";
import {
  searchBlocksByTag,
  searchBlocksByText,
  queryBlocksByTag,
  searchTasks,
  searchJournalEntries,
  getTodayJournal,
  getRecentJournals,
  queryBlocksAdvanced,
  searchBlocksByReference,
  getTagSchema,
  getCachedTagSchema,
  getPageByName,
} from "./search-service";
import { parsePropertyFilters } from "../utils/query-filter-parser";
import type { QueryDateSpec, QueryCondition, QueryCombineMode } from "../utils/query-types";

/**
 * AI Tool definitions for OpenAI function calling
 */
export const TOOLS: OpenAITool[] = [
  {
    type: "function",
    function: {
      name: "searchBlocksByTag",
      description: "Search for notes/blocks that have a specific tag. Use this when the user asks to find notes with a particular tag or category.",
      parameters: {
        type: "object",
        properties: {
          tagName: {
            type: "string",
            description: "The tag name to search for (e.g., '爱情', 'work', 'ideas')",
          },
          maxResults: {
            type: "number",
            description: "Maximum number of results to return (default: 50, max: 50)",
          },
        },
        required: ["tagName"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "searchBlocksByText",
      description: "Search for notes/blocks containing specific text or keywords. Use this when the user wants to find notes by content.",
      parameters: {
        type: "object",
        properties: {
          searchText: {
            type: "string",
            description: "The text or keywords to search for",
          },
          maxResults: {
            type: "number",
            description: "Maximum number of results to return (default: 50, max: 50)",
          },
        },
        required: ["searchText"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "queryBlocksByTag",
      description: "Advanced query for blocks with a specific tag and property filters. Use this when the user wants to filter notes by tag properties (e.g., 'find tasks with priority >= 8', 'find notes without a category'). This supports property comparisons like >=, >, <, <=, ==, !=, 'is null', 'not null'.",
      parameters: {
        type: "object",
        properties: {
          tagName: {
            type: "string",
            description: "The tag name to query for (e.g., 'task', 'note', 'project')",
          },
          tag: {
            type: "string",
            description: "Alias of tagName (some clients/models may send `tag` instead).",
          },
          properties: {
            type: "array",
            description: "Array of property filters to apply",
            items: {
              type: "object",
              properties: {
                name: {
                  type: "string",
                  description: "Property name (e.g., 'priority', 'category', 'author')",
                },
                op: {
                  type: "string",
                  description: "Comparison operator: '>=', '>', '<=', '<', '==', '!=', 'is null', 'not null', 'includes', 'not includes'",
                },
                value: {
                  description: "Value to compare against (can be string, number, or boolean). Not required for 'is null' and 'not null' operators.",
                },
              },
              required: ["name", "op"],
            },
          },
          property_filters: {
            type: "string",
            description: "Optional compact filter string like \"priority == 6\" or \"priority >= 8 and category is null\". Prefer `properties` when possible.",
          },
          propertyFilter: {
            type: "string",
            description: "Alias of `property_filters` (some clients/models may send `propertyFilter`).",
          },
          filter: {
            type: "string",
            description: "Alias of `property_filters` (some clients/models may send `filter`).",
          },
          query: {
            type: "string",
            description: "Alias of `property_filters` (some clients/models may send `query` like \"priority > 5\" along with `tagName`/`tag`).",
          },
          maxResults: {
            type: "number",
            description: "Maximum number of results to return (default: 50, max: 50)",
          },
        },
        required: ["tagName"],
      },
    },
  },
  // ========== New Advanced Query Tools ==========
  {
    type: "function",
    function: {
      name: "searchTasks",
      description: "Search for task blocks with optional completion status filter. Use when user asks about todos, tasks, or checklists (e.g., 'show my incomplete tasks', 'find all done tasks').",
      parameters: {
        type: "object",
        properties: {
          completed: {
            type: "boolean",
            description: "Filter by completion status: true for completed tasks, false for incomplete tasks. Omit to get all tasks.",
          },
          maxResults: {
            type: "number",
            description: "Maximum number of results to return (default: 50, max: 50)",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "searchJournalEntries",
      description: "Search for journal/daily note entries within a date range. Use when user asks about journal entries, daily notes, or diary entries (e.g., 'show last week's journal', 'find journal from yesterday').",
      parameters: {
        type: "object",
        properties: {
          startOffset: {
            type: "number",
            description: "Start date as days offset from today (negative for past, e.g., -7 for 7 days ago, 0 for today). Positive numbers are accepted and treated as days ago (e.g., 7 -> -7).",
          },
          endOffset: {
            type: "number",
            description: "End date as days offset from today (negative for past, e.g., -1 for yesterday, 0 for today). Positive numbers are accepted and treated as days ago (e.g., 1 -> -1).",
          },
          maxResults: {
            type: "number",
            description: "Maximum number of results to return (default: 50, max: 50)",
          },
        },
        required: ["startOffset", "endOffset"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getTodayJournal",
      description: "获取今天的 Journal（日记）页面内容，用于快速总结今日记录。优先使用此工具，而不是通过查询/搜索间接定位。",
      parameters: {
        type: "object",
        properties: {
          includeChildren: {
            type: "boolean",
            description: "是否包含子块内容（默认：true）。设为 false 只返回 Journal 根块",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getRecentJournals",
      description: "获取最近 N 天（默认 7 天，包含今天）的 Journal 内容，用于总结近一周/近几天的记录。",
      parameters: {
        type: "object",
        properties: {
          days: {
            type: "number",
            description: "要获取的天数（默认：7）。例如：7=近一周，3=近三天，0=仅今天。",
          },
          includeChildren: {
            type: "boolean",
            description: "是否包含子块内容（默认：true）。设为 false 只返回 Journal 根块列表",
          },
          maxResults: {
            type: "number",
            description: "最多返回多少条 Journal（默认：20，最大：50）。通常 7 天最多 7 条。",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "query_blocks",
      description: "Execute complex queries with multiple conditions using AND, OR, or hierarchical matching. Use for complex searches combining tags, text, and other criteria (e.g., 'find notes tagged urgent OR important', 'find tasks containing deadline inside project notes').",
      parameters: {
        type: "object",
        properties: {
          conditions: {
            type: "array",
            description: "Array of query conditions to combine",
            items: {
              type: "object",
              properties: {
                type: {
                  type: "string",
                  enum: ["tag", "text", "task", "journal", "ref", "block", "blockMatch"],
                  description: "Type of condition: tag (match tag), text (match content), task (match tasks), journal (date range), ref (references), block (block properties), blockMatch (specific block ID)",
                },
                name: { type: "string", description: "For tag: the tag name" },
                text: { type: "string", description: "For text: the text to search" },
                completed: { type: "boolean", description: "For task: completion status" },
                blockId: { type: "number", description: "For ref/blockMatch: the block ID" },
                hasTags: { type: "boolean", description: "For block: whether has tags" },
                startOffset: { type: "number", description: "For journal: start date offset in days" },
                endOffset: { type: "number", description: "For journal: end date offset in days" },
              },
              required: ["type"],
            },
          },
          combineMode: {
            type: "string",
            enum: ["and", "or", "chain_and"],
            description: "How to combine conditions: 'and' (all must match), 'or' (any can match), 'chain_and' (match in ancestor/descendant hierarchy)",
          },
          maxResults: {
            type: "number",
            description: "Maximum number of results to return (default: 50, max: 50)",
          },
        },
        required: ["conditions", "combineMode"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "get_tag_schema",
      description: "Get the property schema (definitions) for a specific tag, including property names, types, and for choice-type properties (like status, priority with predefined options), the mapping between option labels and their internal values. **IMPORTANT**: Call this tool BEFORE querying with property filters if you're uncertain about option values. This prevents SQLITE_ERROR caused by using display text instead of internal IDs.",
      parameters: {
        type: "object",
        properties: {
          tagName: {
            type: "string",
            description: "The tag name to get schema for (e.g., 'task', 'project')",
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
      description: "Search for notes/blocks that reference (link to) a specific page using [[page name]] wiki-link syntax. Use this when the user asks 'which notes reference [[X]]?', 'find backlinks to X', or '哪些笔记引用了[[X]]？'. This is MORE PRECISE than text search as it only matches actual wiki-links, not plain text mentions.",
      parameters: {
        type: "object",
        properties: {
          pageName: {
            type: "string",
            description: "The page name or alias to find references to (e.g., '项目A', 'Project A', 'meeting notes')",
          },
          page_name: {
            type: "string",
            description: "Alias of pageName (some clients/models may send `page_name` instead).",
          },
          maxResults: {
            type: "number",
            description: "Maximum number of results to return (default: 50, max: 50)",
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
      description: "直接读取指定名称的页面内容。当用户明确要求「读取/查看/打开某个页面」时使用此工具。比 searchBlocksByText 更精准，因为它直接通过页面名称获取，而不是搜索。适用场景：「读取名为XX的页面」、「查看[[XX]]的内容」、「打开XX笔记」",
      parameters: {
        type: "object",
        properties: {
          pageName: {
            type: "string",
            description: "要读取的页面名称或别名（e.g., \"项目方案\", \"Project A\", \"会议记录\"）",
          },
          includeChildren: {
            type: "boolean",
            description: "是否包含子块内容（默认：true）。设为 false 只返回页面标题块",
          },
        },
        required: ["pageName"],
      },
    },
  },
];

/**
 * Format a property value for display
 */
function formatPropValue(value: any): string {
  if (value === null) return "null";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  try {
    const s = JSON.stringify(value);
    return s.length > 120 ? `${s.slice(0, 117)}...` : s;
  } catch {
    return String(value);
  }
}

/**
 * Execute a tool call and return the result
 * @param toolName - Name of the tool to execute
 * @param args - Arguments passed to the tool
 * @returns Result string to send back to AI
 */
export async function executeTool(toolName: string, args: any): Promise<string> {
  try {
    const toFiniteNumber = (value: any): number | undefined => {
      if (typeof value === "number" && Number.isFinite(value)) return value;
      if (typeof value === "string" && value.trim()) {
        const n = Number(value);
        if (Number.isFinite(n)) return n;
      }
      return undefined;
    };

    // Orca's relative journal dates typically use negative values for past (e.g., -7 = 7 days ago).
    // Accept both conventions from models/users: 7 => -7, -7 => -7.
    const normalizeJournalOffset = (value: any, fallback: number): number => {
      const n = toFiniteNumber(value);
      const v = Number.isFinite(n as number) ? Math.trunc(n as number) : fallback;
      if (v === 0) return 0;
      return v > 0 ? -v : v;
    };

    if (toolName === "searchBlocksByTag") {
      // Support multiple parameter names: tagName, tag, query
      let tagName = args.tagName || args.tag_name || args.tag || args.query;
      const maxResults = args.maxResults || 50;

      // Handle array parameters (AI sometimes sends ["tag"] instead of "tag")
      if (Array.isArray(tagName)) {
        tagName = tagName[0];
      }

      if (!tagName) {
        console.error("[Tool] Missing tag name parameter");
        return "Error: Missing tag name parameter";
      }

      const results = await searchBlocksByTag(tagName, Math.min(maxResults, 50));

      if (results.length === 0) {
        return `No notes found with tag "${tagName}".`;
      }

      // Format with clickable block links
      const summary = results.map((r, i) => {
        const linkTitle = r.title.replace(/[\[\]]/g, '');  // Escape brackets
        const body = r.fullContent ?? r.content;
        return `${i + 1}. [${linkTitle}](orca-block:${r.id})\n${body}`;
      }).join("\n\n");

      return `Found ${results.length} note(s) with tag "${tagName}":\n${summary}`;
    } else if (toolName === "searchBlocksByText") {
      // Support multiple parameter names: searchText, text, query, queries
      let searchText = args.searchText || args.search_text || args.text || args.query || args.queries;

      // Handle array parameters (AI sometimes sends ["text"] instead of "text")
      if (Array.isArray(searchText)) {
        searchText = searchText[0];
      }

      const maxResults = args.maxResults || 50;

      if (!searchText || typeof searchText !== "string") {
        console.error("[Tool] Missing or invalid search text parameter");
        return "Error: Missing search text parameter";
      }

      const results = await searchBlocksByText(searchText, Math.min(maxResults, 50));

      if (results.length === 0) {
        return `No notes found containing "${searchText}".`;
      }

      // Format with clickable block links
      const summary = results.map((r, i) => {
        const linkTitle = r.title.replace(/[\[\]]/g, '');  // Escape brackets
        const body = r.fullContent ?? r.content;
        return `${i + 1}. [${linkTitle}](orca-block:${r.id})\n${body}`;
      }).join("\n\n");

      return `Found ${results.length} note(s) containing "${searchText}":\n${summary}`;
    } else if (toolName === "queryBlocksByTag") {
      // Advanced query with property filters
      let tagName = typeof args.tagName === "string"
        ? args.tagName
        : (typeof args.tag_name === "string" ? args.tag_name : (typeof args.tag === "string" ? args.tag : undefined));

      const queryText = typeof args.query === "string" ? args.query : undefined;
      const propertyFiltersInput = args.property_filters
        ?? args.propertyFilters
        ?? args.propertyFilter
        ?? args.property_filter
        ?? args.filters
        ?? args.filter;
      let properties: any[] = [];

      if (Array.isArray(args.properties)) {
        properties = args.properties;
      } else if (args.properties && typeof args.properties === "object") {
        properties = [args.properties];
      } else if (typeof args.properties === "string") {
        properties = parsePropertyFilters(args.properties);
      }

      if (propertyFiltersInput !== undefined) {
        properties = [...properties, ...parsePropertyFilters(propertyFiltersInput)];
      }

      // Handle flat parameter format: { property, operator, value }
      // Some AI models send single property filter as flat args instead of properties array
      if (properties.length === 0 && args.property && args.operator) {
        const opMap: Record<string, string> = {
          ">=": ">=", ">": ">", "<=": "<=", "<": "<",
          "==": "==", "=": "==", "!=": "!=", "<>": "!=",
          "is null": "is null", "isnull": "is null", "null": "is null",
          "not null": "not null", "notnull": "not null", "not_null": "not null",
          "includes": "includes", "contains": "includes",
          "not includes": "not includes", "not_includes": "not includes",
        };
        const normalizedOp = opMap[String(args.operator).toLowerCase()] ?? args.operator;
        properties = [{
          name: args.property,
          op: normalizedOp,
          value: args.value,
        }];
        console.log("[queryBlocksByTag] Converted flat args to properties:", properties);
      }

      if (queryText && queryText.trim()) {
        if (tagName) {
          const trimmedTag = String(tagName).trim();
          const trimmedQuery = queryText.trim();
          if (trimmedQuery !== trimmedTag) {
            const parsedFromQuery = parsePropertyFilters(trimmedQuery);
            if (parsedFromQuery.length === 0) {
              return "Error: Unable to parse property filters from `query`. Use `properties` array or a string like \"priority == 6\".";
            }
            properties = [...properties, ...parsedFromQuery];
          }
        } else {
          const parsedFromQuery = parsePropertyFilters(queryText);
          if (parsedFromQuery.length > 0) {
            properties = [...properties, ...parsedFromQuery];
          } else {
            tagName = queryText;
          }
        }
      }
      const maxResults = args.maxResults || 50;

      if (!tagName) {
        console.error("[Tool] Missing tag name parameter");
        return "Error: Missing tag name parameter";
      }

      if (propertyFiltersInput !== undefined && properties.length === 0) {
        return "Error: Unable to parse property filters. Use `properties` array or a string like \"priority == 6\".";
      }

      // Enrich properties with type information from tag schema (using cached version)
      if (properties.length > 0) {
        try {
          const schema = await getCachedTagSchema(tagName);
          properties = properties.map((prop: any) => {
            // If type is already set, use it
            if (prop.type !== undefined) {
              return prop;
            }
            
            // Look up the property in the schema
            const schemaProp = schema.properties.find(p => p.name === prop.name);
            if (schemaProp) {
              return {
                ...prop,
                type: schemaProp.type,
              };
            }
            
            // Property not found in schema, return as-is
            console.warn(`[queryBlocksByTag] Property "${prop.name}" not found in tag schema`);
            return prop;
          });
        } catch (error) {
          console.warn(`[queryBlocksByTag] Failed to fetch tag schema for type enrichment:`, error);
          // Continue without type enrichment
        }
      }

      const results = await queryBlocksByTag(tagName, {
        properties,
        maxResults: Math.min(maxResults, 50),
      });

      if (results.length === 0) {
        const filterDesc = properties.length > 0
          ? ` with filters: ${properties.map((p: any) => `${p.name} ${p.op} ${p.value ?? ''}`).join(', ')}`
          : '';
        return `No notes found with tag "${tagName}"${filterDesc}.`;
      }

      // Format with clickable block links
      const summary = results.map((r, i) => {
        const linkTitle = r.title.replace(/[\[\]]/g, '');  // Escape brackets
        const body = r.fullContent ?? r.content;
        const propValues = (r as any).propertyValues && typeof (r as any).propertyValues === "object"
          ? (r as any).propertyValues
          : null;
        const propSuffix = propValues && Object.keys(propValues).length > 0
          ? ` (${Object.entries(propValues).map(([k, v]) => `${k}=${formatPropValue(v)}`).join(", ")})`
          : "";
        return `${i + 1}. [${linkTitle}](orca-block:${r.id})${propSuffix}\n${body}`;
      }).join("\n\n");

      const filterDesc = properties.length > 0
        ? ` (filtered by: ${properties.map((p: any) => `${p.name} ${p.op} ${p.value ?? ''}`).join(', ')})`
        : '';
      return `Found ${results.length} note(s) with tag "${tagName}"${filterDesc}:\n${summary}`;
    } else if (toolName === "searchTasks") {
      // Search for task blocks
      const completed = typeof args.completed === "boolean" ? args.completed : undefined;
      const maxResults = args.maxResults || 50;

      console.log("[Tool] searchTasks:", { completed, maxResults });

      const results = await searchTasks(completed, { maxResults: Math.min(maxResults, 50) });

      if (results.length === 0) {
        const statusDesc = completed === true ? "completed" : completed === false ? "incomplete" : "";
        return `No ${statusDesc} tasks found.`;
      }

      const summary = results.map((r, i) => {
        const linkTitle = r.title.replace(/[\[\]]/g, '');
        const body = r.fullContent ?? r.content;
        return `${i + 1}. [${linkTitle}](orca-block:${r.id})\n${body}`;
      }).join("\n\n");

      const statusDesc = completed === true ? "completed " : completed === false ? "incomplete " : "";
      return `Found ${results.length} ${statusDesc}task(s):\n${summary}`;
    } else if (toolName === "searchJournalEntries") {
      // Search for journal entries in date range
      let startOffset = normalizeJournalOffset(args.startOffset ?? args.start_offset, -7);
      let endOffset = normalizeJournalOffset(args.endOffset ?? args.end_offset, 0);
      const maxResults = args.maxResults || 50;

      if (startOffset > endOffset) {
        [startOffset, endOffset] = [endOffset, startOffset];
      }

      const startDaysAgo = Math.abs(startOffset);
      const endDaysAgo = Math.abs(endOffset);

      console.log("[Tool] searchJournalEntries:", {
        startOffset,
        endOffset,
        startDaysAgo,
        endDaysAgo,
        maxResults,
      });

      const start: QueryDateSpec = { type: "relative", value: startOffset, unit: "d" };
      const end: QueryDateSpec = { type: "relative", value: endOffset, unit: "d" };

      const results = await searchJournalEntries(start, end, { maxResults: Math.min(maxResults, 50) });

      if (results.length === 0) {
        return `No journal entries found from ${startDaysAgo} to ${endDaysAgo} days ago.`;
      }

      const summary = results.map((r, i) => {
        const linkTitle = r.title.replace(/[\[\]]/g, '');
        const body = r.fullContent ?? r.content;
        return `${i + 1}. [${linkTitle}](orca-block:${r.id})\n${body}`;
      }).join("\n\n");

      return `Found ${results.length} journal entries from ${startDaysAgo} to ${endDaysAgo} days ago:\n${summary}`;
    } else if (toolName === "getTodayJournal") {
      const includeChildren = args.includeChildren !== false; // default true

      console.log("[Tool] getTodayJournal:", { includeChildren });

      const result = await getTodayJournal(includeChildren);
      const linkTitle = result.title.replace(/[\[\]]/g, "");
      const body = result.fullContent ?? result.content;

      return `# ${linkTitle}

${body}

---
📄 [查看原页面](orca-block:${result.id})`;
    } else if (toolName === "getRecentJournals") {
      let days = args.days ?? args.day ?? args.rangeDays ?? args.lastDays ?? args.n;
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

      if (results.length === 0) {
        return `No journal entries found in the last ${normalizedDays} day(s).`;
      }

      const summary = results.map((r, i) => {
        const linkTitle = r.title.replace(/[\[\]]/g, "");
        const body = r.fullContent ?? r.content;
        return `${i + 1}. [${linkTitle}](orca-block:${r.id})\n${body}`;
      }).join("\n\n");

      return `Found ${results.length} journal entries in the last ${normalizedDays} day(s):\n${summary}`;
    } else if (toolName === "query_blocks") {
      // Advanced query with multiple conditions
      const conditions = args.conditions;
      const combineMode = args.combineMode || "and";
      const maxResults = args.maxResults || 50;

      if (!Array.isArray(conditions) || conditions.length === 0) {
        return "Error: At least one condition is required for query_blocks.";
      }

      console.log("[Tool] query_blocks:", { conditions, combineMode, maxResults });

      // Convert AI-friendly conditions to internal format
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
        pageSize: Math.min(maxResults, 50),
      });

      if (results.length === 0) {
        return `No blocks found matching the ${combineMode.toUpperCase()} query.`;
      }

      const summary = results.map((r, i) => {
        const linkTitle = r.title.replace(/[\[\]]/g, '');
        const body = r.fullContent ?? r.content;
        return `${i + 1}. [${linkTitle}](orca-block:${r.id})\n${body}`;
      }).join("\n\n");

      return `Found ${results.length} block(s) matching ${combineMode.toUpperCase()} query:\n${summary}`;
    } else if (toolName === "get_tag_schema") {
      // Get tag schema with property definitions
      let tagName = args.tagName || args.tag_name || args.tag;

      // Handle array parameters
      if (Array.isArray(tagName)) {
        tagName = tagName[0];
      }

      if (!tagName) {
        console.error("[Tool] Missing tag name parameter");
        return "Error: Missing tag name parameter";
      }

      const schema = await getTagSchema(tagName);

      if (schema.properties.length === 0) {
        return `Tag "${tagName}" found but has no properties defined.`;
      }

      // Format schema as markdown
      let result = `Schema for tag "${schema.tagName}":\n\n`;

      schema.properties.forEach((prop, i) => {
        result += `${i + 1}. **${prop.name}** (${prop.typeName}, type code: ${prop.type})\n`;

        if (prop.options && prop.options.length > 0) {
          result += `   Options:\n`;
          prop.options.forEach((opt) => {
            result += `   - "${opt.label}" → value: ${opt.value}\n`;
          });
        }
      });

      result += `\n**Usage tip**: When querying with property filters, use the numeric values shown above for choice properties. For example:\n`;
      result += `- For single-choice properties, use: { name: "propertyName", op: "==", value: <numeric_value> }\n`;
      result += `- For number/text properties, use the appropriate operator and value type.\n`;

      return result;
    } else if (toolName === "searchBlocksByReference") {
      // Search for blocks that reference a specific page
      // Support many parameter name variations that AI models might use
      let pageName = args.pageName || args.page_name || args.page || args.alias || args.name 
        || args.query || args.reference || args.target || args.text || args.blockName
        || args.searchText || args.pageTitle || args.title || args.reference_page_name;
      const maxResults = args.maxResults || 50;

      console.log("[Tool] searchBlocksByReference args received:", JSON.stringify(args));

      // Handle array parameters (AI sometimes sends ["name"] instead of "name")
      if (Array.isArray(pageName)) {
        pageName = pageName[0];
      }

      if (!pageName) {
        console.error("[Tool] Missing page name parameter. Args:", args);
        return "Error: Missing page name parameter. Please specify which page to find references to.";
      }

      console.log("[Tool] searchBlocksByReference:", { pageName, maxResults });

      const results = await searchBlocksByReference(pageName, Math.min(maxResults, 50));

      if (results.length === 0) {
        return `No blocks found referencing "[[${pageName}]]". This page may have no backlinks, or the page name may not exist.`;
      }

      const summary = results.map((r, i) => {
        const linkTitle = r.title.replace(/[\[\]]/g, '');
        const body = r.fullContent ?? r.content;
        return `${i + 1}. [${linkTitle}](orca-block:${r.id})\n${body}`;
      }).join("\n\n");

      return `Found ${results.length} block(s) referencing "[[${pageName}]]":\n${summary}`;
    } else if (toolName === "getPage") {
      // Get page content by name
      let pageName = args.pageName || args.page_name || args.page || args.name
        || args.alias || args.title || args.pageTitle;
      const includeChildren = args.includeChildren !== false; // default true

      // Handle array parameters
      if (Array.isArray(pageName)) {
        pageName = pageName[0];
      }

      if (!pageName) {
        console.error("[Tool] Missing page name parameter");
        return "Error: Missing page name parameter. Please specify which page to read.";
      }

      console.log("[Tool] getPage:", { pageName, includeChildren });

      try {
        const result = await getPageByName(pageName, includeChildren);

        const linkTitle = result.title.replace(/[\[\]]/g, "");
        const body = result.fullContent ?? result.content;

        return `# ${linkTitle}

${body}

---
📄 [查看原页面](orca-block:${result.id})`;
      } catch (error: any) {
        // If page not found, provide helpful error message
        if (error.message?.includes("not found")) {
          return `Page "${pageName}" not found. Please check:
1. The page name is correct (case-sensitive)
2. The page exists in your notes
3. Try using searchBlocksByText("${pageName}") to find similar pages`;
        }
        throw error;
      }
    } else {
      console.error("[Tool] Unknown tool:", toolName);
      return `Unknown tool: ${toolName}`;
    }
  } catch (error: any) {
    console.error("[Tool] Error:", error);
    return `Error executing ${toolName}: ${error?.message ?? error ?? "unknown error"}`;
  }
}
