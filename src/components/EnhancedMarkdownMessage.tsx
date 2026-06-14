/**
 * EnhancedMarkdownMessage Component
 * 增强版Markdown消息组件，支持：
 * - 自动解析和显示图片
 * - 引用来源显示（底部折叠列表）
 * - 智能内容增强
 */

import MarkdownMessage from "./MarkdownMessage";
import ImageGallery, { type ImageItem } from "./ImageGallery";
import CitationList, { type Citation } from "./CitationList";
import type { SourceGroup, WebSearchSource } from "../utils/source-attribution";
import { sanitizeContent } from "../services/ai/openai-client";

const React = window.React as unknown as {
  createElement: typeof window.React.createElement;
  useState: <T>(initial: T | (() => T)) => [T, (next: T | ((prev: T) => T)) => void];
  useCallback: <T extends (...args: any[]) => any>(fn: T, deps: any[]) => T;
  useMemo: <T>(factory: () => T, deps: any[]) => T;
  useEffect: (effect: () => void | (() => void), deps?: any[]) => void;
  Fragment: typeof window.React.Fragment;
};
const { createElement, useMemo, useCallback, Fragment } = React;

interface EnhancedMarkdownMessageProps {
  content: string;
  role: "user" | "assistant" | "tool";
  // 可选的图片和引用数据
  images?: ImageItem[];
  citations?: Citation[];
  sourceGroups?: SourceGroup[];
  sourceResults?: WebSearchSource[];
  activeSourceGroupId?: string | null;
  activeBadgeKey?: string | null;
  onHoverSourceGroup?: (groupId: string, anchorRect?: DOMRect, badgeKey?: string) => void;
  onLeaveSourceGroup?: () => void;
  // 是否自动解析内容中的图片和引用
  autoParseEnhancements?: boolean;
}

/**
 * 从Markdown内容中解析图片
 */
function parseImagesFromMarkdown(content: string): { images: ImageItem[], hasMarkdownImages: boolean } {
  const images: ImageItem[] = [];
  
  // 匹配Markdown图片语法: ![alt](url "title")
  const imageRegex = /!\[([^\]]*)\]\(([^)]+)(?:\s+"([^"]*)")?\)/g;
  let match;
  
  while ((match = imageRegex.exec(content)) !== null) {
    const [, alt, url, title] = match;
    
    // 只处理HTTP/HTTPS图片URL
    if (url.startsWith('http://') || url.startsWith('https://')) {
      images.push({
        url: url.trim(),
        title: title || alt || '图片',
        sourceUrl: url.trim(),
      });
    }
  }
  
  return { images, hasMarkdownImages: images.length > 0 };
}

/**
 * 从Markdown内容中解析引用
 */
function parseCitationsFromMarkdown(content: string): Citation[] {
  const citations: Citation[] = [];
  
  // 匹配引用格式: [标题](URL)
  const citationRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
  let match;
  let citationIndex = 1;
  
  while ((match = citationRegex.exec(content)) !== null) {
    const [, title, url] = match;
    
    // 只处理HTTP/HTTPS链接
    if (url.startsWith('http://') || url.startsWith('https://')) {
      const domain = extractDomain(url);
      
      citations.push({
        id: `citation-${citationIndex}`,
        title: title || `引用 ${citationIndex}`,
        url: url.trim(),
        domain,
        type: "web",
      });
      
      citationIndex++;
    }
  }
  
  // 匹配参考来源部分
  const referenceSection = content.match(/---\s*\*\*参考来源:\*\*\s*([\s\S]*?)(?:\n\n|$)/);
  if (referenceSection) {
    const referencesText = referenceSection[1];
    const referenceRegex = /(\d+)\.\s*\[([^\]]+)\]\(([^)]+)\)([^\n]*)/g;
    let refMatch;
    
    while ((refMatch = referenceRegex.exec(referencesText)) !== null) {
      const [, number, title, url, extra] = refMatch;
      
      if (url.startsWith('http://') || url.startsWith('https://')) {
        const domain = extractDomain(url);
        
        // 解析额外信息（域名、日期等）
        const domainMatch = extra.match(/\(([^)]+)\)/);
        const dateMatch = extra.match(/- ([^)]+)$/);
        
        citations.push({
          id: `ref-${number}`,
          title: title.trim(),
          url: url.trim(),
          domain: domainMatch ? domainMatch[1] : domain,
          publishedDate: dateMatch ? dateMatch[1] : undefined,
          type: "web",
        });
      }
    }
  }
  
  return citations;
}

/**
 * 从URL提取域名
 */
function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

