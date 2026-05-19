/**
 * AI Tools for Orca AI Chat
 * This file defines the available tools for the AI model and their implementations.
 * It interacts with the Orca Host API to perform actions like searching, reading, 
 * and creating blocks.
 */

import type { OpenAITool } from "./openai-client";
import type { BlockInfo } from "../export-service";
import {
  getAllDiscoveredTools,
  isExternalMcpTool,
  callRemoteTool,
} from "../external/mcp-server-manager";
import type {
  QueryCondition,
  QueryCombineMode
} from "../../utils/query-types";
import { isWebSearchEnabled, isImageSearchEnabled, isWikipediaEnabled } from "../../store/tool-store";
import { searchWeb, searchWithFallback, formatSearchResults } from "../external/web-search-service";
import { fetchWebContent } from "../external/web-fetcher";
import { getAiChatSettings } from "../../settings/ai-chat-settings";
import { getAiChatPluginName } from "../../ui/ai-chat-ui";
import {
  TODOIST_TOOLS,
  executeTodoistTool,
  isTodoistTool,
} from "../external/todoist-tools";

// 辅助函数：从URL提取域名
function extractDomain(url: string): string {
  try {
    const urlObj = new URL(url);
    return urlObj.hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

type JournalExportCacheEntry = {
  rangeLabel: string;
  entries: any[];
  cachedAt: number;
};

const JOURNAL_EXPORT_CACHE_TTL = 30 * 60 * 1000;
const JOURNAL_EXPORT_CACHE_MAX = 5;

// 全局缓存：存储大型日记导出数据（供前端使用）
export const journalExportDataCache = new Map<string, JournalExportCacheEntry>();

// 全局缓存：存储搜索结果（供自动增强使用）
export const searchResultsCache = new Map<string, any[]>();

// 全局缓存：Skill 工具名称到 Skill ID 的映射（兼容性导出）
export const skillToolNameToSkillIdCache = new Map<string, string>();

// 日志去重缓存 - 使用更智能的去重策略
const loggedMessages = new Map<string, number>();
const LOG_THROTTLE_MS = 5000; // 5秒内相同消息只输出一次

/**
 * 从工具结果中提取搜索结果
 * 支持两种方式：
 * 1. 从缓存中获取（如果缓存存在）
 * 2. 直接从工具结果内容中解析（作为备选）
 */
export function extractSearchResultsFromToolResults(
  toolResults?: Map<string, { content: string; name: string }>
): any[] {
  if (!toolResults) return [];
  
  const allSearchResults: any[] = [];
  
  for (const [toolCallId, result] of toolResults.entries()) {
    if (result.name === "webSearch") {
      // 方式1：从缓存中获取
      const cacheKeyMatch = result.content.match(/<!-- search-cache:([^>]+) -->/);
      if (cacheKeyMatch) {
        const cacheKey = cacheKeyMatch[1];
        const cachedResults = searchResultsCache.get(cacheKey);
        if (cachedResults && cachedResults.length > 0) {
          allSearchResults.push(...cachedResults);
          
          // 智能日志去重
          const logKey = `cache-${cacheKey}`;
          const now = Date.now();
          const lastLogged = loggedMessages.get(logKey) || 0;
          
          if (now - lastLogged > LOG_THROTTLE_MS) {
            loggedMessages.set(logKey, now);
          }
          continue; // 已从缓存获取，跳过解析
        }
      }
      
      // 方式2：直接从工具结果内容中解析搜索结果
      // 格式：1. [标题](URL)\n   发布时间: xxx\n   内容摘要
      const parsedResults = parseSearchResultsFromContent(result.content);
      if (parsedResults.length > 0) {
        allSearchResults.push(...parsedResults);
      }
    }
  }
  
  return allSearchResults;
}

/**
 * 从webSearch工具返回的文本内容中解析搜索结果
 */
function parseSearchResultsFromContent(content: string): any[] {
  const results: any[] = [];
  
  // 匹配格式：数字. [标题](URL)
  const resultRegex = /(\d+)\.\s*\[([^\]]+)\]\(([^)]+)\)/g;
  let match;
  
  while ((match = resultRegex.exec(content)) !== null) {
    const [fullMatch, index, title, url] = match;
    
    // 只处理HTTP/HTTPS链接
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      continue;
    }
    
    // 尝试提取该结果后面的内容摘要
    const afterMatch = content.substring(match.index + fullMatch.length);
    const nextResultIndex = afterMatch.search(/\n\d+\.\s*\[/);
    const resultBlock = nextResultIndex > 0 
      ? afterMatch.substring(0, nextResultIndex) 
      : afterMatch.substring(0, 500);
    
    // 提取摘要（跳过发布时间行）
    const lines = resultBlock.split('\n').filter(line => line.trim());
    let snippet = '';
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('发布时间:') && !trimmed.startsWith('⏱️') && trimmed.length > 10) {
        snippet = trimmed;
        break;
      }
    }
    
    results.push({
      title: title.trim(),
      url: url.trim(),
      content: snippet,
      snippet: snippet,
    });
  }
  
  return results;
}

