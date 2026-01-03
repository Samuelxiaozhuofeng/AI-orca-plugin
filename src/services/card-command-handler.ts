/**
 * Card Command Handler Module
 * 整合引用解析、内容获取和闪卡生成流程
 * 
 * Requirements: 5.1, 5.2, 5.3, 6.1, 6.2, 6.3
 */

import { parseReferences, ParsedReference, ParseResult } from './reference-parser';
import { fetchContent, FetchResult, FetchedContent, ContentAPI, CONTENT_LIMITS } from './content-fetcher';

/**
 * Context item from the context selector
 */
export interface ContextItem {
  kind: 'page' | 'tag';
  rootBlockId?: number;
  title?: string;
  tag?: string;
  priority?: number;
}

/**
 * Options for handling the /card command
 */
export interface CardCommandOptions {
  input: string;                    // 用户输入（包含 /card 命令）
  contextSelections: ContextItem[]; // 上下文选择器中的选择
  api: ContentAPI;                  // API for fetching content
}

/**
 * Result of processing the /card command
 */
export interface CardCommandResult {
  topic: string;                    // 提取的主题描述
  references: ParsedReference[];    // 解析出的引用
  contents: FetchedContent[];       // 获取到的内容
  errors: Array<{
    reference: ParsedReference;
    error: string;
    suggestions?: string[];
  }>;
  combinedContent: string;          // 合并后的内容（用于AI生成）
  sourceInfo: string;               // 源引用信息（用于闪卡元数据）
  contentTooShort: boolean;         // 内容是否过短
  contentTruncated: boolean;        // 内容是否被截断
}

/**
 * 重试上下文，用于保存已提取的内容以便重试
 * Requirements: 7.3
 */
export interface RetryContext {
  topic: string;
  combinedContent: string;
  sourceInfo: string;
  contents: FetchedContent[];
  timestamp: number;
  retryCount: number;
}


/**
 * AI生成结果
 * Requirements: 7.3
 */
export interface AIGenerationResult {
  success: boolean;
  cards?: unknown[];
  error?: string;
  retryContext?: RetryContext;
}

/**
 * 从上下文选择器项转换为引用
 * Requirements: 5.1
 */
function contextItemToReference(item: ContextItem): ParsedReference | null {
  if (item.kind === 'page' && item.rootBlockId) {
    return {
      type: 'block',
      id: item.rootBlockId,
      originalText: item.title ? `[[${item.title}]]` : `((${item.rootBlockId}))`
    };
  }
  if (item.kind === 'tag' && item.tag) {
    return {
      type: 'tag',
      tag: item.tag,
      originalText: `#${item.tag}`
    };
  }
  return null;
}

/**
 * 合并多个内容源，去除重复
 * Requirements: 5.2
 */
export function combineContentSources(
  inlineContents: FetchedContent[],
  contextContents: FetchedContent[]
): FetchedContent[] {
  const seenBlockIds = new Set<number>();
  const seenPageNames = new Set<string>();
  const combined: FetchedContent[] = [];

  // 先添加内联引用的内容（优先级更高）
  for (const content of inlineContents) {
    if (content.source.type === 'block' && content.source.id !== undefined) {
      if (!seenBlockIds.has(content.source.id)) {
        seenBlockIds.add(content.source.id);
        combined.push(content);
      }
    } else if (content.source.type === 'page' && content.source.name) {
      const normalizedName = content.source.name.toLowerCase();
      if (!seenPageNames.has(normalizedName)) {
        seenPageNames.add(normalizedName);
        combined.push(content);
      }
    }
  }

  // 再添加上下文选择器的内容（去重）
  for (const content of contextContents) {
    if (content.source.type === 'block' && content.source.id !== undefined) {
      if (!seenBlockIds.has(content.source.id)) {
        seenBlockIds.add(content.source.id);
        combined.push(content);
      }
    } else if (content.source.type === 'page' && content.source.name) {
      const normalizedName = content.source.name.toLowerCase();
      if (!seenPageNames.has(normalizedName)) {
        seenPageNames.add(normalizedName);
        combined.push(content);
      }
    }
  }

  return combined;
}

/**
 * 格式化内容用于AI生成
 * Requirements: 6.1
 */
