import type { Block, DbId } from "../orca.d.ts";
import { ContextRef, normalizeTagName } from "../store/context-store";
import type { FileRef } from "./session-service";
import { getFileCategory } from "./file-service";

/**
 * Simplified context builder - only builds context for sending to AI
 * Supports page and tag types only (block-level removed)
 */

type BuildOptions = {
  maxBlocks?: number;
  maxChars?: number;
  maxDepth?: number;
  maxTagRoots?: number;
  maxAssets?: number;
};

/**
 * Context build result with text and assets
 */
export interface ContextBuildResult {
  text: string;
  assets: FileRef[];
}

/**
 * Asset info extracted from block
 */
interface BlockAssetInfo {
  type: "image" | "video" | "audio" | "file";
  src: string;
  caption?: string;
  mimeType?: string;
}

type BlockResolver = (id: DbId) => Block | undefined;

function unwrapBackendResult<T>(result: any): T {
  if (Array.isArray(result) && result.length === 2 && typeof result[0] === "number") {
    return result[1] as T;
  }
  return result as T;
}

function throwIfBackendError(result: any, label: string): void {
  if (result && typeof result === "object" && typeof (result as any).code === "string") {
    throw new Error(`${label} failed: ${(result as any).code}`);
  }
}

function extractNodeId(node: any): DbId | null {
  if (!node || typeof node !== "object") return null;
  if (typeof (node as any).id === "number") return (node as any).id as DbId;
  if (typeof (node as any).blockId === "number") return (node as any).blockId as DbId;
  if (typeof (node as any).block_id === "number") return (node as any).block_id as DbId;
  return null;
}

function safeTextFromBlockLike(block: any): string {
  if (!block) return "";
  if (typeof block.text === "string" && block.text.trim()) return block.text.trim();
  if (Array.isArray(block.content)) {
    return block.content
      .map((f: any) => {
        if (!f) return "";
        if (f.t === "text" && typeof f.v === "string") return f.v;
        if (typeof f.v === "string") return f.v;
        return "";
      })
      .join("")
      .trim();
  }
  return "";
}

/**
 * Extract asset info from block's _repr property
 */
function extractAssetFromBlock(block: any): BlockAssetInfo | null {
  if (!block || !Array.isArray(block.properties)) return null;
  
  const reprProp = block.properties.find((p: any) => p.name === "_repr");
  if (!reprProp || !reprProp.value) return null;
  
  const repr = reprProp.value;
  
  // Image block
  if (repr.type === "image" && repr.src) {
    return {
      type: "image",
      src: repr.src,
      caption: repr.cap || undefined,
      mimeType: guessMimeType(repr.src, "image"),
    };
  }
  
  // Video block
  if (repr.type === "video" && repr.src) {
    return {
      type: "video",
      src: repr.src,
      caption: repr.cap || undefined,
      mimeType: guessMimeType(repr.src, "video"),
    };
  }
  
  // Audio block
  if (repr.type === "audio" && repr.src) {
    return {
      type: "audio",
      src: repr.src,
      caption: repr.cap || undefined,
      mimeType: guessMimeType(repr.src, "audio"),
    };
  }
  
  // File/attachment block
  if ((repr.type === "file" || repr.type === "attachment") && repr.src) {
    return {
      type: "file",
      src: repr.src,
      caption: repr.cap || repr.name || undefined,
      mimeType: repr.mimeType || guessMimeType(repr.src, "file"),
    };
  }
  
  return null;
}

/**
 * Guess MIME type from file extension
 */
