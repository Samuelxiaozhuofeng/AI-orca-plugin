export type ToolRoundLimit = {
  limit: number;
  hasLimit: boolean;
  canRun: (completedRounds: number) => boolean;
  isReached: (completedRounds: number) => boolean;
  label: string;
};

export function normalizeToolRoundLimit(value: unknown, max = 100): number {
  const n = typeof value === "number"
    ? value
    : typeof value === "string" && value.trim()
    ? Number(value)
    : 0;

  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(max, Math.floor(n)));
}

export function createToolRoundLimit(value: unknown, max = 100): ToolRoundLimit {
  const limit = normalizeToolRoundLimit(value, max);
  const hasLimit = limit > 0;

  return {
    limit,
    hasLimit,
    canRun: (completedRounds: number) => !hasLimit || completedRounds < limit,
    isReached: (completedRounds: number) => hasLimit && completedRounds >= limit,
    label: hasLimit ? String(limit) : "unlimited",
  };
}