function formatContentForAI(contents: FetchedContent[]): string {
  if (contents.length === 0) {
    return '';
  }

  const sections: string[] = [];
  
  for (const content of contents) {
    const header = `## ${content.title}`;
    const sourceRef = `来源: ${content.source.originalText}`;
    const truncatedNote = content.truncated ? '\n(内容已截断)' : '';
    
    sections.push(`${header}\n${sourceRef}\n\n${content.content}${truncatedNote}`);
  }

  return sections.join('\n\n---\n\n');
}

/**
 * 生成源引用信息用于闪卡元数据
 * Requirements: 6.2
 */
function generateSourceInfo(contents: FetchedContent[]): string {
  if (contents.length === 0) {
    return '';
  }

  const sources = contents.map(c => c.source.originalText);
  return `来源: ${sources.join(', ')}`;
}

/**
 * 处理 /card 命令
 * 解析引用、获取内容、合并多个来源
 * 
 * Requirements: 5.1, 5.2, 5.3, 6.1
 */
export async function handleCardCommand(options: CardCommandOptions): Promise<CardCommandResult> {
  const { input, contextSelections, api } = options;

  // 1. 移除 /card 命令前缀
  const cleanInput = input
    .replace(/\/card/g, '')
    .replace(/帮我构建闪卡/g, '')
    .replace(/生成闪卡/g, '')
    .trim();

  // 2. 解析内联引用
  const parseResult: ParseResult = parseReferences(cleanInput);
  const inlineReferences = parseResult.references;
  const topic = parseResult.remainingText;

  // 3. 从上下文选择器转换引用
  const contextReferences: ParsedReference[] = [];
  for (const item of contextSelections) {
    const ref = contextItemToReference(item);
    if (ref) {
      contextReferences.push(ref);
    }
  }

  // 4. 获取内联引用的内容
  let inlineResult: FetchResult = { contents: [], errors: [] };
  if (inlineReferences.length > 0) {
    inlineResult = await fetchContent(inlineReferences, api);
  }

  // 5. 获取上下文选择器的内容
  let contextResult: FetchResult = { contents: [], errors: [] };
  if (contextReferences.length > 0) {
    contextResult = await fetchContent(contextReferences, api);
  }

  // 6. 合并内容（去重）
  const combinedContents = combineContentSources(
    inlineResult.contents,
    contextResult.contents
  );

  // 7. 合并错误
  const allErrors = [...inlineResult.errors, ...contextResult.errors];

  // 8. 格式化内容
  const combinedContent = formatContentForAI(combinedContents);
  const sourceInfo = generateSourceInfo(combinedContents);

  // 9. 检查内容长度
  const totalLength = combinedContent.length;
  const contentTooShort = totalLength > 0 && totalLength < CONTENT_LIMITS.minContentLength;
  const contentTruncated = combinedContents.some(c => c.truncated);

  // 10. 合并所有引用
  const allReferences = [...inlineReferences, ...contextReferences];

  return {
    topic,
    references: allReferences,
    contents: combinedContents,
    errors: allErrors,
    combinedContent,
    sourceInfo,
    contentTooShort,
    contentTruncated
  };
}


/**
 * 生成增强的闪卡生成提示词
 * 包含源引用信息
 * Requirements: 6.2, 6.3
 */
export function enhanceFlashcardPrompt(
  basePrompt: string,
  sourceInfo: string,
  contentTooShort: boolean
): string {
  let enhanced = basePrompt;

  if (sourceInfo) {
    enhanced += `\n\n## 内容来源\n${sourceInfo}\n请在生成的闪卡中保留来源信息，可以在标签中添加来源标识。`;
  }

  if (contentTooShort) {
    enhanced += `\n\n## 注意\n提供的内容较少，请尽量从中提取有价值的知识点生成闪卡。如果内容确实不足以生成有意义的闪卡，请告知用户需要提供更多内容。`;
  }

  return enhanced;
}

/**
 * 生成带有源引用的闪卡用户提示
 * Requirements: 6.2
 */