function guessMimeType(src: string, category: string): string {
  const ext = src.split(".").pop()?.toLowerCase() || "";
  
  const mimeMap: Record<string, string> = {
    // Images
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    avif: "image/avif",
    svg: "image/svg+xml",
    // Videos
    mp4: "video/mp4",
    webm: "video/webm",
    mov: "video/quicktime",
    avi: "video/x-msvideo",
    mkv: "video/x-matroska",
    // Audio
    mp3: "audio/mpeg",
    wav: "audio/wav",
    ogg: "audio/ogg",
    m4a: "audio/mp4",
    flac: "audio/flac",
  };
  
  if (mimeMap[ext]) return mimeMap[ext];
  
  // Fallback by category
  switch (category) {
    case "image": return "image/png";
    case "video": return "video/mp4";
    case "audio": return "audio/mpeg";
    default: return "application/octet-stream";
  }
}

/**
 * Convert BlockAssetInfo to FileRef
 */
function assetToFileRef(asset: BlockAssetInfo): FileRef {
  const name = asset.src.split("/").pop() || asset.src;
  return {
    path: asset.src,
    name: asset.caption || name,
    mimeType: asset.mimeType || "application/octet-stream",
    size: 0, // Unknown
    category: getFileCategory(name, asset.mimeType),
  };
}

function treeChildren(tree: any): any[] {
  if (!tree) return [];
  if (Array.isArray(tree)) return tree;
  if (Array.isArray(tree.children)) return tree.children;
  if (Array.isArray(tree.child_blocks)) return tree.child_blocks;
  if (Array.isArray(tree.childBlocks)) return tree.childBlocks;
  if (Array.isArray(tree.childBlockIds)) return tree.childBlockIds;
  if (Array.isArray(tree.childIds)) return tree.childIds;
  if (Array.isArray(tree.childrenIds)) return tree.childrenIds;
  if (Array.isArray(tree.child_ids)) return tree.child_ids;
  if (Array.isArray(tree.children_ids)) return tree.children_ids;
  if (Array.isArray(tree.blocks)) return tree.blocks;
  if (Array.isArray(tree.nodes)) return tree.nodes;
  if (Array.isArray(tree.items)) return tree.items;
  if (tree.block) return treeChildren(tree.block);
  return [];
}

function isBlockLike(obj: any): obj is Block {
  return obj && typeof obj === "object" && "id" in obj;
}

function appendLine(out: string[], line: string): void {
  if (!line) return;
  out.push(line);
}

function truncate(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  return `${text.slice(0, maxChars)}\n\n…(truncated, ${text.length - maxChars} chars omitted)`;
}

function blockTreeToLines(
  tree: any,
  opts: Required<BuildOptions>,
  state: { blocks: number; depth: number; hitLimit: boolean; assets: BlockAssetInfo[] },
  out: string[],
  resolveById: BlockResolver,
): void {
  if (!tree) return;
  if (state.blocks >= opts.maxBlocks) return;
  if (state.depth > opts.maxDepth) return;

  if (typeof tree === "number") {
    const block = resolveById(tree);
    if (block) blockTreeToLines(block, opts, state, out, resolveById);
    return;
  }
  if (typeof tree === "string" && /^\d+$/.test(tree)) {
    const id = Number(tree) as DbId;
    const block = resolveById(id);
    if (block) blockTreeToLines(block, opts, state, out, resolveById);
    return;
  }

  const node = tree?.block && typeof tree.block === "object" ? tree.block : tree;

  const nodeId = extractNodeId(node);
  const resolved = nodeId != null ? resolveById(nodeId) : undefined;
  const blockData = resolved ?? node;

  if (isBlockLike(node) || resolved) {
    // Extract asset from block
    const asset = extractAssetFromBlock(blockData);
    if (asset && state.assets.length < (opts.maxAssets || 20)) {
      state.assets.push(asset);
      // Add placeholder text for the asset
      const assetLabel = asset.caption || asset.src.split("/").pop() || "附件";
      appendLine(out, `${"  ".repeat(state.depth)}- [${asset.type}: ${assetLabel}]`);
    } else {
      const text = safeTextFromBlockLike(blockData);
      if (text) appendLine(out, `${"  ".repeat(state.depth)}- ${text}`);
    }
    state.blocks += 1;
  }

  if (state.blocks >= opts.maxBlocks) {
    state.hitLimit = true;
    return;
  }

  let children = treeChildren(tree);
  if (!children.length && isBlockLike(node) && Array.isArray(node.children)) {
    children = node.children;
  }
  if (!children.length) return;

  for (const child of children) {
    if (state.blocks >= opts.maxBlocks) break;
    if (typeof child === "number") {
      const block = resolveById(child);
      if (block) {
        state.depth += 1;
        blockTreeToLines(block, opts, state, out, resolveById);
        state.depth -= 1;
      }
      continue;
    }
    if (typeof child === "string" && /^\d+$/.test(child)) {
      const id = Number(child);
      const block = resolveById(id as DbId);
      if (block) {
        state.depth += 1;
        blockTreeToLines(block, opts, state, out, resolveById);
        state.depth -= 1;
      }
      continue;
    }

    state.depth += 1;
    blockTreeToLines(child, opts, state, out, resolveById);
    state.depth -= 1;
  }
}

