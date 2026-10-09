#!/usr/bin/env node
// Orca Agent Bridge：插件（渲染进程，不能 spawn）经它调用本机 claude CLI。只监听 127.0.0.1，凭令牌访问。
import http from "node:http";
import { spawn } from "node:child_process";
import { randomBytes, timingSafeEqual } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const HOST = "127.0.0.1";
const BRIDGE_HOME = process.env.ORCA_BRIDGE_HOME || path.join(os.homedir(), ".orca-agent-bridge");
const CLAUDE_BIN = process.env.ORCA_BRIDGE_CLAUDE || "claude";
const HEARTBEAT_MS = Number(process.env.ORCA_BRIDGE_HEARTBEAT_MS) || 10000;
const MAX_BODY = 5 * 1024 * 1024;
const EXIT_GRACE_MS = 3000;
const MANAGED_SETTINGS = process.env.ORCA_BRIDGE_MANAGED_SETTINGS || "/Library/Application Support/ClaudeCode/managed-settings.json";
const MODELS = ["claude", "fable", "opus", "sonnet", "haiku"]; // claude = 不指定，用 Claude Code 默认
const MODEL_RE = /^[A-Za-z0-9][A-Za-z0-9._\-\[\]]{0,99}$/;
// 安全模式下 init 里出现这些权限模式说明权限被放宽，立即终止
const BAD_MODES = ["bypassPermissions", "acceptEdits", "auto", "dontAsk"];
// Orca MCP 只读工具白名单（自动放行）；实测 tools/list 后再填，先为空 = 一律弹确认
const AUTO_ALLOW_MCP_TOOLS = [];
const COMMON_ARGS = [
  "-p",
  "--input-format", "stream-json",
  "--output-format", "stream-json",
  "--verbose",
  "--include-partial-messages",
];
const SAFE_ARGS = [
  ...COMMON_ARGS,
  "--restricted",
  "--tools", "Bash,Read,Edit,Write,Glob,Grep,WebFetch,WebSearch",
  "--strict-mcp-config",
  "--permission-mode", "manual",
  "--permission-prompts", "host",
  "--permission-prompt-tool", "stdio",
];
// 完全放开：只由启动参数 --full-access 或 config.json 决定，请求体改不了（实测 init 报 permissionMode=bypassPermissions）
const FULL_ARGS = [...COMMON_ARGS, "--permission-mode", "bypassPermissions", "--tools", "default", "--strict-mcp-config"];

const expandHome = (p) => path.resolve(p.replace(/^~(?=$|\/)/, os.homedir()));

/**
 * 读 config.json；不存在按安全模式、不生成（默认配置由 App 的 launch.sh 首次写入）。
 * 不归当前用户或 group/other 可写 → 拒绝启动（别人能改它就能把模式改成完全放开）。格式不对直接报错退出，不猜
 */
function loadConfig() {
  const file = process.env.ORCA_BRIDGE_CONFIG || path.join(BRIDGE_HOME, "config.json");
  if (!fs.existsSync(file)) return { fullAccess: false, dirs: [] };
  const st = fs.statSync(file);
  if (st.uid !== process.getuid()) {
    throw new Error(`${file} 权限不安全：不归当前用户所有，请运行 sudo chown "$USER" ${JSON.stringify(file)} && chmod 600 ${JSON.stringify(file)} 后再启动`);
  }
  if ((st.mode & 0o022) !== 0) {
    throw new Error(`${file} 权限不安全：其他人可写，请运行 chmod 600 ${JSON.stringify(file)} 后再启动`);
  }
  const cfg = JSON.parse(fs.readFileSync(file, "utf8"));
  const dirs = cfg.dirs ?? [];
  if (typeof cfg.fullAccess !== "boolean" || !Array.isArray(dirs) || !dirs.every((d) => typeof d === "string" && d)) {
    throw new Error(`${file} 格式不对：应为 {"fullAccess": true/false, "dirs": ["~/OrcaAgent"]}`);
  }
  return { fullAccess: cfg.fullAccess, dirs: dirs.map(expandHome) };
}

/** 命令行参数优先于 config.json：--full-access 打开完全放开，有 --dir 就不用配置里的 dirs */
function parseArgs(argv) {
  const cfg = loadConfig();
  const dirs = [];
  let port = Number(process.env.ORCA_BRIDGE_PORT) || 18673;
  let fullAccess = cfg.fullAccess;
  for (let i = 0; i < argv.length; i++) {
    const value = argv[i + 1];
    if (argv[i] === "--full-access") fullAccess = true;
    else if (argv[i] === "--dir" || argv[i] === "--port") {
      if (!value) throw new Error(`${argv[i]} 缺少参数值`);
      if (argv[i] === "--dir") dirs.push(path.resolve(value));
      else port = Number(value);
      i++;
    }
  }
  if (dirs.length === 0) dirs.push(...cfg.dirs);
  if (dirs.length === 0) dirs.push(path.join(os.homedir(), "OrcaAgent"));
  return { dirs, port, fullAccess };
}

