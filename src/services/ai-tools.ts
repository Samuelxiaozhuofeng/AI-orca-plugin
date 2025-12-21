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
  queryBlocksAdvanced,
  getTagSchema,
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
            description: "Start date as days offset from today (negative for past, e.g., -7 for 7 days ago, 0 for today)",
          },
          endOffset: {
            type: "number",
            description: "End date as days offset from today (negative for past, e.g., -1 for yesterday, 0 for today)",
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
    if (toolName === "searchBlocksByTag") {
      // Support multiple parameter names: tagName, tag, query
      const tagName = args.tagName || args.tag || args.query;
      const maxResults = args.maxResults || 50;

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
      let searchText = args.searchText || args.text || args.query || args.queries;

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
        : (typeof args.tag === "string" ? args.tag : undefined);

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

      // Enrich properties with type information from tag schema
      if (properties.length > 0) {
        try {
          const schema = await getTagSchema(tagName);
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
      const startOffset = typeof args.startOffset === "number" ? args.startOffset : -7;
      const endOffset = typeof args.endOffset === "number" ? args.endOffset : 0;
      const maxResults = args.maxResults || 50;

      console.log("[Tool] searchJournalEntries:", { startOffset, endOffset, maxResults });

      const start: QueryDateSpec = { type: "relative", value: startOffset, unit: "d" };
      const end: QueryDateSpec = { type: "relative", value: endOffset, unit: "d" };

      const results = await searchJournalEntries(start, end, { maxResults: Math.min(maxResults, 50) });

      if (results.length === 0) {
        return `No journal entries found from ${startOffset} to ${endOffset} days.`;
      }

      const summary = results.map((r, i) => {
        const linkTitle = r.title.replace(/[\[\]]/g, '');
        const body = r.fullContent ?? r.content;
        return `${i + 1}. [${linkTitle}](orca-block:${r.id})\n${body}`;
      }).join("\n\n");

      return `Found ${results.length} journal entries from ${startOffset} to ${endOffset} days:\n${summary}`;
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
            return {
              type: "journal" as const,
              start: { type: "relative" as const, value: c.startOffset ?? -7, unit: "d" as const },
              end: { type: "relative" as const, value: c.endOffset ?? 0, unit: "d" as const },
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
      const tagName = args.tagName || args.tag;

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
    } else {
      console.error("[Tool] Unknown tool:", toolName);
      return `Unknown tool: ${toolName}`;
    }
  } catch (error: any) {
    console.error("[Tool] Error:", error);
    return `Error executing ${toolName}: ${error?.message ?? error ?? "unknown error"}`;
  }
}
