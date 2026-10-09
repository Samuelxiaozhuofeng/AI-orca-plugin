import { test, assert, assertEqual, assertDeepEqual } from "./test-harness";
import {
  buildLocalCliPrompt,
  mapBridgeEvent,
  streamLocalCli,
  type LocalCliContext,
} from "../src/services/ai/local-cli-client";
import { streamChatWithRetry } from "../src/services/ai/chat-stream-handler";

type Call = { url: string; body: any };

/** 模拟 bridge：/chat 依次返回给定 SSE 事件序列（每次请求取一组），/permission 记录请求体；连接中止时流随之报错 */
function mockBridge(rounds: Array<Array<any | (() => Promise<void>)>>, permissionStatus = 200) {
  const calls: Call[] = [];
  const original = globalThis.fetch;
  let round = 0;
  globalThis.fetch = (async (url: any, init?: any) => {
    const body = init?.body ? JSON.parse(init.body) : null;
    calls.push({ url: String(url), body });
    if (String(url).endsWith("/permission")) return new Response("{}", { status: permissionStatus });
    const events = rounds[round++] ?? [];
    const enc = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        init?.signal?.addEventListener("abort", () => {
          try { controller.error(new DOMException("Aborted", "AbortError")); } catch {}
        });
        for (const ev of events) {
          if (typeof ev === "function") await ev();
          else controller.enqueue(enc.encode(`data: ${JSON.stringify(ev)}\n\n`));
        }
        controller.close();
      },
    });
    return new Response(stream, { status: 200, headers: { "content-type": "text/event-stream" } });
  }) as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = original; } };
}

function ctx(conversationId: string, confirm?: LocalCliContext["confirm"]): LocalCliContext {
  return { conversationId, confirm: confirm ?? (async () => false) };
}

const base = { apiUrl: "http://127.0.0.1:18673/", apiKey: "t" };
const msgs = [
  { role: "system", content: "sys" },
  { role: "user", content: "第一问" },
  { role: "assistant", content: "第一答" },
  { role: "user", content: "第二问" },
] as any[];

async function collect(gen: AsyncGenerator<any>) {
  const out: any[] = [];
  for await (const c of gen) out.push(c);
  return out;
}

test("mapBridgeEvent：text/thinking/tool/tool_result 映射", () => {
  assertDeepEqual(mapBridgeEvent({ type: "text", delta: "hi" }), { type: "content", content: "hi" });
  assertDeepEqual(mapBridgeEvent({ type: "thinking", delta: "嗯" }), { type: "reasoning", reasoning: "嗯" });
  assertDeepEqual(mapBridgeEvent({ type: "tool", name: "Bash", input: { command: "ls" } }), { type: "reasoning", reasoning: "\n运行 `ls`\n" });
  assertDeepEqual(mapBridgeEvent({ type: "tool_result", name: "Bash", ok: false }), { type: "reasoning", reasoning: "Bash 失败\n" });
  assertEqual(mapBridgeEvent({ type: "tool_result", name: "Bash", ok: true }), null);
  assertEqual(mapBridgeEvent({ type: "permission" }), null);
  assertEqual(mapBridgeEvent({ type: "done" }), null);
});

test("buildLocalCliPrompt：历史压成文字 + 最新一条", () => {
  assertEqual(buildLocalCliPrompt(msgs.slice(0, 2)), "第一问");
  const full = buildLocalCliPrompt(msgs);
  assert(full.includes("用户：第一问") && full.includes("助手：第一答") && full.endsWith("第二问"), full);
  assert(!full.includes("sys"), "不应包含系统提示");
});

test("local-cli：正常流 → content/done，无 tool_calls", async () => {
  const m = mockBridge([[{ type: "session", id: "s-1" }, { type: "text", delta: "你好" }, { type: "done" }]]);
  try {
    const out = await collect(streamLocalCli({ ...base, localCli: ctx("conv-a") }, msgs));
    assertDeepEqual(out[0], { type: "content", content: "你好" });
    const done = out[out.length - 1];
    assertEqual(done.type, "done");
    assertEqual(done.result.content, "你好");
    assertEqual(done.result.toolCalls.length, 0);
    assertEqual(m.calls[0].url, "http://127.0.0.1:18673/chat");
  } finally {
    m.restore();
  }
});

test("local-cli：已收到内容后出错 → 直接报错，不重发", async () => {
  const m = mockBridge([
    [{ type: "text", delta: "部分" }, { type: "error", message: "boom" }],
    [{ type: "text", delta: "不该到这" }, { type: "done" }],
  ]);
  try {
    let error: any = null;
    try {
      await collect(streamLocalCli({ ...base, localCli: ctx("conv-b") }, msgs));
    } catch (err) {
      error = err;
    }
    assert(error && String(error.message).includes("boom"), "应报错");
    assertEqual(m.calls.length, 1, "不应重发");
  } finally {
    m.restore();
  }
});

test("local-cli：权限回包只含 requestId/allow，不带 updatedPermissions", async () => {
  let posted!: () => void;
  const permissionPosted = new Promise<void>((r) => { posted = r; });
  const m = mockBridge([
    [
      { type: "permission", requestId: "r1", tool: "Bash", input: { command: "touch x" } },
      () => permissionPosted,
      { type: "done" },
    ],
  ]);
  const seen: any[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: any, init?: any) => {
    const res = await original(url, init);
    if (String(url).endsWith("/permission")) posted();
    return res;
  }) as typeof fetch;
  try {
    await collect(streamLocalCli(
      { ...base, localCli: ctx("conv-d", async (tool, input) => { seen.push({ tool, input }); return true; }) },
      msgs,
    ));
    assertDeepEqual(seen, [{ tool: "Bash", input: { command: "touch x" } }]);
    const perm = m.calls.find((c) => c.url.endsWith("/permission"))!;
    assertDeepEqual(perm.body, { requestId: "r1", allow: true });
  } finally {
    globalThis.fetch = original;
    m.restore();
  }
});

test("local-cli：bridge 没开 → 明确中文错误", async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => { throw new TypeError("fetch failed"); }) as typeof fetch;
  try {
    let error: any = null;
    try {
      await collect(streamLocalCli({ ...base, localCli: ctx("conv-e") }, msgs));
    } catch (err) {
      error = err;
    }
    assert(error && String(error.message).includes("本机 AI 未连接"), String(error?.message));
  } finally {
    globalThis.fetch = original;
  }
});

test("streamChatWithRetry：local-cli 无上下文（非主对话）→ 不支持此功能", async () => {
  let error: any = null;
  try {
    await collect(streamChatWithRetry({ ...base, model: "m", protocol: "local-cli" }, msgs, msgs));
  } catch (err) {
    error = err;
  }
  assert(error && String(error.message).includes("本机 AI 不支持此功能"), String(error?.message));
});
