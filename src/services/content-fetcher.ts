/**
 * Content Fetcher Module
 * 根据解析的引用获取实际内容
 * 
 * Requirements: 3.1, 3.2, 3.3, 3.4, 4.1, 4.2, 4.3
 */

import { ParsedReference } from './reference-parser';

// 内容限制常量
export const CONTENT_LIMITS = {
  maxContentLength: 50000,      // 最大内容长度（字符）
  minContentLength: 50,         // 最小内容长度
  maxBlockDepth: 5,             // 最大块层级深度
  maxChildBlocks: 100,          // 最大子块数量
  maxTagBlocks: 20,             // 标签查询的最大块数量
};

export interface FetchedContent {
  source: ParsedReference;
  content: string;
  title: string;
  childCount?: number;
  truncated?: boolean;
}

export interface FetchError {
  reference: ParsedReference;
  error: string;
  suggestions?: string[];
}

export interface FetchResult {
  contents: FetchedContent[];
  errors: FetchError[];
}

/**
 * Block data structure from Orca API
 */
export interface BlockData {
  id: number;
  content: string;
  children?: BlockData[];
  properties?: Record<string, unknown>;
}

/**
 * Page data structure from Orca API
 */
export interface PageData {
  name: string;
  rootBlock: BlockData;
}

/**
 * API interface for fetching blocks and pages
 * This allows dependency injection for testing
 */
export interface ContentAPI {
  getBlock(id: number): Promise<BlockData | null>;
  getPageByName(name: string): Promise<PageData | null>;
  searchPages(query: string): Promise<string[]>;
  searchBlocksByTag?(tag: string, maxResults?: number): Promise<number[]>;
}


/**
 * 递归格式化块内容，保留层级结构
 * Requirements: 3.2, 3.4
 */
function formatBlockContent(
  block: BlockData,
  depth: number = 0,
  maxDepth: number = CONTENT_LIMITS.maxBlockDepth
): { text: string; childCount: number } {
  const indent = '  '.repeat(depth);
  let text = block.content ? `${indent}${block.content}` : '';
  let childCount = 0;

  if (block.children && block.children.length > 0 && depth < maxDepth) {
    const childrenToProcess = block.children.slice(0, CONTENT_LIMITS.maxChildBlocks);
    childCount = block.children.length;

    for (const child of childrenToProcess) {
      const childResult = formatBlockContent(child, depth + 1, maxDepth);
      if (childResult.text) {
        text += '\n' + childResult.text;
      }
      childCount += childResult.childCount;
    }

    if (block.children.length > CONTENT_LIMITS.maxChildBlocks) {
      text += `\n${indent}  ... (${block.children.length - CONTENT_LIMITS.maxChildBlocks} more blocks)`;
    }
  }

  return { text, childCount };
}

/**
 * 截断内容到最大长度
 * Requirements: 4.2
 */
function truncateContent(content: string, maxLength: number): { content: string; truncated: boolean } {
  if (content.length <= maxLength) {
    return { content, truncated: false };
  }

  // 尝试在句子或段落边界截断
  const truncated = content.slice(0, maxLength);
  const lastNewline = truncated.lastIndexOf('\n');
  const lastPeriod = truncated.lastIndexOf('。');
  const lastDot = truncated.lastIndexOf('.');

  let cutPoint = maxLength;
  if (lastNewline > maxLength * 0.8) {
    cutPoint = lastNewline;
  } else if (lastPeriod > maxLength * 0.8) {
    cutPoint = lastPeriod + 1;
  } else if (lastDot > maxLength * 0.8) {
    cutPoint = lastDot + 1;
  }

  return {
    content: content.slice(0, cutPoint) + '\n... (内容已截断)',
    truncated: true
  };
}

/**
 * 获取单个块的内容
 * Requirements: 3.1, 3.2, 3.3, 3.4
 */
export async function fetchBlockContent(
  blockId: number,
  api: ContentAPI
): Promise<{ content: FetchedContent | null; error: FetchError | null }> {
  const reference: ParsedReference = {
    type: 'block',
    id: blockId,
    originalText: `((${blockId}))`
  };

  try {
    const block = await api.getBlock(blockId);

    if (!block) {
      return {
        content: null,
        error: {
          reference,
          error: `找不到块 ((${blockId}))`,
        }
      };
    }

    const { text, childCount } = formatBlockContent(block);
    const { content, truncated } = truncateContent(text, CONTENT_LIMITS.maxContentLength);

    // 生成标题：使用内容的第一行或前30个字符
    const firstLine = block.content?.split('\n')[0] || '';
    const title = firstLine.length > 30 ? firstLine.slice(0, 30) + '...' : firstLine || `Block ${blockId}`;

    return {
      content: {
        source: reference,
        content,
        title,
        childCount: childCount > 0 ? childCount : undefined,
        truncated: truncated || undefined
      },
      error: null
    };
  } catch (err) {
    return {
      content: null,
      error: {
        reference,
        error: `获取块内容失败: ${err instanceof Error ? err.message : String(err)}`
      }
    };
  }
}


