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
  QueryPropertyFilterInput,
  QueryDateSpec,
  TaskQueryOptions,
  JournalQueryOptions,
  AdvancedQueryOptions,
} from "../utils/query-types";
import { PropType } from "../utils/query-types";
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
 * Normalize tag name by removing # prefix and trimming whitespace
 */
function normalizeTagForSearch(tag: string): string {
  const trimmed = tag.trim();
  // Remove leading # if present
  if (trimmed.startsWith("#")) return trimmed.slice(1);
  return trimmed;
}

/**
 * Search blocks by tag name
 * @param tagName - The tag name to search for (with or without # prefix)
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

    // Normalize tag name - remove # prefix if present
    const normalizedTag = normalizeTagForSearch(tagName);
    console.log("[searchBlocksByTag] Normalized tag:", normalizedTag);

    const result = await orca.invokeBackend("get-blocks-with-tags", [normalizedTag]);
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

    // Enhance property filters with type information from tag schema
    let enhancedProperties = options.properties;
    try {
      const schema = await getCachedTagSchema(tagName);
      enhancedProperties = options.properties.map((filter) => {
        const schemaProperty = schema.properties.find(
          (p) => p.name.toLowerCase() === filter.name.toLowerCase()
        );
        if (!schemaProperty) return filter;

        const enhanced: QueryPropertyFilterInput = {
          ...filter,
          name: schemaProperty.name, // Use exact case from schema
          type: filter.type ?? schemaProperty.type,
        };

        // For TextChoices type, special handling is needed
        if (schemaProperty.type === PropType.TextChoices) {
          // Convert == to includes since value is stored as array
          if (filter.op === "==") {
            console.log(
              `[queryBlocksByTag] Converting == to includes for TextChoices property "${filter.name}"`
            );
            enhanced.op = "includes";
          }

          // Handle value conversion for TextChoices
          // The value could be: string label ("Canceled"), numeric string ("3"), or number (3)
          const schemaOptions = (schemaProperty as any).options as Array<{ label: string; value: number }> | undefined;
          
          if (schemaOptions && schemaOptions.length > 0) {
            const filterValue = filter.value;
            
            // Check if it's a numeric value (number or numeric string)
            const numericValue = typeof filterValue === "number" 
              ? filterValue 
              : (typeof filterValue === "string" && /^\d+$/.test(filterValue) ? parseInt(filterValue, 10) : null);
            
            if (numericValue !== null) {
              // Convert numeric value to string label
              const matchingOption = schemaOptions.find((opt) => opt.value === numericValue);
              if (matchingOption) {
                console.log(
                  `[queryBlocksByTag] Converting numeric value ${numericValue} to string label "${matchingOption.label}"`
                );
                enhanced.value = matchingOption.label;
              }
            } else if (typeof filterValue === "string") {
              // It's a string label, verify it exists in options (case-insensitive)
              const matchingOption = schemaOptions.find(
                (opt) => opt.label.toLowerCase() === filterValue.toLowerCase()
              );
              if (matchingOption) {
                // Use exact case from schema
                enhanced.value = matchingOption.label;
                console.log(
                  `[queryBlocksByTag] Using exact label "${matchingOption.label}" for value "${filterValue}"`
                );
              } else {
                console.warn(
                  `[queryBlocksByTag] Value "${filterValue}" not found in options:`,
                  schemaOptions.map(o => o.label)
                );
              }
            }
          }
        }

        return enhanced;
      });
      console.log("[queryBlocksByTag] Enhanced properties:", JSON.stringify(enhancedProperties));
    } catch (schemaError) {
      console.warn(
        "[queryBlocksByTag] Failed to get tag schema, using original properties:",
        schemaError
      );
    }

    const description = buildQueryDescription({
      tagName,
      properties: enhancedProperties,
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
    let blocks = unwrapBlocks(payload);

    // Fallback: some Orca builds use opposite sign conventions for relative dates.
    // If the initial query returns no results, try flipping the sign of relative offsets.
    if (
      (!Array.isArray(blocks) || blocks.length === 0) &&
      start?.type === "relative" &&
      end?.type === "relative" &&
      (start.value !== 0 || end.value !== 0)
    ) {
      const flippedStart: QueryDateSpec = { ...start, value: -start.value };
      const flippedEnd: QueryDateSpec = { ...end, value: -end.value };
      const fallbackDescription = buildJournalQuery({
        start: flippedStart,
        end: flippedEnd,
        ...options,
        maxResults,
      });
      console.log(
        "[searchJournalEntries] Fallback query description:",
        JSON.stringify(fallbackDescription)
      );

      const fallbackResult = await orca.invokeBackend("query", fallbackDescription);
      const fallbackPayload = unwrapBackendResult<any>(fallbackResult);
      throwIfBackendError(fallbackPayload, "query");
      blocks = unwrapBlocks(fallbackPayload);
    }

    if (!Array.isArray(blocks)) {
      console.warn("[searchJournalEntries] Result is not an array:", blocks);
      return [];
    }

    const limitedBlocks = blocks.slice(0, maxResults);
    const trees =
      options.includeChildren === false
        ? limitedBlocks.map((block) => ({ block, tree: null }))
        : await fetchBlockTrees(limitedBlocks);
    return transformToSearchResults(trees, { includeProperties: false });
  } catch (error: any) {
    console.error("[searchJournalEntries] Failed:", error);
    throw new Error(
      `Journal search failed: ${error?.message ?? error ?? "unknown error"}`
    );
  }
}

/**
 * Get today's journal (daily note) content.
 * Prefer this over querying when user asks to summarize today's journal.
 * @param includeChildren - Whether to include child blocks (default: true)
 * @returns Today's journal content as SearchResult
 */
