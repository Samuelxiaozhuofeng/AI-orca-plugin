/**
 * Tool Store
 * 管理 AI 工具的启用状态和批准模式
 */

import { proxy } from "valtio";
import { normalizeToolRoundLimit } from "../services/ai/tool-round-limit";

/**
 * 工具状态类型
 * - auto: 自动批准，AI 可以直接调用
 * - ask: 询问用户，每次调用前需要用户确认
 * - disabled: 禁用，不加载到工具列表中
 * 
 * 使用场景：
 * - auto: 搜索、读取等安全操作
 * - ask: 写入操作、联网搜索等需要用户确认的操作
 * - disabled: 临时禁用某些工具，但保留配置
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
 * 工具分类定义（通过 MCP 外部工具动态注册）
 */
export const TOOL_CATEGORIES: ToolCategory[] = [];

/**
 * 工具显示名称映射（内建工具已移除，MCP 工具自动注册）
 */
export const TOOL_DISPLAY_NAMES: Record<string, string> = {};

// ─── MCP 工具自动注册 ────────────────────────────────────────────────────────

const MCP_CATEGORY_PREFIX = "mcp:";

function ensureMcpCategory(serverId: string, serverLabel: string): ToolCategory {
  const categoryName = `${MCP_CATEGORY_PREFIX}${serverId}`;
  let cat = TOOL_CATEGORIES.find((c) => c.name === categoryName);
  if (!cat) {
    cat = { name: categoryName, label: serverLabel, tools: [] };
    TOOL_CATEGORIES.push(cat);
  }
  return cat;
}

/** 注册一组 MCP 工具到工具管理 */
export function registerMcpTools(
  serverId: string,
  serverLabel: string,
  tools: Array<{ openaiName: string; displayName: string }>
): void {
  // 先注销该服务器的旧工具
  unregisterMcpServerTools(serverId);

  if (tools.length === 0) return;

  const cat = ensureMcpCategory(serverId, serverLabel);
  for (const tool of tools) {
    TOOL_DISPLAY_NAMES[tool.openaiName] = tool.displayName;
    cat.tools.push(tool.openaiName);
  }
}

/** 注销某个服务器的所有 MCP 工具 */
export function unregisterMcpServerTools(serverId: string): void {
  const prefix = `mcp__`;
  // 清理 DISPLAY_NAMES
  for (const name of Object.keys(TOOL_DISPLAY_NAMES)) {
    if (name.startsWith(prefix)) {
      const rest = name.slice(prefix.length);
      const sep = rest.indexOf("__");
      if (sep !== -1 && rest.slice(0, sep) === serverId) {
        delete TOOL_DISPLAY_NAMES[name];
      }
    }
  }
  // 清理 CATEGORIES
  const categoryName = `${MCP_CATEGORY_PREFIX}${serverId}`;
  const idx = TOOL_CATEGORIES.findIndex((c) => c.name === categoryName);
  if (idx !== -1) TOOL_CATEGORIES.splice(idx, 1);
}

/**
 * 默认工具状态
 */
const DEFAULT_TOOL_STATUS: ToolStatus = "auto";

/**
 * Agentic RAG 配置
 */
export interface AgenticRAGConfig {
  /** 最大迭代次数（防止无限循环） */
  maxIterations: number;
  /** 是否启用反思机制（评估检索结果质量） */
  enableReflection: boolean;
}

/**
 * 工具 Store
 */
interface ToolStore {
  /** 工具状态映射 */
  toolStatus: Record<string, ToolStatus>;
  /** 是否显示工具面板 */
  showPanel: boolean;
  /** 联网搜索开关 */
  webSearchEnabled: boolean;
  /** 图片搜索开关 */
  imageSearchEnabled: boolean;
  /** 维基百科搜索开关 */
  wikipediaEnabled: boolean;
  /** Agentic RAG 开关（深度检索模式） */
  agenticRAGEnabled: boolean;
  /** Agentic RAG 配置 */
  agenticRAGConfig: AgenticRAGConfig;
}

