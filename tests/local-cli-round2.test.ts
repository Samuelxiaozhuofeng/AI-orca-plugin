import { test, assert, assertEqual } from "./test-harness";
import { streamLocalCli, type LocalCliContext } from "../src/services/ai/local-cli-client";

// 第二轮 G5（不用 AbortSignal.any）/ V2（选模型）的检查；V3 模式行改为正文显示，见 local-cli-round3.test.ts

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
function ctx(conversationId: string, extra: Partial<LocalCliContext> = {}): LocalCliContext {
  return { conversationId, confirm: async () => false, ...extra };
}

async function collect(gen: AsyncGenerator<any>) {
  const out: any[] = [];
  for await (const c of gen) out.push(c);
  return out;
}

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
    await collect(streamLocalCli({ ...base, localCli: ctx("g5", { confirm: async () => true }) }, msgs));
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
    await collect(streamLocalCli({ ...base, model: "opus", localCli: ctx("v2") }, msgs));
    assertEqual(m.calls[0].body.model, "opus");
  } finally {
    m.restore();
  }
});
