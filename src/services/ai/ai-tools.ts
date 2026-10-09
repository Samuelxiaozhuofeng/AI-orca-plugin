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

/**
 * 从工具结果中提取搜索结果（仅旧会话中的 webSearch 结果）
 */
export function extractSearchResultsFromToolResults(
  toolResults?: Map<string, { content: string; name: string }>
): any[] {
  if (!toolResults) return [];
  
  const allSearchResults: any[] = [];
  
  for (const [toolCallId, result] of toolResults.entries()) {
    // 兼容旧会话：解析历史 webSearch 工具结果用于来源展示
    if (result.name === "webSearch") {
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
            description: "工具名称，如以 mcp__ 开头的外部工具。",
          },
        },
        required: ["toolName"],
      },
    },
  },
];

/**
 * 获取工具列表（MCP 工具）
 */
export function getTools(): OpenAITool[] {
  return getAllDiscoveredTools();
}

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
