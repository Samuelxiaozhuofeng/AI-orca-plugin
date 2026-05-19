/**
 * Search service for Orca Note
 * Provides search functionality for blocks by tags and text content
 */

import {
  buildQueryDescription,
  buildTaskQuery,
  buildJournalQuery,
  buildAdvancedQuery,
} from "../../utils/query-builder";
import type {
  QueryBlocksByTagOptions,
  QueryPropertyFilterInput,
  QueryDateSpec,
  TaskQueryOptions,
  JournalQueryOptions,
  AdvancedQueryOptions,
} from "../../utils/query-types";
import { PropType } from "../../utils/query-types";
import { safeText, extractTitle, extractContent } from "../../utils/text-utils";
import {
  unwrapBackendResult,
  unwrapBlocks,
  throwIfBackendError,
  flattenBlockTreeToLines,
  createFlattenState,
  fetchBlockTrees,
  sortAndLimitBlocks,
} from "../../utils/block-utils";
import {
  extractAllProperties,
  buildPropertyValues,
  pickBlockForPropertyExtraction,
  expandBlockRefProperties,
  batchFetchBlocks,
} from "../../utils/property-utils";
import {
  rerankResults,
  type RerankStrategy,
  type RerankResult,
} from "../ai/reranking-service";

export interface SearchResult {
  id: number;
  title: string;
  content: string;
  fullContent?: string;
  created?: Date;
  modified?: Date;
  tags?: string[];
  propertyValues?: Record<string, any>;
  rawTree?: any;  // 原始块树数据（用于导出时提取子块信息）
  matchedKeywords?: string[];  // 匹配的关键词
  relevanceScore?: number;     // 相关性分数 (0-100)
}

/**
 * Options for multi-keyword search (inspired by Context7 API design)
 */
export interface MultiSearchOptions {
  /** Multiple keywords to search for */
  queries: string | string[];
  /** How to combine multiple keywords: "or" matches any, "and" matches all */
  combineMode?: "and" | "or";
  /** Focus topic for relevance ranking (like Context7's topic parameter) */
  topic?: string;
  /** Maximum results (default 50, max 100) */
  maxResults?: number;
  /** Sort order */
  sortBy?: "relevance" | "modified" | "created";
  /** Include context (parent/child blocks) */
  includeContext?: boolean;
  /** Enable advanced reranking (default: true) */
  enableReranking?: boolean;
  /** Reranking strategy (default: "hybrid") */
  rerankStrategy?: RerankStrategy;
}

interface TransformOptions {
  includeProperties?: boolean;
  propNames?: string[];
  // 是否展开 block-ref 属性（默认 true）
  expandBlockRefs?: boolean;
}

/**
 * Transform block/tree pairs to SearchResult array
 */
