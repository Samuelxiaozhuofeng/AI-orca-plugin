import { test, assertEqual, assertDeepEqual, assert } from "./test-harness";
import {
  hasXmlToolCalls,
  stripXmlToolCalls,
  parseXmlToolCalls,
} from "../src/services/ai/chat-stream-handler";

test("hasXmlToolCalls detects plain <tool_call> tags", () => {
  const input = "hello <tool_call>{\"name\":\"searchNotes\",\"arguments\":{\"query\":\"test\"}}</tool_call> world";
  assert(hasXmlToolCalls(input), "Should detect <tool_call> tag");
});

test("hasXmlToolCalls detects <tool_call> tags with attributes", () => {
  const input = "before <tool_call name=\"searchNotes\">{\"query\":\"test\"}</tool_call> after";
  assert(hasXmlToolCalls(input), "Should detect <tool_call ...> tag with attributes");
});

test("stripXmlToolCalls removes <tool_call> blocks (plain and attribute forms)", () => {
  const input =
    "A <tool_call>{\"name\":\"searchNotes\",\"arguments\":{\"query\":\"t\"}}</tool_call> B " +
    "C <tool_call name=\"getPage\">{\"pageName\":\"Home\"}</tool_call> D";

  const stripped = stripXmlToolCalls(input);
  assertEqual(stripped, "A  B C  D", "Should remove tool_call blocks and keep surrounding text");
});

test("parseXmlToolCalls parses name-attribute form with JSON arguments", () => {
  const input = "<tool_call name=\"getPage\">{\"pageName\":\"Home\"}</tool_call>";
  const toolCalls = parseXmlToolCalls(input);

  assertEqual(toolCalls.length, 1);
  assertEqual(toolCalls[0].function.name, "getPage");
  assertDeepEqual(JSON.parse(toolCalls[0].function.arguments), { pageName: "Home" });
});

test("parseXmlToolCalls parses format1 (JSON with name field)", () => {
  const input = '<tool_call>{"name":"searchNotes","arguments":{"query":"test"}}</tool_call>';
  const toolCalls = parseXmlToolCalls(input);

  assertEqual(toolCalls.length, 1);
  assertEqual(toolCalls[0].function.name, "searchNotes");
  assertDeepEqual(JSON.parse(toolCalls[0].function.arguments), { query: "test" });
});

test("parseXmlToolCalls parses format2 (arg_key/arg_value)", () => {
  const input = '<tool_call>searchNotes<arg_key>query</arg_key><arg_value>test</arg_value></tool_call>';
  const toolCalls = parseXmlToolCalls(input);

  assertEqual(toolCalls.length, 1);
  assertEqual(toolCalls[0].function.name, "searchNotes");
  assertDeepEqual(JSON.parse(toolCalls[0].function.arguments), { query: "test" });
});

test("parseXmlToolCalls handles multiple tool calls", () => {
  const input = '<tool_call name="getPage">{"pageName":"A"}</tool_call> text <tool_call name="searchNotes">{"query":"B"}</tool_call>';
  const toolCalls = parseXmlToolCalls(input);

  assertEqual(toolCalls.length, 2);
  assertEqual(toolCalls[0].function.name, "getPage");
  assertEqual(toolCalls[1].function.name, "searchNotes");
});
