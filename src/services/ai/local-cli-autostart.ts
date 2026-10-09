/**
 * 本机 AI 中转自动启动：插件加载时，若设置里有 local-cli 平台就探测 bridge；
 * 连不上则用 shell-open 拉起「Orca Agent Bridge.app」一次，每秒重试，最多 10 秒。
 * 仍不通不再处理，发送时由 local-cli-client 报「本机 AI 中转未启动」。
 */

import type { AiProvider } from "../../settings/ai-chat-settings";

export const BRIDGE_APP_PATH = "/Applications/Orca Agent Bridge.app";

/** 有任何 HTTP 响应（含 401）都算中转已在跑；只有连不上才算没启动 */
async function probe(provider: AiProvider): Promise<boolean> {
  const base = provider.apiUrl.trim().replace(/\/+$/, "");
  try {
    await fetch(`${base}/models`, { headers: { Authorization: `Bearer ${provider.apiKey}` } });
    return true;
  } catch {
    return false;
  }
}

/** 返回 true = 中转可连；false = 没有 local-cli 平台或拉起后仍不通 */
export async function autostartLocalCli(
  providers: AiProvider[],
  opts: { intervalMs?: number; maxMs?: number } = {},
): Promise<boolean> {
  const provider = providers.find((p) => p.protocol === "local-cli");
  if (!provider) return false;
  if (await probe(provider)) return true;
  const intervalMs = opts.intervalMs ?? 1000;
  const maxMs = opts.maxMs ?? 10000;
  try {
    await orca.invokeBackend("shell-open", BRIDGE_APP_PATH);
  } catch (err) {
    console.warn("[local-cli] 拉起本机 AI 中转失败:", err);
  }
  for (let waited = 0; waited < maxMs; waited += intervalMs) {
    await new Promise((r) => setTimeout(r, intervalMs));
    if (await probe(provider)) return true;
  }
  return false;
}
