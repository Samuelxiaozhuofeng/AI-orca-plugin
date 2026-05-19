/**
 * MCP Store
 *
 * 管理 MCP 服务器配置、连接状态和工具启用/禁用。
 * 持久化方式：orca.plugins.setData/getData + localStorage
 */

import { proxy } from "valtio";
import type { MCPServerConfig } from "../services/external/mcp-client";
import type { OpenAITool } from "../services/ai/openai-client";

// ─── 类型 ────────────────────────────────────────────────────────────────────

export interface MCPServerStatus {
  config: MCPServerConfig;
  connected: boolean;
  toolCount: number;
  error?: string;
  lastConnectedAt?: number;
  lastErrorAt?: number;
}

interface MCPStore {
  servers: MCPServerConfig[];
  serverStatuses: Record<string, MCPServerStatus>;
  /** 被禁用的 MCP 工具名（openaiName 格式: mcp__<serverId>__<toolName>） */
  disabledTools: string[];
  /** 所有已发现的外部 MCP 工具（运行时缓存，不持久化） */
  discoveredTools: OpenAITool[];
}

// ─── Store ───────────────────────────────────────────────────────────────────

export const mcpStore = proxy<MCPStore>({
  servers: [],
  serverStatuses: {},
  disabledTools: [],
  discoveredTools: [],
});

// ─── 默认配置 ────────────────────────────────────────────────────────────────

const DEFAULT_MCP_SERVER: MCPServerConfig = {
  id: "orca-note",
  name: "Orca Note MCP",
  type: "http",
  url: "http://localhost:18672/mcp",
  headers: { Authorization: "Bearer orca-mcp" },
};

// ─── 持久化 ──────────────────────────────────────────────────────────────────

const STORAGE_KEY = "ai-chat-mcp-servers";
const DISABLED_KEY = "ai-chat-mcp-disabled-tools";

let saveMcpTimer: ReturnType<typeof setTimeout> | null = null;
let saveDisabledTimer: ReturnType<typeof setTimeout> | null = null;
const DEBOUNCE_MS = 400;

async function saveMcpSettings(): Promise<void> {
  try {
    const data = JSON.stringify(mcpStore.servers);
    localStorage.setItem(STORAGE_KEY, data);
    await orca.plugins.setData("ai-chat", STORAGE_KEY, data);
  } catch (e) {
    console.warn("[MCP Store] 保存配置失败:", e);
  }
}

function saveMcpSettingsDebounced(): void {
  if (saveMcpTimer) clearTimeout(saveMcpTimer);
  saveMcpTimer = setTimeout(() => saveMcpSettings(), DEBOUNCE_MS);
}

async function saveDisabledTools(): Promise<void> {
  try {
    const data = JSON.stringify(mcpStore.disabledTools);
    localStorage.setItem(DISABLED_KEY, data);
    await orca.plugins.setData("ai-chat", DISABLED_KEY, data);
  } catch (e) {
    console.warn("[MCP Store] 保存禁用工具失败:", e);
  }
}

function saveDisabledToolsDebounced(): void {
  if (saveDisabledTimer) clearTimeout(saveDisabledTimer);
  saveDisabledTimer = setTimeout(() => saveDisabledTools(), DEBOUNCE_MS);
}

export async function loadMcpSettings(): Promise<void> {
  // 加载服务器配置
  try {
    let raw: string | null = null;
    try {
      raw = (await orca.plugins.getData("ai-chat", STORAGE_KEY)) as string | null;
    } catch {
      // 回退到 localStorage
    }
    if (!raw) raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) mcpStore.servers = parsed;
    }
  } catch (e) {
    console.warn("[MCP Store] 加载配置失败:", e);
  }

  // 加载禁用工具列表
  try {
    let raw: string | null = null;
    try {
      raw = (await orca.plugins.getData("ai-chat", DISABLED_KEY)) as string | null;
    } catch { /* fallback */ }
    if (!raw) raw = localStorage.getItem(DISABLED_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) mcpStore.disabledTools = parsed;
    }
  } catch (e) {
    console.warn("[MCP Store] 加载禁用工具失败:", e);
  }
}

// ─── 服务器 CRUD ─────────────────────────────────────────────────────────────

export function ensureDefaultMcpServer(): void {
  if (mcpStore.servers.length === 0) {
    addMcpServer(DEFAULT_MCP_SERVER);
  }
}

export function addMcpServer(config: MCPServerConfig): void {
  if (mcpStore.servers.some((s) => s.id === config.id)) return;
  mcpStore.servers.push(config);
  saveMcpSettings();
}

export function removeMcpServer(id: string): void {
  mcpStore.servers = mcpStore.servers.filter((s) => s.id !== id);
  delete mcpStore.serverStatuses[id];
  removeDiscoveredToolsForServer(id);
  saveMcpSettings();
}

export function updateMcpServer(id: string, patch: Partial<MCPServerConfig>): void {
  const idx = mcpStore.servers.findIndex((s) => s.id === id);
  if (idx === -1) return;
  mcpStore.servers[idx] = { ...mcpStore.servers[idx], ...patch };
  saveMcpSettingsDebounced();
}

export function setServerStatus(id: string, status: Partial<MCPServerStatus>): void {
  const existing = mcpStore.serverStatuses[id] || {
    config: mcpStore.servers.find((s) => s.id === id) || ({} as MCPServerConfig),
    connected: false,
    toolCount: 0,
  };
  mcpStore.serverStatuses[id] = { ...existing, ...status };
}

// ─── 已发现工具缓存 ───────────────────────────────────────────────────────────

/** 替换指定服务器的已发现工具 */
export function setDiscoveredToolsForServer(serverId: string, tools: OpenAITool[]): void {
  // 辅助函数放在内部避免循环导入
  const prefix = `mcp__`;
  mcpStore.discoveredTools = [
    ...mcpStore.discoveredTools.filter((t) => {
      const name = t.function.name;
      if (!name.startsWith(prefix)) return true;
      const rest = name.slice(prefix.length);
      const sep = rest.indexOf("__");
      return sep === -1 || rest.slice(0, sep) !== serverId;
    }),
    ...tools,
  ];
}

/** 移除指定服务器的所有已发现工具 */
export function removeDiscoveredToolsForServer(serverId: string): void {
  const prefix = `mcp__`;
  mcpStore.discoveredTools = mcpStore.discoveredTools.filter((t) => {
    const name = t.function.name;
    if (!name.startsWith(prefix)) return true;
    const rest = name.slice(prefix.length);
    const sep = rest.indexOf("__");
    return sep === -1 || rest.slice(0, sep) !== serverId;
  });
}

/** 获取所有已发现工具（不过滤禁用） */
export function getDiscoveredTools(): OpenAITool[] {
  return mcpStore.discoveredTools;
}

// ─── 工具启用/禁用 ───────────────────────────────────────────────────────────

export function isMcpToolDisabled(toolName: string): boolean {
  return mcpStore.disabledTools.includes(toolName);
}

export function setMcpToolDisabled(toolName: string, disabled: boolean): void {
  if (disabled) {
    if (!mcpStore.disabledTools.includes(toolName)) {
      mcpStore.disabledTools.push(toolName);
    }
  } else {
    mcpStore.disabledTools = mcpStore.disabledTools.filter((t) => t !== toolName);
  }
  saveDisabledToolsDebounced();
}

/** 切换工具的启用/禁用状态 */
export function toggleMcpTool(toolName: string): void {
  setMcpToolDisabled(toolName, !isMcpToolDisabled(toolName));
}
