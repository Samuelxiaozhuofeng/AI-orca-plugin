/**
 * Local CLI Client
 *
 * 经本机 bridge（bridge/orca-agent-bridge.mjs）调用 Claude Code：读 SSE 事件，转成 StreamChunk。
 * 不产生 tool_calls（工具由 Claude Code 自己执行），权限请求转给确认弹窗。
 * 不续接 claude 会话：每次都新开，prompt = 当前可见历史压缩 + 用户上下文 + 最新消息。
 */

import type { OpenAIChatMessage } from "./openai-client";
import type { StreamChunk } from "./chat-stream-handler";

export const LOCAL_CLI_UNSUPPORTED = "本机 AI 不支持此功能";
export const LOCAL_CLI_DEFAULT_URL = "http://127.0.0.1:18673";
const NOT_CONNECTED = "本机 AI 未连接：本机 AI 中转未启动。请打开「Orca Agent Bridge」App，或在终端运行 node bridge/orca-agent-bridge.mjs。打开 App 后仍连不上，启动失败原因见 ~/.orca-agent-bridge/bridge.log";
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
  /** 插件对话 id：完全放开模式的提醒每个对话只弹一次 */
  conversationId: string;
  /** 用户拖入的笔记/页面等上下文；每轮都拼进 prompt */
  contextText?: string;
  /** 用户的记忆、技能、本条消息的格式要求；放在 prompt 最前面 */
  instructions?: string;
  orcaMcp?: { url: string; token: string };
  /** 本对话选的工作文件夹；空 = 中转默认文件夹 */
  workDir?: string;
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

/** 已弹过完全放开提醒的插件对话 id（仅内存） */
const fullAccessWarned = new Set<string>();
/** 已提示过「中转是旧版、选的文件夹没生效」的插件对话 id（仅内存） */
const staleBridgeWarned = new Set<string>();

class BridgeError extends Error {}

function abortError(): Error {
  return new DOMException("Aborted", "AbortError");
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

/** 回复正文开头的模式行（单独成段）；压缩历史时按 BANNER_RE 剥掉 */
// 不依赖换行：面板累加时会 trim，模式行后面的换行可能被吃掉；文件夹段用「」包住以便定界（旧格式没有文件夹段）
export const BANNER_RE = /^本机 AI · 模型 [^\n]*? · (?:安全模式|⚠ 完全放开模式)(?: · 文件夹「[^」\n]*」)?\s*/;

/** 家目录前缀缩成 ~（渲染进程拿不到 homedir，按 macOS/Linux 的常见布局猜） */
// ponytail: 只认 /Users/<名> 与 /home/<名>，家目录在别处时显示完整路径
export function shortenHome(p: string): string {
  return p.replace(/^\/(?:Users|home)\/[^/]+(?=\/|$)/, "~");
}

/** session 事件 → 回复正文开头一行模式说明；老 bridge 不带 mode 时不显示；带 cwd 才加文件夹段 */
export function sessionBanner(ev: any): string | null {
  if (ev?.mode !== "safe" && ev?.mode !== "full") return null;
  const model = ev.model ? String(ev.model) : "claude";
  const folder = typeof ev.cwd === "string" && ev.cwd ? ` · 文件夹「${shortenHome(ev.cwd)}」` : "";
  return `本机 AI · 模型 ${model} · ${ev.mode === "full" ? "⚠ 完全放开模式" : "安全模式"}${folder}\n\n`;
}

/** 个人设定 + 可见历史（调用方已排除 localOnly）压成文字 + 用户上下文 + 最新一条用户消息；助手回复开头的模式行剥掉 */
export function buildLocalCliPrompt(messages: OpenAIChatMessage[], contextText?: string, instructions?: string): string {
  const head = instructions?.trim() ? `以下是用户的个人设定与要求，请遵守：\n\n${instructions.trim()}\n\n---\n` : "";
  return head + buildConversationPrompt(messages, contextText);
}

function buildConversationPrompt(messages: OpenAIChatMessage[], contextText?: string): string {
  const convo = messages.filter((m) => m.role === "user" || m.role === "assistant");
  const lastUser = lastUserIndex(convo);
  const current = lastUser >= 0 ? messageText(convo[lastUser]) : "";
  const context = contextText?.trim() ? `以下是用户提供的上下文：\n\n${contextText.trim()}\n\n---\n` : "";
  const history = convo
    .slice(0, Math.max(lastUser, 0))
    .map((m) => ({ role: m.role, text: (m.role === "assistant" ? messageText(m).replace(BANNER_RE, "") : messageText(m)).trim() }))
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
        throw failure(new BridgeError("本机 AI 连接中断，回复未完成"));
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
  let bannerShown = false;
  let textAfterBanner = false;
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
    let done = false;
    const workDir = ctx.workDir?.trim();
    const body = { prompt: buildLocalCliPrompt(messages, ctx.contextText, ctx.instructions), model: options.model, orcaMcp: ctx.orcaMcp, ...(workDir ? { workDir } : {}) };
    for await (const ev of readBridge(base, options.apiKey, body, run.signal, idleMs)) {
      if (ev.type === "session") {
        if (workDir && !ev.cwd && !staleBridgeWarned.has(ctx.conversationId)) {
          staleBridgeWarned.add(ctx.conversationId);
          orca.notify("warn", "中转程序是旧版，选的文件夹没生效，AI 仍在默认文件夹里运行；请退出中转后重新打开 Orca");
        }
        const banner = bannerShown ? null : sessionBanner(ev);
        if (banner) {
          bannerShown = true;
          content += banner;
          yield { type: "content", content: banner };
          if (ev.mode === "full" && !fullAccessWarned.has(ctx.conversationId)) {
            fullAccessWarned.add(ctx.conversationId);
            orca.notify("warn", "本机 AI 在完全放开模式下运行：会不经确认直接改文件、跑命令、改笔记");
          }
        }
      } else if (ev.type === "permission") {
        permissionQueue = permissionQueue.then(() => answerPermission(ev));
      } else if (ev.type === "error") {
        throw new BridgeError(`本机 AI 出错：${String(ev.message || "未知错误")}`);
      } else if (ev.type === "done") {
        done = true;
      }
      let chunk = mapBridgeEvent(ev);
      if (!chunk) continue;
      if (chunk.type === "content") {
        content += chunk.content;
        // 面板对累加内容 trim，模式行后单独发的 "\n\n" 会被吃掉：流式时给第一段正文补上分段（最终 content 不重复）
        // 纯空白块会被 trim 掉，等第一段可见正文再补分段
        if (bannerShown && !textAfterBanner && chunk.content.trim()) {
          chunk = { ...chunk, content: `\n\n${chunk.content}` };
          textAfterBanner = true;
        }
      }
      if (chunk.type === "reasoning") reasoning += chunk.reasoning;
      yield chunk;
    }
    if (!done) throw new BridgeError("本机 AI 连接中断，回复未完成");
  } catch (err: any) {
    if (permissionError && !options.signal?.aborted) throw permissionError;
    throw err;
  } finally {
    dialogs.abort();
    options.signal?.removeEventListener("abort", onAbort);
  }

  yield { type: "done", result: { content, toolCalls: [], reasoning, finishReason: "stop" } };
}
