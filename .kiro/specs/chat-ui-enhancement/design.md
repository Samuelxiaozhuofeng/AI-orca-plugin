# Design Document: Chat UI Enhancement

## Overview

本设计文档描述 AI Chat 插件的 UI/UX 改进方案，涵盖视觉升级、交互优化和用户体验增强。改进将分模块实现，确保向后兼容并保持代码可维护性。

## Architecture

### 组件层次结构

```
AiChatPanel
├── Header
│   ├── EditableTitle
│   ├── ChatHistoryMenu
│   └── HeaderMenu (含 DisplaySettings)
├── MessageList
│   ├── DateSeparator (新增)
│   ├── MessageItem
│   │   ├── MessageBubble (样式升级)
│   │   ├── ReasoningBlock (优化)
│   │   └── ToolStatusIndicator (优化)
│   ├── TypingIndicator (新增/替换 LoadingDots)
│   ├── SkeletonMessage (新增)
│   └── ScrollToBottomButton (新增)
├── EmptyState (增强)
└── ChatInput
    ├── ContextChips (增强)
    ├── TokenProgressBar (新增)
    ├── SlashCommandMenu (优化)
    └── DragDropOverlay (新增)
```

### 状态管理

新增以下状态：
- `displaySettings`: 显示设置（字体大小、紧凑模式、时间戳显示）
- `recentCommands`: 最近使用的斜杠命令
- `isDraggingFile`: 文件拖拽状态

## Components and Interfaces

### 1. MessageBubble 样式升级

```typescript
// 用户消息气泡样式
const userBubbleStyle: React.CSSProperties = {
  background: "linear-gradient(135deg, var(--orca-color-primary) 0%, var(--orca-color-primary-dark, #0056b3) 100%)",
  boxShadow: "0 2px 12px rgba(0, 123, 255, 0.2)",
  // ... 其他样式
};

// AI 消息气泡样式
const assistantBubbleStyle: React.CSSProperties = {
  background: "var(--orca-color-bg-2)",
  boxShadow: "0 1px 3px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.03)",
  border: "none", // 移除硬边框
  // ... 其他样式
};
```

### 2. TypingIndicator 组件

```typescript
interface TypingIndicatorProps {
  // 无需 props，纯展示组件
}

// 三点跳动动画
const dotAnimation = `
@keyframes bounce {
  0%, 60%, 100% { transform: translateY(0); }
  30% { transform: translateY(-8px); }
}
`;
```

### 3. DateSeparator 组件

```typescript
interface DateSeparatorProps {
  date: Date;
}

// 格式化日期显示
function formatDateSeparator(date: Date): string {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  
  if (isSameDay(date, today)) return "今天";
  if (isSameDay(date, yesterday)) return "昨天";
  return `${date.getMonth() + 1}月${date.getDate()}日`;
}
```

### 4. TokenProgressBar 组件

```typescript
interface TokenProgressBarProps {
  currentTokens: number;
  maxTokens: number;
}

// 颜色阈值
const getProgressColor = (percentage: number): string => {
  if (percentage >= 95) return "var(--orca-color-danger)";
  if (percentage >= 80) return "var(--orca-color-warning)";
  return "var(--orca-color-primary)";
};
```

### 5. SlashCommandMenu 优化

```typescript
interface SlashCommand {
  command: string;
  description: string;
  icon: string;
  category: "format" | "style" | "visualization";
}

interface SlashCommandMenuProps {
  commands: SlashCommand[];
  recentCommands: string[];
  query: string;
  onSelect: (command: string) => void;
}

// 模糊匹配函数
function fuzzyMatch(query: string, target: string): boolean {
  const queryLower = query.toLowerCase();
  const targetLower = target.toLowerCase();
  let queryIndex = 0;
  for (const char of targetLower) {
    if (char === queryLower[queryIndex]) queryIndex++;
    if (queryIndex === queryLower.length) return true;
  }
  return false;
}
```

### 6. ContextChips 增强

```typescript
interface EnhancedContextChip {
  id: string;
  title: string;
  kind: "page" | "block" | "memory";
  tokenCount: number;
  preview?: string; // 内容预览
}

interface ContextChipsProps {
  items: EnhancedContextChip[];
  onRemove: (id: string) => void;
  showTokens?: boolean;
}
```

### 7. DisplaySettings 组件

```typescript
interface DisplaySettings {
  fontSize: "small" | "medium" | "large";
  compactMode: boolean;
  showTimestamps: boolean;
}

const fontSizeMap = {
  small: "14px",
  medium: "16px",
  large: "18px",
};

const spacingMap = {
  compact: { gap: 6, padding: "8px 12px" },
  comfortable: { gap: 12, padding: "14px 18px" },
};
```

