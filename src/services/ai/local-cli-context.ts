/**
 * 组装本机 AI（local-cli）所需的运行时上下文：Orca MCP 地址/令牌 + 全量确认弹窗。
 */

import { mcpStore } from "../../store/mcp-store";
import { createToolConfirmPromise } from "../../components/ToolConfirmDialog";
import type { LocalCliContext } from "./local-cli-client";

export function buildLocalCliContext(conversationId: string): LocalCliContext {
  const orcaNote = mcpStore.servers.find((s) => s.id === "orca-note");
  const auth = orcaNote?.headers?.Authorization ?? orcaNote?.headers?.authorization ?? "";
  return {
    conversationId,
    orcaMcp: orcaNote?.url ? { url: orcaNote.url, token: auth.replace(/^Bearer\s+/i, "") } : undefined,
    confirm: (tool, input, { signal }) => createToolConfirmPromise(tool, input, { full: true, signal }),
  };
}
