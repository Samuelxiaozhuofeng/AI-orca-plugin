/**
 * Shared API helpers — used by memory-extraction & portrait-generation.
 */

// ─── URL builders ────────────────────────────────────────────────────────────

function buildChatCompletionsUrl(apiUrl: string): string {
  const trimmed = apiUrl.trim().replace(/\/+$/, "");
  if (trimmed.toLowerCase().endsWith("/chat/completions")) return trimmed;
  return `${trimmed}/chat/completions`;
}

function buildChatCompletionsUrlCandidates(apiUrl: string): string[] {
  const trimmed = apiUrl.trim().replace(/\/+$/, "");
  const lower = trimmed.toLowerCase();
  if (lower.endsWith("/chat/completions")) return [trimmed];
  if (lower.endsWith("/v1")) return [`${trimmed}/chat/completions`];
  return [`${trimmed}/v1/chat/completions`, `${trimmed}/chat/completions`];
}

function buildAnthropicMessagesUrl(apiUrl: string): string {
  const trimmed = apiUrl.trim().replace(/\/+$/, "");
  const lower = trimmed.toLowerCase();
  if (lower.endsWith("/messages")) return trimmed;
  if (lower.endsWith("/v1")) return `${trimmed}/messages`;
  return `${trimmed}/v1/messages`;
}

function buildAnthropicMessagesUrlCandidates(apiUrl: string, anthropicApiPath?: string): string[] {
  const override = typeof anthropicApiPath === "string" ? anthropicApiPath.trim() : "";
  if (override) {
    if (/^https?:\/\//i.test(override)) return [override];
    const trimmed = apiUrl.trim().replace(/\/+$/, "");
    return [`${trimmed}/${override.replace(/^\/+/, "")}`];
  }
  const trimmed = apiUrl.trim().replace(/\/+$/, "");
  const lower = trimmed.toLowerCase();
  if (lower.endsWith("/messages")) return [trimmed];
  if (lower.endsWith("/v1")) return [`${trimmed}/messages`, trimmed];
  return [`${trimmed}/v1/messages`, `${trimmed}/messages`, trimmed];
}

export function buildChatUrlCandidates(
  apiUrl: string,
  protocol: "openai" | "anthropic" | "xml-tools",
  anthropicApiPath?: string
): string[] {
  return protocol === "anthropic"
    ? buildAnthropicMessagesUrlCandidates(apiUrl, anthropicApiPath)
    : buildChatCompletionsUrlCandidates(apiUrl);
}

// ─── Error reading ───────────────────────────────────────────────────────────

export async function readErrorMessage(response: Response): Promise<string> {
  const contentType = response.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("application/json")) {
      const json = await response.json();
      const msg = json?.error?.message ?? json?.message;
      if (typeof msg === "string" && msg.trim()) return msg.trim();
      return JSON.stringify(json);
    }
  } catch { /* ignore */ }
  try {
    const text = await response.text();
    if (text.trim()) return text.trim();
  } catch { /* ignore */ }
  return `HTTP ${response.status}`;
}

// ─── JSON extraction ─────────────────────────────────────────────────────────

export function extractJsonFromResponse(response: string): string | null {
  const trimmed = response.trim();
  if ((trimmed.startsWith("[") && trimmed.endsWith("]")) ||
      (trimmed.startsWith("{") && trimmed.endsWith("}"))) {
    return trimmed;
  }
  const arrMatch = trimmed.match(/\[[\s\S]*\]/);
  if (arrMatch) return arrMatch[0];
  const objMatch = trimmed.match(/\{[\s\S]*\}/);
  if (objMatch) return objMatch[0];
  return null;
}
