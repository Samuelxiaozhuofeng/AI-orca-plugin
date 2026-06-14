/**
 * MCP JSON-RPC 2.0 client for Streamable HTTP transport.
 *
 * This module intentionally stays independent from React/Valtio so the protocol
 * behavior can be tested without the Orca runtime.
 */

export interface MCPServerConfig {
  id: string;
  name: string;
  type: "http";
  url: string;
  headers: Record<string, string>;
  /** Optional preferred MCP protocol version. Defaults to current + compatible fallbacks. */
  protocolVersion?: string;
  /** Optional timeout for tools/call in milliseconds. */
  timeoutMs?: number;
}

export interface MCPToolDefinition {
  name: string;
  title?: string;
  description?: string;
  inputSchema?: Record<string, any>;
  outputSchema?: Record<string, any>;
  annotations?: Record<string, any>;
  _meta?: Record<string, any>;
}

type JsonRpcId = number | string | null;

interface MCPResponse {
  jsonrpc?: "2.0";
  result?: any;
  error?: { code: number; message: string; data?: any };
  id?: JsonRpcId;
  method?: string;
  params?: any;
}

type TransportMode = "streamable-http" | "legacy-sse";

const PROTOCOL_VERSION_FALLBACKS = ["2025-06-18", "2025-03-26", "2024-11-05"];
const REQUEST_TIMEOUT_MS = 30_000;
const TOOL_TIMEOUT_MS = 120_000;
const MAX_LIST_PAGES = 100;
const MAX_OUTPUT_LENGTH = 30_000;

function uniqueVersions(preferred?: string): string[] {
  const versions = preferred ? [preferred, ...PROTOCOL_VERSION_FALLBACKS] : PROTOCOL_VERSION_FALLBACKS;
  return [...new Set(versions.filter(Boolean))];
}

function timeoutSignal(timeoutMs: number): AbortSignal {
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    return AbortSignal.timeout(timeoutMs);
  }

  const controller = new AbortController();
  setTimeout(() => controller.abort(), timeoutMs);
  return controller.signal;
}

function isNotification(method: string): boolean {
  return method.startsWith("notifications/");
}

function readSessionId(headers: Headers): string | null {
  return headers.get("Mcp-Session-Id") || headers.get("mcp-session-id");
}

function isStreamableTransportFailure(message: string): boolean {
  return /404|405|406|415|not found|method not allowed|unsupported media|parse|unexpected|response/i.test(message);
}

function isProtocolVersionFailure(message: string): boolean {
  return /protocol|version|unsupported|invalid/i.test(message);
}

function safeJsonStringify(value: any): string {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

function clipOutput(text: string): string {
  return text.length > MAX_OUTPUT_LENGTH ? `${text.slice(0, MAX_OUTPUT_LENGTH)}\n... (truncated)` : text;
}

function parseJsonMaybe(text: string): any {
  const trimmed = text.trim();
  if (!trimmed) return undefined;
  return JSON.parse(trimmed);
}

async function readSSEUntil(
  response: Response,
  predicate: (event: { event: string; data: string }) => boolean,
): Promise<Array<{ event: string; data: string }>> {
  if (!response.body) return parseMCPSSEEvents(await response.text());

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const events: Array<{ event: string; data: string }> = [];

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let boundary = buffer.indexOf("\n\n");
      while (boundary !== -1) {
        const rawEvent = buffer.slice(0, boundary + 2);
        buffer = buffer.slice(boundary + 2);
        const parsedEvents = parseMCPSSEEvents(rawEvent);
        events.push(...parsedEvents);
        if (parsedEvents.some(predicate)) return events;
        boundary = buffer.indexOf("\n\n");
      }
    }

    if (buffer.trim()) {
      const parsedEvents = parseMCPSSEEvents(buffer);
      events.push(...parsedEvents);
    }
  } finally {
    reader.cancel().catch(() => undefined);
  }

  return events;
}

/**
 * Parse an SSE response body into JSON-RPC messages.
 *
 * The Streamable HTTP spec allows the server to send notifications/requests
 * before the response for the originating request, so callers must select the
 * message matching the request id.
 */
