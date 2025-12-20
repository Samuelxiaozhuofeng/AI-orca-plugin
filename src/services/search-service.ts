/**
 * Search service for Orca Note
 * Provides search functionality for blocks by tags and text content
 */

import { buildQueryDescription } from "../utils/query-builder";
import type { QueryBlocksByTagOptions } from "../utils/query-types";

export interface SearchResult {
  id: number;
  title: string;
  content: string;
  fullContent?: string;
  created?: Date;
  modified?: Date;
  tags?: string[];
}

function unwrapBackendResult<T>(result: any): T {
  if (Array.isArray(result) && result.length === 2 && typeof result[0] === "number") {
    return result[1] as T;
  }
  return result as T;
}

function unwrapBlocks(result: any): any[] {
  if (!result) return [];
  
  // Handle [aliasMatches, contentMatches] from search-blocks-by-text
  if (Array.isArray(result) && result.length === 2 && Array.isArray(result[0]) && Array.isArray(result[1])) {
    return [...result[0], ...result[1]];
  }
  
  // Handle [count, blocks] from some other APIs
  if (Array.isArray(result) && result.length === 2 && typeof result[0] === "number" && Array.isArray(result[1])) {
    return result[1];
  }
  
  if (Array.isArray(result)) return result;
  
  // If it's a single object, wrap it
  if (typeof result === "object" && result.id) return [result];
  
  return [];
}

function throwIfBackendError(result: any, label: string): void {
  if (result && typeof result === "object" && typeof (result as any).code === "string") {
    throw new Error(`${label} failed: ${(result as any).code}`);
  }
}

function treeChildren(tree: any): any[] {
  if (!tree) return [];
  if (Array.isArray(tree.children)) return tree.children;
  const node = tree?.block && typeof tree.block === "object" ? tree.block : tree;
  if (Array.isArray(node.children)) return node.children;
  if (node !== tree) return treeChildren(node);
  return [];
}

