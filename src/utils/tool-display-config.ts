/**
 * Tool Display Configuration System
 *
 * Provides semantic display configuration for AI tools.
 * Maps tool names to user-friendly icons, animations, and text.
 */

import { skillToolNameToSkillIdCache } from "../services/ai/ai-tools";
import { TOOL_DISPLAY_NAMES } from "../store/tool-store";

function isSkillToolName(toolName: string): boolean {
  return toolName.startsWith("skill_");
}

function getSkillDisplayName(toolName: string): string {
  if (!isSkillToolName(toolName)) return toolName;
  const skillId = skillToolNameToSkillIdCache.get(toolName);
  if (skillId) return skillId;
  const parts = toolName.split("_");
  if (parts.length >= 3) return parts[1] || "技能";
  return "技能";
}

export type ToolCategory = "create" | "search" | "query";
export type AnimationType = "sparkle" | "pulse" | "flip";

export interface ToolDisplayConfig {
  category: ToolCategory;
  icon: string;
  animation: AnimationType;
  displayName: string;  // 中文显示名称
  loadingText: string;
  successText: string;
  successIcon: string;
}

/**
 * Default configuration for unknown tools
 */
const DEFAULT_CONFIG: ToolDisplayConfig = {
  category: "query",
  icon: "🔧",
  animation: "pulse",
  displayName: "工具",
  loadingText: "正在执行...",
  successText: "已完成",
  successIcon: "✅",
};

const SKILL_CONFIG: ToolDisplayConfig = {
  category: "query",
  icon: "✨",
  animation: "sparkle",
  displayName: "技能",
  loadingText: "正在执行技能...",
  successText: "技能已完成",
  successIcon: "✅",
};

/**
 * Tool-specific display configurations
 */
const TOOL_CONFIGS: Record<string, ToolDisplayConfig> = {
  getSavedAiConversations: {
    category: "query",
    icon: "💬",
    animation: "flip",
    displayName: "历史对话",
    loadingText: "正在获取历史对话...",
    successText: "已获取对话记录",
    successIcon: "✅",
  },
};

const MCP_CONFIG: ToolDisplayConfig = {
  category: "query",
  icon: "🔌",
  animation: "pulse",
  displayName: "外部工具",
  loadingText: "正在调用外部工具...",
  successText: "外部工具执行完成",
  successIcon: "✅",
};

/**
 * Get display configuration for a tool
 */
export function getToolDisplayConfig(toolName: string): ToolDisplayConfig {
  if (isSkillToolName(toolName)) {
    return { ...SKILL_CONFIG, displayName: getSkillDisplayName(toolName) };
  }
  if (toolName.startsWith("mcp__")) {
    const registeredName = TOOL_DISPLAY_NAMES[toolName];
    if (registeredName) {
      return { ...MCP_CONFIG, displayName: registeredName };
    }
    // 去掉 mcp__ 前缀，格式：serverName / toolName
    const parts = toolName.split("__");
    const serverName = parts[1] ?? "external";
    const toolShortName = parts.slice(2).join("__");
    return {
      ...MCP_CONFIG,
      displayName: toolShortName || `${serverName}`,
    };
  }
  return TOOL_CONFIGS[toolName] || DEFAULT_CONFIG;
}

/**
 * Generate result summary from tool result
 * @param toolName - The name of the tool
 * @param result - The raw result string (may be JSON or plain text)
 * @returns Human-readable summary
 */
export function generateResultSummary(toolName: string, result: string): string {
  const config = getToolDisplayConfig(toolName);

  // Try to parse as JSON for count-based summaries
  try {
    const parsed = JSON.parse(result);

    // Search results - count items
    if (config.category === "search") {
      if (Array.isArray(parsed)) {
        return `找到 ${parsed.length} 条结果`;
      }
      if (parsed.blocks && Array.isArray(parsed.blocks)) {
        return `找到 ${parsed.blocks.length} 条结果`;
      }
      if (parsed.results && Array.isArray(parsed.results)) {
        return `找到 ${parsed.results.length} 条结果`;
      }
    }

    // Create results - show success message
    if (config.category === "create") {
      if (parsed.success) {
        if (toolName === "insert_markdown" && parsed.blockId) {
          return `已创建块 #${parsed.blockId}`;
        }
        if (toolName === "create_page" && parsed.pageName) {
          return `已创建页面「${parsed.pageName}」`;
        }
        if (toolName === "insert_tags" && parsed.tagName) {
          return `已添加标签 #${parsed.tagName}`;
        }
        return config.successText;
      }
      if (parsed.error) {
        return `失败: ${parsed.error.slice(0, 50)}`;
      }
    }

    // Query results - generic success
    if (config.category === "query") {
      return config.successText;
    }
  } catch {
    // Not JSON, use as-is or truncate
  }

  // Fallback: truncate long results
  if (result.length > 60) {
    return result.slice(0, 57) + "...";
  }
  return result || config.successText;
}
