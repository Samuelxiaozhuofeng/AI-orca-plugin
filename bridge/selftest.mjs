// bridge 自检：用假 claude 子进程验证令牌 401、断开杀子进程、心跳、权限回包、
// 跨块汉字、断开后权限作废、exit 早于 stdout 读完、启动输出无令牌、/models、MCP 令牌不进环境变量；
// 第二轮：退出/中止删临时目录、启动清扫、exit 后强制结束、受管配置警告、完全放开模式、选模型；
// 第三轮：不续接、旧命名残留清扫、配置权限、无配置安全模式、App 的 launch.sh 写默认配置与 PATH 顺序。
// 运行：node bridge/selftest.mjs（不需要真 claude，不碰 ~/.orca-agent-bridge）
import { spawn } from "node:child_process";
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
  const bypass = p.includes("badmode") || (argv.includes("bypassPermissions") && !p.includes("safemode"));
  out({ type: "system", subtype: "init", session_id: "fake-sess", permissionMode: bypass ? "bypassPermissions" : "default", model: modelAt > 0 ? "fake-" + argv[modelAt + 1] : "fake-default" });
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
  if (p.includes("afterresult")) { finishOk(); return setInterval(() => {}, 1000); } // 给完 result 不退出
  if (p.includes("hang")) return setInterval(() => {}, 1000);
  if (p.includes("crash")) { process.stderr.write("boom"); process.exit(2); }
  if (p.includes("perm")) return out({ type: "control_request", request_id: "r1", request: { subtype: "can_use_tool", tool_name: "Bash", input: { command: "touch x" }, permission_suggestions: [{ type: "addRules" }] } });
  finishOk();
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
  assert.equal(args[args.indexOf("--tools") + 1], (full ? "Task," : "") + "Bash,Edit,Glob,Grep,NotebookEdit,Read,Skill,TaskStop,ToolSearch,WebFetch,WebSearch,Write");
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
    assert.deepEqual(r.events[0], { type: "session", id: "fake-sess", mode: "safe", model: "fake-default", cwd: path.join(tmp, "work") });
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
    assert.equal(a[a.indexOf("--permission-mode") + 1], "bypassPermissions");
  });

  await check("W2 安全模式不带 --setting-sources", async () => {
    await chat({ prompt: "hi" });
    assert.ok(!lastArgs().includes("--setting-sources"));
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
} finally {
  bridge.kill();
  for (const p of others) p.kill("SIGKILL");
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(results.join("\n"));
if (results.some((r) => r.startsWith("FAIL"))) process.exit(1);