function flattenBlockTreeToLines(
  tree: any,
  depth: number,
  out: string[],
  state: { blocks: number; maxBlocks: number; maxDepth: number; hitLimit: boolean },
): void {
  if (!tree) return;

  if (Array.isArray(tree)) {
    for (const item of tree) {
      flattenBlockTreeToLines(item, depth, out, state);
    }
    return;
  }

  if (!tree) return;
  if (state.blocks >= state.maxBlocks) {
    state.hitLimit = true;
    return;
  }
  if (depth > state.maxDepth) return;

  if (typeof tree === "number") {
    const block = (orca.state.blocks as any)?.[tree];
    if (block) flattenBlockTreeToLines(block, depth, out, state);
    return;
  }
  if (typeof tree === "string" && /^\d+$/.test(tree)) {
    const id = Number(tree);
    const block = (orca.state.blocks as any)?.[id];
    if (block) flattenBlockTreeToLines(block, depth, out, state);
    return;
  }

  const node = tree?.block && typeof tree.block === "object" ? tree.block : tree;
  const text = safeText(node);
  if (text) {
    out.push(`${"  ".repeat(depth)}- ${text}`);
    state.blocks += 1;
  }

  if (state.blocks >= state.maxBlocks) {
    state.hitLimit = true;
    return;
  }

  const children = treeChildren(tree);
  if (!children.length) return;

  for (const child of children) {
    if (state.blocks >= state.maxBlocks) {
      state.hitLimit = true;
      break;
    }
    flattenBlockTreeToLines(child, depth + 1, out, state);
  }
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
    // Validate input
    if (!tagName || typeof tagName !== "string") {
      console.error("[searchBlocksByTag] Invalid tagName:", tagName);
      return [];
    }

    // Use orca.invokeBackend to search for blocks with the specified tag
    const result = await orca.invokeBackend("get-blocks-with-tags", [tagName]);
    const blocks = unwrapBlocks(result);

    if (!Array.isArray(blocks)) {
      console.warn("[searchBlocksByTag] Result is not an array:", blocks);
      return [];
    }

    // Sort by modified date (most recent first) and limit results
    const sortedBlocks = blocks
      .sort((a: any, b: any) => {
        const aTime = a.modified ? new Date(a.modified).getTime() : 0;
        const bTime = b.modified ? new Date(b.modified).getTime() : 0;
        return bTime - aTime;
      })
      .slice(0, maxResults);

    const trees = await Promise.all(
      sortedBlocks.map(async (block: any) => {
        try {
          const result = await orca.invokeBackend("get-block-tree", block.id);
          const payload = unwrapBackendResult<any>(result);
          throwIfBackendError(payload, "get-block-tree");
          return { block, tree: payload };
        } catch (err) {
          console.warn("[searchBlocksByTag] Failed to load block tree:", {
            id: block?.id,
            err,
          });
          return { block, tree: null };
        }
      }),
    );

    // Transform to SearchResult format
    return trees.map(({ block, tree }: { block: any; tree: any }) => {
      let fullContent: string | undefined;
      if (tree) {
        const lines: string[] = [];
        const state = { blocks: 0, maxBlocks: 200, maxDepth: 10, hitLimit: false };
        flattenBlockTreeToLines(tree, 0, lines, state);

        if (!lines.length) {
          const t = safeText(block);
          if (t) lines.push(`- ${t}`);
        }
        if (state.hitLimit) lines.push(`- …(maxBlocks=${state.maxBlocks} reached)`);
        fullContent = lines.join("\n").trim() || undefined;
      }

      return {
        id: block.id,
        title: extractTitle(block),
        content: extractContent(block),
        fullContent,
        created: block.created ? new Date(block.created) : undefined,
        modified: block.modified ? new Date(block.modified) : undefined,
        tags: block.aliases || [],
      };
    });
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
    // Validate input
    if (!searchText || typeof searchText !== "string") {
      console.error("[searchBlocksByText] Invalid searchText:", searchText);
      return [];
    }

    // Use orca.invokeBackend to search for blocks containing the text
    const result = await orca.invokeBackend("search-blocks-by-text", searchText);
    const blocks = unwrapBlocks(result);

    if (!Array.isArray(blocks)) {
      console.warn("[searchBlocksByText] Result is not an array:", blocks);
      return [];
    }

    // Sort by modified date (most recent first) and limit results
    const sortedBlocks = blocks
      .sort((a: any, b: any) => {
        const aTime = a.modified ? new Date(a.modified).getTime() : 0;
        const bTime = b.modified ? new Date(b.modified).getTime() : 0;
        return bTime - aTime;
      })
      .slice(0, maxResults);

    const trees = await Promise.all(
      sortedBlocks.map(async (block: any) => {
        try {
          const result = await orca.invokeBackend("get-block-tree", block.id);
          const payload = unwrapBackendResult<any>(result);
          throwIfBackendError(payload, "get-block-tree");
          return { block, tree: payload };
        } catch (err) {
          console.warn("[searchBlocksByText] Failed to load block tree:", {
            id: block?.id,
            err,
          });
          return { block, tree: null };
        }
      }),
    );

    // Transform to SearchResult format
    return trees.map(({ block, tree }: { block: any; tree: any }) => {
      let fullContent: string | undefined;
      if (tree) {
        const lines: string[] = [];
        const state = { blocks: 0, maxBlocks: 200, maxDepth: 10, hitLimit: false };
        flattenBlockTreeToLines(tree, 0, lines, state);

        if (!lines.length) {
          const t = safeText(block);
          if (t) lines.push(`- ${t}`);
        }
        if (state.hitLimit) lines.push(`- …(maxBlocks=${state.maxBlocks} reached)`);
        fullContent = lines.join("\n").trim() || undefined;
      }

      return {
        id: block.id,
        title: extractTitle(block),
        content: extractContent(block),
        fullContent,
        created: block.created ? new Date(block.created) : undefined,
        modified: block.modified ? new Date(block.modified) : undefined,
        tags: block.aliases || [],
      };
    });
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

    let blocks: any[] = [];
    try {
      blocks = await runQuery(description as any);
    } catch (err) {
      console.warn("[queryBlocksByTag] QueryDescription2 failed, retrying legacy QueryDescription:", err);
      const tagQuery = (description as any).q?.conditions?.[0];
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
      console.log("[queryBlocksByTag] Legacy query description:", JSON.stringify(legacyDescription));
      blocks = await runQuery(legacyDescription);
    }

    if (!Array.isArray(blocks)) {
      console.warn("[queryBlocksByTag] Result is not an array:", blocks);
      return [];
    }

    const limitedBlocks = blocks.slice(0, maxResults);

    const trees = await Promise.all(
      limitedBlocks.map(async (block: any) => {
        try {
          const result = await orca.invokeBackend("get-block-tree", block.id);
          const payload = unwrapBackendResult<any>(result);
          throwIfBackendError(payload, "get-block-tree");
          return { block, tree: payload };
        } catch (err) {
          console.warn("[queryBlocksByTag] Failed to load block tree:", {
            id: block?.id,
            err,
          });
          return { block, tree: null };
        }
      }),
    );

    return trees.map(({ block, tree }: { block: any; tree: any }) => {
      let fullContent: string | undefined;
      if (tree) {
        const lines: string[] = [];
        const state = { blocks: 0, maxBlocks: 200, maxDepth: 10, hitLimit: false };
        flattenBlockTreeToLines(tree, 0, lines, state);

        if (!lines.length) {
          const t = safeText(block);
          if (t) lines.push(`- ${t}`);
        }
        if (state.hitLimit) lines.push(`- …(maxBlocks=${state.maxBlocks} reached)`);
        fullContent = lines.join("\n").trim() || undefined;
      }

      return {
        id: block.id,
        title: extractTitle(block),
        content: extractContent(block),
        fullContent,
        created: block.created ? new Date(block.created) : undefined,
        modified: block.modified ? new Date(block.modified) : undefined,
        tags: block.aliases || [],
      };
    });
  } catch (error: any) {
    console.error(`Failed to query blocks by tag "${tagName}":`, error);
    throw new Error(`Tag query failed: ${error?.message ?? error ?? "unknown error"}`);
  }
}

/**
 * Extract title from block (first line or first N characters)
 */
function extractTitle(block: any): string {
  const text = safeText(block);
  if (!text) return "(untitled)";

  // Get first line or first 50 characters
  const firstLine = text.split("\n")[0];
  return firstLine.length > 50 ? firstLine.substring(0, 50) + "..." : firstLine;
}

/**
 * Extract content preview from block
 */
function extractContent(block: any): string {
  const text = safeText(block);
  if (!text) return "";

  // Return first 200 characters as preview
  return text.length > 200 ? text.substring(0, 200) + "..." : text;
}

/**
 * Extract safe text from block
 */
function safeText(block: any): string {
  if (!block) return "";
  if (typeof block.text === "string" && block.text.trim()) return block.text.trim();
  if (Array.isArray(block.content)) {
    return block.content
      .map((f: any) =>
        (f?.t === "text" || f?.t === "t") && typeof f.v === "string" ? f.v : "",
      )
      .join("")
      .trim();
  }
  return "";
}
