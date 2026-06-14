/**
 * MCP Server Manager
 *
 * 管理多个 MCP 服务器的连接生命周期：
 * - 连接/断开服务器
 * - 发现远程工具并转换为 OpenAI function-calling 格式
 * - 路由工具调用到对应的远程服务器
 * - 工具启用/禁用过滤
 */

import type { OpenAITool } from "../ai/openai-client";
import {
  createMCPClient,
  formatMCPToolResult,
  normalizeMCPInputSchema,
  type MCPToolDefinition,
} from "./mcp-client";
import {
  buildMcpOpenAIName as buildStableMcpOpenAIName,
  isExternalMcpToolName,
  isMcpToolNameForServer,
} from "./mcp-tool-names";
import {
  mcpStore,
  loadMcpSettings,
  setServerStatus,
  isMcpToolDisabled,
  getDiscoveredTools,
  setDiscoveredToolsForServer,
  removeDiscoveredToolsForServer,
} from "../../store/mcp-store";
import {
  registerMcpTools,
  unregisterMcpServerTools,
} from "../../store/tool-store";

// ─── 工具名命名空间 ──────────────────────────────────────────────────────────

const MCP_TOOL_PREFIX = "mcp__";
const MAX_OPENAI_TOOL_NAME_LENGTH = 64;

function sanitizeMcpIdentifier(id: string): string {
  const sanitized = id
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return sanitized || "tool";
}

