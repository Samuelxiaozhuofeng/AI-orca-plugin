import { test, assert, assertEqual, assertDeepEqual } from "./test-harness";
import { LOCAL_CLI_ABORT_NOTE, streamLocalCli, type LocalCliRun } from "../src/services/ai/local-cli-client";
import { pickLocalCliResume } from "../src/services/ai/local-cli-resume";

// 续接第一段：续接判定、续接请求体、旧中转提示、续接失败整段重发

const SID = "11111111-2222-4333-8444-555555555555";
const BANNER = "本机 AI · 模型 sonnet · 安全模式\n\n";
const u = (id: string, extra: any = {}) => ({ id, role: "user", content: `问${id}`, createdAt: 1, ...extra }) as any;
const a = (id: string, extra: any = {}) => ({ id, role: "assistant", content: `${BANNER}答${id}`, createdAt: 1, ...extra }) as any;
const head = { sid: SID, msgId: "a2" };

test("续接判定：最后一条是 ccHead 那条才续接；partial 带半截正文（去模式行和中止附注）", () => {
  const base = [u("u1"), a("a1", { cc: { sid: SID } }), u("u2")];
  assertDeepEqual(pickLocalCliResume([...base, a("a2", { cc: { sid: SID, uuid: "x" } })], head), { sid: SID });
  // 后面跟着 localOnly 提示也算
  assertDeepEqual(pickLocalCliResume([...base, a("a2", { cc: { sid: SID } }), a("tip", { localOnly: true })], head), { sid: SID });
  // 删了中间 / 最后一条不是它
  assertEqual(pickLocalCliResume([...base, a("a2", { cc: { sid: SID } }), u("u3"), a("a3")], head), undefined);
  // 最后一条无 cc / 别的模型的回复
  assertEqual(pickLocalCliResume([...base, a("a2")], head), undefined);
  assertEqual(pickLocalCliResume([...base, a("a2", { cc: { sid: SID } }), u("u3"), a("other", { model: "gpt" })], head), undefined);
  // sid 不等
  assertEqual(pickLocalCliResume([...base, a("a2", { cc: { sid: "22222222-2222-4333-8444-555555555555" } })], head), undefined);
  // 旧存档没有 ccHead / 空历史 / 最后一条是 user
  assertEqual(pickLocalCliResume([...base, a("a2", { cc: { sid: SID } })], undefined), undefined);
  assertEqual(pickLocalCliResume([], head), undefined);
  assertEqual(pickLocalCliResume(base, { sid: SID, msgId: "u2" }), undefined);
  // partial
  const stopped = a("a2", { content: `${BANNER}写到一半\n\n${LOCAL_CLI_ABORT_NOTE}`, cc: { sid: SID, partial: true } });
  assertDeepEqual(pickLocalCliResume([...base, stopped], head), { sid: SID, partialText: "写到一半" });
  const empty = a("a2", { content: `${BANNER}${LOCAL_CLI_ABORT_NOTE}`, cc: { sid: SID, partial: true } });
  assertDeepEqual(pickLocalCliResume([...base, empty], head), { sid: SID });
});

function mockBridge(rounds: any[][]) {
  const calls: any[] = [];
  const original = globalThis.fetch;
  let round = 0;
  globalThis.fetch = (async (_url: any, init?: any) => {
    calls.push(init?.body ? JSON.parse(init.body) : null);
    const enc = new TextEncoder();
    const events = rounds[round++] ?? [];
    const stream = new ReadableStream({
      start(c) {
        for (const ev of events) c.enqueue(enc.encode(`data: ${JSON.stringify(ev)}\n\n`));
        c.close();
      },
    });
    return new Response(stream, { status: 200 });
  }) as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = original; } };
}

function stubOrca() {
  const notes: string[] = [];
  const orig = (globalThis as any).orca;
  (globalThis as any).orca = { notify: (_l: string, msg: string) => notes.push(msg) };
  return { notes, restore: () => { (globalThis as any).orca = orig; } };
}

const opts = (conversationId: string, extra: any) => ({
  apiUrl: "http://127.0.0.1:18673",
  apiKey: "t",
  localCli: { conversationId, confirm: async () => false, contextText: "上下文C", instructions: "设定I", ...extra },
});
const msgs = [{ role: "user", content: "第一问" }, { role: "assistant", content: `${BANNER}第一答` }, { role: "user", content: "第二问" }] as any[];
const collect = async (g: AsyncGenerator<any>) => { const out: any[] = []; for await (const c of g) out.push(c); return out; };

