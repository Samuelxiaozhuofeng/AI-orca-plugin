import { PropType } from "./query-types";

export function convertValue(value: any, propType: number): any {
  if (value === null || value === undefined) return value;

  if (propType === PropType.Number) {
    if (typeof value === "number") return value;
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) return value;
      const num = Number(trimmed);
      return Number.isFinite(num) ? num : value;
    }
    const num = Number(value);
    return Number.isFinite(num) ? num : value;
  }

  if (propType === PropType.Boolean) {
    if (typeof value === "boolean") return value;
    if (typeof value === "number") return value !== 0;
    if (typeof value === "string") {
      const normalized = value.trim().toLowerCase();
      if (normalized === "true" || normalized === "1" || normalized === "yes") return true;
      if (normalized === "false" || normalized === "0" || normalized === "no") return false;
    }
    return Boolean(value);
  }

  if (propType === PropType.DateTime) {
    if (value instanceof Date) return value;
    if (typeof value === "number") {
      const d = new Date(value);
      return Number.isFinite(d.getTime()) ? d : value;
    }
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (!trimmed) return value;
      const d = new Date(trimmed);
      return Number.isFinite(d.getTime()) ? d : value;
    }
    return value;
  }

  return value;
}

export function mapOperator(op: string): number {
  const normalized = String(op ?? "").trim().toLowerCase();

  switch (normalized) {
    case "eq":
    case "==":
      return 1;
    case "ne":
    case "!=":
      return 2;
    case "in":
    case "includes":
      return 3;
    case "not in":
    case "not_in":
    case "not includes":
      return 4;
    case "gt":
    case ">":
      return 7;
    case "lt":
    case "<":
      return 8;
    case "ge":
    case "gte":
    case ">=":
      return 9;
    case "le":
    case "lte":
    case "<=":
      return 10;
    case "null":
    case "is null":
      return 11;
    case "notnull":
    case "not_null":
    case "not null":
      return 12;
    default:
      throw new Error(`Unsupported operator: ${op}`);
  }
}

export function tryConvertValueFromOperator(value: any, operatorCode: number): any {
  if (value === null || value === undefined) return value;
  if (typeof value !== "string") return value;

  if (operatorCode === 7 || operatorCode === 8 || operatorCode === 9 || operatorCode === 10) {
    const trimmed = value.trim();
    if (!trimmed) return value;
    const num = Number(trimmed);
    return Number.isFinite(num) ? num : value;
  }

  return value;
}