function pruneJournalExportCache(now: number): void {
  for (const [key, entry] of journalExportDataCache.entries()) {
    if (now - entry.cachedAt > JOURNAL_EXPORT_CACHE_TTL) {
      journalExportDataCache.delete(key);
    }
  }
}

function setJournalExportCache(cacheId: string, rangeLabel: string, entries: any[]): void {
  const now = Date.now();
  pruneJournalExportCache(now);

  journalExportDataCache.set(cacheId, { rangeLabel, entries, cachedAt: now });

  if (journalExportDataCache.size <= JOURNAL_EXPORT_CACHE_MAX) {
    return;
  }

  const sorted = Array.from(journalExportDataCache.entries()).sort(
    (a, b) => a[1].cachedAt - b[1].cachedAt
  );
  const excess = sorted.length - JOURNAL_EXPORT_CACHE_MAX;
  for (let i = 0; i < excess; i++) {
    journalExportDataCache.delete(sorted[i][0]);
  }
}

function extractBlocksFromTree(tree: any, depth: number = 0, maxBlocks: number = 200): BlockInfo[] {
  const blocks: BlockInfo[] = [];
  
  function traverse(node: any, currentDepth: number): void {
    if (!node || blocks.length >= maxBlocks) return;
    
    if (Array.isArray(node)) {
      for (const item of node) {
        traverse(item, currentDepth);
        if (blocks.length >= maxBlocks) break;
      }
      return;
    }
    
    // 处理数字 ID（引用）
    if (typeof node === "number") {
      const block = (orca.state.blocks as any)?.[node];
      if (block) traverse(block, currentDepth);
      return;
    }
    
    // 获取实际的块对象
    const block = node?.block && typeof node.block === "object" ? node.block : node;
    if (!block || !block.id) return;
    
    // 提取文本内容
    let content = "";
    if (block.content) {
      if (typeof block.content === "string") {
        content = block.content;
      } else if (Array.isArray(block.content)) {
        content = block.content.map((f: any) => {
          if (typeof f?.v === "string") return f.v;
          if (typeof f?.v === "number") return String(f.v);
          return "";
        }).join("");
      }
    }
    
    blocks.push({
      id: block.id,
      content: content.trim(),
      created: block.created ? new Date(block.created).toISOString() : undefined,
      modified: block.modified ? new Date(block.modified).toISOString() : undefined,
      depth: currentDepth,
    });
    
    // 处理子块
    const children = node?.children || node?.tree?.children || block?.children;
    if (Array.isArray(children)) {
      for (const child of children) {
        traverse(child, currentDepth + 1);
        if (blocks.length >= maxBlocks) break;
      }
    }
  }
  
  traverse(tree, depth);
  return blocks;
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * AI Tool Definitions (JSON Schema for OpenAI)
 * ═══════════════════════════════════════════════════════════════════════════
 */
export const TOOLS: OpenAITool[] = [
  {
    type: "function",
    function: {
      name: "tool_instructions",
      description: `获取指定工具的用法说明（仅返回该工具）。`,
      parameters: {
        type: "object",
        properties: {
          toolName: {
            type: "string",
            description: "工具名称，如 webSearch 或以 mcp__ 开头的外部工具。",
          },
        },
        required: ["toolName"],
      },
    },
  },
];

/**
 * 联网搜索工具 - 仅在用户开启联网搜索时添加
 */
export const WEB_SEARCH_TOOL: OpenAITool = {
  type: "function",
  function: {
    name: "webSearch",
    description: `联网搜索获取实时信息。

【何时使用】
- 用户问最新的新闻、事件、数据
- 需要实时信息（天气、股价、比赛结果等）
- 笔记库中没有的外部知识
- 用户明确要求搜索网络

【参数】
- query: 搜索关键词，用英文效果更好
- maxResults: 返回结果数，默认5

【注意】
- 优先使用笔记库工具查找用户自己的内容
- 只在需要外部信息时使用此工具`,
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "搜索关键词",
        },
        maxResults: {
          type: "number",
          description: "最大结果数，默认5，最大20",
        },
      },
      required: ["query"],
    },
  },
};

/**
 * 网页抓取工具 - 获取任意 URL 的完整网页内容
 */
export const WEB_FETCH_TOOL: OpenAITool = {
  type: "function",
  function: {
    name: "webFetch",
    description: `抓取指定 URL 的网页内容并转换为可读的 Markdown 格式。

【何时使用】
- 搜索结果中的链接需要查看完整内容时
- 用户要求阅读/查看某个网页
- 需要从网页获取详细信息
- 用户分享了链接需要了解内容

【参数】
- url: 要抓取的网页 URL（必需，完整的 https/http 链接）

【注意】
- 仅支持 http/https 链接
- 自动提取页面主要内容，过滤广告和导航
- 返回 Markdown 格式的文本`,
    parameters: {
      type: "object",
      properties: {
        url: {
          type: "string",
          description: "要抓取的网页完整 URL",
        },
      },
      required: ["url"],
    },
  },
};


