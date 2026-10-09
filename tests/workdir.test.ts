import { test, assert, assertEqual, assertDeepEqual } from "./test-harness";
import { BANNER_RE, sessionBanner, buildLocalCliPrompt, streamLocalCli } from "../src/services/ai/local-cli-client";

// 每个对话单独选工作文件夹：模式行新格式（带文件夹段）、新旧模式行都能剥、请求体带 workDir、旧中转提示一次

test("W sessionBanner：带 cwd 加文件夹段（完整路径），不带 cwd 同旧格式", () => {
  assertEqual(
    sessionBanner({ mode: "full", model: "opus", cwd: "/Users/Shared/demo" }),
    "本机 AI · 模型 opus · ⚠ 完全放开模式 · 文件夹「/Users/Shared/demo」\n\n",
  );
  assertEqual(sessionBanner({ mode: "safe", model: "sonnet", cwd: "/opt/work" }), "本机 AI · 模型 sonnet · 安全模式 · 文件夹「/opt/work」\n\n");
  assertEqual(sessionBanner({ mode: "safe", model: "sonnet" }), "本机 AI · 模型 sonnet · 安全模式\n\n");
  assertEqual(sessionBanner({ mode: "safe", cwd: "/home/u" }), "本机 AI · 模型 claude · 安全模式 · 文件夹「/home/u」\n\n");
  // 路径里的 」和换行换掉，生成的模式行整行能被剥掉
  const odd = sessionBanner({ mode: "safe", model: "m", cwd: "/tmp/a」b\nc" })!;
  assertEqual((odd + "正文").replace(BANNER_RE, ""), "正文");
});

test("W BANNER_RE：剥新旧两种模式行，换行被 trim 掉也行，正文不误伤", () => {
  const cases: Array<[string, string]> = [
    ["本机 AI · 模型 sonnet · 安全模式\n\n正文", "正文"],
    ["本机 AI · 模型 opus · ⚠ 完全放开模式正文", "正文"],
    ["本机 AI · 模型 opus · ⚠ 完全放开模式 · 文件夹「~/a b/c」\n\n正文", "正文"],
    ["本机 AI · 模型 x · 安全模式 · 文件夹「/opt/w」正文 · 文件夹「不是」", "正文 · 文件夹「不是」"],
  ];
  for (const [input, want] of cases) assertEqual(input.replace(BANNER_RE, ""), want);
  const prompt = buildLocalCliPrompt([
    { role: "user", content: "问1" },
    { role: "assistant", content: "本机 AI · 模型 opus · ⚠ 完全放开模式 · 文件夹「~/p」答1" },
    { role: "user", content: "问2" },
  ] as any[]);
  assert(prompt.includes("助手：答1") && !prompt.includes("文件夹「"), prompt);
});

test("W 请求体：有 workDir 才发；选了文件夹而中转不回 cwd → 每个对话只提示一次", async () => {
  const bodies: any[] = [];
  const original = globalThis.fetch;
  const origOrca = (globalThis as any).orca;
  const notes: string[] = [];
  (globalThis as any).orca = { notify: (_l: string, msg: string) => notes.push(msg) };
  globalThis.fetch = (async (_url: any, init?: any) => {
    bodies.push(JSON.parse(init.body));
    const enc = new TextEncoder();
    const evs = [{ type: "session", id: "s", mode: "safe", model: "m" }, { type: "done" }];
    return new Response(new ReadableStream({ start(c) { for (const e of evs) c.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`)); c.close(); } }), { status: 200 });
  }) as typeof fetch;
  try {
    const run = async (conversationId: string, workDir?: string) => {
      for await (const _ of streamLocalCli({ apiUrl: "http://x", apiKey: "t", localCli: { conversationId, workDir, confirm: async () => false } }, [{ role: "user", content: "q" }] as any[])) {}
    };
    await run("w1", "  ");
    await run("w1", " ~/p ");
    await run("w1", "~/p");
    await run("w2", "~/q");
    assert(!("workDir" in bodies[0]), "空白 workDir 不应发送");
    assertEqual(bodies[1].workDir, "~/p");
    assertDeepEqual(notes.filter((n) => n.includes("中转程序是旧版")).length, 2);
  } finally {
    globalThis.fetch = original;
    (globalThis as any).orca = origOrca;
  }
});
