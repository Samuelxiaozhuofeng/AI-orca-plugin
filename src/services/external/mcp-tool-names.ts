const MCP_TOOL_PREFIX = "mcp__";
const MAX_OPENAI_TOOL_NAME_LENGTH = 64;
const TOOL_HASH_LENGTH = 8;
const SERVER_HASH_LENGTH = 6;
const MIN_TOOL_NAME_PART_LENGTH = 4;

function hashString(input: string): string {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

export function sanitizeMcpIdentifier(id: string): string {
  const sanitized = String(id ?? "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
  return sanitized || "tool";
}

export function buildMcpServerNamespace(serverId: string): string {
  const raw = String(serverId ?? "").trim();
  const safe = sanitizeMcpIdentifier(raw);
  const maxServerLength =
    MAX_OPENAI_TOOL_NAME_LENGTH
    - MCP_TOOL_PREFIX.length
    - "__".length
    - MIN_TOOL_NAME_PART_LENGTH
    - "_".length
    - TOOL_HASH_LENGTH;

  if (safe === raw && safe.length <= maxServerLength) {
    return safe;
  }

  const hash = hashString(raw || safe).slice(0, SERVER_HASH_LENGTH);
  const budget = Math.max(1, maxServerLength - hash.length - 1);
  return `${safe.slice(0, budget)}_${hash}`;
}

export function buildMcpOpenAIName(
  serverId: string,
  originalName: string,
  usedNames: Set<string>,
): string {
  const serverNamespace = buildMcpServerNamespace(serverId);
  const safeToolName = sanitizeMcpIdentifier(originalName);
  const hash = hashString(`${serverId}:${originalName}`).slice(0, TOOL_HASH_LENGTH);
  const prefix = `${MCP_TOOL_PREFIX}${serverNamespace}__`;
  const suffix = `_${hash}`;
  const budget = Math.max(
    MIN_TOOL_NAME_PART_LENGTH,
    MAX_OPENAI_TOOL_NAME_LENGTH - prefix.length - suffix.length,
  );
  let candidate = `${prefix}${safeToolName.slice(0, budget)}${suffix}`;

  let counter = 2;
  while (usedNames.has(candidate)) {
    const counterSuffix = `${suffix}_${counter}`;
    const counterBudget = Math.max(
      1,
      MAX_OPENAI_TOOL_NAME_LENGTH - prefix.length - counterSuffix.length,
    );
    candidate = `${prefix}${safeToolName.slice(0, counterBudget)}${counterSuffix}`;
    counter++;
  }

  usedNames.add(candidate);
  return candidate;
}

export function parseMcpOpenAIName(openaiName: string): { serverNamespace: string; toolPart: string } | null {
  if (!openaiName.startsWith(MCP_TOOL_PREFIX)) return null;
  const rest = openaiName.slice(MCP_TOOL_PREFIX.length);
  const sepIndex = rest.indexOf("__");
  if (sepIndex === -1) return null;
  return {
    serverNamespace: rest.slice(0, sepIndex),
    toolPart: rest.slice(sepIndex + 2),
  };
}

export function isMcpToolNameForServer(openaiName: string, serverId: string): boolean {
  const parsed = parseMcpOpenAIName(openaiName);
  return parsed?.serverNamespace === buildMcpServerNamespace(serverId);
}

export function isExternalMcpToolName(toolName: string): boolean {
  return toolName.startsWith(MCP_TOOL_PREFIX);
}
