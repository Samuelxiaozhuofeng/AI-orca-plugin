# Design: 优化工具调用UI与字体排版

## Architecture Overview

此变更涉及两个独立但互补的改进：
1. **工具调用UX优化** - 将技术性的参数/结果展示转换为语义化的状态流
2. **字体排版优化** - 提高信息密度同时保持可读性

两者共同提升 AI Chat Panel 的用户体验和视觉质量。

## Component Architecture

### Current State (Before)

```
MessageItem
├── Content (Markdown)
├── ToolCallItem (可折叠卡片)
│   ├── Header (🔧 toolName + "Click to see args")
│   └── Body (展开后显示 JSON 参数)
└── (separate) ToolResultItem (独立的可折叠卡片)
    ├── Header (✅ Result: toolName)
    └── Body (展开后显示结果文本)
```

**问题：**
- 工具调用和结果是两个独立组件，割裂对话流
- 默认显示技术性提示（"Click to see args"）
- 所有工具使用相同图标（🔧），缺乏语义区分
- 用户看不到执行进度（静态显示）

### Proposed State (After)

```
MessageItem
├── Content (Markdown)
└── ToolExecutionFlow (内联状态流)
    ├── [Loading] ToolStatusIndicator
    │   ├── 动态图标 (✨/🔍/📖 + 动画)
    │   └── 友好文本 ("正在创建..." / "正在搜索...")
    │
    └── [Success] ToolResultSummary
        ├── 静态图标 (✅)
        ├── 结果摘要 ("已创建 / 找到 N 条")
        └── [Optional] Click to Expand (点击展开)
            ├── 低对比度 Code 图标 `</>`
            ├── 查看参数
            └── 查看完整结果
```

**改进：**
- 单一组件管理工具的完整生命周期
- 状态驱动的UI（loading → success → error）
- 语义化图标和文字（用户友好）
- 默认简洁，按需展开（减少噪音）

## Tool Display Configuration System

### Tool Categories

| 类别 | 工具 | 图标 | 动画 | 加载文本 |
|------|------|------|------|----------|
| **创建类** | createBlock, createPage, insertTag | ✨ | sparkle | "正在创建..." |
| **搜索类** | searchBlocksByTag, searchBlocksByText, queryBlocksByTag, searchTasks, searchJournalEntries, searchBlocksByReference | 🔍 | pulse | "正在搜索..." |
| **查询类** | getPage, getTodayJournal, getRecentJournals, query_blocks, get_tag_schema | 📖 | flip | "正在获取..." |

### Configuration Schema

```typescript
// src/utils/tool-display-config.ts

interface ToolDisplayConfig {
  category: 'create' | 'search' | 'query';
  icon: string;           // Emoji 图标
  animation: 'sparkle' | 'pulse' | 'flip';
  loadingText: string;    // "正在XXX..."
  successIcon?: string;   // 默认 ✅
}

const TOOL_CONFIGS: Record<string, ToolDisplayConfig> = {
  createBlock: {
    category: 'create',
    icon: '✨',
    animation: 'sparkle',
    loadingText: '正在创建块...',
  },
  searchBlocksByTag: {
    category: 'search',
    icon: '🔍',
    animation: 'pulse',
    loadingText: '正在搜索标签...',
  },
  // ... 其他工具
};

export function getToolDisplayConfig(toolName: string): ToolDisplayConfig {
  return TOOL_CONFIGS[toolName] || DEFAULT_CONFIG;
}
```

## State Management

### Tool Execution States

**Updated based on Gemini UX review:**

```typescript
type ToolExecutionState =
  | { status: 'loading'; toolName: string; }
  | { status: 'success'; toolName: string; summary: string; details?: any; }
  | { status: 'failed'; toolName: string; error: string; retryable: boolean; }
  | { status: 'cancelled'; toolName: string; reason?: string; };
```

### State Transitions

```
[User Message with tool_calls]
    ↓
[Loading State]  ← ToolStatusIndicator (动画 + "正在XXX...")
    ↓ (streaming)
[Success State]  ← ToolResultSummary ("✅ 已完成 + 摘要")
    ↓ (optional)
[Expanded View]  ← Click `</>` icon → 显示参数和完整结果

OR (error path)
    ↓
[Failed State]   ← Error display + Retry button

OR (user action)
    ↓
[Cancelled State] ← User stopped generation
```

## UI Components Design

### 1. ToolStatusIndicator Component

**Props:**
```typescript
interface ToolStatusIndicatorProps {
  toolName: string;
  status: 'loading' | 'success' | 'failed' | 'cancelled';
  summary?: string;    // 成功时显示的摘要
  error?: string;      // 错误时显示的消息
  retryable?: boolean; // 是否可重试
  onRetry?: () => void; // 重试回调
}
```

**Visual States:**

**Loading State:**
```
┌─────────────────────────────┐
│ ✨ 正在创建块...  (闪烁)   │  ← Pill 形状，极浅灰背景
└─────────────────────────────┘
```

