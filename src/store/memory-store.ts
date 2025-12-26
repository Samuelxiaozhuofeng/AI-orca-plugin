/**
 * Memory Store - Global memory management for AI chat
 * Supports multi-user profiles and memory injection modes
 */

import { getAiChatPluginName } from "../ui/ai-chat-ui";

const { proxy } = (window as any).Valtio as {
  proxy: <T extends object>(obj: T) => T;
};

// ============================================================================
// Types
// ============================================================================

/**
 * Injection mode determines which memories are included in AI conversations
 * - ALL: Include enabled memories from all users, prefixed with user name
 * - CURRENT: Include only enabled memories from the active user
 */
export type InjectionMode = 'ALL' | 'CURRENT';

/**
 * User profile representing a person who owns memories
 */
export interface UserProfile {
  id: string;
  name: string;
  emoji: string;
  isDefault?: boolean;
  isSelf?: boolean;  // Whether this user represents "myself"
  createdAt: number;
}

/**
 * Single memory item containing user information or preference
 */
export interface MemoryItem {
  id: string;
  userId: string;
  content: string;
  isEnabled: boolean;
  isExtracted: boolean;  // Whether this memory has been extracted to portrait
  createdAt: number;
  updatedAt: number;
}

/**
 * Portrait tag - emoji + label representing a user characteristic
 */
export interface PortraitTag {
  id: string;
  emoji: string;
  label: string;
}

/**
 * Portrait info item - single piece of information within a category
 * Supports multiple values per key
 */
export interface PortraitInfoItem {
  id: string;
  label: string; // e.g., "姓名", "身高"
  value: string; // Primary value, e.g., "张三", "183cm"
  values?: string[]; // Additional values for multi-value support
}

/**
 * Portrait category - categorized user information
 */
export interface PortraitCategory {
  id: string;
  title: string;
  items: PortraitInfoItem[]; // Changed from content string to items array
}

/**
 * User portrait - AI-generated summary of user characteristics
 */
export interface UserPortrait {
  userId: string;
  tags: PortraitTag[];
  categories: PortraitCategory[];
  updatedAt: number;
}

/**
 * Complete memory store state
 */
export interface MemoryStoreData {
  version: number;
  users: UserProfile[];
  memories: MemoryItem[];
  portraits: UserPortrait[];
  activeUserId: string;
  injectionMode: InjectionMode;
}

/**
 * Memory store actions interface
 */
export interface MemoryStoreActions {
  // User Management
  createUser(name: string): UserProfile | null;
  updateUser(id: string, name: string): boolean;
  updateUserEmoji(id: string, emoji: string): boolean;
  deleteUser(id: string): boolean;
  setActiveUser(id: string): void;
  getActiveUser(): UserProfile | undefined;

  // Memory Management
  addMemory(content: string, userId?: string): MemoryItem | null;
  updateMemory(id: string, content: string): boolean;
  deleteMemory(id: string): boolean;
  toggleMemory(id: string): boolean;
  getMemoriesForUser(userId: string): MemoryItem[];

  // Portrait Management
  updatePortrait(userId: string, portrait: Partial<UserPortrait>): boolean;
  addPortraitTag(userId: string, tag: Omit<PortraitTag, 'id'>): PortraitTag | null;
  updatePortraitTag(userId: string, tagId: string, tag: Partial<Omit<PortraitTag, 'id'>>): boolean;
  deletePortraitTag(userId: string, tagId: string): boolean;
  updatePortraitCategory(userId: string, categoryId: string, content: string): boolean;
  getPortraitForUser(userId: string): UserPortrait | undefined;

  // Injection Mode
  setInjectionMode(mode: InjectionMode): void;
  getEnabledMemories(): MemoryItem[];
  getMemoryText(): string;

  // Persistence
  save(): Promise<void>;
  load(): Promise<void>;
}

// ============================================================================
// Constants
// ============================================================================

const STORAGE_KEY = 'ai-chat-memory-store';

const DEFAULT_USER: UserProfile = {
  id: 'default-user',
  name: '用户',
  emoji: 'D',
  isDefault: true,
  createdAt: Date.now(),
};

export const DEFAULT_STATE: MemoryStoreData = {
  version: 2,
  users: [DEFAULT_USER],
  memories: [],
  portraits: [],
  activeUserId: 'default-user',
  injectionMode: 'ALL',
};

// ============================================================================
// Utilities
// ============================================================================

/**
 * Generate a unique ID using timestamp and random string
 */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Get default emoji for a user name
 * Returns the first character of the name (uppercase for letters)
 * @param name - User name
 * @returns Default emoji character
 */
export function getDefaultEmoji(name: string): string {
  if (!name || name.trim().length === 0) return 'U';
  const firstChar = name.trim().charAt(0);
  // If Chinese character, return as-is
  if (/[\u4e00-\u9fa5]/.test(firstChar)) {
    return firstChar;
  }
  // For letters, return uppercase
  return firstChar.toUpperCase();
}

/**
 * Validate content is not empty or whitespace-only
 */
function validateContent(content: string): boolean {
  return content.trim().length > 0;
}

// ============================================================================
// Store Implementation
// ============================================================================

/**
 * Create the memory store state
 */
function createMemoryStoreState(): MemoryStoreData {
  return { ...DEFAULT_STATE, users: [{ ...DEFAULT_USER }], portraits: [] };
}

export const memoryStoreState = proxy<MemoryStoreData>(createMemoryStoreState());

// ============================================================================
// User Management Functions
// ============================================================================

/**
 * Create a new user profile
 * @param name - User name (must be non-empty)
 * @returns Created user profile or null if validation fails
 */
