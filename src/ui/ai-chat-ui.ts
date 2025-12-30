import { uiStore } from "../store/ui-store";
import { sessionStore } from "../store/session-store";
import { findViewPanelById } from "../utils/panel-tree";
import AiChatPanel from "../views/AiChatPanel";
import AiChatSidetool from "../views/AiChatSidetool";
import {
  registerAiChatContextMenus,
  unregisterAiChatContextMenus,
} from "./ai-chat-context-menu";
import { getAiChatSettings } from "../settings/ai-chat-settings";
import { saveSession, type SavedSession } from "../services/session-service";

let pluginName = "";
let aiChatViewId = "";
let sidetoolId = "";

export function getAiChatPluginName(): string {
  return pluginName;
}

function isAiChatPanelOpen(): boolean {
  const panelId = uiStore.aiChatPanelId;
  if (!panelId) return false;
  return findViewPanelById(orca.state.panels, panelId) !== null;
}

export function setLastRootBlockId(rootBlockId: number | null): void {
  uiStore.lastRootBlockId = rootBlockId;
}

export function openAiChatPanel(): void {
  if (isAiChatPanelOpen()) return;
  const panelId = orca.nav.addTo(orca.state.activePanel, "left", {
    view: aiChatViewId,
    viewArgs: { rootBlockId: uiStore.lastRootBlockId },
    viewState: {},
  });
  if (!panelId) {
    orca.notify("error", "Failed to open AI panel");
    return;
  }
  uiStore.aiChatPanelId = panelId;
  orca.nav.switchFocusTo(panelId);
}

export function toggleAiChatPanel(): void {
  if (isAiChatPanelOpen()) {
    const panelId = uiStore.aiChatPanelId;
    if (panelId) {
      // Auto-save before closing
      autoSaveOnClose().then(() => {
        orca.nav.close(panelId);
      });
    }
    uiStore.aiChatPanelId = null;
    return;
  }

  if (uiStore.aiChatPanelId) uiStore.aiChatPanelId = null;

  const panelId = orca.nav.addTo(orca.state.activePanel, "left", {
    view: aiChatViewId,
    viewArgs: { rootBlockId: uiStore.lastRootBlockId },
    viewState: {},
  });

  if (!panelId) {
    orca.notify("error", "Failed to open AI panel");
    return;
  }

  uiStore.aiChatPanelId = panelId;
  orca.nav.switchFocusTo(panelId);
}

/**
 * Auto-save session on close (always enabled)
 */
async function autoSaveOnClose(): Promise<void> {
  // Check if there's a session with messages to save
  const { currentSession, messages, contexts, isDirty } = sessionStore;
  if (!currentSession || !isDirty) {
    return;
  }

  // Filter out local-only messages
  const filteredMessages = messages.filter((m) => !m.localOnly);
  if (filteredMessages.length === 0) {
    return;
  }

  // Save the session
  const sessionToSave: SavedSession = {
    ...currentSession,
    messages: filteredMessages,
    contexts: [...contexts],
    updatedAt: Date.now(),
  };

  try {
    await saveSession(sessionToSave);
    console.log("[ai-chat-ui] Auto-saved session on close:", sessionToSave.id);
  } catch (err) {
    console.error("[ai-chat-ui] Failed to auto-save session:", err);
  }
}

export function closeAiChatPanel(panelId: string): void {
  // Auto-save before closing
  autoSaveOnClose().then(() => {
    if (uiStore.aiChatPanelId === panelId) uiStore.aiChatPanelId = null;
    orca.nav.close(panelId);
  });
}

export function registerAiChatUI(name: string): void {
  pluginName = name;
  aiChatViewId = `${pluginName}.aiChat`;
  sidetoolId = `${pluginName}.aiChatSidetool`;

  orca.panels.registerPanel(aiChatViewId, AiChatPanel);
  registerAiChatContextMenus(pluginName);
  orca.editorSidetools.registerEditorSidetool(sidetoolId, {
    render: (rootBlockId) => {
      setLastRootBlockId(typeof rootBlockId === "number" ? rootBlockId : null);
      return window.React.createElement(AiChatSidetool, { rootBlockId });
    },
  });
}

export function unregisterAiChatUI(): void {
  if (uiStore.aiChatPanelId) {
    try {
      orca.nav.close(uiStore.aiChatPanelId);
    } finally {
      uiStore.aiChatPanelId = null;
    }
  }

  if (sidetoolId) orca.editorSidetools.unregisterEditorSidetool(sidetoolId);
  unregisterAiChatContextMenus();
  if (aiChatViewId) orca.panels.unregisterPanel(aiChatViewId);

  pluginName = "";
  aiChatViewId = "";
  sidetoolId = "";
}