async function getBlockTree(blockId: DbId): Promise<any> {
  const result = await orca.invokeBackend("get-block-tree", blockId);
  const payload = unwrapBackendResult<any>(result);
  throwIfBackendError(payload, "get-block-tree");
  return payload;
}

async function getBlocks(blockIds: DbId[]): Promise<Block[]> {
  const result = await orca.invokeBackend("get-blocks", blockIds);
  const payload = unwrapBackendResult<any>(result);
  throwIfBackendError(payload, "get-blocks");
  return payload as Block[];
}

async function getBlocksWithTags(tag: string): Promise<Block[]> {
  const tagName = normalizeTagName(tag);
  const result = await orca.invokeBackend("get-blocks-with-tags", [tagName]);
  const payload = unwrapBackendResult<any>(result);
  throwIfBackendError(payload, "get-blocks-with-tags");
  return payload as Block[];
}

function collectIdsFromTree(tree: any, out: Set<DbId>, limit: number): void {
  if (!tree) return;
  if (out.size >= limit) return;

  if (typeof tree === "number") {
    out.add(tree);
    return;
  }
  if (typeof tree === "string" && /^\d+$/.test(tree)) {
    out.add(Number(tree) as DbId);
    return;
  }

  const node = tree?.block && typeof tree.block === "object" ? tree.block : tree;
  const id = extractNodeId(node);
  if (typeof id === "number") out.add(id);

  const children = treeChildren(tree);
  for (const child of children) {
    if (out.size >= limit) break;
    collectIdsFromTree(child, out, limit);
  }
}

async function buildResolverFromTree(
  tree: any,
  opts: Required<BuildOptions>,
): Promise<BlockResolver> {
  const ids = new Set<DbId>();
  const limit = Math.max(2000, opts.maxBlocks * 10);
  collectIdsFromTree(tree, ids, limit);

  const idList = Array.from(ids);
  const missing = idList.filter((id) => !(orca.state.blocks as any)?.[id]);

  const fetched: Block[] = [];
  const chunkSize = 200;
  for (let i = 0; i < missing.length; i += chunkSize) {
    const chunk = missing.slice(i, i + chunkSize);
    const blocks = await getBlocks(chunk);
    fetched.push(...blocks);
  }

  const fetchedMap = new Map<DbId, Block>();
  for (const b of fetched) fetchedMap.set(b.id, b);

  return (id: DbId) => fetchedMap.get(id) ?? ((orca.state.blocks as any)?.[id] as any);
}

/**
 * Build context text for sending to AI
 * Only supports page and tag types
 * Returns both text and extracted assets (images, videos, etc.)
 */