export function createUser(name: string): UserProfile | null {
  if (!validateContent(name)) {
    return null;
  }

  const trimmedName = name.trim();
  const user: UserProfile = {
    id: generateId(),
    name: trimmedName,
    emoji: getDefaultEmoji(trimmedName),
    createdAt: Date.now(),
  };

  memoryStoreState.users = [...memoryStoreState.users, user];
  saveMemoryStore();
  return user;
}

/**
 * Update an existing user's name
 * @param id - User ID to update
 * @param name - New name (must be non-empty)
 * @returns true if update succeeded, false otherwise
 */
export function updateUser(id: string, name: string): boolean {
  if (!validateContent(name)) {
    return false;
  }

  const userIndex = memoryStoreState.users.findIndex(u => u.id === id);
  if (userIndex === -1) {
    return false;
  }

  const updatedUsers = [...memoryStoreState.users];
  updatedUsers[userIndex] = {
    ...updatedUsers[userIndex],
    name: name.trim(),
  };
  memoryStoreState.users = updatedUsers;
  saveMemoryStore();
  return true;
}

/**
 * Update an existing user's emoji
 * @param id - User ID to update
 * @param emoji - New emoji (must be non-empty)
 * @returns true if update succeeded, false otherwise
 */
export function updateUserEmoji(id: string, emoji: string): boolean {
  if (!emoji || emoji.trim().length === 0) {
    return false;
  }

  const userIndex = memoryStoreState.users.findIndex(u => u.id === id);
  if (userIndex === -1) {
    return false;
  }

  const updatedUsers = [...memoryStoreState.users];
  updatedUsers[userIndex] = {
    ...updatedUsers[userIndex],
    emoji: emoji.trim(),
  };
  memoryStoreState.users = updatedUsers;
  saveMemoryStore();
  return true;
}

/**
 * Set a user as "myself" (only one user can be marked as self)
 * @param id - User ID to set as self, or null to clear
 * @returns true if update succeeded
 */
export function setUserAsSelf(id: string | null): boolean {
  const updatedUsers = memoryStoreState.users.map(u => ({
    ...u,
    isSelf: u.id === id,
  }));
  memoryStoreState.users = updatedUsers;
  saveMemoryStore();
  return true;
}

/**
 * Delete a user and all associated memories
 * @param id - User ID to delete
 * @returns true if deletion succeeded, false if user is default or not found
 */
export function deleteUser(id: string): boolean {
  const user = memoryStoreState.users.find(u => u.id === id);
  
  // Cannot delete default user or non-existent user
  if (!user || user.isDefault) {
    return false;
  }

  // Remove user
  memoryStoreState.users = memoryStoreState.users.filter(u => u.id !== id);
  
  // Cascade delete all memories for this user
  memoryStoreState.memories = memoryStoreState.memories.filter(m => m.userId !== id);
  
  // Cascade delete portrait for this user
  memoryStoreState.portraits = memoryStoreState.portraits.filter(p => p.userId !== id);
  
  // If deleted user was active, switch to default user
  if (memoryStoreState.activeUserId === id) {
    memoryStoreState.activeUserId = 'default-user';
  }

  saveMemoryStore();
  return true;
}

/**
 * Set the active user
 * @param id - User ID to set as active
 */
export function setActiveUser(id: string): void {
  const user = memoryStoreState.users.find(u => u.id === id);
  if (user) {
    memoryStoreState.activeUserId = id;
    saveMemoryStore();
  }
}

/**
 * Get the currently active user profile
 * @returns Active user profile or undefined if not found
 */
export function getActiveUser(): UserProfile | undefined {
  return memoryStoreState.users.find(u => u.id === memoryStoreState.activeUserId);
}

// ============================================================================
// Memory Management Functions
// ============================================================================

/**
 * Add a new memory item for a user
 * @param content - Memory content (must be non-empty)
 * @param userId - Optional target user ID. If provided, use it instead of activeUserId. If not provided, use activeUserId.
 * @returns Created memory item or null if validation fails or user not found
 * Requirements: 13.5
 */
export function addMemory(content: string, userId?: string): MemoryItem | null {
  if (!validateContent(content)) {
    return null;
  }

  // Determine target user ID
  const targetUserId = userId ?? memoryStoreState.activeUserId;

  // Validate user exists
  const user = memoryStoreState.users.find(u => u.id === targetUserId);
  if (!user) {
    return null;
  }

  const now = Date.now();
  const memory: MemoryItem = {
    id: generateId(),
    userId: targetUserId,
    content: content.trim(),
    isEnabled: true,
    isExtracted: false,
    createdAt: now,
    updatedAt: now,
  };

  memoryStoreState.memories = [...memoryStoreState.memories, memory];
  saveMemoryStore();
  return memory;
}

/**
 * Update an existing memory's content
 * @param id - Memory ID to update
 * @param content - New content (must be non-empty)
 * @returns true if update succeeded, false otherwise
 */
export function updateMemory(id: string, content: string): boolean {
  if (!validateContent(content)) {
    return false;
  }

  const memoryIndex = memoryStoreState.memories.findIndex(m => m.id === id);
  if (memoryIndex === -1) {
    return false;
  }

  const updatedMemories = [...memoryStoreState.memories];
  updatedMemories[memoryIndex] = {
    ...updatedMemories[memoryIndex],
    content: content.trim(),
    updatedAt: Date.now(),
  };
  memoryStoreState.memories = updatedMemories;
  saveMemoryStore();
  return true;
}

/**
 * Delete a memory item
 * @param id - Memory ID to delete
 * @returns true if deletion succeeded, false if not found
 */
export function deleteMemory(id: string): boolean {
  const memoryIndex = memoryStoreState.memories.findIndex(m => m.id === id);
  if (memoryIndex === -1) {
    return false;
  }

  memoryStoreState.memories = memoryStoreState.memories.filter(m => m.id !== id);
  saveMemoryStore();
  return true;
}

