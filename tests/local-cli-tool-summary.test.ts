import { test, assertEqual } from "./test-harness";
import { summarizeToolCall, summarizeToolResult } from "../src/services/ai/local-cli-tool-summary";
import { parseBridgeUsage } from "../src/services/ai/local-cli-client";
import { formatUsage } from "../src/utils/token-utils";

test("工具摘要：常见工具、长路径、mcp、未知工具、子代理缩进", () => {
  assertEqual(summarizeToolCall({ name: "Read", input: { file_path: "/Users/x/a/b/file.md" } }), "\n读取 `…/a/b/file.md`\n");
  assertEqual(summarizeToolCall({ name: "Task", input: { description: "查 *资料*" } }), "\n派子任务：查 资料\n");
  assertEqual(summarizeToolCall({ name: "mcp__orca__search_blocks", input: {} }), "\n调用 `search_blocks`\n");
  assertEqual(summarizeToolCall({ name: "Foo" }), "\n调用 `Foo`\n");
  assertEqual(summarizeToolCall({ name: "Read", input: { file_path: "a.md" }, sub: true }), "\n  ↳ 读取 `a.md`\n");
});

test("工具摘要：命令里的反引号 / 换行 / 尖括号不破坏排版，超长截断", () => {
  const out = summarizeToolCall({ name: "Bash", input: { command: "echo `x`\n<b>" + "y".repeat(300) } });
  assertEqual(out.startsWith("\n运行 `echo 'x' <b>yyy"), true);
  assertEqual(out.split("`").length, 3);
  assertEqual(out.trim().includes("\n"), false);
  assertEqual(out.length < 140, true);
});

test("工具失败：带原因；成功不显示", () => {
  assertEqual(summarizeToolResult({ name: "Read", ok: false, error: "File does\nnot exist" }), "Read 失败：`File does not exist`\n");
  assertEqual(summarizeToolResult({ name: "Bash", ok: false, sub: true }), "  ↳ Bash 失败\n");
  assertEqual(summarizeToolResult({ name: "Bash", ok: true }), "");
});

test("用量：缺字段不显示，格式紧凑", () => {
  assertEqual(parseBridgeUsage(undefined), undefined);
  assertEqual(parseBridgeUsage({ input: "1", output: 2 }), undefined);
  assertEqual(formatUsage(parseBridgeUsage({ input: 1280, output: 820, costUsd: 0.123 })), "入 1.3k · 出 820 · ≈$0.12");
  assertEqual(formatUsage(parseBridgeUsage({ input: 5, output: 1, costUsd: 0.001 })), "入 5 · 出 1 · <$0.01");
  assertEqual(formatUsage(parseBridgeUsage({ input: 5, output: 1 })), "入 5 · 出 1");
  assertEqual(formatUsage(undefined), null);
});