function hashString(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function buildMcpOpenAIName(serverId: string, originalName: string, usedNames: Set<string>): string {
  const safeServerId = sanitizeMcpIdentifier(serverId);
  const safeToolName = sanitizeMcpIdentifier(originalName);
  const hash = hashString(`${serverId}:${originalName}`).slice(0, 8);
  const prefix = `${MCP_TOOL_PREFIX}${safeServerId}__`;
  const suffix = `_${hash}`;
  const budget = Math.max(8, MAX_OPENAI_TOOL_NAME_LENGTH - prefix.length - suffix.length);
  const baseToolName = safeToolName.length > budget ? safeToolName.slice(0, budget) : safeToolName;
  let candidate = `${prefix}${baseToolName}${suffix}`;

  let counter = 2;
  while (usedNames.has(candidate)) {
    const counterSuffix = `${suffix}_${counter}`;
    const counterBudget = Math.max(8, MAX_OPENAI_TOOL_NAME_LENGTH - prefix.length - counterSuffix.length);
    candidate = `${prefix}${safeToolName.slice(0, counterBudget)}${counterSuffix}`;
    counter++;
  }

  usedNames.add(candidate);
  return candidate;
}

function parseMcpOpenAIName(openaiName: string): { serverId: string; originalName: string } | null {
  if (!openaiName.startsWith(MCP_TOOL_PREFIX)) return null;
  const rest = openaiName.slice(MCP_TOOL_PREFIX.length);
  const sepIndex = rest.indexOf("__");
  if (sepIndex === -1) return null;
  return { serverId: rest.slice(0, sepIndex), originalName: rest.slice(sepIndex + 2) };
}

// ─── 运行时状态（模块级，不持久化）──────────────────────────────────────────

// openaiToolName → { serverId, originalName }
const toolRegistry = new Map<string, { serverId: string; originalName: string }>();

// serverId → MCPClient
const activeConnections = new Map<string, ReturnType<typeof createMCPClient>>();

// ─── Schema 转换 ─────────────────────────────────────────────────────────────

function convertMCPToolToOpenAI(
  serverId: string,
  mcpTool: MCPToolDefinition,
  usedNames: Set<string>,
): OpenAITool | null {
  if (!mcpTool.name) return null;

  const openaiName = buildStableMcpOpenAIName(serverId, mcpTool.name, usedNames);
  const parameters = normalizeMCPInputSchema(mcpTool.inputSchema);
  const displayName = mcpTool.title || mcpTool.name;
  const descriptionParts = [
    `[${serverId}] MCP tool: ${displayName}`,
    mcpTool.description || "",
    `Original MCP name: ${mcpTool.name}`,
  ].filter(Boolean);

  const openaiTool: OpenAITool = {
    type: "function",
    function: {
      name: openaiName,
      description: descriptionParts.join("\n"),
      parameters,
    },
  };

  toolRegistry.set(openaiName, { serverId, originalName: mcpTool.name });
  return openaiTool;
}

// ─── 公共 API ────────────────────────────────────────────────────────────────

/** 获取所有已发现的外部 MCP 工具（已过滤禁用的） */
export function getAllDiscoveredTools(): OpenAITool[] {
  return getDiscoveredTools().filter(
    (t) => !isMcpToolDisabled(t.function.name)
  );
}

/** 获取指定服务器的所有工具（含启用/禁用状态） */
export function getToolsForServer(serverId: string): Array<{
  name: string;
  originalName: string;
  description: string;
  enabled: boolean;
}> {
  const result: Array<{
    name: string;
    originalName: string;
    description: string;
    enabled: boolean;
  }> = [];
  for (const t of getDiscoveredTools()) {
    if (!isMcpToolNameForServer(t.function.name, serverId)) continue;
    const registryEntry = toolRegistry.get(t.function.name);
    result.push({
      name: t.function.name,
      originalName: registryEntry?.originalName || t.function.name,
      description: t.function.description,
      enabled: !isMcpToolDisabled(t.function.name),
    });
  }
  return result;
}

/** 检查工具名是否为外部 MCP 工具 */
export function isExternalMcpTool(toolName: string): boolean {
  return isExternalMcpToolName(toolName);
}

/** 调用远程 MCP 工具 */
export async function callRemoteTool(toolName: string, args: any): Promise<string> {
  const entry = toolRegistry.get(toolName);
  if (!entry) {
    return `Error: 未知的 MCP 工具 "${toolName}"`;
  }

  const client = activeConnections.get(entry.serverId);
  if (!client) {
    return `Error: MCP 服务器 "${entry.serverId}" 未连接`;
  }

  try {
    const result = await client.callTool(entry.originalName, args);
    return formatMCPToolResult(result);
  } catch (err: any) {
    // 连接断开时尝试自动重连一次
    const msg = err?.message ?? "";
    const isConnectionError =
      msg.includes("fetch") ||
      msg.includes("network") ||
      msg.includes("timeout") ||
      msg.includes("ECONNREFUSED") ||
      msg.includes("Failed to fetch");

    if (isConnectionError) {
      try {
        console.log(`[MCP] 工具调用失败，尝试重连服务器 "${entry.serverId}"...`);
        await connectToServer(entry.serverId);
        const newClient = activeConnections.get(entry.serverId);
        if (newClient) {
          const result = await newClient.callTool(entry.originalName, args);
          return formatMCPToolResult(result);
        }
      } catch (reconnectErr: any) {
        console.warn(`[MCP] 重连服务器 "${entry.serverId}" 失败:`, reconnectErr?.message);
      }
    }

    return `Error executing MCP tool "${entry.originalName}" on server "${entry.serverId}": ${msg || "Unknown error"}`;
  }
}

// ─── 连接管理 ────────────────────────────────────────────────────────────────

/** 连接到单个 MCP 服务器并发现工具 */
export async function connectToServer(serverId: string): Promise<void> {
  const server = mcpStore.servers.find((s) => s.id === serverId);
  if (!server) throw new Error(`服务器 "${serverId}" 未找到`);

  // 断开旧连接
  await disconnectFromServer(serverId);

  const client = createMCPClient(server);

  try {
    await client.initialize();
    const tools = await client.listTools();

    activeConnections.set(serverId, client);

    // 转换并注册所有工具
    const converted: OpenAITool[] = [];
    const usedNames = new Set<string>();
    for (const mcpTool of tools) {
      const openAITool = convertMCPToolToOpenAI(serverId, mcpTool, usedNames);
      if (openAITool) converted.push(openAITool);
    }

    setDiscoveredToolsForServer(serverId, converted);

    // 自动注册到工具管理
    registerMcpTools(
      serverId,
      server.name,
      converted.map((t) => {
        const toolName = toolRegistry.get(t.function.name)?.originalName || t.function.name;
        return {
          openaiName: t.function.name,
          displayName: toolName,
        };
      })
    );

    setServerStatus(serverId, {
      config: server,
      connected: true,
      toolCount: converted.length,
      error: undefined,
      lastConnectedAt: Date.now(),
    });

    console.log(`[MCP] 已连接 "${server.name}": ${converted.length} 个工具`);
  } catch (err: any) {
    activeConnections.delete(serverId);
    setServerStatus(serverId, {
      config: server,
      connected: false,
      toolCount: 0,
      error: err?.message ?? "Unknown error",
      lastErrorAt: Date.now(),
    });
    console.warn(`[MCP] 服务器 "${server.name}" 连接失败:`, err?.message);
    throw err; // 让调用方（initMcpServers）知道失败
  }
}

/** 断开与服务器的连接 */
export async function disconnectFromServer(serverId: string): Promise<void> {
  const client = activeConnections.get(serverId);
  if (client) {
    client.close();
    activeConnections.delete(serverId);
  }

  // 从注册表中移除该服务器的工具
  for (const [name, entry] of toolRegistry) {
    if (entry.serverId === serverId) toolRegistry.delete(name);
  }
  removeDiscoveredToolsForServer(serverId);
  unregisterMcpServerTools(serverId);

  setServerStatus(serverId, { connected: false, toolCount: 0 });
}

// ─── 健康检查 ──────────────────────────────────────────────────────────────────

let healthCheckTimer: ReturnType<typeof setInterval> | null = null;
const HEALTH_CHECK_MS = 60_000;
let initMcpServersPromise: Promise<void> | null = null;

function startHealthCheck(): void {
  if (healthCheckTimer) return;
  healthCheckTimer = setInterval(() => {
    for (const [serverId, client] of activeConnections) {
      // 发送 ping（tools/list 作为轻量心跳）
      client.listTools().catch(() => {
        console.warn(`[MCP] 服务器 "${serverId}" 心跳失败，标记为断开`);
        activeConnections.delete(serverId);
        removeDiscoveredToolsForServer(serverId);
        unregisterMcpServerTools(serverId);
        setServerStatus(serverId, { connected: false, toolCount: 0, error: "心跳超时" });
      });
    }
  }, HEALTH_CHECK_MS);
}

function stopHealthCheck(): void {
  if (healthCheckTimer) {
    clearInterval(healthCheckTimer);
    healthCheckTimer = null;
  }
}

// ─── 初始化 ────────────────────────────────────────────────────────────────────

/** 初始化所有已配置的 MCP 服务器 */
async function initMcpServersInternal(): Promise<void> {
  await loadMcpSettings();

  if (mcpStore.servers.length === 0) {
    console.log("[MCP] 无已配置的 MCP 服务器，跳过初始化");
    return;
  }

  console.log(`[MCP] 正在连接 ${mcpStore.servers.length} 个服务器...`);

  const results = await Promise.allSettled(
    mcpStore.servers.map((server) => connectToServer(server.id))
  );

  const succeeded = results.filter((r) => r.status === "fulfilled").length;
  const failed = results.filter((r) => r.status === "rejected").length;

  console.log(`[MCP] 初始化完成: ${succeeded} 成功, ${failed} 失败`);

  startHealthCheck();
}

export function initMcpServers(): Promise<void> {
  if (!initMcpServersPromise) {
    initMcpServersPromise = initMcpServersInternal().finally(() => {
      initMcpServersPromise = null;
    });
  }
  return initMcpServersPromise;
}

export async function ensureMcpServersReady(): Promise<void> {
  if (getAllDiscoveredTools().length > 0) return;
  await initMcpServers();
}
