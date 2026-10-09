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

/** 第一轮 / 第二轮发出时的可见历史（id 序列） */
const H1 = [{ id: "u1", role: "user" }, { id: "a1", role: "assistant" }, { id: "u2", role: "user" }];
const H2 = [...H1, { id: "a2", role: "assistant" }, { id: "u3", role: "user" }];

function ctx(conversationId: string, confirm?: LocalCliContext["confirm"], history = H1): LocalCliContext {
  return { conversationId, history, confirm: confirm ?? (async () => false) };
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
  assertDeepEqual(mapBridgeEvent({ type: "tool", name: "Bash", input: { command: "ls" } }), { type: "reasoning", reasoning: "\n调用 Bash\n" });
  assertDeepEqual(mapBridgeEvent({ type: "tool_result", name: "Bash", ok: false }), { type: "reasoning", reasoning: "Bash 失败\n" });
  assertEqual(mapBridgeEvent({ type: "permission" }), null);
  assertEqual(mapBridgeEvent({ type: "done" }), null);
});

test("buildLocalCliPrompt：无会话时带历史，续接时只发最新一条", () => {
  assertEqual(buildLocalCliPrompt(msgs, true), "第二问");
  const full = buildLocalCliPrompt(msgs, false);
  assert(full.includes("用户：第一问") && full.includes("助手：第一答") && full.endsWith("第二问"), full);
  assert(!full.includes("sys"), "不应包含系统提示");
});

test("local-cli：正常流 → content/done，无 tool_calls，记住会话", async () => {
  const m = mockBridge([
    [{ type: "session", id: "s-1" }, { type: "text", delta: "你好" }, { type: "done" }],
    [{ type: "text", delta: "再见" }, { type: "done" }],
  ]);
  try {
    const out = await collect(streamLocalCli({ ...base, localCli: ctx("conv-a") }, msgs));
    assertDeepEqual(out[0], { type: "content", content: "你好" });
    const done = out[out.length - 1];
    assertEqual(done.type, "done");
    assertEqual(done.result.content, "你好");
    assertEqual(done.result.toolCalls.length, 0);
    assertEqual(m.calls[0].url, "http://127.0.0.1:18673/chat");
    assertEqual(m.calls[0].body.sessionId, undefined);

    await collect(streamLocalCli({ ...base, localCli: ctx("conv-a", undefined, H2) }, msgs));
    assertEqual(m.calls[1].body.sessionId, "s-1");
    assertEqual(m.calls[1].body.prompt, "第二问");
  } finally {
    m.restore();
  }
});

test("local-cli：已收到内容后失败不重试，直接报错", async () => {
  const m = mockBridge([
    [{ type: "session", id: "s-2" }, { type: "text", delta: "a" }, { type: "done" }],
    [{ type: "text", delta: "部分" }, { type: "error", message: "boom" }],
    [{ type: "text", delta: "不该到这" }, { type: "done" }],
  ]);
  try {
    await collect(streamLocalCli({ ...base, localCli: ctx("conv-b") }, msgs));
    let error: any = null;
    try {
      await collect(streamLocalCli({ ...base, localCli: ctx("conv-b", undefined, H2) }, msgs));
    } catch (err) {
      error = err;
    }
    assert(error && String(error.message).includes("boom"), "应报错");
    assertEqual(m.calls.length, 2, "不应重试");
  } finally {
    m.restore();
  }
});

test("local-cli：续接会话且尚无内容时失败 → 丢 sessionId 重试一次", async () => {
  const m = mockBridge([
    [{ type: "session", id: "s-3" }, { type: "done" }],
    [{ type: "error", message: "resume 失败" }],
    [{ type: "session", id: "s-4" }, { type: "text", delta: "ok" }, { type: "done" }],
  ]);
  try {
    await collect(streamLocalCli({ ...base, localCli: ctx("conv-c") }, msgs));
    const out = await collect(streamLocalCli({ ...base, localCli: ctx("conv-c", undefined, H2) }, msgs));
    assertEqual(m.calls.length, 3);
    assertEqual(m.calls[1].body.sessionId, "s-3");
    assertEqual(m.calls[2].body.sessionId, undefined);
    assert(m.calls[2].body.prompt.includes("用户：第一问"), "重试应带压缩历史");
    assertEqual(out[out.length - 1].result.content, "ok");
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
