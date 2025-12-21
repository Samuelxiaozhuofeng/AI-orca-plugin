import type {
  QueryDescription2,
  QueryGroup2,
  QuerySort,
  QueryTag2,
  QueryTagProperty,
  QueryJournalDate,
  QueryTask,
  QueryJournal2,
  QueryText2,
  QueryRef2,
  QueryBlock2,
  QueryBlockMatch2,
  QueryItem2,
} from "../orca";
import { convertValue, mapOperator, tryConvertValueFromOperator } from "./query-converters";
import { PropType } from "./query-types";
import type {
  QueryBlocksByTagOptions,
  QueryPropertyFilterInput,
  QuerySortInput,
  QueryDateSpec,
  TaskQueryOptions,
  JournalQueryOptions,
  AdvancedQueryOptions,
  QueryCondition,
  QueryCombineMode,
} from "./query-types";

type BuildQueryInput = {
  tagName: string;
} & QueryBlocksByTagOptions;

function normalizeSortItem(input: QuerySortInput): QuerySort | null {
  if (!input) return null;

  if (typeof input === "string") {
    const field = input.trim();
    if (!field) return null;
    return [field, "DESC"];
  }

  if (Array.isArray(input)) {
    const [field, dir] = input;
    if (!field) return null;
    if (dir !== "ASC" && dir !== "DESC") return null;
    return [field, dir];
  }

  const field = String(input.field ?? "").trim();
  if (!field) return null;
  const dir = input.direction === "ASC" || input.direction === "DESC" ? input.direction : "DESC";
  return [field, dir];
}

function normalizeSort(sort: QueryBlocksByTagOptions["sort"]): QuerySort[] | undefined {
  if (!sort) return undefined;

  if (Array.isArray(sort)) {
    if (sort.length === 2 && typeof sort[0] === "string" && (sort[1] === "ASC" || sort[1] === "DESC")) {
      const item = normalizeSortItem(sort as any);
      return item ? [item] : undefined;
    }

    const items = sort.map((s) => normalizeSortItem(s as any)).filter(Boolean) as QuerySort[];
    return items.length ? items : undefined;
  }

  const item = normalizeSortItem(sort as any);
  return item ? [item] : undefined;
}

function toQueryTagProperty(input: QueryPropertyFilterInput): QueryTagProperty {
  const operatorCode = mapOperator(input.op);
  const out: QueryTagProperty = {
    name: input.name,
    type: input.type,
    typeArgs: input.typeArgs,
    op: operatorCode as any,
  };

  if (operatorCode === 11 || operatorCode === 12) {
    return out;
  }

  const rawValue = input.value;
  const converted = input.type !== undefined
    ? convertValue(rawValue, input.type)
    : tryConvertValueFromOperator(rawValue, operatorCode);

  if (out.type === undefined && (operatorCode === 7 || operatorCode === 8 || operatorCode === 9 || operatorCode === 10)) {
    if (typeof converted === "number") out.type = PropType.Number;
  }

  if (converted !== undefined) out.value = converted;
  return out;
}

export function buildQueryDescription(input: BuildQueryInput): QueryDescription2 {
  const tagName = String(input.tagName ?? "").trim();
  if (!tagName) {
    throw new Error("tagName is required");
  }

  const properties = Array.isArray(input.properties) && input.properties.length
    ? input.properties.filter((p) => p && typeof p.name === "string" && p.name.trim()).map(toQueryTagProperty)
    : undefined;

  const tagQuery: QueryTag2 = {
    kind: 4,
    name: tagName,
    properties,
  };

  const group: QueryGroup2 = {
    kind: 100,
    conditions: [tagQuery as any],
  };

  const sort = normalizeSort(input.sort);
  const page = typeof input.page === "number" && Number.isFinite(input.page) ? input.page : undefined;
  const pageSizeFromInput =
    typeof input.pageSize === "number" && Number.isFinite(input.pageSize) ? input.pageSize : undefined;
  const maxResults =
    typeof input.maxResults === "number" && Number.isFinite(input.maxResults) ? input.maxResults : undefined;
  const pageSize = pageSizeFromInput ?? maxResults;

  const description: QueryDescription2 = {
    q: group,
    sort,
    page,
    pageSize,
  };

  return description;
}

// ============================================================================
// Advanced Query Builders
// ============================================================================

/**
 * Convert QueryDateSpec to QueryJournalDate format used by Orca backend
 */