**Success State:**
```
┌──────────────────────────────┐
│ ✅ 已创建新块  [</>]         │  ← 点击 </> 展开详情
└──────────────────────────────┘
```

**Failed State (Gemini review):**
```
┌──────────────────────────────┐
│ ❌ 创建失败: 找不到页面      │
│    [重试]                     │  ← 可点击重试按钮
└──────────────────────────────┘
```

**Cancelled State (Gemini review):**
```
┌──────────────────────────────┐
│ ⏸️ 已取消                    │
└──────────────────────────────┘
```

### 2. Expandable Details (Click Interaction)

**Gemini UX Review - Critical Fix:**
- ❌ Hover 在触屏设备不可用
- ✅ 使用点击交互 + 低对比度视觉提示

**默认（收起）：**
```
✅ 找到 12 条结果  [</>]
                    ↑ 低对比度 Code 图标
```

**点击后：**
```
✅ 找到 12 条结果
   ┌────────────────────┐
   │ 查看搜索参数       │
   │ 查看完整结果       │
   └────────────────────┘
```

点击后弹出模态框或侧边栏显示完整的 JSON 数据。

## Typography Design

### Font System

#### Before:
```css
/* Assistant 消息 */
font-family: "Noto Serif CJK SC", "Source Han Serif SC", Georgia, serif;
font-size: 16px;
line-height: 1.6;

/* User 消息 */
font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
font-size: 16px;
```

#### After:
```css
/* Assistant 消息 - 改用无衬线 */
font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans CJK SC", "Microsoft YaHei", sans-serif;
font-size: 15px;
line-height: 1.5;

/* User 消息 - 保持一致 */
font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
font-size: 15px;
line-height: 1.5;
```

### Layout Density

#### Message Spacing

**Gemini Review - Rhythm over Density:**

| 元素 | Before | After | 变化 | Gemini 建议 |
|------|--------|-------|------|-------------|
| 同一发言人消息间距 | 16px | **4-8px** | -50-75% | 紧凑同组消息 |
| 不同发言人消息间距 | 16px | **24px** | +50% | 清晰区分对话方 |
| Assistant padding | 16px 20px | 14px 18px | -12.5% | 保持 |
| User padding | 12px 16px | 10px 14px | -12.5% | 保持 |

#### Content Elements

| 元素 | Before | After | 变化 |
|------|--------|-------|------|
| Paragraph line-height | 1.8 | 1.6 | -11% |
| List item line-height | 1.8 | 1.6 | -11% |
| Code block font-size | 13px | 12px | -8% |

### Readability Guarantees

**Gemini Review - Letter Spacing Enhancement:**

**最小对比度：**
- 正文文字：WCAG AA 标准（4.5:1）
- 使用 Orca 原生颜色变量（自动适配深色/浅色主题）

**字号下限：**
- 正文不低于 14px（当前 15px 满足）
- 代码块不低于 11px（当前 12px 满足）

**Letter Spacing（关键优化）：**
- 无衬线体在小字号下，增加 `letter-spacing: 0.01em` 提升精致感
- 衬线体通常不需要字间距调整，但无衬线体受益明显

**行长控制：**
- 保持现有的 maxWidth 限制（75% for user, 90% for assistant）
- 防止过长行影响可读性

## Animation Design

### Keyframe Definitions

**Gemini Review - Motion Refinement:**

```css
/* 创建类工具 - 微闪烁动画 (Micro Sparkle) */
@keyframes sparkle {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.7; transform: scale(1.1); }
}

/* 搜索类工具 - 脉动动画 (Pulse - 雷达扫描) */
@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.8; transform: scale(1.08); }
}

/* 查询类工具 - 简化翻页 (Simplified Flip) */
/* Gemini 建议: 避免 180deg 全翻转，改用微小倾斜 */
@keyframes flip {
  0% { transform: rotateY(0deg); }
  50% { transform: rotateY(20deg); }  /* 仅 20deg，不是 180deg */
  100% { transform: rotateY(0deg); }
}

/* 备选方案 - Shimmer (如果 flip 性能不佳) */
@keyframes shimmer {
  0% { opacity: 0.6; }
  50% { opacity: 1; }
  100% { opacity: 0.6; }
}
```

### Performance Considerations

**Gemini Review - Motion Best Practices:**

- 使用 CSS transform 而非 position（GPU 加速）
- 限制动画元素数量（仅工具图标）
- **动画周期**: 1.5-2s（Gemini 建议，避免焦虑感）
- **Easing**: `ease-in-out`（柔和自然）
- 使用 `will-change: transform` 提示浏览器优化
- **关键**: 工具执行完成后，动画必须立即停止（变为静态图标）

## Integration Points

### 1. Message Builder Integration

**Current:**
```typescript
// src/services/message-builder.ts
// 构建消息时添加 tool_calls 到 message 对象
message.tool_calls = [...];
```