/**
 * 图片搜索工具 - 搜索互联网上的图片
 */
export const IMAGE_SEARCH_TOOL: OpenAITool = {
  type: "function",
  function: {
    name: "imageSearch",
    description: `搜索互联网上的图片。

【何时使用】
- 用户要求找图片、配图、插图
- 用户想了解某事物的外观
- 需要为内容配展示图片

【参数】
- query: 图片搜索关键词
- maxResults: 返回结果数，默认5`,
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "搜索关键词",
        },
        maxResults: {
          type: "number",
          description: "最大结果数，默认5，最大20",
        },
      },
      required: ["query"],
    },
  },
};

/**
 * 维基百科搜索工具 - 查询 Wikipedia 知识
 */
export const WIKIPEDIA_TOOL: OpenAITool = {
  type: "function",
  function: {
    name: "wikipedia",
    description: `查询维基百科获取知识性内容。

【何时使用】
- 用户询问概念、人物、事件的定义/背景
- 需要权威参考资料
- 笔记库中没有的外部知识

【参数】
- query: 搜索关键词（建议用英文）
- language: 语言代码，默认 zh（中文）`,
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "搜索关键词",
        },
        language: {
          type: "string",
          description: "语言代码：zh（中文）、en（英文）、ja（日文），默认zh",
        },
      },
      required: ["query"],
    },
  },
};

/**
 * 获取工具列表（直接返回 MCP 工具 + 条件性联网/维基/汇率工具）
 */
export function getTools(
  webSearchEnabled?: boolean,
  todoistEnabled?: boolean
): OpenAITool[] {
  const webSearchOn = webSearchEnabled ?? isWebSearchEnabled();
  const imageSearchOn = isImageSearchEnabled();
  const wikipediaOn = isWikipediaEnabled();

  const tools: OpenAITool[] = [];

  // 外部 MCP 服务器工具（标准 MCP 协议）
  tools.push(...getAllDiscoveredTools());

  if (webSearchOn) {
    tools.push(WEB_SEARCH_TOOL);
    tools.push(WEB_FETCH_TOOL);
  }

  if (imageSearchOn) {
    tools.push(IMAGE_SEARCH_TOOL);
  }

  if (wikipediaOn) {
    tools.push(WIKIPEDIA_TOOL);
  }

  // Todoist AI 模式（/todoist-ai 命令启用）
  if (todoistEnabled) {
    tools.push(...TODOIST_TOOLS);
  }

  return tools;
}

/**
 * 闪卡生成工具 - 仅供 /card 命令使用，不包含在普通对话工具列表中
 */
export const FLASHCARD_TOOL: OpenAITool = {
  type: "function",
  function: {
    name: "generateFlashcards",
    description: `生成闪卡。根据对话内容或指定主题，生成 5-8 张闪卡用于记忆学习。必须调用此工具，不要用文本回复！`,
    parameters: {
      type: "object",
      properties: {
        cards: {
          type: "array",
          description: "闪卡列表，5-8 张",
          items: {
            type: "object",
            properties: {
              question: {
                type: "string",
                description: "问题（简洁明了）",
              },
              answer: {
                type: "string",
                description: "答案（简洁，≤20字为佳）。选择题不需要此字段",
              },
              type: {
                type: "string",
                enum: ["basic", "choice"],
                description: "卡片类型：basic（问答）或 choice（选择题）",
              },
              options: {
                type: "array",
                description: "选择题选项（仅 type=choice 时需要）",
                items: {
                  type: "object",
                  properties: {
                    text: {
                      type: "string",
                      description: "选项文本",
                    },
                    isCorrect: {
                      type: "boolean",
                      description: "是否为正确答案",
                    },
                  },
                  required: ["text", "isCorrect"],
                },
              },
            },
            required: ["question", "type"],
          },
        },
      },
      required: ["cards"],
    },
  },
};

/**
 * 搜索类工具名称列表 - 当用户拖入块时禁用这些工具
 * 因为用户已经明确指定了要讨论的块，不需要再搜索笔记
/**
 * 获取限制后的工具列表（当用户拖入块时使用）
 * 禁用搜索类工具，只保留读取和写入工具
 */
export function getToolsForDraggedContext(): OpenAITool[] {
  return getAllDiscoveredTools();
}

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * Tool Implementation Logic
 * ═══════════════════════════════════════════════════════════════════════════
 */

/**
 * 获取块的根页面 ID（向上追溯到 parent === null 的块）
 */