/**
 * Toggle a memory's enabled state
 * @param id - Memory ID to toggle
 * @returns true if toggle succeeded, false if not found
 */
export function toggleMemory(id: string): boolean {
  const memoryIndex = memoryStoreState.memories.findIndex(m => m.id === id);
  if (memoryIndex === -1) {
    return false;
  }

  const updatedMemories = [...memoryStoreState.memories];
  updatedMemories[memoryIndex] = {
    ...updatedMemories[memoryIndex],
    isEnabled: !updatedMemories[memoryIndex].isEnabled,
    updatedAt: Date.now(),
  };
  memoryStoreState.memories = updatedMemories;
  saveMemoryStore();
  return true;
}

/**
 * Toggle a memory's extracted status
 * @param id - Memory ID to toggle
 * @returns true if toggle succeeded, false if not found
 */
export function toggleMemoryExtracted(id: string): boolean {
  const memoryIndex = memoryStoreState.memories.findIndex(m => m.id === id);
  if (memoryIndex === -1) {
    return false;
  }

  const updatedMemories = [...memoryStoreState.memories];
  updatedMemories[memoryIndex] = {
    ...updatedMemories[memoryIndex],
    isExtracted: !updatedMemories[memoryIndex].isExtracted,
    updatedAt: Date.now(),
  };
  memoryStoreState.memories = updatedMemories;
  saveMemoryStore();
  return true;
}

/**
 * Mark a memory as extracted (used when generating portrait from memory)
 * @param id - Memory ID to mark
 * @returns true if succeeded, false if not found
 */
export function markMemoryAsExtracted(id: string): boolean {
  const memoryIndex = memoryStoreState.memories.findIndex(m => m.id === id);
  if (memoryIndex === -1) {
    return false;
  }

  const updatedMemories = [...memoryStoreState.memories];
  updatedMemories[memoryIndex] = {
    ...updatedMemories[memoryIndex],
    isExtracted: true,
    updatedAt: Date.now(),
  };
  memoryStoreState.memories = updatedMemories;
  saveMemoryStore();
  return true;
}

/**
 * Get all memories for a specific user
 * @param userId - User ID to get memories for
 * @returns Array of memory items for the user
 */
export function getMemoriesForUser(userId: string): MemoryItem[] {
  return memoryStoreState.memories.filter(m => m.userId === userId);
}

// ============================================================================
// Portrait Management Functions
// ============================================================================

/**
 * Get portrait for a specific user
 * @param userId - User ID to get portrait for
 * @returns User portrait or undefined if not found
 */
export function getPortraitForUser(userId: string): UserPortrait | undefined {
  return memoryStoreState.portraits.find(p => p.userId === userId);
}

/**
 * Update or create a user's portrait
 * @param userId - User ID to update portrait for
 * @param portrait - Partial portrait data to merge
 * @returns true if update succeeded, false if user not found
 */
export function updatePortrait(userId: string, portrait: Partial<UserPortrait>): boolean {
  // Verify user exists
  const user = memoryStoreState.users.find(u => u.id === userId);
  if (!user) {
    return false;
  }

  const existingIndex = memoryStoreState.portraits.findIndex(p => p.userId === userId);
  
  if (existingIndex === -1) {
    // Create new portrait
    const newPortrait: UserPortrait = {
      userId,
      tags: portrait.tags || [],
      categories: portrait.categories || [],
      updatedAt: Date.now(),
    };
    memoryStoreState.portraits = [...memoryStoreState.portraits, newPortrait];
  } else {
    // Update existing portrait
    const updatedPortraits = [...memoryStoreState.portraits];
    updatedPortraits[existingIndex] = {
      ...updatedPortraits[existingIndex],
      ...portrait,
      userId, // Ensure userId is not overwritten
      updatedAt: Date.now(),
    };
    memoryStoreState.portraits = updatedPortraits;
  }

  saveMemoryStore();
  return true;
}

/**
 * Add a tag to a user's portrait
 * @param userId - User ID to add tag to
 * @param tag - Tag data (without id)
 * @returns Created tag with id, or null if validation fails
 */
export function addPortraitTag(userId: string, tag: Omit<PortraitTag, 'id'>): PortraitTag | null {
  // Validate tag data
  if (!tag.emoji || !tag.label || tag.label.trim().length === 0) {
    return null;
  }

  // Verify user exists
  const user = memoryStoreState.users.find(u => u.id === userId);
  if (!user) {
    return null;
  }

  const newTag: PortraitTag = {
    id: generateId(),
    emoji: tag.emoji,
    label: tag.label.trim(),
  };

  const existingIndex = memoryStoreState.portraits.findIndex(p => p.userId === userId);
  
  if (existingIndex === -1) {
    // Create new portrait with this tag
    const newPortrait: UserPortrait = {
      userId,
      tags: [newTag],
      categories: [],
      updatedAt: Date.now(),
    };
    memoryStoreState.portraits = [...memoryStoreState.portraits, newPortrait];
  } else {
    // Add tag to existing portrait
    const updatedPortraits = [...memoryStoreState.portraits];
    updatedPortraits[existingIndex] = {
      ...updatedPortraits[existingIndex],
      tags: [...updatedPortraits[existingIndex].tags, newTag],
      updatedAt: Date.now(),
    };
    memoryStoreState.portraits = updatedPortraits;
  }

  saveMemoryStore();
  return newTag;
}

/**
 * Update a tag in a user's portrait
 * @param userId - User ID
 * @param tagId - Tag ID to update
 * @param tag - Partial tag data to merge
 * @returns true if update succeeded, false otherwise
 */