export function parseMCPSSEMessages(text: string): MCPResponse[] {
  const messages: MCPResponse[] = [];
  let dataLines: string[] = [];

  const flush = () => {
    if (dataLines.length === 0) return;
    const payload = dataLines.join("\n").trim();
    dataLines = [];
    if (!payload || payload === "[DONE]") return;
    try {
      const parsed = JSON.parse(payload);
      if (Array.isArray(parsed)) {
        messages.push(...parsed);
      } else {
        messages.push(parsed);
      }
    } catch {
      // SSE streams may include non-JSON keepalive/status data. Ignore those
      // frames and let the caller decide whether a matching response arrived.
    }
  };

  for (const rawLine of text.replace(/\r\n/g, "\n").split("\n")) {
    const line = rawLine.trimEnd();
    if (line === "") {
      flush();
      continue;
    }
    if (line.startsWith(":")) continue;
    if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart());
    }
  }
  flush();

  if (messages.length === 0 && text.trim()) {
    const parsed = parseJsonMaybe(text);
    if (Array.isArray(parsed)) return parsed;
    if (parsed) return [parsed];
  }

  return messages;
}

export function parseMCPSSEEvents(text: string): Array<{ event: string; data: string }> {
  const events: Array<{ event: string; data: string }> = [];
  let event = "message";
  let dataLines: string[] = [];

  const flush = () => {
    if (dataLines.length === 0) {
      event = "message";
      return;
    }
    events.push({ event, data: dataLines.join("\n") });
    event = "message";
    dataLines = [];
  };

  for (const rawLine of text.replace(/\r\n/g, "\n").split("\n")) {
    const line = rawLine.trimEnd();
    if (line === "") {
      flush();
      continue;
    }
    if (line.startsWith(":")) continue;
    if (line.startsWith("event:")) {
      event = line.slice(6).trim() || "message";
    } else if (line.startsWith("data:")) {
      dataLines.push(line.slice(5).trimStart());
    }
  }
  flush();

  return events;
}

function normalizeJsonRpcMessages(payload: any): MCPResponse[] {
  if (payload == null) return [];
  if (Array.isArray(payload)) return payload;
  return [payload];
}

function resultFromMessages(messages: MCPResponse[], requestId: JsonRpcId): any {
  if (messages.length === 0) return undefined;

  const exact = messages.find((msg) => Object.prototype.hasOwnProperty.call(msg, "id") && msg.id === requestId);
  const selected = exact
    || messages.find((msg) => Object.prototype.hasOwnProperty.call(msg, "result"))
    || messages.find((msg) => Object.prototype.hasOwnProperty.call(msg, "error"));

  if (!selected) {
    throw new Error("MCP response did not include a JSON-RPC result for the request");
  }
  if (selected.error) {
    throw new Error(`MCP error ${selected.error.code}: ${selected.error.message}`);
  }
  if (Object.prototype.hasOwnProperty.call(selected, "result")) {
    return selected.result;
  }

  // Tolerate non-standard servers that return the result object directly.
  return selected;
}

async function parseResponseBody(response: Response): Promise<MCPResponse[]> {
  const contentType = response.headers.get("Content-Type") || response.headers.get("content-type") || "";
  const text = await response.text();
  if (!text.trim()) return [];

  if (contentType.includes("text/event-stream") || text.includes("\ndata:") || text.startsWith("data:")) {
    return parseMCPSSEMessages(text);
  }

  try {
    return normalizeJsonRpcMessages(JSON.parse(text));
  } catch {
    return parseMCPSSEMessages(text);
  }
}

function normalizeRequired(required: any, properties: Record<string, any>): string[] | undefined {
  if (!Array.isArray(required)) return undefined;
  const keys = new Set(Object.keys(properties));
  const normalized = required.filter((key): key is string => typeof key === "string" && keys.has(key));
  return normalized.length > 0 ? normalized : undefined;
}

