import { test, assert, assertEqual } from "./test-harness";
import {
  buildLocalCliPrompt,
  historyFingerprints,
  streamLocalCli,
  LOCAL_CLI_ABORT_NOTE,
  type LocalCliContext,
} from "../src/services/ai/local-cli-client";
import { createChatRequestOwner } from "../src/utils/chat-request-owner";

// 审查返修 F2a / F3 / F5 / F6 / F9 的检查

type Step = any | (() => Promise<void>);

/** 模拟 bridge：/chat 按轮返回 SSE 事件（函数项 = 等待），连接中止时流报 AbortError；/permission 按给定状态回包 */
function mockBridge(rounds: Step[][], permission: (body: any) => Promise<number> | number = () => 200) {
  const calls: Array<{ url: string; body: any }> = [];
  const original = globalThis.fetch;
  let round = 0;
  globalThis.fetch = (async (url: any, init?: any) => {
    const body = init?.body ? JSON.parse(init.body) : null;
    calls.push({ url: String(url), body });
    if (String(url).endsWith("/permission")) return new Response("{}", { status: await permission(body) });
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
        try { controller.close(); } catch {}
      },
    });
    return new Response(stream, { status: 200 });
  }) as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = original; } };
}

const base = { apiUrl: "http://127.0.0.1:18673", apiKey: "t" };
const msgs = [
  { role: "system", content: "插件工具说明" },
  { role: "user", content: "第一问" },
  { role: "assistant", content: "第一答" },
  { role: "user", content: "第二问" },
] as any[];
const H1 = [{ id: "u1", role: "user" }, { id: "a1", role: "assistant" }, { id: "u2", role: "user" }];
const H2 = [...H1, { id: "a2", role: "assistant" }, { id: "u3", role: "user" }];
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const never = () => new Promise<void>(() => {});

function ctx(conversationId: string, extra: Partial<LocalCliContext> = {}): LocalCliContext {
  return { conversationId, history: H1, confirm: async () => false, ...extra };
}

async function collect(gen: AsyncGenerator<any>) {
  const out: any[] = [];
  for await (const c of gen) out.push(c);
  return out;
}

async function errorOf(p: Promise<any>): Promise<any> {
  try { await p; } catch (err) { return err; }
  return null;
}

test("F2a 权限请求串行排队：同时到达的两个请求，弹窗一次只开一个", async () => {
  let open = 0;
  let maxOpen = 0;
  const order: string[] = [];
  let bothPosted!: () => void;
  const posted = new Promise<void>((r) => { bothPosted = r; });
  let count = 0;
  const m = mockBridge(
    [[
      { type: "permission", requestId: "p1", tool: "Bash", input: { command: "a" } },
      { type: "permission", requestId: "p2", tool: "Bash", input: { command: "b" } },
      () => posted,
      { type: "done" },
    ]],
    (body) => { order.push(body.requestId); if (++count === 2) bothPosted(); return 200; },
  );
  try {
    const confirm: LocalCliContext["confirm"] = async () => {
      open++;
      maxOpen = Math.max(maxOpen, open);
      await sleep(30);
      open--;
      return true;
    };
    await collect(streamLocalCli({ ...base, localCli: ctx("q-1", { confirm }) }, msgs));
    assertEqual(maxOpen, 1, "同时开了多个弹窗");
    assertEqual(order.join(","), "p1,p2");
  } finally {
    m.restore();
  }
});

test("F3 中止时生成器不输出中止提示（由界面在确认归属后补到原消息）", async () => {
  const ac = new AbortController();
  const m = mockBridge([[{ type: "text", delta: "部分" }, never]]);
  try {
    const out: any[] = [];
    const err = await errorOf((async () => {
      for await (const c of streamLocalCli({ ...base, signal: ac.signal, localCli: ctx("ab-1") }, msgs)) {
        out.push(c);
        ac.abort();
      }
    })());
    assertEqual(String(err?.name), "AbortError");
    assert(!out.some((c) => String(c.content ?? "").includes(LOCAL_CLI_ABORT_NOTE)), "不应输出中止提示");
  } finally {
    m.restore();
  }
});

