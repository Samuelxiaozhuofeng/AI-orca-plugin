/**
 * AI Tools Module
 * Defines available tools for AI and executes tool calls
 */

import type { OpenAITool } from "./openai-client";
import type { Skill } from "../store/skill-store";
import { normalizeToolName, ensureSkillsLoaded } from "./skill-service";
import { skillStore } from "../store/skill-store";
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
import { formatBlockResult, addLinkPreservationNote } from "../utils/block-link-enhancer";
import { uiStore } from "../store/ui-store";


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
      description: "直接读取指定名称的页面内容。返回的内容中每一行都会包含 (block #ID) 格式的块 ID，你可以直接使用这些 ID 作为 createBlock 的 refBlockId。比 searchBlocksByText 更精准。适用场景：「读取名为XX的页面」、「查看[[XX]]的内容」、「打开XX笔记」",
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
  {
    type: "function",
    function: {
      name: "createBlock",
      description: "创建新的笔记块（类似 MCP insert_markdown 工具）。**必须提供 refBlockId 或 pageName 二选一**作为参考位置，以及插入位置。无需在特定 panel 中即可调用。",
      parameters: {
        type: "object",
        properties: {
          refBlockId: {
            type: "number",
            description: "参考块 ID（与 pageName 二选一必填）。**必须是数字类型**，例如：270。注意：不要使用 'orca-block:270' 格式的字符串，只需传数字 270 即可。",
          },
          pageName: {
            type: "string",
            description: "参考页面名称（与 refBlockId 二选一必填），会自动获取该页面的根块作为参考块。如果同时指定了 refBlockId 和 pageName，优先使用 refBlockId",
          },
          position: {
            type: "string",
            enum: ["before", "after", "firstChild", "lastChild"],
            description: "相对于参考块的位置。**参数名必须是 position**（不要使用 location）。可选值：before=在前面，after=在后面，firstChild=作为第一个子块，lastChild=作为最后一个子块（默认：lastChild）",
          },
          content: {
            type: "string",
            description: "块的文本内容（支持 Markdown 格式）",
          },
        },
        required: ["content"],
        // Note: We can't express "refBlockId XOR pageName required" in JSON Schema,
        // but the description makes it clear, and runtime validation enforces it
      },
    },
  },
  {
    type: "function",
    function: {
      name: "createPage",
      description: "为指定块创建页面别名，使其成为一个可通过名称引用的页面。页面本质上是具有唯一别名的块。",
      parameters: {
        type: "object",
        properties: {
          blockId: {
            type: "number",
            description: "要转为页面的块 ID（必须是数字类型）",
          },
          pageName: {
            type: "string",
            description: "页面名称/别名（唯一标识符）",
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
      description: "为指定块添加标签。标签用于分类和添加元数据。可选择性地添加属性（如日期、状态等）。",
      parameters: {
        type: "object",
        properties: {
          blockId: {
            type: "number",
            description: "要添加标签的块 ID（必须是数字类型）",
          },
          tagName: {
            type: "string",
            description: "标签名称（例如：'project', 'task', 'deadline'）",
          },
          properties: {
            type: "array",
            description: "可选的标签属性列表（例如：日期、状态等）",
            items: {
              type: "object",
              properties: {
                name: {
                  type: "string",
                  description: "属性名称（例如：'date', 'status', 'priority'）",
                },
                value: {
                  description: "属性值（可以是字符串、数字或日期）",
                },
              },
              required: ["name", "value"],
            },
          },
        },
        required: ["blockId", "tagName"],
      },
    },
  },
  // ========== Skill System Tools ==========
  {
    type: "function",
    function: {
      name: "searchSkills",
      description: "搜索用户定义的技能（#skill 标签）。当用户请求涉及特定领域（如翻译、写作、数据分析）时，可搜索是否有相关技能可用。找到相关技能后，使用 getSkillDetails 获取完整内容。",
      parameters: {
        type: "object",
        properties: {
          query: {
            type: "string",
            description: "搜索关键词，匹配技能名称和描述（可选）",
          },
          type: {
            type: "string",
            enum: ["prompt", "tools"],
            description: "筛选技能类型：prompt（提示词型）或 tools（工具型）（可选）",
          },
        },
      },
    },
  },
  {
    type: "function",
    function: {
      name: "getSkillDetails",
      description: "获取指定技能的完整内容，包括提示词、工具列表等。使用 searchSkills 返回的技能 ID 调用此工具。获取详情后，你应该按照技能定义的指令行事。",
      parameters: {
        type: "object",
        properties: {
          skillId: {
            type: "number",
            description: "技能 ID（从 searchSkills 结果获取）",
          },
        },
        required: ["skillId"],
      },
    },
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Skill-based Tool Filtering
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 根据 Skill 过滤可用工具集
 * @param skill - 当前激活的 Skill，如果为 null 或不是 tools 类型则返回全部工具
 * @returns 过滤后的工具数组
 */
export function filterToolsBySkill(skill: Skill | null): OpenAITool[] {
  // 如果没有 Skill 或不是 tools 类型，返回全部工具
  if (!skill || skill.type !== "tools" || !skill.tools?.length) {
    return TOOLS;
  }

  // 规范化 Skill 中声明的工具名
  const normalizedNames = new Set(skill.tools.map(normalizeToolName));

  // 过滤工具
  const filtered = TOOLS.filter((tool) =>
    normalizedNames.has(tool.function.name)
  );

  // 如果所有工具名都无效，回退到全部工具
  if (filtered.length === 0) {
    console.warn(
      `[filterToolsBySkill] No valid tools found for skill "${skill.name}", falling back to all tools. ` +
      `Declared tools: ${skill.tools.join(", ")}`
    );
    return TOOLS;
  }

  // 检查未识别的工具名
  const recognizedNames = new Set(filtered.map((t) => t.function.name));
  const unrecognized = skill.tools.filter(
    (name) => !recognizedNames.has(normalizeToolName(name))
  );
  if (unrecognized.length > 0) {
    console.warn(
      `[filterToolsBySkill] Unrecognized tool names in skill "${skill.name}": ${unrecognized.join(", ")}`
    );
  }

  return filtered;
}

/**
 * 获取块的根页面 ID（向上追溯到 parent === null 的块）
 * @param blockId - 要查询的块 ID
 * @returns 根块 ID，如果查找失败返回 undefined
 */
async function getRootBlockId(blockId: number): Promise<number | undefined> {
  try {
    let currentBlock: any = orca.state.blocks[blockId];

    // 如果 state 中没有，从后端获取
    if (!currentBlock) {
      currentBlock = await orca.invokeBackend("get-block", blockId);
      if (!currentBlock) return undefined;
    }

    // 向上追溯到根块
    while (currentBlock && currentBlock.parent !== null) {
      const parentId: number = currentBlock.parent;
      let parentBlock: any = orca.state.blocks[parentId];

      if (!parentBlock) {
        parentBlock = await orca.invokeBackend("get-block", parentId);
        if (!parentBlock) break; // 无法继续追溯
      }

      currentBlock = parentBlock;
    }

    return currentBlock ? currentBlock.id : undefined;
  } catch (error) {
    console.warn(`[getRootBlockId] Failed to get root block for ${blockId}:`, error);
    return undefined;
  }
}

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

      // Format with clickable block links using utility
      const preservationNote = addLinkPreservationNote(results.length);
      const summary = results.map((r, i) => formatBlockResult(r, i)).join("\n\n");

      return `${preservationNote}Found ${results.length} note(s) with tag "${tagName}":\n${summary}`;
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

      // Format with clickable block links using utility
      const preservationNote = addLinkPreservationNote(results.length);
      const summary = results.map((r, i) => formatBlockResult(r, i)).join("\n\n");

      return `${preservationNote}Found ${results.length} note(s) containing "${searchText}":\n${summary}`;
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

      // Format with clickable block links using utility
      const preservationNote = addLinkPreservationNote(results.length);
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
      return `${preservationNote}Found ${results.length} note(s) with tag "${tagName}"${filterDesc}:\n${summary}`;
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

      const preservationNote = addLinkPreservationNote(results.length);
      const summary = results.map((r, i) => formatBlockResult(r, i)).join("\n\n");

      const statusDesc = completed === true ? "completed " : completed === false ? "incomplete " : "";
      return `${preservationNote}Found ${results.length} ${statusDesc}task(s):\n${summary}`;
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

      const preservationNote = addLinkPreservationNote(results.length);
      const summary = results.map((r, i) => formatBlockResult(r, i)).join("\n\n");

      return `${preservationNote}Found ${results.length} journal entries from ${startDaysAgo} to ${endDaysAgo} days ago:\n${summary}`;
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

      const preservationNote = addLinkPreservationNote(results.length);
      const summary = results.map((r, i) => formatBlockResult(r, i)).join("\n\n");

      return `${preservationNote}Found ${results.length} journal entries in the last ${normalizedDays} day(s):\n${summary}`;
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

      const preservationNote = addLinkPreservationNote(results.length);
      const summary = results.map((r, i) => formatBlockResult(r, i)).join("\n\n");

      return `${preservationNote}Found ${results.length} block(s) matching ${combineMode.toUpperCase()} query:\n${summary}`;
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

      const preservationNote = addLinkPreservationNote(results.length);
      const summary = results.map((r, i) => formatBlockResult(r, i)).join("\n\n");

      return `${preservationNote}Found ${results.length} block(s) referencing "[[${pageName}]]":\n${summary}`;
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
    } else if (toolName === "createBlock") {
      // Parse and validate parameters - support multiple field name variations

      // Extract refBlockId - support "orca-block:274" format
      let refBlockIdRaw = args.refBlockId ?? args.ref_block_id ?? args.blockId ?? args.block_id;

      // If refBlockId is a string like "orca-block:274", extract the number
      if (typeof refBlockIdRaw === "string") {
        const match = refBlockIdRaw.match(/^orca-block:(\d+)$/);
        if (match) {
          refBlockIdRaw = parseInt(match[1], 10);
        }
      }

      let refBlockId = toFiniteNumber(refBlockIdRaw);

      const pageName = typeof args.pageName === "string" ? args.pageName :
                       (typeof args.page_name === "string" ? args.page_name :
                       (typeof args.page === "string" ? args.page :
                       (typeof args.title === "string" ? args.title : undefined)));

      // If pageName is provided but no refBlockId, get the page's root block
      if (!refBlockId && pageName) {
        try {
          const pageResult = await getPageByName(pageName, false);
          refBlockId = pageResult.id;
        } catch (error: any) {
          return `Error: Page "${pageName}" not found. Please check the page name or use refBlockId instead.`;
        }
      }

      if (refBlockId === undefined) {
        // Provide helpful error message with context
        let helpfulHint = "";

        // Try to suggest current context
        if (uiStore.lastRootBlockId) {
          helpfulHint = `\n\nHint: You can use the current page's root block: refBlockId=${uiStore.lastRootBlockId}`;
        }

        // Show available parameter aliases
        const aliases = `
Supported parameter names:
- refBlockId, ref_block_id, blockId, or block_id (number)
- pageName, page_name, page, or title (string)`;

        return `Error: Missing reference. Please provide either refBlockId (number) or pageName (string).${aliases}${helpfulHint}`;
      }

      const position = (typeof args.position === "string" &&
                        ["before", "after", "firstChild", "lastChild"].includes(args.position))
                        ? args.position
                        : (typeof args.location === "string" &&
                          ["before", "after", "firstChild", "lastChild"].includes(args.location))
                        ? args.location
                        : (args.position === "asChild" || args.location === "asChild")
                        ? "lastChild"
                        : "lastChild";

      const content =
        typeof args.content === "string"
          ? args.content
          : (typeof args.text === "string" ? args.text : "");

      if (!content || content.trim().length === 0) {
        return "Error: Content cannot be empty.";
      }

      // Get reference block - try state first, then backend API
      let refBlock = orca.state.blocks[refBlockId];

      if (!refBlock) {
        try {
          refBlock = await orca.invokeBackend("get-block", refBlockId);
          if (!refBlock) {
            return `Error: Block ${refBlockId} not found in repository`;
          }
        } catch (error: any) {
          console.error(`[Tool] Failed to fetch block ${refBlockId}:`, error);
          return `Error: Failed to fetch block ${refBlockId}: ${error?.message || error}`;
        }
      }


      // === 智能导航：仅在必要时跳转 ===
      // 1. 获取目标块的根页面 ID
      const targetRootBlockId = await getRootBlockId(refBlockId);

      // 2. 获取当前活动面板的根页面 ID（排除 AI chat panel）
      let currentRootBlockId: number | undefined = undefined;
      let targetPanelId: string | undefined = undefined;

      try {
        const activePanelId = orca.state.activePanel;
        const aiChatPanelId = uiStore.aiChatPanelId;

        // 如果当前活动面板是 AI chat panel，使用 openInLastPanel 的逻辑
        // 否则使用当前活动面板
        if (activePanelId === aiChatPanelId) {
          // AI chat panel 处于活跃状态，需要在另一个 panel 操作
          targetPanelId = undefined; // 让 openInLastPanel 自动选择
        } else {
          // 非 AI chat panel，可以直接使用
          targetPanelId = activePanelId;
          const activePanel = orca.nav.findViewPanel(activePanelId, orca.state.panels);

          if (activePanel && activePanel.view === "block" && activePanel.viewArgs?.blockId) {
            const currentBlockId = activePanel.viewArgs.blockId;
            currentRootBlockId = await getRootBlockId(currentBlockId);
          }
        }
      } catch (error) {
        console.warn("[createBlock] Failed to get current panel's root block:", error);
      }

      // 3. 智能导航决策
      const needsNavigation = !targetRootBlockId || !currentRootBlockId || (targetRootBlockId !== currentRootBlockId);

      if (needsNavigation) {
        // 需要导航
        if (targetPanelId) {
          // 有明确的目标 panel，使用 replace
          console.log(`[createBlock] Navigating to block ${refBlockId} in panel ${targetPanelId} (root: ${targetRootBlockId})`);
          orca.nav.replace("block", { blockId: refBlockId }, targetPanelId);
        } else {
          // 当前在 AI chat panel，使用 openInLastPanel 在另一个 panel 打开
          console.log(`[createBlock] Opening block ${refBlockId} in last panel (root: ${targetRootBlockId})`);
          orca.nav.openInLastPanel("block", { blockId: refBlockId });
        }
        await new Promise(resolve => setTimeout(resolve, 100));
      } else {
        // 已经在目标页面，无需导航
        console.log(`[createBlock] Already on target page (root: ${targetRootBlockId}), skipping navigation`);
      }
      // === 智能导航结束 ===

      // Insert block using editor command
      try {
        let newBlockIds: any;
        await orca.commands.invokeGroup(async () => {
          newBlockIds = await orca.commands.invokeEditorCommand(
            "core.editor.batchInsertText",
            null,                    // cursor (not needed for programmatic insert)
            refBlock,                // reference block
            position,                // position
            content,                 // text content (Markdown will be parsed)
            false,                   // skipMarkdown = false (enable Markdown parsing)
            false,                   // skipTags = false (preserve tag extraction)
          );
        }, {
          topGroup: true,
          undoable: true
        });

        // batchInsertText returns DbId[], take the first block ID
        const newBlockId = Array.isArray(newBlockIds) ? newBlockIds[0] : newBlockIds;
        
        const positionDescriptions: Record<string, string> = {
          before: "before",
          after: "after",
          firstChild: "as first child of",
          lastChild: "as last child of"
        };
        const positionDesc = positionDescriptions[position] || "as last child of";
        
        return `Created new block: [${newBlockId}](orca-block:${newBlockId}) (${positionDesc} block ${refBlockId})`;
      } catch (error: any) {
        console.error("[Tool] Failed to create block:", error);
        return `Error: Failed to create block: ${error?.message || error}`;
      }
    } else if (toolName === "createPage") {
      // Create page alias for a block
      const blockId = toFiniteNumber(args.blockId || args.block_id || args.id);
      const pageName = args.pageName || args.page_name || args.name || args.alias;

      if (!blockId) {
        console.error("[Tool] Missing blockId parameter. Args:", args);
        return "Error: Missing blockId parameter. Please specify the block ID to convert to a page.";
      }

      if (!pageName || typeof pageName !== "string" || !pageName.trim()) {
        console.error("[Tool] Missing or invalid pageName parameter. Args:", args);
        return "Error: Missing or invalid pageName parameter. Please specify a valid page name.";
      }

      try {
        console.log(`[Tool] createPage: blockId=${blockId}, pageName=${pageName}`);

        await orca.commands.invokeEditorCommand(
          "core.editor.createAlias",
          null,         // cursor context
          pageName,     // 页面名称/别名
          blockId,      // 区块 ID
          true          // asPage: 标记为页面
        );

        return `Created page: [[${pageName}]] for block [${blockId}](orca-block:${blockId})`;
      } catch (error: any) {
        console.error("[Tool] Failed to create page:", error);
        return `Error: Failed to create page: ${error?.message || error}`;
      }
    } else if (toolName === "insertTag") {
      // Insert tag to a block
      const blockId = toFiniteNumber(args.blockId || args.block_id || args.id);
      const tagName = args.tagName || args.tag_name || args.tag || args.name;
      const properties = args.properties || args.props;

      if (!blockId) {
        console.error("[Tool] Missing blockId parameter. Args:", args);
        return "Error: Missing blockId parameter. Please specify the block ID to add tag to.";
      }

      if (!tagName || typeof tagName !== "string" || !tagName.trim()) {
        console.error("[Tool] Missing or invalid tagName parameter. Args:", args);
        return "Error: Missing or invalid tagName parameter. Please specify a valid tag name.";
      }

      try {
        console.log(`[Tool] insertTag: blockId=${blockId}, tagName=${tagName}, properties=${JSON.stringify(properties)}`);

        // Convert properties array to the format expected by insertTag
        const tagProperties = properties && Array.isArray(properties)
          ? properties.map((prop: any) => ({ name: prop.name, value: prop.value }))
          : undefined;

        // === 智能导航：确保目标块在编辑器中可见 ===
        // insertTag 命令需要目标块在当前编辑器视图中才能正确工作
        const targetRootBlockId = await getRootBlockId(blockId);

        let currentRootBlockId: number | undefined = undefined;
        let targetPanelId: string | undefined = undefined;

        try {
          const activePanelId = orca.state.activePanel;
          const aiChatPanelId = uiStore.aiChatPanelId;

          if (activePanelId === aiChatPanelId) {
            // AI chat panel 处于活跃状态，需要在另一个 panel 操作
            targetPanelId = undefined;
          } else {
            targetPanelId = activePanelId;
            const activePanel = orca.nav.findViewPanel(activePanelId, orca.state.panels);

            if (activePanel && activePanel.view === "block" && activePanel.viewArgs?.blockId) {
              const currentBlockId = activePanel.viewArgs.blockId;
              currentRootBlockId = await getRootBlockId(currentBlockId);
            }
          }
        } catch (error) {
          console.warn("[insertTag] Failed to get current panel's root block:", error);
        }

        const needsNavigation = !targetRootBlockId || !currentRootBlockId || (targetRootBlockId !== currentRootBlockId);

        if (needsNavigation) {
          if (targetPanelId) {
            console.log(`[insertTag] Navigating to block ${blockId} in panel ${targetPanelId} (root: ${targetRootBlockId})`);
            orca.nav.replace("block", { blockId: blockId }, targetPanelId);
          } else {
            console.log(`[insertTag] Opening block ${blockId} in last panel (root: ${targetRootBlockId})`);
            orca.nav.openInLastPanel("block", { blockId: blockId });
          }
          await new Promise(resolve => setTimeout(resolve, 100));
        } else {
          console.log(`[insertTag] Already on target page (root: ${targetRootBlockId}), skipping navigation`);
        }
        // === 智能导航结束 ===

        await orca.commands.invokeGroup(async () => {
          await orca.commands.invokeEditorCommand(
            "core.editor.insertTag",
            null,          // cursor context
            blockId,       // block ID
            tagName,       // tag name
            tagProperties  // optional properties
          );
        }, {
          topGroup: true,
          undoable: true
        });

        const propsDesc = tagProperties
          ? ` with properties: ${tagProperties.map((p: any) => `${p.name}=${p.value}`).join(", ")}`
          : "";

        return `Added tag #${tagName} to block [${blockId}](orca-block:${blockId})${propsDesc}`;
      } catch (error: any) {
        console.error("[Tool] Failed to insert tag:", error);
        return `Error: Failed to insert tag: ${error?.message || error}`;
      }
    } else if (toolName === "searchSkills") {
      // Search for user-defined skills
      const query = typeof args.query === "string" ? args.query.toLowerCase().trim() : "";
      const typeFilter = args.type === "prompt" || args.type === "tools" ? args.type : undefined;

      console.log("[Tool] searchSkills:", { query, typeFilter });

      try {
        // 确保 Skills 已加载
        await ensureSkillsLoaded();

        // 从缓存中获取 Skills
        let skills = skillStore.skills;

        // 根据 query 过滤（匹配名称和描述）
        if (query) {
          skills = skills.filter((s) => {
            const name = s.name.toLowerCase();
            const desc = (s.description || "").toLowerCase();
            return name.includes(query) || desc.includes(query);
          });
        }

        // 根据 type 过滤
        if (typeFilter) {
          skills = skills.filter((s) => s.type === typeFilter);
        }

        if (skills.length === 0) {
          const filterDesc = typeFilter ? ` (type: ${typeFilter})` : "";
          const queryDesc = query ? ` matching "${query}"` : "";
          return `No skills found${queryDesc}${filterDesc}. You can create skills by adding blocks with #skill tag in your notes.`;
        }

        // 返回技能列表（简化格式）
        const skillList = skills.map((s) => ({
          id: s.id,
          name: s.name,
          description: s.description || "(无描述)",
          type: s.type,
        }));

        return JSON.stringify({
          skills: skillList,
          total: skillList.length,
          hint: "使用 getSkillDetails({ skillId: <id> }) 获取技能的完整内容",
        }, null, 2);
      } catch (error: any) {
        console.error("[Tool] Failed to search skills:", error);
        return `Error: Failed to search skills: ${error?.message || error}`;
      }
    } else if (toolName === "getSkillDetails") {
      // Get full skill details by ID
      const skillId = typeof args.skillId === "number" ? args.skillId :
                     (typeof args.skill_id === "number" ? args.skill_id :
                     (typeof args.id === "number" ? args.id : undefined));

      if (skillId === undefined) {
        console.error("[Tool] Missing skillId parameter. Args:", args);
        return "Error: Missing skillId parameter. Please specify the skill ID from searchSkills results.";
      }

      console.log("[Tool] getSkillDetails:", { skillId });

      try {
        // 确保 Skills 已加载
        await ensureSkillsLoaded();

        // 从缓存中查找 Skill
        const skill = skillStore.skills.find((s) => s.id === skillId);

        if (!skill) {
          return `Error: Skill with ID ${skillId} not found. Use searchSkills to find available skills.`;
        }

        // 返回完整的 Skill 信息
        const result: Record<string, any> = {
          id: skill.id,
          name: skill.name,
          description: skill.description || "(无描述)",
          type: skill.type,
          prompt: skill.prompt || "(无提示词)",
        };

        if (skill.type === "tools" && skill.tools && skill.tools.length > 0) {
          result.tools = skill.tools;
        }

        if (skill.variables && skill.variables.length > 0) {
          result.variables = skill.variables;
        }

        // 添加使用说明
        result.usage = skill.type === "prompt"
          ? "请按照上述 prompt 指令完成用户的请求"
          : `请使用上述列出的工具完成用户的请求: ${skill.tools?.join(", ") || "无指定工具"}`;

        return JSON.stringify(result, null, 2);
      } catch (error: any) {
        console.error("[Tool] Failed to get skill details:", error);
        return `Error: Failed to get skill details: ${error?.message || error}`;
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
