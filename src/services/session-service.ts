import { getAiChatPluginName } from "../ui/ai-chat-ui";
import { getAiChatSettings } from "../settings/ai-chat-settings";
import type { ContextRef } from "../store/context-store";

/**
 * Image reference for messages (stores path, not base64)
 * @deprecated Use FileRef instead
 */
export type ImageRef = {
  path: string; // 本地文件路径
  name: string; // 文件名
  mimeType: string; // image/png, image/jpeg 等
};

/**
 * 视频处理模式
 */
export type VideoProcessMode = "full" | "audio-only" | "frames-only";

/**
 * File reference for messages (stores path, not content)
 * Supports images, videos, audio, documents, code files, and data files
 */
export type FileRef = {
  path: string; // 本地文件路径
  name: string; // 文件名
  mimeType: string; // MIME 类型
  size?: number; // 文件大小 (bytes)
  category?: "image" | "video" | "audio" | "document" | "code" | "data" | "other"; // 文件分类
  videoMode?: VideoProcessMode; // 视频处理模式：full=完整处理, audio-only=仅音频, frames-only=仅抽帧
  thumbnail?: string; // 视频缩略图 base64（仅视频）
};

/**
 * Message type (same as AiChatPanel)
 */
export type Message = {
  id: string;
  role: "user" | "assistant" | "tool";
  content: string;
  createdAt: number;
  localOnly?: boolean;
  images?: ImageRef[]; // 图片引用（存路径）- 兼容旧版
  files?: FileRef[]; // 文件引用（存路径）- 新版，支持多种文件类型
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: {
      name: string;
      arguments: string;
    };
  }>;
  tool_call_id?: string;
  name?: string;
};

/**
 * Saved session structure
 */
export type SavedSession = {
  id: string;
  title: string;
  model?: string;
  messages: Message[];
  contexts: ContextRef[];
  createdAt: number;
  updatedAt: number;
  pinned?: boolean; // 置顶标记
};

/**
 * Chat sessions data structure
 */
export type ChatSessionsData = {
  version: 1;
  activeSessionId: string | null;
  sessions: SavedSession[];
};

const STORAGE_KEY = "chat-sessions";
const DATA_VERSION = 1;

/**
 * Generate a unique ID
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * Generate session title from messages
 * Uses the first user message, truncated to 20 characters
 */
export function generateSessionTitle(messages: Message[]): string {
  const firstUserMsg = messages.find((m) => m.role === "user" && !m.localOnly);
  if (!firstUserMsg || !firstUserMsg.content) {
    return `会话 ${new Date().toLocaleString("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}`;
  }
  const content = firstUserMsg.content.trim();
  if (content.length <= 20) {
    return content;
  }
  return content.slice(0, 20) + "...";
}

/**
 * Create a new empty session
 */
export function createNewSession(): SavedSession {
  const now = Date.now();
  return {
    id: generateId(),
    title: "",
    model: "",
    messages: [],
    contexts: [],
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Load all sessions from storage
 */
export async function loadSessions(): Promise<ChatSessionsData> {
  const pluginName = getAiChatPluginName();
  try {
    const raw = await orca.plugins.getData(pluginName, STORAGE_KEY);
    if (!raw) {
      return { version: DATA_VERSION, activeSessionId: null, sessions: [] };
    }
    const data = typeof raw === "string" ? JSON.parse(raw) : raw;
    // Validate version
    if (data.version !== DATA_VERSION) {
      console.warn("[session-service] Data version mismatch, returning empty");
      return { version: DATA_VERSION, activeSessionId: null, sessions: [] };
    }
    return data as ChatSessionsData;
  } catch (err) {
    console.error("[session-service] Failed to load sessions:", err);
    return { version: DATA_VERSION, activeSessionId: null, sessions: [] };
  }
}

/**
 * Save sessions data to storage
 */
async function saveSessions(data: ChatSessionsData): Promise<void> {
  const pluginName = getAiChatPluginName();
  try {
    await orca.plugins.setData(pluginName, STORAGE_KEY, JSON.stringify(data));
  } catch (err) {
    console.error("[session-service] Failed to save sessions:", err);
    throw err;
  }
}

/**
 * Save or update a session
 */
export async function saveSession(session: SavedSession): Promise<void> {
  const data = await loadSessions();
  const pluginName = getAiChatPluginName();
  const settings = getAiChatSettings(pluginName);
  const maxSessions = settings.maxSavedSessions || 10;

  // Filter out localOnly messages before saving
  const filteredMessages = session.messages.filter((m) => !m.localOnly);

  // Don't save empty sessions
  if (filteredMessages.length === 0) {
    console.log("[session-service] Session has no messages, skipping save");
    return;
  }

  // Update session with filtered messages and generate title if empty
  const sessionToSave: SavedSession = {
    ...session,
    messages: filteredMessages,
    title: session.title || generateSessionTitle(filteredMessages),
    updatedAt: Date.now(),
  };

  // Find existing session or add new
  const existingIndex = data.sessions.findIndex((s) => s.id === session.id);
  if (existingIndex >= 0) {
    data.sessions[existingIndex] = sessionToSave;
  } else {
    data.sessions.push(sessionToSave);
  }

  // Sort: pinned first, then by updatedAt descending
  data.sessions.sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return b.updatedAt - a.updatedAt;
  });

  // Trim to max sessions
  if (data.sessions.length > maxSessions) {
    data.sessions = data.sessions.slice(0, maxSessions);
  }

  // Update active session ID
  data.activeSessionId = session.id;

  await saveSessions(data);
  console.log("[session-service] Session saved:", sessionToSave.id, sessionToSave.title);
}

