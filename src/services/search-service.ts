/**
 * Search service for Orca Note
 * Provides search functionality for blocks by tags and text content
 */

import {
  buildQueryDescription,
  buildTaskQuery,
  buildJournalQuery,
  buildAdvancedQuery,
} from "../utils/query-builder";
import type {
  QueryBlocksByTagOptions,
  QueryDateSpec,
  TaskQueryOptions,
  JournalQueryOptions,
  AdvancedQueryOptions,
} from "../utils/query-types";
import { safeText, extractTitle, extractContent } from "../utils/text-utils";
import {
  unwrapBackendResult,
  unwrapBlocks,
  throwIfBackendError,
  flattenBlockTreeToLines,
  createFlattenState,
  fetchBlockTrees,
  sortAndLimitBlocks,
} from "../utils/block-utils";
import {
  extractAllProperties,
  buildPropertyValues,
  pickBlockForPropertyExtraction,
} from "../utils/property-utils";

export interface SearchResult {
  id: number;
  title: string;
  content: string;
  fullContent?: string;
  created?: Date;
  modified?: Date;
  tags?: string[];
  propertyValues?: Record<string, any>;
}

interface TransformOptions {
  includeProperties?: boolean;
  propNames?: string[];
}

/**
 * Transform block/tree pairs to SearchResult array
 */
function transformToSearchResults(
  trees: { block: any; tree: any }[],
  options: TransformOptions = {}
): SearchResult[] {
  const { includeProperties = true, propNames = [] } = options;

  return trees.map(({ block, tree }) => {
    let fullContent: string | undefined;
    if (tree) {
      const lines: string[] = [];
      const state = createFlattenState();
      flattenBlockTreeToLines(tree, 0, lines, state);

      if (!lines.length) {
        const t = safeText(block);
        if (t) lines.push(`- ${t}`);
      }
      if (state.hitLimit)
        lines.push(`- …(maxBlocks=${state.maxBlocks} reached)`);
      fullContent = lines.join("\n").trim() || undefined;
    }

    let propertyValues: Record<string, any> | undefined;
    if (includeProperties) {
      const blockForProps = pickBlockForPropertyExtraction(block, tree);
      const allProps = extractAllProperties(blockForProps);

      if (propNames.length) {
        const queryProps = buildPropertyValues(blockForProps, propNames);
        propertyValues =
          allProps || queryProps
            ? { ...(allProps ?? {}), ...(queryProps ?? {}) }
            : undefined;
      } else {
        propertyValues = allProps;
      }

      if (propertyValues && !Object.keys(propertyValues).length) {
        propertyValues = undefined;
      }
    }

    return {
      id: block.id,
      title: extractTitle(block),
      content: extractContent(block),
      fullContent,
      propertyValues,
      created: block.created ? new Date(block.created) : undefined,
      modified: block.modified ? new Date(block.modified) : undefined,
      tags: block.aliases || [],
    };
  });
}

/**
 * Search blocks by tag name
 * @param tagName - The tag name to search for
 * @param maxResults - Maximum number of results to return (default: 50)
 * @returns Array of search results
 */
export async function searchBlocksByTag(
  tagName: string,
  maxResults: number = 50
): Promise<SearchResult[]> {
  console.log("[searchBlocksByTag] Called with:", { tagName, maxResults });

  try {
    if (!tagName || typeof tagName !== "string") {
      console.error("[searchBlocksByTag] Invalid tagName:", tagName);
      return [];
    }

    const result = await orca.invokeBackend("get-blocks-with-tags", [tagName]);
    const blocks = unwrapBlocks(result);

    if (!Array.isArray(blocks)) {
      console.warn("[searchBlocksByTag] Result is not an array:", blocks);
      return [];
    }

    const sortedBlocks = sortAndLimitBlocks(blocks, maxResults);
    const trees = await fetchBlockTrees(sortedBlocks);
    return transformToSearchResults(trees, { includeProperties: true });
  } catch (error: any) {
    console.error(`Failed to search blocks by tag "${tagName}":`, error);
    throw new Error(
      `Tag search failed: ${error?.message ?? error ?? "unknown error"}`
    );
  }
}

/**
 * Search blocks by text content
 * @param searchText - The text to search for
 * @param maxResults - Maximum number of results to return (default: 50)
 * @returns Array of search results
 */