function sanitizeSchemaNode(value: any, depth = 0): any {
  if (depth > 20) return {};
  if (Array.isArray(value)) return value.map((item) => sanitizeSchemaNode(item, depth + 1));
  if (!value || typeof value !== "object") return value;

  const out: Record<string, any> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (key === "$schema" || key === "$id" || key === "examples" || key === "_meta") continue;
    out[key] = sanitizeSchemaNode(raw, depth + 1);
  }
  return out;
}

/**
 * Normalize an MCP tool inputSchema into a function-calling parameter schema.
 * MCP requires an object schema, but many community servers are loose; this
 * keeps valid object schemas intact and wraps non-object schemas safely.
 */
export function normalizeMCPInputSchema(inputSchema: any): {
  type: "object";
  properties: Record<string, any>;
  required?: string[];
  [key: string]: any;
} {
  const schema = sanitizeSchemaNode(inputSchema && typeof inputSchema === "object" ? inputSchema : {});

  if (schema.type === "object" || schema.properties || schema.required) {
    const properties = schema.properties && typeof schema.properties === "object" && !Array.isArray(schema.properties)
      ? schema.properties
      : {};
    return {
      ...schema,
      type: "object",
      properties,
      required: normalizeRequired(schema.required, properties),
    };
  }

  return {
    type: "object",
    properties: {
      input: Object.keys(schema).length > 0 ? schema : { type: "string" },
    },
    required: ["input"],
  };
}

