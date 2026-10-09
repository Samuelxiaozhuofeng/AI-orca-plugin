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
const NOT_CONNECTED = "本机 AI 未连接：本机 AI 中转未启动。请打开「Orca Agent Bridge」App，或在终端运行 node bridge/orca-agent-bridge.mjs";
/** 中止提示：由调用方确认请求仍属当前对话后补到原消息上（生成器不输出它） */
export const LOCAL_CLI_ABORT_NOTE = "（已中止，中止前已执行的操作不会撤销）";
const MIN_IDLE_MS = 30000;
const PERMISSION_POST_TIMEOUT_MS = 10000;

export type LocalCliConfirm = (
  tool: string,
  input: Record<string, any>,
  opts: { signal: AbortSignal },
) => Promise<boolean>;

export interface LocalCliContext {
  /** 插件对话 id，用于续接 claude 会话 */
  conversationId: string;
  /** 本次发出时的可见历史（末条为新用户消息），其前的 id 序列须与上轮结束时记下的一致才续接 */
  history: Array<{ id: string; role: string }>;
  /** 用户拖入的笔记/页面等上下文；每轮都拼进 prompt（含续接时） */
  contextText?: string;
  orcaMcp?: { url: string; token: string };
  confirm: LocalCliConfirm;
}

export interface LocalCliStreamOptions {
  apiUrl: string;
  apiKey: string;
  /** 所选模型 id，随 /chat 发给 bridge（claude = 用 Claude Code 默认） */
  model?: string;
  signal?: AbortSignal;
  timeoutMs?: number;
  localCli: LocalCliContext;
}

/**
 * 插件对话 id → claude sessionId + 本轮结束后的可见消息 id 序列（仅内存，插件重载后丢失，届时用压缩历史重来）。
 * fingerprint 为 null = 本轮还没结束（或被中途作废），下次一律不续接。
 */
const claudeSessions = new Map<string, { id: string; fingerprint: string | null }>();

function idSequence(list: Array<{ id: string; localOnly?: boolean }>): string {
  return list.filter((m) => !m.localOnly).map((m) => m.id).join(",");
}

/** 本轮结束（含出错、中止）后由界面调用：记下此刻全部可见消息的 id 序列，下次发送据此判断能否续接 */
export function finishLocalCliRound(conversationId: string, visible: Array<{ id: string; localOnly?: boolean }>): void {
  const saved = claudeSessions.get(conversationId);
  if (saved && saved.fingerprint === null) saved.fingerprint = idSequence(visible);
}

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

function lastUserIndex(list: Array<{ role: string }>): number {
  for (let i = list.length - 1; i >= 0; i--) if (list[i].role === "user") return i;
  return -1;
}

/** 新用户消息之前的可见消息 id 序列（回档、删/换助手回复、切分支后与上轮记下的对不上） */
export function priorFingerprint(history: Array<{ id: string; role: string }>): string {
  return idSequence(history.slice(0, Math.max(lastUserIndex(history), 0)));
}

/** session 事件 → 回复开头一行模式说明；老 bridge 不带 mode 时不显示 */
export function sessionBanner(ev: any): string | null {
  if (ev?.mode !== "safe" && ev?.mode !== "full") return null;
  const model = ev.model ? String(ev.model) : "claude";
  return `本机 AI · 模型 ${model} · ${ev.mode === "full" ? "⚠ 完全放开模式" : "安全模式"}\n`;
}

