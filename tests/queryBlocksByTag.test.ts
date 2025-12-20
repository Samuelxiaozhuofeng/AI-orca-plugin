import { PropType } from "../src/utils/query-types";
import { assert, assertEqual, test } from "./test-harness";

test("queryBlocksByTag calls backend query and converts values", async () => {
  const calls: Array<{ name: string; args: any[] }> = [];

  (globalThis as any).orca = {
    state: { blocks: {} },
    invokeBackend: async (name: string, ...args: any[]) => {
      calls.push({ name, args });

      if (name === "query") {
        const blocks = [
          { id: 1, text: "Task A", modified: "2025-01-01T00:00:00.000Z" },
        ];
        return [0, blocks];
      }

      if (name === "get-block-tree") {
        return [0, { block: { text: "Task A" }, children: [] }];
      }

      throw new Error(`Unexpected invokeBackend call: ${name}`);
    },
  };

  const { queryBlocksByTag } = await import("../src/services/search-service");
  const results = await queryBlocksByTag("task", {
    properties: [{ name: "priority", op: ">=", value: "8", type: PropType.Number }],
    maxResults: 10,
  });

  assertEqual(results.length, 1);
  assertEqual(results[0].id, 1);
  assert(results[0].fullContent && results[0].fullContent.includes("Task A"), "Expected fullContent to include text");

  const queryCall = calls.find((c) => c.name === "query");
  assert(queryCall, "Expected a query backend call");
  const desc = queryCall!.args[0];

  const prop = desc.q.conditions[0].properties[0];
  assertEqual(prop.op, 9);
  assertEqual(typeof prop.value, "number");
  assertEqual(prop.value, 8);
});

test("queryBlocksByTag retries legacy query format when QueryDescription2 fails", async () => {
  let queryCalls = 0;
  const capturedKinds: number[] = [];

  (globalThis as any).orca = {
    state: { blocks: {} },
    invokeBackend: async (name: string, ...args: any[]) => {
      if (name === "query") {
        queryCalls += 1;
        capturedKinds.push(args[0]?.q?.kind);
        if (queryCalls === 1) {
          return [0, { code: "BAD_QUERY" }];
        }
        return [0, [{ id: 2, text: "Legacy OK" }]];
      }

      if (name === "get-block-tree") {
        return [0, { block: { text: "Legacy OK" }, children: [] }];
      }

      throw new Error(`Unexpected invokeBackend call: ${name}`);
    },
  };

  const { queryBlocksByTag } = await import("../src/services/search-service");
  const results = await queryBlocksByTag("note", {
    properties: [{ name: "category", op: "is null" }],
    maxResults: 5,
  });

  assertEqual(queryCalls, 2);
  assertEqual(capturedKinds[0], 100);
  assertEqual(capturedKinds[1], 1);
  assertEqual(results.length, 1);
  assertEqual(results[0].id, 2);
});
