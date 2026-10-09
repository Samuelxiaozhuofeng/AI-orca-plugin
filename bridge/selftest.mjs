// bridge 自检：用假 claude 子进程验证令牌 401、断开杀子进程、心跳、权限回包、
// 跨块汉字、断开后权限作废、exit 早于 stdout 读完、启动输出无令牌、/models、MCP 令牌不进环境变量；
// 第二轮：退出/中止删临时目录、启动清扫、exit 后强制结束、受管配置警告、完全放开模式、选模型；
// 第三轮：不续接、旧命名残留清扫、配置权限、无配置安全模式、App 的 launch.sh 写默认配置与 PATH 顺序；
// 续接第一段：--resume、非法 sid 忽略、resumed 标记、assistant uuid、续接早退 resume_failed、同会话先停旧进程。
// 运行：node bridge/selftest.mjs（不需要真 claude，不碰 ~/.orca-agent-bridge）
import { spawn, execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const bridgePath = fileURLToPath(new URL("./orca-agent-bridge.mjs", import.meta.url));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "orca-bridge-test-"));
const fake = path.join(tmp, "fake-claude.mjs");
fs.writeFileSync(fake, `#!/usr/bin/env node
import fs from "node:fs";
import { spawn } from "node:child_process";
const log = (name, s) => fs.appendFileSync(${JSON.stringify(tmp)} + "/" + name, s + "\\n");
const argv = process.argv.slice(2);
if (argv.includes(JSON.stringify({ disableAllHooks: true }))) {
  // 中转启动时查模型列表：ORCA_FAKE_MODELS=ok 回列表、junk 回乱码、其他不回
  log("models.log", JSON.stringify({ pid: process.pid, argv, cwd: process.cwd() }));
  const mode = process.env.ORCA_FAKE_MODELS;
  process.stdin.on("data", (d) => {
    if (!String(d).includes('"initialize"')) return;
    if (mode === "ok") fs.writeSync(1, JSON.stringify({ type: "control_response", response: { subtype: "success", request_id: "models", response: { models: [{ value: "default", displayName: "Default" }, { value: "opus", displayName: "Opus 9" }, { value: "claude-new-1", displayName: "New 1" }, { value: "opus" }, { value: "bad name" }] } } }) + "\\n");
    if (mode === "junk") fs.writeSync(1, "not json\\n" + JSON.stringify({ type: "control_response", response: { subtype: "success", response: { models: "x" } } }) + "\\n");
  });
  process.stdin.on("end", () => process.exit(0));
  setInterval(() => {}, 1000);
} else {
log("args.log", JSON.stringify(argv));
log("cwd.log", process.cwd());
const modelAt = argv.indexOf("--model");
const mcpAt = process.argv.indexOf("--mcp-config");
if (mcpAt > 0) {
  const f = process.argv[mcpAt + 1];
  const mode = (p) => (fs.statSync(p).mode & 0o777).toString(8);
  log("mcp.log", JSON.stringify({ file: f, mode: mode(f), dirMode: mode(f.slice(0, f.lastIndexOf("/"))), body: fs.readFileSync(f, "utf8"), env: JSON.stringify(process.env) }));
}
const out = (m) => fs.writeSync(1, JSON.stringify(m) + "\\n");
let buf = "", prompt = null;
process.stdin.on("data", (d) => {
  buf += d; let i;
  while ((i = buf.indexOf("\\n")) >= 0) {
    const m = JSON.parse(buf.slice(0, i)); buf = buf.slice(i + 1);
    if (m.type === "user") start(m.message.content);
    if (m.type === "control_response") { log("resp.log", JSON.stringify(m)); finishOk(); }
  }
});
function finishOk() {
  out({ type: "stream_event", parent_tool_use_id: null, event: { type: "content_block_delta", delta: { type: "text_delta", text: "hello" } } });
  out({ type: "result", subtype: "success", is_error: false });
}
function start(p) {
  log("pid.log", String(process.pid));
  log("prompt.log", JSON.stringify(p));
  log("order.log", "start " + process.pid);
  const resumeAt = argv.indexOf("--resume");
  const sid = resumeAt > 0 ? argv[resumeAt + 1] : (/sid=(\\S+)/.exec(p)?.[1] ?? "fake-sess");
  if (sid.endsWith("dead")) { process.stderr.write("No conversation found with session ID: " + sid); process.exit(1); }
  const bypass = p.includes("badmode") || (argv.includes("bypassPermissions") && !p.includes("safemode"));
  out({ type: "system", subtype: "init", session_id: sid, permissionMode: bypass ? "bypassPermissions" : "default", model: modelAt > 0 ? "fake-" + argv[modelAt + 1] : "fake-default" });
  if (p.includes("permcjk")) {
    // 把一行 JSON 从某个汉字中间切成两次写出，模拟管道按字节分块
    const line = Buffer.from(JSON.stringify({ type: "control_request", request_id: "r-cjk", request: { subtype: "can_use_tool", tool_name: "Write", input: { content: "汉".repeat(5000) } } }) + "\\n");
    const cut = line.indexOf(Buffer.from("汉")) + 1;
    fs.writeSync(1, line.subarray(0, cut));
    return setTimeout(() => fs.writeSync(1, line.subarray(cut)), 150);
  }
  if (p.includes("permhang")) {
    process.on("SIGTERM", () => {}); // 模拟收到 SIGTERM 后迟迟不退出
    setInterval(() => {}, 1000);
    return out({ type: "control_request", request_id: "r-hang", request: { subtype: "can_use_tool", tool_name: "Bash", input: { command: "touch y" } } });
  }
  if (p.includes("lateout")) {
    // 孙进程继承 stdout，自己先退出：exit 先到，最终输出 300ms 后才写完
    const late = [{ type: "stream_event", parent_tool_use_id: null, event: { type: "content_block_delta", delta: { type: "text_delta", text: "late" } } }, { type: "result", subtype: "success", is_error: false }];
    const code = "setTimeout(() => process.stdout.write(" + JSON.stringify(late.map((m) => JSON.stringify(m) + "\\n").join("")) + "), 300)";
    spawn(process.execPath, ["-e", code], { stdio: ["ignore", "inherit", "inherit"] });
    return process.exit(0);
  }
  if (p.includes("linger")) {
    // 孙进程继承 stdout 且一直不写也不退出，自己不给 result 就退出：close 迟迟不来
    const g = spawn(process.execPath, ["-e", "setTimeout(() => {}, 20000)"], { stdio: ["ignore", "inherit", "inherit"] });
    log("linger.log", String(g.pid));
    return process.exit(3);
  }
  if (p.includes("uuidrun")) {
    out({ type: "assistant", uuid: "u-1", parent_tool_use_id: null, message: { content: [{ type: "text", text: "a" }] } });
    out({ type: "assistant", uuid: "u-sub", parent_tool_use_id: "t1", message: { content: [{ type: "text", text: "sub" }] } });
    out({ type: "assistant", uuid: "u-2", parent_tool_use_id: null, message: { content: [{ type: "text", text: "b" }] } });
    return finishOk();
  }
  if (p.includes("toolrun")) {
    out({ type: "assistant", uuid: "u-t", parent_tool_use_id: null, message: { content: [{ type: "tool_use", id: "t1", name: "Task", input: { description: "查资料" } }] } });
    out({ type: "assistant", uuid: "u-s", parent_tool_use_id: "t1", message: { content: [{ type: "text", text: "subtext" }, { type: "tool_use", id: "s1", name: "Read", input: { file_path: "/a/b.md" } }, { type: "tool_use", id: "s2", name: "Bash", input: { command: "ls" } }] } });
    out({ type: "user", parent_tool_use_id: "t1", message: { content: [{ type: "tool_result", tool_use_id: "s1", is_error: false, content: "ok" }, { type: "tool_result", tool_use_id: "s2", is_error: true, content: "sub fail" }] } });
    out({ type: "user", parent_tool_use_id: null, message: { content: [{ type: "tool_result", tool_use_id: "t1", is_error: true, content: [{ type: "text", text: "line1\\n" + "x".repeat(400) }] }] } });
    return out({ type: "result", subtype: "success", is_error: false, total_cost_usd: 0.0123, usage: { input_tokens: 10, cache_creation_input_tokens: 100, cache_read_input_tokens: 1000, output_tokens: 50 } });
  }
  if (p.includes("textcrash")) {
    out({ type: "stream_event", parent_tool_use_id: null, event: { type: "content_block_delta", delta: { type: "text_delta", text: "x" } } });
    return setTimeout(() => process.exit(2), 50);
  }
  if (p.includes("termhang")) { process.on("SIGTERM", () => log("order.log", "ignore " + process.pid)); return setInterval(() => {}, 1000); }
  if (p.includes("slowhang")) {
    process.on("SIGTERM", () => { log("order.log", "term " + process.pid); setTimeout(() => process.exit(0), 300); });
    return setInterval(() => {}, 1000);
  }
  if (p.includes("afterresult")) { finishOk(); return setInterval(() => {}, 1000); } // 给完 result 不退出
  if (p.includes("hang")) return setInterval(() => {}, 1000);
  if (p.includes("crash")) { process.stderr.write("boom"); process.exit(2); }
  if (p.includes("perm")) return out({ type: "control_request", request_id: "r1", request: { subtype: "can_use_tool", tool_name: "Bash", input: { command: "touch x" }, permission_suggestions: [{ type: "addRules" }] } });
  finishOk();
}
}
`, { mode: 0o755 });

