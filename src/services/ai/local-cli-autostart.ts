/**
 * 本机 AI 中转自动启动：插件加载时，若设置里有 local-cli 平台就探测 bridge；
 * 连不上则用 shell-open 拉起「Orca Agent Bridge.app」一次，每秒重试；每次探测最多 2 秒，
 * 按实际经过时间算总共最多 10 秒。仍不通不再处理，发送时由 local-cli-client 报「本机 AI 中转未启动」。
 */

import type { AiProvider } from "../../settings/ai-chat-settings";

export const BRIDGE_APP_PATH = "/Applications/Orca Agent Bridge.app";

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
  const provider = providers.find((p) => p.protocol === "local-cli");
  if (!provider) return false;
  const intervalMs = opts.intervalMs ?? 1000;
  const probeMs = opts.probeMs ?? 2000;
  const deadline = Date.now() + (opts.maxMs ?? 10000);
  const left = () => deadline - Date.now();
  if (await probe(provider, Math.min(probeMs, left()))) return true;
  try {
    await orca.invokeBackend("shell-open", BRIDGE_APP_PATH);
  } catch (err) {
    console.warn("[local-cli] 拉起本机 AI 中转失败:", err);
  }
  while (left() > 0) {
    await new Promise((r) => setTimeout(r, Math.min(intervalMs, left())));
    if (left() <= 0) break;
    if (await probe(provider, Math.min(probeMs, left()))) return true;
  }
  return false;
}
