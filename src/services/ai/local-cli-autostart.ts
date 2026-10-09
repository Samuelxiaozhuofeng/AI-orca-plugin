/**
 * 本机 AI 中转自动启动：插件加载时，若设置里有 local-cli 平台就探测 bridge；
 * 连不上则用 shell-open 拉起「Orca Agent Bridge.app」（/Applications 和 ~/Applications 各试一次），每秒重试；每次探测最多 2 秒，
 * 按实际经过时间算总共最多 10 秒。仍不通返回 false：加载时由 main 提示一次；发送时由 local-cli-client 重连后报「本机 AI 中转未启动」。
 */

import type { AiProvider } from "../../settings/ai-chat-settings";

export const BRIDGE_APP_PATH = "/Applications/Orca Agent Bridge.app";

/** 插件 API 没有主目录也没有按应用名打开，从 Orca 数据目录推出 ~/Applications 下的路径；推不出返回 null */
export function userAppPath(): string | null {
  const m = /^(\/Users\/[^/]+)\//.exec(String((globalThis as any).orca?.state?.dataDir ?? ""));
  return m ? `${m[1]}/Applications/Orca Agent Bridge.app` : null;
}

/** 有任何 HTTP 响应（含 401）都算中转已在跑；连不上或超时才算没启动 */
export async function probe(provider: AiProvider, timeoutMs: number, signal?: AbortSignal): Promise<boolean> {
  const base = provider.apiUrl.trim().replace(/\/+$/, "");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const onAbort = () => ctrl.abort();
  signal?.addEventListener("abort", onAbort);
  try {
    await fetch(`${base}/models`, { headers: { Authorization: `Bearer ${provider.apiKey}` }, signal: ctrl.signal });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", onAbort);
  }
}

/** 可被中止打断的等待 */
function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const done = () => { clearTimeout(timer); signal?.removeEventListener("abort", done); resolve(); };
    const timer = setTimeout(done, ms);
    signal?.addEventListener("abort", done);
  });
}

/** 返回 true = 中转可连；false = 没有 local-cli 平台、拉起后仍不通或已中止（中止后不再拉起、不再重试） */
export async function autostartLocalCli(
  providers: AiProvider[],
  opts: { intervalMs?: number; maxMs?: number; probeMs?: number; signal?: AbortSignal } = {},
): Promise<boolean> {
  const { signal } = opts;
  if (signal?.aborted) return false;
  const provider = providers.find((p) => p.protocol === "local-cli" && p.enabled !== false); // 停用了就不探测、不拉起
  if (!provider) return false;
  const intervalMs = opts.intervalMs ?? 1000;
  const probeMs = opts.probeMs ?? 2000;
  const deadline = Date.now() + (opts.maxMs ?? 10000);
  const left = () => deadline - Date.now();
  if (await probe(provider, Math.min(probeMs, left()), signal)) return true;
  if (signal?.aborted) return false;
  // 不知道装在哪：两处都试，不存在的那处打开失败无副作用
  for (const app of [BRIDGE_APP_PATH, userAppPath()]) {
    if (!app) continue;
    try {
      await orca.invokeBackend("shell-open", app);
    } catch (err) {
      console.warn("[local-cli] 拉起本机 AI 中转失败:", app, err);
    }
  }
  while (left() > 0 && !signal?.aborted) {
    await sleep(Math.min(intervalMs, left()), signal);
    if (left() <= 0 || signal?.aborted) break;
    if (await probe(provider, Math.min(probeMs, left()), signal)) return true;
  }
  return false;
}

/** 连接失败但中转其实在跑：请求没送到（多半是太大被断开，或中转是旧版） */
export const NOT_DELIVERED = "请求没送到中转：可能图片太大，或中转是旧版，请退出中转后重开 Orca";
export class NotDeliveredError extends Error {}

/**
 * 发 /chat：连接层失败（fetch 抛错、没拿到任何 HTTP 响应）时先探测：中转本来在跑 → 小请求体
 * （allowResendWhenRunning，如 Orca 刚启动中转刚起来）重发一次，大请求体不重发、抛 NotDeliveredError；
 * 本来没在跑 → 拉起，通了就重发同一请求一次。
 * 拿到响应后的任何失败都不经过这里，不会重发；已中止（停止 / 切换对话 / 超时）就不重连、不重发。
 */
export async function fetchWithReconnect(
  doFetch: () => Promise<Response>,
  reconnect: () => Promise<boolean>,
  signal?: AbortSignal,
  isRunning: () => Promise<boolean> = async () => false,
  allowResendWhenRunning = false,
): Promise<Response> {
  try {
    return await doFetch();
  } catch (err) {
    if (signal?.aborted) throw err;
    if (await isRunning().catch(() => false)) {
      if (!allowResendWhenRunning) throw new NotDeliveredError(NOT_DELIVERED);
      if (signal?.aborted) throw err;
      return await doFetch();
    }
    if (signal?.aborted) throw err;
    const ok = await reconnect().catch(() => false);
    if (!ok || signal?.aborted) throw err;
    return await doFetch();
  }
}
