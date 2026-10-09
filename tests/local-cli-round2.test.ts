import { test, assert, assertEqual } from "./test-harness";
import {
  finishLocalCliRound,
  priorFingerprint,
  sessionBanner,
  streamLocalCli,
  type LocalCliContext,
} from "../src/services/ai/local-cli-client";

// 第二轮 G2（续接指纹）/ G5（不用 AbortSignal.any）/ V2（选模型）/ V3（模式说明行）的检查

/** 模拟 bridge：/chat 按轮返回 SSE 事件（函数项 = 等待）；/permission 回 200 */
function mockBridge(rounds: any[][]) {
  const calls: Array<{ url: string; body: any }> = [];
  const original = globalThis.fetch;
  let round = 0;
  globalThis.fetch = (async (url: any, init?: any) => {
    const body = init?.body ? JSON.parse(init.body) : null;
    calls.push({ url: String(url), body });
    if (String(url).endsWith("/permission")) return new Response("{}", { status: 200 });
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
  { role: "user", content: "第一问" },
  { role: "assistant", content: "第一答" },
  { role: "user", content: "第二问" },
] as any[];
const u = (id: string) => ({ id, role: "user" });
const a = (id: string) => ({ id, role: "assistant" });
const H1 = [u("u1"), a("a1"), u("u2")];
const END1 = [...H1, a("a2")]; // 第一轮结束后的可见消息

function ctx(conversationId: string, history: LocalCliContext["history"], extra: Partial<LocalCliContext> = {}): LocalCliContext {
  return { conversationId, history, confirm: async () => false, ...extra };
}

async function collect(gen: AsyncGenerator<any>) {
  const out: any[] = [];
  for await (const c of gen) out.push(c);
  return out;
}

/** 首轮建会话并按 end 收尾，再按 next 发第二轮，返回第二轮发出的 sessionId */
async function secondRoundSession(conv: string, end: any[] | null, next: LocalCliContext["history"]) {
  const m = mockBridge([[{ type: "session", id: `s-${conv}` }, { type: "done" }], [{ type: "done" }]]);
  try {
    await collect(streamLocalCli({ ...base, localCli: ctx(conv, H1) }, msgs));
    if (end) finishLocalCliRound(conv, end);
    await collect(streamLocalCli({ ...base, localCli: ctx(conv, next) }, msgs));
    return m.calls[1].body.sessionId;
  } finally {
    m.restore();
  }
}

test("G2 指纹 = 新用户消息之前的全部可见 id（含助手回复）", () => {
  assertEqual(priorFingerprint([...END1, u("u3")]), "u1,a1,u2,a2");
  assertEqual(priorFingerprint([u("u1")]), "");
});

test("G2 本轮收尾后历史未变 → 续接", async () => {
  assertEqual(await secondRoundSession("g2-ok", END1, [...END1, u("u3")]), "s-g2-ok");
});

test("G2 收尾时忽略 localOnly 消息", async () => {
  const end = [...END1, { id: "note", role: "assistant", localOnly: true }];
  assertEqual(await secondRoundSession("g2-local", end, [...END1, u("u3")]), "s-g2-local");
});

test("G2 回档删掉末条助手回复 → 不续接", async () => {
  assertEqual(await secondRoundSession("g2-rb", END1, [...H1, u("u3")]), undefined);
});

test("G2 空分支 → 不续接", async () => {
  assertEqual(await secondRoundSession("g2-br", END1, [u("u1"), u("u9")]), undefined);
});

test("G2 删掉中间的助手消息 / 换成别的助手回复 → 不续接", async () => {
  assertEqual(await secondRoundSession("g2-del", END1, [u("u1"), u("u2"), a("a2"), u("u3")]), undefined);
  assertEqual(await secondRoundSession("g2-swap", END1, [...H1, a("a2b"), u("u3")]), undefined);
});

test("G2 上轮没收尾（中止后换走、出错前就被作废）→ 不续接", async () => {
  assertEqual(await secondRoundSession("g2-open", null, [...END1, u("u3")]), undefined);
});

test("G2 已收尾的会话不被后来的收尾覆盖（如其他平台的一轮）", async () => {
  const m = mockBridge([[{ type: "session", id: "s-g2-twice" }, { type: "done" }], [{ type: "done" }]]);
  try {
    await collect(streamLocalCli({ ...base, localCli: ctx("g2-twice", H1) }, msgs));
    finishLocalCliRound("g2-twice", END1);
    finishLocalCliRound("g2-twice", [...END1, u("x"), a("y")]);
    await collect(streamLocalCli({ ...base, localCli: ctx("g2-twice", [...END1, u("u3")]) }, msgs));
    assertEqual(m.calls[1].body.sessionId, "s-g2-twice");
  } finally {
    m.restore();
  }
});

test("G5 没有 AbortSignal.any 也能提交确认结果", async () => {
  const anySignal = (AbortSignal as any).any;
  (AbortSignal as any).any = undefined;
  let posted!: () => void;
  const permissionPosted = new Promise<void>((r) => { posted = r; });
  const m = mockBridge([[{ type: "permission", requestId: "g5", tool: "Bash", input: {} }, () => permissionPosted, { type: "done" }]]);
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: any, init?: any) => {
    const res = await original(url, init);
    if (String(url).endsWith("/permission")) posted();
    return res;
  }) as typeof fetch;
  try {
    await collect(streamLocalCli({ ...base, localCli: ctx("g5", H1, { confirm: async () => true }) }, msgs));
    const perm = m.calls.find((c) => c.url.endsWith("/permission"));
    assert(perm && perm.body.allow === true, "确认结果没提交");
  } finally {
    globalThis.fetch = original;
    m.restore();
    (AbortSignal as any).any = anySignal;
  }
});

test("V2 所选模型 id 随 /chat 发给 bridge", async () => {
  const m = mockBridge([[{ type: "done" }]]);
  try {
    await collect(streamLocalCli({ ...base, model: "opus", localCli: ctx("v2", H1) }, msgs));
    assertEqual(m.calls[0].body.model, "opus");
  } finally {
    m.restore();
  }
});

test("V3 回复开头显示模式说明行；老 bridge 不带 mode 时不显示", async () => {
  assertEqual(sessionBanner({ type: "session", id: "s", mode: "safe", model: "sonnet" }), "本机 AI · 模型 sonnet · 安全模式\n");
  assertEqual(sessionBanner({ type: "session", id: "s", mode: "full", model: "opus" }), "本机 AI · 模型 opus · ⚠ 完全放开模式\n");
  assertEqual(sessionBanner({ type: "session", id: "s" }), null);
  const m = mockBridge([
    [{ type: "session", id: "s-v3", mode: "full", model: "opus" }, { type: "text", delta: "好" }, { type: "done" }],
    [{ type: "session", id: "s-v3-old" }, { type: "text", delta: "好" }, { type: "done" }],
  ]);
  try {
    const out = await collect(streamLocalCli({ ...base, localCli: ctx("v3", H1) }, msgs));
    assertEqual(out[0].type, "reasoning");
    assert(out[0].reasoning.includes("⚠ 完全放开模式") && out[0].reasoning.includes("opus"), out[0].reasoning);
    const old = await collect(streamLocalCli({ ...base, localCli: ctx("v3-old", H1) }, msgs));
    assert(!old.some((c) => c.type === "reasoning"), "老 bridge 不应显示模式说明");
  } finally {
    m.restore();
  }
});
