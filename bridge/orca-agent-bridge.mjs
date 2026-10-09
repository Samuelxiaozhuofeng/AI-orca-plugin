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
// init 里出现这些权限模式说明权限被放宽，立即终止
const BAD_MODES = ["bypassPermissions", "acceptEdits", "auto", "dontAsk"];
// Orca MCP 只读工具白名单（自动放行）；实测 tools/list 后再填，先为空 = 一律弹确认
const AUTO_ALLOW_MCP_TOOLS = [];
const BASE_ARGS = [
  "-p",
  "--input-format", "stream-json",
  "--output-format", "stream-json",
  "--verbose",
  "--include-partial-messages",
  "--restricted",
  "--tools", "Bash,Read,Edit,Write,Glob,Grep,WebFetch,WebSearch",
  "--strict-mcp-config",
  "--permission-mode", "manual",
  "--permission-prompts", "host",
  "--permission-prompt-tool", "stdio",
];

function parseArgs(argv) {
  const dirs = [];
  let port = 18673;
  for (let i = 0; i < argv.length; i++) {
    const value = argv[i + 1];
    if (argv[i] === "--dir" || argv[i] === "--port") {
      if (!value) throw new Error(`${argv[i]} 缺少参数值`);
      if (argv[i] === "--dir") dirs.push(path.resolve(value));
      else port = Number(value);
      i++;
    }
  }
  if (dirs.length === 0) dirs.push(path.join(os.homedir(), "OrcaAgent"));
  return { dirs, port };
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

const { dirs, port } = parseArgs(process.argv.slice(2));
const cwd = dirs[0];
fs.mkdirSync(cwd, { recursive: true });
const addDirArgs = dirs.slice(1).flatMap((d) => ["--add-dir", d]);
const { token, file: tokenFile, created } = loadToken();
const expectedAuth = Buffer.from(`Bearer ${token}`);

const running = new Map(); // claude sessionId -> child
const pending = new Map(); // requestId -> { child, input }

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
  const msg = { type: "control_response", response: { subtype: "success", request_id: requestId, response } };
  if (child.stdin.writable) child.stdin.write(JSON.stringify(msg) + "\n");
}

function handleChat(req, res, body) {
  const prompt = typeof body.prompt === "string" ? body.prompt : "";
  if (!prompt.trim()) return sendJson(res, 400, { error: "prompt 为空" });
  const resume = typeof body.sessionId === "string" && body.sessionId ? body.sessionId : null;
  if (resume && running.has(resume)) return sendJson(res, 409, { error: "该对话上一条还在进行" });

  const args = [...BASE_ARGS, ...addDirArgs];
  const env = { ...process.env };
  let mcpDir = null;
  const mcp = body.orcaMcp;
  if (mcp && typeof mcp.url === "string" && mcp.url) {
    mcpDir = fs.mkdtempSync(path.join(os.tmpdir(), "orca-bridge-"));
    const mcpFile = path.join(mcpDir, "mcp.json");
    // 令牌经环境变量展开，不落命令行
    const config = { mcpServers: { "orca-note": { type: "http", url: mcp.url, headers: { Authorization: "Bearer ${ORCA_MCP_TOKEN}" } } } };
    fs.writeFileSync(mcpFile, JSON.stringify(config), { mode: 0o600 });
    env.ORCA_MCP_TOKEN = String(mcp.token || "");
    args.push("--mcp-config", mcpFile);
  }
  if (resume) args.push("--resume", resume);

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

  const child = spawn(CLAUDE_BIN, args, { cwd, env, stdio: ["pipe", "pipe", "pipe"] });
  const sessionIds = new Set();
  if (resume) { sessionIds.add(resume); running.set(resume, child); }
  const toolNames = new Map();
  let stderrTail = "";

  child.stdin.on("error", () => {});
  child.stdin.write(JSON.stringify({ type: "user", message: { role: "user", content: prompt } }) + "\n");
  child.stderr.on("data", (d) => { stderrTail = (stderrTail + d).slice(-2000); });
  const cleanup = () => {
    for (const [id, p] of pending) if (p.child === child) pending.delete(id);
    for (const id of sessionIds) if (running.get(id) === child) running.delete(id);
    if (mcpDir) fs.rmSync(mcpDir, { recursive: true, force: true });
  };
  child.on("error", (err) => {
    cleanup();
    finish({ type: "error", message: err.code === "ENOENT" ? `找不到 claude 命令（${CLAUDE_BIN}），请先安装 Claude Code` : `启动 claude 失败：${err.message}` });
  });
  child.on("exit", (code, signal) => {
    cleanup();
    const tail = stderrTail.trim().slice(-500);
    finish({ type: "error", message: `claude 异常退出（${code ?? signal}）${tail ? "：" + tail : ""}` });
  });
  res.on("close", () => {
    if (finished) return;
    // 客户端断开：杀子进程，未决权限随之作废（等同拒绝）
    finished = true;
    clearInterval(heartbeat);
    child.kill("SIGTERM");
  });

  onLines(child.stdout, (line) => {
    let m;
    try { m = JSON.parse(line); } catch { return; }
    if (m.type === "system" && m.subtype === "init") {
      if (BAD_MODES.includes(m.permissionMode)) {
        finish({ type: "error", message: `claude 权限模式异常（${m.permissionMode}），已终止` });
        child.kill("SIGTERM");
        return;
      }
      if (m.session_id) { sessionIds.add(m.session_id); running.set(m.session_id, child); }
      send({ type: "session", id: m.session_id });
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
  // 不带 updatedPermissions：只放行这一次
  writeControl(p.child, body.requestId, body.allow === true
    ? { behavior: "allow", updatedInput: p.input }
    : { behavior: "deny", message: "用户拒绝了此操作" });
  sendJson(res, 200, { ok: true });
}

const server = http.createServer(async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  if (req.method === "OPTIONS") { res.writeHead(204); res.end(); return; }
  if (!authorized(req)) return sendJson(res, 401, { error: "令牌不对" });
  try {
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

server.listen(port, HOST, () => {
  console.log(`Orca Agent Bridge 已启动：http://${HOST}:${server.address().port}`);
  console.log(`工作目录：${cwd}${dirs.length > 1 ? `（另可访问：${dirs.slice(1).join("，")}）` : ""}`);
  if (created) console.log(`已生成新令牌，请填到插件「API 密钥」：${token}`);
  console.log(`令牌文件：${tokenFile}`);
});
