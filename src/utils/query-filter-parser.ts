import { PropType, type QueryOperatorString, type QueryPropertyFilterInput } from "./query-types";

function isQueryOperatorString(value: string): value is QueryOperatorString {
  return (
    value === ">=" ||
    value === ">" ||
    value === "<=" ||
    value === "<" ||
    value === "==" ||
    value === "!=" ||
    value === "is null" ||
    value === "not null" ||
    value === "includes" ||
    value === "not includes"
  );
}

function stripOuterQuotes(value: string): { text: string; wasQuoted: boolean } {
  const trimmed = value.trim();
  if (trimmed.length < 2) return { text: trimmed, wasQuoted: false };

  const first = trimmed[0];
  const last = trimmed[trimmed.length - 1];
  const isQuote = (c: string) => c === "'" || c === "\"" || c === "`";
  if (!isQuote(first) || first !== last) return { text: trimmed, wasQuoted: false };

  return { text: trimmed.slice(1, -1), wasQuoted: true };
}

function tryParseNumber(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^-?\d+(?:\.\d+)?$/.test(trimmed)) return null;
  const num = Number(trimmed);
  return Number.isFinite(num) ? num : null;
}

function tryInferTypedValue(rawValue: string): { value: any; type?: number } {
  const { text, wasQuoted } = stripOuterQuotes(rawValue);
  if (wasQuoted) return { value: text };

  const lowered = text.trim().toLowerCase();
  if (lowered === "null") return { value: null };
  if (lowered === "true") return { value: true, type: PropType.Boolean };
  if (lowered === "false") return { value: false, type: PropType.Boolean };

  const num = tryParseNumber(text);
  if (num !== null) return { value: num, type: PropType.Number };

  return { value: text.trim() };
}

function splitFilters(input: string): string[] {
  const out: string[] = [];
  let buf = "";
  let quote: "'" | "\"" | "`" | null = null;

  const flush = () => {
    const item = buf.trim();
    if (item) out.push(item);
    buf = "";
  };

  const isBoundary = (ch: string | undefined) => !ch || /\s|[(),;，；]/.test(ch);

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];

    if (quote) {
      buf += ch;
      if (ch === quote) quote = null;
      continue;
    }

    if (ch === "'" || ch === "\"" || ch === "`") {
      quote = ch;
      buf += ch;
      continue;
    }

    if (ch === "," || ch === "，" || ch === ";" || ch === "；") {
      flush();
      continue;
    }

    if (ch === "&" && input[i + 1] === "&") {
      flush();
      i += 1;
      continue;
    }

    const maybeAnd = input.slice(i, i + 3);
    if (maybeAnd.toLowerCase() === "and" && isBoundary(input[i - 1]) && isBoundary(input[i + 3])) {
      flush();
      i += 2;
      continue;
    }

    if (input.slice(i, i + 2) === "并且") {
      flush();
      i += 1;
      continue;
    }

    if (ch === "且") {
      flush();
      continue;
    }

    buf += ch;
  }

  flush();
  return out;
}

function parseSingleFilter(expr: string): QueryPropertyFilterInput | null {
  const trimmed = String(expr ?? "").trim();
  if (!trimmed) return null;

  const normalized = trimmed.replace(/\s+/g, " ").trim();

  const nullMatch = normalized.match(/^(.+?)\s+(is null|not null)$/i);
  if (nullMatch) {
    const name = nullMatch[1].trim();
    const opRaw = nullMatch[2].toLowerCase();
    if (!name || !isQueryOperatorString(opRaw)) return null;
    return { name, op: opRaw };
  }

  const includesMatch = normalized.match(/^(.+?)\s+(includes|not includes|contains|not contains)\s+(.+)$/i);
  if (includesMatch) {
    const name = includesMatch[1].trim();
    let opRaw = includesMatch[2].toLowerCase();
    if (opRaw === "contains") opRaw = "includes";
    if (opRaw === "not contains") opRaw = "not includes";
    const rawValue = includesMatch[3];
    if (!name || !isQueryOperatorString(opRaw)) return null;

    const inferred = tryInferTypedValue(rawValue);
    return { name, op: opRaw, value: inferred.value, type: inferred.type };
  }

  const compareMatch = normalized.match(/^(.+?)\s*(==|!=|>=|<=|>|<|=|:)\s*(.+)$/);
  if (compareMatch) {
    const name = compareMatch[1].trim();
    let opRaw = compareMatch[2];
    if (opRaw === "=" || opRaw === ":") opRaw = "==";
    const rawValue = compareMatch[3];
    if (!name || !isQueryOperatorString(opRaw)) return null;

    const inferred = tryInferTypedValue(rawValue);
    return { name, op: opRaw as QueryOperatorString, value: inferred.value, type: inferred.type };
  }

  return null;
}

export function parsePropertyFilters(input: unknown): QueryPropertyFilterInput[] {
  if (!input) return [];

  if (Array.isArray(input)) {
    return input
      .map((item) => {
        if (!item) return null;
        if (typeof item === "string") return parseSingleFilter(item);
        if (typeof item === "object" && typeof (item as any).name === "string" && (item as any).op) {
          return item as QueryPropertyFilterInput;
        }
        return null;
      })
      .filter(Boolean) as QueryPropertyFilterInput[];
  }

  if (typeof input === "object" && typeof (input as any).name === "string" && (input as any).op) {
    return [input as QueryPropertyFilterInput];
  }

  if (typeof input !== "string") return [];

  const parts = splitFilters(input);
  return parts.map(parseSingleFilter).filter(Boolean) as QueryPropertyFilterInput[];
}

