export type OpenAIChatRole = "system" | "user" | "assistant" | "tool";

export type OpenAIChatMessage = {
  role: OpenAIChatRole;
  content: string | null;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: {
      name: string;
      arguments: string;
    };
  }>;
  tool_call_id?: string;
  name?: string;
};

export type OpenAITool = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, any>;
      required?: string[];
    };
  };
};

export type OpenAIChatStreamArgs = {
  apiUrl: string;
  apiKey: string;
  model: string;
  messages: OpenAIChatMessage[];
  temperature?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  tools?: OpenAITool[];
};

function joinUrl(base: string, path: string): string {
  const b = base.replace(/\/+$/, "");
  const p = path.replace(/^\/+/, "");
  return `${b}/${p}`;
}

function getChatCompletionsUrl(apiUrl: string): string {
  const trimmed = apiUrl.trim().replace(/\/+$/, "");
  if (trimmed.toLowerCase().endsWith("/chat/completions")) return trimmed;
  return joinUrl(trimmed, "/chat/completions");
}

async function readErrorMessage(res: Response): Promise<string> {
  const contentType = res.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("application/json")) {
      const json = await res.json();
      const msg =
        json?.error?.message ??
        json?.message ??
        (typeof json === "string" ? json : null);
      if (typeof msg === "string" && msg.trim()) return msg.trim();
      return JSON.stringify(json);
    }
  } catch {}

  try {
    const text = await res.text();
    if (text.trim()) return text.trim();
  } catch {}

  return `HTTP ${res.status}`;
}

type StreamChunk = {
  type: "content" | "tool_calls";
  content?: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: {
      name: string;
      arguments: string;
    };
  }>;
};

function safeDeltaFromEvent(obj: any): StreamChunk {
  const errMsg = obj?.error?.message;
  if (typeof errMsg === "string" && errMsg.trim()) {
    throw new Error(errMsg.trim());
  }

  const delta = obj?.choices?.[0]?.delta;

  // Check for tool calls in delta
  if (delta?.tool_calls) {
    return {
      type: "tool_calls",
      tool_calls: delta.tool_calls,
    };
  }

  // Check for content in delta
  if (delta && typeof delta.content === "string") {
    return {
      type: "content",
      content: delta.content,
    };
  }

  // Check message (non-streaming response)
  const msg = obj?.choices?.[0]?.message;
  if (msg) {
    if (msg.tool_calls) {
      return {
        type: "tool_calls",
        tool_calls: msg.tool_calls,
      };
    }
    if (typeof msg.content === "string") {
      return {
        type: "content",
        content: msg.content,
      };
    }
  }

  // Legacy text field
  if (typeof obj?.text === "string") {
    return {
      type: "content",
      content: obj.text,
    };
  }

  return {
    type: "content",
    content: "",
  };
}

export async function* openAIChatCompletionsStream(
  args: OpenAIChatStreamArgs,
): AsyncGenerator<StreamChunk, void, unknown> {
  const url = getChatCompletionsUrl(args.apiUrl);

  const requestBody: any = {
    model: args.model,
    messages: args.messages,
    temperature: args.temperature,
    max_tokens: args.maxTokens,
    stream: true,
  };

  // Add tools if provided
  if (args.tools && args.tools.length > 0) {
    requestBody.tools = args.tools;
  }

  console.log("[openAIChatCompletionsStream] Request URL:", url);
  console.log("[openAIChatCompletionsStream] Request body:", JSON.stringify(requestBody, null, 2));

  let res: Response;
  try {
    res = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "text/event-stream",
        "Content-Type": "application/json",
        Authorization: `Bearer ${args.apiKey}`,
      },
      body: JSON.stringify(requestBody),
      signal: args.signal,
    });
    console.log("[openAIChatCompletionsStream] Response received");
  } catch (fetchErr: any) {
    console.error("[openAIChatCompletionsStream] Fetch error:", fetchErr);
    throw fetchErr;
  }

  console.log("[openAIChatCompletionsStream] Response status:", res.status);
  console.log("[openAIChatCompletionsStream] Response headers:", Array.from(res.headers.entries()));

  if (!res.ok) {
    const msg = await readErrorMessage(res);
    console.error("[openAIChatCompletionsStream] Error response:", msg);
    throw new Error(msg);
  }

  const contentType = (res.headers.get("content-type") ?? "").toLowerCase();
  console.log("[openAIChatCompletionsStream] Content-Type:", contentType);

  if (!res.body || contentType.includes("application/json")) {
    console.log("[openAIChatCompletionsStream] Non-streaming response detected");
    const json = await res.json();
    console.log("[openAIChatCompletionsStream] JSON response:", json);
    const chunk = safeDeltaFromEvent(json);
    if (chunk.content || chunk.tool_calls) {
      console.log("[openAIChatCompletionsStream] Yielding chunk:", chunk);
      yield chunk;
    }
    return;
  }

  console.log("[openAIChatCompletionsStream] Starting SSE stream processing");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let lineCount = 0;
  let chunkCount = 0;

  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      console.log("[openAIChatCompletionsStream] Stream done. Total lines:", lineCount, "Total chunks:", chunkCount);
      break;
    }

    buffer += decoder.decode(value, { stream: true });

    while (true) {
      const newlineIndex = buffer.indexOf("\n");
      if (newlineIndex === -1) break;
      const rawLine = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);
      lineCount++;

      const line = rawLine.trim();
      if (!line) continue;
      if (!line.startsWith("data:")) continue;

      const data = line.slice("data:".length).trim();
      if (!data) continue;
      if (data === "[DONE]") {
        console.log("[openAIChatCompletionsStream] Received [DONE] marker");
        return;
      }

      let obj: any;
      try {
        obj = JSON.parse(data);
      } catch (parseErr) {
        console.warn("[openAIChatCompletionsStream] Failed to parse SSE data:", data, parseErr);
        continue;
      }
      const chunk = safeDeltaFromEvent(obj);
      if (chunk.content || chunk.tool_calls) {
        chunkCount++;
        console.log(`[openAIChatCompletionsStream] Yielding chunk #${chunkCount}:`, chunk);
        yield chunk;
      }
    }
  }
}
