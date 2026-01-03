/**
 * Tool Store
 * 管理 AI 工具的启用状态和批准模式
 */

import { proxy } from "valtio";

/**
 * 工具状态类型
 * - auto: 自动批准，AI 可以直接调用
 * - ask: 询问用户，每次调用前需要用户确认
 * - disabled: 禁用，AI 无法调用此工具
 */
export type ToolStatus = "auto" | "ask" | "disabled";

/**
 * 工具配置
 */
export interface ToolConfig {
  name: string;
  status: ToolStatus;
}

/**
 * 工具分类
 */
export interface ToolCategory {
  name: string;
  label: string;
  tools: string[];
}

/**
 * 工具分类定义
 */
export const TOOL_CATEGORIES: ToolCategory[] = [
  {
    name: "search",
    label: "搜索",
    tools: ["searchBlocksByTag", "searchBlocksByText", "query_blocks_by_tag", "query_blocks", "searchBlocksByReference"],
  },
  {
    name: "read",
    label: "读取",
    tools: ["getPage", "getBlock", "getBlockMeta", "getBlockLinks", "get_tag_schema"],
  },
  {
    name: "journal",
    label: "日记",
    tools: ["getRecentJournals", "getTodayJournal", "getJournalByDate", "getJournalsByDateRange"],
  },
  {
    name: "write",
    label: "写入",
    tools: ["createBlock", "createPage", "insertTag"],
  },
  {
    name: "other",
    label: "其他",
    tools: ["getSavedAiConversations"],
  },
];

/**
 * 工具显示名称映射
 */
export const TOOL_DISPLAY_NAMES: Record<string, string> = {
  searchBlocksByTag: "标签搜索",
  searchBlocksByText: "全文搜索",
  query_blocks_by_tag: "标签属性查询",
  query_blocks: "组合查询",
  searchBlocksByReference: "反链搜索",
  getPage: "读取页面",
  getBlock: "读取块",
  getBlockMeta: "获取元数据",
  getBlockLinks: "获取链接",
  get_tag_schema: "获取标签架构",
  getRecentJournals: "最近日记",
  getTodayJournal: "今日日记",
  getJournalByDate: "指定日期日记",
  getJournalsByDateRange: "日期范围日记",
  createBlock: "创建块",
  createPage: "创建页面",
  insertTag: "添加标签",
  getSavedAiConversations: "已保存对话",
};

/**
 * 默认工具状态
 */
const DEFAULT_TOOL_STATUS: ToolStatus = "auto";

/**
 * 工具 Store
 */
interface ToolStore {
  /** 工具状态映射 */
  toolStatus: Record<string, ToolStatus>;
  /** 是否显示工具面板 */
  showPanel: boolean;
}

export const toolStore = proxy<ToolStore>({
  toolStatus: {},
  showPanel: false,
});

/**
 * 获取工具状态
 */
export function getToolStatus(toolName: string): ToolStatus {
  return toolStore.toolStatus[toolName] ?? DEFAULT_TOOL_STATUS;
}

/**
 * 设置工具状态
 */
export function setToolStatus(toolName: string, status: ToolStatus): void {
  toolStore.toolStatus[toolName] = status;
  saveToolSettings();
}

/**
 * 批量设置分类下所有工具的状态
 */
export function setCategoryStatus(categoryName: string, status: ToolStatus): void {
  const category = TOOL_CATEGORIES.find(c => c.name === categoryName);
  if (category) {
    for (const tool of category.tools) {
      toolStore.toolStatus[tool] = status;
    }
    saveToolSettings();
  }
}

/**
 * 切换工具面板显示
 */
export function toggleToolPanel(): void {
  toolStore.showPanel = !toolStore.showPanel;
}

/**
 * 关闭工具面板
 */
export function closeToolPanel(): void {
  toolStore.showPanel = false;
}

/**
 * 保存工具设置到本地存储
 */
function saveToolSettings(): void {
  try {
    localStorage.setItem("ai-chat-tool-settings", JSON.stringify(toolStore.toolStatus));
  } catch (e) {
    console.warn("[ToolStore] Failed to save settings:", e);
  }
}

/**
 * 从本地存储加载工具设置
 */
export function loadToolSettings(): void {
  try {
    const saved = localStorage.getItem("ai-chat-tool-settings");
    if (saved) {
      const parsed = JSON.parse(saved);
      if (typeof parsed === "object" && parsed !== null) {
        toolStore.toolStatus = parsed;
      }
    }
  } catch (e) {
    console.warn("[ToolStore] Failed to load settings:", e);
  }
}

/**
 * 获取启用的工具列表（状态为 auto 或 ask）
 */
export function getEnabledTools(): string[] {
  const allTools = TOOL_CATEGORIES.flatMap(c => c.tools);
  return allTools.filter(tool => {
    const status = getToolStatus(tool);
    return status === "auto" || status === "ask";
  });
}

/**
 * 获取需要询问的工具列表
 */
export function getAskTools(): Set<string> {
  const allTools = TOOL_CATEGORIES.flatMap(c => c.tools);
  return new Set(allTools.filter(tool => getToolStatus(tool) === "ask"));
}

/**
 * 检查工具是否需要询问用户
 */
export function shouldAskForTool(toolName: string): boolean {
  return getToolStatus(toolName) === "ask";
}

/**
 * 检查工具是否被禁用
 */
export function isToolDisabled(toolName: string): boolean {
  return getToolStatus(toolName) === "disabled";
}
