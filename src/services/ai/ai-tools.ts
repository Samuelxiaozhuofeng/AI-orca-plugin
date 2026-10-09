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
 * 获取工具列表（MCP 工具）
 */
export function getTools(): OpenAITool[] {
  return getAllDiscoveredTools();
}

/**
 * 获取拖入块场景的工具列表（目前与 getTools 相同，返回 MCP 工具）
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
