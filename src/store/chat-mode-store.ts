/**
 * Chat Mode Store - Manages AI chat interaction modes
 * Supports two modes: Agent (auto-execute), Ask (text-only)
 */

const { proxy } = (window as any).Valtio as {
  proxy: <T extends object>(obj: T) => T;
};

// ============================================================================
// Types
// ============================================================================

/**
 * Chat mode determines how AI handles tool calls
 * - agent: Execute tool calls automatically without confirmation
 * - ask: Text-only mode, no tool calls sent to AI
 */
export type ChatMode = 'agent' | 'ask';

/**
 * Chat mode store state
 */
export interface ChatModeState {
  mode: ChatMode;
}

/**
 * Storage schema for persisted mode settings
 */
interface StoredModeSettings {
  mode: ChatMode;
  updatedAt: number;
}

// ============================================================================
// Constants
// ============================================================================

const STORAGE_KEY = 'ai-chat-mode';
const DEFAULT_MODE: ChatMode = 'agent';

// ============================================================================
// Store State
// ============================================================================

export const chatModeStore = proxy<ChatModeState>({
  mode: DEFAULT_MODE,
});

// ============================================================================
// Utilities
// ============================================================================

/**
 * Validate that a mode value is valid
 */
function isValidMode(mode: unknown): mode is ChatMode {
  return mode === 'agent' || mode === 'ask';
}

// ============================================================================
// Mode Actions
// ============================================================================

/**
 * Set the current chat mode
 * @param mode - The new chat mode
 */
export function setMode(mode: ChatMode): void {
  if (!isValidMode(mode)) {
    return;
  }

  chatModeStore.mode = mode;
  saveToStorage();
}

/**
 * Get the current chat mode
 */
export function getMode(): ChatMode {
  return chatModeStore.mode;
}

// ============================================================================
// Persistence
// ============================================================================

/**
 * Save current mode to localStorage
 */
export function saveToStorage(): void {
  try {
    const settings: StoredModeSettings = {
      mode: chatModeStore.mode,
      updatedAt: Date.now(),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch (error) {
    // Silent fail - don't affect runtime state
    console.warn('[ChatModeStore] Failed to save to storage:', error);
  }
}

/**
 * Load mode from localStorage
 * Defaults to 'agent' mode if no saved setting or invalid data
 */
export function loadFromStorage(): void {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) {
      chatModeStore.mode = DEFAULT_MODE;
      return;
    }

    const settings: StoredModeSettings = JSON.parse(stored);
    if (isValidMode(settings.mode)) {
      chatModeStore.mode = settings.mode;
    } else {
      chatModeStore.mode = DEFAULT_MODE;
    }
  } catch (error) {
    // On error, use default mode
    console.warn('[ChatModeStore] Failed to load from storage:', error);
    chatModeStore.mode = DEFAULT_MODE;
  }
}

/**
 * Reset store to default state (useful for testing)
 */
export function resetStore(): void {
  chatModeStore.mode = DEFAULT_MODE;
}
