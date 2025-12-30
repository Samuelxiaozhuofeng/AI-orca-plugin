import type { DbId } from "../orca.d.ts";
import { safeText } from "../utils/text-utils";

const { proxy } = (window as any).Valtio as {
  proxy: <T extends object>(obj: T) => T;
};

/**
 * Context priority levels
 * Higher number = higher priority (appears earlier in context)
 * - 0: Normal context (added via @ picker)
 * - 1: High priority (dragged blocks)
 */
export type ContextPriority = 0 | 1;

/**
 * Context reference types (simplified: only page and tag, no block-level)
 */
export type ContextRef =
  | { kind: "page"; rootBlockId: DbId; title: string; priority?: ContextPriority }
  | { kind: "tag"; tag: string; priority?: ContextPriority };

export function contextKey(ref: ContextRef): string {
  switch (ref.kind) {
    case "page":
      return `page:${ref.rootBlockId}`;
    case "tag":
      return `tag:${normalizeTagName(ref.tag)}`;
  }
}

export function normalizeTagName(tag: string): string {
  const trimmed = tag.trim();
  if (trimmed.startsWith("#")) return trimmed.slice(1);
  return trimmed;
}

type ContextStore = {
  selected: ContextRef[];
};

export const contextStore = proxy<ContextStore>({
  selected: [],
});

export function addContext(ref: ContextRef): boolean {
  const key = contextKey(ref);
  if (contextStore.selected.some((c) => contextKey(c) === key)) return false;
  // 按优先级排序插入：高优先级在前
  const priority = ref.priority ?? 0;
  const insertIndex = contextStore.selected.findIndex((c) => (c.priority ?? 0) < priority);
  if (insertIndex === -1) {
    contextStore.selected = [...contextStore.selected, ref];
  } else {
    const newSelected = [...contextStore.selected];
    newSelected.splice(insertIndex, 0, ref);
    contextStore.selected = newSelected;
  }
  return true;
}

/**
 * Add current active page as context
 */
export function addCurrentPage(rootBlockId: DbId, title: string): boolean {
  return addContext({ kind: "page", rootBlockId, title });
}

/**
 * Add a page by ID (fetches title from orca.state.blocks)
 * @param priority - 0 for normal, 1 for high priority (dragged blocks)
 */
export function addPageById(rootBlockId: DbId, priority: ContextPriority = 0): boolean {
  const block = (orca.state.blocks as any)?.[rootBlockId];
  const title = safeText(block) || `Page ${rootBlockId}`;
  return addContext({ kind: "page", rootBlockId, title, priority });
}

/**
 * Add a tag as context
 */
export function addTagContext(tag: string): boolean {
  const normalized = normalizeTagName(tag);
  if (!normalized) return false;
  return addContext({ kind: "tag", tag: normalized });
}

export function removeContext(key: string): void {
  contextStore.selected = contextStore.selected.filter((c) => contextKey(c) !== key);
}

export function clearContexts(): void {
  contextStore.selected = [];
}

/**
 * Clear high priority contexts (dragged blocks)
 * Called after sending a message to remove temporary context
 */
export function clearHighPriorityContexts(): void {
  contextStore.selected = contextStore.selected.filter((c) => (c.priority ?? 0) === 0);
}

/**
 * Get display label for a context ref (used in chips)
 */
export function getDisplayLabel(ref: ContextRef): string {
  switch (ref.kind) {
    case "page":
      return ref.title || `Page ${ref.rootBlockId}`;
    case "tag":
      return `#${ref.tag}`;
  }
}
