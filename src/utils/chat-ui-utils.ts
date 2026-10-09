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
