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
 * Image info extracted from block properties
 */
export interface BlockImageInfo {
  type: "image";
  src: string;  // Relative path like "./image.avif"
  caption?: string;  // User-added caption (not OCR text)
}

/**
 * Check if a block contains an image and extract image info
 * Image info is stored in block.properties with name="_repr" and value.type="image"
 * Caption is in value.cap (user-added note, not OCR text)
 */
export function extractImageInfo(block: any): BlockImageInfo | null {
  if (!block || !Array.isArray(block.properties)) return null;
  
  const reprProp = block.properties.find((p: any) => p.name === "_repr");
  if (!reprProp || !reprProp.value) return null;
  
  if (reprProp.value.type === "image" && reprProp.value.src) {
    return {
      type: "image",
      src: reprProp.value.src,
      caption: reprProp.value.cap || undefined,  // User caption, not OCR
    };
  }
  
  return null;
}

/**
 * Extract safe text from a block-like object
 * Handles both direct text property and content array formats
 * If block contains an image, prepends image markdown syntax
 */
export function safeText(block: any): string {
  if (!block) return "";

  let text = "";

  // Try direct text property first
  if (typeof block.text === "string" && block.text.trim()) {
    text = block.text.trim();
  }
  // Handle content as string (some API responses return string directly)
  else if (typeof block.content === "string" && block.content.trim()) {
    text = block.content.trim();
  }
  // Handle content array format (Orca block format)
  else if (Array.isArray(block.content)) {
    text = block.content
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

  // Check for image in properties
  const imageInfo = extractImageInfo(block);
  if (imageInfo) {
    // Remove the "image: ./xxx" prefix and "; caption: xxx" suffix from text
    // Keep the OCR text in the middle as it may be useful
    let cleanText = text
      .replace(/^image:\s*\.\/[^\n]+\n?/i, "")  // Remove image path prefix
      .replace(/;\s*caption:\s*[^\n]*$/i, "")   // Remove caption suffix (it's in imageInfo.caption)
      .trim();
    
    // Build result: image markdown + caption + OCR text (if any)
    const imageMd = `![image](${imageInfo.src})`;
    const parts = [imageMd];
    
    if (imageInfo.caption) {
      parts.push(`备注: ${imageInfo.caption}`);
    }
    
    if (cleanText) {
      parts.push(`[图片文字]: ${cleanText}`);
    }
    
    return parts.join("\n");
  }

  return text;
}

/**
 * Extract title from block
 * Priority: aliases (page names, joined) > first line of content > "(untitled)"
 * Multiple aliases are joined with " / "
 */
export function extractTitle(block: any): string {
  // Priority 1: Use page aliases if available
  if (Array.isArray(block?.aliases) && block.aliases.length > 0) {
    const validAliases = block.aliases
      .map((a: any) => String(a).trim())
      .filter((a: string) => a.length > 0);
    
    if (validAliases.length > 0) {
      // Join multiple aliases with " / "
      const joined = validAliases.join(" / ");
      return joined.length > 60 ? joined.substring(0, 60) + "..." : joined;
    }
  }

  // Priority 2: Use content text
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
