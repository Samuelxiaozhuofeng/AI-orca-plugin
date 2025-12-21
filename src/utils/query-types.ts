export enum PropType {
  JSON = 0,
  Text = 1,
  BlockRefs = 2,
  Number = 3,
  Boolean = 4,
  DateTime = 5,
  TextChoices = 6,
}

export type QueryOperatorString =
  | ">="
  | ">"
  | "<="
  | "<"
  | "=="
  | "!="
  | "is null"
  | "not null"
  | "includes"
  | "not includes";

export interface QueryPropertyFilterInput {
  name: string;
  op: QueryOperatorString;
  value?: any;
  type?: number;
  typeArgs?: any;
}

export type QuerySortDirection = "ASC" | "DESC";

export type QuerySortInput =
  | string
  | { field: string; direction?: QuerySortDirection }
  | [string, QuerySortDirection];

export interface QueryBlocksByTagOptions {
  properties?: QueryPropertyFilterInput[];
  sort?: QuerySortInput | QuerySortInput[];
  page?: number;
  pageSize?: number;
  maxResults?: number;
}

// ============================================================================
// Advanced Query Types (QueryDescription2 support)
// ============================================================================

/**
 * Date specification for queries (relative or absolute)
 * @example Relative: { type: "relative", value: -7, unit: "d" } = 7 days ago
 * @example Absolute: { type: "absolute", value: 1703145600000 } = timestamp
 */
export interface QueryDateSpec {
  type: "relative" | "absolute";
  /** For relative: offset value (negative = past, positive = future). For absolute: timestamp in milliseconds */
  value: number;
  /** Unit for relative dates: s=seconds, m=minutes, h=hours, d=days, w=weeks, M=months, y=years */
  unit?: "s" | "m" | "h" | "d" | "w" | "M" | "y";
}

/**
 * Options for task search queries
 */
export interface TaskQueryOptions {
  /** Filter by completion status. undefined = all tasks */
  completed?: boolean;
  /** Optional date range filter for task creation/modification */
  dateRange?: { start: QueryDateSpec; end: QueryDateSpec };
  /** Maximum results to return */
  maxResults?: number;
  /** Sort specifications */
  sort?: QuerySortInput | QuerySortInput[];
}

/**
 * Options for journal entry queries
 */
export interface JournalQueryOptions {
  /** Start date for the journal range */
  start: QueryDateSpec;
  /** End date for the journal range */
  end: QueryDateSpec;
  /** Whether to include child blocks of journal entries */
  includeChildren?: boolean;
  /** Maximum results to return */
  maxResults?: number;
  /** Sort specifications */
  sort?: QuerySortInput | QuerySortInput[];
}

/**
 * Query condition types for advanced queries
 */
export type QueryCondition =
  | { type: "tag"; name: string; properties?: QueryPropertyFilterInput[] }
  | { type: "text"; text: string; raw?: boolean }
  | { type: "task"; completed?: boolean }
  | { type: "journal"; start: QueryDateSpec; end: QueryDateSpec }
  | { type: "ref"; blockId: number }
  | { type: "block"; hasTags?: boolean; hasParent?: boolean; hasChild?: boolean; hasAliases?: boolean }
  | { type: "blockMatch"; blockId: number };

/**
 * Combine mode for query groups
 * - "and": All conditions must match (kind: 100 - SELF_AND)
 * - "or": At least one condition must match (kind: 101 - SELF_OR)
 * - "chain_and": Matches in ancestors or descendants (kind: 106 - CHAIN_AND)
 */
export type QueryCombineMode = "and" | "or" | "chain_and";

/**
 * Options for advanced block queries with full QueryDescription2 support
 */
export interface AdvancedQueryOptions {
  /** Array of conditions to apply */
  conditions: QueryCondition[];
  /** How to combine conditions */
  combineMode: QueryCombineMode;
  /** Sort specifications */
  sort?: QuerySortInput | QuerySortInput[];
  /** Page number (1-based) */
  page?: number;
  /** Number of results per page */
  pageSize?: number;
  /** Block ID to exclude from results */
  excludeId?: number;
}

