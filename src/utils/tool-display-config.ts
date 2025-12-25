/**
 * Tool Display Configuration System
 *
 * Provides semantic display configuration for AI tools.
 * Maps tool names to user-friendly icons, animations, and text.
 */

export type ToolCategory = "create" | "search" | "query";
export type AnimationType = "sparkle" | "pulse" | "flip";

export interface ToolDisplayConfig {
  category: ToolCategory;
  icon: string;
  animation: AnimationType;
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
  loadingText: "正在执行...",
  successText: "已完成",
  successIcon: "✅",
};

/**
 * Tool-specific display configurations
 */
const TOOL_CONFIGS: Record<string, ToolDisplayConfig> = {
  // ─────────────────────────────────────────────────────────────────────────────
  // Create Tools (✨ sparkle animation)
  // ─────────────────────────────────────────────────────────────────────────────
  createBlock: {
    category: "create",
    icon: "✨",
    animation: "sparkle",
    loadingText: "正在创建块...",
    successText: "已创建新块",
    successIcon: "✅",
  },
  createPage: {
    category: "create",
    icon: "✨",
    animation: "sparkle",
    loadingText: "正在创建页面...",
    successText: "已创建页面",
    successIcon: "✅",
  },
  insertTag: {
    category: "create",
    icon: "✨",
    animation: "sparkle",
    loadingText: "正在添加标签...",
    successText: "已添加标签",
    successIcon: "✅",
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // Search Tools (🔍 pulse animation)
  // ─────────────────────────────────────────────────────────────────────────────
  searchBlocksByTag: {
    category: "search",
    icon: "🔍",
    animation: "pulse",
    loadingText: "正在搜索标签...",
    successText: "搜索完成",
    successIcon: "✅",
  },
  searchBlocksByText: {
    category: "search",
    icon: "🔍",
    animation: "pulse",
    loadingText: "正在搜索文本...",
    successText: "搜索完成",
    successIcon: "✅",
  },
  queryBlocksByTag: {
    category: "search",
    icon: "🔍",
    animation: "pulse",
    loadingText: "正在高级查询...",
    successText: "查询完成",
    successIcon: "✅",
  },
  searchTasks: {
    category: "search",
    icon: "🔍",
    animation: "pulse",
    loadingText: "正在搜索任务...",
    successText: "搜索完成",
    successIcon: "✅",
  },
  searchJournalEntries: {
    category: "search",
    icon: "🔍",
    animation: "pulse",
    loadingText: "正在搜索日记...",
    successText: "搜索完成",
    successIcon: "✅",
  },
  searchBlocksByReference: {
    category: "search",
    icon: "🔍",
    animation: "pulse",
    loadingText: "正在搜索引用...",
    successText: "搜索完成",
    successIcon: "✅",
  },
  query_blocks: {
    category: "search",
    icon: "🔍",
    animation: "pulse",
    loadingText: "正在查询...",
    successText: "查询完成",
    successIcon: "✅",
  },

  // ─────────────────────────────────────────────────────────────────────────────
  // Query Tools (📖 flip animation)
  // ─────────────────────────────────────────────────────────────────────────────
  getPage: {
    category: "query",
    icon: "📖",
    animation: "flip",
    loadingText: "正在获取页面...",
    successText: "已获取页面",
    successIcon: "✅",
  },
  getTodayJournal: {
    category: "query",
    icon: "📖",
    animation: "flip",
    loadingText: "正在获取今日日记...",
    successText: "已获取日记",
    successIcon: "✅",
  },
  getRecentJournals: {
    category: "query",
    icon: "📖",
    animation: "flip",
    loadingText: "正在获取最近日记...",
    successText: "已获取日记",
    successIcon: "✅",
  },
  get_tag_schema: {
    category: "query",
    icon: "📖",
    animation: "flip",
    loadingText: "正在获取标签结构...",
    successText: "已获取标签结构",
    successIcon: "✅",
  },
};

/**
 * Get display configuration for a tool
 * @param toolName - The name of the tool
 * @returns ToolDisplayConfig for the specified tool, or default config if not found
 */
export function getToolDisplayConfig(toolName: string): ToolDisplayConfig {
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
        if (toolName === "createBlock" && parsed.blockId) {
          return `已创建块 #${parsed.blockId}`;
        }
        if (toolName === "createPage" && parsed.pageName) {
          return `已创建页面「${parsed.pageName}」`;
        }
        if (toolName === "insertTag" && parsed.tagName) {
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
