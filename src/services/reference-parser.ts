/**
 * Reference Parser Module
 * 解析用户输入中的块引用、链接引用和页面引用
 * 
 * Requirements: 1.1, 1.2, 1.3, 2.1, 2.2
 */

export interface ParsedReference {
  type: 'block' | 'page' | 'tag';
  id?: number;           // 块ID
  name?: string;         // 页面名称
  tag?: string;          // 标签名称（不带 #）
  originalText: string;  // 原始引用文本
}

export interface ParseResult {
  references: ParsedReference[];
  remainingText: string;  // 移除引用后的剩余文本（作为主题描述）
}

// 块引用: ((12345))
const BLOCK_REF_PATTERN = /\(\((\d+)\)\)/g;

// 链接引用: [标题](orca-block:12345)
const LINK_REF_PATTERN = /\[([^\]]*)\]\(orca-block:(\d+)\)/g;

// 页面引用: [[页面名称]]
const PAGE_REF_PATTERN = /\[\[([^\]]+)\]\]/g;

interface ReferenceMatch {
  reference: ParsedReference;
  index: number;
  length: number;
}

/**
 * 解析输入字符串中的所有引用
 * 支持块引用 ((id))、链接引用 [title](orca-block:id)、页面引用 [[name]]
 * 
 * @param input 用户输入字符串
 * @returns 解析结果，包含引用列表和剩余文本
 */
export function parseReferences(input: string): ParseResult {
  if (!input || typeof input !== 'string') {
    return {
      references: [],
      remainingText: input || ''
    };
  }

  const matches: ReferenceMatch[] = [];

  // 解析块引用 ((id))
  let match: RegExpExecArray | null;
  const blockRefRegex = new RegExp(BLOCK_REF_PATTERN.source, 'g');
  while ((match = blockRefRegex.exec(input)) !== null) {
    const id = parseInt(match[1], 10);
    if (!isNaN(id) && id > 0) {
      matches.push({
        reference: {
          type: 'block',
          id,
          originalText: match[0]
        },
        index: match.index,
        length: match[0].length
      });
    }
  }

  // 解析链接引用 [title](orca-block:id)
  const linkRefRegex = new RegExp(LINK_REF_PATTERN.source, 'g');
  while ((match = linkRefRegex.exec(input)) !== null) {
    const id = parseInt(match[2], 10);
    if (!isNaN(id) && id > 0) {
      matches.push({
        reference: {
          type: 'block',
          id,
          originalText: match[0]
        },
        index: match.index,
        length: match[0].length
      });
    }
  }

  // 解析页面引用 [[name]]
  const pageRefRegex = new RegExp(PAGE_REF_PATTERN.source, 'g');
  while ((match = pageRefRegex.exec(input)) !== null) {
    const name = match[1].trim();
    if (name) {
      matches.push({
        reference: {
          type: 'page',
          name,
          originalText: match[0]
        },
        index: match.index,
        length: match[0].length
      });
    }
  }

  // 按出现顺序排序
  matches.sort((a, b) => a.index - b.index);

  // 去重（同一位置可能被多个模式匹配）
  const uniqueMatches: ReferenceMatch[] = [];
  let lastEnd = -1;
  for (const m of matches) {
    if (m.index >= lastEnd) {
      uniqueMatches.push(m);
      lastEnd = m.index + m.length;
    }
  }

  // 提取引用列表
  const references = uniqueMatches.map(m => m.reference);

  // 计算剩余文本（移除所有引用后的文本）
  let remainingText = input;
  // 从后往前移除，避免索引偏移问题
  for (let i = uniqueMatches.length - 1; i >= 0; i--) {
    const m = uniqueMatches[i];
    remainingText = remainingText.slice(0, m.index) + remainingText.slice(m.index + m.length);
  }

  // 清理剩余文本（去除多余空格）
  remainingText = remainingText.replace(/\s+/g, ' ').trim();

  return {
    references,
    remainingText
  };
}
