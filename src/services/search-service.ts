/**
 * Search service for Orca Note
 * Provides search functionality for blocks by tags and text content
 */

import { buildQueryDescription } from "../utils/query-builder";
import type { QueryBlocksByTagOptions } from "../utils/query-types";
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
      if (state.hitLimit) lines.push(`- …(maxBlocks=${state.maxBlocks} reached)`);
      fullContent = lines.join("\n").trim() || undefined;
    }

    let propertyValues: Record<string, any> | undefined;
    if (includeProperties) {
      const blockForProps = pickBlockForPropertyExtraction(block, tree);
      const allProps = extractAllProperties(blockForProps);
      
      if (propNames.length) {
        const queryProps = buildPropertyValues(blockForProps, propNames);
        propertyValues = allProps || queryProps
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
    throw new Error(`Tag search failed: ${error?.message ?? error ?? "unknown error"}`);
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

    const result = await orca.invokeBackend("search-blocks-by-text", searchText);
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
    throw new Error(`Text search failed: ${error?.message ?? error ?? "unknown error"}`);
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
  options: QueryBlocksByTagOptions = {},
): Promise<SearchResult[]> {
  const maxResults = Math.min(Math.max(1, options.maxResults ?? 50), 50);
  console.log("[queryBlocksByTag] Called with:", { tagName, options, maxResults });

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
      sort: options.sort ?? [{ field: "modified", direction: "DESC" }],
      page: options.page,
      pageSize: options.pageSize,
      maxResults,
    });
    console.log("[queryBlocksByTag] Query description:", JSON.stringify(description));

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

    return transformToSearchResults(trees, { includeProperties: true, propNames });
  } catch (error: any) {
    console.error(`Failed to query blocks by tag "${tagName}":`, error);
    throw new Error(`Tag query failed: ${error?.message ?? error ?? "unknown error"}`);
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
    console.warn("[queryBlocksByTag] QueryDescription2 failed, retrying legacy:", err);
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
    console.warn("[queryBlocksByTag] Legacy format failed, trying direct tag:", legacyErr);
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
