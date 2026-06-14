/**
 * Model-emitted tool call protocol adapter.
 *
 * Some OpenAI-compatible models emit tool calls as plain text instead of native
 * `tool_calls`. This module normalizes those dialects into one internal shape
 * and separates protocol markup from user-visible text.
 */

export interface ToolCallInfo {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export type ToolProtocolExtraction = {
  visibleText: string;
  toolCalls: ToolCallInfo[];
  hasMarkup: boolean;
};

const TOOL_TAGS = [
  "function_calls",
  "tool_calls",
  "tool_call",
  "invoke",
  "parameter",
] as const;

const TOOL_TAG_PATTERN = "(?:function_calls|tool_calls|tool_call|invoke|parameter)";
const DSML_PREFIX = "(?:[｜|]{1,4}\\s*DSML\\s*[｜|]{1,4}:?\\s*)";
const OPTIONAL_DSML_PREFIX = `(?:${DSML_PREFIX})?`;

const TOOL_MARKUP_RE = new RegExp(
  `<\\s*\\/?\\s*${OPTIONAL_DSML_PREFIX}${TOOL_TAG_PATTERN}\\b`,
  "i"
);
const TOOL_FRAGMENT_RE = new RegExp(
  `<\\s*\\/?\\s*(?:${DSML_PREFIX}|${TOOL_TAG_PATTERN}\\b)`,
  "i"
);
const DSML_MARKUP_RE = new RegExp(
  `<\\s*\\/?\\s*${DSML_PREFIX}${TOOL_TAG_PATTERN}\\b`,
  "i"
);
const TOOL_TAG_NORMALIZE_RE = new RegExp(
  `<\\s*(/?)\\s*${OPTIONAL_DSML_PREFIX}(${TOOL_TAG_PATTERN})(\\b[^>]*)>`,
  "gi"
);
const TOOL_FRAGMENT_LINE_RE = new RegExp(
  `^.*<\\s*\\/?\\s*(?:${DSML_PREFIX}|${TOOL_TAG_PATTERN}\\b).*$`,
  "gim"
);
const STRING_ATTR_RE = /^\s*string\s*=\s*(?:"(?:true|false)"|'(?:true|false)'|(?:true|false))\s*$/gim;
const XML_ENTITY_RE = /&(amp|lt|gt|quot|apos);/g;

export function normalizeToolMarkupTags(input: string): string {
  if (!input) return "";
  return input.replace(TOOL_TAG_NORMALIZE_RE, (_match, closing: string, tag: string, rest: string) => {
    const suffix = rest.endsWith("/") ? `${rest.slice(0, -1).trimEnd()} /` : rest;
    return `<${closing}${tag.toLowerCase()}${suffix}>`;
  });
}

export function hasToolProtocolMarkup(input: string): boolean {
  return TOOL_MARKUP_RE.test(input) || TOOL_FRAGMENT_RE.test(input);
}

export function hasDsmlToolCalls(input: string): boolean {
  return DSML_MARKUP_RE.test(input) || /<\s*\/?\s*(?:function_calls|tool_calls|invoke|parameter)\b/i.test(input);
}

export function hasXmlToolCalls(input: string): boolean {
  return /<\s*\/?\s*(?:[｜|]{1,4}\s*DSML\s*[｜|]{1,4}:?\s*)?tool_call\b/i.test(input);
}

function decodeXmlEntities(value: string): string {
  return value.replace(XML_ENTITY_RE, (_match, entity: string) => {
    switch (entity) {
      case "amp": return "&";
      case "lt": return "<";
      case "gt": return ">";
      case "quot": return "\"";
      case "apos": return "'";
      default: return _match;
    }
  });
}

function getXmlAttr(attrs: string, name: string): string {
  const attrRegex = new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s>]+))`, "i");
  const match = attrs.match(attrRegex);
  return decodeXmlEntities((match?.[1] ?? match?.[2] ?? match?.[3] ?? "").trim());
}

function coerceProtocolValue(rawValue: string, keepString: boolean): any {
  const value = decodeXmlEntities(rawValue.trim());
  if (keepString || value === "") return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function parseJsonToolPayload(payload: any): { name: string; args: Record<string, any> } | null {
  if (!payload || typeof payload !== "object") return null;
  const name = payload.name || payload.function?.name || payload.tool || payload.tool_name || "";
  if (typeof name !== "string" || !name.trim()) return null;

  let args = payload.arguments ?? payload.parameters ?? payload.input ?? payload.args ?? {};
  if (typeof args === "string") {
    try {
      args = JSON.parse(args);
    } catch {
      args = { input: args };
    }
  }
  if (!args || typeof args !== "object" || Array.isArray(args)) {
    args = { input: args };
  }
  return { name: name.trim(), args };
}

function pushToolCall(toolCalls: ToolCallInfo[], name: string, args: Record<string, any>, prefix: string): void {
  const trimmedName = name.trim();
  if (!trimmedName) return;
  toolCalls.push({
    id: `${prefix}_${toolCalls.length}`,
    type: "function",
    function: {
      name: trimmedName,
      arguments: JSON.stringify(args ?? {}),
    },
  });
}

export function parseXmlToolCalls(input: string): ToolCallInfo[] {
  const normalized = normalizeToolMarkupTags(input);
  const toolCalls: ToolCallInfo[] = [];

  const blockRegex = /<tool_call\b([^>]*)>([\s\S]*?)<\/tool_call>/gi;
  let match: RegExpExecArray | null;
  while ((match = blockRegex.exec(normalized)) !== null) {
    const attrs = match[1] || "";
    const nameAttr = getXmlAttr(attrs, "name");
    const innerContent = decodeXmlEntities(match[2].trim());

    let parsed = false;
    if (innerContent.startsWith("{") || innerContent.startsWith("[")) {
      try {
        const json = JSON.parse(innerContent);
        const payloads = Array.isArray(json) ? json : [json];
        for (const payload of payloads) {
          const parsedPayload = parseJsonToolPayload(payload);
          if (parsedPayload) {
            pushToolCall(toolCalls, parsedPayload.name, parsedPayload.args, "xml_tool_call");
            parsed = true;
          }
        }
      } catch {
        // Fall through to the name-attribute and arg_key forms.
      }
    }

    if (!parsed && innerContent.includes("<arg_key>")) {
      const argKeyIndex = innerContent.indexOf("<arg_key>");
      const toolName = nameAttr || innerContent.substring(0, argKeyIndex).trim();
      const args: Record<string, any> = {};
      const argPairRegex = /<arg_key>([\s\S]*?)<\/arg_key>\s*<arg_value>([\s\S]*?)<\/arg_value>/gi;
      let argMatch: RegExpExecArray | null;
      while ((argMatch = argPairRegex.exec(innerContent)) !== null) {
        const key = decodeXmlEntities(argMatch[1].trim());
        if (!key) continue;
        args[key] = coerceProtocolValue(argMatch[2], false);
      }
      pushToolCall(toolCalls, toolName, args, "xml_tool_call");
      parsed = true;
    }

    if (!parsed && nameAttr) {
      let args: Record<string, any> = {};
      if (innerContent) {
        if (innerContent.startsWith("{")) {
          try {
            args = JSON.parse(innerContent);
          } catch {
            args = { input: innerContent };
          }
        } else {
          args = { input: innerContent };
        }
      }
      pushToolCall(toolCalls, nameAttr, args, "xml_tool_call");
      parsed = true;
    }

    if (!parsed && innerContent) {
      const [toolName, ...rest] = innerContent.split(/\s+/);
      pushToolCall(toolCalls, toolName, rest.length ? { input: rest.join(" ") } : {}, "xml_tool_call");
    }
  }

  const selfClosingRegex = /<tool_call\b([^>]*)\/>/gi;
  while ((match = selfClosingRegex.exec(normalized)) !== null) {
    const name = getXmlAttr(match[1] || "", "name");
    pushToolCall(toolCalls, name, {}, "xml_tool_call");
  }

  return dedupeToolCalls(toolCalls);
}

export function parseDsmlToolCalls(input: string): ToolCallInfo[] {
  const normalized = normalizeToolMarkupTags(input);
  const toolCalls: ToolCallInfo[] = [];

  const invokeRegex = /<invoke\b([^>]*)>([\s\S]*?)<\/invoke>/gi;
  let match: RegExpExecArray | null;
  while ((match = invokeRegex.exec(normalized)) !== null) {
    const toolName = getXmlAttr(match[1] || "", "name");
    if (!toolName) continue;

    const invokeContent = match[2] || "";
    const args: Record<string, any> = {};
    const paramRegex = /<parameter\b([^>]*)>([\s\S]*?)<\/parameter>/gi;
    let paramMatch: RegExpExecArray | null;

    while ((paramMatch = paramRegex.exec(invokeContent)) !== null) {
      const attrs = paramMatch[1] || "";
      const paramName = getXmlAttr(attrs, "name");
      if (!paramName) continue;
      const keepString = getXmlAttr(attrs, "string").toLowerCase() === "true";
      args[paramName] = coerceProtocolValue(paramMatch[2], keepString);
    }

    if (Object.keys(args).length === 0) {
      const trimmed = decodeXmlEntities(invokeContent.trim());
      if (trimmed.startsWith("{")) {
        try {
          Object.assign(args, JSON.parse(trimmed));
        } catch {
          args.input = trimmed;
        }
      } else if (trimmed) {
        args.input = trimmed;
      }
    }

    pushToolCall(toolCalls, toolName, args, "dsml_tool_call");
  }

  const selfClosingInvokeRegex = /<invoke\b([^>]*)\/>/gi;
  while ((match = selfClosingInvokeRegex.exec(normalized)) !== null) {
    const toolName = getXmlAttr(match[1] || "", "name");
    pushToolCall(toolCalls, toolName, {}, "dsml_tool_call");
  }

  return dedupeToolCalls(toolCalls);
}

export function stripXmlToolCalls(input: string): string {
  return sanitizeToolProtocolText(input, { removeOnly: "xml" });
}

export function stripDsmlToolCalls(input: string): string {
  return sanitizeToolProtocolText(input, { removeOnly: "dsml" });
}

type SanitizeOptions = {
  removeOnly?: "xml" | "dsml" | "all";
};

export function sanitizeToolProtocolText(input: string, options: SanitizeOptions = {}): string {
  if (!input) return "";
  const mode = options.removeOnly ?? "all";
  let cleaned = normalizeToolMarkupTags(input);

  if (mode === "all" || mode === "dsml") {
    cleaned = cleaned.replace(/<(?:function_calls|tool_calls)\b[^>]*>[\s\S]*?<\/(?:function_calls|tool_calls)>/gi, "");
    cleaned = cleaned.replace(/<invoke\b[^>]*>[\s\S]*?<\/invoke>/gi, "");
    cleaned = cleaned.replace(/<parameter\b[^>]*>[\s\S]*?<\/parameter>/gi, "");
  }

  if (mode === "all" || mode === "xml") {
    cleaned = cleaned.replace(/<tool_call\b[^>]*>[\s\S]*?<\/tool_call>/gi, "");
  }

  cleaned = cleaned.replace(/<(?:function_calls|tool_calls|tool_call|invoke|parameter)\b[^>]*\/>/gi, "");
  cleaned = cleaned.replace(/<\/?(?:function_calls|tool_calls|tool_call|invoke|parameter)\b[^>]*>/gi, "");
  cleaned = cleaned.replace(TOOL_FRAGMENT_LINE_RE, "");
  cleaned = cleaned.replace(STRING_ATTR_RE, "");
  return cleaned.trim();
}

export function extractToolProtocol(input: string): ToolProtocolExtraction {
  const hasMarkup = hasToolProtocolMarkup(input);
  const xmlToolCalls = parseXmlToolCalls(input);
  const dsmlToolCalls = parseDsmlToolCalls(input);
  return {
    visibleText: hasMarkup ? sanitizeToolProtocolText(input) : input,
    toolCalls: dedupeToolCalls([...xmlToolCalls, ...dsmlToolCalls]),
    hasMarkup,
  };
}

export function dedupeToolCalls(toolCalls: ToolCallInfo[]): ToolCallInfo[] {
  const seen = new Set<string>();
  const result: ToolCallInfo[] = [];
  for (const toolCall of toolCalls) {
    const key = `${toolCall.function.name}:${toolCall.function.arguments}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(toolCall);
  }
  return result;
}

