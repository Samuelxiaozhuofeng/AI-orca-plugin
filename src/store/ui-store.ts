import type { SavedSession } from "../services/session-service";

const { proxy } = (window as any).Valtio as {
  proxy: <T extends object>(obj: T) => T;
};

type UiStore = {
  aiChatPanelId: string | null;
  lastRootBlockId: number | null;
  // 笔记里聊天块「继续对话」要面板载入的副本，面板取走后清空
  pendingChatSession: SavedSession | null;
};

export const uiStore = proxy<UiStore>({
  aiChatPanelId: null,
  lastRootBlockId: null,
  pendingChatSession: null,
});
