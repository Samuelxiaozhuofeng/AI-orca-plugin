import { test, assert, assertEqual, assertDeepEqual } from "./test-harness";
import {
  createMCPClient,
  formatMCPToolResult,
  normalizeMCPInputSchema,
  parseMCPSSEEvents,
  parseMCPSSEMessages,
} from "../src/services/external/mcp-client";

function mockFetchSequence(handlers: Array<(input: RequestInfo | URL, init?: RequestInit) => Promise<Response> | Response>) {
  const originalFetch = globalThis.fetch;
  let index = 0;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const handler = handlers[index++];
    if (!handler) throw new Error(`Unexpected fetch call #${index}`);
    return handler(input, init);
  };
  return () => {
    globalThis.fetch = originalFetch;
  };
}

function jsonResponse(payload: any, init?: ResponseInit): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "content-type": "application/json", ...(init?.headers as any) },
    ...init,
  });
}

test("parseMCPSSEMessages parses multiple SSE JSON-RPC messages", () => {
  const messages = parseMCPSSEMessages(
    [
      "event: message",
      'data: {"jsonrpc":"2.0","method":"notifications/progress","params":{"p":1}}',
      "",
      "event: message",
      'data: {"jsonrpc":"2.0","id":2,"result":{"ok":true}}',
      "",
    ].join("\n"),
  );

  assertEqual(messages.length, 2);
  assertEqual(messages[1].id, 2);
  assertDeepEqual(messages[1].result, { ok: true });
});

test("parseMCPSSEEvents parses endpoint events", () => {
  const events = parseMCPSSEEvents("event: endpoint\ndata: /messages\n\n");

  assertEqual(events.length, 1);
  assertEqual(events[0].event, "endpoint");
  assertEqual(events[0].data, "/messages");
});

test("normalizeMCPInputSchema preserves object schema and wraps non-object schema", () => {
  const objectSchema = normalizeMCPInputSchema({
    type: "object",
    properties: { query: { type: "string" } },
    required: ["query", "missing"],
  });

  assertDeepEqual(objectSchema, {
    type: "object",
    properties: { query: { type: "string" } },
    required: ["query"],
  });

  const wrapped = normalizeMCPInputSchema({ type: "string" });
  assertEqual(wrapped.type, "object");
  assertDeepEqual(wrapped.required, ["input"]);
  assertDeepEqual(wrapped.properties.input, { type: "string" });
});

test("formatMCPToolResult includes structuredContent and isError", () => {
  const formatted = formatMCPToolResult({
    isError: true,
    structuredContent: { code: "bad" },
    content: [{ type: "text", text: "failed" }],
  });

  assert(formatted.startsWith("Error:"), "MCP isError result should be surfaced as Error");
  assert(formatted.includes("Structured result:"), "structuredContent should be included");
  assert(formatted.includes("failed"), "text content should be included");
});

test("createMCPClient initializes, follows tools/list pagination, and sends session headers", async () => {
  const seenSessionHeaders: Array<string | null> = [];
  const restore = mockFetchSequence([
    async () => jsonResponse(
      { jsonrpc: "2.0", id: 1, result: { protocolVersion: "2025-06-18" } },
      { headers: { "Mcp-Session-Id": "session-1" } },
    ),
    async () => jsonResponse({ jsonrpc: "2.0", id: 2, result: {} }),
    async (_input, init) => {
      seenSessionHeaders.push((init?.headers as Record<string, string>)["Mcp-Session-Id"] || null);
      return jsonResponse({
        jsonrpc: "2.0",
        id: 3,
        result: {
          tools: [{ name: "first" }],
          nextCursor: "next",
        },
      });
    },
    async (_input, init) => {
      seenSessionHeaders.push((init?.headers as Record<string, string>)["Mcp-Session-Id"] || null);
      return jsonResponse({
        jsonrpc: "2.0",
        id: 4,
        result: { tools: [{ name: "second" }] },
      });
    },
  ]);

  try {
    const client = createMCPClient({
      id: "s",
      name: "S",
      type: "http",
      url: "https://mcp.example/mcp",
      headers: {},
    });

    await client.initialize();
    const tools = await client.listTools();

    assertEqual(tools.length, 2);
    assertEqual(tools[0].name, "first");
    assertEqual(tools[1].name, "second");
    assertDeepEqual(seenSessionHeaders, ["session-1", "session-1"]);
  } finally {
    restore();
  }
});

