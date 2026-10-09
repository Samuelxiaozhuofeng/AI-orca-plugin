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
async function probe(provider: AiProvider, timeoutMs: number): Promise<boolean> {
  const base = provider.apiUrl.trim().replace(/\/+$/, "");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    await fetch(`${base}/models`, { headers: { Authorization: `Bearer ${provider.apiKey}` }, signal: ctrl.signal });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/** 返回 true = 中转可连；false = 没有 local-cli 平台或拉起后仍不通 */
export async function autostartLocalCli(
  providers: AiProvider[],
  opts: { intervalMs?: number; maxMs?: number; probeMs?: number } = {},
): Promise<boolean> {
  const provider = providers.find((p) => p.protocol === "local-cli" && p.enabled !== false); // 停用了就不探测、不拉起
  if (!provider) return false;
  const intervalMs = opts.intervalMs ?? 1000;
  const probeMs = opts.probeMs ?? 2000;
  const deadline = Date.now() + (opts.maxMs ?? 10000);
  const left = () => deadline - Date.now();
  if (await probe(provider, Math.min(probeMs, left()))) return true;
  // 不知道装在哪：两处都试，不存在的那处打开失败无副作用
  for (const app of [BRIDGE_APP_PATH, userAppPath()]) {
    if (!app) continue;
    try {
      await orca.invokeBackend("shell-open", app);
    } catch (err) {
      console.warn("[local-cli] 拉起本机 AI 中转失败:", app, err);
    }
  }
  while (left() > 0) {
    await new Promise((r) => setTimeout(r, Math.min(intervalMs, left())));
    if (left() <= 0) break;
    if (await probe(provider, Math.min(probeMs, left()))) return true;
  }
  return false;
}

/**
 * 发 /chat：连接层失败（fetch 抛错、没拿到任何 HTTP 响应）时拉起中转，通了就重发同一请求一次。
 * 拿到响应后的任何失败都不经过这里，不会重发；已中止（停止 / 切换对话 / 超时）就不重连、不重发。
 */
export async function fetchWithReconnect(
  doFetch: () => Promise<Response>,
  reconnect: () => Promise<boolean>,
  signal?: AbortSignal,
): Promise<Response> {
  try {
    return await doFetch();
  } catch (err) {
    if (signal?.aborted) throw err;
    const ok = await reconnect().catch(() => false);
    if (!ok || signal?.aborted) throw err;
    return await doFetch();
  }
}