export function generateFlashcardUserPrompt(
  topic: string,
  combinedContent: string,
  sourceInfo: string
): string {
  const parts: string[] = [];

  if (topic) {
    parts.push(`请生成关于「${topic}」的闪卡。`);
  } else {
    parts.push('请根据以下内容生成闪卡。');
  }

  if (combinedContent) {
    parts.push(`\n\n## 参考内容\n${combinedContent}`);
  }

  if (sourceInfo) {
    parts.push(`\n\n${sourceInfo}`);
  }

  return parts.join('');
}

/**
 * 检查内容是否足够生成闪卡
 * Requirements: 6.3
 */
export function validateContentForFlashcard(result: CardCommandResult): {
  valid: boolean;
  message?: string;
} {
  // 如果没有任何内容来源且没有主题
  if (result.contents.length === 0 && !result.topic) {
    return {
      valid: false,
      message: '请提供要生成闪卡的内容。您可以：\n1. 使用 ((块ID)) 或 [[页面名称]] 引用笔记内容\n2. 在上下文选择器中选择笔记页面\n3. 直接输入主题，如：/card 量子力学基础'
    };
  }

  // 如果内容过短
  if (result.contentTooShort) {
    return {
      valid: true, // 仍然允许生成，但给出警告
      message: '⚠️ 提供的内容较少，生成的闪卡可能不够全面。建议选择更多内容或提供更详细的主题描述。'
    };
  }

  return { valid: true };
}

/**
 * 错误类型枚举
 * Requirements: 7.1, 7.2
 */
export enum ErrorType {
  BLOCK_NOT_FOUND = 'BLOCK_NOT_FOUND',
  PAGE_NOT_FOUND = 'PAGE_NOT_FOUND',
  CONTENT_TOO_SHORT = 'CONTENT_TOO_SHORT',
  CONTENT_TOO_LONG = 'CONTENT_TOO_LONG',
  FETCH_FAILED = 'FETCH_FAILED',
  AI_GENERATION_FAILED = 'AI_GENERATION_FAILED'
}

/**
 * 详细错误信息接口
 * Requirements: 7.1, 7.2
 */
export interface DetailedError {
  type: ErrorType;
  message: string;
  reference?: string;
  suggestions?: string[];
  recoverable: boolean;
}

/**
 * 创建详细的错误消息
 * Requirements: 7.1, 7.2
 */
export function createDetailedError(
  type: ErrorType,
  reference: string,
  suggestions?: string[]
): DetailedError {
  const errorMessages: Record<ErrorType, { message: string; recoverable: boolean }> = {
    [ErrorType.BLOCK_NOT_FOUND]: {
      message: `找不到块 ${reference}，请检查块是否已被删除或ID是否正确`,
      recoverable: false
    },
    [ErrorType.PAGE_NOT_FOUND]: {
      message: `找不到页面 ${reference}`,
      recoverable: false
    },
    [ErrorType.CONTENT_TOO_SHORT]: {
      message: `内容太少（来自 ${reference}），无法生成有意义的闪卡。建议选择更多内容或提供更详细的主题描述`,
      recoverable: true
    },
    [ErrorType.CONTENT_TOO_LONG]: {
      message: `内容过长（来自 ${reference}），已自动截断。部分内容可能未包含在闪卡生成中`,
      recoverable: true
    },
    [ErrorType.FETCH_FAILED]: {
      message: `获取内容失败 ${reference}，请稍后重试或手动复制内容`,
      recoverable: true
    },
    [ErrorType.AI_GENERATION_FAILED]: {
      message: `AI生成闪卡失败，已保留提取的内容，您可以重试生成`,
      recoverable: true
    }
  };

  const errorInfo = errorMessages[type];
  
  return {
    type,
    message: errorInfo.message,
    reference,
    suggestions,
    recoverable: errorInfo.recoverable
  };
}

/**
 * 格式化错误消息
 * Requirements: 7.1
 */
export function formatErrorMessages(errors: CardCommandResult['errors']): string {
  if (errors.length === 0) {
    return '';
  }

  const messages: string[] = [];
  
  for (const err of errors) {
    let msg = `⚠️ ${err.error}`;
    if (err.suggestions && err.suggestions.length > 0) {
      msg += `\n   您是否要找: ${err.suggestions.slice(0, 3).join(', ')}`;
    }
    messages.push(msg);
  }

  return messages.join('\n');
}

/**
 * 格式化详细错误消息
 * Requirements: 7.1, 7.2
 */
