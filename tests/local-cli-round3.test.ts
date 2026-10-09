import { test, assert, assertEqual, assertDeepEqual } from "./test-harness";
import { buildLocalCliPrompt, streamLocalCli, type LocalCliContext } from "../src/services/ai/local-cli-client";

// 第三轮 H1（每次都新开、发压缩历史）/ H3（模式行在正文开头、压缩历史时剥掉、完全放开每对话提醒一次）的检查

/** 模拟 bridge：/chat 按轮返回 SSE 事件 */
function mockBridge(rounds: any[][]) {
  const calls: Array<{ url: string; body: any }> = [];
  const original = globalThis.fetch;
  let round = 0;
  globalThis.fetch = (async (url: any, init?: any) => {
    calls.push({ url: String(url), body: init?.body ? JSON.parse(init.body) : null });
    const enc = new TextEncoder();
    const events = rounds[round++] ?? [];
    const stream = new ReadableStream({
      start(controller) {
        for (const ev of events) controller.enqueue(enc.encode(`data: ${JSON.stringify(ev)}\n\n`));
        controller.close();
      },
    });
    return new Response(stream, { status: 200 });
  }) as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = original; } };
}

/** orca.notify 打桩，记下 (级别, 文案) */
function stubOrca() {
  const notes: string[][] = [];
  const orig = (globalThis as any).orca;
  (globalThis as any).orca = { notify: (level: string, msg: string) => notes.push([level, msg]) };
  return { notes, restore: () => { (globalThis as any).orca = orig; } };
}

const base = { apiUrl: "http://127.0.0.1:18673", apiKey: "t" };
const ctx = (conversationId: string): LocalCliContext => ({ conversationId, confirm: async () => false });
const SAFE = "本机 AI · 模型 sonnet · 安全模式\n\n";

async function collect(gen: AsyncGenerator<any>) {
  const out: any[] = [];
  for await (const c of gen) out.push(c);
  return out;
}

test("H1 连发两轮：发送体都不带 sessionId，第二轮 prompt 含可见历史、不含模式行", async () => {
  const m = mockBridge([
    [{ type: "session", id: "s-h1", mode: "safe", model: "sonnet" }, { type: "text", delta: "第一答" }, { type: "done" }],
    [{ type: "session", id: "s-h1b", mode: "safe", model: "sonnet" }, { type: "done" }],
  ]);
  try {
    const first = await collect(streamLocalCli({ ...base, localCli: ctx("h1") }, [{ role: "user", content: "第一问" }] as any[]));
    const answer = first[first.length - 1].result.content;
    assert(answer.startsWith(SAFE), answer);
    const msgs = [
      { role: "user", content: "第一问" },
      { role: "assistant", content: answer },
      { role: "user", content: "第二问" },
    ] as any[];
    await collect(streamLocalCli({ ...base, localCli: ctx("h1") }, msgs));
    for (const c of m.calls) assert(!("sessionId" in c.body), `发送体带了 sessionId：${JSON.stringify(c.body)}`);
    const prompt = m.calls[1].body.prompt;
    assert(prompt.includes("用户：第一问") && prompt.includes("助手：第一答") && prompt.endsWith("第二问"), prompt);
    assert(!prompt.includes("本机 AI · 模型"), "压缩历史里混进了模式行");
  } finally {
    m.restore();
  }
});

test("H3 session 事件后正文首行是模式行，不进 reasoning；老 bridge 不带 mode 不显示", async () => {
  const m = mockBridge([
    [{ type: "session", id: "s", mode: "safe", model: "sonnet" }, { type: "thinking", delta: "1. 想" }, { type: "text", delta: "好" }, { type: "done" }],
    [{ type: "session", id: "s-old" }, { type: "text", delta: "好" }, { type: "done" }],
  ]);
  try {
    const out = await collect(streamLocalCli({ ...base, localCli: ctx("h3") }, [{ role: "user", content: "问" }] as any[]));
    assertDeepEqual(out[0], { type: "content", content: SAFE });
    const result = out[out.length - 1].result;
    assertEqual(result.content, `${SAFE}好`);
    assert(!result.reasoning.includes("本机 AI"), "模式行不应进 reasoning");
    const old = await collect(streamLocalCli({ ...base, localCli: ctx("h3-old") }, [{ role: "user", content: "问" }] as any[]));
    assertEqual(old[old.length - 1].result.content, "好");
  } finally {
    m.restore();
  }
});

test("H3 完全放开：模式行带 ⚠，每个对话只额外提醒一次", async () => {
  const full = [{ type: "session", id: "s", mode: "full", model: "opus" }, { type: "done" }];
  const m = mockBridge([full, full, full]);
  const o = stubOrca();
  try {
    const out = await collect(streamLocalCli({ ...base, localCli: ctx("h3-full") }, [{ role: "user", content: "问" }] as any[]));
    assertEqual(out[0].content, "本机 AI · 模型 opus · ⚠ 完全放开模式\n\n");
    await collect(streamLocalCli({ ...base, localCli: ctx("h3-full") }, [{ role: "user", content: "问" }] as any[]));
    assertEqual(o.notes.length, 1, "同一对话应只提醒一次");
    assertEqual(o.notes[0][0], "warn");
    await collect(streamLocalCli({ ...base, localCli: ctx("h3-full-2") }, [{ role: "user", content: "问" }] as any[]));
    assertEqual(o.notes.length, 2, "另一个对话应再提醒一次");
  } finally {
    o.restore();
    m.restore();
  }
});

test("H3 压缩历史剥掉完全放开模式行，只剥开头那一行", () => {
  const prompt = buildLocalCliPrompt([
    { role: "user", content: "问" },
    { role: "assistant", content: "本机 AI · 模型 opus · ⚠ 完全放开模式\n\n答" },
    { role: "user", content: "再问" },
  ] as any[]);
  assert(prompt.includes("助手：答") && !prompt.includes("完全放开"), prompt);
});

test("R4 面板逐块 trim 累加时模式行仍单独成段，中止残留也能被剥掉", async () => {
  const m = mockBridge([[{ type: "session", id: "s", mode: "full", model: "sonnet" }, { type: "text", delta: "好的" }, { type: "done" }]]);
  const n = stubOrca();
  try {
    const out = await collect(streamLocalCli({ ...base, localCli: ctx("r4") }, [{ role: "user", content: "问" }] as any[]));
    let shown = "";
    for (const c of out) if (c.type === "content") shown = (shown + c.content).trim();
    assert(/完全放开模式\n\n好的$/.test(shown), JSON.stringify(shown));
    const prompt = buildLocalCliPrompt([
      { role: "user", content: "问" },
      { role: "assistant", content: "本机 AI · 模型 sonnet · ⚠ 完全放开模式好的" },
      { role: "user", content: "再问" },
    ] as any[]);
    assert(!prompt.includes("本机 AI · 模型") && prompt.includes("助手：好的"), prompt);
  } finally {
    m.restore();
    n.restore();
  }
});

test("R5 模式行后首块是纯空白时，等可见正文再分段（中止前也不粘连）", async () => {
  const m = mockBridge([[{ type: "session", id: "s", mode: "safe", model: "sonnet" }, { type: "text", delta: "\n" }, { type: "text", delta: "好的" }]]);
  try {
    let shown = "";
    try {
      for await (const c of streamLocalCli({ ...base, localCli: ctx("r5") }, [{ role: "user", content: "问" }] as any[])) {
        if (c.type === "content") shown = (shown + c.content).trim();
      }
    } catch {}
    assert(/安全模式\n\n好的$/.test(shown), JSON.stringify(shown));
  } finally {
    m.restore();
  }
});
