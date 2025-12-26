/**
 * Chat Mode Store - Manages AI chat interaction modes
 * Supports three modes: Agent (auto-execute), Supervised (confirm), Ask (text-only)
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
 * - supervised: Queue tool calls for user confirmation before execution
 * - ask: Text-only mode, no tool calls sent to AI
 */
export type ChatMode = 'agent' | 'supervised' | 'ask';

/**
 * Status of a pending tool call
 */
export type ToolCallStatus = 'pending' | 'approved' | 'rejected' | 'executed';

/**
 * Pending tool call waiting for user confirmation in Supervised mode
 */
export interface PendingToolCall {
  id: string;
  toolName: string;
  args: Record<string, any>;
  timestamp: number;
  status: ToolCallStatus;
}

/**
 * Chat mode store state
 */
export interface ChatModeState {
  mode: ChatMode;
  pendingToolCalls: PendingToolCall[];
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
  pendingToolCalls: [],
});

// ============================================================================
// Utilities
// ============================================================================

/**
 * Generate a unique ID for tool calls
 */
export function generateToolCallId(): string {
  return `tc-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Validate that a mode value is valid
 */
function isValidMode(mode: unknown): mode is ChatMode {
  return mode === 'agent' || mode === 'supervised' || mode === 'ask';
}

// ============================================================================
// Mode Actions
// ============================================================================

/**
 * Set the current chat mode
 * Handles pending tool calls when switching modes:
 * - Switch to Agent: auto-approve all pending
 * - Switch to Ask: auto-reject all pending
 * @param mode - The new chat mode
 */
export function setMode(mode: ChatMode): void {
  if (!isValidMode(mode)) {
    return;
  }

  const previousMode = chatModeStore.mode;
  chatModeStore.mode = mode;

  // Handle pending tool calls when switching modes
  if (previousMode === 'supervised' && chatModeStore.pendingToolCalls.length > 0) {
    if (mode === 'agent') {
      // Auto-approve all pending when switching to Agent
      approveAllToolCalls();
    } else if (mode === 'ask') {
      // Auto-reject all pending when switching to Ask
      rejectAllToolCalls();
    }
  }

  saveToStorage();
}

/**
 * Get the current chat mode
 */
export function getMode(): ChatMode {
  return chatModeStore.mode;
}

// ============================================================================
// Pending Tool Call Actions
// ============================================================================

/**
 * Add a tool call to the pending queue (Supervised mode)
 * @param toolName - Name of the tool being called
 * @param args - Arguments for the tool call
 * @returns The created PendingToolCall
 */
export function addPendingToolCall(
  toolName: string,
  args: Record<string, any>
): PendingToolCall {
  const toolCall: PendingToolCall = {
    id: generateToolCallId(),
    toolName,
    args,
    timestamp: Date.now(),
    status: 'pending',
  };

  chatModeStore.pendingToolCalls = [...chatModeStore.pendingToolCalls, toolCall];
  return toolCall;
}

/**
 * Remove a tool call from the pending queue
 * @param id - ID of the tool call to remove
 */
export function removePendingToolCall(id: string): void {
  chatModeStore.pendingToolCalls = chatModeStore.pendingToolCalls.filter(
    (tc) => tc.id !== id
  );
}

/**
 * Clear all pending tool calls
 */
export function clearPendingToolCalls(): void {
  chatModeStore.pendingToolCalls = [];
}

/**
 * Get a pending tool call by ID
 * @param id - ID of the tool call
 * @returns The PendingToolCall or undefined if not found
 */
export function getPendingToolCall(id: string): PendingToolCall | undefined {
  return chatModeStore.pendingToolCalls.find((tc) => tc.id === id);
}

/**
 * Get all pending tool calls with 'pending' status
 */
export function getPendingToolCalls(): PendingToolCall[] {
  return chatModeStore.pendingToolCalls.filter((tc) => tc.status === 'pending');
}

// ============================================================================
// Approve/Reject Actions
// ============================================================================

/**
 * Approve a single pending tool call
 * Updates status to 'approved' and removes from queue
 * @param id - ID of the tool call to approve
 * @returns The approved tool call or undefined if not found
 */
export function approveToolCall(id: string): PendingToolCall | undefined {
  const index = chatModeStore.pendingToolCalls.findIndex((tc) => tc.id === id);
  if (index === -1) {
    return undefined;
  }

  const toolCall = chatModeStore.pendingToolCalls[index];
  const approvedCall: PendingToolCall = {
    ...toolCall,
    status: 'approved',
  };

  // Remove from pending list
  chatModeStore.pendingToolCalls = chatModeStore.pendingToolCalls.filter(
    (tc) => tc.id !== id
  );

  return approvedCall;
}

/**
 * Reject a single pending tool call
 * Updates status to 'rejected' and removes from queue
 * @param id - ID of the tool call to reject
 * @returns The rejected tool call or undefined if not found
 */
export function rejectToolCall(id: string): PendingToolCall | undefined {
  const index = chatModeStore.pendingToolCalls.findIndex((tc) => tc.id === id);
  if (index === -1) {
    return undefined;
  }

  const toolCall = chatModeStore.pendingToolCalls[index];
  const rejectedCall: PendingToolCall = {
    ...toolCall,
    status: 'rejected',
  };

  // Remove from pending list
  chatModeStore.pendingToolCalls = chatModeStore.pendingToolCalls.filter(
    (tc) => tc.id !== id
  );

  return rejectedCall;
}

/**
 * Approve all pending tool calls
 * @returns Array of approved tool calls
 */
export function approveAllToolCalls(): PendingToolCall[] {
  const pendingCalls = chatModeStore.pendingToolCalls.filter(
    (tc) => tc.status === 'pending'
  );

  const approvedCalls = pendingCalls.map((tc) => ({
    ...tc,
    status: 'approved' as ToolCallStatus,
  }));

  // Clear all pending calls
  chatModeStore.pendingToolCalls = chatModeStore.pendingToolCalls.filter(
    (tc) => tc.status !== 'pending'
  );

  return approvedCalls;
}

/**
 * Reject all pending tool calls
 * @returns Array of rejected tool calls
 */
export function rejectAllToolCalls(): PendingToolCall[] {
  const pendingCalls = chatModeStore.pendingToolCalls.filter(
    (tc) => tc.status === 'pending'
  );

  const rejectedCalls = pendingCalls.map((tc) => ({
    ...tc,
    status: 'rejected' as ToolCallStatus,
  }));

  // Clear all pending calls
  chatModeStore.pendingToolCalls = chatModeStore.pendingToolCalls.filter(
    (tc) => tc.status !== 'pending'
  );

  return rejectedCalls;
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
  chatModeStore.pendingToolCalls = [];
}