export async function getTodayJournal(
  includeChildren: boolean = true
): Promise<SearchResult> {
  console.log("[getTodayJournal] Called with:", { includeChildren });

  try {
    const result = await orca.invokeBackend("get-journal-block", new Date());
    const payload = unwrapBackendResult<any>(result);
    throwIfBackendError(payload, "get-journal-block");
    const block = payload;

    if (!block) {
      console.warn("[getTodayJournal] Today's journal not found");
      throw new Error("Today's journal not found");
    }

    let tree: any = null;
    if (includeChildren) {
      const treeResult = await orca.invokeBackend("get-block-tree", block.id);
      const treePayload = unwrapBackendResult<any>(treeResult);
      throwIfBackendError(treePayload, "get-block-tree");
      tree = treePayload;
    }

    const results = transformToSearchResults([{ block, tree }], {
      includeProperties: false,
    });
    return results[0];
  } catch (error: any) {
    console.error("[getTodayJournal] Failed:", error);
    throw new Error(
      `Failed to get today's journal: ${error?.message ?? error ?? "unknown error"}`
    );
  }
}

/**
 * Get recent journals in the past N days (including today).
 * @param days - Number of days ago to include (default: 7)
 * @param includeChildren - Whether to include child blocks (default: true)
 * @param maxResults - Maximum number of journal entries to return (default: 20, max: 50)
 * @returns Array of journal entries as SearchResult[]
 */
