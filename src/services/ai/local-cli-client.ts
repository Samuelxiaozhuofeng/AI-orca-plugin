/**
 * Local CLI Client
 *
 * 经本机 bridge（bridge/orca-agent-bridge.mjs）调用 Claude Code：读 SSE 事件，转成 StreamChunk。
 * 不产生 tool_calls（工具由 Claude Code 自己执行），权限请求转给确认弹窗。
 */

import type { OpenAIChatMessage } from "./openai-client";
import type { StreamChunk } from "./chat-stream-handler";

export const LOCAL_CLI_UNSUPPORTED = "本机 AI 不支持此功能";
export const LOCAL_CLI_DEFAULT_URL = "http://127.0.0.1:18673";
const NOT_CONNECTED = "本机 AI 未连接，请先在终端运行 node bridge/orca-agent-bridge.mjs";
const ABORT_NOTE = "\n\n（已中止，中止前已执行的操作不会撤销）";
const MIN_IDLE_MS = 30000;

export type LocalCliConfirm = (
  tool: string,
  input: Record<string, any>,
  opts: { signal: AbortSignal },
) => Promise<boolean>;

export interface LocalCliContext {
  /** 插件对话 id，用于续接 claude 会话 */
  conversationId: string;
  orcaMcp?: { url: string; token: string };
  confirm: LocalCliConfirm;
}

export interface LocalCliStreamOptions {
  apiUrl: string;
  apiKey: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  localCli: LocalCliContext;
}

/** 插件对话 id → claude sessionId（仅内存，插件重载后丢失，届时用压缩历史重来） */
const claudeSessions = new Map<string, string>();

class BridgeError extends Error {
  constructor(message: string, readonly retryable = false) {
    super(message);
  }
}

function abortError(): Error {
  return new DOMException("Aborted", "AbortError");
}

function isAbort(err: any): boolean {
  return String(err?.name) === "AbortError";
}

/** bridge 事件 → StreamChunk（session/permission/done/error 由调用方处理，返回 null） */
export function mapBridgeEvent(ev: any): StreamChunk | null {
  switch (ev?.type) {
    case "text":
      return ev.delta ? { type: "content", content: String(ev.delta) } : null;
    case "thinking":
      return ev.delta ? { type: "reasoning", reasoning: String(ev.delta) } : null;
    case "tool":
      return { type: "reasoning", reasoning: `\n调用 ${String(ev.name)}\n` };
    case "tool_result":
      return { type: "reasoning", reasoning: `${String(ev.name)} ${ev.ok ? "完成" : "失败"}\n` };
    default:
      return null;
  }
}

function messageText(m: OpenAIChatMessage): string {
  const content: any = (m as any).content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.filter((p: any) => p?.type === "text").map((p: any) => p.text).join("\n");
  }
  return "";
}

/** 有 claude 会话就只发最新一条用户消息；没有就把历史压成文字一并发 */
export function buildLocalCliPrompt(messages: OpenAIChatMessage[], resume: boolean): string {
  const convo = messages.filter((m) => m.role === "user" || m.role === "assistant");
  let lastUser = -1;
  for (let i = convo.length - 1; i >= 0; i--) {
    if (convo[i].role === "user") { lastUser = i; break; }
  }
  const current = lastUser >= 0 ? messageText(convo[lastUser]) : "";
  if (resume) return current;
  const history = convo
    .slice(0, Math.max(lastUser, 0))
    .map((m) => ({ role: m.role, text: messageText(m).trim() }))
    .filter((m) => m.text)
    .map((m) => `${m.role === "user" ? "用户" : "助手"}：${m.text}`);
  if (history.length === 0) return current;
  return `以下是此前的对话记录：\n\n${history.join("\n\n")}\n\n---\n当前问题：\n${current}`;
}

