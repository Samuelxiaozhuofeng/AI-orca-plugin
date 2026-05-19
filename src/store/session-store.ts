import type { ContextRef } from "./context-store";
import type { Message, SavedSession } from "../services/session-service";

const { proxy } = (window as any).Valtio as {
  proxy: <T extends object>(obj: T) => T;
};

/**
 * Session store for managing current chat session state
 * This store is used to share session state between AiChatPanel and ai-chat-ui
 */
type SessionStore = {
  currentSession: SavedSession | null;
  messages: Message[];
  contexts: ContextRef[];
  isDirty: boolean; // Track if there are unsaved changes
};

export const sessionStore = proxy<SessionStore>({
  currentSession: null,
  messages: [],
  contexts: [],
  isDirty: false,
});

/**
 * Update session store with current state
 */
export function updateSessionStore(
  session: SavedSession,
  messages: Message[],
  contexts: ContextRef[],
): void {
  sessionStore.currentSession = session;
  sessionStore.messages = messages;
  sessionStore.contexts = contexts;
  sessionStore.isDirty = true;
}

/**
 * Clear session store
 */
export function clearSessionStore(): void {
  sessionStore.currentSession = null;
  sessionStore.messages = [];
  sessionStore.contexts = [];
  sessionStore.isDirty = false;
}
