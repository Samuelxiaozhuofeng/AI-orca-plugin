/**
 * MCP JSON-RPC 2.0 HTTP 客户端（Streamable HTTP 传输）
 *
 * 实现 MCP Streamable HTTP 协议（2025 规范）：
 * - Accept: application/json, text/event-stream
 * - Mcp-Session-Id 会话管理
 * - SSE 响应解析（用于 tools/call 流式返回）
 *
 * 不依赖 Valtio / React，可独立测试。
 */

// ─── 类型定义 ────────────────────────────────────────────────────────────────

export interface MCPServerConfig {
  id: string;
  name: string;
  type: "http";
  url: string;
  headers: Record<string, string>;
}

export interface MCPToolDefinition {
  name: string;
  description?: string;
  inputSchema?: {
    type: "object";
    properties?: Record<string, any>;
    required?: string[];
  };
}

interface MCPRequest {
  jsonrpc: "2.0";
  method: string;
  params?: any;
  id: number;
}

interface MCPResponse {
  jsonrpc: "2.0";
  result?: any;
  error?: { code: number; message: string };
  id: number;
}

// ─── SSE 解析 ────────────────────────────────────────────────────────────────

/**
 * 从 SSE 文本流中提取第一个 data 事件的 JSON
 * SSE 格式: "data: {...}\n\n"
 */
function parseSSEResponse(text: string): any {
  const lines = text.split("\n");
  for (const line of lines) {
    if (line.startsWith("data: ")) {
      const jsonStr = line.slice(6);
      try {
        return JSON.parse(jsonStr);
      } catch {
        // 继续尝试下一个 data 行
      }
    }
  }
  throw new Error("SSE 响应中未找到有效的 JSON 数据");
}

// ─── 客户端工厂 ──────────────────────────────────────────────────────────────

const REQUEST_TIMEOUT_MS = 30000; // 30s，工具调用可能需要更长时间

export function createMCPClient(config: MCPServerConfig) {
  let nextId = 1;
  let sessionId: string | null = null;

  const isNotification = (method: string) => method.startsWith("notifications/");

  async function sendRequest(method: string, params?: any): Promise<any> {
    // 通知类方法不包含 id 字段（MCP 规范）
    const body: any = isNotification(method)
      ? { jsonrpc: "2.0", method, params }
      : { jsonrpc: "2.0", method, params, id: nextId++ };

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Accept": "application/json, text/event-stream",
      ...config.headers,
    };

    // 回传会话 ID
    if (sessionId) {
      headers["Mcp-Session-Id"] = sessionId;
    }

    const response = await fetch(config.url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });

    // 提取/更新会话 ID
    const newSessionId = response.headers.get("Mcp-Session-Id") || response.headers.get("mcp-session-id");
    if (newSessionId) {
      sessionId = newSessionId;
    }

    if (!response.ok) {
      // 通知类方法即使返回错误也不阻塞（调用方会 try/catch）
      if (isNotification(method)) return undefined;
      const errorText = await response.text().catch(() => "");
      const detail = errorText ? ` — ${errorText.slice(0, 200)}` : "";
      throw new Error(`MCP HTTP ${response.status}: ${response.statusText}${detail}`);
    }

    // 通知类方法无需解析响应体
    if (isNotification(method)) return undefined;

    const contentType = response.headers.get("Content-Type") || "";

    // ── SSE 响应（text/event-stream）───────────────────────────────
    if (contentType.includes("text/event-stream")) {
      const text = await response.text();
      const data = parseSSEResponse(text);

      if (data.error) {
        throw new Error(`MCP error ${data.error.code}: ${data.error.message}`);
      }
      return data.result;
    }

    // ── JSON 响应 ──────────────────────────────────────────────────
    let data: MCPResponse;
    try {
      data = await response.json();
    } catch {
      // 尝试按 SSE 解析纯文本
      const text = await response.text().catch(() => "");
      if (text.includes("data: ")) {
        const sseData = parseSSEResponse(text);
        if (sseData.error) throw new Error(`MCP error ${sseData.error.code}: ${sseData.error.message}`);
        return sseData.result;
      }
      throw new Error("MCP 响应解析失败");
    }

    if (data.error) {
      throw new Error(`MCP error ${data.error.code}: ${data.error.message}`);
    }

    return data.result;
  }

  return {
    config,

    async initialize(): Promise<void> {
      await sendRequest("initialize", {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "orca-ai-chat", version: "1.0.0" },
      });
      // initialized 通知 — 部分服务器不支持，失败不阻塞
      try {
        await sendRequest("notifications/initialized", {});
      } catch {
        // 忽略：服务器可能未实现此通知
      }
    },

    async listTools(): Promise<MCPToolDefinition[]> {
      const result = await sendRequest("tools/list", {});
      return result?.tools ?? [];
    },

    async callTool(name: string, args?: any): Promise<any> {
      return sendRequest("tools/call", { name, arguments: args ?? {} });
    },

    close(): void {
      sessionId = null;
    },
  };
}

// ─── 结果格式化 ──────────────────────────────────────────────────────────────

const MAX_OUTPUT_LENGTH = 30000;

/**
 * 将 MCP tools/call 返回结果格式化为展示用的字符串
 * MCP 结果包含 content 数组 (text / resource / image 等)
 */
export function formatMCPToolResult(result: any): string {
  if (!result || !Array.isArray(result.content)) {
    const s = typeof result === "string" ? result : JSON.stringify(result ?? {});
    return s.length > MAX_OUTPUT_LENGTH ? s.slice(0, MAX_OUTPUT_LENGTH) + "\n... (截断)" : s;
  }

  const parts: string[] = [];
  for (const item of result.content) {
    if (item.type === "text" && item.text) {
      parts.push(item.text);
    } else if (item.type === "resource") {
      const uri = item.resource?.uri ?? "unknown";
      const text = item.resource?.text;
      if (text) {
        parts.push(`[Resource: ${uri}]\n${text}`);
      } else {
        parts.push(`[Resource: ${uri}]`);
      }
    } else if (item.type === "image") {
      parts.push(`[Image: ${item.data?.slice(0, 50) ?? "binary"}...]`);
    } else {
      parts.push(JSON.stringify(item));
    }
  }

  const output = parts.filter(Boolean).join("\n");
  return output.length > MAX_OUTPUT_LENGTH
    ? output.slice(0, MAX_OUTPUT_LENGTH) + "\n... (截断)"
    : output;
}