async function getRootBlockId(blockId: number): Promise<number | undefined> {
  let currentId = blockId;
  let safetyCounter = 0;

  try {
    while (safetyCounter < 20) {
      const block = orca.state.blocks[currentId] || await orca.invokeBackend("get-block", currentId);
      if (!block) return currentId;
      if (!block.parent) return block.id;
      currentId = block.parent;
      safetyCounter++;
    }
  } catch (error) {
  }
  return currentId;
}

/**
 * 将任意输入转换为有限数字。
 */
function toFiniteNumber(val: any): number | undefined {
  if (val === null || val === undefined) return undefined;
  const num = Number(val);
  return Number.isFinite(num) ? num : undefined;
}

/**
 * 规范化标签名（去除前导 #）。
 */
function normalizeTagNameForTool(tagName: string): string {
  const trimmed = String(tagName ?? "").trim();
  if (trimmed.startsWith("#")) return trimmed.slice(1);
  return trimmed;
}

type TagPropertyInput = {
  name: string;
  value: any;
  type?: number;
};

type TagPropertyMergeMode = "replace" | "merge" | "append";

/**
 * 解析 block-refs 类型的值，统一为可去重的数组。
 */
function normalizeBlockRefList(value: any): Array<number | string> {
  const rawList = Array.isArray(value) ? value : [value];
  const normalized: Array<number | string> = [];

  const toRefValue = (item: any): number | string | null => {
    if (item === null || item === undefined) return null;
    if (typeof item === "number" && Number.isFinite(item)) return Math.trunc(item);
    if (typeof item === "string") {
      const trimmed = item.trim();
      if (!trimmed) return null;
      const match = trimmed.match(/^(?:orca-block:|blockid:)?(\d+)$/i);
      if (match) return Number(match[1]);
      return trimmed;
    }
    return null;
  };

  for (const item of rawList) {
    if (Array.isArray(item)) {
      for (const nested of item) {
        const normalizedValue = toRefValue(nested);
        if (normalizedValue !== null) normalized.push(normalizedValue);
      }
      continue;
    }
    const normalizedValue = toRefValue(item);
    if (normalizedValue !== null) normalized.push(normalizedValue);
  }

  return normalized;
}

/**
 * 生成标签属性类型映射（name -> type）。
 */
function buildTagPropertyTypeMap(schema: { properties?: Array<{ name: string; type: number }> }): Map<string, number> {
  const typeMap = new Map<string, number>();
  if (!schema?.properties || !Array.isArray(schema.properties)) return typeMap;
  for (const prop of schema.properties) {
    if (!prop || typeof prop.name !== "string") continue;
    typeMap.set(prop.name.toLowerCase(), prop.type);
  }
  return typeMap;
}

/**
 * 规范化标签属性输入，补齐类型并处理 block-refs 值。
 */
function normalizeTagPropertyList(
  raw: any,
  typeMap: Map<string, number>
): TagPropertyInput[] {
  if (!Array.isArray(raw)) return [];
  const normalized: TagPropertyInput[] = [];

  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const name = String(item.name ?? "").trim();
    if (!name) continue;
    const key = name.toLowerCase();
    const inputType = Number.isFinite(Number(item.type)) ? Number(item.type) : undefined;
    const schemaType = typeMap.get(key);
    const type = inputType ?? schemaType;
    let value = item.value;

    if (type === 2) {
      value = normalizeBlockRefList(value);
    }

    normalized.push({
      name,
      value,
      ...(type !== undefined ? { type } : {}),
    });
  }

  return normalized;
}

/**
 * 合并标签属性（replace/merge/append）。
 */
function mergeTagProperties(
  existing: TagPropertyInput[],
  updates: TagPropertyInput[],
  mode: TagPropertyMergeMode,
  typeMap: Map<string, number>
): TagPropertyInput[] {
  if (mode === "replace") return updates;

  const merged = new Map<string, TagPropertyInput>();
  const order: string[] = [];

  const addProp = (prop: TagPropertyInput) => {
    const key = prop.name.toLowerCase();
    if (!key) return;
    if (!merged.has(key)) order.push(key);
    merged.set(key, prop);
  };

  for (const prop of existing) {
    const key = prop.name.toLowerCase();
    const schemaType = typeMap.get(key);
    const normalized: TagPropertyInput = {
      ...prop,
      ...(prop.type === undefined && schemaType !== undefined ? { type: schemaType } : {}),
    };
    addProp(normalized);
  }

  const mergeBlockRefs = (baseValue: any, updateValue: any): Array<number | string> => {
    const baseList = normalizeBlockRefList(baseValue);
    const updateList = normalizeBlockRefList(updateValue);
    const seen = new Set<string>();
    const combined: Array<number | string> = [];

    const pushUnique = (val: number | string) => {
      const key = typeof val === "number" ? `n:${val}` : `s:${val}`;
      if (seen.has(key)) return;
      seen.add(key);
      combined.push(val);
    };

    baseList.forEach(pushUnique);
    updateList.forEach(pushUnique);
    return combined;
  };

  for (const update of updates) {
    const key = update.name.toLowerCase();
    const existingProp = merged.get(key);
    const schemaType = typeMap.get(key);
    const resolvedType = update.type ?? existingProp?.type ?? schemaType;

    if (mode === "append" && resolvedType === 2) {
      const combinedValue = mergeBlockRefs(existingProp?.value, update.value);
      addProp({
        name: update.name,
        value: combinedValue,
        ...(resolvedType !== undefined ? { type: resolvedType } : {}),
      });
      continue;
    }

    addProp({
      name: update.name,
      value: update.value,
      ...(resolvedType !== undefined ? { type: resolvedType } : {}),
    });
  }

  return order.map((key) => merged.get(key)!).filter(Boolean);
}

