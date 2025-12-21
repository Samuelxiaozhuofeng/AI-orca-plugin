/**
 * Property utility functions for Orca Note
 * Provides property extraction from blocks and their references
 */

/**
 * Find property value in a properties array by name (case-insensitive fallback)
 */
export function findPropertyValueInList(list: any, propertyName: string): any | undefined {
  if (!Array.isArray(list)) return undefined;
  const target = String(propertyName ?? "").trim();
  if (!target) return undefined;

  const exact = list.find((p: any) => p && typeof p.name === "string" && p.name === target);
  if (exact && "value" in exact) return exact.value;

  const lowered = target.toLowerCase();
  const ci = list.find((p: any) => p && typeof p.name === "string" && p.name.toLowerCase() === lowered);
  if (ci && "value" in ci) return ci.value;

  return undefined;
}

/**
 * Extract a specific property value from a block, checking properties, refs, and backRefs
 */
export function extractPropertyValueFromBlock(block: any, propertyName: string): any | undefined {
  const fromProps = findPropertyValueInList(block?.properties, propertyName);
  if (fromProps !== undefined) return fromProps;

  const refs = Array.isArray(block?.refs) ? block.refs : [];
  for (const ref of refs) {
    const fromRef = findPropertyValueInList(ref?.data, propertyName);
    if (fromRef !== undefined) return fromRef;
  }

  const backRefs = Array.isArray(block?.backRefs) ? block.backRefs : [];
  for (const ref of backRefs) {
    const fromRef = findPropertyValueInList(ref?.data, propertyName);
    if (fromRef !== undefined) return fromRef;
  }

  return undefined;
}

/**
 * Build a property values object from a list of property names
 */
export function buildPropertyValues(block: any, names: string[]): Record<string, any> | undefined {
  const out: Record<string, any> = {};
  const seen = new Set<string>();

  for (const nameRaw of names) {
    const name = String(nameRaw ?? "").trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);

    const value = extractPropertyValueFromBlock(block, name);
    if (value !== undefined) out[name] = value;
  }

  return Object.keys(out).length ? out : undefined;
}

/**
 * Pick the best block object for property extraction from block/tree pair
 */
export function pickBlockForPropertyExtraction(block: any, tree: any): any {
  if (block && typeof block === "object") return block;
  if (!tree) return block;

  if (Array.isArray(tree)) {
    const candidate = tree.find((item) => item && typeof item === "object");
    return candidate ?? block;
  }

  if (tree && typeof tree === "object" && typeof (tree as any).block === "object") {
    return (tree as any).block;
  }

  if (tree && typeof tree === "object") return tree;

  return block;
}

/**
 * Extract all property values from a block, including properties from refs and backRefs.
 * This collects all tag properties (like priority, date, status) attached to the block.
 * @param block - The block object to extract properties from
 * @returns Record of property name to value, or undefined if no properties found
 */
export function extractAllProperties(block: any): Record<string, any> | undefined {
  if (!block || typeof block !== "object") return undefined;

  const out: Record<string, any> = {};
  const seen = new Set<string>();

  // Helper to add a property if not already seen
  const addProperty = (prop: any) => {
    if (!prop || typeof prop !== "object") return;
    const name = prop.name;
    if (typeof name !== "string" || !name.trim()) return;
    if (seen.has(name)) return;
    seen.add(name);
    if ("value" in prop && prop.value !== undefined) {
      out[name] = prop.value;
    }
  };

  // 1. Extract from direct properties
  if (Array.isArray(block.properties)) {
    for (const prop of block.properties) {
      addProperty(prop);
    }
  }

  // 2. Extract from refs (tag properties are usually stored here)
  if (Array.isArray(block.refs)) {
    for (const ref of block.refs) {
      if (Array.isArray(ref?.data)) {
        for (const prop of ref.data) {
          addProperty(prop);
        }
      }
    }
  }

  // 3. Extract from backRefs
  if (Array.isArray(block.backRefs)) {
    for (const ref of block.backRefs) {
      if (Array.isArray(ref?.data)) {
        for (const prop of ref.data) {
          addProperty(prop);
        }
      }
    }
  }

  return Object.keys(out).length ? out : undefined;
}
