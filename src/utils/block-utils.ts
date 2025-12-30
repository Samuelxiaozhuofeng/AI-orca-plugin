/**
 * Block utility functions for Orca Note
 * Provides backend result handling and block tree traversal utilities
 */

import { safeText } from "./text-utils";

/**
 * State object for block tree flattening
 */
export interface FlattenState {
  blocks: number;
  maxBlocks: number;
  maxDepth: number;
  hitLimit: boolean;
}

/**
 * Default flatten state configuration
 */
export function createFlattenState(
  maxBlocks: number = 200,
  maxDepth: number = 10
): FlattenState {
  return { blocks: 0, maxBlocks, maxDepth, hitLimit: false };
}

/**
 * Unwrap backend result from [code, data] format
 */
export function unwrapBackendResult<T>(result: any): T {
  if (Array.isArray(result) && result.length === 2 && typeof result[0] === "number") {
    return result[1] as T;
  }
  return result as T;
}

/**
 * Extract block array from various backend response formats
 */
export function unwrapBlocks(result: any): any[] {
  if (!result) return [];

  // Handle [aliasMatches, contentMatches] from search-blocks-by-text
  if (Array.isArray(result) && result.length === 2 && Array.isArray(result[0]) && Array.isArray(result[1])) {
    const combined = [...result[0], ...result[1]];
    // Each item might be a wrapper { type, label, block } - extract the block
    return combined.map(item => {
      if (item && typeof item === "object" && "block" in item && item.block) {
        return item.block;
      }
      return item;
    });
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

/**
 * Throw error if backend result contains error code
 */
export function throwIfBackendError(result: any, label: string): void {
  if (result && typeof result === "object" && typeof (result as any).code === "string") {
    throw new Error(`${label} failed: ${(result as any).code}`);
  }
}

/**
 * Get children array from a block tree node
 */
export function treeChildren(tree: any): any[] {
  if (!tree) return [];
  if (Array.isArray(tree.children)) return tree.children;
  const node = tree?.block && typeof tree.block === "object" ? tree.block : tree;
  if (Array.isArray(node.children)) return node.children;
  if (node !== tree) return treeChildren(node);
  return [];
}

/**
 * Flatten a block tree into indented text lines
 * @param tree - Block tree to flatten
 * @param depth - Current indentation depth
 * @param out - Output array to append lines to
 * @param state - Mutable state tracking limits
 */
export function flattenBlockTreeToLines(
  tree: any,
  depth: number,
  out: string[],
  state: FlattenState,
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
    // Include block ID in the line so AI can identify it without separate search
    // Use standard markdown link format for block references
    out.push(`${"  ".repeat(depth)}- ${text} [${node.id}](orca-block:${node.id})`);
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
 * Batch fetch block trees for an array of blocks
 * @param blocks - Array of block objects with id property OR block IDs (numbers)
 * @returns Array of {block, tree} pairs
 */
export async function fetchBlockTrees(blocks: any[]): Promise<{ block: any; tree: any }[]> {
  return Promise.all(
    blocks.map(async (blockOrId: any) => {
      // Normalize: handle both block objects and plain block IDs
      const blockId = typeof blockOrId === "number"
        ? blockOrId
        : (typeof blockOrId === "object" && blockOrId?.id != null)
          ? blockOrId.id
          : null;

      if (blockId == null) {
        console.warn("[fetchBlockTrees] Invalid block input:", blockOrId);
        return { block: blockOrId, tree: null };
      }

      try {
        const result = await orca.invokeBackend("get-block-tree", blockId);
        const payload = unwrapBackendResult<any>(result);
        throwIfBackendError(payload, "get-block-tree");

        // get-block-tree may return empty array [] for some blocks (e.g., alias blocks)
        // In that case, fall back to get-block for complete block info
        let treeBlock = payload?.block;
        let tree = payload;
        
        // Check if payload is empty or invalid
        const isEmptyTree = !payload || (Array.isArray(payload) && payload.length === 0) || !treeBlock;
        
        if (isEmptyTree) {
          // Fallback: use get-block to get complete block info including aliases
          try {
            const blockResult = await orca.invokeBackend("get-block", blockId);
            const blockPayload = unwrapBackendResult<any>(blockResult);
            if (blockPayload && blockPayload.id) {
              treeBlock = blockPayload;
            }
          } catch (blockErr) {
            console.warn("[fetchBlockTrees] get-block fallback failed:", blockId, blockErr);
          }
          tree = null; // No valid tree
        }

        // CRITICAL: Ensure the returned block ID matches the requested ID
        // This prevents ID/content mismatch issues
        let block: any;
        if (typeof blockOrId === "number") {
          block = treeBlock ?? { id: blockId };
        } else {
          // Merge: keep original ID, only update content-related fields from treeBlock
          if (treeBlock && treeBlock.id === blockId) {
            block = { ...blockOrId, ...treeBlock, id: blockId };
          } else {
            // treeBlock ID doesn't match - use original block data
            block = blockOrId;
            if (treeBlock) {
              console.warn("[fetchBlockTrees] ID mismatch - requested:", blockId, "got:", treeBlock.id);
            }
          }
        }

        // Final safety check: ensure block.id matches requested blockId
        if (block.id !== blockId) {
          console.warn("[fetchBlockTrees] Correcting ID mismatch:", block.id, "->", blockId);
          block = { ...block, id: blockId };
        }

        return { block, tree };
      } catch (err) {
        console.warn("[fetchBlockTrees] Failed to load block tree:", {
          id: blockId,
          err,
        });
        
        // Last resort: try get-block directly
        try {
          const blockResult = await orca.invokeBackend("get-block", blockId);
          const blockPayload = unwrapBackendResult<any>(blockResult);
          if (blockPayload && blockPayload.id === blockId) {
            return { block: blockPayload, tree: null };
          }
        } catch {
          // Ignore
        }
        
        const block = typeof blockOrId === "number"
          ? { id: blockOrId }
          : { ...blockOrId, id: blockId };
        return { block, tree: null };
      }
    }),
  );
}

/**
 * Sort blocks by modified date (most recent first) and limit to maxResults
 */
export function sortAndLimitBlocks(blocks: any[], maxResults: number): any[] {
  return blocks
    .sort((a: any, b: any) => {
      const aTime = a.modified ? new Date(a.modified).getTime() : 0;
      const bTime = b.modified ? new Date(b.modified).getTime() : 0;
      return bTime - aTime;
    })
    .slice(0, maxResults);
}