/** 有 claude 会话就只发最新一条用户消息；没有就把历史压成文字一并发。用户上下文每轮都带 */
export function buildLocalCliPrompt(messages: OpenAIChatMessage[], resume: boolean, contextText?: string): string {
  const convo = messages.filter((m) => m.role === "user" || m.role === "assistant");
  const lastUser = lastUserIndex(convo);
  const current = lastUser >= 0 ? messageText(convo[lastUser]) : "";
  const context = contextText?.trim() ? `以下是用户提供的上下文：\n\n${contextText.trim()}\n\n---\n` : "";
  if (resume) return context ? `${context}当前问题：\n${current}` : current;
  const history = convo
    .slice(0, Math.max(lastUser, 0))
    .map((m) => ({ role: m.role, text: messageText(m).trim() }))
    .filter((m) => m.text)
    .map((m) => `${m.role === "user" ? "用户" : "助手"}：${m.text}`);
  if (history.length === 0) return context ? `${context}当前问题：\n${current}` : current;
  return `${context}以下是此前的对话记录：\n\n${history.join("\n\n")}\n\n---\n当前问题：\n${current}`;
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
  // 权限结果提交失败时用它终止本次生成
  const run = new AbortController();
  const onAbort = () => run.abort();
  options.signal?.addEventListener("abort", onAbort);
  if (options.signal?.aborted) run.abort();
  let permissionError: BridgeError | null = null;
  // 权限请求串行排队，一次只显示一个弹窗
  let permissionQueue: Promise<void> = Promise.resolve();
  const prior = priorFingerprint(ctx.history);
  let bannerShown = false;
  let content = "";
  let reasoning = "";

  const answerPermission = async (ev: any) => {
    if (dialogs.signal.aborted) return;
    const allow = await ctx
      .confirm(String(ev.tool), ev.input && typeof ev.input === "object" ? ev.input : {}, { signal: dialogs.signal })
      .catch(() => false);
    if (dialogs.signal.aborted) return;
    let status = 0;
    // 手写合并中止信号（旧 Chromium 没有 AbortSignal.any）：弹窗作废或超时都中止提交
    const post = new AbortController();
    const onDialogsAbort = () => post.abort();
    dialogs.signal.addEventListener("abort", onDialogsAbort);
    const timer = setTimeout(() => post.abort(), PERMISSION_POST_TIMEOUT_MS);
    try {
      const res = await fetch(`${base}/permission`, {
        method: "POST",
        headers: { Authorization: `Bearer ${options.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({ requestId: ev.requestId, allow }),
        signal: post.signal,
      });
      if (res.ok) return;
      status = res.status;
    } catch {
    } finally {
      clearTimeout(timer);
      dialogs.signal.removeEventListener("abort", onDialogsAbort);
    }
    if (dialogs.signal.aborted) return;
    permissionError = new BridgeError(`本机 AI 确认结果提交失败${status ? `（${status}）` : ""}，本次回复已终止`);
    run.abort();
  };

  try {
    for (let attempt = 0; ; attempt++) {
      const saved = claudeSessions.get(ctx.conversationId);
      // 可见历史与上轮结束时记下的不一致（清空、回档、删回复、切分支、上轮没正常收尾）→ 丢掉，按当前历史重建
      if (saved && saved.fingerprint !== prior) claudeSessions.delete(ctx.conversationId);
      const resumeId = saved?.fingerprint === prior ? saved.id : undefined;
      let gotOutput = false;
      let done = false;
      try {
        const body = {
          prompt: buildLocalCliPrompt(messages, Boolean(resumeId), ctx.contextText),
          sessionId: resumeId,
          model: options.model,
          orcaMcp: ctx.orcaMcp,
        };
        for await (const ev of readBridge(base, options.apiKey, body, run.signal, idleMs)) {
          if (ev.type === "session" && ev.id) {
            claudeSessions.set(ctx.conversationId, { id: String(ev.id), fingerprint: null });
            const banner = bannerShown ? null : sessionBanner(ev);
            if (banner) {
              bannerShown = true;
              reasoning += banner;
              yield { type: "reasoning", reasoning: banner };
            }
          } else if (ev.type === "permission") {
            permissionQueue = permissionQueue.then(() => answerPermission(ev));
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
    if (permissionError && !options.signal?.aborted) throw permissionError;
    throw err;
  } finally {
    dialogs.abort();
    options.signal?.removeEventListener("abort", onAbort);
  }

  yield { type: "done", result: { content, toolCalls: [], reasoning, finishReason: "stop" } };
}
