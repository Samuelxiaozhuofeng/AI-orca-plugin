/**
 * MCP Store
 *
 * 管理 MCP 服务器配置、连接状态和工具启用/禁用。
 * 持久化方式：orca.plugins.setData/getData + localStorage
 */

import { proxy } from "valtio";
import type { MCPServerConfig } from "../services/external/mcp-client";
import type { OpenAITool } from "../services/ai/openai-client";
import { isMcpToolNameForServer } from "../services/external/mcp-tool-names";

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
const DEFAULT_MCP_PROTOCOL_VERSION = "2025-06-18";
const DEFAULT_MCP_TIMEOUT_MS = 120000;

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

function normalizeHeaders(headers: unknown): Record<string, string> {
  if (!headers || typeof headers !== "object") return {};
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers as Record<string, any>)) {
    const headerName = key.trim();
    if (!headerName) continue;
    const headerValue = typeof value === "string" ? value.trim() : String(value ?? "").trim();
    if (headerValue) out[headerName] = headerValue;
  }
  return out;
}

function normalizeMcpServerConfig(raw: any): MCPServerConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const id = typeof raw.id === "string" && raw.id.trim() ? raw.id.trim() : "";
  const name = typeof raw.name === "string" && raw.name.trim() ? raw.name.trim() : id;
  const url = typeof raw.url === "string" && raw.url.trim() ? raw.url.trim() : "";
  if (!id || !url) return null;

  const timeoutMs = Number(raw.timeoutMs);
  return {
    id,
    name,
    type: "http",
    url,
    headers: normalizeHeaders(raw.headers),
    protocolVersion: typeof raw.protocolVersion === "string" && raw.protocolVersion.trim()
      ? raw.protocolVersion.trim()
      : DEFAULT_MCP_PROTOCOL_VERSION,
    timeoutMs: Number.isFinite(timeoutMs)
      ? Math.max(10000, Math.min(600000, Math.floor(timeoutMs)))
      : DEFAULT_MCP_TIMEOUT_MS,
  };
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
      if (Array.isArray(parsed)) {
        mcpStore.servers = parsed
          .map(normalizeMcpServerConfig)
          .filter((server): server is MCPServerConfig => !!server);
      }
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
  const normalized = normalizeMcpServerConfig(config);
  if (!normalized || mcpStore.servers.some((s) => s.id === normalized.id)) return;
  mcpStore.servers.push(normalized);
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
  const normalized = normalizeMcpServerConfig({ ...mcpStore.servers[idx], ...patch });
  if (!normalized) return;
  mcpStore.servers[idx] = normalized;
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
  mcpStore.discoveredTools = [
    ...mcpStore.discoveredTools.filter((t) => !isMcpToolNameForServer(t.function.name, serverId)),
    ...tools,
  ];
}

/** 移除指定服务器的所有已发现工具 */
export function removeDiscoveredToolsForServer(serverId: string): void {
  mcpStore.discoveredTools = mcpStore.discoveredTools.filter((t) => !isMcpToolNameForServer(t.function.name, serverId));
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
