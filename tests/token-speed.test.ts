import { test, assertEqual } from "./test-harness";
import { formatTokenSpeed } from "../src/utils/token-utils";

test("formatTokenSpeed: 没计时或计时过短返回 null", () => {
  assertEqual(formatTokenSpeed("hello world", undefined, undefined), null);
  assertEqual(formatTokenSpeed("hello world", undefined, 299), null);
});

test("formatTokenSpeed: 空内容返回 null", () => {
  assertEqual(formatTokenSpeed("", "", 2000), null);
});

test("formatTokenSpeed: 正常值返回 N tok/s", () => {
  const out = formatTokenSpeed("hello world, this is a test reply", "thinking", 1000);
  assertEqual(/^[1-9]\d* tok\/s$/.test(out || ""), true);
});
