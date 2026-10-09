/**
 * 本机 AI 续接判定：发送前的历史里最后一条就是上次运行记下的那条回复（ccHead），才直接续接那个 Claude Code 会话。
 */

import type { Message } from "../session-service";
import { BANNER_RE, LOCAL_CLI_ABORT_NOTE, type LocalCliResume } from "./local-cli-client";

/** history：发送时的历史（不含新 user 消息）；不满足条件返回 undefined = 整段新开 */
export function pickLocalCliResume(
  history: Message[],
  head: { sid: string; msgId: string } | undefined,
): LocalCliResume | undefined {
  const visible = history.filter((m) => !m.localOnly);
  const last = visible[visible.length - 1];
  if (!head || !last || last.role !== "assistant" || last.id !== head.msgId || last.cc?.sid !== head.sid) return undefined;
  if (!last.cc.partial) return { sid: head.sid };
  // 屏幕上的半截正文：去掉开头模式行和末尾中止附注，只作纯文本补给 AI
  let text = (last.content || "").replace(BANNER_RE, "").trim();
  if (text.endsWith(LOCAL_CLI_ABORT_NOTE)) text = text.slice(0, -LOCAL_CLI_ABORT_NOTE.length).trim();
  return text ? { sid: head.sid, partialText: text } : { sid: head.sid };
}