async function transformToSearchResults(
  trees: { block: any; tree: any }[],
  options: TransformOptions = {}
): Promise<SearchResult[]> {
  const { includeProperties = true, propNames = [], expandBlockRefs = true } = options;

  const prepared = trees.map(({ block, tree }) => {
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
    let blockForProps: any = block;
    if (includeProperties) {
      blockForProps = pickBlockForPropertyExtraction(block, tree);
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
      block,
      tree,
      blockForProps,
      fullContent,
      propertyValues,
    };
  });

  const shouldExpandBlockRefs = includeProperties && expandBlockRefs;
  if (shouldExpandBlockRefs) {
    const collectedIds = new Set<number>();
    for (const item of prepared) {
      if (!item.propertyValues) continue;
      await expandBlockRefProperties(item.propertyValues, item.blockForProps, {
        collectIds: collectedIds,
      });
    }

    if (collectedIds.size > 0) {
      const allIds = Array.from(collectedIds);
      const limitedIds = allIds.slice(0, 200);
      const allowedIds = new Set(limitedIds);

      console.log(
        `[expandBlockRefProperties] Expanding ${limitedIds.length} unique block-refs...`
      );

      try {
        const blockMap = await batchFetchBlocks(limitedIds);
        await Promise.all(
          prepared.map(async (item) => {
            if (!item.propertyValues) return;
            item.propertyValues = await expandBlockRefProperties(
              item.propertyValues,
              item.blockForProps,
              {
                blockMap,
                allowedIds,
              }
            );
          })
        );
      } catch (error) {
        console.warn(
          "[expandBlockRefProperties] 获取 block-refs 失败，回退为原始 ID：",
          error
        );
      }
    }
  }

  return prepared.map((item) => ({
    id: item.block.id,
    title: extractTitle(item.block),
    content: extractContent(item.block),
    fullContent: item.fullContent,
    propertyValues: item.propertyValues,
    created: item.block.created ? new Date(item.block.created) : undefined,
    modified: item.block.modified ? new Date(item.block.modified) : undefined,
    tags: item.block.aliases || [],
    rawTree: item.tree, // 保留原始树数据
  }));
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

    const safeMaxResults = Math.min(Math.max(1, maxResults), 200);

    try {
      const description = buildQueryDescription({
        tagName: normalizedTag,
        maxResults: safeMaxResults,
        sort: [["_modified", "DESC"]],
      });
      console.log(
        "[searchBlocksByTag] Query description:",
        JSON.stringify(description)
      );
      const runQuery = async (desc: any) => {
        const result = await orca.invokeBackend("query", desc);
        const payload = unwrapBackendResult<any>(result);
        throwIfBackendError(payload, "query");
        return unwrapBlocks(payload);
      };
      const blocks = await executeQueryWithFallback(runQuery, description, normalizedTag);

      if (!Array.isArray(blocks)) {
        console.warn("[searchBlocksByTag] Query result is not an array:", blocks);
      } else if (blocks.length > 0) {
        console.log(`[searchBlocksByTag] Query returned ${blocks.length} blocks`);
        const limitedBlocks = blocks.slice(0, safeMaxResults);
        const trees = await fetchBlockTrees(limitedBlocks);
        return await transformToSearchResults(trees, {
          includeProperties: true,
          expandBlockRefs: true,
        });
      } else {
        console.log("[searchBlocksByTag] Query returned 0 blocks, falling back to tag API");
      }
    } catch (queryErr) {
      console.warn("[searchBlocksByTag] Query failed, falling back to tag search:", queryErr);
    }

    const result = await orca.invokeBackend("get-blocks-with-tags", [normalizedTag]);
    const blocks = unwrapBlocks(result);

    if (!Array.isArray(blocks)) {
      console.warn("[searchBlocksByTag] Result is not an array:", blocks);
      return [];
    }

    if (blocks.length > 0) {
      console.log(`[searchBlocksByTag] Tag API returned ${blocks.length} blocks`);
      const sortedBlocks = sortAndLimitBlocks(blocks, safeMaxResults);
      const trees = await fetchBlockTrees(sortedBlocks);
      return await transformToSearchResults(trees, {
        includeProperties: true,
        expandBlockRefs: true,
      });
    }

    console.log("[searchBlocksByTag] Tag API returned 0 blocks, trying ref fallback");
    try {
      const tagBlock = await orca.invokeBackend("get-block-by-alias", normalizedTag);
      if (tagBlock?.id) {
        const refDescription = {
          q: {
            kind: 100,
            conditions: [
              {
                kind: 6,
                blockId: tagBlock.id,
              },
            ],
          },
          sort: [["_modified", "DESC"]],
          pageSize: safeMaxResults,
        };
        console.log(
          "[searchBlocksByTag] Ref fallback query description:",
          JSON.stringify(refDescription)
        );

        const refResult = await orca.invokeBackend("query", refDescription);
        const refPayload = unwrapBackendResult<any>(refResult);
        throwIfBackendError(refPayload, "query");
        const refBlocks = unwrapBlocks(refPayload);
        if (Array.isArray(refBlocks) && refBlocks.length > 0) {
          console.log(
            `[searchBlocksByTag] Ref fallback returned ${refBlocks.length} blocks`
          );
          const limitedBlocks = refBlocks.slice(0, safeMaxResults);
          const trees = await fetchBlockTrees(limitedBlocks);
          return await transformToSearchResults(trees, {
            includeProperties: true,
            expandBlockRefs: true,
          });
        }
      }
    } catch (refErr) {
      console.warn("[searchBlocksByTag] Ref fallback failed:", refErr);
    }

    return [];
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

    const safeMaxResults = Math.min(Math.max(1, maxResults), 200);

    try {
      const description = buildAdvancedQuery({
        conditions: [{ type: "text", text: searchText }],
        combineMode: "and",
        sort: [["_modified", "DESC"]],
        pageSize: safeMaxResults,
      });
      const result = await orca.invokeBackend("query", description);
      const payload = unwrapBackendResult<any>(result);
      throwIfBackendError(payload, "query");
      const blocks = unwrapBlocks(payload);

      if (!Array.isArray(blocks)) {
        console.warn("[searchBlocksByText] Query result is not an array:", blocks);
        return [];
      }

      const limitedBlocks = blocks.slice(0, safeMaxResults);
      const trees = await fetchBlockTrees(limitedBlocks);
      return await transformToSearchResults(trees, {
        includeProperties: false,
        expandBlockRefs: false,
      });
    } catch (queryErr) {
      console.warn("[searchBlocksByText] Query failed, falling back to text search:", queryErr);
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

    const sortedBlocks = sortAndLimitBlocks(blocks, safeMaxResults);
    const trees = await fetchBlockTrees(sortedBlocks);
    return await transformToSearchResults(trees, {
      includeProperties: false,
      expandBlockRefs: false,
    });
  } catch (error: any) {
    console.error(`Failed to search blocks by text "${searchText}":`, error);
    throw new Error(
      `Text search failed: ${error?.message ?? error ?? "unknown error"}`
    );
  }
}

