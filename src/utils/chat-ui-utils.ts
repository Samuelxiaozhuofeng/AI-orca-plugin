/**
 * Chat UI Enhancement Utilities
 * 聊天界面增强工具函数
 */

/**
 * 根据当前小时返回时间问候语
 * - 5-11: 早上好
 * - 12-17: 下午好
 * - 18-4: 晚上好
 * 
 * @param hour - 小时 (0-23)，默认使用当前时间
 * @returns 问候语字符串
 * 
 * **Feature: chat-ui-enhancement, Property 1: Time-based greeting selection**
 * **Validates: Requirements 3.1**
 */
export function getTimeGreeting(hour?: number): string {
  const h = hour ?? new Date().getHours();
  
  if (h >= 5 && h <= 11) {
    return "早上好";
  } else if (h >= 12 && h <= 17) {
    return "下午好";
  } else {
    return "晚上好";
  }
}

/**
 * 判断两个日期是否是同一天
 */
export function isSameDay(date1: Date, date2: Date): boolean {
  return (
    date1.getFullYear() === date2.getFullYear() &&
    date1.getMonth() === date2.getMonth() &&
    date1.getDate() === date2.getDate()
  );
}

/**
 * 格式化日期分隔符显示
 * - 今天: "今天"
 * - 昨天: "昨天"
 * - 其他: "M月D日"
 * 
 * @param date - 要格式化的日期
 * @returns 格式化后的日期字符串
 * 
 * **Feature: chat-ui-enhancement, Property 2: Message date grouping**
 * **Validates: Requirements 4.1**
 */
export function formatDateSeparator(date: Date): string {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  
  if (isSameDay(date, today)) {
    return "今天";
  }
  if (isSameDay(date, yesterday)) {
    return "昨天";
  }
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}


// ============================================================================
// Slash Command Menu Utilities
// 斜杠命令菜单工具函数
// ============================================================================

/**
 * 斜杠命令分类
 */
export type SlashCommandCategory = "format" | "style" | "visualization" | "command";

/**
 * 斜杠命令接口
 */
export interface SlashCommand {
  command: string;
  description: string;
  icon: string;
  category: SlashCommandCategory;
}

/**
 * 分组后的命令结构
 */
export interface GroupedCommands {
  format: SlashCommand[];
  style: SlashCommand[];
  visualization: SlashCommand[];
  command: SlashCommand[];
}

/**
 * 将命令按分类分组
 * 
 * @param commands - 命令列表
 * @returns 按分类分组的命令对象
 * 
 * **Feature: chat-ui-enhancement, Property 5: Slash command category grouping**
 * **Validates: Requirements 7.1**
 */
export function groupCommandsByCategory(commands: SlashCommand[]): GroupedCommands {
  const result: GroupedCommands = {
    format: [],
    style: [],
    visualization: [],
    command: [],
  };

  for (const cmd of commands) {
    if (cmd.category in result) {
      result[cmd.category].push(cmd);
    }
  }

  return result;
}


/**
 * 模糊匹配函数
 * 检查查询字符串中的所有字符是否按顺序出现在目标字符串中
 * 
 * @param query - 查询字符串
 * @param target - 目标字符串
 * @returns 是否匹配
 * 
 * **Feature: chat-ui-enhancement, Property 7: Fuzzy command matching**
 * **Validates: Requirements 7.3**
 */
export function fuzzyMatch(query: string, target: string): boolean {
  if (query.length === 0) {
    return true;
  }
  
  const queryLower = query.toLowerCase();
  const targetLower = target.toLowerCase();
  
  let queryIndex = 0;
  
  for (const char of targetLower) {
    if (char === queryLower[queryIndex]) {
      queryIndex++;
    }
    if (queryIndex === queryLower.length) {
      return true;
    }
  }
  
  return false;
}


// ============================================================================
// Recent Commands Management
// 最近命令管理
// ============================================================================

const RECENT_COMMANDS_KEY = "ai-chat-recent-commands";
const MAX_RECENT_COMMANDS = 5;

/**
 * 最近命令存储接口
 */
export interface RecentCommandsStore {
  commands: string[];
  maxItems: number;
}

/**
 * 从 localStorage 获取最近使用的命令列表
 * 
 * @returns 最近使用的命令列表（最近使用的在前）
 * 
 * **Feature: chat-ui-enhancement, Property 6: Recent commands ordering**
 * **Validates: Requirements 7.2**
 */
export function getRecentCommands(): string[] {
  try {
    const stored = localStorage.getItem(RECENT_COMMANDS_KEY);
    if (!stored) {
      return [];
    }
    const data: RecentCommandsStore = JSON.parse(stored);
    return data.commands || [];
  } catch {
    return [];
  }
}

/**
 * 添加命令到最近使用列表
 * - 如果命令已存在，将其移到最前面
 * - 保持列表长度不超过 maxItems
 * 
 * @param command - 要添加的命令
 * 
 * **Feature: chat-ui-enhancement, Property 6: Recent commands ordering**
 * **Validates: Requirements 7.2**
 */
export function addRecentCommand(command: string): void {
  const commands = getRecentCommands();
  const limited = addRecentCommandPure(commands, command, MAX_RECENT_COMMANDS);
  
  // Save to localStorage
  const store: RecentCommandsStore = {
    commands: limited,
    maxItems: MAX_RECENT_COMMANDS,
  };
  
  try {
    localStorage.setItem(RECENT_COMMANDS_KEY, JSON.stringify(store));
  } catch {
    // Ignore storage errors
  }
}

export function addRecentCommandPure(
  existingCommands: string[],
  command: string,
  maxItems: number = MAX_RECENT_COMMANDS
): string[] {
  const seen = new Set<string>([command]);
  const deduped = existingCommands.filter((cmd) => {
    if (seen.has(cmd)) return false;
    seen.add(cmd);
    return true;
  });
  return [command, ...deduped].slice(0, Math.max(0, maxItems));
}

// ============================================================================
// Context Chips Token Utilities
// 上下文芯片 Token 工具函数
// ============================================================================

/**
 * 上下文芯片接口（带 Token 信息）
 */
export interface EnhancedContextChip {
  id: string;
  title: string;
  kind: "page" | "block" | "tag";
  tokenCount: number;
  preview?: string;
}

/**
 * 计算上下文芯片的总 Token 数
 * 
 * @param chips - 上下文芯片列表
 * @returns 总 Token 数
 * 
 * **Feature: chat-ui-enhancement, Property 8: Context token sum**
 * **Validates: Requirements 8.2**
 */
export function calculateTotalContextTokens(chips: EnhancedContextChip[]): number {
  return chips.reduce((sum, chip) => sum + chip.tokenCount, 0);
}

/**
 * 截断文本用于预览
 * 
 * @param text - 原始文本
 * @param maxLength - 最大长度
 * @returns 截断后的文本
 */
export function truncatePreview(text: string, maxLength: number = 100): string {
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + "...";
}
