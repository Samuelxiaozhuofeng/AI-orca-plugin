import { convertValue, mapOperator } from "../src/utils/query-converters";
import { PropType } from "../src/utils/query-types";
import { assert, assertEqual, test } from "./test-harness";

test("mapOperator maps is null to 11", () => {
  assertEqual(mapOperator("is null"), 11);
});

test("mapOperator maps >= to 9", () => {
  assertEqual(mapOperator(">="), 9);
});

test("convertValue converts PropType.Number strings to numbers", () => {
  const v = convertValue("8", PropType.Number);
  assertEqual(typeof v, "number");
  assertEqual(v, 8);
});

test("convertValue converts PropType.Boolean strings to booleans", () => {
  assertEqual(convertValue("true", PropType.Boolean), true);
  assertEqual(convertValue("false", PropType.Boolean), false);
});

test("convertValue converts PropType.DateTime strings to Date", () => {
  const v = convertValue("2024-01-02T03:04:05.000Z", PropType.DateTime);
  assert(v instanceof Date, "Expected a Date instance");
  assertEqual((v as Date).toISOString(), "2024-01-02T03:04:05.000Z");
});