export async function buildContextForSend(
  contexts: ContextRef[],
  opts?: BuildOptions,
): Promise<ContextBuildResult> {
  const options: Required<BuildOptions> = {
    maxBlocks: opts?.maxBlocks ?? 300,
    maxChars: opts?.maxChars ?? 60_000,
    maxDepth: opts?.maxDepth ?? 10,
    maxTagRoots: opts?.maxTagRoots ?? 50,
    maxAssets: opts?.maxAssets ?? 20,
  };

  const sections: string[] = [];
  const allAssets: BlockAssetInfo[] = [];

  for (const ctx of contexts) {
    try {
      if (ctx.kind === "page") {
        const title =
          ctx.title ??
          safeTextFromBlockLike((orca.state.blocks as any)?.[ctx.rootBlockId]) ??
          `Page ${ctx.rootBlockId}`;
        // 包含块 ID，让 AI 知道这是精确的块引用，无需再搜索
        sections.push(`## Page: ${title} (blockId: ${ctx.rootBlockId})`);

        const tree = await getBlockTree(ctx.rootBlockId);
        const resolveById = await buildResolverFromTree(tree, options);
        const lines: string[] = [];
        const state = { blocks: 0, depth: 0, hitLimit: false, assets: [] as BlockAssetInfo[] };
        blockTreeToLines(tree, options, state, lines, resolveById);
        if (state.hitLimit) lines.push(`- …(maxBlocks=${options.maxBlocks} reached)`);
        sections.push(lines.join("\n") || "(empty)");
        
        // Collect assets
        allAssets.push(...state.assets);
        continue;
      }

      if (ctx.kind === "tag") {
        const tagName = normalizeTagName(ctx.tag);
        sections.push(`## Tag: #${tagName}`);

        const blocks = await getBlocksWithTags(tagName);
        const roots = blocks.slice(0, options.maxTagRoots);
        const lines: string[] = [];
        const state = { blocks: 0, depth: 0, hitLimit: false, assets: [] as BlockAssetInfo[] };

        for (const b of roots) {
          if (state.blocks >= options.maxBlocks) break;
          
          // Check if root block has asset
          const rootAsset = extractAssetFromBlock(b);
          if (rootAsset && state.assets.length < options.maxAssets) {
            state.assets.push(rootAsset);
            const assetLabel = rootAsset.caption || rootAsset.src.split("/").pop() || "附件";
            appendLine(lines, `- [${rootAsset.type}: ${assetLabel}]`);
          } else {
            const title = safeTextFromBlockLike(b) || `(Block ${b.id})`;
            appendLine(lines, `- ${title}`);
          }
          state.blocks += 1;
          
          if (state.blocks >= options.maxBlocks) {
            state.hitLimit = true;
            break;
          }
          try {
            const tree = await getBlockTree(b.id as any);
            const resolveById = await buildResolverFromTree(tree, options);
            const children = treeChildren(tree);
            state.depth = 1;
            for (const child of children) {
              if (state.hitLimit) break;
              blockTreeToLines(child, options, state, lines, resolveById);
            }
            state.depth = 0;
          } catch {
            appendLine(lines, `  - (failed to load tree)`);
          }
          if (state.hitLimit) break;
        }

        if (blocks.length > options.maxTagRoots) {
          lines.push(`- …(${blocks.length - options.maxTagRoots} more tagged blocks omitted)`);
        }
        if (state.hitLimit) lines.push(`- …(maxBlocks=${options.maxBlocks} reached)`);

        sections.push(lines.join("\n") || "(empty)");
        
        // Collect assets
        allAssets.push(...state.assets);
        continue;
      }
    } catch (err: any) {
      sections.push(`## ${ctx.kind} error`);
      sections.push(String(err?.message ?? err ?? "unknown error"));
    }
  }

  const merged = sections.join("\n\n");
  
  // Convert assets to FileRef, limit to maxAssets
  const assets = allAssets
    .slice(0, options.maxAssets)
    .map(assetToFileRef);
  
  return {
    text: truncate(merged, options.maxChars),
    assets,
  };
}