/**
 * 获取页面内容
 * Requirements: 4.1, 4.2, 4.3
 */
export async function fetchPageContent(
  pageName: string,
  api: ContentAPI
): Promise<{ content: FetchedContent | null; error: FetchError | null }> {
  const reference: ParsedReference = {
    type: 'page',
    name: pageName,
    originalText: `[[${pageName}]]`
  };

  try {
    const page = await api.getPageByName(pageName);

    if (!page) {
      // 搜索相似页面名称作为建议
      let suggestions: string[] = [];
      try {
        suggestions = await api.searchPages(pageName);
      } catch {
        // 忽略搜索错误
      }

      return {
        content: null,
        error: {
          reference,
          error: `找不到页面 [[${pageName}]]`,
          suggestions: suggestions.length > 0 ? suggestions : undefined
        }
      };
    }

    const { text, childCount } = formatBlockContent(page.rootBlock);
    const { content, truncated } = truncateContent(text, CONTENT_LIMITS.maxContentLength);

    return {
      content: {
        source: reference,
        content,
        title: page.name,
        childCount: childCount > 0 ? childCount : undefined,
        truncated: truncated || undefined
      },
      error: null
    };
  } catch (err) {
    return {
      content: null,
      error: {
        reference,
        error: `获取页面内容失败: ${err instanceof Error ? err.message : String(err)}`
      }
    };
  }
}

/**
 * 批量获取多个引用的内容
 * Requirements: 3.1, 3.2, 3.3, 3.4, 4.1, 4.2, 4.3, 5.2
 */
export async function fetchContent(
  references: ParsedReference[],
  api: ContentAPI
): Promise<FetchResult> {
  const contents: FetchedContent[] = [];
  const errors: FetchError[] = [];
  const seenBlockIds = new Set<number>();
  const seenPageNames = new Set<string>();

  for (const ref of references) {
    if (ref.type === 'block' && ref.id !== undefined) {
      // 去重：跳过已处理的块ID
      if (seenBlockIds.has(ref.id)) {
        continue;
      }
      seenBlockIds.add(ref.id);

      const result = await fetchBlockContent(ref.id, api);
      if (result.content) {
        contents.push(result.content);
      }
      if (result.error) {
        errors.push(result.error);
      }
    } else if (ref.type === 'page' && ref.name) {
      // 去重：跳过已处理的页面名称（忽略大小写）
      const normalizedName = ref.name.toLowerCase();
      if (seenPageNames.has(normalizedName)) {
        continue;
      }
      seenPageNames.add(normalizedName);

      const result = await fetchPageContent(ref.name, api);
      if (result.content) {
        contents.push(result.content);
      }
      if (result.error) {
        errors.push(result.error);
      }
    } else if (ref.type === 'tag' && ref.tag) {
      if (!api.searchBlocksByTag) {
        errors.push({
          reference: ref,
          error: `标签查询未启用: #${ref.tag}`
        });
        continue;
      }

      let blockIds: number[] = [];
      try {
        blockIds = await api.searchBlocksByTag(ref.tag, CONTENT_LIMITS.maxTagBlocks);
      } catch (err) {
        errors.push({
          reference: ref,
          error: `标签查询失败 #${ref.tag}: ${err instanceof Error ? err.message : String(err)}`
        });
        continue;
      }

      if (blockIds.length === 0) {
        errors.push({
          reference: ref,
          error: `未找到标签 #${ref.tag} 的内容`
        });
        continue;
      }

      const limitedBlockIds = blockIds.slice(0, CONTENT_LIMITS.maxTagBlocks);
      for (const blockId of limitedBlockIds) {
        if (seenBlockIds.has(blockId)) {
          continue;
        }
        seenBlockIds.add(blockId);

        const result = await fetchBlockContent(blockId, api);
        if (result.content) {
          contents.push(result.content);
        }
        if (result.error) {
          errors.push(result.error);
        }
      }
    }
  }

  return { contents, errors };
}