export function updatePortraitTag(userId: string, tagId: string, tag: Partial<Omit<PortraitTag, 'id'>>): boolean {
  const portraitIndex = memoryStoreState.portraits.findIndex(p => p.userId === userId);
  if (portraitIndex === -1) {
    return false;
  }

  const portrait = memoryStoreState.portraits[portraitIndex];
  const tagIndex = portrait.tags.findIndex(t => t.id === tagId);
  if (tagIndex === -1) {
    return false;
  }

  // Validate new values if provided
  if (tag.label !== undefined && tag.label.trim().length === 0) {
    return false;
  }

  const updatedPortraits = [...memoryStoreState.portraits];
  const updatedTags = [...portrait.tags];
  updatedTags[tagIndex] = {
    ...updatedTags[tagIndex],
    ...(tag.emoji !== undefined && { emoji: tag.emoji }),
    ...(tag.label !== undefined && { label: tag.label.trim() }),
  };
  updatedPortraits[portraitIndex] = {
    ...portrait,
    tags: updatedTags,
    updatedAt: Date.now(),
  };
  memoryStoreState.portraits = updatedPortraits;

  saveMemoryStore();
  return true;
}

/**
 * Delete a tag from a user's portrait
 * @param userId - User ID
 * @param tagId - Tag ID to delete
 * @returns true if deletion succeeded, false otherwise
 */
export function deletePortraitTag(userId: string, tagId: string): boolean {
  const portraitIndex = memoryStoreState.portraits.findIndex(p => p.userId === userId);
  if (portraitIndex === -1) {
    return false;
  }

  const portrait = memoryStoreState.portraits[portraitIndex];
  const tagIndex = portrait.tags.findIndex(t => t.id === tagId);
  if (tagIndex === -1) {
    return false;
  }

  const updatedPortraits = [...memoryStoreState.portraits];
  updatedPortraits[portraitIndex] = {
    ...portrait,
    tags: portrait.tags.filter(t => t.id !== tagId),
    updatedAt: Date.now(),
  };
  memoryStoreState.portraits = updatedPortraits;

  saveMemoryStore();
  return true;
}

/**
 * Reorder info items within a category
 * @param userId - User ID
 * @param categoryId - Category ID
 * @param itemIds - Array of item IDs in new order
 * @returns true if reorder succeeded, false otherwise
 */
export function reorderPortraitInfoItems(
  userId: string,
  categoryId: string,
  itemIds: string[]
): boolean {
  const portraitIndex = memoryStoreState.portraits.findIndex(p => p.userId === userId);
  if (portraitIndex === -1) {
    return false;
  }

  const portrait = memoryStoreState.portraits[portraitIndex];
  const categoryIndex = portrait.categories.findIndex(c => c.id === categoryId);
  if (categoryIndex === -1) {
    return false;
  }

  const category = portrait.categories[categoryIndex];

  // Verify all item IDs exist
  const itemMap = new Map(category.items.map(item => [item.id, item]));
  const reorderedItems: PortraitInfoItem[] = [];

  for (const itemId of itemIds) {
    const item = itemMap.get(itemId);
    if (!item) {
      return false; // Invalid item ID
    }
    reorderedItems.push(item);
  }

  const updatedPortraits = [...memoryStoreState.portraits];
  const updatedCategories = [...portrait.categories];
  updatedCategories[categoryIndex] = {
    ...category,
    items: reorderedItems,
  };
  updatedPortraits[portraitIndex] = {
    ...portrait,
    categories: updatedCategories,
    updatedAt: Date.now(),
  };
  memoryStoreState.portraits = updatedPortraits;

  saveMemoryStore();
  return true;
}

/**
 * Add a value to an info item's values array
 * @param userId - User ID
 * @param categoryId - Category ID
 * @param itemId - Item ID
 * @param value - Value to add
 * @returns true if add succeeded, false otherwise
 */
export function addPortraitInfoItemValue(
  userId: string,
  categoryId: string,
  itemId: string,
  value: string
): boolean {
  if (!value || value.trim().length === 0) {
    return false;
  }

  const portraitIndex = memoryStoreState.portraits.findIndex(p => p.userId === userId);
  if (portraitIndex === -1) {
    return false;
  }

  const portrait = memoryStoreState.portraits[portraitIndex];
  const categoryIndex = portrait.categories.findIndex(c => c.id === categoryId);
  if (categoryIndex === -1) {
    return false;
  }

  const category = portrait.categories[categoryIndex];
  const itemIndex = category.items.findIndex(item => item.id === itemId);
  if (itemIndex === -1) {
    return false;
  }

  const item = category.items[itemIndex];
  const currentValues = item.values || [];

  // Check for duplicate
  const trimmedValue = value.trim();
  if (currentValues.includes(trimmedValue) || item.value === trimmedValue) {
    return false;
  }

  const updatedPortraits = [...memoryStoreState.portraits];
  const updatedCategories = [...portrait.categories];
  const updatedItems = [...category.items];
  updatedItems[itemIndex] = {
    ...item,
    values: [...currentValues, trimmedValue],
  };
  updatedCategories[categoryIndex] = {
    ...category,
    items: updatedItems,
  };
  updatedPortraits[portraitIndex] = {
    ...portrait,
    categories: updatedCategories,
    updatedAt: Date.now(),
  };
  memoryStoreState.portraits = updatedPortraits;

  saveMemoryStore();
  return true;
}

/**
 * Remove a value from an info item's values array
 * @param userId - User ID
 * @param categoryId - Category ID
 * @param itemId - Item ID
 * @param valueIndex - Index of value to remove
 * @returns true if remove succeeded, false otherwise
 */