/** 起一个 bridge 实例；TMPDIR 指到自检目录下，不碰系统临时目录；受管配置默认指向不存在的文件，不读真 /Library */
async function startBridge(name, extraArgs = [], extraEnv = {}, withDir = true) {
  const tmpdir = path.join(tmp, `tmp-${name}`);
  fs.mkdirSync(tmpdir, { recursive: true });
  const dirArgs = withDir ? ["--dir", path.join(tmp, "work")] : [];
  const proc = spawn(process.execPath, [bridgePath, "--port", "0", ...dirArgs, ...extraArgs], {
    env: { ...process.env, TMPDIR: tmpdir, ORCA_BRIDGE_HOME: path.join(tmp, "home"), ORCA_BRIDGE_CLAUDE: fake, ORCA_BRIDGE_HEARTBEAT_MS: "200", ORCA_BRIDGE_MANAGED_SETTINGS: path.join(tmp, "no-managed.json"), ...extraEnv },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const inst = { proc, tmpdir, out: "", base: "" };
  inst.base = await new Promise((resolve, reject) => {
    const onData = (d) => {
      inst.out += d;
      const m = inst.out.match(/http:\/\/127\.0\.0\.1:(\d+)/);
      if (m) setTimeout(() => resolve(`http://127.0.0.1:${m[1]}`), 50); // 等启动提示输出完
    };
    proc.stdout.on("data", onData);
    proc.stderr.on("data", onData);
    proc.on("exit", () => reject(new Error(`bridge ${name} 提前退出：${inst.out}`)));
  });
  return inst;
}
// 默认配置（首次生成）是完全放开；主实例显式写安全模式配置，下面的老检查都按安全模式
fs.mkdirSync(path.join(tmp, "home"), { recursive: true });
fs.writeFileSync(path.join(tmp, "home", "config.json"), JSON.stringify({ fullAccess: false, dirs: [] }));
const main = await startBridge("main");
const bridge = main.proc;
const base = main.base;
const bridgeOut = main.out;
const token = fs.readFileSync(path.join(tmp, "home", "token"), "utf8").trim();
const auth = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const readLog = (name) => (fs.existsSync(path.join(tmp, name)) ? fs.readFileSync(path.join(tmp, name), "utf8") : "");

async function chat(body, onText, at = base) {
  const res = await fetch(`${at}/chat`, { method: "POST", headers: auth, body: JSON.stringify(body), signal: body.signal });
  if (res.status !== 200) return { status: res.status };
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let raw = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    raw += dec.decode(value, { stream: true });
    if (onText && (await onText(raw)) === "stop") break;
  }
  const events = raw.split("\n\n").filter((b) => b.startsWith("data:")).map((b) => JSON.parse(b.slice(5)));
  return { status: 200, events, raw };
}

const lastArgs = () => JSON.parse(readLog("args.log").trim().split("\n").pop());
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const others = [];
const checkTools = (args, full = false) => {
  assert.equal(args[args.indexOf("--tools") + 1], (full ? "Task,Skill," : "") + "Bash,Edit,Glob,Grep,NotebookEdit,Read,TaskStop,ToolSearch,WebFetch,WebSearch,Write");
  assert.ok(args.includes("--chrome"), "--chrome");
};
const results = [];
async function check(name, fn) {
  try { await fn(); results.push(`PASS ${name}`); }
  catch (err) { results.push(`FAIL ${name}: ${err.message}`); }
}

try {
  await check("无令牌/错令牌 401 且不启动进程", async () => {
    const a = await fetch(`${base}/chat`, { method: "POST", body: "{}" });
    const b = await fetch(`${base}/chat`, { method: "POST", headers: { Authorization: "Bearer wrong" }, body: JSON.stringify({ prompt: "hi" }) });
    assert.equal(a.status, 401);
    assert.equal(b.status, 401);
    assert.equal(readLog("args.log"), "");
  });

  await check("正常回复：session/text/done，参数不放宽权限", async () => {
    const r = await chat({ prompt: "hi" });
    assert.deepEqual(r.events.map((e) => e.type), ["session", "text", "done"]);
    const args = JSON.parse(readLog("args.log").trim().split("\n").pop());
    for (const flag of ["--restricted", "--strict-mcp-config", "--permission-prompt-tool"]) assert.ok(args.includes(flag), flag);
    assert.equal(args[args.indexOf("--permission-mode") + 1], "manual");
    assert.ok(!args.some((a) => /bypass|dangerously/i.test(a)));
    checkTools(args);
  });

  await check("权限：permission 事件 → 允许 → done，回包不带 updatedPermissions", async () => {
    let answered = false;
    const r = await chat({ prompt: "perm" }, async (raw) => {
      if (!answered && raw.includes('"permission"')) {
        answered = true;
        const p = await fetch(`${base}/permission`, { method: "POST", headers: auth, body: JSON.stringify({ requestId: "r1", allow: true }) });
        assert.equal(p.status, 200);
      }
    });
    assert.deepEqual(r.events.map((e) => e.type), ["session", "permission", "text", "done"]);
    const resp = JSON.parse(readLog("resp.log").trim());
    assert.equal(resp.response.request_id, "r1");
    assert.equal(resp.response.response.behavior, "allow");
    assert.ok(!JSON.stringify(resp).includes("updatedPermissions"));
  });

  await check("权限模式异常即报错终止", async () => {
    const r = await chat({ prompt: "badmode" });
    assert.equal(r.events.at(-1).type, "error");
    assert.match(r.events.at(-1).message, /bypassPermissions/);
  });

  await check("claude 非零退出 → error 带 stderr", async () => {
    const r = await chat({ prompt: "crash" });
    assert.equal(r.events.at(-1).type, "error");
    assert.match(r.events.at(-1).message, /boom/);
  });

  await check("心跳、断开杀子进程", async () => {
    fs.rmSync(path.join(tmp, "pid.log"), { force: true });
    const ac = new AbortController();
    let sawPing = false;
    await chat({ prompt: "hang", signal: ac.signal }, async (raw) => {
      if (raw.includes(": ping")) { sawPing = true; return "stop"; }
    }).catch((e) => e);
    assert.ok(sawPing, "没收到心跳");
    const pid = Number(readLog("pid.log").trim());
    assert.ok(pid > 0);
    ac.abort();
    await sleep(500);
    assert.throws(() => process.kill(pid, 0), "子进程未被杀");
  });

  await check("F1 跨块汉字：权限入参与允许回包都无乱码", async () => {
    let answered = false;
    const r = await chat({ prompt: "permcjk" }, async (raw) => {
      if (!answered && raw.includes('"permission"')) {
        answered = true;
        const p = await fetch(`${base}/permission`, { method: "POST", headers: auth, body: JSON.stringify({ requestId: "r-cjk", allow: true }) });
        assert.equal(p.status, 200);
      }
    });
    const perm = r.events.find((e) => e.type === "permission");
    assert.equal(perm.input.content, "汉".repeat(5000));
    const resp = JSON.parse(readLog("resp.log").trim().split("\n").pop());
    assert.equal(resp.response.response.updatedInput.content, "汉".repeat(5000));
    assert.ok(!JSON.stringify(resp).includes("\uFFFD"));
  });

  await check("F4 断开后：/permission 410 且不写 stdin", async () => {
    fs.rmSync(path.join(tmp, "pid.log"), { force: true });
    const before = readLog("resp.log");
    const ac = new AbortController();
    await chat({ prompt: "permhang", signal: ac.signal }, async (raw) => (raw.includes('"permission"') ? "stop" : undefined));
    ac.abort();
    await sleep(200);
    const pid = Number(readLog("pid.log").trim());
    assert.ok(pid > 0, "没拿到子进程 pid");
    try {
      process.kill(pid, 0); // 子进程忽略了 SIGTERM，仍活着
      const p = await fetch(`${base}/permission`, { method: "POST", headers: auth, body: JSON.stringify({ requestId: "r-hang", allow: true }) });
      assert.equal(p.status, 410);
      await sleep(200);
      assert.equal(readLog("resp.log"), before, "不应写 stdin");
    } finally {
      process.kill(pid, "SIGKILL");
    }
  });

  await check("F7 exit 早于 stdout 读完：仍交付最终输出", async () => {
    const r = await chat({ prompt: "lateout" });
    assert.deepEqual(r.events.map((e) => e.type), ["session", "text", "done"]);
    assert.equal(r.events[1].delta, "late");
  });

  await check("F8 启动输出不含令牌，只给文件位置", async () => {
    assert.ok(!bridgeOut.includes(token), "启动输出含令牌");
    assert.ok(bridgeOut.includes(path.join(tmp, "home", "token")));
  });

  await check("F10 GET /models 与 /v1/models（仍需令牌），CORS 允许 GET", async () => {
    for (const p of ["/models", "/v1/models"]) {
      assert.equal((await fetch(`${base}${p}`)).status, 401);
      const r = await fetch(`${base}${p}`, { headers: auth });
      assert.equal(r.status, 200);
      assert.deepEqual((await r.json()).data.map((m) => m.id), ["claude", "fable", "opus", "sonnet", "haiku"]);
    }
    const o = await fetch(`${base}/models`, { method: "OPTIONS" });
    assert.match(o.headers.get("access-control-allow-methods"), /GET/);
  });

  await check("F11 MCP 令牌不进环境变量，mcp.json 0600、目录 0700、结束即删", async () => {
    const r = await chat({ prompt: "hi", orcaMcp: { url: "http://127.0.0.1:9/mcp", token: "mcp-secret-123" } });
    assert.equal(r.events.at(-1).type, "done");
    const m = JSON.parse(readLog("mcp.log").trim().split("\n").pop());
    assert.ok(!m.env.includes("mcp-secret-123"), "环境变量里有令牌");
    assert.equal(m.mode, "600");
    assert.equal(m.dirMode, "700");
    assert.equal(JSON.parse(m.body).mcpServers["orca-note"].headers.Authorization, "Bearer mcp-secret-123");
    await sleep(100);
    assert.ok(!fs.existsSync(m.file), "临时 mcp.json 未删除");
  });

  await check("G1 客户端中止：子进程还没退，临时目录已删", async () => {
    fs.rmSync(path.join(tmp, "pid.log"), { force: true });
    const ac = new AbortController();
    await chat({ prompt: "permhang", signal: ac.signal, orcaMcp: { url: "http://127.0.0.1:9/mcp", token: "t" } }, async (raw) => (raw.includes('"permission"') ? "stop" : undefined));
    const dir = path.dirname(JSON.parse(readLog("mcp.log").trim().split("\n").pop()).file);
    ac.abort();
    await sleep(200);
    const pid = Number(readLog("pid.log").trim());
    try {
      assert.ok(alive(pid), "子进程应仍活着（忽略了 SIGTERM）");
      assert.ok(!fs.existsSync(dir), "中止后临时目录未删");
    } finally {
      process.kill(pid, "SIGKILL");
    }
  });

  await check("G1 bridge 收到 SIGINT：删临时目录、杀子进程、退出", async () => {
    const b = await startBridge("sigint");
    others.push(b.proc);
    fs.rmSync(path.join(tmp, "pid.log"), { force: true });
    const ac = new AbortController();
    const pending = chat({ prompt: "hang", signal: ac.signal, orcaMcp: { url: "http://127.0.0.1:9/mcp", token: "t" } }, async () => "stop", b.base).catch(() => {});
    for (let i = 0; i < 50 && !readLog("pid.log"); i++) await sleep(50);
    await pending;
    const dir = path.dirname(JSON.parse(readLog("mcp.log").trim().split("\n").pop()).file);
    assert.ok(dir.startsWith(b.tmpdir) && fs.existsSync(dir), "临时目录应存在");
    const pid = Number(readLog("pid.log").trim());
    const exited = new Promise((r) => b.proc.on("exit", r));
    b.proc.kill("SIGINT");
    await exited;
    await sleep(300);
    ac.abort();
    assert.ok(!fs.existsSync(dir), "退出后临时目录未删");
    assert.ok(!alive(pid), "子进程未被杀");
  });

  await check("G1/H5 启动清扫：删 pid 已不在的残留与旧命名的过期残留，不动在跑的、新的、多文件的", async () => {
    const tmpdir = path.join(tmp, "tmp-sweep");
    const dead = spawn(process.execPath, ["-e", ""]);
    await new Promise((r) => dead.on("exit", r));
    const stale = path.join(tmpdir, `orca-bridge-${dead.pid}-abc`);
    const live = path.join(tmpdir, `orca-bridge-${process.pid}-def`);
    const unrelated = path.join(tmpdir, "orca-bridge-test-xyz");
    const legacyOld = path.join(tmpdir, "orca-bridge-Ab12Cd");
    const legacyNew = path.join(tmpdir, "orca-bridge-Ef34Gh");
    const legacyMore = path.join(tmpdir, "orca-bridge-Ij56Kl");
    for (const d of [stale, live, unrelated, legacyOld, legacyNew, legacyMore]) { fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, "mcp.json"), "{}"); }
    fs.writeFileSync(path.join(legacyMore, "other.txt"), "x");
    const old = new Date(Date.now() - 11 * 60 * 1000);
    for (const d of [legacyOld, legacyMore]) fs.utimesSync(d, old, old);
    const b = await startBridge("sweep");
    others.push(b.proc);
    assert.ok(!fs.existsSync(stale), "残留未清扫");
    assert.ok(!fs.existsSync(legacyOld), "旧命名的过期残留未清扫");
    assert.ok(fs.existsSync(live) && fs.existsSync(unrelated), "误删了在跑的或无关目录");
    assert.ok(fs.existsSync(legacyNew), "误删了 10 分钟内的旧命名目录");
    assert.ok(fs.existsSync(legacyMore), "误删了不止 mcp.json 的旧命名目录");
  });

  await check("G4 exit 后 3 秒仍未 close → 强制结束", async () => {
    const t0 = Date.now();
    const r = await chat({ prompt: "linger" });
    const ms = Date.now() - t0;
    try {
      assert.equal(r.events.at(-1).type, "error");
      assert.ok(ms >= 2500 && ms < 6000, `用时 ${ms}ms`);
    } finally {
      try { process.kill(Number(readLog("linger.log").trim()), "SIGKILL"); } catch {}
    }
  });

  await check("G5 给完 result 后子进程不自己退出 → 宽限期后被杀", async () => {
    fs.rmSync(path.join(tmp, "pid.log"), { force: true });
    const r = await chat({ prompt: "afterresult", orcaMcp: { url: "http://127.0.0.1:9/mcp", token: "t" } });
    assert.equal(r.events.at(-1).type, "done");
    const pid = Number(readLog("pid.log").trim());
    const dir = path.dirname(JSON.parse(readLog("mcp.log").trim().split("\n").pop()).file);
    try {
      assert.ok(alive(pid), "result 后应先留宽限期");
      await sleep(3600);
      assert.ok(!alive(pid), "宽限期后子进程未被杀");
      assert.ok(!fs.existsSync(dir), "临时目录未删");
    } finally {
      try { process.kill(pid, "SIGKILL"); } catch {}
    }
  });

  await check("G6 安全模式遇受管 allow 规则 → 拒绝启动并列出规则；完全放开不受影响", async () => {
    const managed = path.join(tmp, "managed.json");
    fs.writeFileSync(managed, JSON.stringify({ permissions: { allow: ["Write", "mcp__orca-note__*"] } }));
    await assert.rejects(startBridge("managed", [], { ORCA_BRIDGE_MANAGED_SETTINGS: managed }), /跳过确认[\s\S]*Write[\s\S]*mcp__orca-note__\*/);
    const b = await startBridge("managed-full", ["--full-access"], { ORCA_BRIDGE_MANAGED_SETTINGS: managed });
    others.push(b.proc);
    assert.ok(!bridgeOut.includes("受管配置"), "没有受管配置时不应提示");
  });

  await check("V1 默认安全模式：请求体塞 fullAccess/mode 也不改变模式", async () => {
    const r = await chat({ prompt: "hi", fullAccess: true, mode: "full", permissionMode: "bypassPermissions" });
    assert.equal(r.events.at(-1).type, "done");
    const args = lastArgs();
    assert.ok(args.includes("--restricted") && args.includes("--permission-prompt-tool"));
    assert.equal(args[args.indexOf("--permission-mode") + 1], "manual");
    assert.ok(!args.some((a) => /bypass|dangerously/i.test(a)));
    assert.equal(r.events[0].mode, "safe");
  });

  await check("V1 --full-access：bypass 参数、启动警告、init 不是 bypass 就终止", async () => {
    const b = await startBridge("full", ["--full-access"]);
    others.push(b.proc);
    assert.match(b.out, /完全放开模式/);
    const r = await chat({ prompt: "hi" }, undefined, b.base);
    assert.deepEqual(r.events.map((e) => e.type), ["session", "text", "done"]);
    assert.equal(r.events[0].mode, "full");
    const args = lastArgs();
    assert.equal(args[args.indexOf("--permission-mode") + 1], "bypassPermissions");
    checkTools(args, true);
    assert.ok(args.includes("--strict-mcp-config"));
    for (const f of ["--restricted", "--permission-prompts", "--permission-prompt-tool"]) assert.ok(!args.includes(f), f);
    const bad = await chat({ prompt: "safemode" }, undefined, b.base);
    assert.equal(bad.events.at(-1).type, "error");
  });

  await check("V2/H1 选模型：非法 400 不启动、claude 不传 --model、opus 传；请求带 sessionId 也不 --resume", async () => {
    const before = readLog("args.log");
    for (const model of ["a b", "-x", "../x", 5, "x".repeat(101)]) {
      assert.equal((await chat({ prompt: "hi", model })).status, 400, String(model));
    }
    assert.equal(readLog("args.log"), before, "非法 model 不应启动 claude");
    await chat({ prompt: "hi", model: "claude" });
    assert.ok(!lastArgs().includes("--model"));
    const r = await chat({ prompt: "hi", model: "opus" });
    assert.equal(lastArgs()[lastArgs().indexOf("--model") + 1], "opus");
    assert.equal(r.events[0].model, "fake-opus");
    await chat({ prompt: "hi", model: "claude-sonnet-4-5[1m]", sessionId: "S6" });
    const a = lastArgs();
    assert.equal(a[a.indexOf("--model") + 1], "claude-sonnet-4-5[1m]");
    assert.ok(!a.includes("--resume"), "不应续接");
    const ac = new AbortController();
    const hanging = chat({ prompt: "hang", sessionId: "S6", signal: ac.signal }).catch(() => null);
    await sleep(100);
    const c = await chat({ prompt: "hi", sessionId: "S6" });
    ac.abort();
    await hanging;
    assert.equal(c.status, 200, "同一 sessionId 在跑时也不应 409");
  });

  await check("V3 session 事件带 mode 与实际 model", async () => {
    const r = await chat({ prompt: "hi" });
    assert.deepEqual(r.events[0], { type: "session", id: "fake-sess", mode: "safe", model: "fake-default", cwd: path.join(tmp, "work"), resumed: false });
  });

  const SID = "11111111-2222-4333-8444-555555555555";
  await check("R1 合法 resume：加 --resume、stdin 用 resume.prompt、session 带 resumed:true", async () => {
    const r = await chat({ prompt: "整段文字", resume: { sid: SID, prompt: "续接文字" } });
    assert.equal(r.events.at(-1).type, "done");
    const a = lastArgs();
    assert.equal(a[a.indexOf("--resume") + 1], SID);
    assert.equal(JSON.parse(readLog("prompt.log").trim().split("\n").pop()), "续接文字");
    assert.equal(r.events[0].resumed, true);
    assert.equal(r.events[0].id, SID);
  });

  await check("R2 非法 sid / 空续接文字 / 不带 resume：不 --resume、stdin 用整段 prompt、resumed:false", async () => {
    for (const resume of [{ sid: "../x", prompt: "p" }, { sid: `${SID} --x`, prompt: "p" }, { sid: SID, prompt: "  " }, { sid: 5, prompt: "p" }, "x", undefined]) {
      const r = await chat({ prompt: "整段", resume });
      assert.equal(r.events.at(-1).type, "done", JSON.stringify(resume));
      assert.ok(!lastArgs().includes("--resume"), JSON.stringify(resume));
      assert.equal(JSON.parse(readLog("prompt.log").trim().split("\n").pop()), "整段");
      assert.equal(r.events[0].resumed, false);
    }
  });

  await check("R3 每条主线完整 assistant 消息的 uuid 按序转发，子代理的不转发", async () => {
    const r = await chat({ prompt: "uuidrun" });
    assert.deepEqual(r.events.filter((e) => e.type === "assistant_uuid").map((e) => e.uuid), ["u-1", "u-2"]);
    assert.equal(r.events.at(-1).type, "done");
  });

  await check("R4 续接在任何输出前非 0 退出 → resume_failed；有输出后退出、未续接时退出 → 普通 error", async () => {
    const dead = "11111111-2222-4333-8444-55555555dead";
    const r = await chat({ prompt: "整段", resume: { sid: dead, prompt: "续" } });
    assert.equal(r.events.at(-1).type, "error");
    assert.equal(r.events.at(-1).code, "resume_failed");
    assert.match(r.events.at(-1).message, /No conversation found/);
    const r2 = await chat({ prompt: "整段", resume: { sid: SID, prompt: "textcrash" } });
    assert.equal(r2.events.at(-1).type, "error");
    assert.equal(r2.events.at(-1).code, undefined);
    const r3 = await chat({ prompt: "crash" });
    assert.equal(r3.events.at(-1).code, undefined);
  });

  const waitFor = async (fn) => { for (let i = 0; i < 100 && !fn(); i++) await sleep(50); assert.ok(fn(), "等待超时"); };
  await check("R5 同会话旧进程还在跑（未续接、按 init 登记）→ 先 SIGTERM 等它退出再起新的", async () => {
    const S = "22222222-2222-4333-8444-555555555555";
    fs.rmSync(path.join(tmp, "order.log"), { force: true });
    const ac = new AbortController();
    const first = chat({ prompt: `slowhang sid=${S}`, signal: ac.signal }, async (raw) => (raw.includes('"session"') ? "stop" : undefined));
    await first;
    const pidA = Number(readLog("order.log").trim().split(" ")[1]);
    const r = await chat({ prompt: "整段", resume: { sid: S, prompt: "hi" } });
    ac.abort();
    assert.equal(r.events.at(-1).type, "done");
    const lines = readLog("order.log").trim().split("\n");
    assert.deepEqual(lines.slice(0, 2), [`start ${pidA}`, `term ${pidA}`]);
    assert.match(lines[2], /^start \d+$/);
    assert.ok(!alive(pidA), "旧进程应已退出");
  });

  await check("R6 旧进程不理 SIGTERM → 3 秒后 SIGKILL，新请求照常完成不卡住", async () => {
    const S = "33333333-2222-4333-8444-555555555555";
    fs.rmSync(path.join(tmp, "order.log"), { force: true });
    const ac = new AbortController();
    await chat({ prompt: "整段", resume: { sid: S, prompt: "termhang" }, signal: ac.signal }, async (raw) => (raw.includes('"session"') ? "stop" : undefined));
    await waitFor(() => readLog("order.log").includes("start"));
    const pidA = Number(readLog("order.log").trim().split(" ")[1]);
    const t0 = Date.now();
    const r = await chat({ prompt: "整段", resume: { sid: S, prompt: "hi" } });
    const ms = Date.now() - t0;
    ac.abort();
    try {
      assert.equal(r.events.at(-1).type, "done");
      assert.ok(ms >= 2500 && ms < 6000, `用时 ${ms}ms`);
      assert.ok(!alive(pidA), "旧进程应已被 SIGKILL");
      assert.match(readLog("order.log"), new RegExp(`ignore ${pidA}`));
    } finally {
      try { process.kill(pidA, "SIGKILL"); } catch {}
    }
  });
  await check("H8 config.json 不存在 → 安全模式、不生成文件、工作目录 ~/OrcaAgent", async () => {
    const home = path.join(tmp, "fakehome-h8");
    const cfg = path.join(tmp, "cfg-new", "config.json");
    const b = await startBridge("cfgnew", [], { ORCA_BRIDGE_CONFIG: cfg, HOME: home }, false);
    others.push(b.proc);
    assert.ok(!fs.existsSync(cfg) && !fs.existsSync(path.dirname(cfg)), "不应生成配置");
    assert.doesNotMatch(b.out, /完全放开模式/);
    const r = await chat({ prompt: "hi" }, undefined, b.base);
    assert.equal(r.events[0].mode, "safe");
    assert.ok(lastArgs().includes("--restricted"));
    assert.equal(readLog("cwd.log").trim().split("\n").pop(), fs.realpathSync(path.join(home, "OrcaAgent")));
  });

  await check("H7 config.json group/other 可写 → 拒绝启动并说明", async () => {
    for (const mode of [0o664, 0o646]) {
      const cfg = path.join(tmp, `cfg-perm-${mode.toString(8)}.json`);
      fs.writeFileSync(cfg, JSON.stringify({ fullAccess: true, dirs: [] }));
      fs.chmodSync(cfg, mode);
      await assert.rejects(startBridge(`cfgperm${mode}`, [], { ORCA_BRIDGE_CONFIG: cfg }), /其他人可写.*chmod 600/);
    }
  });

  await check("H8/H9 App 的 launch.sh：无配置时写默认 0600、已有不覆盖；PATH 里 node 所在目录在最前", async () => {
    const nodeDir = path.join(tmp, "fake-node-bin");
    fs.mkdirSync(nodeDir, { recursive: true });
    // 假 node：记下拿到的 PATH 就退出（不真起 bridge）
    fs.writeFileSync(path.join(nodeDir, "node"), `#!/bin/bash\necho "$PATH" > ${JSON.stringify(path.join(tmp, "launch-path.log"))}\n`, { mode: 0o755 });
    const appDir = path.join(tmp, "app-out");
    const buildApp = fileURLToPath(new URL("./build-app.sh", import.meta.url));
    const run = (cmd, args, env) => new Promise((resolve, reject) => {
      const p = spawn(cmd, args, { env: { ...process.env, ...env }, stdio: ["ignore", "pipe", "pipe"] });
      let out = "";
      p.stdout.on("data", (d) => { out += d; });
      p.stderr.on("data", (d) => { out += d; });
      p.on("exit", (code) => (code === 0 ? resolve(out) : reject(new Error(`${cmd} 退出码 ${code}：${out}`))));
    });
    await run("bash", [buildApp, "--out", appDir], { PATH: `${nodeDir}:${process.env.PATH}` });
    const launch = path.join(appDir, "Orca Agent Bridge.app", "Contents", "Resources", "launch.sh");
    const home = path.join(tmp, "launch-home");
    const env = { HOME: home, ORCA_BRIDGE_HOME: path.join(home, ".orca-agent-bridge"), ORCA_BRIDGE_PORT: "1", PATH: "/usr/bin:/bin" };
    await run("bash", [launch], env);
    const cfg = path.join(home, ".orca-agent-bridge", "config.json");
    assert.equal((fs.statSync(cfg).mode & 0o777).toString(8), "600");
    assert.deepEqual(JSON.parse(fs.readFileSync(cfg, "utf8")), { fullAccess: true, dirs: ["~/OrcaAgent"] });
    const dirs = fs.readFileSync(path.join(tmp, "launch-path.log"), "utf8").trim().split(":");
    assert.equal(dirs[0], nodeDir, `PATH 首位：${dirs[0]}`);
    assert.equal(dirs[1], "/opt/homebrew/bin");
    fs.writeFileSync(cfg, JSON.stringify({ fullAccess: false, dirs: [] }));
    await run("bash", [launch], env);
    assert.equal(JSON.parse(fs.readFileSync(cfg, "utf8")).fullAccess, false, "已有配置被覆盖");
  });

  await check("C2 config fullAccess:false + dirs（~ 展开）：安全模式，第一个作 cwd，其余 --add-dir", async () => {
    const home = path.join(tmp, "fakehome");
    const cfg = path.join(tmp, "cfg-safe.json");
    fs.writeFileSync(cfg, JSON.stringify({ fullAccess: false, dirs: ["~/a", "~/b"] }));
    const b = await startBridge("cfgsafe", [], { ORCA_BRIDGE_CONFIG: cfg, HOME: home }, false);
    others.push(b.proc);
    const r = await chat({ prompt: "hi" }, undefined, b.base);
    assert.equal(r.events[0].mode, "safe");
    assert.ok(lastArgs().includes("--restricted"));
    assert.equal(readLog("cwd.log").trim().split("\n").pop(), fs.realpathSync(path.join(home, "a")));
    const a = lastArgs();
    assert.equal(a[a.indexOf("--add-dir") + 1], path.join(home, "b"));
  });

  await check("C3 config fullAccess:true：请求体改不回安全；--dir 覆盖配置 dirs", async () => {
    const cfg = path.join(tmp, "cfg-full.json");
    fs.writeFileSync(cfg, JSON.stringify({ fullAccess: true, dirs: [path.join(tmp, "elsewhere")] }));
    const b = await startBridge("cfgfull", [], { ORCA_BRIDGE_CONFIG: cfg });
    others.push(b.proc);
    const r = await chat({ prompt: "hi", fullAccess: false, mode: "safe", permissionMode: "manual" }, undefined, b.base);
    assert.equal(r.events[0].mode, "full");
    assert.equal(lastArgs()[lastArgs().indexOf("--permission-mode") + 1], "bypassPermissions");
    assert.equal(readLog("cwd.log").trim().split("\n").pop(), fs.realpathSync(path.join(tmp, "work")));
    assert.ok(!lastArgs().includes("--add-dir"));
  });

  await check("C4 命令行 --full-access 覆盖 config fullAccess:false（主实例配置即 false，见 V1）；config 格式不对 → 拒绝启动", async () => {
    const cfg = path.join(tmp, "cfg-bad.json");
    fs.writeFileSync(cfg, JSON.stringify({ fullAccess: "yes" }));
    await assert.rejects(startBridge("cfgbad", [], { ORCA_BRIDGE_CONFIG: cfg }), /格式不对/);
  });

  await check("W1 选文件夹：不存在/是文件/相对路径/含 \\0/非字符串 → 400 不启动不建目录；合法目录 → cwd 为 realpath、session 带 cwd、--add-dir 照旧", async () => {
    const before = readLog("args.log");
    const missing = path.join(tmp, "no-such-dir");
    const file = path.join(tmp, "a-file.txt");
    fs.writeFileSync(file, "x");
    for (const workDir of [missing, file, "relative/dir", "~nobody/x", `${tmp}\0x`, 5, "x".repeat(5000)]) {
      const res = await fetch(`${base}/chat`, { method: "POST", headers: auth, body: JSON.stringify({ prompt: "hi", workDir }) });
      assert.equal(res.status, 400, String(workDir).slice(0, 50));
      if (typeof workDir === "string" && workDir.length < 100) assert.equal((await res.json()).error, `文件夹 ${workDir} 不存在或不是文件夹`);
    }
    assert.equal(readLog("args.log"), before, "非法 workDir 不应启动 claude");
    assert.ok(!fs.existsSync(missing), "不应建目录");
    const target = path.join(tmp, "picked");
    fs.mkdirSync(target);
    const link = path.join(tmp, "picked-link");
    fs.symlinkSync(target, link);
    const r = await chat({ prompt: "hi", workDir: `  ${link}  ` });
    assert.equal(r.events[0].cwd, fs.realpathSync(target));
    assert.equal(readLog("cwd.log").trim().split("\n").pop(), fs.realpathSync(target));
    const r2 = await chat({ prompt: "hi", workDir: "" });
    assert.equal(r2.events[0].cwd, path.join(tmp, "work"));
    const home = path.join(tmp, "fakehome-w1");
    fs.mkdirSync(path.join(home, "proj"), { recursive: true });
    const cfg = path.join(tmp, "cfg-w1.json");
    fs.writeFileSync(cfg, JSON.stringify({ fullAccess: true, dirs: ["~/main", "~/extra"] }));
    const b = await startBridge("w1", [], { ORCA_BRIDGE_CONFIG: cfg, HOME: home }, false);
    others.push(b.proc);
    const r3 = await chat({ prompt: "hi", workDir: "~/proj" }, undefined, b.base);
    assert.equal(r3.events[0].cwd, fs.realpathSync(path.join(home, "proj")));
    assert.equal(r3.events[0].mode, "full");
    const a = lastArgs();
    assert.equal(a[a.indexOf("--add-dir") + 1], path.join(home, "extra"));
    assert.equal(a[a.indexOf("--setting-sources") + 1], "user");
    assert.deepEqual(JSON.parse(a[a.indexOf("--settings") + 1]).claudeMdExcludes, [path.join(home, ".claude", "CLAUDE.md"), path.join(home, ".claude", "rules", "**")]);
    assert.equal(a[a.indexOf("--permission-mode") + 1], "bypassPermissions");
  });

  await check("W2 安全模式不带 --setting-sources", async () => {
    await chat({ prompt: "hi" });
    assert.ok(!lastArgs().includes("--setting-sources"));
    assert.ok(lastArgs().includes("--settings"), "安全模式也要排除全局 CLAUDE.md");
  });
  await check("W2b 所选文件夹有 CLAUDE.md → 正文交给 AI；没有就不带", async () => {
    // 默认工作目录是符号链接路径（如 /tmp → /private/tmp）时，不传 workDir 也要读到
    const realDef = path.join(tmp, "real-w2b");
    fs.mkdirSync(realDef);
    fs.writeFileSync(path.join(realDef, "CLAUDE.md"), "默认目录规则");
    fs.symlinkSync(realDef, path.join(tmp, "link-w2b"));
    const bd = await startBridge("w2b", ["--dir", path.join(tmp, "link-w2b")], {}, false);
    others.push(bd.proc);
    await chat({ prompt: "hi" }, undefined, bd.base);
    assert.ok((lastArgs()[lastArgs().indexOf("--append-system-prompt") + 1] || "").includes("默认目录规则"));
    const d = fs.mkdtempSync(path.join(tmp, "rules-"));
    await chat({ prompt: "hi", workDir: d });
    assert.ok(!lastArgs().includes("--append-system-prompt"));
    fs.writeFileSync(path.join(d, "CLAUDE.md"), "暗号 BANANA\n");
    await chat({ prompt: "hi", workDir: d });
    const a = lastArgs();
    assert.ok(a[a.indexOf("--append-system-prompt") + 1].includes("暗号 BANANA"));
    assert.equal(a[a.indexOf("--system-prompt-snapshot") + 1], "off");
    // 链到文件夹内也不读；非法 UTF-8 解码后超长 → 不带
    fs.writeFileSync(path.join(d, "real.md"), "INSIDE");
    fs.rmSync(path.join(d, "CLAUDE.md"));
    fs.symlinkSync(path.join(d, "real.md"), path.join(d, "CLAUDE.md"));
    await chat({ prompt: "hi", workDir: d });
    assert.ok(!lastArgs().includes("--append-system-prompt"));
    fs.rmSync(path.join(d, "CLAUDE.md"));
    fs.writeFileSync(path.join(d, "CLAUDE.md"), Buffer.alloc(50 * 1024, 0xff));
    await chat({ prompt: "hi", workDir: d });
    assert.ok(!lastArgs().includes("--append-system-prompt"));
    // 链到文件夹外 → 不读；FIFO → 不卡住、照常启动不带参数
    const secret = path.join(tmp, "secret-w2b.txt");
    fs.writeFileSync(secret, "SECRET");
    fs.rmSync(path.join(d, "CLAUDE.md"));
    fs.symlinkSync(secret, path.join(d, "CLAUDE.md"));
    await chat({ prompt: "hi", workDir: d });
    assert.ok(!lastArgs().includes("--append-system-prompt"));
    fs.rmSync(path.join(d, "CLAUDE.md"));
    execFileSync("mkfifo", [path.join(d, "CLAUDE.md")]);
    const r = await chat({ prompt: "hi", workDir: d });
    assert.equal(r.status, 200);
    assert.ok(!lastArgs().includes("--append-system-prompt"));
  });
  await check("W3 PATH 含相对项时，所选文件夹里的同名 claude / node 不会被启动", async () => {
    const bin = path.join(tmp, "bin-w3");
    fs.mkdirSync(bin);
    fs.symlinkSync(fake, path.join(bin, "claude"));
    const evil = path.join(tmp, "evil-w3");
    fs.mkdirSync(evil);
    const marker = path.join(tmp, "evil-ran");
    fs.writeFileSync(path.join(evil, "claude"), `#!/bin/sh\ntouch ${marker}\n`, { mode: 0o755 });
    // 假 claude 是 #!/usr/bin/env node：所选文件夹里的同名 node 也不能被启动
    fs.writeFileSync(path.join(evil, "node"), `#!/bin/sh\ntouch ${marker}\n`, { mode: 0o755 });
    const b = await startBridge("w3", [], { ORCA_BRIDGE_CLAUDE: "claude", PATH: `.:${bin}:${process.env.PATH}` });
    others.push(b.proc);
    const before = readLog("args.log");
    const r = await chat({ prompt: "hi", workDir: evil }, undefined, b.base);
    assert.equal(r.status, 200);
    assert.ok(!fs.existsSync(marker), "所选文件夹里的 claude 不应被启动");
    assert.notEqual(readLog("args.log"), before, "应启动 PATH 里的真 claude");
  });
  await check("T1 工具失败带单行截断原因、子代理工具带 sub、done 带用量", async () => {
    const r = await chat({ prompt: "toolrun" });
    const tools = r.events.filter((e) => e.type === "tool" || e.type === "tool_result");
    assert.deepEqual(tools.slice(0, 3).map((e) => [e.type, e.name, Boolean(e.sub)]), [["tool", "Task", false], ["tool", "Read", true], ["tool", "Bash", true]]);
    assert.deepEqual(tools[3], { type: "tool_result", name: "Bash", ok: false, error: "sub fail", sub: true });
    assert.equal(tools.length, 5, "子代理成功的结果不转发");
    assert.equal(tools[4].sub, undefined);
    assert.equal(tools[4].error.length, 300);
    assert.ok(tools[4].error.startsWith("line1 xxx") && !tools[4].error.includes("\n"));
    assert.ok(!r.raw.includes("subtext"), "子代理正文不转发");
    assert.ok(!r.events.some((e) => e.uuid === "u-s"), "子代理 uuid 不转发");
    assert.deepEqual(r.events.at(-1), { type: "done", usage: { input: 1110, output: 50, costUsd: 0.0123 } });
    const plain = await chat({ prompt: "hi" });
    assert.deepEqual(plain.events.at(-1), { type: "done" });
  });

  const PNG = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGNgYPgPAAEDAQAIicLsAAAAAElFTkSuQmCC";
  const lastPrompt = () => JSON.parse(readLog("prompt.log").trim().split("\n").pop());
  await check("I1 带 images：stdin content 是 [文字, 图片…]，回 images 事件；续接也带", async () => {
    const r = await chat({ prompt: "看图", images: [{ mediaType: "image/png", data: PNG }, { mediaType: "image/jpeg", data: PNG }] });
    assert.equal(r.events.at(-1).type, "done");
    assert.ok(r.events.some((e) => e.type === "images" && e.count === 2));
    assert.deepEqual(lastPrompt(), [
      { type: "text", text: "看图" },
      { type: "image", source: { type: "base64", media_type: "image/png", data: PNG } },
      { type: "image", source: { type: "base64", media_type: "image/jpeg", data: PNG } },
    ]);
    const r2 = await chat({ prompt: "整段", resume: { sid: SID, prompt: "续接文字" }, images: [{ mediaType: "image/webp", data: PNG }] });
    assert.equal(r2.events.at(-1).type, "done");
    const p = lastPrompt();
    assert.deepEqual(p[0], { type: "text", text: "续接文字" });
    assert.equal(p[1].source.media_type, "image/webp");
  });

  await check("I2 非法 media_type / 坏 base64 / 太多 / 太大 / 非数组 → 400 带中文原因，不启动", async () => {
    const before = readLog("args.log");
    const big = "A".repeat(Math.ceil((10 * 1024 * 1024 + 3) / 3) * 4);
    for (const [images, want] of [
      [[{ mediaType: "image/svg+xml", data: PNG }], "类型不支持"],
      [[{ mediaType: "image/png", data: "不是base64!!" }], "base64"],
      [[{ mediaType: "image/png", data: "abc" }], "base64"],
      [[{ mediaType: "image/png", data: "" }], "base64"],
      [Array.from({ length: 11 }, () => ({ mediaType: "image/png", data: PNG })), "最多 10 张"],
      [[{ mediaType: "image/png", data: big }], "单张请小于 10MB"],
      ["x", "数组"],
    ]) {
      const res = await fetch(`${base}/chat`, { method: "POST", headers: auth, body: JSON.stringify({ prompt: "看图", images }) });
      assert.equal(res.status, 400, want);
      assert.ok((await res.json()).error.includes(want), want);
    }
    assert.equal(readLog("args.log"), before, "不应启动 claude");
  });

  await check("I3 无图（不带 / null / 空数组）：stdin content 仍是字符串，不回 images 事件", async () => {
    for (const images of [undefined, null, []]) {
      const r = await chat({ prompt: "纯文字", images });
      assert.equal(r.events.at(-1).type, "done");
      assert.equal(lastPrompt(), "纯文字");
      assert.ok(!r.events.some((e) => e.type === "images"));
    }
  });
  await check("M1 启动后查到本机模型列表：/models 保留 claude、加上新模型并带显示名，查询子进程不跑钩子并被结束", async () => {
    const b = await startBridge("m1", [], { ORCA_FAKE_MODELS: "ok" });
    others.push(b.proc);
    let data;
    for (let i = 0; i < 50; i++) {
      data = (await (await fetch(`${b.base}/models`, { headers: auth })).json()).data;
      if (data.length !== 5 || data[1].id !== "fable") break;
      await sleep(100);
    }
    assert.deepEqual(data, [{ id: "claude", object: "model" }, { id: "opus", object: "model", label: "Opus 9" }, { id: "claude-new-1", object: "model", label: "New 1" }]);
    const q = JSON.parse(readLog("models.log").trim().split("\n").pop());
    assert.ok(q.argv.includes("--setting-sources") && q.argv[q.argv.indexOf("--setting-sources") + 1] === "");
    assert.ok(q.argv.includes("--strict-mcp-config"));
    assert.equal(q.cwd, fs.realpathSync(path.join(tmp, "work")));
    await sleep(300);
    assert.ok(!alive(q.pid), "查询子进程应已结束");
  });
  for (const [name, mode] of [["M2 回乱码", "junk"], ["M3 不回", "none"]]) {
    await check(`${name}：/models 退回写死列表，查询子进程被结束，日志记原因`, async () => {
      const b = await startBridge(name.slice(0, 2), [], { ORCA_FAKE_MODELS: mode, ORCA_BRIDGE_MODEL_QUERY_MS: "500" });
      others.push(b.proc);
      await sleep(300);
      const q = JSON.parse(readLog("models.log").trim().split("\n").pop());
      await sleep(700);
      const data = (await (await fetch(`${b.base}/models`, { headers: auth })).json()).data;
      assert.deepEqual(data.map((m) => m.id), ["claude", "fable", "opus", "sonnet", "haiku"]);
      assert.ok(!alive(q.pid), "查询子进程应已结束");
      assert.match(b.out, /查询模型列表失败（(超时|返回格式不对)）/);
    });
  }
} finally {
  bridge.kill();
  for (const p of others) p.kill("SIGKILL");
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(results.join("\n"));
if (results.some((r) => r.startsWith("FAIL"))) process.exit(1);