export function createMCPClient(config: MCPServerConfig) {
  let nextId = 1;
  let sessionId: string | null = null;
  let negotiatedProtocolVersion: string | undefined;
  let initializing: Promise<void> | null = null;
  let transportMode: TransportMode = "streamable-http";
  let legacyPostUrl: string | null = null;

  function resolveLegacyPostUrl(endpoint: string): string {
    try {
      return new URL(endpoint, config.url).toString();
    } catch {
      return endpoint;
    }
  }

  async function connectLegacySSE(): Promise<void> {
    const response = await fetch(config.url, {
      method: "GET",
      headers: {
        "Accept": "text/event-stream",
        ...config.headers,
      },
      signal: timeoutSignal(REQUEST_TIMEOUT_MS),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`MCP legacy SSE HTTP ${response.status}: ${response.statusText}${detail ? ` - ${detail.slice(0, 500)}` : ""}`);
    }

    const events = await readSSEUntil(response, (event) => event.event === "endpoint");
    const endpoint = events.find((event) => event.event === "endpoint")?.data?.trim();
    if (!endpoint) {
      throw new Error("MCP legacy SSE endpoint event was not found");
    }

    legacyPostUrl = resolveLegacyPostUrl(endpoint);
  }

  async function sendLegacyRequest(
    method: string,
    params?: any,
    options: { timeoutMs?: number } = {},
  ): Promise<any> {
    if (!legacyPostUrl) await connectLegacySSE();

    const notification = isNotification(method);
    const requestId = notification ? undefined : nextId++;
    const body: any = notification
      ? { jsonrpc: "2.0", method, params }
      : { jsonrpc: "2.0", method, params, id: requestId };

    const postResponse = await fetch(legacyPostUrl!, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...config.headers,
      },
      body: JSON.stringify(body),
      signal: timeoutSignal(options.timeoutMs ?? REQUEST_TIMEOUT_MS),
    });

    if (!postResponse.ok) {
      const detail = await postResponse.text().catch(() => "");
      throw new Error(`MCP legacy POST HTTP ${postResponse.status}: ${postResponse.statusText}${detail ? ` - ${detail.slice(0, 500)}` : ""}`);
    }

    if (notification) return undefined;

    const postContentType = postResponse.headers.get("Content-Type") || postResponse.headers.get("content-type") || "";
    const postMessages = postContentType.includes("text/event-stream")
      ? (await readSSEUntil(postResponse, (event) => {
          if (event.event !== "message" && event.event !== "response") return false;
          return parseMCPSSEMessages(event.data).some((msg) => msg.id === requestId);
        }))
          .filter((event) => event.event === "message" || event.event === "response")
          .flatMap((event) => parseMCPSSEMessages(event.data))
      : await parseResponseBody(postResponse);
    if (postMessages.length > 0) {
      return resultFromMessages(postMessages, requestId!);
    }

    const eventResponse = await fetch(config.url, {
      method: "GET",
      headers: {
        "Accept": "text/event-stream",
        ...config.headers,
      },
      signal: timeoutSignal(options.timeoutMs ?? REQUEST_TIMEOUT_MS),
    });

    if (!eventResponse.ok) {
      const detail = await eventResponse.text().catch(() => "");
      throw new Error(`MCP legacy SSE HTTP ${eventResponse.status}: ${eventResponse.statusText}${detail ? ` - ${detail.slice(0, 500)}` : ""}`);
    }

    const events = await readSSEUntil(eventResponse, (event) => {
      if (event.event !== "message" && event.event !== "response") return false;
      return parseMCPSSEMessages(event.data).some((msg) => msg.id === requestId);
    });
    const messages = events
      .filter((event) => event.event === "message" || event.event === "response")
      .flatMap((event) => parseMCPSSEMessages(event.data));
    return resultFromMessages(messages, requestId!);
  }

  async function sendRequest(
    method: string,
    params?: any,
    options: { timeoutMs?: number; retrySession?: boolean } = {},
  ): Promise<any> {
    if (transportMode === "legacy-sse") {
      return sendLegacyRequest(method, params, options);
    }

    const notification = isNotification(method);
    const requestId = notification ? undefined : nextId++;
    const body: any = notification
      ? { jsonrpc: "2.0", method, params }
      : { jsonrpc: "2.0", method, params, id: requestId };

    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Accept": "application/json, text/event-stream",
      ...config.headers,
    };

    if (sessionId) headers["Mcp-Session-Id"] = sessionId;
    if (method !== "initialize" && negotiatedProtocolVersion) {
      headers["MCP-Protocol-Version"] = negotiatedProtocolVersion;
    }

    const response = await fetch(config.url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal: timeoutSignal(options.timeoutMs ?? REQUEST_TIMEOUT_MS),
    });

    const nextSessionId = readSessionId(response.headers);
    if (nextSessionId) sessionId = nextSessionId;

    const shouldRetrySession =
      options.retrySession !== false
      && !!sessionId
      && method !== "initialize"
      && (response.status === 404 || response.status === 410);

    if (shouldRetrySession) {
      sessionId = null;
      await initialize();
      return sendRequest(method, params, { ...options, retrySession: false });
    }

    if (!response.ok) {
      if (notification && response.status === 202) return undefined;
      const detail = await response.text().catch(() => "");
      const suffix = detail ? ` - ${detail.slice(0, 500)}` : "";
      throw new Error(`MCP HTTP ${response.status}: ${response.statusText}${suffix}`);
    }

    if (notification) return undefined;
    if (response.status === 202 || response.status === 204) return undefined;

    const messages = await parseResponseBody(response);
    return resultFromMessages(messages, requestId!);
  }

  async function initialize(): Promise<void> {
    if (initializing) return initializing;

    initializing = (async () => {
      let lastError: any = null;
      for (const version of uniqueVersions(config.protocolVersion)) {
        try {
          sessionId = null;
          negotiatedProtocolVersion = undefined;
          transportMode = "streamable-http";
          const result = await sendRequest("initialize", {
            protocolVersion: version,
            capabilities: {},
            clientInfo: { name: "orca-ai-chat", version: "1.0.0" },
          }, { retrySession: false });

          negotiatedProtocolVersion = typeof result?.protocolVersion === "string"
            ? result.protocolVersion
            : version;

          try {
            await sendRequest("notifications/initialized", {}, { retrySession: false });
          } catch {
            // Some servers do not implement or require this notification.
          }
          return;
        } catch (err: any) {
          lastError = err;
          const message = err?.message || "";
          if (!isProtocolVersionFailure(message) && !/400|406|422/.test(message)) break;
        }
      }

      if (lastError && isStreamableTransportFailure(lastError?.message || "")) {
        transportMode = "legacy-sse";
        legacyPostUrl = null;
        const result = await sendRequest("initialize", {
          protocolVersion: "2024-11-05",
          capabilities: {},
          clientInfo: { name: "orca-ai-chat", version: "1.0.0" },
        }, { retrySession: false });
        negotiatedProtocolVersion = typeof result?.protocolVersion === "string"
          ? result.protocolVersion
          : "2024-11-05";

        try {
          await sendRequest("notifications/initialized", {}, { retrySession: false });
        } catch {
          // Optional in practice for some community implementations.
        }
        return;
      }

      throw lastError || new Error("MCP initialize failed");
    })();

    try {
      await initializing;
    } finally {
      initializing = null;
    }
  }

  return {
    config,

    initialize,

    async listTools(): Promise<MCPToolDefinition[]> {
      const tools: MCPToolDefinition[] = [];
      let cursor: string | undefined;

      for (let page = 0; page < MAX_LIST_PAGES; page++) {
        const result = await sendRequest("tools/list", cursor ? { cursor } : {});
        const pageTools = Array.isArray(result?.tools) ? result.tools : [];
        tools.push(...pageTools);

        cursor = typeof result?.nextCursor === "string" && result.nextCursor ? result.nextCursor : undefined;
        if (!cursor) return tools;
      }

      throw new Error(`MCP tools/list exceeded ${MAX_LIST_PAGES} pages`);
    },

    async callTool(name: string, args?: any): Promise<any> {
      return sendRequest(
        "tools/call",
        { name, arguments: args && typeof args === "object" ? args : {} },
        { timeoutMs: config.timeoutMs ?? TOOL_TIMEOUT_MS },
      );
    },

    close(): void {
      sessionId = null;
      negotiatedProtocolVersion = undefined;
      legacyPostUrl = null;
    },
  };
}