export function toQueryJournalDate(spec: QueryDateSpec): QueryJournalDate {
  if (spec.type === "absolute") {
    return { t: 2, v: spec.value };
  }
  // Relative date
  return {
    t: 1,
    v: spec.value,
    u: spec.unit ?? "d",
  };
}

/**
 * Map combine mode string to QueryGroup2 kind value
 */
function mapCombineMode(mode: QueryCombineMode): 100 | 101 | 106 {
  switch (mode) {
    case "and": return 100;    // SELF_AND
    case "or": return 101;     // SELF_OR
    case "chain_and": return 106;  // CHAIN_AND
    default: return 100;
  }
}

/**
 * Convert a QueryCondition to the corresponding QueryItem2
 */
export function conditionToQueryItem(condition: QueryCondition): QueryItem2 {
  switch (condition.type) {
    case "tag": {
      const properties = condition.properties?.length
        ? condition.properties.map(toQueryTagProperty)
        : undefined;
      return {
        kind: 4,
        name: condition.name,
        properties,
      } as QueryTag2;
    }

    case "text":
      return {
        kind: 8,
        text: condition.text,
        raw: condition.raw,
      } as QueryText2;

    case "task":
      return {
        kind: 11,
        completed: condition.completed,
      } as QueryTask;

    case "journal":
      return {
        kind: 3,
        start: toQueryJournalDate(condition.start),
        end: toQueryJournalDate(condition.end),
      } as QueryJournal2;

    case "ref":
      return {
        kind: 6,
        blockId: condition.blockId,
      } as QueryRef2;

    case "block":
      return {
        kind: 9,
        hasTags: condition.hasTags,
        hasParent: condition.hasParent,
        hasChild: condition.hasChild,
        hasAliases: condition.hasAliases,
      } as QueryBlock2;

    case "blockMatch":
      return {
        kind: 12,
        blockId: condition.blockId,
      } as QueryBlockMatch2;

    default:
      throw new Error(`Unknown condition type: ${(condition as any).type}`);
  }
}

/**
 * Build a task search query
 */
export function buildTaskQuery(options: TaskQueryOptions = {}): QueryDescription2 {
  const conditions: QueryItem2[] = [];

  // Add task condition
  const taskQuery: QueryTask = {
    kind: 11,
    completed: options.completed,
  };
  conditions.push(taskQuery);

  // Add date range if specified (using CHAIN_AND for ancestor matching)
  if (options.dateRange) {
    const journalQuery: QueryJournal2 = {
      kind: 3,
      start: toQueryJournalDate(options.dateRange.start),
      end: toQueryJournalDate(options.dateRange.end),
    };
    // Wrap in CHAIN_AND to match tasks inside journal entries
    const chainGroup: QueryGroup2 = {
      kind: 106,
      conditions: [journalQuery],
    };
    conditions.push(chainGroup);
  }

  const group: QueryGroup2 = {
    kind: 100, // SELF_AND
    conditions,
  };

  const sort = normalizeSort(options.sort) ?? [["_modified", "DESC"]];
  const pageSize = options.maxResults ?? 50;

  return { q: group, sort, pageSize };
}

/**
 * Build a journal entries query
 */
export function buildJournalQuery(options: JournalQueryOptions): QueryDescription2 {
  const journalQuery: QueryJournal2 = {
    kind: 3,
    start: toQueryJournalDate(options.start),
    end: toQueryJournalDate(options.end),
  };

  const group: QueryGroup2 = {
    kind: 100, // SELF_AND
    conditions: [journalQuery],
  };

  const sort = normalizeSort(options.sort) ?? [["_modified", "DESC"]];
  const pageSize = options.maxResults ?? 50;

  return { q: group, sort, pageSize };
}

/**
 * Build an advanced query with full QueryDescription2 support
 * Supports AND, OR, and CHAIN_AND combining modes
 */
export function buildAdvancedQuery(options: AdvancedQueryOptions): QueryDescription2 {
  if (!options.conditions?.length) {
    throw new Error("At least one condition is required");
  }

  const queryItems = options.conditions.map(conditionToQueryItem);

  const group: QueryGroup2 = {
    kind: mapCombineMode(options.combineMode),
    conditions: queryItems,
  };

  const sort = normalizeSort(options.sort);
  const page = typeof options.page === "number" && Number.isFinite(options.page) ? options.page : undefined;
  const pageSize = typeof options.pageSize === "number" && Number.isFinite(options.pageSize) ? options.pageSize : undefined;

  return {
    q: group,
    sort,
    page,
    pageSize,
    excludeId: options.excludeId,
  };
}
