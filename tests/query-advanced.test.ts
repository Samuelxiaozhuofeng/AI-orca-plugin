import {
  toQueryJournalDate,
  buildTaskQuery,
  buildJournalQuery,
  buildAdvancedQuery,
  conditionToQueryItem,
} from "../src/utils/query-builder";
import { assertEqual, assertDeepEqual, test } from "./test-harness";

test("toQueryJournalDate converts relative date", () => {
  const result = toQueryJournalDate({ type: "relative", value: -7, unit: "d" });
  assertEqual(result.t, 1);
  assertEqual(result.v, -7);
  assertEqual(result.u, "d");
});

test("toQueryJournalDate converts absolute date", () => {
  const timestamp = 1703145600000;
  const result = toQueryJournalDate({ type: "absolute", value: timestamp });
  assertEqual(result.t, 2);
  assertEqual(result.v, timestamp);
});

test("buildTaskQuery generates kind:11 query", () => {
  const q = buildTaskQuery({ completed: false });
  const taskCondition = (q as any).q.conditions[0];
  assertEqual(taskCondition.kind, 11);
  assertEqual(taskCondition.completed, false);
});

test("buildTaskQuery with date range includes CHAIN_AND group", () => {
  const q = buildTaskQuery({
    completed: true,
    dateRange: {
      start: { type: "relative", value: -7, unit: "d" },
      end: { type: "relative", value: 0, unit: "d" },
    },
  });
  const conditions = (q as any).q.conditions;
  assertEqual(conditions.length, 2);
  assertEqual(conditions[0].kind, 11); // Task query
  assertEqual(conditions[1].kind, 106); // CHAIN_AND group
});

test("buildJournalQuery generates kind:3 query", () => {
  const q = buildJournalQuery({
    start: { type: "relative", value: -7, unit: "d" },
    end: { type: "relative", value: 0, unit: "d" },
  });
  const journalCondition = (q as any).q.conditions[0];
  assertEqual(journalCondition.kind, 3);
  assertEqual(journalCondition.start.t, 1);
  assertEqual(journalCondition.start.v, -7);
});

test("buildAdvancedQuery with OR mode uses kind:101", () => {
  const q = buildAdvancedQuery({
    conditions: [
      { type: "tag", name: "urgent" },
      { type: "tag", name: "important" },
    ],
    combineMode: "or",
  });
  assertEqual((q as any).q.kind, 101);
});

test("buildAdvancedQuery with chain_and mode uses kind:106", () => {
  const q = buildAdvancedQuery({
    conditions: [
      { type: "tag", name: "project" },
      { type: "text", text: "deadline" },
    ],
    combineMode: "chain_and",
  });
  assertEqual((q as any).q.kind, 106);
});

test("conditionToQueryItem converts tag condition", () => {
  const item = conditionToQueryItem({ type: "tag", name: "test" });
  assertEqual((item as any).kind, 4);
  assertEqual((item as any).name, "test");
});

test("conditionToQueryItem converts text condition", () => {
  const item = conditionToQueryItem({ type: "text", text: "hello" });
  assertEqual((item as any).kind, 8);
  assertEqual((item as any).text, "hello");
});

test("conditionToQueryItem converts task condition", () => {
  const item = conditionToQueryItem({ type: "task", completed: true });
  assertEqual((item as any).kind, 11);
  assertEqual((item as any).completed, true);
});

