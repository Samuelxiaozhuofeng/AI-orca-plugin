/**
 * Shared text utility functions
 * Consolidates repeated text processing functions from multiple files
 */

/**
 * Generate a unique ID using timestamp and random string
 */
export function nowId(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * Extract safe text from a block-like object
 * Handles both direct text property and content array formats
 */
export function safeText(block: any): string {
  if (!block) return "";
  
  // Try direct text property first
  if (typeof block.text === "string" && block.text.trim()) {
    return block.text.trim();
  }
  
  // Handle content array format (Orca block format)
  if (Array.isArray(block.content)) {
    return block.content
      .map((f: any) => {
        if (!f) return "";
        // Handle various content fragment formats
        if ((f.t === "text" || f.t === "t") && typeof f.v === "string") return f.v;
        if (typeof f.v === "string") return f.v;
        return "";
      })
      .join("")
      .trim();
  }
  
  return "";
}

/**
 * Extract title from block (first line or first 50 characters)
 */
export function extractTitle(block: any): string {
  const text = safeText(block);
  if (!text) return "(untitled)";

  // Get first line or first 50 characters
  const firstLine = text.split("\n")[0];
  return firstLine.length > 50 ? firstLine.substring(0, 50) + "..." : firstLine;
}

/**
 * Extract content preview from block (first 200 characters)
 */
export function extractContent(block: any): string {
  const text = safeText(block);
  if (!text) return "";

  // Return first 200 characters as preview
  return text.length > 200 ? text.substring(0, 200) + "..." : text;
}
