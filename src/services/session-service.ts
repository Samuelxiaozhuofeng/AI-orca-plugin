import { getAiChatPluginName } from "../ui/ai-chat-ui";
import { getAiChatSettings } from "../settings/ai-chat-settings";
import type { ContextRef } from "../store/context-store";
import type { WebSearchSource } from "../utils/source-attribution";

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
  reasoning?: string; // AI 推理过程（DeepSeek/Claude thinking）
  model?: string; // 使用的模型（用于计费）
  contextRefs?: Array<{ title: string; kind: string; blockId?: number }>; // 消息关联的上下文引用（用于显示和跳转）
  // 压缩控制
  pinned?: boolean;    // 标记为重要，不会被压缩
  noCompress?: boolean; // 不压缩此消息
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
  // 自动增强相关
  searchResults?: WebSearchSource[]; // 搜索结果（用于自动增强）
  autoEnhanced?: boolean; // 是否已自动增强
  // Skill-related UI metadata (localOnly messages)
  skillConfirm?: {
    skillId: string;
    skillName: string;
    steps: string[];
    status: "pending" | "approved" | "denied";
  };
  skillDraft?: {
    status: "generating" | "saving" | "draft" | "saved" | "discarded" | "error";
    folderName?: string;
    error?: string;
  };
  // 分支功能
  branchId?: string;           // 分支 ID（主分支为 undefined）
  parentMessageId?: string;    // 父消息 ID（分支点）
  branches?: MessageBranch[];  // 此消息的其他分支
};

/**
 * 消息分支
 */
export type MessageBranch = {
  id: string;              // 分支 ID
  name?: string;           // 分支名称（可选）
  createdAt: number;       // 创建时间
  messages: Message[];     // 分支中的消息
};

/**
 * Pending flashcard for session persistence
 */
export type PendingFlashcard = {
  id: string;
  front: string;
  back: string;
  tags?: string[];
  cardType?: "basic" | "choice";
  options?: { text: string; isCorrect: boolean }[];
  ordered?: boolean;
};

/**
 * Flashcard review state for session persistence
 */
export type FlashcardState = {
  cards: PendingFlashcard[];
  currentIndex: number;
  keptCount: number;
  skippedCount: number;
};

/**
 * Session metadata (stored in index)
 */
export type SessionMeta = {
  id: string;
  title: string;
  model?: string;
  createdAt: number;
  updatedAt: number;
  pinned?: boolean;
  favorited?: boolean;
  messageCount: number; // 消息数量（用于显示）
};

/**
 * Session file content (stored in individual files)
 */
export type SessionFileData = {
  id: string;
  title: string;
  model?: string;
  messages: Message[];
  contexts: ContextRef[];
  createdAt: number;
  updatedAt: number;
  pinned?: boolean;
  favorited?: boolean;
  scrollPosition?: number;
  flashcardState?: FlashcardState;
};

/**
 * Saved session structure (in-memory, combines meta + data)
 */
export type SavedSession = {
  id: string;
  title: string;
  model?: string;
  messages: Message[];
  contexts: ContextRef[];
  createdAt: number;
  updatedAt: number;
  pinned?: boolean;
  favorited?: boolean;
  scrollPosition?: number;
  flashcardState?: FlashcardState;
  messageCount?: number; // 消息数量（用于列表显示）
};

/**
 * Index file structure
 */
export type SessionIndex = {
  version: 2;
  activeSessionId: string | null;
  sessions: SessionMeta[];
};

/**
 * Chat sessions data structure (for compatibility with existing code)
 */
export type ChatSessionsData = {
  version: 1 | 2;
  activeSessionId: string | null;
  sessions: SavedSession[];
};

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const SESSIONS_DIR = "Sessions";
const INDEX_FILE = `${SESSIONS_DIR}/index.json`;
const OLD_STORAGE_KEY = "chat-sessions"; // 旧版存储 key，用于迁移
const DATA_VERSION = 2;

