import { test, assertEqual } from "./test-harness";
import { createToolRoundLimit, normalizeToolRoundLimit } from "../src/services/ai/tool-round-limit";

test("tool round limit treats 0 as unlimited", () => {
  const limit = createToolRoundLimit(0);

  assertEqual(limit.hasLimit, false);
  assertEqual(limit.canRun(0), true);
  assertEqual(limit.canRun(5), true);
  assertEqual(limit.isReached(5), false);
});

test("tool round limit stops only after configured positive rounds", () => {
  const limit = createToolRoundLimit(5);

  assertEqual(limit.hasLimit, true);
  assertEqual(limit.canRun(4), true);
  assertEqual(limit.canRun(5), false);
  assertEqual(limit.isReached(5), true);
});

test("normalizeToolRoundLimit keeps invalid values unlimited", () => {
  assertEqual(normalizeToolRoundLimit(Number.NaN), 0);
  assertEqual(normalizeToolRoundLimit(""), 0);
  assertEqual(normalizeToolRoundLimit("-3"), 0);
});
