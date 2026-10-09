// bridge 自检：用假 claude 子进程验证令牌 401、同会话 409、断开杀子进程、心跳、权限回包、
// 跨块汉字、断开后权限作废、exit 早于 stdout 读完、启动输出无令牌、/models、MCP 令牌不进环境变量。
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
log("args.log", JSON.stringify(process.argv.slice(2)));
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
  out({ type: "system", subtype: "init", session_id: "fake-sess", permissionMode: p.includes("badmode") ? "bypassPermissions" : "default" });
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
  if (p.includes("hang")) return setInterval(() => {}, 1000);
  if (p.includes("crash")) { process.stderr.write("boom"); process.exit(2); }
  if (p.includes("perm")) return out({ type: "control_request", request_id: "r1", request: { subtype: "can_use_tool", tool_name: "Bash", input: { command: "touch x" }, permission_suggestions: [{ type: "addRules" }] } });
  finishOk();
}
`, { mode: 0o755 });

const bridge = spawn(process.execPath, [bridgePath, "--port", "0", "--dir", path.join(tmp, "work")], {
  env: { ...process.env, ORCA_BRIDGE_HOME: path.join(tmp, "home"), ORCA_BRIDGE_CLAUDE: fake, ORCA_BRIDGE_HEARTBEAT_MS: "200" },
  stdio: ["ignore", "pipe", "inherit"],
});
let bridgeOut = "";
const base = await new Promise((resolve, reject) => {
  bridge.stdout.on("data", (d) => {
    bridgeOut += d;
    const m = bridgeOut.match(/http:\/\/127\.0\.0\.1:(\d+)/);
    if (m) resolve(`http://127.0.0.1:${m[1]}`);
  });
  bridge.on("exit", () => reject(new Error("bridge 提前退出")));
});
const token = fs.readFileSync(path.join(tmp, "home", "token"), "utf8").trim();
const auth = { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const readLog = (name) => (fs.existsSync(path.join(tmp, name)) ? fs.readFileSync(path.join(tmp, name), "utf8") : "");

async function chat(body, onText) {
  const res = await fetch(`${base}/chat`, { method: "POST", headers: auth, body: JSON.stringify(body), signal: body.signal });
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

  await check("同会话 409、心跳、断开杀子进程", async () => {
    fs.rmSync(path.join(tmp, "pid.log"), { force: true });
    const ac = new AbortController();
    let sawPing = false;
    const first = chat({ prompt: "hang", sessionId: "S1", signal: ac.signal }, async (raw) => {
      if (raw.includes(": ping")) { sawPing = true; return "stop"; }
    }).catch((e) => e);
    await sleep(100);
    const second = await chat({ prompt: "again", sessionId: "S1" });
    assert.equal(second.status, 409);
    await first;
    assert.ok(sawPing, "没收到心跳");
    const pid = Number(readLog("pid.log").trim());
    assert.ok(pid > 0);
    ac.abort();
    await sleep(500);
    assert.throws(() => process.kill(pid, 0), "子进程未被杀");
    const third = await chat({ prompt: "hi", sessionId: "S1" });
    assert.equal(third.status, 200, "断开后应可再次使用该会话");
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

  await check("F4 断开后：会话立即释放、/permission 410 且不写 stdin", async () => {
    fs.rmSync(path.join(tmp, "pid.log"), { force: true });
    const before = readLog("resp.log");
    const ac = new AbortController();
    await chat({ prompt: "permhang", sessionId: "S2", signal: ac.signal }, async (raw) => (raw.includes('"permission"') ? "stop" : undefined));
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
      const again = await chat({ prompt: "hi", sessionId: "S2" });
      assert.equal(again.status, 200, "断开后应立即可再发");
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
      assert.deepEqual(await r.json(), { object: "list", data: [{ id: "claude", object: "model" }] });
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
} finally {
  bridge.kill();
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(results.join("\n"));
if (results.some((r) => r.startsWith("FAIL"))) process.exit(1);