export function formatDetailedErrors(errors: DetailedError[]): string {
  if (errors.length === 0) {
    return '';
  }

  const messages: string[] = [];
  
  for (const err of errors) {
    let msg = `⚠️ ${err.message}`;
    if (err.suggestions && err.suggestions.length > 0) {
      msg += `\n   您是否要找: ${err.suggestions.slice(0, 3).join(', ')}`;
    }
    if (err.recoverable) {
      msg += '\n   💡 此错误可恢复，您可以尝试重试';
    }
    messages.push(msg);
  }

  return messages.join('\n\n');
}

/**
 * 创建重试上下文
 * 用于在AI生成失败时保存已提取的内容
 * Requirements: 7.3
 */
export function createRetryContext(result: CardCommandResult, retryCount: number = 0): RetryContext {
  return {
    topic: result.topic,
    combinedContent: result.combinedContent,
    sourceInfo: result.sourceInfo,
    contents: result.contents,
    timestamp: Date.now(),
    retryCount
  };
}

/**
 * 检查重试上下文是否有效
 * 上下文在30分钟内有效
 * Requirements: 7.3
 */
export function isRetryContextValid(context: RetryContext | null | undefined): boolean {
  if (!context) {
    return false;
  }
  
  const RETRY_CONTEXT_TTL = 30 * 60 * 1000; // 30 minutes
  const now = Date.now();
  
  return (now - context.timestamp) < RETRY_CONTEXT_TTL;
}

/**
 * 从重试上下文恢复CardCommandResult
 * Requirements: 7.3
 */
export function restoreFromRetryContext(context: RetryContext): CardCommandResult {
  const contentTooShort = context.combinedContent.length > 0 && 
    context.combinedContent.length < CONTENT_LIMITS.minContentLength;
  const contentTruncated = context.contents.some(c => c.truncated);
  
  return {
    topic: context.topic,
    references: context.contents.map(c => c.source),
    contents: context.contents,
    errors: [],
    combinedContent: context.combinedContent,
    sourceInfo: context.sourceInfo,
    contentTooShort,
    contentTruncated
  };
}

/**
 * 处理AI生成失败，创建可重试的结果
 * Requirements: 7.3
 */
export function handleAIGenerationFailure(
  result: CardCommandResult,
  error: string,
  previousContext?: RetryContext
): AIGenerationResult {
  const retryCount = previousContext ? previousContext.retryCount + 1 : 0;
  const MAX_RETRIES = 3;
  
  if (retryCount >= MAX_RETRIES) {
    return {
      success: false,
      error: `AI生成失败已达最大重试次数(${MAX_RETRIES}次)。错误: ${error}`,
      retryContext: undefined
    };
  }
  
  return {
    success: false,
    error: `AI生成闪卡失败: ${error}。已保留提取的内容，您可以重试生成（第${retryCount + 1}次重试）`,
    retryContext: createRetryContext(result, retryCount)
  };
}

/**
 * 使用重试上下文重新生成
 * Requirements: 7.3
 */
export function prepareRetryGeneration(context: RetryContext): {
  canRetry: boolean;
  result?: CardCommandResult;
  message?: string;
} {
  if (!isRetryContextValid(context)) {
    return {
      canRetry: false,
      message: '重试上下文已过期（超过30分钟），请重新获取内容'
    };
  }
  
  const result = restoreFromRetryContext(context);
  
  return {
    canRetry: true,
    result,
    message: `正在使用之前提取的内容重试生成（第${context.retryCount + 1}次重试）`
  };
}

/**
 * 生成内容长度警告消息
 * Requirements: 7.1, 7.2
 */
export function generateContentLengthWarning(result: CardCommandResult): string | null {
  const warnings: string[] = [];
  
  if (result.contentTooShort) {
    warnings.push('⚠️ 内容太少，无法生成有意义的闪卡。建议选择更多内容或提供更详细的主题描述。');
  }
  
  if (result.contentTruncated) {
    warnings.push('⚠️ 内容过长，已自动截断。部分内容可能未包含在闪卡生成中。建议分批生成或选择更精确的内容范围。');
  }
  
  return warnings.length > 0 ? warnings.join('\n') : null;
}
