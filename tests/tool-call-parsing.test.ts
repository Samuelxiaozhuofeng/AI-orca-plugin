import { test, assertEqual, assertDeepEqual, assert } from "./test-harness";
import {
  hasXmlToolCalls,
  stripXmlToolCalls,
  parseXmlToolCalls,
  hasDsmlToolCalls,
  parseDsmlToolCalls,
  stripDsmlToolCalls,
} from "../src/services/ai/chat-stream-handler";
import { createToolProtocolStream, extractToolProtocol } from "../src/services/ai/tool-call-protocol";
import {
  createToolCallSignature,
  resolveToolCallName,
} from "../src/services/ai/tool-call-router";
import { sanitizeContent } from "../src/services/ai/openai-client";

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

test("parseDsmlToolCalls parses DSML wrapped invoke calls", () => {
  const input = `before
<｜DSML｜function_calls>
<｜DSML｜invoke name="mcp__orca-note__insert_markdown">
<｜DSML｜parameter name="repoId" string="true">repo-1</｜DSML｜parameter>
<｜DSML｜parameter name="refBlockId" string="false">27860</｜DSML｜parameter>
<｜DSML｜parameter name="text" string="true">- [x] test</｜DSML｜parameter>
</｜DSML｜invoke>
</｜DSML｜function_calls>
after`;

  assert(hasDsmlToolCalls(input), "Should detect DSML wrapped tool calls");
  const toolCalls = parseDsmlToolCalls(input);
  assertEqual(toolCalls.length, 1);
  assertEqual(toolCalls[0].function.name, "mcp__orca-note__insert_markdown");
  assertDeepEqual(JSON.parse(toolCalls[0].function.arguments), {
    repoId: "repo-1",
    refBlockId: 27860,
    text: "- [x] test",
  });
  assertEqual(stripDsmlToolCalls(input), "before\n\nafter");
});

test("parseDsmlToolCalls parses half-width DSML and colon-prefixed tags", () => {
  const input = `<|DSML|:tool_calls><|DSML|:invoke name='webSearch'><|DSML|:parameter name='query'>DeepSeek DSML</|DSML|:parameter></|DSML|:invoke></|DSML|:tool_calls>`;

  assert(hasDsmlToolCalls(input), "Should detect half-width colon DSML tool calls");
  const toolCalls = parseDsmlToolCalls(input);
  assertEqual(toolCalls.length, 1);
  assertEqual(toolCalls[0].function.name, "webSearch");
  assertDeepEqual(JSON.parse(toolCalls[0].function.arguments), { query: "DeepSeek DSML" });
  assertEqual(stripDsmlToolCalls(input), "");
});

test("parseDsmlToolCalls parses DeepSeek doubled full-width DSML tags", () => {
  const input = `继续测试第二批工具：

<｜｜DSML｜｜tool_calls>
<｜｜DSML｜｜invoke name="mcp__orca-note__read_blocks">
<｜｜DSML｜｜parameter name="repoId" string="true">iwy5nfalj9l1y</｜｜DSML｜｜parameter>
<｜｜DSML｜｜parameter name="blockIds" string="false">[1, 2, 3]</｜｜DSML｜｜parameter>
</｜｜DSML｜｜invoke>
<｜｜DSML｜｜invoke name="mcp__orca-note__search_block">
<｜｜DSML｜｜parameter name="repoId" string="true">iwy5nfalj9l1y</｜｜DSML｜｜parameter>
<｜｜DSML｜｜parameter name="keyword" string="true">测试</｜｜DSML｜｜parameter>
<｜｜DSML｜｜parameter name="pageNum" string="false">1</｜｜DSML｜｜parameter>
<｜｜DSML｜｜parameter name="pageSize" string="false">3</｜｜DSML｜｜parameter>
</｜｜DSML｜｜invoke>
</｜｜DSML｜｜tool_calls>`;

  const extracted = extractToolProtocol(input);
  assert(extracted.hasMarkup, "Should detect doubled full-width DSML markup");
  assertEqual(extracted.visibleText, "继续测试第二批工具：");
  assertEqual(extracted.toolCalls.length, 2);
  assertEqual(extracted.toolCalls[0].function.name, "mcp__orca-note__read_blocks");
  assertDeepEqual(JSON.parse(extracted.toolCalls[0].function.arguments), {
    repoId: "iwy5nfalj9l1y",
    blockIds: [1, 2, 3],
  });
  assertEqual(extracted.toolCalls[1].function.name, "mcp__orca-note__search_block");
  assertDeepEqual(JSON.parse(extracted.toolCalls[1].function.arguments), {
    repoId: "iwy5nfalj9l1y",
    keyword: "测试",
    pageNum: 1,
    pageSize: 3,
  });
  assert(!sanitizeContent(input).includes("DSML"), "Sanitized text should not contain DSML");
});

