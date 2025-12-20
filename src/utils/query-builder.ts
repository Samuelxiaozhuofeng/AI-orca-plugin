import type { QueryDescription2, QueryGroup2, QuerySort, QueryTag2, QueryTagProperty } from "../orca";
import { convertValue, mapOperator, tryConvertValueFromOperator } from "./query-converters";
import { PropType } from "./query-types";
import type { QueryBlocksByTagOptions, QueryPropertyFilterInput, QuerySortInput } from "./query-types";

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