function loadToken() {
  const file = path.join(BRIDGE_HOME, "token");
  try {
    const saved = fs.readFileSync(file, "utf8").trim();
    if (saved) return { token: saved, file, created: false };
  } catch {}
  fs.mkdirSync(BRIDGE_HOME, { recursive: true, mode: 0o700 });
  const token = randomBytes(24).toString("hex");
  fs.writeFileSync(file, token + "\n", { mode: 0o600 });
  return { token, file, created: true };
}

const { dirs, port, fullAccess } = parseArgs(process.argv.slice(2));
const BASE_ARGS = fullAccess ? FULL_ARGS : SAFE_ARGS;
const MODE = fullAccess ? "full" : "safe";
const cwd = dirs[0];
fs.mkdirSync(cwd, { recursive: true });
const addDirArgs = dirs.slice(1).flatMap((d) => ["--add-dir", d]);
const { token, file: tokenFile, created } = loadToken();
const expectedAuth = Buffer.from(`Bearer ${token}`);

const children = new Set(); // 所有在跑的 claude 子进程（bridge 退出时一并杀掉）
const mcpDirs = new Set(); // 所有临时 MCP 配置目录（内含令牌，结束即删）
// 临时目录名带 bridge pid，启动时只清扫 pid 已不在的残留，不误删另一个在跑的 bridge 的
const MCP_DIR_PREFIX = `orca-bridge-${process.pid}-`;
const LEGACY_STALE_MS = 10 * 60 * 1000;

function removeMcpDir(dir) {
  if (!dir || !mcpDirs.has(dir)) return;
  mcpDirs.delete(dir);
  fs.rmSync(dir, { recursive: true, force: true });
}

/** 旧版命名 orca-bridge-<随机>（不含 pid）：超过 10 分钟没动、目录里只有 mcp.json 才算残留 */
function isLegacyLeftover(dir) {
  try {
    const st = fs.lstatSync(dir);
    if (!st.isDirectory() || Date.now() - st.mtimeMs <= LEGACY_STALE_MS) return false;
    const names = fs.readdirSync(dir);
    return names.length === 1 && names[0] === "mcp.json";
  } catch { return false; }
}

function sweepStaleMcpDirs() {
  const tmp = os.tmpdir();
  for (const name of fs.readdirSync(tmp)) {
    const m = /^orca-bridge-(\d+)-/.exec(name);
    if (m) {
      try { process.kill(Number(m[1]), 0); continue; } catch (err) { if (err.code === "EPERM") continue; }
    } else if (!/^orca-bridge-[A-Za-z0-9]+$/.test(name) || !isLegacyLeftover(path.join(tmp, name))) continue;
    fs.rmSync(path.join(tmp, name), { recursive: true, force: true });
  }
}

function shutdown() {
  for (const dir of [...mcpDirs]) removeMcpDir(dir);
  for (const child of children) { child.orcaTerminated = true; child.kill("SIGTERM"); }
  process.exit(0);
}

/** 受管配置里的 allow 规则会在 host 确认之前放行工具，安全模式下也拦不住，启动时醒目提示 */
function managedAllowRules() {
  try {
    const allow = JSON.parse(fs.readFileSync(MANAGED_SETTINGS, "utf8"))?.permissions?.allow;
    return Array.isArray(allow) ? allow.map(String) : [];
  } catch { return []; }
}
const pending = new Map(); // requestId -> { child, input }；child.orcaTerminated 后一律作废

function authorized(req) {
  const got = Buffer.from(String(req.headers.authorization || ""));
  return got.length === expectedAuth.length && timingSafeEqual(got, expectedAuth);
}

function sendJson(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(body));
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error("请求体过大")); req.destroy(); return; }
      chunks.push(c);
    });
    req.on("end", () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}")); }
      catch { reject(new Error("请求体不是合法 JSON")); }
    });
    req.on("error", reject);
  });
}

function onLines(stream, fn) {
  let buf = "";
  stream.on("data", (d) => {
    buf += d;
    let i;
    while ((i = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, i);
      buf = buf.slice(i + 1);
      if (line.trim()) fn(line);
    }
  });
}

function writeControl(child, requestId, response) {
  if (child.orcaTerminated) return;
  const msg = { type: "control_response", response: { subtype: "success", request_id: requestId, response } };
  if (child.stdin.writable) child.stdin.write(JSON.stringify(msg) + "\n");
}