export async function searchBlocksByText(
  searchText: string,
  maxResults: number = 50
): Promise<SearchResult[]> {
  console.log("[searchBlocksByText] Called with:", { searchText, maxResults });

  try {
    if (!searchText || typeof searchText !== "string") {
      console.error("[searchBlocksByText] Invalid searchText:", searchText);
      return [];
    }

    const result = await orca.invokeBackend(
      "search-blocks-by-text",
      searchText
    );
    const blocks = unwrapBlocks(result);

    if (!Array.isArray(blocks)) {
      console.warn("[searchBlocksByText] Result is not an array:", blocks);
      return [];
    }

    const sortedBlocks = sortAndLimitBlocks(blocks, maxResults);
    const trees = await fetchBlockTrees(sortedBlocks);
    return transformToSearchResults(trees, { includeProperties: false });
  } catch (error: any) {
    console.error(`Failed to search blocks by text "${searchText}":`, error);
    throw new Error(
      `Text search failed: ${error?.message ?? error ?? "unknown error"}`
    );
  }
}

/**
 * Query blocks by tag name and optional tag properties (query backend).
 * @param tagName - The tag name to query for
 * @param options - Optional property filters, sorting, and pagination
 * @returns Array of search results
 */
export async function queryBlocksByTag(
  tagName: string,
  options: QueryBlocksByTagOptions = {}
): Promise<SearchResult[]> {
  const maxResults = Math.min(Math.max(1, options.maxResults ?? 50), 50);
  console.log("[queryBlocksByTag] Called with:", {
    tagName,
    options,
    maxResults,
  });

  try {
    if (!tagName || typeof tagName !== "string") {
      console.error("[queryBlocksByTag] Invalid tagName:", tagName);
      return [];
    }

    // Fallback to simple tag search if no property filters
    if (!options.properties || options.properties.length === 0) {
      return await searchBlocksByTag(tagName, maxResults);
    }

    const description = buildQueryDescription({
      tagName,
      properties: options.properties,
      sort: options.sort ?? [{ field: "_modified", direction: "DESC" }],
      page: options.page,
      pageSize: options.pageSize,
      maxResults,
    });
    console.log(
      "[queryBlocksByTag] Query description:",
      JSON.stringify(description)
    );

    const runQuery = async (desc: any) => {
      const result = await orca.invokeBackend("query", desc);
      const payload = unwrapBackendResult<any>(result);
      throwIfBackendError(payload, "query");
      return unwrapBlocks(payload);
    };

    // Try query with fallback strategies
    let blocks: any[] = [];
    blocks = await executeQueryWithFallback(runQuery, description, tagName);

    if (!Array.isArray(blocks)) {
      console.warn("[queryBlocksByTag] Result is not an array:", blocks);
      return [];
    }

    const limitedBlocks = blocks.slice(0, maxResults);
    const trees = await fetchBlockTrees(limitedBlocks);

    const propNames = Array.isArray(options.properties)
      ? options.properties
          .map((p: any) => p?.name)
          .filter((v: any) => typeof v === "string" && v.trim())
          .map((v: string) => v.trim())
      : [];

    return transformToSearchResults(trees, {
      includeProperties: true,
      propNames,
    });
  } catch (error: any) {
    console.error(`Failed to query blocks by tag "${tagName}":`, error);
    throw new Error(
      `Tag query failed: ${error?.message ?? error ?? "unknown error"}`
    );
  }
}

/**
 * Execute query with fallback strategies for different query formats
 */
async function executeQueryWithFallback(
  runQuery: (desc: any) => Promise<any[]>,
  description: any,
  tagName: string
): Promise<any[]> {
  try {
    return await runQuery(description);
  } catch (err) {
    console.warn(
      "[queryBlocksByTag] QueryDescription2 failed, retrying legacy:",
      err
    );
  }

  // Try legacy QueryDescription format
  const tagQuery = description.q?.conditions?.[0];
  const legacyDescription = {
    ...description,
    q: {
      kind: 1,
      conditions: [
        {
          kind: 4,
          name: tagName,
          properties: tagQuery?.properties,
        },
      ],
    },
  };

  try {
    return await runQuery(legacyDescription);
  } catch (legacyErr) {
    console.warn(
      "[queryBlocksByTag] Legacy format failed, trying direct tag:",
      legacyErr
    );
  }

  // Try direct tag query format
  const directDescription = {
    ...description,
    q: {
      kind: 4,
      name: tagName,
      properties: tagQuery?.properties,
    },
  };

  return await runQuery(directDescription);
}

// ============================================================================
// Advanced Query Functions
// ============================================================================

/**
 * Search for task blocks with optional completion status filter
 * @param completed - Filter by completion status (undefined = all tasks)
 * @param options - Additional query options
 * @returns Array of search results
 */