function formatContentBlock(item: any): string {
  if (!item || typeof item !== "object") return safeJsonStringify(item);

  if (item.type === "text") return String(item.text ?? "");

  if (item.type === "image") {
    const mimeType = item.mimeType || "image";
    const size = typeof item.data === "string" ? item.data.length : 0;
    return `[Image: ${mimeType}; ${size} base64 chars]`;
  }

  if (item.type === "audio") {
    const mimeType = item.mimeType || "audio";
    const size = typeof item.data === "string" ? item.data.length : 0;
    return `[Audio: ${mimeType}; ${size} base64 chars]`;
  }

  if (item.type === "resource_link") {
    const label = item.name || item.title || item.uri || "resource";
    return `[Resource link: ${label}${item.uri ? ` <${item.uri}>` : ""}]`;
  }

  if (item.type === "resource") {
    const resource = item.resource || {};
    const uri = resource.uri || item.uri || "unknown";
    if (typeof resource.text === "string") return `[Resource: ${uri}]\n${resource.text}`;
    if (typeof resource.blob === "string") {
      return `[Resource: ${uri}; ${resource.mimeType || "binary"}; ${resource.blob.length} base64 chars]`;
    }
    return `[Resource: ${uri}]\n${safeJsonStringify(resource)}`;
  }

  return safeJsonStringify(item);
}

/**
 * Format a standard MCP tools/call result for the assistant conversation.
 */
export function formatMCPToolResult(result: any): string {
  if (!result || typeof result !== "object" || !Array.isArray(result.content)) {
    return clipOutput(typeof result === "string" ? result : safeJsonStringify(result ?? {}));
  }

  const parts: string[] = [];
  if (result.structuredContent && typeof result.structuredContent === "object") {
    parts.push(`Structured result:\n${safeJsonStringify(result.structuredContent)}`);
  }

  for (const item of result.content) {
    const formatted = formatContentBlock(item);
    if (formatted) parts.push(formatted);
  }

  const body = parts.filter(Boolean).join("\n");
  const output = result.isError
    ? `Error: MCP tool returned isError=true${body ? `\n${body}` : ""}`
    : body || safeJsonStringify(result);

  return clipOutput(output);
}