function handleChat(req, res, body) {
  const prompt = typeof body.prompt === "string" ? body.prompt : "";
  if (!prompt.trim()) return sendJson(res, 400, { error: "prompt 为空" });
  const model = body.model == null || body.model === "" ? "claude" : body.model;
  if (typeof model !== "string" || !MODEL_RE.test(model)) return sendJson(res, 400, { error: "model 不合法" });

  const args = [...BASE_ARGS, ...addDirArgs];
  let mcpDir = null;
  const mcp = body.orcaMcp;
  if (mcp && typeof mcp.url === "string" && mcp.url) {
    // 令牌直接写进 0600 文件（目录 mkdtemp 为 0700，结束即删）；不放环境变量，claude 的 Bash 子进程读不到
    mcpDir = fs.mkdtempSync(path.join(os.tmpdir(), MCP_DIR_PREFIX));
    mcpDirs.add(mcpDir);
    const mcpFile = path.join(mcpDir, "mcp.json");
    const config = { mcpServers: { "orca-note": { type: "http", url: mcp.url, headers: { Authorization: `Bearer ${String(mcp.token || "")}` } } } };
    fs.writeFileSync(mcpFile, JSON.stringify(config), { mode: 0o600 });
    args.push("--mcp-config", mcpFile);
  }
  if (model !== "claude") args.push("--model", model);

  res.writeHead(200, { "Content-Type": "text/event-stream; charset=utf-8", "Cache-Control": "no-cache", Connection: "keep-alive" });
  const send = (ev) => { if (!res.writableEnded) res.write(`data: ${JSON.stringify(ev)}\n\n`); };
  const heartbeat = setInterval(() => { if (!res.writableEnded) res.write(": ping\n\n"); }, HEARTBEAT_MS);
  let finished = false;
  const finish = (ev) => {
    if (finished) return;
    finished = true;
    if (ev) send(ev);
    clearInterval(heartbeat);
    res.end();
  };

  const child = spawn(CLAUDE_BIN, args, { cwd, stdio: ["pipe", "pipe", "pipe"] });
  children.add(child);
  // 按 utf8 流式解码，跨块的多字节字符不会变成乱码
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  const toolNames = new Map();
  let stderrTail = "";

  child.stdin.on("error", () => {});
  child.stdin.write(JSON.stringify({ type: "user", message: { role: "user", content: prompt } }) + "\n");
  child.stderr.on("data", (d) => { stderrTail = (stderrTail + d).slice(-2000); });
  const cleanup = () => {
    for (const [id, p] of pending) if (p.child === child) pending.delete(id);
    children.delete(child);
    removeMcpDir(mcpDir);
  };
  child.on("error", (err) => {
    cleanup();
    finish({ type: "error", message: err.code === "ENOENT" ? `找不到 claude 命令（${CLAUDE_BIN}），请先安装 Claude Code` : `启动 claude 失败：${err.message}` });
  });
  // exit 时 stdout 可能还没读完；等 close（stdio 全部读完）再判断结束
  let exitStatus = null;
  let exitTimer = null;
  const ended = () => {
    clearTimeout(exitTimer);
    cleanup();
    const tail = stderrTail.trim().slice(-500);
    finish({ type: "error", message: `claude 异常退出（${exitStatus}）${tail ? "：" + tail : ""}` });
  };
  // 后代进程继承了 stdout 时 close 可能一直不来：exit 后 3 秒仍未 close 就强制结束
  child.on("exit", (code, signal) => { exitStatus = code ?? signal; exitTimer = setTimeout(ended, EXIT_GRACE_MS); });
  child.on("close", (code, signal) => { exitStatus ??= code ?? signal; ended(); });
  res.on("close", () => {
    if (finished) return;
    // 客户端断开：先标记终止、撤销未决权限（之后的 /permission 一律 410、不写 stdin），再杀子进程
    finished = true;
    clearInterval(heartbeat);
    child.orcaTerminated = true;
    removeMcpDir(mcpDir);
    child.kill("SIGTERM");
  });

  onLines(child.stdout, (line) => {
    if (child.orcaTerminated) return;
    let m;
    try { m = JSON.parse(line); } catch { return; }
    if (m.type === "system" && m.subtype === "init") {
      if (fullAccess ? m.permissionMode !== "bypassPermissions" : BAD_MODES.includes(m.permissionMode)) {
        finish({ type: "error", message: `claude 权限模式异常（${m.permissionMode}），已终止` });
        child.kill("SIGTERM");
        return;
      }
      send({ type: "session", id: m.session_id, mode: MODE, model: m.model || model });
    } else if (m.type === "stream_event" && !m.parent_tool_use_id) {
      const delta = m.event?.type === "content_block_delta" ? m.event.delta : null;
      if (delta?.type === "text_delta") send({ type: "text", delta: delta.text });
      else if (delta?.type === "thinking_delta") send({ type: "thinking", delta: delta.thinking });
    } else if (m.type === "assistant" && !m.parent_tool_use_id) {
      for (const block of m.message?.content || []) {
        if (block.type !== "tool_use") continue;
        toolNames.set(block.id, block.name);
        send({ type: "tool", name: block.name, input: block.input });
      }
    } else if (m.type === "user" && !m.parent_tool_use_id && Array.isArray(m.message?.content)) {
      for (const block of m.message.content) {
        if (block.type !== "tool_result") continue;
        send({ type: "tool_result", name: toolNames.get(block.tool_use_id) || "工具", ok: !block.is_error });
      }
    } else if (m.type === "control_request") {
      const r = m.request || {};
      if (r.subtype !== "can_use_tool") {
        const msg = { type: "control_response", response: { subtype: "error", request_id: m.request_id, error: "bridge 不支持此请求" } };
        if (child.stdin.writable) child.stdin.write(JSON.stringify(msg) + "\n");
        return;
      }
      if (AUTO_ALLOW_MCP_TOOLS.includes(r.tool_name)) {
        writeControl(child, m.request_id, { behavior: "allow", updatedInput: r.input });
        return;
      }
      // 忽略 claude 给的永久允许建议，每次都问
      pending.set(m.request_id, { child, input: r.input });
      send({ type: "permission", requestId: m.request_id, tool: r.tool_name, input: r.input });
    } else if (m.type === "result") {
      if (m.is_error) {
        const message = m.result || (m.errors || []).join("; ") || "claude 运行出错";
        finish({ type: "error", message: String(message) });
      } else {
        finish({ type: "done" });
      }
      child.stdin.end();
    }
  });
}