export async function searchTasks(
  completed?: boolean,
  options: Omit<TaskQueryOptions, "completed"> = {}
): Promise<SearchResult[]> {
  const maxResults = Math.min(Math.max(1, options.maxResults ?? 50), 50);
  console.log("[searchTasks] Called with:", { completed, options, maxResults });

  try {
    const description = buildTaskQuery({
      completed,
      ...options,
      maxResults,
    });
    console.log(
      "[searchTasks] Query description:",
      JSON.stringify(description)
    );

    const result = await orca.invokeBackend("query", description);
    const payload = unwrapBackendResult<any>(result);
    throwIfBackendError(payload, "query");
    const blocks = unwrapBlocks(payload);

    if (!Array.isArray(blocks)) {
      console.warn("[searchTasks] Result is not an array:", blocks);
      return [];
    }

    const limitedBlocks = blocks.slice(0, maxResults);
    const trees = await fetchBlockTrees(limitedBlocks);
    return transformToSearchResults(trees, { includeProperties: false });
  } catch (error: any) {
    console.error("[searchTasks] Failed:", error);
    throw new Error(
      `Task search failed: ${error?.message ?? error ?? "unknown error"}`
    );
  }
}

/**
 * Search for journal entries in a date range
 * @param start - Start date specification
 * @param end - End date specification
 * @param options - Additional query options
 * @returns Array of search results
 */
export async function searchJournalEntries(
  start: QueryDateSpec,
  end: QueryDateSpec,
  options: Omit<JournalQueryOptions, "start" | "end"> = {}
): Promise<SearchResult[]> {
  const maxResults = Math.min(Math.max(1, options.maxResults ?? 50), 50);
  console.log("[searchJournalEntries] Called with:", {
    start,
    end,
    options,
    maxResults,
  });

  try {
    const description = buildJournalQuery({
      start,
      end,
      ...options,
      maxResults,
    });
    console.log(
      "[searchJournalEntries] Query description:",
      JSON.stringify(description)
    );

    const result = await orca.invokeBackend("query", description);
    const payload = unwrapBackendResult<any>(result);
    throwIfBackendError(payload, "query");
    const blocks = unwrapBlocks(payload);

    if (!Array.isArray(blocks)) {
      console.warn("[searchJournalEntries] Result is not an array:", blocks);
      return [];
    }

    const limitedBlocks = blocks.slice(0, maxResults);
    const trees = await fetchBlockTrees(limitedBlocks);
    return transformToSearchResults(trees, { includeProperties: false });
  } catch (error: any) {
    console.error("[searchJournalEntries] Failed:", error);
    throw new Error(
      `Journal search failed: ${error?.message ?? error ?? "unknown error"}`
    );
  }
}

/**
 * Execute an advanced query with full QueryDescription2 support
 * Supports AND, OR, and CHAIN_AND combining modes
 * @param options - Advanced query options
 * @returns Array of search results
 */
export async function queryBlocksAdvanced(
  options: AdvancedQueryOptions
): Promise<SearchResult[]> {
  const maxResults = Math.min(Math.max(1, options.pageSize ?? 50), 50);
  console.log("[queryBlocksAdvanced] Called with:", { options, maxResults });

  try {
    const description = buildAdvancedQuery({
      ...options,
      pageSize: maxResults,
    });
    console.log(
      "[queryBlocksAdvanced] Query description:",
      JSON.stringify(description)
    );

    const result = await orca.invokeBackend("query", description);
    const payload = unwrapBackendResult<any>(result);
    throwIfBackendError(payload, "query");
    const blocks = unwrapBlocks(payload);

    if (!Array.isArray(blocks)) {
      console.warn("[queryBlocksAdvanced] Result is not an array:", blocks);
      return [];
    }

    const limitedBlocks = blocks.slice(0, maxResults);
    const trees = await fetchBlockTrees(limitedBlocks);
    return transformToSearchResults(trees, { includeProperties: true });
  } catch (error: any) {
    console.error("[queryBlocksAdvanced] Failed:", error);
    throw new Error(
      `Advanced query failed: ${error?.message ?? error ?? "unknown error"}`
    );
  }
}

/**
 * Property type information for tag schema
 */
export interface TagPropertySchema {
  name: string;
  type: number;
  typeName: string;
  options?: Array<{
    label: string;
    value: number;
    color?: string;
  }>;
}

/**
 * Tag schema with property definitions
 */
export interface TagSchema {
  tagName: string;
  properties: TagPropertySchema[];
}

/**
 * Property type constants based on Orca's official PropType enum
 * Reference: plugin-docs/constants/db.md
 */
const PROPERTY_TYPE_NAMES: Record<number, string> = {
  0: "json", // PropType.JSON
  1: "text", // PropType.Text
  2: "block-refs", // PropType.BlockRefs
  3: "number", // PropType.Number
  4: "boolean", // PropType.Boolean
  5: "date-time", // PropType.DateTime
  6: "text-choices", // PropType.TextChoices
};

// ============================================================================
// Tag Schema Cache
// ============================================================================

/**
 * Cache entry for tag schema
 */
interface TagSchemaCacheEntry {
  schema: TagSchema;
  expiry: number;
}

/**
 * In-memory cache for tag schemas to avoid redundant API calls
 */