export async function getRecentJournals(
  days: number = 7,
  includeChildren: boolean = true,
  maxResults: number = 20
): Promise<SearchResult[]> {
  const normalizedDays = Number.isFinite(days) ? Math.abs(Math.trunc(days)) : 7;
  const normalizedMaxResults = Math.min(
    Math.max(1, Number.isFinite(maxResults) ? Math.trunc(maxResults) : 20),
    50
  );
  console.log("[getRecentJournals] Called with:", {
    days: normalizedDays,
    includeChildren,
    maxResults: normalizedMaxResults,
  });

  const start: QueryDateSpec = { type: "relative", value: -normalizedDays, unit: "d" };
  const end: QueryDateSpec = { type: "relative", value: 0, unit: "d" };

  return await searchJournalEntries(start, end, {
    includeChildren,
    maxResults: normalizedMaxResults,
  });
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
 * Search for blocks that reference a specific page/block by alias name
 * Uses QueryKindRef (kind: 6) for precise link matching
 * @param aliasName - The alias/page name being referenced (e.g., "项目A")
 * @param maxResults - Maximum number of results to return (default: 50)
 * @returns Array of search results containing blocks that link to the specified page
 */
export async function searchBlocksByReference(
  aliasName: string,
  maxResults: number = 50
): Promise<SearchResult[]> {
  console.log("[searchBlocksByReference] Called with:", { aliasName, maxResults });

  try {
    if (!aliasName || typeof aliasName !== "string") {
      console.error("[searchBlocksByReference] Invalid aliasName:", aliasName);
      return [];
    }

    // Step 1: Resolve alias to blockId
    const targetBlock = await orca.invokeBackend("get-block-by-alias", aliasName);

    if (!targetBlock) {
      // Page not found - return empty array instead of throwing
      console.log(`[searchBlocksByReference] Page "${aliasName}" not found, returning empty results`);
      return [];
    }

    const blockId = targetBlock.id;
    console.log(`[searchBlocksByReference] Resolved "${aliasName}" to blockId: ${blockId}`);

    // Step 2: Build QueryRef2 query (kind: 6)
    const description = {
      q: {
        kind: 100, // SELF_AND
        conditions: [
          {
            kind: 6, // QueryKindRef
            blockId: blockId,
          },
        ],
      },
      sort: [["_modified", "DESC"] as [string, "ASC" | "DESC"]],
      pageSize: Math.min(Math.max(1, maxResults), 50),
    };

    console.log(
      "[searchBlocksByReference] Query description:",
      JSON.stringify(description)
    );

    // Step 3: Execute query
    const result = await orca.invokeBackend("query", description);
    const payload = unwrapBackendResult<any>(result);
    throwIfBackendError(payload, "query");
    const blocks = unwrapBlocks(payload);

    if (!Array.isArray(blocks)) {
      console.warn("[searchBlocksByReference] Result is not an array:", blocks);
      return [];
    }

    // Step 4: Transform results
    const limitedBlocks = blocks.slice(0, maxResults);
    const trees = await fetchBlockTrees(limitedBlocks);
    return transformToSearchResults(trees, { includeProperties: false });
  } catch (error: any) {
    console.error(`[searchBlocksByReference] Failed to search references to "${aliasName}":`, error);
    throw new Error(
      `Reference search failed: ${error?.message ?? error ?? "unknown error"}`
    );
  }
}

/**
 * Get a specific page by its name/alias and return its full content
 * This is more precise than searching, as it directly retrieves the exact page
 * @param pageName - The page name or alias (e.g., "项目方案", "Project A")
 * @param includeChildren - Whether to include child blocks (default: true)
 * @returns Page content as SearchResult, or throws if page not found
 */
export async function getPageByName(
  pageName: string,
  includeChildren: boolean = true
): Promise<SearchResult> {
  console.log("[getPageByName] Called with:", { pageName, includeChildren });

  try {
    if (!pageName || typeof pageName !== "string") {
      console.error("[getPageByName] Invalid pageName:", pageName);
      throw new Error("Invalid page name");
    }

    // Step 1: Get block by alias
    const block = await orca.invokeBackend("get-block-by-alias", pageName);

    if (!block) {
      console.warn(`[getPageByName] Page "${pageName}" not found`);
      throw new Error(`Page "${pageName}" not found`);
    }

    console.log(`[getPageByName] Found page: ${block.id}`);

    // Step 2: Get block tree
    let tree: any = null;
    if (includeChildren) {
      const result = await orca.invokeBackend("get-block-tree", block.id);
      const payload = unwrapBackendResult<any>(result);
      throwIfBackendError(payload, "get-block-tree");
      tree = payload;
    }

    // Step 3: Transform to SearchResult
    const results = transformToSearchResults([{ block, tree }], {
      includeProperties: true,
    });

    return results[0];
  } catch (error: any) {
    console.error(`[getPageByName] Failed to get page "${pageName}":`, error);
    throw new Error(
      `Failed to get page: ${error?.message ?? error ?? "unknown error"}`
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