test("createToolProtocolStream hides protocol markup across chunks", () => {
  const stream = createToolProtocolStream();
  const chunks = [
    "继续测试第二批工具：\n\n<",
    "｜｜DS",
    "ML｜｜tool_calls>\n<｜｜DSML｜｜invoke name=\"bad\">",
    "<｜｜DSML｜｜parameter name=\"x\">1</｜｜DSML｜｜parameter>",
    "</｜｜DSML｜｜invoke></｜｜DSML｜｜tool_calls>",
  ];

  const visible = chunks.map(chunk => stream.append(chunk)).join("");
  assertEqual(visible, "继续测试第二批工具：\n\n");
  assert(!visible.includes("DSML"), "Visible stream should not contain DSML");
  assert(!visible.includes("<"), "Visible stream should not contain markup start");
});

test("parseDsmlToolCalls parses plain invoke calls", () => {
  const input = `<invoke name="webFetch"><parameter name="url">https://example.com</parameter></invoke>`;

  assert(hasDsmlToolCalls(input), "Should detect plain invoke tool calls");
  const toolCalls = parseDsmlToolCalls(input);
  assertEqual(toolCalls.length, 1);
  assertEqual(toolCalls[0].function.name, "webFetch");
  assertDeepEqual(JSON.parse(toolCalls[0].function.arguments), { url: "https://example.com" });
});

test("sanitizeContent removes DSML and tool_call markup", () => {
  const input = `Answer
<tool_calls><invoke name="bad"><parameter name="x">1</parameter></invoke></tool_calls>
<tool_call>{"name":"bad","arguments":{"x":1}}</tool_call>
Done`;

  const sanitized = sanitizeContent(input);
  assert(!sanitized.includes("<tool"), "Should remove tool markup");
  assert(!sanitized.includes("<invoke"), "Should remove invoke markup");
  assertEqual(sanitized, "Answer\n\n\nDone");
});

test("resolveToolCallName maps unique MCP original names to exact OpenAI tool names", () => {
  const tools = [
    {
      type: "function" as const,
      function: {
        name: "mcp__orca-note__get_blocks_text",
        description: "Read blocks",
        parameters: { type: "object", properties: {} },
      },
    },
  ];

  const result = resolveToolCallName({
    id: "tc_1",
    type: "function",
    function: { name: "get_blocks_text", arguments: "{}" },
  }, tools);

  assertEqual(result.status, "renamed");
  assertEqual(result.toolCall.function.name, "mcp__orca-note__get_blocks_text");
});

test("resolveToolCallName rejects ambiguous or unavailable tools instead of inventing", () => {
  const tools = [
    {
      type: "function" as const,
      function: {
        name: "mcp__a__search_blocks",
        description: "Search A",
        parameters: { type: "object", properties: {} },
      },
    },
    {
      type: "function" as const,
      function: {
        name: "mcp__b__search_blocks",
        description: "Search B",
        parameters: { type: "object", properties: {} },
      },
    },
  ];

  const result = resolveToolCallName({
    id: "tc_2",
    type: "function",
    function: { name: "search_blocks", arguments: "{}" },
  }, tools);

  assertEqual(result.status, "invalid");
  assert(result.message.includes("Unknown tool"), "Should produce a recoverable tool error");
});

test("createToolCallSignature ignores JSON key order for repeat detection", () => {
  const a = createToolCallSignature({
    id: "a",
    type: "function",
    function: { name: "webSearch", arguments: "{\"query\":\"orca\",\"maxResults\":3}" },
  });
  const b = createToolCallSignature({
    id: "b",
    type: "function",
    function: { name: "webSearch", arguments: "{\"maxResults\":3,\"query\":\"orca\"}" },
  });

  assertEqual(a, b);
});