const tagSchemaCache = new Map<string, TagSchemaCacheEntry>();

/**
 * Cache TTL: 30 minutes
 */
const TAG_SCHEMA_CACHE_TTL = 30 * 60 * 1000;

/**
 * Get cached tag schema or fetch from backend if cache miss/expired
 * @param tagName - The name of the tag
 * @returns Tag schema (from cache or freshly fetched)
 */
export async function getCachedTagSchema(tagName: string): Promise<TagSchema> {
  const normalizedTagName = tagName.trim().toLowerCase();
  const cached = tagSchemaCache.get(normalizedTagName);
  
  if (cached && Date.now() < cached.expiry) {
    console.log(`[getCachedTagSchema] Cache hit for tag: "${tagName}"`);
    return cached.schema;
  }
  
  console.log(`[getCachedTagSchema] Cache miss for tag: "${tagName}", fetching...`);
  const schema = await getTagSchema(tagName);
  
  tagSchemaCache.set(normalizedTagName, {
    schema,
    expiry: Date.now() + TAG_SCHEMA_CACHE_TTL,
  });
  
  return schema;
}

/**
 * Clear the tag schema cache (useful for testing or manual refresh)
 */
export function clearTagSchemaCache(): void {
  tagSchemaCache.clear();
  console.log("[clearTagSchemaCache] Cache cleared");
}

/**
 * Remove a specific tag from the cache
 * @param tagName - The tag name to invalidate
 */
export function invalidateTagSchemaCache(tagName: string): void {
  const normalizedTagName = tagName.trim().toLowerCase();
  tagSchemaCache.delete(normalizedTagName);
  console.log(`[invalidateTagSchemaCache] Invalidated cache for tag: "${tagName}"`);
}

/**
 * Get the schema (property definitions) for a specific tag
 * This includes property names, types, and for choice properties, the option mappings
 *
 * @param tagName - The name of the tag (alias)
 * @returns Tag schema with property definitions
 *
 * @example
 * ```ts
 * const schema = await getTagSchema("task");
 * // Returns:
 * // {
 * //   tagName: "task",
 * //   properties: [
 * //     {
 * //       name: "status",
 * //       type: 4,
 * //       typeName: "single-choice",
 * //       options: [
 * //         { label: "todo", value: 0 },
 * //         { label: "in-progress", value: 1 },
 * //         { label: "done", value: 2 }
 * //       ]
 * //     },
 * //     {
 * //       name: "priority",
 * //       type: 1,
 * //       typeName: "number"
 * //     }
 * //   ]
 * // }
 * ```
 */
export async function getTagSchema(tagName: string): Promise<TagSchema> {
  console.log(`[getTagSchema] Getting schema for tag: "${tagName}"`);

  try {
    // Get the tag block by alias
    const tagBlock = await orca.invokeBackend("get-block-by-alias", tagName);

    if (!tagBlock) {
      throw new Error(`Tag "${tagName}" not found`);
    }

    console.log(`[getTagSchema] Found tag block:`, tagBlock.id);

    // Extract property definitions from the tag block
    const properties: TagPropertySchema[] = [];

    if (tagBlock.properties && Array.isArray(tagBlock.properties)) {
      for (const prop of tagBlock.properties) {
        const propertySchema: TagPropertySchema = {
          name: prop.name,
          type: prop.type,
          typeName:
            PROPERTY_TYPE_NAMES[prop.type] || `unknown-type-${prop.type}`,
        };

        // For TextChoices type (type 6), extract options
        // Note: According to Orca API (plugin-docs/constants/db.md):
        //   - Type 4 = Boolean, Type 5 = DateTime, Type 6 = TextChoices
        if (prop.type === 6 && prop.typeArgs?.choices) {
          propertySchema.options = [];

          const choices = prop.typeArgs.choices;
          if (Array.isArray(choices)) {
            choices.forEach((choice: any, index: number) => {
              // Choices can be strings or objects { n: string, c?: string }
              const label =
                typeof choice === "string"
                  ? choice
                  : choice.n || choice.name || "";
              const color =
                typeof choice === "object"
                  ? choice.c || choice.color
                  : undefined;

              propertySchema.options!.push({
                label,
                value: index, // The value is the index in the choices array
                color,
              });
            });
          }
        }

        properties.push(propertySchema);
      }
    }

    const schema: TagSchema = {
      tagName,
      properties,
    };

    console.log(
      `[getTagSchema] Extracted schema:`,
      JSON.stringify(schema, null, 2)
    );
    return schema;
  } catch (error: any) {
    console.error(
      `[getTagSchema] Failed to get schema for tag "${tagName}":`,
      error
    );
    throw new Error(
      `Failed to get tag schema: ${error?.message ?? error ?? "unknown error"}`
    );
  }
}