type ExtractTagPropertiesResult = {
  block: any;
  tagBlockId: number;
  tagRef?: any;
  properties: TagPropertyInput[];
  tagExists: boolean;
  readError?: string;
};

/**
 * 提取块上指定标签的属性。
 */
async function extractBlockTagProperties(
  blockId: number,
  tagName: string
): Promise<ExtractTagPropertiesResult> {
  const block = orca.state.blocks[blockId] || await orca.invokeBackend("get-block", blockId);
  if (!block) {
    throw new Error(`未找到块 ${blockId}`);
  }

  const tagBlock = await orca.invokeBackend("get-block-by-alias", tagName);
  if (!tagBlock) {
    throw new Error(`找不到标签 "${tagName}"`);
  }

  const refs = Array.isArray(block.refs) ? block.refs : [];
  const tagRef = refs.find((ref: any) => ref && ref.to === tagBlock.id);
  let properties: TagPropertyInput[] = [];
  let readError: string | undefined;

  if (tagRef && Array.isArray(tagRef.data)) {
    properties = tagRef.data.map((prop: any) => ({
      name: prop?.name,
      value: prop?.value,
      ...(prop?.type !== undefined ? { type: prop.type } : {}),
    })).filter((prop: TagPropertyInput) => typeof prop.name === "string" && prop.name.trim());
  } else if (tagRef && tagRef.data !== undefined) {
    readError = "标签属性读取失败，将按替换模式处理";
  }

  return {
    block,
    tagBlockId: tagBlock.id,
    tagRef,
    properties,
    tagExists: !!tagRef,
    readError,
  };
}

/**
 * 从 block.content 提取纯文本内容
 * block.content 可能是字符串或 ContentFragment[] 数组
 */
function extractBlockText(content: any): string {
  if (!content) return "";
  
  // 如果已经是字符串，直接返回
  if (typeof content === "string") return content;
  
  // 如果是数组（ContentFragment[]），提取每个 fragment 的文本
  if (Array.isArray(content)) {
    return content.map((fragment: any) => {
      if (!fragment) return "";
      // fragment.v 是值，可能是字符串或其他类型
      if (typeof fragment.v === "string") return fragment.v;
      if (typeof fragment.v === "number") return String(fragment.v);
      // 对于复杂类型（如嵌套对象），尝试提取
      if (fragment.v && typeof fragment.v === "object") {
        // 可能是链接等，尝试获取显示文本
        return fragment.v.text || fragment.v.title || fragment.v.name || "";
      }
      return "";
    }).join("");
  }
  
  // 其他情况，尝试转字符串
  try {
    return String(content);
  } catch {
    return "";
  }
}

/**
 * 规范化日记偏移量。
 */
function normalizeJournalOffset(val: any, defaultVal: number): number {
  const num = Number(val);
  return Number.isFinite(num) ? Math.trunc(num) : defaultVal;
}

/**
 * 生成搜索结果的上限警告信息
 * @param resultCount - 实际返回的结果数
 * @param maxResults - 请求的最大结果数
 * @param actualLimit - 实际应用的上限（考虑系统最大值）
 */
function buildLimitWarning(resultCount: number, maxResults: number, actualLimit: number = 50): string {
  if (resultCount >= actualLimit) {
    return `\n\n⚠️ **注意：结果已达到上限 (${actualLimit} 条)**\n实际匹配的笔记可能更多。如需获取完整列表，请：\n1. 使用更精确的搜索条件缩小范围\n2. 或分批查询（如按时间范围分段）`;
  }
  return "";
}

/**
 * 格式化简洁模式的搜索结果（标题+摘要+ID）
 */
