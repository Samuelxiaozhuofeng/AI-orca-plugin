import type { OpenAITool } from "./openai-client";
import type { ToolCallInfo } from "./tool-call-protocol";

type ToolNameLike = Pick<OpenAITool, "function">;

export type ToolCallNameResolution =
  | {
      status: "ok";
      toolCall: ToolCallInfo;
      originalName: string;
      resolvedName: string;
      availableToolNames: string[];
    }
  | {
      status: "renamed";
      toolCall: ToolCallInfo;
      originalName: string;
      resolvedName: string;
      availableToolNames: string[];
      reason: string;
    }
  | {
      status: "invalid";
      toolCall: ToolCallInfo;
      originalName: string;
      availableToolNames: string[];
      message: string;
    };

function safeToolName(tool: ToolNameLike): string {
  return typeof tool?.function?.name === "string" ? tool.function.name.trim() : "";
}

export function getAvailableToolNames(tools: ToolNameLike[] | undefined): string[] {
  return (tools || [])
    .map(safeToolName)
    .filter(Boolean);
}

export function normalizeToolNameForMatch(name: string): string {
  return String(name || "")
    .trim()
    .toLowerCase()
    .replace(/[\s.-]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function singularizeToken(token: string): string {
  if (token.length > 4 && token.endsWith("ies")) return `${token.slice(0, -3)}y`;
  if (token.length > 3 && token.endsWith("s") && !token.endsWith("ss")) return token.slice(0, -1);
  return token;
}

function singularizedFingerprint(name: string): string {
  return normalizeToolNameForMatch(name)
    .split("_")
    .filter(Boolean)
    .map(singularizeToken)
    .join("_");
}

function getMcpOriginalToolName(name: string): string | null {
  const normalized = name.trim();
  if (!normalized.toLowerCase().startsWith("mcp__")) return null;
  const rest = normalized.slice(5);
  const sep = rest.indexOf("__");
  if (sep < 0) return null;
  const original = rest.slice(sep + 2).trim();
  return original || null;
}

function uniqueCandidate(
  requested: string,
  candidates: string[],
  getComparable: (name: string) => string,
): string | null {
  const target = getComparable(requested);
  if (!target) return null;
  const matches = candidates.filter((name) => getComparable(name) === target);
  return matches.length === 1 ? matches[0] : null;
}

function uniqueMcpOriginalCandidate(
  requested: string,
  candidates: string[],
  singularized: boolean,
): string | null {
  const target = singularized
    ? singularizedFingerprint(requested)
    : normalizeToolNameForMatch(requested);
  if (!target) return null;

  const matches = candidates.filter((name) => {
    const original = getMcpOriginalToolName(name);
    if (!original) return false;
    return (singularized ? singularizedFingerprint(original) : normalizeToolNameForMatch(original)) === target;
  });

  return matches.length === 1 ? matches[0] : null;
}

function levenshteinDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;

  const prev = Array.from({ length: b.length + 1 }, (_v, i) => i);
  const curr = Array.from({ length: b.length + 1 }, () => 0);

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1,
        prev[j] + 1,
        prev[j - 1] + cost,
      );
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j];
  }

  return prev[b.length];
}

function uniqueNearCandidate(requested: string, candidates: string[]): string | null {
  const target = normalizeToolNameForMatch(requested);
  if (target.length < 6) return null;

  const fullMatches = candidates.filter((name) => {
    const candidate = normalizeToolNameForMatch(name);
    return Math.abs(candidate.length - target.length) <= 1
      && levenshteinDistance(target, candidate) <= 1;
  });
  if (fullMatches.length === 1) return fullMatches[0];

  const originalMatches = candidates.filter((name) => {
    const original = getMcpOriginalToolName(name);
    if (!original) return false;
    const candidate = normalizeToolNameForMatch(original);
    return Math.abs(candidate.length - target.length) <= 1
      && levenshteinDistance(target, candidate) <= 1;
  });
  return originalMatches.length === 1 ? originalMatches[0] : null;
}

function cloneToolCallWithName(toolCall: ToolCallInfo, name: string): ToolCallInfo {
  return {
    ...toolCall,
    function: {
      ...toolCall.function,
      name,
    },
  };
}

