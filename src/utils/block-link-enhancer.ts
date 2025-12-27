/**
 * Block Link Enhancement Utility
 * Ensures consistent block link rendering across AI responses
 */

export interface BlockReference {
  blockId: number;
  startIndex: number;
  endIndex: number;
  originalText: string;
}

/**
 * Detect block ID references in text
 * Patterns: "blockid:123", "block #123", "Block 123", "块 #123", "笔记 #123"
 */
export function detectBlockReferences(text: string): BlockReference[] {
  const patterns = [
    /blockid:(\d+)/gi,
    /(?:block|Block|块|笔记)\s*#?(\d+)/g,
    /\[([^\]]+)\]\(orca-block:(\d+)\)/g,
  ];
  
  const references: BlockReference[] = [];
  
  for (const pattern of patterns) {
    let match;
    while ((match = pattern.exec(text)) !== null) {
      const blockId = parseInt(match[1] || match[2], 10);
      if (!isNaN(blockId) && blockId > 0) {
        references.push({
          blockId,
          startIndex: match.index,
          endIndex: match.index + match[0].length,
          originalText: match[0],
        });
      }
    }
  }
  
  return references;
}

/**
 * Enhance text by converting block references to clickable links
 * This ensures that even if AI modifies the response, block IDs are still linkable
 */
export function enhanceBlockLinks(text: string): string {
  const references = detectBlockReferences(text);
  if (references.length === 0) return text;
  
  // Sort by position (reverse) to replace from end to start
  // This prevents index shifting issues when replacing
  references.sort((a, b) => b.startIndex - a.startIndex);
  
  let enhanced = text;
  for (const ref of references) {
    // Check if already a properly formatted link
    if (ref.originalText.includes('](orca-block:')) {
      continue;
    }
    
    const before = enhanced.substring(0, ref.startIndex);
    const after = enhanced.substring(ref.endIndex);
    const linkText = ref.originalText;
    const link = `[${linkText}](orca-block:${ref.blockId})`;
    
    enhanced = before + link + after;
  }
  
  return enhanced;
}

/**
 * Format block search results with consistent link format
 * This is the standard format used by all search tools
 */
export function formatBlockResult(block: {
  id: number;
  title: string;
  content?: string;
  fullContent?: string;
}, index: number): string {
  let linkTitle = block.title.replace(/[\[\]]/g, '');  // Escape brackets
  
  // Use block ID format for untitled blocks to prevent AI from calling getPage
  if (!linkTitle || linkTitle === '(untitled)' || linkTitle.trim() === '') {
    linkTitle = `Block #${block.id}`;
  }
  
  const body = block.fullContent ?? block.content ?? '';
  return `${index + 1}. [${linkTitle}](orca-block:${block.id})\n${body}`;
}

/**
 * Add preservation instruction to tool results
 * This helps prevent AI from removing or modifying block links
 */
export function addLinkPreservationNote(resultCount: number): string {
  if (resultCount === 0) return '';
  return '📌 提示：链接可点击。在回复中引用块时，请使用 blockid:数字 格式（例如：blockid:433），这将自动渲染为可点击的链接。\n⚠️ 注意：以上结果已包含完整内容，请勿再调用 getPage 获取详情。\n\n';
}
