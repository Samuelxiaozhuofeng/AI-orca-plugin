import { test, assertEqual, assertDeepEqual } from "./test-harness";
import { autostartLocalCli, BRIDGE_APP_PATH } from "../src/services/ai/local-cli-autostart";

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
  (globalThis as any).orca = { invokeBackend: async (...args: any[]) => { calls.open.push(args); } };
  return { calls, restore: () => { globalThis.fetch = origFetch; (globalThis as any).orca = origOrca; } };
}

const local = { id: "l", name: "本机", apiUrl: "http://127.0.0.1:18673/", apiKey: "t", protocol: "local-cli", models: [], enabled: true } as any;
const openai = { ...local, id: "o", protocol: "openai" };
const fast = { intervalMs: 1, maxMs: 10 };

test("autostart：没有 local-cli 平台 → 不探测、不拉起", async () => {
  const s = stub(Infinity);
  try {
    assertEqual(await autostartLocalCli([openai], fast), false);
    assertEqual(s.calls.fetch, 0);
    assertEqual(s.calls.open.length, 0);
  } finally { s.restore(); }
});

test("autostart：一直连不上 → 只 shell-open 一次，重试到上限后放弃", async () => {
  const s = stub(Infinity);
  try {
    assertEqual(await autostartLocalCli([openai, local], fast), false);
    assertDeepEqual(s.calls.open, [["shell-open", BRIDGE_APP_PATH]]);
    assertEqual(s.calls.fetch, 1 + 10);
  } finally { s.restore(); }
});

test("autostart：拉起后第 3 次重试连上 → 立即停止", async () => {
  const s = stub(3);
  try {
    assertEqual(await autostartLocalCli([local], fast), true);
    assertEqual(s.calls.open.length, 1);
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