// ─────────────────────────────────────────────────────────────────────────────
// File Operations
// ─────────────────────────────────────────────────────────────────────────────

function getPluginName(): string {
  const name = getAiChatPluginName();
  if (!name) {
    console.warn("[session-service] Plugin name not set, this may cause storage issues");
  }
  return name;
}

async function readFile(path: string): Promise<string | null> {
  const pluginName = getPluginName();
  try {
    const content = await orca.plugins.readFile(pluginName, path, "string");
    if (!content) return null;
    return typeof content === "string"
      ? content
      : new TextDecoder().decode(new Uint8Array(content as ArrayBuffer));
  } catch {
    return null;
  }
}

async function writeFile(path: string, content: string): Promise<void> {
  const pluginName = getPluginName();
  await orca.plugins.writeFile(pluginName, path, content);
}

async function deleteFile(path: string): Promise<void> {
  const pluginName = getPluginName();
  try {
    await orca.plugins.removeFile(pluginName, path);
  } catch {
    // Ignore deletion errors
  }
}

/** 
 * 获取会话文件路径（支持任意文件名）
 * 优先尝试标准命名，找不到则扫描目录
 */
async function getSessionFilePath(sessionId: string): Promise<string | null> {
  const pluginName = getPluginName();
  
  // 1. 尝试标准命名（快速路径）
  const standardPath = `${SESSIONS_DIR}/${sessionId}.json`;
  try {
    const exists = await orca.plugins.existsFile(pluginName, standardPath);
    if (exists) return standardPath;
  } catch {
    // 继续查找
  }
  
  // 2. 扫描目录，通过 JSON 内容匹配 ID
  try {
    const allFiles = await orca.plugins.listFiles(pluginName);
    const sessionFiles = allFiles.filter(f => {
      const normalized = f.replace(/\\/g, "/");
      return normalized.startsWith(SESSIONS_DIR + "/") && normalized.endsWith(".json") && !normalized.endsWith("index.json");
    });
    
    for (const file of sessionFiles) {
      try {
        const content = await readFile(file);
        if (content) {
          const data = JSON.parse(content);
          if (data.id === sessionId) {
            return file;
          }
        }
      } catch {
        // 跳过损坏的文件
        continue;
      }
    }
  } catch (err) {
    console.error(`[session-service] Failed to scan for session ${sessionId}:`, err);
  }
  
  return null;
}

// ─────────────────────────────────────────────────────────────────────────────
// In-Memory Cache
// ─────────────────────────────────────────────────────────────────────────────

let indexCache: SessionIndex | null = null;
const sessionCache = new Map<string, SessionFileData>();
const pendingWrites = new Map<string, { data: SessionFileData; timer: ReturnType<typeof setTimeout> }>();
const WRITE_DEBOUNCE_MS = 2000; // 2秒防抖

/** 清除缓存（用于测试或强制刷新） */
export function clearSessionCache(): void {
  indexCache = null;
  sessionCache.clear();
  // 立即执行所有待写入
  for (const [sessionId, pending] of pendingWrites) {
    clearTimeout(pending.timer);
    flushSessionWrite(sessionId, pending.data);
  }
  pendingWrites.clear();
}

/** 立即写入单个会话 */
async function flushSessionWrite(sessionId: string, data: SessionFileData): Promise<void> {
  try {
    const filePath = await getSessionFilePath(sessionId);
    if (!filePath) {
      // 文件不存在，使用标准命名
      await writeFile(`${SESSIONS_DIR}/${sessionId}.json`, JSON.stringify(data));
    } else {
      await writeFile(filePath, JSON.stringify(data));
    }
  } catch (err) {
    console.error(`[session-service] Failed to flush session ${sessionId}:`, err);
  }
}

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

// ─────────────────────────────────────────────────────────────────────────────
// Index Operations
// ─────────────────────────────────────────────────────────────────────────────