test("createMCPClient rebuilds session after 404 and retries request", async () => {
  const restore = mockFetchSequence([
    async () => jsonResponse(
      { jsonrpc: "2.0", id: 1, result: { protocolVersion: "2025-06-18" } },
      { headers: { "Mcp-Session-Id": "old-session" } },
    ),
    async () => jsonResponse({ jsonrpc: "2.0", id: 2, result: {} }),
    async () => new Response("expired", { status: 404, statusText: "Not Found" }),
    async () => jsonResponse(
      { jsonrpc: "2.0", id: 4, result: { protocolVersion: "2025-06-18" } },
      { headers: { "Mcp-Session-Id": "new-session" } },
    ),
    async () => jsonResponse({ jsonrpc: "2.0", id: 5, result: {} }),
    async (_input, init) => {
      const headers = init?.headers as Record<string, string>;
      assertEqual(headers["Mcp-Session-Id"], "new-session");
      return jsonResponse({ jsonrpc: "2.0", id: 6, result: { tools: [{ name: "ok" }] } });
    },
  ]);

  try {
    const client = createMCPClient({
      id: "s",
      name: "S",
      type: "http",
      url: "https://mcp.example/mcp",
      headers: {},
    });

    await client.initialize();
    const tools = await client.listTools();

    assertEqual(tools.length, 1);
    assertEqual(tools[0].name, "ok");
  } finally {
    restore();
  }
});

test("createMCPClient falls back to legacy HTTP+SSE transport", async () => {
  const urls: string[] = [];
  const restore = mockFetchSequence([
    async () => new Response("method not allowed", { status: 405, statusText: "Method Not Allowed" }),
    async (input) => {
      urls.push(String(input));
      return new Response("event: endpoint\ndata: /messages\n\n", {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      });
    },
    async (input, init) => {
      urls.push(String(input));
      const id = JSON.parse(String(init?.body || "{}")).id;
      return jsonResponse({ jsonrpc: "2.0", id, result: { protocolVersion: "2024-11-05" } });
    },
    async () => jsonResponse({ jsonrpc: "2.0", id: 3, result: {} }),
    async (_input, init) => {
      const id = JSON.parse(String(init?.body || "{}")).id;
      return jsonResponse({ jsonrpc: "2.0", id, result: { tools: [{ name: "legacy" }] } });
    },
    async () => new Response(
      'event: message\ndata: {"jsonrpc":"2.0","id":5,"result":{"tools":[{"name":"legacy"}]}}\n\n',
      { status: 200, headers: { "content-type": "text/event-stream" } },
    ),
  ]);

  try {
    const client = createMCPClient({
      id: "legacy",
      name: "Legacy",
      type: "http",
      url: "https://mcp.example/sse",
      headers: {},
    });

    await client.initialize();
    const tools = await client.listTools();

    assertEqual(tools.length, 1);
    assertEqual(tools[0].name, "legacy");
    assertEqual(urls[0], "https://mcp.example/sse");
    assertEqual(urls[1], "https://mcp.example/messages");
  } finally {
    restore();
  }
});

test("createMCPClient reads legacy SSE only until the matching response event", async () => {
  const streamFrom = (chunks: string[]) => new ReadableStream<Uint8Array>({
    cancel() {
      // The client intentionally cancels after receiving the needed event.
    },
    start(controller) {
      for (const chunk of chunks) controller.enqueue(new TextEncoder().encode(chunk));
    },
  });

  const restore = mockFetchSequence([
    async () => new Response("method not allowed", { status: 405, statusText: "Method Not Allowed" }),
    async () => new Response(
      streamFrom(["event: endpoint\ndata: /messages\n\n", ": still open\n\n"]),
      { status: 200, headers: { "content-type": "text/event-stream" } },
    ),
    async (_input, init) => {
      const id = JSON.parse(String(init?.body || "{}")).id;
      return jsonResponse({ jsonrpc: "2.0", id, result: { protocolVersion: "2024-11-05" } });
    },
    async () => jsonResponse({ jsonrpc: "2.0", id: 3, result: {} }),
    async (_input, init) => {
      const id = JSON.parse(String(init?.body || "{}")).id;
      return new Response(
        streamFrom([
          'event: message\ndata: {"jsonrpc":"2.0","method":"notifications/progress","params":{"p":1}}\n\n',
          `event: message\ndata: {"jsonrpc":"2.0","id":${id},"result":{"tools":[{"name":"streamed"}]}}\n\n`,
          ": still open\n\n",
        ]),
        { status: 200, headers: { "content-type": "text/event-stream" } },
      );
    },
  ]);

  try {
    const client = createMCPClient({
      id: "legacy",
      name: "Legacy",
      type: "http",
      url: "https://mcp.example/sse",
      headers: {},
    });

    await client.initialize();
    const tools = await client.listTools();

    assertEqual(tools.length, 1);
    assertEqual(tools[0].name, "streamed");
  } finally {
    restore();
  }
});