test("续接请求：prompt 照旧整段，resume.prompt 只含设定/上下文/半截/当前问题；新中转记 sid 和最后一个 uuid", async () => {
  const m = mockBridge([[
    { type: "session", id: SID, mode: "safe", model: "sonnet", resumed: true },
    { type: "text", delta: "好" },
    { type: "assistant_uuid", uuid: "u-1" },
    { type: "assistant_uuid", uuid: "u-2" },
    { type: "done" },
  ]]);
  const run: LocalCliRun = {};
  try {
    await collect(streamLocalCli(opts("r1", { resume: { sid: SID, partialText: "半截" }, run }), msgs));
    const body = m.calls[0];
    assert(body.prompt.includes("用户：第一问") && body.prompt.endsWith("第二问"), body.prompt);
    assertEqual(body.resume.sid, SID);
    const p = body.resume.prompt;
    assert(p.includes("设定I") && p.includes("上下文C") && p.includes("被用户停止：\n\n半截") && p.endsWith("当前问题：\n第二问"), p);
    assert(!p.includes("第一问") && !p.includes("第一答"), "续接文字不应带历史");
    assertDeepEqual(run, { sid: SID, uuid: "u-2" });
  } finally {
    m.restore();
  }
});

test("不续接时请求体无 resume；新中转 resumed:false 也记 sid", async () => {
  const m = mockBridge([[{ type: "session", id: SID, mode: "safe", resumed: false }, { type: "done" }]]);
  const run: LocalCliRun = {};
  try {
    await collect(streamLocalCli(opts("r2", { run }), msgs));
    assert(!("resume" in m.calls[0]), JSON.stringify(m.calls[0]));
    assertEqual(run.sid, SID);
  } finally {
    m.restore();
  }
});

test("旧中转（session 无 resumed）：请求了续接 → 每个对话只提示一次，不记 sid", async () => {
  const m = mockBridge([
    [{ type: "session", id: "old", mode: "safe" }, { type: "done" }],
    [{ type: "session", id: "old", mode: "safe" }, { type: "done" }],
  ]);
  const o = stubOrca();
  const run: LocalCliRun = {};
  try {
    await collect(streamLocalCli(opts("r3", { resume: { sid: SID }, run }), msgs));
    await collect(streamLocalCli(opts("r3", { resume: { sid: SID }, run }), msgs));
    assertEqual(o.notes.filter((n) => n.includes("续接没生效")).length, 1);
    assertEqual(run.sid, undefined);
  } finally {
    m.restore();
    o.restore();
  }
});

test("resume_failed 且还没输出 → 去掉 resume 整段重发一次，标 resumeFailed；有输出后的 resume_failed 照常报错", async () => {
  const m = mockBridge([
    [{ type: "error", code: "resume_failed", message: "No conversation found" }],
    [{ type: "session", id: "new-sid", mode: "safe", model: "sonnet", resumed: false }, { type: "text", delta: "好" }, { type: "done" }],
  ]);
  const run: LocalCliRun = {};
  try {
    const out = await collect(streamLocalCli(opts("r4", { resume: { sid: SID }, run }), msgs));
    assertEqual(m.calls.length, 2);
    assert(m.calls[0].resume && !("resume" in m.calls[1]), "第二次不应带 resume");
    assertEqual(m.calls[1].prompt, m.calls[0].prompt);
    assertDeepEqual(run, { resumeFailed: true, sid: "new-sid", uuid: undefined });
    assertEqual(out[out.length - 1].result.content, `${BANNER}好`);
  } finally {
    m.restore();
  }
  const m2 = mockBridge([[{ type: "session", id: SID, mode: "safe", resumed: true }, { type: "text", delta: "x" }, { type: "error", code: "resume_failed", message: "boom" }]]);
  try {
    let err: any = null;
    await collect(streamLocalCli(opts("r5", { resume: { sid: SID } }), msgs)).catch((e) => { err = e; });
    assert(err && String(err.message).includes("boom"), String(err));
    assertEqual(m2.calls.length, 1);
  } finally {
    m2.restore();
  }
});