### 8. ScrollToBottomButton 组件

```typescript
interface ScrollToBottomButtonProps {
  visible: boolean;
  onClick: () => void;
}
```

### 9. SkeletonMessage 组件

```typescript
interface SkeletonMessageProps {
  role: "user" | "assistant";
}

// 骨架屏动画
const skeletonAnimation = `
@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}
`;
```

## Data Models

### DisplaySettings 存储

```typescript
interface DisplaySettingsStore {
  fontSize: "small" | "medium" | "large";
  compactMode: boolean;
  showTimestamps: boolean;
}

// 存储在 localStorage
const DISPLAY_SETTINGS_KEY = "ai-chat-display-settings";
```

### RecentCommands 存储

```typescript
interface RecentCommandsStore {
  commands: string[];
  maxItems: number; // 默认 5
}

// 存储在 localStorage
const RECENT_COMMANDS_KEY = "ai-chat-recent-commands";
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Time-based greeting selection
*For any* hour of the day (0-23), the greeting function SHALL return the correct greeting: "早上好" for 5-11, "下午好" for 12-17, "晚上好" for 18-4.
**Validates: Requirements 3.1**

### Property 2: Message date grouping
*For any* list of messages with timestamps, the grouping function SHALL produce date separators such that all messages between two separators share the same calendar date.
**Validates: Requirements 4.1**

### Property 3: Token progress percentage calculation
*For any* current token count and max token limit where max > 0, the percentage calculation SHALL return a value between 0 and 100 (clamped).
**Validates: Requirements 5.1**

### Property 4: Token progress color thresholds
*For any* percentage value, the color function SHALL return "danger" for ≥95%, "warning" for ≥80% and <95%, and "primary" for <80%.
**Validates: Requirements 5.2, 5.3**

### Property 5: Slash command category grouping
*For any* list of slash commands, the grouping function SHALL produce groups where all commands in a group share the same category.
**Validates: Requirements 7.1**

### Property 6: Recent commands ordering
*For any* command usage history, the recent commands list SHALL be ordered by most recent first and limited to maxItems.
**Validates: Requirements 7.2**

### Property 7: Fuzzy command matching
*For any* query string and command list, the fuzzy match function SHALL return commands where all query characters appear in order within the command string.
**Validates: Requirements 7.3**

### Property 8: Context token sum
*For any* list of context chips with token counts, the total token count SHALL equal the sum of all individual token counts.
**Validates: Requirements 8.2**

### Property 9: Tool progress display
*For any* completed count and total count where total > 0, the progress string SHALL be formatted as "{completed}/{total} 完成".
**Validates: Requirements 10.3**

### Property 10: Compact mode spacing reduction
*For any* display settings with compactMode enabled, the message spacing SHALL be less than the spacing when compactMode is disabled.
**Validates: Requirements 12.2**

### Property 11: Timestamp visibility toggle
*For any* display settings, timestamps SHALL be rendered if and only if showTimestamps is true.
**Validates: Requirements 12.3**

## Error Handling

### 网络错误
- 显示错误消息和重试按钮
- 保留用户输入内容
- 提供离线状态提示

### Token 超限
- 显示警告颜色
- 提供截断建议
- 阻止发送超限内容

### 文件上传失败
- 显示错误提示
- 允许重新上传
- 保留其他已上传文件

## Testing Strategy

### 单元测试

使用 Vitest 进行单元测试：

1. **纯函数测试**
   - `getTimeGreeting(hour)` - 时间问候语
   - `formatDateSeparator(date)` - 日期格式化
   - `getProgressColor(percentage)` - 进度条颜色
   - `fuzzyMatch(query, target)` - 模糊匹配
   - `groupCommandsByCategory(commands)` - 命令分组
   - `calculateTotalTokens(chips)` - Token 总计

2. **组件渲染测试**
   - TypingIndicator 渲染 3 个点
   - DateSeparator 显示正确文本
   - TokenProgressBar 显示正确颜色
   - SkeletonMessage 渲染骨架结构

### 属性测试

使用 fast-check 进行属性测试：

1. **时间问候语属性** - 任意小时返回有效问候语
2. **日期分组属性** - 分组后消息日期一致
3. **Token 百分比属性** - 结果在 0-100 范围内
4. **颜色阈值属性** - 阈值边界正确
5. **模糊匹配属性** - 匹配结果包含查询字符
6. **Token 求和属性** - 总和等于各项之和

### 集成测试

1. 消息发送流程（乐观更新）
2. 文件拖拽上传
3. 斜杠命令选择
4. 显示设置持久化