test("F3 对话归属：换对话后旧请求失效、写入丢弃、中止器生来即中止", () => {
  const owner = createChatRequestOwner();
  const req = owner.begin();
  const early = req.newAborter();
  const writes: string[] = [];
  const write = req.guard((s: string) => writes.push(s));
  write("a");
  assert(req.isCurrent() && !early.signal.aborted, "换对话前应属当前对话");
  owner.invalidate();
  write("b");
  assert(!req.isCurrent(), "换对话后应失效");
  assert(early.signal.aborted, "已有中止器应被中止");
  assert(req.newAborter().signal.aborted, "准备阶段之后才建的中止器应生来即中止");
  assertEqual(writes.join(","), "a");
  const next = owner.begin();
  assert(next.isCurrent() && !next.newAborter().signal.aborted, "新请求不受影响");
});

test("F5 /permission 返回非 2xx → 明确报错并终止本次生成", async () => {
  const m = mockBridge([[{ type: "permission", requestId: "x1", tool: "Write", input: {} }, never]], () => 500);
  try {
    const err = await errorOf(collect(streamLocalCli({ ...base, localCli: ctx("pf-1", { confirm: async () => true }) }, msgs)));
    assert(err && String(err.message).includes("确认结果提交失败（500）"), String(err?.message));
  } finally {
    m.restore();
  }
});

test("F5 /permission 网络失败 → 明确报错并终止本次生成", async () => {
  const m = mockBridge([[{ type: "permission", requestId: "x2", tool: "Write", input: {} }, never]], () => { throw new TypeError("fetch failed"); });
  try {
    const err = await errorOf(collect(streamLocalCli({ ...base, localCli: ctx("pf-2", { confirm: async () => true }) }, msgs)));
    assert(err && String(err.message).includes("确认结果提交失败"), String(err?.message));
  } finally {
    m.restore();
  }
});

test("F6 历史指纹：只计到最后一条用户消息", () => {
  assertEqual(historyFingerprints(H1).current, "u1,a1,u2");
  assertEqual(historyFingerprints(H2).prior, "u1,a1,u2");
  assertEqual(historyFingerprints([{ id: "u9", role: "user" }]).prior, "");
});

test("F6 清空 / 回档后指纹对不上 → 不续接，按当前可见历史重建", async () => {
  const m = mockBridge([
    [{ type: "session", id: "s-f6" }, { type: "done" }],
    [{ type: "done" }],
    [{ type: "done" }],
  ]);
  try {
    await collect(streamLocalCli({ ...base, localCli: ctx("f6") }, msgs));
    await collect(streamLocalCli({ ...base, localCli: ctx("f6", { history: H2 }) }, msgs));
    assertEqual(m.calls[1].body.sessionId, "s-f6", "历史一致时应续接");
    // 回档到 a1 后另发一条：之前的可见历史只到 u1，与记下的 u1,a1,u2 对不上
    const rolledBack = [{ id: "u1", role: "user" }, { id: "a1", role: "assistant" }, { id: "u7", role: "user" }];
    await collect(streamLocalCli({ ...base, localCli: ctx("f6", { history: rolledBack }) }, msgs));
    assertEqual(m.calls[2].body.sessionId, undefined, "回档后不应续接");
    assert(m.calls[2].body.prompt.includes("用户：第一问"), "应带压缩历史重建");
  } finally {
    m.restore();
  }
});

test("F9 用户上下文每轮都拼进 prompt（含续接），插件 system 说明不带", async () => {
  assert(buildLocalCliPrompt(msgs, true, "笔记甲").includes("笔记甲"), "续接时应带上下文");
  const m = mockBridge([
    [{ type: "session", id: "s-f9" }, { type: "done" }],
    [{ type: "done" }],
  ]);
  try {
    await collect(streamLocalCli({ ...base, localCli: ctx("f9", { contextText: "笔记甲正文" }) }, msgs));
    await collect(streamLocalCli({ ...base, localCli: ctx("f9", { history: H2, contextText: "笔记乙正文" }) }, msgs));
    assert(m.calls[0].body.prompt.includes("笔记甲正文"), "首轮应带上下文");
    assertEqual(m.calls[1].body.sessionId, "s-f9");
    assert(m.calls[1].body.prompt.includes("笔记乙正文") && m.calls[1].body.prompt.endsWith("第二问"), m.calls[1].body.prompt);
    assert(!m.calls[0].body.prompt.includes("插件工具说明"), "不应带插件 system 说明");
  } finally {
    m.restore();
  }
});
