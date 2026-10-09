/**
 * AI Tools for Orca AI Chat
 * This file defines the available tools for the AI model and their implementations.
 * It interacts with the Orca Host API to perform actions like searching, reading, 
 * and creating blocks.
 */

import type { OpenAITool } from "./openai-client";
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
  
  for (const result of toolResults.values()) {
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
    const [fullMatch, , title, url] = match;
    
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