async function* readBridge(
  base: string,
  apiKey: string,
  body: Record<string, any>,
  signal: AbortSignal | undefined,
  idleMs: number,
): AsyncGenerator<any, void, unknown> {
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  signal?.addEventListener("abort", onAbort);
  if (signal?.aborted) ctrl.abort();
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  // 心跳（每 10 秒）也算活动，等待确认期间不会被误杀
  const arm = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { timedOut = true; ctrl.abort(); }, idleMs);
  };
  const failure = (fallback: BridgeError): Error => {
    if (signal?.aborted) return abortError();
    if (timedOut) return new BridgeError(`本机 AI 超过 ${Math.round(idleMs / 1000)} 秒没有响应`);
    return fallback;
  };

  try {
    arm();
    let res: Response;
    try {
      res = await fetch(`${base}/chat`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
    } catch {
      throw failure(new BridgeError(NOT_CONNECTED));
    }
    if (res.status === 401) {
      throw new BridgeError("本机 AI 令牌不对：请把 ~/.orca-agent-bridge/token 里的令牌填到该平台的「API 密钥」");
    }
    if (res.status === 409) throw new BridgeError("上一条还在进行，请等它结束或先点停止");
    if (!res.ok || !res.body) {
      const text = await res.text().catch(() => "");
      throw new BridgeError(`本机 AI 请求失败（${res.status}）${text ? "：" + text.slice(0, 300) : ""}`);
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    for (;;) {
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try {
        chunk = await reader.read();
      } catch {
        throw failure(new BridgeError("本机 AI 连接中断，回复未完成", true));
      }
      if (chunk.done) break;
      arm();
      buf += decoder.decode(chunk.value, { stream: true });
      let i: number;
      while ((i = buf.indexOf("\n\n")) >= 0) {
        const block = buf.slice(0, i);
        buf = buf.slice(i + 2);
        const data = block
          .split("\n")
          .filter((line) => line.startsWith("data:"))
          .map((line) => line.slice(5).trimStart())
          .join("\n");
        if (!data) continue;
        let ev: any;
        try { ev = JSON.parse(data); } catch { continue; }
        yield ev;
      }
    }
  } finally {
    if (timer) clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
    // 提前结束时断开连接，bridge 会杀掉子进程
    ctrl.abort();
  }
}

export async function* streamLocalCli(
  options: LocalCliStreamOptions,
  messages: OpenAIChatMessage[],
): AsyncGenerator<StreamChunk, void, unknown> {
  const ctx = options.localCli;
  const base = options.apiUrl.trim().replace(/\/+$/, "");
  const idleMs = Math.max(options.timeoutMs ?? MIN_IDLE_MS, MIN_IDLE_MS);
  // 本次请求的所有确认弹窗；中止/出错/结束时一并关闭
  const dialogs = new AbortController();
  let content = "";
  let reasoning = "";

  const answerPermission = async (ev: any) => {
    const allow = await ctx
      .confirm(String(ev.tool), ev.input && typeof ev.input === "object" ? ev.input : {}, { signal: dialogs.signal })
      .catch(() => false);
    if (dialogs.signal.aborted) return;
    await fetch(`${base}/permission`, {
      method: "POST",
      headers: { Authorization: `Bearer ${options.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ requestId: ev.requestId, allow }),
    }).catch(() => {});
  };

  try {
    for (let attempt = 0; ; attempt++) {
      const resumeId = claudeSessions.get(ctx.conversationId);
      let gotOutput = false;
      let done = false;
      try {
        const body = {
          prompt: buildLocalCliPrompt(messages, Boolean(resumeId)),
          sessionId: resumeId,
          orcaMcp: ctx.orcaMcp,
        };
        for await (const ev of readBridge(base, options.apiKey, body, options.signal, idleMs)) {
          if (ev.type === "session" && ev.id) {
            claudeSessions.set(ctx.conversationId, String(ev.id));
          } else if (ev.type === "permission") {
            void answerPermission(ev);
          } else if (ev.type === "error") {
            throw new BridgeError(`本机 AI 出错：${String(ev.message || "未知错误")}`, true);
          } else if (ev.type === "done") {
            done = true;
          }
          const chunk = mapBridgeEvent(ev);
          if (!chunk) continue;
          if (ev.type === "text" || ev.type === "tool") gotOutput = true;
          if (chunk.type === "content") content += chunk.content;
          if (chunk.type === "reasoning") reasoning += chunk.reasoning;
          yield chunk;
        }
        if (!done) throw new BridgeError("本机 AI 连接中断，回复未完成", true);
        break;
      } catch (err: any) {
        // 只在续接会话、尚未收到任何内容时（如 resume 起不来）丢掉 sessionId 重试一次
        const retry = !isAbort(err) && err instanceof BridgeError && err.retryable && resumeId && !gotOutput && attempt === 0;
        if (!retry) throw err;
        claudeSessions.delete(ctx.conversationId);
      }
    }
  } catch (err: any) {
    if (isAbort(err)) {
      content += ABORT_NOTE;
      yield { type: "content", content: ABORT_NOTE };
    }
    throw err;
  } finally {
    dialogs.abort();
  }

  yield { type: "done", result: { content, toolCalls: [], reasoning, finishReason: "stop" } };
}
