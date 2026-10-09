import { test, assert, assertEqual } from "./test-harness";
import { autostartLocalCli, fetchWithReconnect, NotDeliveredError, NOT_DELIVERED } from "../src/services/ai/local-cli-autostart";
import { collectLocalCliImages, imageNotesText } from "../src/services/ai/local-cli-images";
import { buildLocalCliPrompt } from "../src/services/ai/local-cli-client";
import { summarizeToolCall, summarizeToolResult } from "../src/services/ai/local-cli-tool-summary";

// 审码第四轮：超限不重发、中止拉起、坏 base64、历史剥说明段、块引用写法

test("重连：连接失败但中转本来在跑 → 不拉起、不重发，报请求没送到", async () => {
  let n = 0, up = 0;
  let err: any;
  try {
    await fetchWithReconnect(async () => { n++; throw new TypeError("fetch failed"); }, async () => { up++; return true; }, undefined, async () => true);
  } catch (e) { err = e; }
  assert(err instanceof NotDeliveredError, "应抛 NotDeliveredError");
  assertEqual(err.message, NOT_DELIVERED);
  assertEqual(n, 1);
  assertEqual(up, 0);
});

test("重连：中转本来没在跑 → 拉起后重发一次", async () => {
  let n = 0;
  const res = await fetchWithReconnect(async () => { if (++n === 1) throw new TypeError("fetch failed"); return new Response("ok"); }, async () => true, undefined, async () => false);
  assertEqual(await res.text(), "ok");
  assertEqual(n, 2);
});

test("autostart：已中止 → 立即返回 false，不探测、不 shell-open", async () => {
  const calls = { fetch: 0, open: 0 };
  const origFetch = globalThis.fetch, origOrca = (globalThis as any).orca;
  globalThis.fetch = (async () => { calls.fetch++; throw new TypeError("fetch failed"); }) as typeof fetch;
  (globalThis as any).orca = { state: { dataDir: "/Users/u/.orca" }, invokeBackend: async () => { calls.open++; } };
  const ctrl = new AbortController();
  ctrl.abort();
  try {
    assertEqual(await autostartLocalCli([{ apiUrl: "http://127.0.0.1:1", apiKey: "t", protocol: "local-cli" } as any], { signal: ctrl.signal }), false);
    assertEqual(calls.fetch, 0);
    assertEqual(calls.open, 0);
  } finally { globalThis.fetch = origFetch; (globalThis as any).orca = origOrca; }
});

test("autostart：等待重试期间中止 → 立刻返回，不再重试", async () => {
  let fetches = 0;
  const origFetch = globalThis.fetch, origOrca = (globalThis as any).orca;
  globalThis.fetch = (async () => { fetches++; throw new TypeError("fetch failed"); }) as typeof fetch;
  (globalThis as any).orca = { state: { dataDir: "/Users/u/.orca" }, invokeBackend: async () => {} };
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), 50);
  const t0 = Date.now();
  try {
    assertEqual(await autostartLocalCli([{ apiUrl: "http://127.0.0.1:1", apiKey: "t", protocol: "local-cli" } as any], { signal: ctrl.signal, intervalMs: 1000, maxMs: 10000 }), false);
    assert(Date.now() - t0 < 500, `用时 ${Date.now() - t0}ms`);
    assertEqual(fetches, 1);
  } finally { globalThis.fetch = origFetch; (globalThis as any).orca = origOrca; }
});

test("图片：坏 base64 被跳过并写说明，好图照发", async () => {
  const msg: any = { role: "user", content: [
    { type: "image_url", image_url: { url: "data:image/png;base64,abc" } },
    { type: "image_url", image_url: { url: "data:image/png;base64,ab$=" } },
    { type: "image_url", image_url: { url: "data:image/png;base64,QUJD" } },
  ] };
  const { images, notes } = await collectLocalCliImages(msg);
  assertEqual(images.length, 1);
  assertEqual(images[0].data, "QUJD");
  assertEqual(notes.length, 2);
  assert(notes.every((n) => n.includes("不是合法 base64")), notes.join("|"));
});

test("历史：插件写的「没能发给本机 AI」说明段被剥掉，正文中间同样字样保留", () => {
  const body = "回答正文\n> 没能发给本机 AI：这是 AI 自己写的引用\n结尾";
  const prompt = buildLocalCliPrompt([
    { role: "user", content: "问1" },
    { role: "assistant", content: body + imageNotesText(["第 1 张图片太大", "「a.pdf」没有读出来"]) },
    { role: "assistant", content: "旧回复\n\n> 这张图片没能发给本机 AI：旧版说明" },
    { role: "user", content: "问2" },
  ] as any);
  assert(prompt.includes(body), prompt);
  assert(!prompt.includes("太大") && !prompt.includes("a.pdf") && !prompt.includes("旧版说明"), prompt);
  assert(!imageNotesText(["x"]).includes("这张图片"), "说明不再一律说「这张图片」");
});

test("工具摘要：子任务描述 / 工具名里的块引用写法不会变成块链接", () => {
  const line = summarizeToolCall({ name: "Task", input: { description: "看 ((123)) orca-block:45 blockid 67 块 #89" } });
  for (const re of [/\(\(\d/, /orca-block:\d/i, /blockid\s*\d/i, /块\s*#?\d/]) assert(!re.test(line), `${re} 命中：${line}`);
  const fail = summarizeToolResult({ name: "orca-block:12", ok: false });
  assert(!/orca-block:\d/.test(fail), fail);
});