export default function EnhancedMarkdownMessage({
  content,
  role,
  images: providedImages,
  citations: providedCitations,
  sourceGroups,
  sourceResults,
  activeSourceGroupId,
  activeBadgeKey,
  onHoverSourceGroup,
  onLeaveSourceGroup,
  autoParseEnhancements = true,
}: EnhancedMarkdownMessageProps) {
  
  // 使用useCallback优化内容清理函数
  const cleanContent = useCallback((rawContent: string) => {
    return sanitizeContent(rawContent)
      .replace(/<orca-tool[^>]*><\/orca-tool>/gi, "")
      .replace(/<orca-tool[^>]*\/>/gi, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }, []);
  
  // 解析内容中的图片和引用 - 智能显示模式切换
  const { parsedCitations, cleanedContent, hasMarkdownImages } = useMemo(() => {
    const contentToUse = cleanContent(content);
    
    if (!autoParseEnhancements) {
      return {
        parsedCitations: [],
        cleanedContent: contentToUse,
        hasMarkdownImages: false,
      };
    }
    
    // 检测是否有Markdown图片
    const hasMarkdownImgs = contentToUse.includes('![') && contentToUse.includes('](');
    
    // 解析Markdown中的图片（仅用于检测）
    const { hasMarkdownImages: hasImgs } = hasMarkdownImgs
      ? parseImagesFromMarkdown(contentToUse)
      : { hasMarkdownImages: false };
    
    // 只有当内容包含引用格式时才解析引用，避免不必要的正则操作
    const citations = (contentToUse.includes('[') && contentToUse.includes('](') && contentToUse.includes('http'))
      ? parseCitationsFromMarkdown(contentToUse)
      : [];
    
    // 只清理参考来源部分，保留Markdown图片让其自然显示
    const cleaned = (contentToUse.includes('---') && contentToUse.includes('**参考来源:**'))
      ? contentToUse.replace(/---\s*\*\*参考来源:\*\*\s*[\s\S]*?(?=\n\n|$)/g, '')
      : contentToUse;
    
    return {
      parsedCitations: citations,
      cleanedContent: cleaned.replace(/\n{3,}/g, '\n\n').trim(),
      hasMarkdownImages: hasImgs,
    };
  }, [content, autoParseEnhancements, cleanContent]);
  
  // 智能图片显示策略：
  // - 如果有Markdown图片：不显示ImageGallery，让Markdown自己处理
  // - 如果只有AI工具图片：用ImageGallery显示
  const finalImages = useMemo(() => {
    // 如果内容中有Markdown图片，就不使用ImageGallery模式
    if (hasMarkdownImages) {
      return [];
    }
    
    // 只有AI工具调用的图片时，才使用ImageGallery
    if (!providedImages || providedImages.length === 0) {
      return [];
    }
    
    // 去重 - 使用更高效的去重算法
    const seen = new Set<string>();
    return providedImages.filter(img => {
      if (seen.has(img.url)) return false;
      seen.add(img.url);
      return true;
    });
  }, [providedImages, hasMarkdownImages]);
  
  // 合并引用 - 优化依赖项
  const finalCitations = useMemo(() => {
    const allCitations = [
      ...(providedCitations || []), 
      ...parsedCitations,
    ];
    
    if (allCitations.length === 0) {
      return [];
    }
    
    // 去重 - 使用更高效的去重算法
    const seen = new Set<string>();
    return allCitations.filter(citation => {
      if (seen.has(citation.url)) return false;
      seen.add(citation.url);
      return true;
    });
  }, [providedCitations, parsedCitations]);
  
  return createElement(
    Fragment,
    null,
    // 智能图片显示策略：
    // - 有Markdown图片时：不显示ImageGallery，让Markdown自己处理图片
    // - 只有AI工具图片时：用ImageGallery统一显示
    finalImages.length > 0 && createElement(ImageGallery, {
      images: finalImages,
      maxDisplay: 6,
      // 智能布局选择：1-2张用行布局，3张以上用网格布局
      layout: finalImages.length <= 2 ? "row" : "grid",
    }),
    // Markdown内容
    createElement(MarkdownMessage, {
      content: cleanedContent,
      role,
      sourceGroups,
      sourceResults,
      activeSourceGroupId,
      activeBadgeKey,
      onHoverSourceGroup,
      onLeaveSourceGroup,
    }),
    // 引用列表（在内容之后，默认折叠）
    finalCitations.length > 0 && createElement(CitationList, {
      citations: finalCitations,
      compact: false,
      defaultCollapsed: true, // 默认折叠
    })
  );
}