function formatBriefResult(result: any, index: number): string {
  // 清理标题中的链接格式，避免嵌套
  // 优先使用 tags (aliases)，然后是 title
  let title: string;
  if (Array.isArray(result.tags) && result.tags.length > 0) {
    // tags 字段存储的是 aliases
    const validTags = result.tags.filter((t: any) => typeof t === "string" && t.trim());
    title = validTags.length > 0 ? validTags.join(" / ") : (result.title || `Block #${result.id}`);
  } else {
    title = result.title || `Block #${result.id}`;
  }
  
  title = title.replace(/\[([^\]]+)\]\(orca-block:\d+\)/g, "$1"); // 移除已有的 block link
  title = title.replace(/[\[\]]/g, ""); // 移除方括号
  
  if (!title || title.trim() === "" || title === "(untitled)") {
    title = `Block #${result.id}`;
  }
  
  // 提取内容摘要（前80字符），同样清理链接格式
  let content = result.content || result.fullContent || "";
  content = content.replace(/\[([^\]]+)\]\(orca-block:\d+\)/g, "$1");
  const summary = content.length > 80 
    ? content.substring(0, 80).replace(/\n/g, " ") + "..."
    : content.replace(/\n/g, " ");
  
  if (summary && summary.trim() && summary !== title) {
    return `${index + 1}. [${title}](orca-block:${result.id})\n   ${summary}`;
  }
  return `${index + 1}. [${title}](orca-block:${result.id})`;
}

const MAX_PROPERTY_LINES = 5;
const MAX_BLOCK_REF_ITEMS = 3;

function extractBlockId(value: any): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return Math.trunc(value);
  }
  if (typeof value === "string") {
    const match = value.match(/(?:blockid:|orca-block:)?(\d+)/i);
    if (match) {
      const parsed = Number(match[1]);
      return Number.isFinite(parsed) ? parsed : undefined;
    }
  }
  if (value && typeof value === "object") {
    const candidates = [
      value.id,
      value.blockId,
      value.block_id,
      value.to,
    ];
    for (const candidate of candidates) {
      const parsed = extractBlockId(candidate);
      if (parsed !== undefined) return parsed;
    }
  }
  return undefined;
}

/**
 * 格式化属性值输出（用于标签搜索结果）
 */
function formatPropertyValues(propertyValues: Record<string, any> | undefined): string {
  if (!propertyValues || typeof propertyValues !== "object") return "";
  const entries = Object.entries(propertyValues);
  if (entries.length === 0) return "";

  const lines: string[] = [];
  for (const [nameRaw, value] of entries) {
    const name = String(nameRaw ?? "").trim();
    if (!name || name.startsWith("_")) continue;
    if (lines.length >= MAX_PROPERTY_LINES) break;

    let formatted = "";
    if (Array.isArray(value)) {
      if (value.length === 0) {
        formatted = "(未设置)";
      } else {
        const isBlockRef = value.some((item) => {
          if (!item || typeof item !== "object") return false;
          return "title" in item || "id" in item || "blockId" in item || "to" in item;
        });

        if (isBlockRef) {
        const items = value.slice(0, MAX_BLOCK_REF_ITEMS);
        formatted = items
          .map((item: any) => {
            const title = typeof item?.title === "string" && item.title.trim()
              ? item.title.trim()
              : "(未命名)";
            const blockId = extractBlockId(item);
            return `${title} (blockid:${blockId ?? "?"})`;
          })
          .join(", ");
        if (value.length > MAX_BLOCK_REF_ITEMS) {
          formatted += " 等";
        }
        } else {
        formatted = JSON.stringify(value);
        }
      }
    } else if (value === null || value === undefined) {
      formatted = "(未设置)";
    } else {
      formatted = String(value);
    }

    lines.push(`   - ${name}: ${formatted}`);
  }

  return lines.length > 0 ? `\n${lines.join("\n")}` : "";
}

/**
 * 格式化仅统计模式的结果
 */
function formatCountOnlyResult(
  count: number,
  queryDesc: string,
  hitLimit: boolean,
  limit: number
): string {
  if (hitLimit) {
    return `📊 统计结果：找到 **至少 ${count} 条** ${queryDesc}\n⚠️ 已达到查询上限 (${limit})，实际数量可能更多。`;
  }
  return `📊 统计结果：找到 **${count} 条** ${queryDesc}`;
}

function getToolDefinitionByName(toolName: string): OpenAITool | undefined {
  const normalized = toolName.trim();
  const allTools = getTools();
  return allTools.find((tool) => tool.function.name === normalized);
}

function formatToolInstructions(tool: OpenAITool): string {
  const description = (tool.function.description || "").trim();
  const params = tool.function.parameters as any;
  const required = new Set<string>(Array.isArray(params?.required) ? params.required : []);
  const properties = params?.properties || {};
  const paramLines = Object.keys(properties).map((key) => {
    const info = properties[key] || {};
    const typeLabel = info.type ? String(info.type) : "any";
    const requiredLabel = required.has(key) ? ", required" : ", optional";
    const desc = info.description ? ` - ${String(info.description).trim()}` : "";
    const enumInfo = Array.isArray(info.enum) ? ` Options: ${info.enum.join(", ")}` : "";
    return `- ${key} (${typeLabel}${requiredLabel})${desc}${enumInfo}`;
  });
  const paramBlock = paramLines.length > 0 ? paramLines.join("\n") : "- (none)";
  return `Tool: ${tool.function.name}\n${description || "No description."}\n\nParameters:\n${paramBlock}`;
}

