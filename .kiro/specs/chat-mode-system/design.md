# Design Document: Chat Mode System

## Overview

本设计实现 AI Chat 插件的对话模式系统，支持三种模式：Agent（自动执行）、Supervised（需确认）、Ask（仅对话）。系统通过 store 管理模式状态，在消息处理流程中根据模式决定工具调用行为。

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      ChatInput                               │
│  ┌─────────────────┐  ┌─────────────────┐                   │
│  │ ModeSelectorBtn │  │ InjectionMode   │  ...              │
│  └────────┬────────┘  └─────────────────┘                   │
│           │                                                  │
└───────────┼──────────────────────────────────────────────────┘
            │ onClick
            ▼
┌─────────────────────────────────────────────────────────────┐
│                    ModeSelector Menu                         │
│  ┌─────────┐  ┌─────────────┐  ┌─────────┐                  │
│  │  Agent  │  │ Supervised  │  │   Ask   │                  │
│  │   ⚡    │  │     🛡️      │  │   💬    │                  │
│  └────┬────┘  └──────┬──────┘  └────┬────┘                  │
└───────┼──────────────┼──────────────┼────────────────────────┘
        │              │              │
        └──────────────┼──────────────┘
                       ▼
┌─────────────────────────────────────────────────────────────┐
│                     chat-mode-store                          │
│  { mode: 'agent' | 'supervised' | 'ask' }                   │
│  { pendingToolCalls: ToolCall[] }                           │
└──────────────────────┬──────────────────────────────────────┘
                       │
        ┌──────────────┼──────────────┐
        ▼              ▼              ▼
┌───────────┐  ┌───────────────┐  ┌───────────┐
│  Agent    │  │  Supervised   │  │    Ask    │
│  Handler  │  │   Handler     │  │  Handler  │
│           │  │               │  │           │
│ execute() │  │ queue() →     │  │ no tools  │
│ immediate │  │ confirm UI    │  │ text only │
└───────────┘  └───────────────┘  └───────────┘
```

## Components and Interfaces

### 1. ChatModeStore (新增)

```typescript
// src/store/chat-mode-store.ts

type ChatMode = 'agent' | 'supervised' | 'ask';

interface PendingToolCall {
  id: string;
  toolName: string;
  args: Record<string, any>;
  timestamp: number;
}

interface ChatModeState {
  mode: ChatMode;
  pendingToolCalls: PendingToolCall[];
}

interface ChatModeStore {
  // State
  state: ChatModeState;
  
  // Actions
  setMode(mode: ChatMode): void;
  addPendingToolCall(call: PendingToolCall): void;
  removePendingToolCall(id: string): void;
  clearPendingToolCalls(): void;
  approveToolCall(id: string): Promise<string>;
  rejectToolCall(id: string): void;
  approveAllToolCalls(): Promise<string[]>;
  rejectAllToolCalls(): void;
  
  // Persistence
  loadFromStorage(): void;
  saveToStorage(): void;
}
```

### 2. ModeSelectorButton (新增)

```typescript
// src/views/chat-input/ModeSelectorButton.tsx

interface ModeSelectorButtonProps {
  // No props needed, reads from store
}

// 显示当前模式图标和名称
// 点击打开模式选择菜单
```

### 3. ToolConfirmationCard (新增)

```typescript
// src/views/ToolConfirmationCard.tsx

interface ToolConfirmationCardProps {
  toolCall: PendingToolCall;
  onApprove: () => void;
  onReject: () => void;
}