/**
 * Delete a session by ID
 */
export async function deleteSession(sessionId: string): Promise<void> {
  const data = await loadSessions();
  data.sessions = data.sessions.filter((s) => s.id !== sessionId);

  // Clear active session if it was deleted
  if (data.activeSessionId === sessionId) {
    data.activeSessionId = data.sessions.length > 0 ? data.sessions[0].id : null;
  }

  await saveSessions(data);
  console.log("[session-service] Session deleted:", sessionId);
}

/**
 * Clear all sessions
 */
export async function clearAllSessions(): Promise<void> {
  const data: ChatSessionsData = {
    version: DATA_VERSION,
    activeSessionId: null,
    sessions: [],
  };
  await saveSessions(data);
  console.log("[session-service] All sessions cleared");
}

/**
 * Get a session by ID
 */
export async function getSession(sessionId: string): Promise<SavedSession | null> {
  const data = await loadSessions();
  return data.sessions.find((s) => s.id === sessionId) || null;
}

/**
 * Set the active session ID
 */
export async function setActiveSessionId(sessionId: string | null): Promise<void> {
  const data = await loadSessions();
  data.activeSessionId = sessionId;
  await saveSessions(data);
}

/**
 * Check if auto-save is enabled based on settings
 */
export function shouldAutoSave(): boolean {
  const pluginName = getAiChatPluginName();
  const settings = getAiChatSettings(pluginName);
  return settings.autoSaveChat === "on_close";
}

/**
 * Format a timestamp for display
 */
export function formatSessionTime(timestamp: number): string {
  const now = Date.now();
  const diff = now - timestamp;
  const date = new Date(timestamp);

  // Today
  if (diff < 24 * 60 * 60 * 1000) {
    const hours = date.getHours().toString().padStart(2, "0");
    const minutes = date.getMinutes().toString().padStart(2, "0");
    return `今天 ${hours}:${minutes}`;
  }

  // Yesterday
  if (diff < 48 * 60 * 60 * 1000) {
    return "昨天";
  }

  // This week
  if (diff < 7 * 24 * 60 * 60 * 1000) {
    const days = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
    return days[date.getDay()];
  }

  // Older
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}

/**
 * Toggle session pinned status
 */
export async function toggleSessionPinned(sessionId: string): Promise<boolean> {
  const data = await loadSessions();
  const session = data.sessions.find((s) => s.id === sessionId);
  if (!session) return false;

  session.pinned = !session.pinned;

  // Re-sort: pinned first, then by updatedAt
  data.sessions.sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return b.updatedAt - a.updatedAt;
  });

  await saveSessions(data);
  console.log("[session-service] Session pinned toggled:", sessionId, session.pinned);
  return session.pinned;
}

/**
 * Rename a session
 */
export async function renameSession(sessionId: string, newTitle: string): Promise<void> {
  const data = await loadSessions();
  const session = data.sessions.find((s) => s.id === sessionId);
  if (!session) return;

  session.title = newTitle.trim() || generateSessionTitle(session.messages);
  await saveSessions(data);
  console.log("[session-service] Session renamed:", sessionId, session.title);
}

/**
 * Auto-cache current session (called on message changes)
 * This saves without requiring manual action
 * Only generates title on first message, preserves existing title afterwards
 * Only updates position (updatedAt) when new messages are added
 */
export async function autoCacheSession(session: SavedSession): Promise<void> {
  const data = await loadSessions();
  const pluginName = getAiChatPluginName();
  const settings = getAiChatSettings(pluginName);
  const maxSessions = settings.maxSavedSessions || 10;

  // Filter out localOnly messages
  const filteredMessages = session.messages.filter((m) => !m.localOnly);

  // Find existing session
  const existingIndex = data.sessions.findIndex((s) => s.id === session.id);
  const existingSession = existingIndex >= 0 ? data.sessions[existingIndex] : null;

  // Only generate title on first save (when no existing title)
  // After that, keep the existing title unchanged
  let title = session.title;
  if (existingSession?.title) {
    // Keep existing title
    title = existingSession.title;
  } else if (!title && filteredMessages.length > 0) {
    // First time with messages, generate title
    title = generateSessionTitle(filteredMessages);
  }

  // Only update updatedAt when message count changes (new message added)
  // This prevents reordering when just switching sessions
  const hasNewMessages = !existingSession || filteredMessages.length > existingSession.messages.length;
  const updatedAt = hasNewMessages ? Date.now() : (existingSession?.updatedAt || Date.now());

  const sessionToSave: SavedSession = {
    ...session,
    messages: filteredMessages,
    title: title || "",
    updatedAt,
  };

  if (existingIndex >= 0) {
    // Preserve pinned status
    sessionToSave.pinned = data.sessions[existingIndex].pinned;
    data.sessions[existingIndex] = sessionToSave;
  } else {
    data.sessions.push(sessionToSave);
  }

  // Sort: pinned first, then by updatedAt
  data.sessions.sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return b.updatedAt - a.updatedAt;
  });

  // Trim to max (but don't remove pinned sessions)
  const pinnedSessions = data.sessions.filter((s) => s.pinned);
  const unpinnedSessions = data.sessions.filter((s) => !s.pinned);
  if (unpinnedSessions.length > maxSessions - pinnedSessions.length) {
    data.sessions = [
      ...pinnedSessions,
      ...unpinnedSessions.slice(0, Math.max(1, maxSessions - pinnedSessions.length)),
    ];
  }

  data.activeSessionId = session.id;
  await saveSessions(data);
}