/** 加载索引（带缓存） */
async function loadIndex(): Promise<SessionIndex> {
  if (indexCache) return indexCache;

  const content = await readFile(INDEX_FILE);
  if (content) {
    try {
      const parsed = JSON.parse(content);
      if (parsed.version === 2) {
        indexCache = parsed as SessionIndex;
        // 自动发现新文件并同步到索引
        await syncIndexWithFiles(indexCache);
        return indexCache;
      }
    } catch {
      console.warn("[session-service] Failed to parse index, will recreate");
    }
  }

  // 尝试从旧版数据迁移
  const migrated = await migrateFromOldFormat();
  if (migrated) {
    indexCache = migrated;
    return indexCache;
  }

  // 创建空索引
  indexCache = { version: 2, activeSessionId: null, sessions: [] };
  await saveIndex();
  return indexCache;
}

/** 保存索引 */
async function saveIndex(): Promise<void> {
  if (!indexCache) return;
  await writeFile(INDEX_FILE, JSON.stringify(indexCache));
}

/**
 * 从文件名提取标题
 * 支持格式：2026-01-29_标题.json 或 标题.json
 */
function extractTitleFromFilename(filename: string): string | null {
  // 移除路径和 .json 后缀
  const basename = filename.replace(/\\/g, "/").split("/").pop()?.replace(/\.json$/, "");
  if (!basename) return null;
  
  // 尝试匹配标准格式：YYYY-MM-DD_标题_xxxx 或 时间戳-随机码
  // 如果是标准 ID 格式（纯数字-十六进制），返回 null
  if (/^\d+-[a-f0-9]+$/.test(basename)) {
    return null; // 标准 ID，不从文件名提取
  }
  
  // 匹配日期前缀：YYYY-MM-DD_标题
  const dateMatch = basename.match(/^\d{4}-\d{2}-\d{2}_(.+)$/);
  if (dateMatch) {
    // 移除末尾的随机码（如 _a3f2）
    return dateMatch[1].replace(/_[a-f0-9]{4}$/, "");
  }
  
  // 其他格式，直接使用文件名
  return basename;
}

/** 扫描 Sessions 目录，发现新文件并同步到索引 */
async function syncIndexWithFiles(index: SessionIndex): Promise<void> {
  const pluginName = getPluginName();
  try {
    const allFiles = await orca.plugins.listFiles(pluginName);
    const sessionFiles = allFiles.filter(f => {
      const normalized = f.replace(/\\/g, "/");
      return normalized.startsWith(SESSIONS_DIR + "/") && 
             normalized.endsWith(".json") && 
             !normalized.endsWith("index.json");
    });
    
    const existingIds = new Set(index.sessions.map(s => s.id));
    let hasChanges = false;
    
    for (const file of sessionFiles) {
      try {
        const content = await readFile(file);
        if (!content) continue;
        
        const data = JSON.parse(content) as SessionFileData;
        
        // 尝试从文件名提取标题（非标准命名时）
        const filenameTitle = extractTitleFromFilename(file);
        
        if (!existingIds.has(data.id)) {
          // 新会话：添加到索引
          const title = filenameTitle || data.title || generateSessionTitle(data.messages);
          
          console.log(`[session-service] Discovered new session: ${data.id} (${title})`);
          index.sessions.push({
            id: data.id,
            title,
            model: data.model,
            createdAt: data.createdAt,
            updatedAt: data.updatedAt,
            pinned: data.pinned,
            favorited: data.favorited,
            messageCount: data.messages.filter(m => !m.localOnly).length,
          });
          hasChanges = true;
        } else if (filenameTitle) {
          // 已存在会话，但文件名是自定义格式：更新元数据
          const existingMeta = index.sessions.find(s => s.id === data.id);
          if (existingMeta) {
            const needsUpdate = existingMeta.title !== filenameTitle;
            if (needsUpdate) {
              console.log(`[session-service] Updated title for ${data.id}: "${existingMeta.title}" -> "${filenameTitle}"`);
              existingMeta.title = filenameTitle;
            }
            // 同时更新其他元数据（防止过时）
            existingMeta.messageCount = data.messages.filter(m => !m.localOnly).length;
            existingMeta.model = data.model;
            existingMeta.updatedAt = data.updatedAt;
            if (needsUpdate) hasChanges = true;
          }
        } else {
          // 标准命名，但也需要更新元数据（messageCount 可能变了）
          const existingMeta = index.sessions.find(s => s.id === data.id);
          if (existingMeta) {
            const newMessageCount = data.messages.filter(m => !m.localOnly).length;
            if (existingMeta.messageCount !== newMessageCount) {
              existingMeta.messageCount = newMessageCount;
              existingMeta.updatedAt = data.updatedAt;
              hasChanges = true;
            }
          }
        }
      } catch (err) {
        console.warn(`[session-service] Failed to parse session file ${file}:`, err);
      }
    }
    
    if (hasChanges) {
      // 重新排序
      index.sessions.sort((a, b) => {
        if (a.pinned && !b.pinned) return -1;
        if (!a.pinned && b.pinned) return 1;
        return b.updatedAt - a.updatedAt;
      });
      
      // 保存更新后的索引
      await saveIndex();
      console.log(`[session-service] Index updated with ${index.sessions.length} sessions`);
    }
  } catch (err) {
    console.error("[session-service] Failed to sync index with files:", err);
  }
}