export function removePortraitInfoItemValue(
  userId: string,
  categoryId: string,
  itemId: string,
  valueIndex: number
): boolean {
  const portraitIndex = memoryStoreState.portraits.findIndex(p => p.userId === userId);
  if (portraitIndex === -1) {
    return false;
  }

  const portrait = memoryStoreState.portraits[portraitIndex];
  const categoryIndex = portrait.categories.findIndex(c => c.id === categoryId);
  if (categoryIndex === -1) {
    return false;
  }

  const category = portrait.categories[categoryIndex];
  const itemIndex = category.items.findIndex(item => item.id === itemId);
  if (itemIndex === -1) {
    return false;
  }

  const item = category.items[itemIndex];
  const currentValues = item.values || [];

  if (valueIndex < 0 || valueIndex >= currentValues.length) {
    return false;
  }

  const updatedPortraits = [...memoryStoreState.portraits];
  const updatedCategories = [...portrait.categories];
  const updatedItems = [...category.items];
  updatedItems[itemIndex] = {
    ...item,
    values: currentValues.filter((_, i) => i !== valueIndex),
  };
  updatedCategories[categoryIndex] = {
    ...category,
    items: updatedItems,
  };
  updatedPortraits[portraitIndex] = {
    ...portrait,
    categories: updatedCategories,
    updatedAt: Date.now(),
  };
  memoryStoreState.portraits = updatedPortraits;

  saveMemoryStore();
  return true;
}

/**
 * Update a specific value in an info item
 * @param userId - User ID
 * @param categoryId - Category ID
 * @param itemId - Item ID
 * @param valueIndex - Index of value to update (0 = primary value, >0 = additional values)
 * @param newValue - New value string
 * @returns true if update succeeded, false otherwise
 */
export function updatePortraitInfoItemValue(
  userId: string,
  categoryId: string,
  itemId: string,
  valueIndex: number,
  newValue: string
): boolean {
  if (!newValue || newValue.trim().length === 0) {
    return false;
  }

  const portraitIndex = memoryStoreState.portraits.findIndex(p => p.userId === userId);
  if (portraitIndex === -1) {
    return false;
  }

  const portrait = memoryStoreState.portraits[portraitIndex];
  const categoryIndex = portrait.categories.findIndex(c => c.id === categoryId);
  if (categoryIndex === -1) {
    return false;
  }

  const category = portrait.categories[categoryIndex];
  const itemIndex = category.items.findIndex(item => item.id === itemId);
  if (itemIndex === -1) {
    return false;
  }

  const item = category.items[itemIndex];
  const trimmedValue = newValue.trim();

  const updatedPortraits = [...memoryStoreState.portraits];
  const updatedCategories = [...portrait.categories];
  const updatedItems = [...category.items];

  if (valueIndex === 0) {
    // Update primary value
    updatedItems[itemIndex] = {
      ...item,
      value: trimmedValue,
    };
  } else {
    // Update additional value
    const currentValues = item.values || [];
    const actualIndex = valueIndex - 1;
    if (actualIndex < 0 || actualIndex >= currentValues.length) {
      return false;
    }
    const newValues = [...currentValues];
    newValues[actualIndex] = trimmedValue;
    updatedItems[itemIndex] = {
      ...item,
      values: newValues,
    };
  }

  updatedCategories[categoryIndex] = {
    ...category,
    items: updatedItems,
  };
  updatedPortraits[portraitIndex] = {
    ...portrait,
    categories: updatedCategories,
    updatedAt: Date.now(),
  };
  memoryStoreState.portraits = updatedPortraits;

  saveMemoryStore();
  return true;
}

/**
 * Reorder categories in a user's portrait
 * @param userId - User ID
 * @param categoryIds - Array of category IDs in new order
 * @returns true if reorder succeeded, false otherwise
 */
export function reorderPortraitCategories(userId: string, categoryIds: string[]): boolean {
  const portraitIndex = memoryStoreState.portraits.findIndex(p => p.userId === userId);
  if (portraitIndex === -1) {
    return false;
  }

  const portrait = memoryStoreState.portraits[portraitIndex];

  // Verify all category IDs exist
  const categoryMap = new Map(portrait.categories.map(c => [c.id, c]));
  const reorderedCategories: PortraitCategory[] = [];

  for (const categoryId of categoryIds) {
    const category = categoryMap.get(categoryId);
    if (!category) {
      return false; // Invalid category ID
    }
    reorderedCategories.push(category);
  }

  const updatedPortraits = [...memoryStoreState.portraits];
  updatedPortraits[portraitIndex] = {
    ...portrait,
    categories: reorderedCategories,
    updatedAt: Date.now(),
  };
  memoryStoreState.portraits = updatedPortraits;

  saveMemoryStore();
  return true;
}

/**
 * Update a single info item in a category
 * @param userId - User ID
 * @param categoryId - Category ID
 * @param itemId - Info item ID to update
 * @param updates - Partial updates (label and/or value)
 * @returns true if update succeeded, false otherwise
 */
export function updatePortraitInfoItem(
  userId: string,
  categoryId: string,
  itemId: string,
  updates: { label?: string; value?: string }
): boolean {
  const portraitIndex = memoryStoreState.portraits.findIndex(p => p.userId === userId);
  if (portraitIndex === -1) {
    return false;
  }

  const portrait = memoryStoreState.portraits[portraitIndex];
  const categoryIndex = portrait.categories.findIndex(c => c.id === categoryId);
  if (categoryIndex === -1) {
    return false;
  }

  const category = portrait.categories[categoryIndex];
  const itemIndex = category.items.findIndex(i => i.id === itemId);
  if (itemIndex === -1) {
    return false;
  }

  // Validate updates
  if (updates.value !== undefined && updates.value.trim().length === 0) {
    return false;
  }

  const updatedPortraits = [...memoryStoreState.portraits];
  const updatedCategories = [...portrait.categories];
  const updatedItems = [...category.items];
  
  updatedItems[itemIndex] = {
    ...updatedItems[itemIndex],
    ...(updates.label !== undefined && { label: updates.label.trim() }),
    ...(updates.value !== undefined && { value: updates.value.trim() }),
  };
  
  updatedCategories[categoryIndex] = {
    ...category,
    items: updatedItems,
  };
  
  updatedPortraits[portraitIndex] = {
    ...portrait,
    categories: updatedCategories,
    updatedAt: Date.now(),
  };
  memoryStoreState.portraits = updatedPortraits;

  saveMemoryStore();
  return true;
}

