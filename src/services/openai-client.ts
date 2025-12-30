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
  type: "content" | "tool_calls" | "reasoning";
  content?: string;
  reasoning?: string;
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
  const choice = obj?.choices?.[0];

  // Check for tool calls in delta
  if (delta?.tool_calls) {
    return {
      type: "tool_calls",
      tool_calls: delta.tool_calls,
    };
  }

  // Check for reasoning content (DeepSeek/Claude/OpenAI thinking)
  // 尝试多种可能的字段名
  let reasoning =
    delta?.reasoning_content ||
    delta?.thinking ||
    delta?.reasoning ||
    choice?.reasoning_content ||
    choice?.thinking;
  
  // DeepSeek Reasoner 有时会返回重复字符，尝试去重
  if (typeof reasoning === "string" && reasoning) {
    // 检测并修复连续重复的字符模式（如 "我我喜喜欢欢" -> "我喜欢"）
    // 使用更宽松的检测：如果超过 50% 的字符是连续重复的，就进行去重
    const originalLength = reasoning.length;
    const deduped = reasoning.replace(/(.)\1/g, '$1');
    const removedCount = originalLength - deduped.length;
    // 如果去除的重复字符超过原长度的 40%，说明确实有大量重复
    if (originalLength > 4 && removedCount > originalLength * 0.4) {
      reasoning = deduped;
    }
    
    return {
      type: "reasoning",
      reasoning,
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
    // Check reasoning in non-streaming message
    const msgReasoning = msg.reasoning_content || msg.thinking;
    if (typeof msgReasoning === "string" && msgReasoning) {
      return {
        type: "reasoning",
        reasoning: msgReasoning,
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
    // 启用推理内容返回（DeepSeek/OpenAI-compatible APIs）
    stream_options: {
      include_usage: true,
    },
  };

  // Debug: 检查 assistant 消息是否符合 DeepSeek 要求
  for (const msg of args.messages) {
    if (msg.role === "assistant") {
      const hasContent = msg.content !== null && msg.content !== undefined && 
        (typeof msg.content === 'string' ? msg.content.length > 0 : true);
      const hasToolCalls = msg.tool_calls && msg.tool_calls.length > 0;
      if (!hasContent && !hasToolCalls) {
        console.warn("[openAI] Warning: assistant message has no content and no tool_calls:", msg);
      }
    }
  }

  // Add tools if provided
  if (args.tools && args.tools.length > 0) {
    requestBody.tools = args.tools;
  }

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
  } catch (fetchErr: any) {
    console.error("[openAI] Fetch error:", fetchErr);
    throw fetchErr;
  }

  if (!res.ok) {
    const msg = await readErrorMessage(res);
    console.error("[openAI] Error response:", res.status, msg);
    throw new Error(msg);
  }

  const contentType = (res.headers.get("content-type") ?? "").toLowerCase();

  if (!res.body || contentType.includes("application/json")) {
    const json = await res.json();
    const chunk = safeDeltaFromEvent(json);
    if (chunk.content || chunk.tool_calls || chunk.reasoning) {
      yield chunk;
    }
    return;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });

    while (true) {
      const newlineIndex = buffer.indexOf("\n");
      if (newlineIndex === -1) break;
      const rawLine = buffer.slice(0, newlineIndex);
      buffer = buffer.slice(newlineIndex + 1);

      const line = rawLine.trim();
      if (!line) continue;
      if (!line.startsWith("data:")) continue;

      const data = line.slice("data:".length).trim();
      if (!data) continue;
      if (data === "[DONE]") return;

      let obj: any;
      try {
        obj = JSON.parse(data);
      } catch (parseErr) {
        console.warn("[openAI] Failed to parse SSE data:", data);
        continue;
      }
      const chunk = safeDeltaFromEvent(obj);
      if (chunk.content || chunk.tool_calls || chunk.reasoning) {
        yield chunk;
      }
    }
  }
}