export const toolStore = proxy<ToolStore>({
  toolStatus: {},
  showPanel: false,
  webSearchEnabled: false,
  imageSearchEnabled: true,
  wikipediaEnabled: true,
  agenticRAGEnabled: false,
  agenticRAGConfig: {
    maxIterations: 0,
    enableReflection: true,
  },
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
 * 切换联网搜索开关
 */
export function toggleWebSearch(): void {
  toolStore.webSearchEnabled = !toolStore.webSearchEnabled;
  saveToolSettings();
}

/**
 * 获取联网搜索状态
 */
export function isWebSearchEnabled(): boolean {
  return toolStore.webSearchEnabled;
}

/**
 * 切换图片搜索开关
 */
export function toggleImageSearch(): void {
  toolStore.imageSearchEnabled = !toolStore.imageSearchEnabled;
  saveToolSettings();
}

/**
 * 获取图片搜索状态
 */
export function isImageSearchEnabled(): boolean {
  return toolStore.imageSearchEnabled;
}

/**
 * 切换维基百科搜索开关
 */
export function toggleWikipedia(): void {
  toolStore.wikipediaEnabled = !toolStore.wikipediaEnabled;
  saveToolSettings();
}

/**
 * 获取维基百科搜索状态
 */
export function isWikipediaEnabled(): boolean {
  return toolStore.wikipediaEnabled;
}

/**
 * 切换 Agentic RAG 开关
 */
export function toggleAgenticRAG(): void {
  toolStore.agenticRAGEnabled = !toolStore.agenticRAGEnabled;
  saveToolSettings();
}

/**
 * 获取 Agentic RAG 状态
 */
export function isAgenticRAGEnabled(): boolean {
  return toolStore.agenticRAGEnabled;
}

/**
 * 获取 Agentic RAG 配置
 */
export function getAgenticRAGConfig(): AgenticRAGConfig {
  return {
    ...toolStore.agenticRAGConfig,
    maxIterations: normalizeToolRoundLimit(toolStore.agenticRAGConfig.maxIterations),
  };
}

/**
 * 保存工具设置到本地存储
 */
async function saveToolSettings(): Promise<void> {
  try {
    const settings = {
      toolStatus: toolStore.toolStatus,
      webSearchEnabled: toolStore.webSearchEnabled,
      imageSearchEnabled: toolStore.imageSearchEnabled,
      wikipediaEnabled: toolStore.wikipediaEnabled,
      agenticRAGEnabled: toolStore.agenticRAGEnabled,
      agenticRAGConfig: toolStore.agenticRAGConfig,
    };
    
    // 同时使用 Orca 插件存储和 localStorage（双重保障）
    const settingsJson = JSON.stringify(settings);
    localStorage.setItem("ai-chat-tool-settings", settingsJson);
    
    // 使用 Orca 的持久化存储
    await orca.plugins.setData("ai-chat", "tool-settings", settingsJson);
  } catch (e) {
    console.warn("[ToolStore] Failed to save settings:", e);
  }
}

/**
 * 从本地存储加载工具设置
 */
export async function loadToolSettings(): Promise<void> {
  try {
    // 优先从 Orca 插件存储加载
    let saved: string | null = null;
    try {
      saved = await orca.plugins.getData("ai-chat", "tool-settings") as string | null;
    } catch (e) {
      console.warn("[ToolStore] Failed to load from plugin storage, falling back to localStorage:", e);
    }
    
    // 如果 Orca 存储没有，尝试从 localStorage 加载
    if (!saved) {
      saved = localStorage.getItem("ai-chat-tool-settings");
    }
    
    if (saved) {
      const parsed = JSON.parse(saved);
      if (typeof parsed === "object" && parsed !== null) {
        // 兼容旧格式（直接存储 toolStatus）
        if (parsed.toolStatus) {
          toolStore.toolStatus = parsed.toolStatus;
          toolStore.webSearchEnabled = parsed.webSearchEnabled ?? false;
          toolStore.imageSearchEnabled = parsed.imageSearchEnabled ?? true;
          toolStore.wikipediaEnabled = parsed.wikipediaEnabled ?? true;
          toolStore.agenticRAGEnabled = parsed.agenticRAGEnabled ?? false;
          if (parsed.agenticRAGConfig) {
            toolStore.agenticRAGConfig = {
              ...toolStore.agenticRAGConfig,
              ...parsed.agenticRAGConfig,
            };
            toolStore.agenticRAGConfig.maxIterations = normalizeToolRoundLimit(
              toolStore.agenticRAGConfig.maxIterations
            );
          }
        } else {
          // 旧格式：直接是 toolStatus 对象
          toolStore.toolStatus = parsed;
        }
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
