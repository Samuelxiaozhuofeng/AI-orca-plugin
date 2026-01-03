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


/**
 * 消息接口（用于分组）
 */
export interface MessageWithTimestamp {
  id: string;
  timestamp: Date;
  [key: string]: any;
}

/**
 * 分组后的消息项类型
 */
export type GroupedMessageItem<T extends MessageWithTimestamp> =
  | { type: "separator"; date: Date; label: string }
  | { type: "message"; message: T };

/**
 * 将消息按日期分组，返回带分隔符的列表
 * 
 * @param messages - 消息列表（需要有 timestamp 字段）
 * @returns 带日期分隔符的消息列表
 * 
 * **Feature: chat-ui-enhancement, Property 2: Message date grouping**
 * **Validates: Requirements 4.1**
 */
export function groupMessagesByDate<T extends MessageWithTimestamp>(
  messages: T[]
): GroupedMessageItem<T>[] {
  if (messages.length === 0) {
    return [];
  }

  // Sort messages by timestamp (oldest first)
  const sorted = [...messages].sort(
    (a, b) => a.timestamp.getTime() - b.timestamp.getTime()
  );

  const result: GroupedMessageItem<T>[] = [];
  let currentDateStr: string | null = null;

  for (const message of sorted) {
    const messageDate = message.timestamp;
    const dateStr = `${messageDate.getFullYear()}-${messageDate.getMonth()}-${messageDate.getDate()}`;

    // Add separator if this is a new date
    if (dateStr !== currentDateStr) {
      result.push({
        type: "separator",
        date: messageDate,
        label: formatDateSeparator(messageDate),
      });
      currentDateStr = dateStr;
    }

    result.push({
      type: "message",
      message,
    });
  }

  return result;
}


/**
 * 计算 Token 使用百分比
 * 
 * @param current - 当前 Token 数
 * @param max - 最大 Token 数
 * @returns 百分比 (0-100)，超出范围时会被 clamp
 * 
 * **Feature: chat-ui-enhancement, Property 3: Token progress percentage calculation**
 * **Validates: Requirements 5.1**
 */
export function calculateTokenPercentage(current: number, max: number): number {
  if (max <= 0) {
    return 0;
  }
  const percentage = (current / max) * 100;
  return Math.max(0, Math.min(100, percentage));
}

/**
 * 根据百分比返回进度条颜色
 * - >= 95%: danger (红色)
 * - >= 80%: warning (黄色)
 * - < 80%: primary (蓝色)
 * 
 * @param percentage - 百分比 (0-100)
 * @returns CSS 变量名
 * 
 * **Feature: chat-ui-enhancement, Property 4: Token progress color thresholds**
 * **Validates: Requirements 5.2, 5.3**
 */
export function getProgressColor(percentage: number): string {
  if (percentage >= 95) {
    return "var(--orca-color-danger)";
  }
  if (percentage >= 80) {
    return "var(--orca-color-warning)";
  }
  return "var(--orca-color-primary)";
}


// ============================================================================
// Slash Command Menu Utilities
// 斜杠命令菜单工具函数
// ============================================================================

/**
 * 斜杠命令分类
 */
export type SlashCommandCategory = "format" | "style" | "visualization";

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

/**
 * 使用模糊匹配过滤命令列表
 * 
 * @param commands - 命令列表
 * @param query - 查询字符串
 * @returns 匹配的命令列表
 */
export function filterCommandsByFuzzyMatch(
  commands: SlashCommand[],
  query: string
): SlashCommand[] {
  if (!query) {
    return commands;
  }
  return commands.filter((cmd) => fuzzyMatch(query, cmd.command));
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
  
  // Remove if already exists
  const filtered = commands.filter((cmd) => cmd !== command);
  
  // Add to front
  filtered.unshift(command);
  
  // Limit to max items
  const limited = filtered.slice(0, MAX_RECENT_COMMANDS);
  
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

/**
 * 清除最近使用的命令列表
 */
export function clearRecentCommands(): void {
  try {
    localStorage.removeItem(RECENT_COMMANDS_KEY);
  } catch {
    // Ignore storage errors
  }
}

/**
 * 纯函数版本：添加命令到最近使用列表
 * 用于测试和纯函数场景
 * 
 * @param commands - 当前命令列表
 * @param command - 要添加的命令
 * @param maxItems - 最大项数
 * @returns 更新后的命令列表
 * 
 * **Feature: chat-ui-enhancement, Property 6: Recent commands ordering**
 * **Validates: Requirements 7.2**
 */
export function addRecentCommandPure(
  commands: string[],
  command: string,
  maxItems: number = MAX_RECENT_COMMANDS
): string[] {
  // Remove if already exists
  const filtered = commands.filter((cmd) => cmd !== command);
  
  // Add to front
  filtered.unshift(command);
  
  // Limit to max items
  return filtered.slice(0, maxItems);
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
  kind: "page" | "tag";
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
 * 格式化 Token 数量显示（简短格式）
 * 
 * @param tokens - Token 数量
 * @returns 格式化后的字符串
 */
export function formatTokenCountShort(tokens: number): string {
  if (tokens < 1000) return tokens.toString();
  if (tokens < 10000) return `${(tokens / 1000).toFixed(1)}k`;
  return `${Math.round(tokens / 1000)}k`;
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


// ============================================================================
// Tool Progress Display Utilities
// 工具进度显示工具函数
// ============================================================================

/**
 * 格式化工具进度显示字符串
 * 
 * @param completed - 已完成的工具数量
 * @param total - 总工具数量
 * @returns 格式化的进度字符串 "{completed}/{total} 完成"
 * 
 * **Feature: chat-ui-enhancement, Property 9: Tool progress display**
 * **Validates: Requirements 10.3**
 */
export function formatToolProgress(completed: number, total: number): string {
  if (total <= 0) {
    return "0/0 完成";
  }
  return `${completed}/${total} 完成`;
}