/**
 * 主入口：处理 AI 调用的工具（直接路由到对应的执行器）
 */
export async function executeTool(toolName: string, args: any): Promise<string> {
  try {
    // ─── 外部 MCP 服务器工具（标准 MCP 协议） ──────────────────────────
    if (isExternalMcpTool(toolName)) {
      return await callRemoteTool(toolName, args);
    }

    // ─── Todoist 工具 ─────────────────────────────────────────────────
    if (isTodoistTool(toolName)) {
      return await executeTodoistTool(toolName, args);
    }

    // ─── 联网类工具 ───────────────────────────────────────────────────
    if (toolName === "webSearch") {
      const query = args?.query;
      if (!query) return "Error: Missing query parameter";
      const maxResults = args?.maxResults ?? 5;
      const settings = getAiChatSettings(getAiChatPluginName());
      const instances = settings.webSearch?.instances || [];
      const searchResults = await searchWithFallback(query, instances, Math.min(maxResults, 20));
      return formatSearchResults(searchResults);
    }

    if (toolName === "webFetch") {
      const url = args?.url;
      if (!url) return "Error: Missing url parameter";
      try {
        const fetched = await fetchWebContent(url);
        let output = `# ${fetched.title}\n\n`;
        output += `来源: ${fetched.url}\n\n`;
        // 限制内容长度到 8000 字符
        const content = fetched.content.length > 8000
          ? fetched.content.slice(0, 8000) + "\n\n...(内容已截断，访问原文查看完整内容)"
          : fetched.content;
        output += content;
        return output;
      } catch (err: any) {
        return `Error: 无法抓取网页 ${url}: ${err.message}`;
      }
    }

    if (toolName === "imageSearch") {
      const query = args?.query;
      if (!query) return "Error: Missing query parameter";
      const maxResults = args?.maxResults ?? 5;
      const settings = getAiChatSettings(getAiChatPluginName());
      const instances = settings.webSearch?.instances || [];
      // 用"图片"后缀优化搜索
      const imageQuery = `${query} 图片`;
      const response = await searchWithFallback(imageQuery, instances, Math.min(maxResults, 20));
      const results = response.results || [];
      // 过滤出有图片的结果，没有则返回全部
      const imageResults = results.filter((r: any) => r.image || r.thumbnail || r.img);
      const output = imageResults.length > 0 ? imageResults : results.slice(0, maxResults);
      let text = `图片搜索结果: ${query}\n\n`;
      for (let i = 0; i < output.length; i++) {
        const r = output[i];
        text += `${i + 1}. **${r.title || "无标题"}**\n`;
        if ((r as any).image || (r as any).thumbnail || (r as any).img) {
          text += `   ![](${(r as any).image || (r as any).thumbnail || (r as any).img})\n`;
        }
        text += `   来源: ${r.url || (r as any).link}\n`;
        if (r.content) text += `   ${r.content}\n`;
        text += "\n";
      }
      return text || `未找到相关图片: ${query}`;
    }

    if (toolName === "wikipedia") {
      const query = args?.query;
      if (!query) return "Error: Missing query parameter";
      const lang = args?.language || "zh";
      try {
        // 使用 Wikipedia REST API
        const apiUrl = `https://${lang}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(query)}`;
        const resp = await fetch(apiUrl, {
          headers: { "User-Agent": "OrcaAIPlugin/1.0" },
          signal: AbortSignal.timeout(10000),
        });
        if (!resp.ok) {
          // 回退到搜索
          const searchUrl = `https://${lang}.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(query)}&format=json&origin=*`;
          const searchResp = await fetch(searchUrl, { signal: AbortSignal.timeout(10000) });
          const searchData = await searchResp.json();
          const searchResults = searchData?.query?.search;
          if (!searchResults || searchResults.length === 0) {
            return `未找到维基百科条目: ${query}`;
          }
          let output = `维基百科搜索结果: ${query}\n\n`;
          for (let i = 0; i < Math.min(searchResults.length, 5); i++) {
            const r = searchResults[i];
            output += `${i + 1}. **${r.title}**\n`;
            output += `   https://${lang}.wikipedia.org/wiki/${encodeURIComponent(r.title)}\n`;
            if (r.snippet) {
              output += `   ${r.snippet.replace(/<\/?[^>]+(>|$)/g, "")}\n`;
            }
            output += "\n";
          }
          return output;
        }
        const data = await resp.json();
        let output = `# ${data.title}\n\n`;
        if (data.description) output += `*${data.description}*\n\n`;
        if (data.extract) {
          const extract = data.extract.length > 3000
            ? data.extract.slice(0, 3000) + "..."
            : data.extract;
          output += extract + "\n\n";
        }
        if (data.content_urls?.desktop?.page) {
          output += `🔗 ${data.content_urls.desktop.page}`;
        }
        return output;
      } catch (err: any) {
        return `Error: 维基百科查询失败: ${err.message}`;
      }
    }

    // ─── 元工具 ───────────────────────────────────────────────────────
    if (toolName === "tool_instructions") {
      const requested = String(args?.toolName || args?.tool || args?.name || "").trim();
      if (!requested) return "Error: Missing toolName parameter.";
      const tool = getToolDefinitionByName(requested);
      if (!tool) return `Tool not found: ${requested}`;
      return formatToolInstructions(tool);
    }

    return `Unknown tool: ${toolName}`;
  } catch (error: any) {
    return `Error executing ${toolName}: ${error?.message ?? error}`;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Skill function calling 支持
// 将已启用的技能注册为 OpenAI function calling 工具，使 AI 能主动调用技能
// ─────────────────────────────────────────────────────────────────────────────

/** 技能工具缓存：toolName → { instruction, ref } */
const skillToolCache = new Map<string, { instruction: string; ref: { id: string; scope: string } }>();


/**
 * 获取所有已启用技能的 OpenAI 工具定义
 * 每个技能注册为 skill_{id} 的工具
 */
export async function getSkillToolsAsync(): Promise<OpenAITool[]> {
  try {
    const { listSkills, getSkill } = await import("./skills-manager");
    const refs = await listSkills();
    const tools: OpenAITool[] = [];

    for (const ref of refs) {
      try {
        const skill = await getSkill(ref.id, ref.scope === "global");
        if (!skill || !skill.enabled) continue;

        const toolName = getSkillToolName(skill.id);
        const desc = skill.description
          ? `${skill.description.slice(0, 300)}`
          : `执行技能: ${skill.name}`;

        // 缓存技能信息供 resolveSkillIdFromToolName 和 getSkillInstructionsAsync 使用
        skillToolCache.set(toolName, {
          instruction: skill.instruction,
          ref: { id: skill.id, scope: skill.scope },
        });

        // 生成工具的参数 schema（可选 input 参数）
        const hasInputParam = skill.instruction.includes("{input}") ||
          skill.instruction.includes("用户输入") ||
          skill.instruction.includes("user input");

        tools.push({
          type: "function" as const,
          function: {
            name: toolName,
            description: `[技能: ${skill.name}] 使用此工具执行已启用的技能。${desc}。调用后系统将加载完整的技能指令，请严格遵循指令执行。`,
            parameters: {
              type: "object",
              properties: {
                input: {
                  type: "string",
                  description: "传递给技能的输入文本（用户原始问题或需求）",
                },
              },
              required: hasInputParam ? ["input"] : [],
            },
          },
        });
      } catch (err) {
        console.warn(`[SkillTools] Failed to create tool for skill ${ref.id}:`, err);
      }
    }

    console.log(`[SkillTools] Registered ${tools.length} skill tools`);
    return tools;
  } catch (err) {
    console.error("[SkillTools] Failed to get skill tools:", err);
    return [];
  }
}

/**
 * 获取技能的完整指令文本
 */
export async function getSkillInstructionsAsync(
  skillRef: { id: string; isGlobal?: boolean; scope?: string }
): Promise<string | null> {
  try {
    const toolName = getSkillToolName(skillRef.id);

    // 检查缓存
    const cached = skillToolCache.get(toolName);
    if (cached) return cached.instruction;

    // 加载技能
    const { getSkill } = await import("./skills-manager");
    const isGlobal = skillRef.isGlobal ?? (skillRef.scope === "global");
    const skill = await getSkill(skillRef.id, isGlobal);
    if (!skill) return null;

    // 更新缓存
    skillToolCache.set(toolName, {
      instruction: skill.instruction,
      ref: { id: skill.id, scope: skill.scope },
    });

    return skill.instruction;
  } catch (err) {
    console.error(`[SkillTools] Failed to get instructions for ${skillRef.id}:`, err);
    return null;
  }
}

/**
 * 获取技能的工具名称
 */
export function getSkillToolName(skillId: string): string {
  return `skill_${skillId}`;
}

/**
 * 从工具名称反解 SkillRef
 */
export async function resolveSkillIdFromToolName(
  toolName: string
): Promise<{ id: string; isGlobal: boolean } | null> {
  if (!toolName.startsWith("skill_")) return null;

  const skillId = toolName.slice(6);

  // 优先从缓存获取
  const cached = skillToolCache.get(toolName);
  if (cached) {
    return { id: cached.ref.id, isGlobal: cached.ref.scope === "global" };
  }

  // 回退到查找技能
  try {
    const { getSkill } = await import("./skills-manager");
    const skill = await getSkill(skillId);
    if (skill) {
      skillToolCache.set(toolName, {
        instruction: skill.instruction,
        ref: { id: skill.id, scope: skill.scope },
      });
      return { id: skillId, isGlobal: skill.scope === "global" };
    }
  } catch (err) {
    console.warn(`[SkillTools] Failed to resolve ${toolName}:`, err);
  }

  return null;
}