function handlePermission(res, body) {
  const p = pending.get(body.requestId);
  if (!p) return sendJson(res, 404, { error: "没有这个待确认请求（可能已中止）" });
  pending.delete(body.requestId);
  if (p.child.orcaTerminated) return sendJson(res, 410, { error: "该请求已中止" });
  // 不带 updatedPermissions：只放行这一次
  writeControl(p.child, body.requestId, body.allow === true
    ? { behavior: "allow", updatedInput: p.input }
    : { behavior: "deny", message: "用户拒绝了此操作" });
  sendJson(res, 200, { ok: true });
}

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }
  if (!authorized(req)) return sendJson(res, 401, { error: "令牌不对" });
  try {
    if (req.method === "GET" && (req.url === "/models" || req.url === "/v1/models")) {
      return sendJson(res, 200, { object: "list", data: MODELS.map((id) => ({ id, object: "model" })) });
    }
    if (req.method === "POST" && req.url === "/chat") return handleChat(req, res, await readJson(req));
    if (req.method === "POST" && req.url === "/permission") return handlePermission(res, await readJson(req));
    sendJson(res, 404, { error: "not found" });
  } catch (err) {
    if (!res.headersSent) sendJson(res, 400, { error: String(err?.message || err) });
  }
});

server.on("error", (err) => {
  console.error(`启动失败：${err.message}`);
  process.exit(1);
});

// 安全模式承诺「每次确认」：受管配置的 allow 规则会在确认前放行，所以直接拒绝启动
const managedRules = managedAllowRules();
if (!fullAccess && managedRules.length) {
  console.error(`启动失败：受管配置里的允许规则会让这些操作跳过确认，安全模式无法保证每次确认（${MANAGED_SETTINGS}）：`);
  for (const r of managedRules) console.error(`  - ${r}`);
  process.exit(1);
}

sweepStaleMcpDirs();
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

server.listen(port, HOST, () => {
  console.log(`Orca Agent Bridge 已启动：http://${HOST}:${server.address().port}`);
  console.log(`工作目录：${cwd}${dirs.length > 1 ? `（另可访问：${dirs.slice(1).join("，")}）` : ""}`);
  // 不打印令牌本身（它等于以你身份执行命令的凭证）
  console.log(`${created ? "已生成新令牌" : "令牌"}保存在：${tokenFile}（复制：pbcopy < ${tokenFile}，填到插件「API 密钥」）`);
  if (fullAccess) {
    console.warn("\n⚠⚠⚠ 完全放开模式（--full-access 或 config.json 的 fullAccess）⚠⚠⚠");
    console.warn("AI 将不经任何确认直接改文件、跑命令、改笔记。");
    console.warn("令牌泄露 = 任何人都能以你的身份在本机执行命令。不用时请关掉本进程。\n");
  } else {
    console.log("安全模式：改文件、跑命令、改笔记前都会在插件里弹确认。");
  }

});