**No Change Required:**
- 消息构建逻辑不变
- 仅改变渲染逻辑（View 层）

### 2. Stream Handler Integration

**Current:**
```typescript
// src/services/chat-stream-handler.ts
yield { type: 'tool_calls', toolCalls };
```

**Enhancement:**
```typescript
// 添加工具状态到 stream chunk
yield {
  type: 'tool_status',
  toolName: toolCalls[0].function.name,
  status: 'loading'
};
```

**或保持不变：**
- View 层根据 tool_calls 的存在判断状态
- 工具调用时自动显示 loading 状态
- 收到 tool result 时自动转换为 success 状态

### 3. AI Tools Execution Integration

**Current:**
```typescript
// src/services/ai-tools.ts
export async function executeTool(toolName, args) {
  // 执行工具逻辑
  return result;
}
```

**No Change Required:**
- 工具执行逻辑不变
- 结果摘要生成在 View 层（基于 result 自动提取）

## Error Handling

### Tool Execution Errors

**Before:**
```
✅ Result: createBlock
[展开] Error: Page not found
```

**After:**
```
❌ 创建失败：找不到页面
   [hover: 查看详细错误信息]
```

### Fallback Strategies

1. **未知工具类型** → 使用默认配置（🔧 + "正在执行..."）
2. **动画不支持** → 降级为静态图标
3. **结果摘要生成失败** → 显示完整结果（简化版）

## Migration Strategy

### Phase 1: Non-Breaking Changes
1. 新增 ToolStatusIndicator 组件（不影响现有代码）
2. 新增 tool-display-config.ts（独立模块）
3. 新增 CSS 动画（不影响现有样式）

### Phase 2: View Layer Refactor
1. 重构 MessageItem.tsx（仅影响渲染逻辑）
2. 保持 Message 数据结构不变
3. 保持向后兼容（旧消息正常渲染）

### Phase 3: Typography Updates
1. 更新 CSS 变量和样式
2. 测试并微调
3. 一次性部署（视觉变更）

## Testing Strategy

### Unit Tests
- `getToolDisplayConfig()` 函数测试
- ToolStatusIndicator 组件不同状态渲染测试

### Visual Regression Tests
- 截图对比（before/after）
- 不同主题下的渲染测试

### User Acceptance Tests
- 真实对话场景测试
- 可读性主观评估
- 动画性能测试

## Performance Impact

**预期影响：**
- **CPU**: 微小增加（CSS 动画，GPU 加速）
- **内存**: 无显著影响
- **渲染**: 略微提升（减少 DOM 节点，合并卡片）

**监控指标：**
- 消息渲染时间（应保持 < 16ms）
- 动画帧率（应保持 60fps）
- 滚动性能（无卡顿）

## Rollback Plan

**如果出现问题：**
1. **视觉问题** → 回滚 CSS 变更（保留组件重构）
2. **性能问题** → 禁用动画（仅保留静态图标）
3. **兼容性问题** → 回滚整个变更（通过 git revert）

**回滚触发条件：**
- 用户反馈可读性显著下降
- 性能监控显示帧率低于 30fps
- 出现严重的渲染 bug

---

## Gemini UX Review Summary

### ✅ Approved Recommendations (Integrated)

1. **Click Interaction over Hover** - 添加低对比度 `</>` 图标，点击展开技术细节（解决触屏兼容性）
2. **Additional States** - 新增 `failed` (with retry) 和 `cancelled` 状态
3. **Letter Spacing** - 无衬线体增加 `0.01em` 间距提升精致感
4. **Message Rhythm** - 同发言人 4-8px，不同发言人 24px（节奏感优于单纯密度）
5. **Animation Refinement** - 周期 1.5-2s，ease-in-out，简化 flip 为 20deg 倾斜
6. **Visual Design** - Pill 形状 + 极浅灰背景 + 次级文本色

### 🔄 Partially Adopted

1. **📖 Icon** - 保留书本图标（隐喻"查阅档案"），但标注为可调整
2. **Flip Animation** - 先用简化版（20deg），性能测试后决定是否改用 Shimmer

### 💡 Future Enhancements (Not in This Proposal)

1. **Contextual Accent Colors** - 成功用绿色微光，搜索用品牌色（Phase 2）
2. **Continuous Tool Folding** - 连续工具调用折叠在 "Processing..." 容器（Phase 3）
3. **Adaptive Typography** - 响应式字号调整（小屏 +1px，大屏行高 +0.1）

### 📊 Design Quality Assessment

**Gemini Rating**: ⭐⭐⭐⭐⭐ (5/5)
- ✅ De-technicalization (去技术化)
- ✅ Densification (高密度化)
- ✅ Progressive Disclosure (渐进式披露)
- ✅ Accessibility (可访问性)
- ✅ Motion Best Practices (动效最佳实践)

**Approval**: **批准执行**，优先解决点击交互和状态完整性问题。