/**
 * Delete a single info item from a category
 * @param userId - User ID
 * @param categoryId - Category ID
 * @param itemId - Info item ID to delete
 * @returns true if deletion succeeded, false otherwise
 */
export function deletePortraitInfoItem(userId: string, categoryId: string, itemId: string): boolean {
  const portraitIndex = memoryStoreState.portraits.findIndex(p => p.userId === userId);
  if (portraitIndex === -1) {
    return false;
  }

  const portrait = memoryStoreState.portraits[portraitIndex];
  const categoryIndex = portrait.categories.findIndex(c => c.id === categoryId);
  if (categoryIndex === -1) {
    return false;
  }

  const category = portrait.categories[categoryIndex];
  const itemIndex = category.items.findIndex(i => i.id === itemId);
  if (itemIndex === -1) {
    return false;
  }

  const updatedPortraits = [...memoryStoreState.portraits];
  const updatedCategories = [...portrait.categories];
  const updatedItems = category.items.filter(i => i.id !== itemId);
  
  // If no items left, remove the category
  if (updatedItems.length === 0) {
    updatedCategories.splice(categoryIndex, 1);
  } else {
    updatedCategories[categoryIndex] = {
      ...category,
      items: updatedItems,
    };
  }
  
  updatedPortraits[portraitIndex] = {
    ...portrait,
    categories: updatedCategories,
    updatedAt: Date.now(),
  };
  memoryStoreState.portraits = updatedPortraits;

  saveMemoryStore();
  return true;
}

/**
 * Update a category's content in a user's portrait (legacy - converts string to items)
 * @param userId - User ID
 * @param categoryId - Category ID to update
 * @param content - New content (will be parsed into items)
 * @returns true if update succeeded, false otherwise
 */
export function updatePortraitCategory(userId: string, categoryId: string, content: string): boolean {
  const portraitIndex = memoryStoreState.portraits.findIndex(p => p.userId === userId);
  if (portraitIndex === -1) {
    return false;
  }

  const portrait = memoryStoreState.portraits[portraitIndex];
  const categoryIndex = portrait.categories.findIndex(c => c.id === categoryId);
  if (categoryIndex === -1) {
    return false;
  }

  // Validate content
  if (content.trim().length === 0) {
    return false;
  }

  // Parse content into items
  const items = parseContentToItems(content);

  const updatedPortraits = [...memoryStoreState.portraits];
  const updatedCategories = [...portrait.categories];
  updatedCategories[categoryIndex] = {
    ...updatedCategories[categoryIndex],
    items,
  };
  updatedPortraits[portraitIndex] = {
    ...portrait,
    categories: updatedCategories,
    updatedAt: Date.now(),
  };
  memoryStoreState.portraits = updatedPortraits;

  saveMemoryStore();
  return true;
}

/**
 * Parse content string into PortraitInfoItem array
 */
function parseContentToItems(content: string): PortraitInfoItem[] {
  const lines = content.split('\n').filter(line => line.trim());
  return lines.map(line => {
    const colonIndex = line.indexOf('：') !== -1 ? line.indexOf('：') : line.indexOf(':');
    const hasLabel = colonIndex > 0 && colonIndex < 20;
    return {
      id: generateId(),
      label: hasLabel ? line.substring(0, colonIndex).trim() : '',
      value: hasLabel ? line.substring(colonIndex + 1).trim() : line.trim(),
    };
  });
}

/**
 * Add a new category to a user's portrait
 * @param userId - User ID
 * @param title - Category title
 * @returns Created category or null if validation fails
 */
export function addPortraitCategory(userId: string, title: string): PortraitCategory | null {
  if (!title || title.trim().length === 0) {
    return null;
  }

  const user = memoryStoreState.users.find(u => u.id === userId);
  if (!user) {
    return null;
  }

  const newCategory: PortraitCategory = {
    id: generateId(),
    title: title.trim(),
    items: [],
  };

  const existingIndex = memoryStoreState.portraits.findIndex(p => p.userId === userId);
  
  if (existingIndex === -1) {
    const newPortrait: UserPortrait = {
      userId,
      tags: [],
      categories: [newCategory],
      updatedAt: Date.now(),
    };
    memoryStoreState.portraits = [...memoryStoreState.portraits, newPortrait];
  } else {
    const updatedPortraits = [...memoryStoreState.portraits];
    updatedPortraits[existingIndex] = {
      ...updatedPortraits[existingIndex],
      categories: [...updatedPortraits[existingIndex].categories, newCategory],
      updatedAt: Date.now(),
    };
    memoryStoreState.portraits = updatedPortraits;
  }

  saveMemoryStore();
  return newCategory;
}

/**
 * Update a category's title
 * @param userId - User ID
 * @param categoryId - Category ID
 * @param title - New title
 * @returns true if update succeeded, false otherwise
 */
export function updatePortraitCategoryTitle(userId: string, categoryId: string, title: string): boolean {
  if (!title || title.trim().length === 0) {
    return false;
  }

  const portraitIndex = memoryStoreState.portraits.findIndex(p => p.userId === userId);
  if (portraitIndex === -1) {
    return false;
  }

  const portrait = memoryStoreState.portraits[portraitIndex];
  const categoryIndex = portrait.categories.findIndex(c => c.id === categoryId);
  if (categoryIndex === -1) {
    return false;
  }

  const updatedPortraits = [...memoryStoreState.portraits];
  const updatedCategories = [...portrait.categories];
  updatedCategories[categoryIndex] = {
    ...updatedCategories[categoryIndex],
    title: title.trim(),
  };
  updatedPortraits[portraitIndex] = {
    ...portrait,
    categories: updatedCategories,
    updatedAt: Date.now(),
  };
  memoryStoreState.portraits = updatedPortraits;

  saveMemoryStore();
  return true;
}