/** 从旧版格式迁移 */
async function migrateFromOldFormat(): Promise<SessionIndex | null> {
  const pluginName = getPluginName();
  try {
    const raw = await orca.plugins.getData(pluginName, OLD_STORAGE_KEY);
    if (!raw) return null;

    const oldData = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!oldData.sessions || !Array.isArray(oldData.sessions)) return null;

    console.log(`[session-service] Migrating ${oldData.sessions.length} sessions from old format...`);

    const newIndex: SessionIndex = {
      version: 2,
      activeSessionId: oldData.activeSessionId || null,
      sessions: [],
    };

    // 迁移每个会话到单独文件
    for (const oldSession of oldData.sessions) {
      const fileData: SessionFileData = {
        id: oldSession.id,
        title: oldSession.title || "",
        model: oldSession.model,
        messages: oldSession.messages || [],
        contexts: oldSession.contexts || [],
        createdAt: oldSession.createdAt,
        updatedAt: oldSession.updatedAt,
        pinned: oldSession.pinned,
        favorited: oldSession.favorited,
        scrollPosition: oldSession.scrollPosition,
        flashcardState: oldSession.flashcardState,
      };

      // 写入单独文件（使用标准命名）
      await writeFile(`${SESSIONS_DIR}/${oldSession.id}.json`, JSON.stringify(fileData));

      // 添加到索引
      newIndex.sessions.push({
        id: oldSession.id,
        title: oldSession.title || "",
        model: oldSession.model,
        createdAt: oldSession.createdAt,
        updatedAt: oldSession.updatedAt,
        pinned: oldSession.pinned,
        favorited: oldSession.favorited,
        messageCount: (oldSession.messages || []).filter((m: Message) => !m.localOnly).length,
      });
    }

    // 保存新索引
    await writeFile(INDEX_FILE, JSON.stringify(newIndex));

    // 删除旧数据
    await orca.plugins.setData(pluginName, OLD_STORAGE_KEY, null);
    console.log("[session-service] Migration completed successfully");

    return newIndex;
  } catch (err) {
    console.error("[session-service] Migration failed:", err);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Session File Operations
// ─────────────────────────────────────────────────────────────────────────────

/** 加载单个会话文件（带缓存） */
async function loadSessionFile(sessionId: string): Promise<SessionFileData | null> {
  // 检查内存缓存
  const cached = sessionCache.get(sessionId);
  if (cached) return cached;

  // 检查待写入队列（最新数据）
  const pending = pendingWrites.get(sessionId);
  if (pending) return pending.data;

  // 从文件读取
  const filePath = await getSessionFilePath(sessionId);
  if (!filePath) return null;
  
  const content = await readFile(filePath);
  if (!content) return null;

  try {
    const data = JSON.parse(content) as SessionFileData;
    sessionCache.set(sessionId, data);
    return data;
  } catch {
    console.error(`[session-service] Failed to parse session file: ${sessionId}`);
    return null;
  }
}

/** 保存会话文件（防抖写入） */
function saveSessionFile(data: SessionFileData, immediate = false): void {
  const sessionId = data.id;

  // 更新缓存
  sessionCache.set(sessionId, data);

  // 取消之前的定时器
  const existing = pendingWrites.get(sessionId);
  if (existing) {
    clearTimeout(existing.timer);
  }

  if (immediate) {
    // 立即写入
    pendingWrites.delete(sessionId);
    flushSessionWrite(sessionId, data);
  } else {
    // 防抖写入
    const timer = setTimeout(() => {
      pendingWrites.delete(sessionId);
      flushSessionWrite(sessionId, data);
    }, WRITE_DEBOUNCE_MS);
    pendingWrites.set(sessionId, { data, timer });
  }
}

/** 更新索引中的元数据 */
function updateIndexMeta(session: SessionFileData, index: SessionIndex): void {
  const meta: SessionMeta = {
    id: session.id,
    title: session.title,
    model: session.model,
    createdAt: session.createdAt,
    updatedAt: session.updatedAt,
    pinned: session.pinned,
    favorited: session.favorited,
    messageCount: session.messages.filter(m => !m.localOnly).length,
  };

  const idx = index.sessions.findIndex(s => s.id === session.id);
  if (idx >= 0) {
    index.sessions[idx] = meta;
  } else {
    index.sessions.push(meta);
  }

  // 排序：置顶优先，然后按更新时间降序
  index.sessions.sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return b.updatedAt - a.updatedAt;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Load all sessions (returns metadata only, messages loaded on demand)
 * For compatibility, returns full SavedSession[] but messages are empty
 */
export async function loadSessions(): Promise<ChatSessionsData> {
  const index = await loadIndex();
  
  // 立即同步一次（确保 messageCount 最新）
  await syncIndexWithFiles(index);

  // 转换为兼容格式（messages 为空数组，需要时再加载）
  const sessions: SavedSession[] = index.sessions.map(meta => ({
    id: meta.id,
    title: meta.title,
    model: meta.model,
    messages: [], // 延迟加载
    contexts: [],
    createdAt: meta.createdAt,
    updatedAt: meta.updatedAt,
    pinned: meta.pinned,
    favorited: meta.favorited,
    messageCount: meta.messageCount, // 传递消息数量
  }));

  return {
    version: 2,
    activeSessionId: index.activeSessionId,
    sessions,
  };
}

/**
 * Load full session data (including messages)
 */
export async function loadFullSession(sessionId: string): Promise<SavedSession | null> {
  const fileData = await loadSessionFile(sessionId);
  if (!fileData) return null;

  return {
    id: fileData.id,
    title: fileData.title,
    model: fileData.model,
    messages: fileData.messages,
    contexts: fileData.contexts,
    createdAt: fileData.createdAt,
    updatedAt: fileData.updatedAt,
    pinned: fileData.pinned,
    favorited: fileData.favorited,
    scrollPosition: fileData.scrollPosition,
    flashcardState: fileData.flashcardState,
  };
}

/**
 * Save or update a session
 */
export async function saveSession(session: SavedSession): Promise<void> {
  const filteredMessages = session.messages.filter(m => !m.localOnly);

  if (filteredMessages.length === 0) {
    console.log("[session-service] Session has no messages, skipping save");
    return;
  }

  const index = await loadIndex();
  const now = Date.now();

  const fileData: SessionFileData = {
    id: session.id,
    title: session.title || generateSessionTitle(filteredMessages),
    model: session.model,
    messages: filteredMessages,
    contexts: session.contexts,
    createdAt: session.createdAt,
    updatedAt: now,
    pinned: session.pinned,
    favorited: session.favorited,
    scrollPosition: session.scrollPosition,
    flashcardState: session.flashcardState,
  };

  // 保存文件（立即写入）
  saveSessionFile(fileData, true);

  // 更新索引
  updateIndexMeta(fileData, index);
  index.activeSessionId = session.id;
  await saveIndex();

  console.log("[session-service] Session saved:", fileData.id, fileData.title);
}

/**
 * Delete a session by ID
 */
export async function deleteSession(sessionId: string): Promise<void> {
  const index = await loadIndex();

  // 从索引中移除
  index.sessions = index.sessions.filter(s => s.id !== sessionId);

  // 更新活动会话
  if (index.activeSessionId === sessionId) {
    index.activeSessionId = index.sessions.length > 0 ? index.sessions[0].id : null;
  }

  // 删除文件
  const filePath = await getSessionFilePath(sessionId);
  if (filePath) {
    await deleteFile(filePath);
  }

  // 清除缓存
  sessionCache.delete(sessionId);
  const pending = pendingWrites.get(sessionId);
  if (pending) {
    clearTimeout(pending.timer);
    pendingWrites.delete(sessionId);
  }

  await saveIndex();
  console.log("[session-service] Session deleted:", sessionId);
}

/**
 * Clear all sessions (跳过已收藏的)
 */
export async function clearAllSessions(): Promise<void> {
  const index = await loadIndex();

  // 分离收藏和非收藏
  const favorited = index.sessions.filter((s) => s.favorited);
  const nonFavorited = index.sessions.filter((s) => !s.favorited);

  // 删除非收藏的会话文件
  for (const meta of nonFavorited) {
    const filePath = await getSessionFilePath(meta.id);
    if (filePath) {
      await deleteFile(filePath);
    }
    // 清除缓存
    sessionCache.delete(meta.id);
    const pending = pendingWrites.get(meta.id);
    if (pending) {
      clearTimeout(pending.timer);
      pendingWrites.delete(meta.id);
    }
  }

  // 索引只保留收藏的
  index.sessions = favorited;
  if (index.activeSessionId && !favorited.find((s) => s.id === index.activeSessionId)) {
    index.activeSessionId = favorited.length > 0 ? favorited[0].id : null;
  }
  indexCache = index;
  await saveIndex();

  console.log(`[session-service] Cleared ${nonFavorited.length} sessions, kept ${favorited.length} favorited`);
}

/**
 * Get a session by ID (full data)
 */
export async function getSession(sessionId: string): Promise<SavedSession | null> {
  return loadFullSession(sessionId);
}

/**
 * Set the active session ID
 */
export async function setActiveSessionId(sessionId: string | null): Promise<void> {
  const index = await loadIndex();
  index.activeSessionId = sessionId;
  await saveIndex();
}

/**
 * Check if auto-save is enabled based on settings
 */
/**
 * Check if auto-save is enabled (always true now)
 */
export function shouldAutoSave(): boolean {
  return true;
}

/**
 * Format a timestamp for display
 */
export function formatSessionTime(timestamp: number): string {
  const date = new Date(timestamp);
  const now = new Date();

  // 获取今天和昨天的日期边界
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const yesterdayStart = todayStart - 24 * 60 * 60 * 1000;
  const weekStart = todayStart - 6 * 24 * 60 * 60 * 1000;

  // Today
  if (timestamp >= todayStart) {
    const hours = date.getHours().toString().padStart(2, "0");
    const minutes = date.getMinutes().toString().padStart(2, "0");
    return `今天 ${hours}:${minutes}`;
  }

  // Yesterday
  if (timestamp >= yesterdayStart) {
    return "昨天";
  }

  // This week
  if (timestamp >= weekStart) {
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
  const index = await loadIndex();
  const meta = index.sessions.find(s => s.id === sessionId);
  if (!meta) return false;

  meta.pinned = !meta.pinned;

  // 同时更新文件中的 pinned 状态
  const fileData = await loadSessionFile(sessionId);
  if (fileData) {
    fileData.pinned = meta.pinned;
    saveSessionFile(fileData, true);
  }

  // 重新排序
  index.sessions.sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return b.updatedAt - a.updatedAt;
  });

  await saveIndex();
  console.log("[session-service] Session pinned toggled:", sessionId, meta.pinned);
  return meta.pinned;
}

/**
 * Toggle session favorited status
 */
export async function toggleSessionFavorited(sessionId: string): Promise<boolean> {
  const index = await loadIndex();
  const meta = index.sessions.find(s => s.id === sessionId);
  if (!meta) return false;

  meta.favorited = !meta.favorited;

  // 同时更新文件中的 favorited 状态
  const fileData = await loadSessionFile(sessionId);
  if (fileData) {
    fileData.favorited = meta.favorited;
    saveSessionFile(fileData, true);
  }

  await saveIndex();
  console.log("[session-service] Session favorited toggled:", sessionId, meta.favorited);
  return meta.favorited;
}

/**
 * Rename a session
 */
export async function renameSession(sessionId: string, newTitle: string): Promise<void> {
  const index = await loadIndex();
  const meta = index.sessions.find(s => s.id === sessionId);
  if (!meta) return;

  // 加载完整数据以获取 messages（用于生成默认标题）
  const fileData = await loadSessionFile(sessionId);
  const title = newTitle.trim() || (fileData ? generateSessionTitle(fileData.messages) : meta.title);

  meta.title = title;

  // 同时更新文件
  if (fileData) {
    fileData.title = title;
    saveSessionFile(fileData, true);
  }

  await saveIndex();
  console.log("[session-service] Session renamed:", sessionId, title);
}

/**
 * Auto-cache current session (called on message changes)
 * Uses debounced writes for better performance
 */
export async function autoCacheSession(session: SavedSession): Promise<void> {
  const filteredMessages = session.messages.filter(m => !m.localOnly);
  const index = await loadIndex();

  // 查找现有元数据
  const existingMeta = index.sessions.find(s => s.id === session.id);
  const existingFileData = await loadSessionFile(session.id);

  // 决定标题
  let title = session.title;
  if (existingMeta?.title) {
    title = existingMeta.title;
  } else if (!title && filteredMessages.length > 0) {
    title = generateSessionTitle(filteredMessages);
  }

  // 决定是否更新时间（只有新增消息时才更新）
  const existingMsgCount = existingFileData?.messages.filter(m => !m.localOnly).length ?? 0;
  const hasNewMessages = filteredMessages.length > existingMsgCount;
  const updatedAt = hasNewMessages ? Date.now() : (existingMeta?.updatedAt || Date.now());

  // 构建文件数据
  const fileData: SessionFileData = {
    id: session.id,
    title: title || "",
    model: session.model,
    messages: filteredMessages,
    contexts: session.contexts,
    createdAt: session.createdAt,
    updatedAt,
    pinned: existingMeta?.pinned || session.pinned,
    favorited: existingMeta?.favorited || session.favorited,
    scrollPosition: session.scrollPosition,
    flashcardState: session.flashcardState,
  };

  // 保存文件（防抖写入）
  saveSessionFile(fileData, false);

  // 更新索引
  updateIndexMeta(fileData, index);
  index.activeSessionId = session.id;
  await saveIndex();
}