function buildUnknownToolMessage(originalName: string, availableToolNames: string[]): string {
  const listed = availableToolNames.slice(0, 80).join(", ");
  const suffix = availableToolNames.length > 80
    ? `, ...(${availableToolNames.length - 80} more)`
    : "";
  return [
    `Error: Unknown tool "${originalName}".`,
    "Use exactly one of the available tool names; do not invent, pluralize, translate, or rename MCP tools.",
    listed ? `Available tool names: ${listed}${suffix}` : "No tools are available in this turn.",
  ].join("\n");
}

export function resolveToolCallName(
  toolCall: ToolCallInfo,
  availableTools: ToolNameLike[] | undefined,
): ToolCallNameResolution {
  const availableToolNames = getAvailableToolNames(availableTools);
  const originalName = String(toolCall?.function?.name || "").trim();

  if (!originalName) {
    return {
      status: "invalid",
      toolCall,
      originalName,
      availableToolNames,
      message: buildUnknownToolMessage("(empty)", availableToolNames),
    };
  }

  const exact = availableToolNames.find((name) => name === originalName);
  if (exact) {
    return {
      status: "ok",
      toolCall: exact === toolCall.function.name ? toolCall : cloneToolCallWithName(toolCall, exact),
      originalName,
      resolvedName: exact,
      availableToolNames,
    };
  }

  const caseInsensitive = availableToolNames.filter((name) => name.toLowerCase() === originalName.toLowerCase());
  if (caseInsensitive.length === 1) {
    return {
      status: "renamed",
      toolCall: cloneToolCallWithName(toolCall, caseInsensitive[0]),
      originalName,
      resolvedName: caseInsensitive[0],
      availableToolNames,
      reason: "case-insensitive match",
    };
  }

  const normalized = uniqueCandidate(originalName, availableToolNames, normalizeToolNameForMatch);
  if (normalized) {
    return {
      status: "renamed",
      toolCall: cloneToolCallWithName(toolCall, normalized),
      originalName,
      resolvedName: normalized,
      availableToolNames,
      reason: "normalized separator match",
    };
  }

  const singularized = uniqueCandidate(originalName, availableToolNames, singularizedFingerprint);
  if (singularized) {
    return {
      status: "renamed",
      toolCall: cloneToolCallWithName(toolCall, singularized),
      originalName,
      resolvedName: singularized,
      availableToolNames,
      reason: "singular/plural match",
    };
  }

  const originalMcp = uniqueMcpOriginalCandidate(originalName, availableToolNames, false)
    || uniqueMcpOriginalCandidate(originalName, availableToolNames, true);
  if (originalMcp) {
    return {
      status: "renamed",
      toolCall: cloneToolCallWithName(toolCall, originalMcp),
      originalName,
      resolvedName: originalMcp,
      availableToolNames,
      reason: "unique MCP original-name match",
    };
  }

  const near = uniqueNearCandidate(originalName, availableToolNames);
  if (near) {
    return {
      status: "renamed",
      toolCall: cloneToolCallWithName(toolCall, near),
      originalName,
      resolvedName: near,
      availableToolNames,
      reason: "single-character typo match",
    };
  }

  return {
    status: "invalid",
    toolCall,
    originalName,
    availableToolNames,
    message: buildUnknownToolMessage(originalName, availableToolNames),
  };
}

function stableStringify(value: any): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    const keys = Object.keys(value).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function normalizeToolArgumentsForMatch(args: string): string {
  const raw = String(args || "").trim();
  if (!raw) return "";
  try {
    return stableStringify(JSON.parse(raw));
  } catch {
    return raw.replace(/\s+/g, " ");
  }
}

export function createToolCallSignature(toolCall: ToolCallInfo): string {
  return `${normalizeToolNameForMatch(toolCall.function.name)}:${normalizeToolArgumentsForMatch(toolCall.function.arguments)}`;
}

export function createSyntheticToolErrorMessage(
  toolCall: ToolCallInfo,
  content: string,
  createdAt = Date.now(),
): {
  id: string;
  role: "tool";
  content: string;
  tool_call_id: string;
  name: string;
  createdAt: number;
} {
  return {
    id: `tool_error_${toolCall.id || "unknown"}_${createdAt}`,
    role: "tool",
    content,
    tool_call_id: toolCall.id,
    name: toolCall.function.name,
    createdAt,
  };
}