/**
 * Delete a category from a user's portrait
 * @param userId - User ID
 * @param categoryId - Category ID to delete
 * @returns true if deletion succeeded, false otherwise
 */
export function deletePortraitCategory(userId: string, categoryId: string): boolean {
  const portraitIndex = memoryStoreState.portraits.findIndex(p => p.userId === userId);
  if (portraitIndex === -1) {
    return false;
  }

  const portrait = memoryStoreState.portraits[portraitIndex];
  const categoryIndex = portrait.categories.findIndex(c => c.id === categoryId);
  if (categoryIndex === -1) {
    return false;
  }

  const updatedPortraits = [...memoryStoreState.portraits];
  updatedPortraits[portraitIndex] = {
    ...portrait,
    categories: portrait.categories.filter(c => c.id !== categoryId),
    updatedAt: Date.now(),
  };
  memoryStoreState.portraits = updatedPortraits;

  saveMemoryStore();
  return true;
}

/**
 * Add an info item to a category
 * @param userId - User ID
 * @param categoryId - Category ID
 * @param label - Item label
 * @param value - Item value
 * @returns Created item or null if validation fails
 */
export function addPortraitInfoItem(
  userId: string,
  categoryId: string,
  label: string,
  value: string
): PortraitInfoItem | null {
  if (!value || value.trim().length === 0) {
    return null;
  }

  const portraitIndex = memoryStoreState.portraits.findIndex(p => p.userId === userId);
  if (portraitIndex === -1) {
    return null;
  }

  const portrait = memoryStoreState.portraits[portraitIndex];
  const categoryIndex = portrait.categories.findIndex(c => c.id === categoryId);
  if (categoryIndex === -1) {
    return null;
  }

  const newItem: PortraitInfoItem = {
    id: generateId(),
    label: label.trim(),
    value: value.trim(),
  };

  const updatedPortraits = [...memoryStoreState.portraits];
  const updatedCategories = [...portrait.categories];
  updatedCategories[categoryIndex] = {
    ...updatedCategories[categoryIndex],
    items: [...updatedCategories[categoryIndex].items, newItem],
  };
  updatedPortraits[portraitIndex] = {
    ...portrait,
    categories: updatedCategories,
    updatedAt: Date.now(),
  };
  memoryStoreState.portraits = updatedPortraits;

  saveMemoryStore();
  return newItem;
}

// ============================================================================
// Injection Mode Functions
// ============================================================================

/**
 * Set the injection mode
 * @param mode - Injection mode (ALL or CURRENT)
 */
export function setInjectionMode(mode: InjectionMode): void {
  memoryStoreState.injectionMode = mode;
  saveMemoryStore();
}

/**
 * Get enabled memories based on current injection mode
 * @returns Array of enabled memory items
 */
export function getEnabledMemories(): MemoryItem[] {
  const { memories, activeUserId, injectionMode } = memoryStoreState;

  if (injectionMode === 'ALL') {
    return memories.filter(m => m.isEnabled);
  } else {
    return memories.filter(m => m.userId === activeUserId && m.isEnabled);
  }
}

/**
 * Get enabled memories that are NOT extracted (for injection)
 * Self user's memories are prioritized first
 * @returns Array of enabled, non-extracted memory items
 */
export function getUnextractedMemories(): MemoryItem[] {
  const { memories, users, activeUserId, injectionMode } = memoryStoreState;

  let filtered: MemoryItem[];
  if (injectionMode === 'ALL') {
    filtered = memories.filter(m => m.isEnabled && !m.isExtracted);
  } else {
    filtered = memories.filter(m => m.userId === activeUserId && m.isEnabled && !m.isExtracted);
  }

  // Sort: self user's memories first
  const selfUser = users.find(u => u.isSelf);
  if (selfUser) {
    filtered.sort((a, b) => {
      const aIsSelf = a.userId === selfUser.id;
      const bIsSelf = b.userId === selfUser.id;
      if (aIsSelf && !bIsSelf) return -1;
      if (!aIsSelf && bIsSelf) return 1;
      return 0;
    });
  }

  return filtered;
}

/**
 * Get formatted memory text for injection into system prompt
 * Only includes non-extracted memories
 * @returns Formatted memory text string
 */
export function getMemoryText(): string {
  const { users, injectionMode } = memoryStoreState;
  const unextractedMemories = getUnextractedMemories();

  if (unextractedMemories.length === 0) {
    return '';
  }

  if (injectionMode === 'ALL') {
    // ALL mode: prefix with user name
    return unextractedMemories.map(m => {
      const user = users.find(u => u.id === m.userId);
      // Use "我" for self user, otherwise use user name
      const userName = user?.isSelf ? '我' : (user?.name || '未知用户');
      return `- [${userName}]: ${m.content}`;
    }).join('\n');
  } else {
    // CURRENT mode: no prefix
    return unextractedMemories.map(m => `- ${m.content}`).join('\n');
  }
}

/**
 * Get formatted portrait text for injection into system prompt
 * Self user's portrait is prioritized first
 * @returns Formatted portrait text string
 */
