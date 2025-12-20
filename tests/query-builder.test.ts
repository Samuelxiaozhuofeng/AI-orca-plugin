import { buildQueryDescription } from "../src/utils/query-builder";
import { PropType } from "../src/utils/query-types";
import { assert, assertEqual, test } from "./test-harness";

test("buildQueryDescription builds tag query with property filter and value conversion", () => {
  const q = buildQueryDescription({
    tagName: "task",
    properties: [{ name: "priority", op: ">=", value: "8", type: PropType.Number }],
  });

  const tagQuery = (q as any).q.conditions[0];
  assertEqual(tagQuery.kind, 4);
  assertEqual(tagQuery.name, "task");

  const prop = tagQuery.properties[0];
  assertEqual(prop.name, "priority");
  assertEqual(prop.op, 9);
  assertEqual(typeof prop.value, "number");
  assertEqual(prop.value, 8);
});

test("buildQueryDescription maps is null to op=11 without value", () => {
  const q = buildQueryDescription({
    tagName: "note",
    properties: [{ name: "category", op: "is null" }],
  });

  const prop = (q as any).q.conditions[0].properties[0];
  assertEqual(prop.op, 11);
  assert(!("value" in prop), "Expected no value for is null operator");
});

test("buildQueryDescription keeps string values for ==", () => {
  const q = buildQueryDescription({
    tagName: "article",
    properties: [{ name: "author", op: "==", value: "张三" }],
  });

  const prop = (q as any).q.conditions[0].properties[0];
  assertEqual(prop.op, 1);
  assertEqual(prop.value, "张三");
});

