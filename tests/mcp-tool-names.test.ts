import { assert, assertEqual, test } from "./test-harness";
import {
  buildMcpOpenAIName,
  buildMcpServerNamespace,
  isMcpToolNameForServer,
} from "../src/services/external/mcp-tool-names";

test("buildMcpOpenAIName keeps names valid and within provider limits", () => {
  const used = new Set<string>();
  const name = buildMcpOpenAIName(
    "very long server id with spaces and symbols !@# and enough length to overflow provider limits",
    "tool name with spaces and unicode 搜索 and enough length to overflow provider limits",
    used,
  );

  assert(name.length <= 64, "MCP OpenAI tool name should fit the 64 character limit");
  assert(/^[a-zA-Z0-9_-]+$/.test(name), "MCP OpenAI tool name should be function-call safe");
  assert(isMcpToolNameForServer(name, "very long server id with spaces and symbols !@# and enough length to overflow provider limits"));
});

test("buildMcpOpenAIName avoids collisions after sanitization", () => {
  const used = new Set<string>();
  const first = buildMcpOpenAIName("srv", "a b", used);
  const second = buildMcpOpenAIName("srv", "a_b", used);

  assert(first !== second, "sanitized MCP tool names should remain unique");
  assertEqual(used.size, 2);
});

test("buildMcpServerNamespace is stable for persisted cleanup", () => {
  const serverId = "long server id / with punctuation";
  const namespace = buildMcpServerNamespace(serverId);
  const used = new Set<string>();
  const toolName = buildMcpOpenAIName(serverId, "read", used);

  assert(toolName.startsWith(`mcp__${namespace}__`), "tool name should use the stable server namespace");
  assert(isMcpToolNameForServer(toolName, serverId), "server cleanup should match namespaced tools");
});
