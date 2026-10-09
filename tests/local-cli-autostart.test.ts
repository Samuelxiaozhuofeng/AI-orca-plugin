import { test, assert, assertEqual, assertDeepEqual } from "./test-harness";
import { autostartLocalCli, BRIDGE_APP_PATH, fetchWithReconnect } from "../src/services/ai/local-cli-autostart";

// 插件加载时探测 / 拉起本机 AI 中转：orca 与 fetch 打桩，只记调用

function stub(okAfter: number) {
  const calls = { fetch: 0, open: [] as any[][] };
  const origFetch = globalThis.fetch;
  const origOrca = (globalThis as any).orca;
  globalThis.fetch = (async () => {
    calls.fetch++;
    if (calls.fetch > okAfter) return new Response("{}", { status: 200 });
    throw new TypeError("fetch failed");
  }) as typeof fetch;
  (globalThis as any).orca = { state: { dataDir: "/Users/u/.orca" }, invokeBackend: async (...args: any[]) => { calls.open.push(args); } };
  return { calls, restore: () => { globalThis.fetch = origFetch; (globalThis as any).orca = origOrca; } };
}

const local = { id: "l", name: "本机", apiUrl: "http://127.0.0.1:18673/", apiKey: "t", protocol: "local-cli", models: [], enabled: true } as any;
const openai = { ...local, id: "o", protocol: "openai" };
const fast = { intervalMs: 1, maxMs: 30 };

test("autostart：没有 local-cli 平台 → 不探测、不拉起", async () => {
  const s = stub(Infinity);
  try {
    assertEqual(await autostartLocalCli([openai], fast), false);
    assertEqual(s.calls.fetch, 0);
    assertEqual(s.calls.open.length, 0);
  } finally { s.restore(); }
});

test("autostart：一直连不上 → /Applications 和 ~/Applications 各 shell-open 一次，重试到上限后放弃", async () => {
  const s = stub(Infinity);
  try {
    assertEqual(await autostartLocalCli([openai, local], fast), false);
    assertDeepEqual(s.calls.open, [["shell-open", BRIDGE_APP_PATH], ["shell-open", "/Users/u/Applications/Orca Agent Bridge.app"]]);
    assert(s.calls.fetch >= 2, `只探测了 ${s.calls.fetch} 次`);
  } finally { s.restore(); }
});

test("autostart：拉起后第 3 次重试连上 → 立即停止", async () => {
  const s = stub(3);
  try {
    assertEqual(await autostartLocalCli([local], fast), true);
    assertEqual(s.calls.open.length, 2);
    assertEqual(s.calls.fetch, 4);
  } finally { s.restore(); }
});

test("autostart：一开始就通 → 不拉起", async () => {
  const s = stub(0);
  try {
    assertEqual(await autostartLocalCli([local], fast), true);
    assertEqual(s.calls.open.length, 0);
  } finally { s.restore(); }
});

test("H6 probe 一直挂住（连上不回包）→ 每次按超时中止，总用时不超过截止时间", async () => {
  const calls = { fetch: 0, open: 0 };
  const origFetch = globalThis.fetch;
  const origOrca = (globalThis as any).orca;
  // 不回包，只在被中止时失败
  globalThis.fetch = ((_url: any, init?: any) => {
    calls.fetch++;
    return new Promise((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
    });
  }) as typeof fetch;
  (globalThis as any).orca = { invokeBackend: async () => { calls.open++; } };
  const t0 = Date.now();
  try {
    assertEqual(await autostartLocalCli([local], { intervalMs: 20, maxMs: 300, probeMs: 100 }), false);
    const ms = Date.now() - t0;
    assert(ms < 450, `用时 ${ms}ms，超过截止时间`);
    assertEqual(calls.open, 1, "首次 probe 挂住也应超时后去拉起");
    assert(calls.fetch >= 2, `只探测了 ${calls.fetch} 次`);
  } finally {
    globalThis.fetch = origFetch;
    (globalThis as any).orca = origOrca;
  }
});

test("autostart：本机 AI 平台已停用 → 不探测、不拉起", async () => {
  const s = stub(Infinity);
  try {
    assertEqual(await autostartLocalCli([{ ...local, enabled: false }], fast), false);
    assertEqual(s.calls.fetch, 0);
    assertEqual(s.calls.open.length, 0);
  } finally { s.restore(); }
});

test("重连：连接失败 → 拉起 → 重发同一请求一次", async () => {
  let n = 0, up = 0;
  const res = await fetchWithReconnect(async () => { if (++n === 1) throw new TypeError("fetch failed"); return new Response("ok"); }, async () => { up++; return true; });
  assertEqual(await res.text(), "ok");
  assertEqual(n, 2);
  assertEqual(up, 1);
});

test("重连：拉起后仍不通 → 不重发，抛原错误", async () => {
  let n = 0;
  let err: any;
  try { await fetchWithReconnect(async () => { n++; throw new TypeError("fetch failed"); }, async () => false); } catch (e) { err = e; }
  assert(err instanceof TypeError, "应抛原错误");
  assertEqual(n, 1);
});

test("重连：已拿到 HTTP 响应（含 500）→ 不拉起、不重发", async () => {
  let n = 0, up = 0;
  const res = await fetchWithReconnect(async () => { n++; return new Response("x", { status: 500 }); }, async () => { up++; return true; });
  assertEqual(res.status, 500);
  assertEqual(n, 1);
  assertEqual(up, 0);
});

test("重连：等待拉起期间用户停止 → 不重发", async () => {
  const ctrl = new AbortController();
  let n = 0;
  let threw = false;
  try {
    await fetchWithReconnect(async () => { n++; throw new TypeError("fetch failed"); }, async () => { ctrl.abort(); return true; }, ctrl.signal);
  } catch { threw = true; }
  assert(threw, "应抛错");
  assertEqual(n, 1);
});