// 显示工具名称、参数
// 提供批准/拒绝按钮
```

### 4. 修改现有组件

#### chat-stream-handler.ts
- 在处理 tool_calls 时检查当前模式
- Agent: 直接执行
- Supervised: 添加到 pendingToolCalls，等待确认
- Ask: 不应该收到 tool_calls（API 请求不包含 tools）

#### message-builder.ts
- Ask 模式下不包含 tools 数组
- Ask 模式下修改 system prompt

#### ChatInput.tsx
- 添加 ModeSelectorButton 组件

#### MessageItem.tsx
- 渲染 ToolConfirmationCard（Supervised 模式）

## Data Models

### ChatMode Type
```typescript
type ChatMode = 'agent' | 'supervised' | 'ask';
```

### PendingToolCall
```typescript
interface PendingToolCall {
  id: string;           // 唯一标识
  toolName: string;     // 工具名称
  args: Record<string, any>;  // 工具参数
  timestamp: number;    // 创建时间
  status: 'pending' | 'approved' | 'rejected' | 'executed';
}
```

### Storage Schema
```typescript
// localStorage key: 'ai-chat-mode'
interface StoredModeSettings {
  mode: ChatMode;
  updatedAt: number;
}
```

## Correctness Properties

*A property is a characteristic or behavior that should hold true across all valid executions of a system-essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.*

### Property 1: Mode selection updates store
*For any* mode selection action, the store's mode value should equal the selected mode immediately after the action.
**Validates: Requirements 1.3**

### Property 2: Agent mode auto-execution
*For any* tool call received when mode is 'agent', the tool should be executed immediately without adding to pendingToolCalls.
**Validates: Requirements 1.4, 2.1**

### Property 3: Supervised mode queues for confirmation
*For any* tool call received when mode is 'supervised', the tool should be added to pendingToolCalls and not executed until approved.
**Validates: Requirements 1.5, 3.1**

### Property 4: Ask mode excludes tools
*For any* API request made when mode is 'ask', the tools array should be empty or undefined.
**Validates: Requirements 1.6, 4.1**

### Property 5: Ask mode prompt modification
*For any* API request made when mode is 'ask', the system prompt should contain instructions to only answer questions.
**Validates: Requirements 4.2**

### Property 6: Approval triggers execution
*For any* pending tool call that is approved, the tool should be executed and removed from pendingToolCalls.
**Validates: Requirements 3.3, 7.4**

### Property 7: Rejection skips tool
*For any* pending tool call that is rejected, the tool should not be executed and should be removed from pendingToolCalls with rejected status.
**Validates: Requirements 3.4, 7.5**

### Property 8: Batch operations consistency
*For any* batch approve/reject action on N pending tool calls, exactly N tool calls should be processed.
**Validates: Requirements 3.5**

### Property 9: Mode persistence
*For any* mode change, the new mode should be retrievable from storage after save.
**Validates: Requirements 5.1**

### Property 10: Mode restoration
*For any* stored mode value, loading from storage should set the store's mode to that value.
**Validates: Requirements 5.2**

### Property 11: Tool name formatting
*For any* tool name in snake_case or camelCase, the formatted display name should be human-readable with spaces and proper capitalization.
**Validates: Requirements 7.2**

## Error Handling

### Mode Switch During Pending Calls
- 如果在 Supervised 模式下有待确认的工具调用，切换到其他模式时：
  - 切换到 Agent: 自动批准所有待确认调用
  - 切换到 Ask: 自动拒绝所有待确认调用

### Tool Execution Failure
- Agent 模式: 显示错误，继续对话
- Supervised 模式: 显示错误，从队列移除，继续对话

### Storage Errors
- 读取失败: 使用默认值 (Agent 模式)
- 写入失败: 静默失败，不影响运行时状态

## Testing Strategy

### Unit Tests
- ChatModeStore 的所有方法
- 模式切换逻辑
- 工具调用队列管理
- 存储读写

### Property-Based Tests
使用 fast-check 库进行属性测试：

1. **Mode selection property**: 生成随机模式序列，验证每次选择后状态正确
2. **Tool call routing property**: 生成随机模式和工具调用，验证路由正确
3. **Persistence round-trip property**: 保存后加载应得到相同值
4. **Batch operation property**: 批量操作应处理所有项目

### Integration Tests
- 完整的消息发送流程在各模式下的行为
- UI 组件与 store 的交互