export function findFirstToolProtocolStart(input: string): number {
  const match = input.match(TOOL_MARKUP_RE);
  return match?.index ?? -1;
}

function isPotentialToolTagPrefix(tail: string): boolean {
  let normalized = tail.toLowerCase().replace(/｜/g, "|").replace(/\s+/g, "");
  if (!normalized.startsWith("<")) return false;
  normalized = normalized.slice(1);
  if (normalized.startsWith("/")) normalized = normalized.slice(1);
  if (!normalized) return true;

  if (TOOL_TAGS.some((tag) => tag.startsWith(normalized))) return true;

  if (!normalized.startsWith("|")) return false;
  const withoutLeadingBars = normalized.replace(/^\|+/, "");
  if (!withoutLeadingBars) return true;
  if ("dsml".startsWith(withoutLeadingBars)) return true;

  const dsmlMatch = withoutLeadingBars.match(/^dsml\|*:?(.*)$/);
  if (!dsmlMatch) return false;
  const tagPart = dsmlMatch[1].replace(/^:/, "");
  return !tagPart || TOOL_TAGS.some((tag) => tag.startsWith(tagPart));
}

export function getTrailingToolProtocolPrefixLength(input: string): number {
  const start = Math.max(0, input.length - 128);
  for (let i = input.length - 1; i >= start; i--) {
    if (input[i] !== "<") continue;
    const tail = input.slice(i);
    if (tail.includes(">")) continue;
    if (isPotentialToolTagPrefix(tail)) return input.length - i;
  }
  return 0;
}

export function createToolProtocolStream() {
  let raw = "";
  let emittedVisibleEnd = 0;
  let protocolStart: number | null = null;

  return {
    append(delta: string): string {
      if (!delta) return "";
      raw += delta;
      if (protocolStart === null) {
        const found = findFirstToolProtocolStart(raw);
        if (found >= 0) protocolStart = found;
      }

      const visibleLimit = protocolStart ?? raw.length;
      const held = protocolStart === null ? getTrailingToolProtocolPrefixLength(raw) : 0;
      const safeEnd = Math.max(emittedVisibleEnd, visibleLimit - held);
      if (safeEnd <= emittedVisibleEnd) return "";

      const visibleDelta = raw.slice(emittedVisibleEnd, safeEnd);
      emittedVisibleEnd = safeEnd;
      return visibleDelta;
    },

    reset(): void {
      raw = "";
      emittedVisibleEnd = 0;
      protocolStart = null;
    },
  };
}
