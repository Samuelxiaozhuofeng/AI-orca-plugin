// bridge 自检：用假 claude 子进程验证令牌 401、同会话 409、断开杀子进程、心跳、权限回包。
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
const log = (name, s) => fs.appendFileSync(${JSON.stringify(tmp)} + "/" + name, s + "\\n");
log("args.log", JSON.stringify(process.argv.slice(2)));
const out = (m) => process.stdout.write(JSON.stringify(m) + "\\n");
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
const base = await new Promise((resolve, reject) => {
  let out = "";
  bridge.stdout.on("data", (d) => {
    out += d;
    const m = out.match(/http:\/\/127\.0\.0\.1:(\d+)/);
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
} finally {
  bridge.kill();
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(results.join("\n"));
if (results.some((r) => r.startsWith("FAIL"))) process.exit(1);