/**
 * Calculate relevance score for a search result based on keyword matches and topic
 */
function calculateRelevanceScore(
  content: string,
  keywords: string[],
  topic?: string
): { score: number; matchedKeywords: string[] } {
  const lowerContent = content.toLowerCase();
  const matchedKeywords: string[] = [];
  let score = 0;

  // Check each keyword
  for (const keyword of keywords) {
    const lowerKeyword = keyword.toLowerCase();
    if (lowerContent.includes(lowerKeyword)) {
      matchedKeywords.push(keyword);
      // Base score per match
      score += 20;
      // Bonus for title match (first 100 chars)
      if (lowerContent.slice(0, 100).includes(lowerKeyword)) {
        score += 15;
      }
      // Bonus for multiple occurrences
      const occurrences = (lowerContent.match(new RegExp(lowerKeyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi')) || []).length;
      score += Math.min(occurrences - 1, 5) * 5;
    }
  }

  // Topic bonus
  if (topic && lowerContent.includes(topic.toLowerCase())) {
    score += 25;
  }

  // Normalize to 0-100
  return {
    score: Math.min(100, score),
    matchedKeywords,
  };
}

/**
 * Search blocks by multiple text keywords with relevance scoring
 * Inspired by Context7's topic-based filtering and token limits
 * @param options - Multi-search options
 * @returns Array of search results with relevance scores
 */
export async function searchBlocksByMultipleTexts(
  options: MultiSearchOptions
): Promise<SearchResult[]> {
  const {
    queries,
    combineMode = "or",
    topic,
    maxResults = 50,
    sortBy = "relevance",
    includeContext = true,
    enableReranking = true,
    rerankStrategy = "hybrid",
  } = options;

  // Normalize queries to array
  let keywords: string[];
  if (typeof queries === "string") {
    // Split by space, comma, or Chinese comma
    keywords = queries.split(/[\s,，]+/).filter((k) => k.trim().length > 0);
  } else {
    keywords = queries.filter((k) => k && k.trim().length > 0);
  }

  if (keywords.length === 0) {
    console.error("[searchBlocksByMultipleTexts] No valid keywords provided");
    return [];
  }

  console.log("[searchBlocksByMultipleTexts] Called with:", {
    keywords,
    combineMode,
    topic,
    maxResults,
    sortBy,
  });

  const safeMaxResults = Math.min(Math.max(1, maxResults), 100);

  try {
    // Build query conditions for each keyword
    const textConditions = keywords.map((keyword) => ({
      type: "text" as const,
      text: keyword,
    }));

    // For OR mode, we need to query each keyword separately and merge
    // For AND mode, we can use a single query with all conditions
    let allBlocks: any[] = [];
    const blockIdSet = new Set<number>();

    if (combineMode === "and") {
      // Single query with all conditions (AND)
      const description = buildAdvancedQuery({
        conditions: textConditions,
        combineMode: "and",
        sort: [["_modified", "DESC"]],
        pageSize: safeMaxResults * 2, // Fetch more for filtering
      });
      const result = await orca.invokeBackend("query", description);
      const payload = unwrapBackendResult<any>(result);
      throwIfBackendError(payload, "query");
      const blocks = unwrapBlocks(payload);
      if (Array.isArray(blocks)) {
        allBlocks = blocks;
      }
    } else {
      // OR mode: query each keyword and merge results
      const queryPromises = keywords.map(async (keyword) => {
        try {
          const description = buildAdvancedQuery({
            conditions: [{ type: "text", text: keyword }],
            combineMode: "and",
            sort: [["_modified", "DESC"]],
            pageSize: Math.ceil(safeMaxResults * 1.5), // Fetch extra per keyword
          });
          const result = await orca.invokeBackend("query", description);
          const payload = unwrapBackendResult<any>(result);
          throwIfBackendError(payload, "query");
          return unwrapBlocks(payload) || [];
        } catch (err) {
          console.warn(`[searchBlocksByMultipleTexts] Query for "${keyword}" failed:`, err);
          return [];
        }
      });

      const results = await Promise.all(queryPromises);
      
      // Merge and deduplicate
      for (const blocks of results) {
        if (Array.isArray(blocks)) {
          for (const block of blocks) {
            if (block?.id && !blockIdSet.has(block.id)) {
              blockIdSet.add(block.id);
              allBlocks.push(block);
            }
          }
        }
      }
    }

    if (!allBlocks.length) {
      console.log("[searchBlocksByMultipleTexts] No results found");
      return [];
    }

    // Fetch block trees
    const limitedBlocks = allBlocks.slice(0, safeMaxResults * 2);
    const trees = await fetchBlockTrees(limitedBlocks);
    
    // Transform to search results
    let results = await transformToSearchResults(trees, {
      includeProperties: false,
      expandBlockRefs: false,
    });

    // Apply reranking if enabled and sorting by relevance
    if (enableReranking && sortBy === "relevance") {
      console.log(`[searchBlocksByMultipleTexts] Applying ${rerankStrategy} reranking...`);
      
      const { results: rerankedResults, stats } = await rerankResults({
        query: keywords,
        documents: results,
        topK: safeMaxResults,
        strategy: rerankStrategy,
        topic,
        minScore: 0,
      });
      
      console.log(`[searchBlocksByMultipleTexts] Reranking stats:`, stats);
      
      // Map reranked results back to SearchResult format with updated scores
      return rerankedResults.map((r: RerankResult) => ({
        ...r,
        relevanceScore: Math.round(r.rerankScore * 100),
        matchedKeywords: r.matchedKeywords || keywords.filter((k) => {
          const text = `${r.title} ${r.content}`.toLowerCase();
          return text.includes(k.toLowerCase());
        }),
      }));
    }
    
    // Fallback: Calculate basic relevance scores without reranking
    results = results.map((r) => {
      const textToScore = `${r.title} ${r.content} ${r.fullContent || ""}`;
      const { score, matchedKeywords } = calculateRelevanceScore(textToScore, keywords, topic);
      return {
        ...r,
        relevanceScore: score,
        matchedKeywords,
      };
    });

    // Filter by topic if specified (must contain topic keyword)
    if (topic) {
      const topicLower = topic.toLowerCase();
      results = results.filter((r) => {
        const text = `${r.title} ${r.content} ${r.fullContent || ""}`.toLowerCase();
        return text.includes(topicLower);
      });
    }

    // Sort results
    switch (sortBy) {
      case "relevance":
        results.sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0));
        break;
      case "modified":
        results.sort((a, b) => {
          const aTime = a.modified?.getTime() || 0;
          const bTime = b.modified?.getTime() || 0;
          return bTime - aTime;
        });
        break;
      case "created":
        results.sort((a, b) => {
          const aTime = a.created?.getTime() || 0;
          const bTime = b.created?.getTime() || 0;
          return bTime - aTime;
        });
        break;
    }

    // Limit to maxResults
    return results.slice(0, safeMaxResults);
  } catch (error: any) {
    console.error(`Failed to search blocks by multiple texts:`, error);
    throw new Error(
      `Multi-text search failed: ${error?.message ?? error ?? "unknown error"}`
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

    return await transformToSearchResults(trees, {
      includeProperties: true,
      propNames,
      expandBlockRefs: true,
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
    return await transformToSearchResults(trees, {
      includeProperties: false,
      expandBlockRefs: true,
    });
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
    return await transformToSearchResults(trees, {
      includeProperties: false,
      expandBlockRefs: true,
    });
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

    const results = await transformToSearchResults([{ block, tree }], {
      includeProperties: false,
      expandBlockRefs: true,
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
 * Uses get-journal-block API to fetch actual journal entries by date.
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

  const results: SearchResult[] = [];
  const today = new Date();
  
  // Iterate through each day and fetch journal using get-journal-block
  for (let i = 0; i < normalizedDays && results.length < normalizedMaxResults; i++) {
    const targetDate = new Date(today);
    targetDate.setDate(today.getDate() - i);
    
    try {
      const result = await orca.invokeBackend("get-journal-block", targetDate);
      const payload = unwrapBackendResult<any>(result);
      
      if (!payload || (typeof payload === "object" && payload.code)) {
        // No journal for this date, skip
        continue;
      }
      
      const block = payload;
      if (!block || !block.id) continue;
      
      let tree: any = null;
      if (includeChildren) {
        try {
          const treeResult = await orca.invokeBackend("get-block-tree", block.id);
          const treePayload = unwrapBackendResult<any>(treeResult);
          if (treePayload && !(typeof treePayload === "object" && treePayload.code)) {
            tree = treePayload;
          }
        } catch (treeErr) {
          console.warn(`[getRecentJournals] Failed to get tree for ${block.id}:`, treeErr);
        }
      }
      
      const transformed = await transformToSearchResults([{ block, tree }], {
        includeProperties: false,
        expandBlockRefs: true,
      });
      
      if (transformed.length > 0) {
        // Format date as title for journal entries
        const dateStr = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}-${String(targetDate.getDate()).padStart(2, '0')}`;
        transformed[0].title = dateStr;
        results.push(transformed[0]);
      }
    } catch (err) {
      console.warn(`[getRecentJournals] Failed to get journal for date ${targetDate.toISOString()}:`, err);
      // Continue to next date
    }
  }
  
  console.log(`[getRecentJournals] Found ${results.length} journal entries`);
  return results;
}

/**
 * Parse date string into Date object.
 * Supports: YYYY-MM-DD format and basic relative dates (today, yesterday)
 * @param dateStr - Date string
 * @returns Parsed Date object or null if invalid
 */
function parseNaturalDate(dateStr: string): Date | null {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const normalized = dateStr.toLowerCase().trim();

  // today / yesterday
  if (normalized === "today" || normalized === "今天") {
    return today;
  }
  if (normalized === "yesterday" || normalized === "昨天") {
    const date = new Date(today);
    date.setDate(date.getDate() - 1);
    return date;
  }

  // Try standard date parsing (YYYY-MM-DD)
  const parsed = new Date(dateStr);
  if (!isNaN(parsed.getTime())) {
    return parsed;
  }

  return null;
}

/**
 * Get journal for a specific date.
 * @param date - The target date (Date object or string like "2024-12-25", "yesterday", "today")
 * @param includeChildren - Whether to include child blocks (default: true)
 * @returns Journal entry as SearchResult, or null if not found
 */
export async function getJournalByDate(
  date: Date | string,
  includeChildren: boolean = true
): Promise<SearchResult | null> {
  let targetDate: Date | null;

  if (typeof date === "string") {
    targetDate = parseNaturalDate(date);
  } else {
    targetDate = date;
  }

  if (!targetDate || isNaN(targetDate.getTime())) {
    console.error("[getJournalByDate] Invalid date:", date);
    return null;
  }
  
  const dateStr = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}-${String(targetDate.getDate()).padStart(2, '0')}`;
  console.log("[getJournalByDate] Called with:", { date: dateStr, includeChildren });

  try {
    const result = await orca.invokeBackend("get-journal-block", targetDate);
    const payload = unwrapBackendResult<any>(result);
    
    if (!payload || (typeof payload === "object" && payload.code)) {
      console.log(`[getJournalByDate] No journal found for ${dateStr}`);
      return null;
    }
    
    const block = payload;
    if (!block || !block.id) return null;
    
    let tree: any = null;
    if (includeChildren) {
      try {
        const treeResult = await orca.invokeBackend("get-block-tree", block.id);
        const treePayload = unwrapBackendResult<any>(treeResult);
        if (treePayload && !(typeof treePayload === "object" && treePayload.code)) {
          tree = treePayload;
        }
      } catch (treeErr) {
        console.warn(`[getJournalByDate] Failed to get tree for ${block.id}:`, treeErr);
      }
    }
    
    const transformed = await transformToSearchResults([{ block, tree }], {
      includeProperties: false,
      expandBlockRefs: true,
    });
    
    if (transformed.length > 0) {
      transformed[0].title = dateStr;
      return transformed[0];
    }
    
    return null;
  } catch (err: any) {
    console.error(`[getJournalByDate] Failed:`, err);
    throw new Error(`Failed to get journal for ${dateStr}: ${err?.message ?? err ?? "unknown error"}`);
  }
}

/**
 * 解析日期范围字符串，返回开始和结束日期
 * 支持格式：
 * - 年份：2024
 * - 月份：2024-05
 * - 周：2024-W20, this-week, last-week
 * - 日期范围：startDate 和 endDate 参数
 */
function parseDateRange(
  rangeType: "year" | "month" | "week" | "range",
  value: string,
  endValue?: string
): { start: Date; end: Date } | null {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  switch (rangeType) {
    case "year": {
      // 格式：2024
      const year = parseInt(value, 10);
      if (isNaN(year)) return null;
      return {
        start: new Date(year, 0, 1),
        end: new Date(year, 11, 31),
      };
    }
    case "month": {
      // 格式：2024-05
      const match = value.match(/^(\d{4})-(\d{1,2})$/);
      if (!match) return null;
      const year = parseInt(match[1], 10);
      const month = parseInt(match[2], 10) - 1; // 0-indexed
      if (month < 0 || month > 11) return null;
      const lastDay = new Date(year, month + 1, 0).getDate();
      return {
        start: new Date(year, month, 1),
        end: new Date(year, month, lastDay),
      };
    }
    case "week": {
      // 格式：this-week, last-week, 2024-W20
      if (value === "this-week") {
        const dayOfWeek = today.getDay();
        const monday = new Date(today);
        monday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        return { start: monday, end: sunday };
      }
      if (value === "last-week") {
        const dayOfWeek = today.getDay();
        const lastMonday = new Date(today);
        lastMonday.setDate(today.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1) - 7);
        const lastSunday = new Date(lastMonday);
        lastSunday.setDate(lastMonday.getDate() + 6);
        return { start: lastMonday, end: lastSunday };
      }
      // ISO 周格式：2024-W20
      const weekMatch = value.match(/^(\d{4})-W(\d{1,2})$/);
      if (weekMatch) {
        const year = parseInt(weekMatch[1], 10);
        const week = parseInt(weekMatch[2], 10);
        // 计算该年第一个周一
        const jan4 = new Date(year, 0, 4);
        const dayOfWeek = jan4.getDay();
        const firstMonday = new Date(jan4);
        firstMonday.setDate(jan4.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
        // 计算目标周的周一
        const targetMonday = new Date(firstMonday);
        targetMonday.setDate(firstMonday.getDate() + (week - 1) * 7);
        const targetSunday = new Date(targetMonday);
        targetSunday.setDate(targetMonday.getDate() + 6);
        return { start: targetMonday, end: targetSunday };
      }
      return null;
    }
    case "range": {
      // 支持 last-N-days 格式：last-7-days, last-14-days, last-30-days, last-90-days
      const lastDaysMatch = value.match(/^last-(\d+)-days$/);
      if (lastDaysMatch) {
        const days = parseInt(lastDaysMatch[1], 10);
        const end = new Date(today);
        const start = new Date(today);
        start.setDate(today.getDate() - days + 1); // 包含今天
        return { start, end };
      }
      
      // 格式：startDate 到 endDate
      const start = new Date(value);
      const end = endValue ? new Date(endValue) : start;
      if (isNaN(start.getTime()) || isNaN(end.getTime())) return null;
      return { start, end };
    }
    default:
      return null;
  }
}

/**
 * Get journals by date range.
 * Supports year, month, week, or custom date range.
 * @param rangeType - Type of range: "year", "month", "week", "range"
 * @param value - Range value (e.g., "2024", "2024-05", "this-week", "2024-W20", or start date)
 * @param endValue - End date for "range" type
 * @param includeChildren - Whether to include child blocks (default: true)
 * @param maxResults - Maximum number of results (default: 31, max: 366)
 * @returns Array of journal entries as SearchResult[]
 */
export async function getJournalsByDateRange(
  rangeType: "year" | "month" | "week" | "range",
  value: string,
  endValue?: string,
  includeChildren: boolean = true,
  maxResults: number = 31
): Promise<SearchResult[]> {
  const normalizedMaxResults = Math.min(Math.max(1, maxResults), 366);
  console.log("[getJournalsByDateRange] Called with:", {
    rangeType,
    value,
    endValue,
    includeChildren,
    maxResults: normalizedMaxResults,
  });

  const range = parseDateRange(rangeType, value, endValue);
  if (!range) {
    console.error("[getJournalsByDateRange] Invalid range:", { rangeType, value, endValue });
    return [];
  }

  const { start, end } = range;
  const results: SearchResult[] = [];
  
  // 计算天数
  const daysDiff = Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  const daysToFetch = Math.min(daysDiff, normalizedMaxResults);
  
  console.log(`[getJournalsByDateRange] Fetching ${daysToFetch} days from ${start.toISOString()} to ${end.toISOString()}`);

  // 并行获取日记（每批 10 个请求）
  const batchSize = 10;
  for (let batchStart = 0; batchStart < daysToFetch && results.length < normalizedMaxResults; batchStart += batchSize) {
    const batchEnd = Math.min(batchStart + batchSize, daysToFetch);
    const batchPromises: Promise<SearchResult | null>[] = [];
    
    for (let i = batchStart; i < batchEnd; i++) {
      const targetDate = new Date(start);
      targetDate.setDate(start.getDate() + i);
      
      if (targetDate > end) break;
      
      batchPromises.push((async () => {
        try {
          const result = await orca.invokeBackend("get-journal-block", targetDate);
          const payload = unwrapBackendResult<any>(result);
          
          if (!payload || (typeof payload === "object" && payload.code)) {
            return null;
          }
          
          const block = payload;
          if (!block || !block.id) return null;
          
          let tree: any = null;
          if (includeChildren) {
            try {
              const treeResult = await orca.invokeBackend("get-block-tree", block.id);
              const treePayload = unwrapBackendResult<any>(treeResult);
              if (treePayload && !(typeof treePayload === "object" && treePayload.code)) {
                tree = treePayload;
              }
            } catch {
              // Skip tree fetch error
            }
          }
          
          const transformed = await transformToSearchResults([{ block, tree }], {
            includeProperties: false,
            expandBlockRefs: true,
          });
          
          if (transformed.length > 0) {
            const dateStr = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}-${String(targetDate.getDate()).padStart(2, '0')}`;
            transformed[0].title = dateStr;
            return transformed[0];
          }
          
          return null;
        } catch {
          return null;
        }
      })());
    }
    
    const batchResults = await Promise.all(batchPromises);
    for (const r of batchResults) {
      if (r && results.length < normalizedMaxResults) {
        results.push(r);
      }
    }
  }
  
  // 按日期排序（从早到晚）
  results.sort((a, b) => {
    const dateA = new Date(a.title).getTime();
    const dateB = new Date(b.title).getTime();
    return dateA - dateB;
  });
  
  console.log(`[getJournalsByDateRange] Found ${results.length} journal entries`);
  return results;
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
    return await transformToSearchResults(trees, {
      includeProperties: true,
      expandBlockRefs: true,
    });
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
    return await transformToSearchResults(trees, {
      includeProperties: false,
      expandBlockRefs: true,
    });
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
    const results = await transformToSearchResults([{ block, tree }], {
      includeProperties: true,
      expandBlockRefs: true,
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