export function getPortraitText(): string {
  const { users, portraits, activeUserId, injectionMode } = memoryStoreState;
  
  let relevantPortraits = injectionMode === 'ALL' 
    ? [...portraits] 
    : portraits.filter(p => p.userId === activeUserId);

  if (relevantPortraits.length === 0) {
    return '';
  }

  // Sort: self user's portrait first
  const selfUser = users.find(u => u.isSelf);
  if (selfUser && injectionMode === 'ALL') {
    relevantPortraits.sort((a, b) => {
      const aIsSelf = a.userId === selfUser.id;
      const bIsSelf = b.userId === selfUser.id;
      if (aIsSelf && !bIsSelf) return -1;
      if (!aIsSelf && bIsSelf) return 1;
      return 0;
    });
  }

  const parts: string[] = [];

  for (const portrait of relevantPortraits) {
    const user = users.find(u => u.id === portrait.userId);
    // Use "我" for self user, otherwise use user name
    const userName = user?.isSelf ? '我' : (user?.name || '未知用户');
    
    const lines: string[] = [];
    
    // Add tags
    if (portrait.tags.length > 0) {
      const tagStr = portrait.tags.map(t => `${t.emoji}${t.label}`).join(', ');
      lines.push(`印象: ${tagStr}`);
    }
    
    // Add categories
    for (const category of portrait.categories) {
      if (category.items.length > 0) {
        const itemsStr = category.items.map(item => {
          const allValues = item.values && item.values.length > 0
            ? [item.value, ...item.values].join(', ')
            : item.value;
          return item.label ? `${item.label}:${allValues}` : allValues;
        }).join(' | ');
        lines.push(`${category.title}: ${itemsStr}`);
      }
    }
    
    if (lines.length > 0) {
      if (injectionMode === 'ALL') {
        parts.push(`[${userName}的印象]\n${lines.join('\n')}`);
      } else {
        parts.push(lines.join('\n'));
      }
    }
  }

  return parts.join('\n\n');
}

/**
 * Get combined memory and portrait text for injection
 * Portrait first (higher priority), then unextracted memories
 * @returns Combined formatted text
 */
export function getFullMemoryText(): string {
  const portraitText = getPortraitText();
  const memoryText = getMemoryText();
  
  const parts: string[] = [];
  if (portraitText) parts.push(portraitText);
  if (memoryText) parts.push(memoryText);
  
  return parts.join('\n\n');
}

// ============================================================================
// Persistence Functions
// ============================================================================

/**
 * Save memory store to Orca storage
 */
export async function saveMemoryStore(): Promise<void> {
  try {
    const pluginName = getAiChatPluginName();
    const data: MemoryStoreData = {
      version: memoryStoreState.version,
      users: memoryStoreState.users,
      memories: memoryStoreState.memories,
      portraits: memoryStoreState.portraits,
      activeUserId: memoryStoreState.activeUserId,
      injectionMode: memoryStoreState.injectionMode,
    };
    await orca.plugins.setData(pluginName, STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    console.error('[MemoryStore] Failed to save:', error);
  }
}

/**
 * Load memory store from Orca storage
 */
export async function loadMemoryStore(): Promise<void> {
  try {
    const pluginName = getAiChatPluginName();
    const raw = await orca.plugins.getData(pluginName, STORAGE_KEY);
    if (!raw) {
      // No saved data, use default state
      return;
    }

    const data = typeof raw === 'string' ? JSON.parse(raw) : raw as MemoryStoreData;

    // Validate data structure
    if (!data.users || !Array.isArray(data.users) || 
        !data.memories || !Array.isArray(data.memories)) {
      console.warn('[MemoryStore] Invalid data structure, using defaults');
      return;
    }

    // Migrate v1 to v2: add emoji to users and portraits array
    if (!data.version || data.version < 2) {
      data.users = data.users.map((u: UserProfile) => ({
        ...u,
        emoji: u.emoji || getDefaultEmoji(u.name),
      }));
      data.portraits = [];
      data.version = 2;
    }

    // Migrate: add isExtracted field to memories that don't have it
    data.memories = data.memories.map((m: MemoryItem) => ({
      ...m,
      isExtracted: m.isExtracted ?? false,
    }));

    // Ensure default user exists
    if (!data.users.find((u: UserProfile) => u.id === 'default-user')) {
      data.users.unshift({
        id: 'default-user',
        name: '用户',
        emoji: 'D',
        isDefault: true,
        createdAt: Date.now(),
      });
    }

    // Update store state
    memoryStoreState.version = data.version || 2;
    memoryStoreState.users = data.users;
    memoryStoreState.memories = data.memories;
    memoryStoreState.portraits = data.portraits || [];
    memoryStoreState.activeUserId = data.activeUserId || 'default-user';
    memoryStoreState.injectionMode = data.injectionMode || 'ALL';
  } catch (error) {
    console.error('[MemoryStore] Failed to load:', error);
    // Keep default state on error
  }
}

// ============================================================================
// Convenience Export
// ============================================================================

/**
 * Memory store object with all actions
 */
export const memoryStore = {
  // State (reactive)
  get state() {
    return memoryStoreState;
  },

  // User Management
  createUser,
  updateUser,
  updateUserEmoji,
  setUserAsSelf,
  deleteUser,
  setActiveUser,
  getActiveUser,

  // Memory Management
  addMemory,
  updateMemory,
  deleteMemory,
  toggleMemory,
  toggleMemoryExtracted,
  markMemoryAsExtracted,
  getMemoriesForUser,

  // Portrait Management
  getPortraitForUser,
  updatePortrait,
  addPortraitTag,
  updatePortraitTag,
  deletePortraitTag,
  addPortraitCategory,
  updatePortraitCategoryTitle,
  deletePortraitCategory,
  addPortraitInfoItem,
  updatePortraitCategory,
  updatePortraitInfoItem,
  deletePortraitInfoItem,
  reorderPortraitInfoItems,
  addPortraitInfoItemValue,
  removePortraitInfoItemValue,
  updatePortraitInfoItemValue,
  reorderPortraitCategories,

  // Injection Mode
  setInjectionMode,
  getEnabledMemories,
  getUnextractedMemories,
  getMemoryText,
  getPortraitText,
  getFullMemoryText,

  // Persistence
  save: saveMemoryStore,
  load: loadMemoryStore,
};
