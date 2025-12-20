# UI_REFACTOR.md

> **作为高级前端设计师**，请基于以下需求和参考设计，为 Orca Note AI Chat Plugin 制定一套全面的 UI/UX 重构方案。

---

## 📋 项目背景

### 当前状态分析

**技术栈**：
- React (通过 `window.React` 访问，无 JSX，使用 `createElement`)
- Valtio (响应式状态管理)
- Orca Components (宿主提供的 UI 组件库)
- 主题系统：`--orca-color-*` CSS 变量

**现有文件结构**：
```
src/views/AiChatPanel.tsx      # 主聊天面板（533行）
src/views/ChatInput.tsx         # 输入组件（167行）
src/views/ContextChips.tsx      # Context 标签显示
src/views/ContextPicker.tsx     # Context 选择器
src/store/context-store.ts      # Context 状态管理
```

**核心问题**：
1. ❌ **UI 简陋**：仅使用基础布局和边框，缺乏视觉层次和现代设计感
2. ❌ **消息渲染粗糙**：AI 返回内容为纯文本展示（`whiteSpace: "pre-wrap"`），无 Markdown 渲染
3. ❌ **缺少排版美化**：无字体优化、行高优化、代码高亮等
4. ❌ **缺少动画和交互反馈**：无加载状态、打字机效果、滚动动画等
5. ❌ **缺少内容渲染适配**：无法处理粗体、标题、列表、引用、代码块等 Markdown 元素
6. ❌ **缺少可读性优化**：无颜色高亮、字体切换、沉浸式阅读模式等

---

## 🎯 重构目标

### 核心设计原则
1. **沉浸式阅读体验**：参考微信读书、Gemini 沉浸式阅读伴侣的设计理念
2. **渐进式增强**：保持基础功能的同时，逐步增强视觉和交互体验
3. **主题兼容性**：必须完全依赖 Orca 的 `--orca-color-*` 变量，适配明暗主题
4. **无外部依赖**：不引入额外库，使用 vanilla JS 和 CSS 实现所有效果
5. **性能优先**：渲染优化，避免不必要的重渲染和 DOM 操作

---

## 📚 参考设计分析

### 来自 `chatpanel_ui_suggestion.md` 的关键设计模式

#### 1. **变量驱动的主题系统** (Lines 58-76)
```css
:root {
    --w-bg: #fff;
    --w-text: #333;
    --w-font: "Source Han Serif SC", serif;
    --w-accent-bg: #fff;
    --w-accent-text: #333;
    --w-input-bg: #fff;
    --w-pub-high: rgba(255, 235, 59, 0.6);  /* 高亮背景 */
    --w-pub-accent: #fbe204;                /* 强调色 */
}
```
**应用建议**：
- 定义一套 AI Chat 专用的 CSS 变量，映射到 `--orca-color-*`
- 支持主题切换：白底、米黄底、护眼绿、深色模式

#### 2. **Markdown 渲染增强** (Lines 157-161, 224-257)
```css
/* 粗体恢复标准权重 */
.model-response-text strong {
    font-weight: bold !important;
    color: inherit !important;
}

/* 公众号风格：半覆盖高亮 */
body[data-pub-type="half"] .model-response-text strong {
    background: linear-gradient(to bottom, transparent 55%, var(--w-pub-high) 0) !important;
}

/* 标题设计：左边框 + 渐变背景 */
.model-response-text h2 {
    border-left: 5px solid var(--w-pub-accent) !important;
    background: linear-gradient(to right, rgba(0,0,0,0.03), transparent) !important;
    padding: 10px 15px !important;
    border-radius: 0 8px 8px 0 !important;
}
```
**应用建议**：
- 实现 Markdown 解析器（轻量级，支持 `**粗体**`、`# 标题`、`- 列表`、`` `代码` ``、```代码块```）
- 为不同元素设计视觉层次

#### 3. **文本清洗引擎** (Lines 525-577)
```javascript
function cleanAndRenderText(rootNode) {
    // 1. 清洗模式：剔除已加粗元素中的"幽灵星号"
    const boldElements = rootNode.querySelectorAll('b, strong');
    boldElements.forEach(el => {
        const text = el.textContent;
        if (text.startsWith('**') && text.endsWith('**')) {
            el.textContent = text.slice(2, -2);
        }
    });

    // 2. 渲染模式：查找纯文本中的 Markdown 并转换
    const parts = text.split(/(\*\*[\s\S]+?\*\*)/g);
    parts.forEach(part => {
        if (part.startsWith('**') && part.endsWith('**')) {
            const b = document.createElement('b');
            b.textContent = part.slice(2, -2);
            fragment.appendChild(b);
        } else {
            fragment.appendChild(document.createTextNode(part));
        }
    });
}
```
**应用建议**：
- 实现流式渲染中的 Markdown 实时解析
- 避免重复渲染和 DOM 抖动

#### 4. **动画和过渡** (Lines 170-177, 260-301)
```css
/* 布局过渡 */
main {
    transition: padding-right 0.4s cubic-bezier(0.2, 0, 0, 1) !important;
}

/* 目录面板滑入 */
#wx-toc-panel {
    right: -320px;
    transition: right 0.4s cubic-bezier(0.19, 1, 0.22, 1);
}
#wx-toc-panel.active {
    right: 20px;
}

/* 淡入动画 */
@keyframes fadeIn {
    from { opacity:0; transform:translateY(-5px); }
    to { opacity:1; transform:translateY(0); }
}
```
**应用建议**：
- 消息出现时的淡入动画
- 打字机效果（流式渲染）
- 滚动平滑处理

#### 5. **滚动优化** (Lines 458-514)
```javascript
// 智能滚动容器探测器
function findScrollableParent(element) {
    let parent = element.parentElement;
    while (parent) {
        const style = window.getComputedStyle(parent);
        if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
            return parent;
        }
        parent = parent.parentElement;
    }
    return document.scrollingElement || document.body;
}

// 丝滑极速滚动算法
function fastSmoothScroll(element, offset = 80) {
    const container = findScrollableParent(element);
    const targetScroll = currentScroll + distance;
    // 使用 requestAnimationFrame + easing 实现平滑滚动
}
```
**应用建议**：
- 自动滚动到最新消息
- 优化滚动性能

#### 6. **输入框美化** (Lines 104-120)
```css
.input-area {
    border-radius: 32px !important;
    background-color: var(--w-input-bg) !important;
    border: 1px solid rgba(0,0,0,0.08) !important;
    box-shadow: 0 4px 12px rgba(0,0,0,0.03) !important;
    backdrop-filter: blur(10px) !important;  /* 毛玻璃效果 */
}
```
**应用建议**：
- 圆角设计
- 阴影和边框优化
- 可选毛玻璃效果

---

## 🎨 详细设计方案

### 阶段 1：基础视觉优化（高优先级）

#### 1.1 消息气泡重设计
**当前问题**：
```typescript
// src/views/AiChatPanel.tsx:616-631
createElement("div", {
    style: {
        maxWidth: "85%",
        padding: "8px 12px",
        borderRadius: 10,
        border: "1px solid var(--orca-color-border)",
        background: m.role === "user" ? "var(--orca-color-bg-2)" : "var(--orca-color-bg-1)",
        whiteSpace: "pre-wrap",  // ❌ 简陋的文本显示
        wordBreak: "break-word",
    },
}, m.content || "")
```

**改进方案**：
```typescript
// 用户消息：右对齐，蓝色/主题色气泡
const userBubbleStyle = {
    maxWidth: "75%",
    padding: "12px 16px",
    borderRadius: "18px 18px 4px 18px",  // 右下角尖角
    background: "var(--orca-color-primary, #007bff)",
    color: "#fff",
    boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
    fontSize: "15px",
    lineHeight: "1.6",
};

// AI 消息：左对齐，白色/浅灰气泡
const assistantBubbleStyle = {
    maxWidth: "90%",  // AI 消息允许更宽
    padding: "16px 20px",
    borderRadius: "18px 18px 18px 4px",  // 左下角尖角
    background: "var(--orca-color-bg-2)",
    border: "1px solid var(--orca-color-border)",
    boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
    fontSize: "16px",
    lineHeight: "1.8",
};
```

#### 1.2 字体和排版优化
```typescript
// 定义字体栈（无需外部加载）
const fontStacks = {
    sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans CJK SC", "Microsoft YaHei", sans-serif',
    serif: '"Noto Serif CJK SC", "Source Han Serif SC", "Songti SC", Georgia, serif',
    mono: '"JetBrains Mono", "Fira Code", Consolas, "Courier New", monospace',
};

// 应用到消息区域
const messageTextStyle = {
    fontFamily: fontStacks.serif,  // 默认使用衬线体提升可读性
    fontSize: "16px",
    lineHeight: "1.8",
    letterSpacing: "0.02em",
    color: "var(--orca-color-text-1)",
};
```

#### 1.3 输入框重设计
```typescript
// src/views/ChatInput.tsx:86-93
const inputContainerStyle = {
    padding: "16px",
    borderTop: "1px solid var(--orca-color-border)",
    background: "var(--orca-color-bg-1)",
    backdropFilter: "blur(10px)",  // 毛玻璃效果（如果支持）
};

const textareaWrapperStyle = {
    display: "flex",
    gap: "12px",
    alignItems: "flex-end",
    background: "var(--orca-color-bg-2)",
    borderRadius: "24px",  // 更圆润
    padding: "12px 16px",
    border: "1px solid var(--orca-color-border)",
    boxShadow: "0 2px 8px rgba(0,0,0,0.04)",
    transition: "all 0.2s ease",
};

// 聚焦时增强效果
const textareaWrapperFocusStyle = {
    border: "1px solid var(--orca-color-primary, #007bff)",
    boxShadow: "0 4px 12px rgba(0,123,255,0.12)",
};
```

---

### 阶段 2：Markdown 渲染引擎（核心功能）

#### 2.1 轻量级 Markdown 解析器
**需要支持的语法**：
```markdown
# 一级标题
## 二级标题
### 三级标题

**粗体文本**
*斜体文本*

- 无序列表项
1. 有序列表项

> 引用块

`行内代码`

```语言
代码块
```

[链接文本](url)
```

**实现思路**：
```typescript
// src/utils/markdown-renderer.ts (新建文件)

interface MarkdownNode {
    type: 'text' | 'bold' | 'italic' | 'code' | 'heading' | 'list' | 'quote' | 'codeblock' | 'link';
    content: string;
    level?: number;  // 用于标题
    language?: string;  // 用于代码块
    children?: MarkdownNode[];
}

/**
 * 简化版 Markdown 解析器（逐行解析）
 */
export function parseMarkdown(text: string): MarkdownNode[] {
    const lines = text.split('\n');
    const nodes: MarkdownNode[] = [];
    let inCodeBlock = false;
    let codeBlockLines: string[] = [];
    let codeBlockLang = '';

    for (const line of lines) {
        // 代码块检测
        if (line.startsWith('```')) {
            if (inCodeBlock) {
                // 结束代码块
                nodes.push({
                    type: 'codeblock',
                    content: codeBlockLines.join('\n'),
                    language: codeBlockLang,
                });
                inCodeBlock = false;
                codeBlockLines = [];
                codeBlockLang = '';
            } else {
                // 开始代码块
                inCodeBlock = true;
                codeBlockLang = line.slice(3).trim();
            }
            continue;
        }

        if (inCodeBlock) {
            codeBlockLines.push(line);
            continue;
        }

        // 标题检测
        const headingMatch = line.match(/^(#{1,3})\s+(.+)$/);
        if (headingMatch) {
            nodes.push({
                type: 'heading',
                level: headingMatch[1].length,
                content: headingMatch[2],
            });
            continue;
        }

        // 引用检测
        if (line.startsWith('> ')) {
            nodes.push({
                type: 'quote',
                content: line.slice(2),
            });
            continue;
        }

        // 列表检测
        if (line.match(/^[\-\*]\s+/) || line.match(/^\d+\.\s+/)) {
            nodes.push({
                type: 'list',
                content: line,
            });
            continue;
        }

        // 普通段落（内联元素解析）
        nodes.push({
            type: 'text',
            content: line,
            children: parseInlineMarkdown(line),
        });
    }

    return nodes;
}

/**
 * 解析内联元素（粗体、斜体、代码、链接）
 */
function parseInlineMarkdown(text: string): MarkdownNode[] {
    const nodes: MarkdownNode[] = [];
    const regex = /(\*\*[^\*]+\*\*)|(\*[^\*]+\*)|(`[^`]+`)|(\[([^\]]+)\]\(([^\)]+)\))/g;
    let lastIndex = 0;
    let match;

    while ((match = regex.exec(text)) !== null) {
        // 添加前面的普通文本
        if (match.index > lastIndex) {
            nodes.push({
                type: 'text',
                content: text.slice(lastIndex, match.index),
            });
        }

        // 处理匹配的元素
        if (match[1]) {
            // **粗体**
            nodes.push({
                type: 'bold',
                content: match[1].slice(2, -2),
            });
        } else if (match[2]) {
            // *斜体*
            nodes.push({
                type: 'italic',
                content: match[2].slice(1, -1),
            });
        } else if (match[3]) {
            // `代码`
            nodes.push({
                type: 'code',
                content: match[3].slice(1, -1),
            });
        } else if (match[4]) {
            // [链接](url)
            nodes.push({
                type: 'link',
                content: match[5],
                // url: match[6]  // 暂不实现跳转
            });
        }

        lastIndex = regex.lastIndex;
    }

    // 添加剩余的普通文本
    if (lastIndex < text.length) {
        nodes.push({
            type: 'text',
            content: text.slice(lastIndex),
        });
    }

    return nodes;
}
```

#### 2.2 React 渲染器
```typescript
// src/components/MarkdownMessage.tsx (新建文件)

import { parseMarkdown, type MarkdownNode } from '../utils/markdown-renderer';

const React = window.React as any;
const { createElement, useMemo } = React;

interface Props {
    content: string;
    role: 'user' | 'assistant';
}

/**
 * 渲染 Markdown 节点为 React 元素
 */
function renderNode(node: MarkdownNode, index: number): any {
    switch (node.type) {
        case 'heading':
            const HeadingTag = `h${node.level}` as any;
            return createElement(
                HeadingTag,
                {
                    key: index,
                    style: {
                        marginTop: node.level === 1 ? '24px' : '20px',
                        marginBottom: '12px',
                        fontWeight: 'bold',
                        fontSize: node.level === 1 ? '24px' : node.level === 2 ? '20px' : '18px',
                        lineHeight: '1.4',
                        borderLeft: `4px solid var(--orca-color-primary, #007bff)`,
                        paddingLeft: '12px',
                        background: 'linear-gradient(to right, rgba(0,123,255,0.05), transparent)',
                        borderRadius: '0 8px 8px 0',
                    },
                },
                node.content
            );

        case 'bold':
            return createElement(
                'strong',
                {
                    key: index,
                    style: {
                        fontWeight: 'bold',
                        background: 'linear-gradient(to bottom, transparent 60%, rgba(255,235,59,0.5) 0)',
                        padding: '0 2px',
                    },
                },
                node.content
            );

        case 'italic':
            return createElement('em', { key: index, style: { fontStyle: 'italic' } }, node.content);

        case 'code':
            return createElement(
                'code',
                {
                    key: index,
                    style: {
                        fontFamily: '"JetBrains Mono", Consolas, monospace',
                        background: 'var(--orca-color-bg-3)',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        fontSize: '0.9em',
                        border: '1px solid var(--orca-color-border)',
                    },
                },
                node.content
            );

        case 'codeblock':
            return createElement(
                'pre',
                {
                    key: index,
                    style: {
                        background: 'var(--orca-color-bg-3)',
                        padding: '16px',
                        borderRadius: '12px',
                        overflow: 'auto',
                        border: '1px solid var(--orca-color-border)',
                        marginTop: '12px',
                        marginBottom: '12px',
                    },
                },
                createElement(
                    'code',
                    {
                        style: {
                            fontFamily: '"JetBrains Mono", Consolas, monospace',
                            fontSize: '14px',
                            lineHeight: '1.5',
                            color: 'var(--orca-color-text-1)',
                        },
                    },
                    node.content
                )
            );

        case 'quote':
            return createElement(
                'blockquote',
                {
                    key: index,
                    style: {
                        borderLeft: '4px solid var(--orca-color-border)',
                        paddingLeft: '16px',
                        marginLeft: 0,
                        marginTop: '12px',
                        marginBottom: '12px',
                        fontStyle: 'italic',
                        color: 'var(--orca-color-text-2)',
                        background: 'var(--orca-color-bg-2)',
                        padding: '12px 16px',
                        borderRadius: '8px',
                    },
                },
                node.content
            );

        case 'list':
            return createElement(
                'li',
                {
                    key: index,
                    style: {
                        marginLeft: '20px',
                        marginTop: '6px',
                        lineHeight: '1.8',
                    },
                },
                node.content.replace(/^[\-\*\d\.]\s+/, '')
            );

        case 'text':
            if (node.children && node.children.length > 0) {
                return createElement(
                    'p',
                    {
                        key: index,
                        style: {
                            marginTop: '8px',
                            marginBottom: '8px',
                            lineHeight: '1.8',
                        },
                    },
                    ...node.children.map((child, i) => renderNode(child, i))
                );
            }
            return createElement('p', { key: index, style: { marginTop: '8px', marginBottom: '8px' } }, node.content);

        default:
            return null;
    }
}

export default function MarkdownMessage({ content, role }: Props) {
    const nodes = useMemo(() => parseMarkdown(content), [content]);

    return createElement(
        'div',
        {
            style: {
                fontFamily:
                    role === 'assistant'
                        ? '"Noto Serif CJK SC", "Source Han Serif SC", Georgia, serif'
                        : '-apple-system, sans-serif',
                fontSize: '16px',
                color: role === 'user' ? '#fff' : 'var(--orca-color-text-1)',
            },
        },
        ...nodes.map((node, index) => renderNode(node, index))
    );
}
```

#### 2.3 集成到 AiChatPanel
```typescript
// src/views/AiChatPanel.tsx (修改 Lines 600-653)

import MarkdownMessage from '../components/MarkdownMessage';

// 在消息渲染部分替换：
createElement(
    "div",
    {
        style: {
            maxWidth: m.role === "user" ? "75%" : "90%",
            padding: m.role === "user" ? "12px 16px" : "16px 20px",
            borderRadius: m.role === "user" ? "18px 18px 4px 18px" : "18px 18px 18px 4px",
            background: m.role === "user"
                ? "var(--orca-color-primary, #007bff)"
                : "var(--orca-color-bg-2)",
            color: m.role === "user" ? "#fff" : "var(--orca-color-text-1)",
            border: m.role === "assistant" ? "1px solid var(--orca-color-border)" : "none",
            boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
        },
    },
    // 使用 MarkdownMessage 组件替换纯文本
    createElement(MarkdownMessage, {
        content: m.content || "",
        role: m.role,
    }),
    // 工具调用提示（保留）
    m.tool_calls && m.tool_calls.length > 0 ? /* ... */ : null
)
```

---

### 阶段 3：动画和交互增强（中优先级）

#### 3.1 消息淡入动画
```typescript
// src/views/AiChatPanel.tsx

// 添加 CSS-in-JS 动画
const fadeInKeyframes = `
@keyframes messageSlideIn {
    from {
        opacity: 0;
        transform: translateY(10px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}
`;

// 在消息气泡样式中添加：
const messageBubbleStyle = {
    // ... 其他样式
    animation: 'messageSlideIn 0.3s ease-out',
};
```

#### 3.2 打字机效果（流式渲染优化）
```typescript
// src/views/AiChatPanel.tsx (Lines 316-323)

// 当前实现：直接替换整个 content
setMessages((prev: Message[]) =>
    prev.map((m: Message) =>
        m.id === assistantId ? { ...m, content: currentContent } : m,
    ),
);

// 优化方案：添加打字机光标
const assistantMessageStyle = {
    // ... 其他样式
    position: 'relative',
};

// 为正在输入的消息添加光标
const typingCursorStyle = {
    display: 'inline-block',
    width: '2px',
    height: '1em',
    background: 'var(--orca-color-primary, #007bff)',
    marginLeft: '2px',
    animation: 'blink 1s step-end infinite',
};

const blinkKeyframes = `
@keyframes blink {
    0%, 50% { opacity: 1; }
    51%, 100% { opacity: 0; }
}
`;

// 在流式渲染的消息末尾添加光标
if (sending && m.id === currentStreamingMessageId) {
    content += createElement('span', { style: typingCursorStyle });
}
```

#### 3.3 自动滚动优化
```typescript
// src/views/AiChatPanel.tsx (Lines 86-90)

// 当前实现：简单的 scrollTop
function scrollToBottom() {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
}

// 优化方案：平滑滚动
function smoothScrollToBottom(duration = 300) {
    const el = listRef.current;
    if (!el) return;

    const start = el.scrollTop;
    const target = el.scrollHeight - el.clientHeight;
    const distance = target - start;
    let startTime: number | null = null;

    function animation(currentTime: number) {
        if (startTime === null) startTime = currentTime;
        const timeElapsed = currentTime - startTime;
        const progress = Math.min(timeElapsed / duration, 1);

        // Easing function (easeOutCubic)
        const ease = 1 - Math.pow(1 - progress, 3);

        el.scrollTop = start + distance * ease;

        if (progress < 1) {
            requestAnimationFrame(animation);
        }
    }

    requestAnimationFrame(animation);
}
```

#### 3.4 加载状态动画
```typescript
// 在等待 AI 响应时显示加载动画
const LoadingDots = () => {
    const dotStyle = {
        display: 'inline-block',
        width: '8px',
        height: '8px',
        borderRadius: '50%',
        background: 'var(--orca-color-text-3)',
        margin: '0 4px',
        animation: 'loadingDots 1.4s infinite ease-in-out',
    };

    const loadingKeyframes = `
    @keyframes loadingDots {
        0%, 80%, 100% { transform: scale(0); opacity: 0.3; }
        40% { transform: scale(1); opacity: 1; }
    }
    `;

    return createElement(
        'div',
        { style: { padding: '12px', display: 'flex', alignItems: 'center', gap: '4px' } },
        createElement('span', { style: { ...dotStyle, animationDelay: '0s' } }),
        createElement('span', { style: { ...dotStyle, animationDelay: '0.2s' } }),
        createElement('span', { style: { ...dotStyle, animationDelay: '0.4s' } })
    );
};

// 在 messages 渲染中使用：
if (sending && messages[messages.length - 1]?.role === 'user') {
    // 显示加载动画
    messagesElements.push(createElement(LoadingDots, { key: 'loading' }));
}
```

---

### 阶段 4：高级功能（低优先级）

#### 4.1 代码高亮（可选）
**方案 1：简单颜色区分**（推荐，无需外部库）
```typescript
// 简单的关键字高亮
function highlightCodeSimple(code: string, language: string): string {
    const keywords = {
        javascript: ['const', 'let', 'var', 'function', 'return', 'if', 'else', 'for', 'while'],
        python: ['def', 'class', 'import', 'from', 'return', 'if', 'else', 'for', 'while'],
        // 其他语言...
    };

    const langKeywords = keywords[language as keyof typeof keywords] || [];
    const regex = new RegExp(`\\b(${langKeywords.join('|')})\\b`, 'g');

    return code.replace(regex, '<span style="color: var(--orca-color-primary);">$1</span>');
}
```

**方案 2：集成 Prism.js 或 Highlight.js**（如果允许外部依赖）

#### 4.2 主题切换（参考 chatpanel_ui_suggestion.md）
```typescript
// src/settings/ai-chat-settings.ts (添加到 settings schema)

export const AI_CHAT_THEME_SETTINGS = {
    chatTheme: {
        type: 'select' as const,
        label: 'Chat Theme',
        default: 'auto',
        options: [
            { value: 'auto', label: 'Follow Orca Theme' },
            { value: 'light', label: 'Light' },
            { value: 'yellow', label: 'Warm Yellow (Eye Care)' },
            { value: 'green', label: 'Green (Eye Care)' },
            { value: 'dark', label: 'Dark' },
        ],
    },
    fontStyle: {
        type: 'select' as const,
        label: 'Font Style',
        default: 'serif',
        options: [
            { value: 'sans', label: 'Sans-serif' },
            { value: 'serif', label: 'Serif (Better Readability)' },
        ],
    },
    fontSize: {
        type: 'number' as const,
        label: 'Font Size (px)',
        default: 16,
        min: 12,
        max: 24,
    },
};

// 应用主题
const themes = {
    light: {
        '--chat-bg': '#ffffff',
        '--chat-text': '#333333',
        '--chat-bubble-user': '#007bff',
        '--chat-bubble-ai': '#f5f5f5',
    },
    yellow: {
        '--chat-bg': '#f6f1e7',
        '--chat-text': '#5b4636',
        '--chat-bubble-user': '#8b7355',
        '--chat-bubble-ai': '#ffffff',
    },
    green: {
        '--chat-bg': '#cce8cf',
        '--chat-text': '#222222',
        '--chat-bubble-user': '#4caf50',
        '--chat-bubble-ai': '#ffffff',
    },
    dark: {
        '--chat-bg': '#1a1a1a',
        '--chat-text': '#e0e0e0',
        '--chat-bubble-user': '#1e88e5',
        '--chat-bubble-ai': '#2d2d2d',
    },
};

function applyTheme(themeName: string) {
    const theme = themes[themeName as keyof typeof themes];
    if (!theme) return;

    const root = document.documentElement;
    Object.entries(theme).forEach(([key, value]) => {
        root.style.setProperty(key, value);
    });
}
```

#### 4.3 消息操作（复制、重新生成、导出）
```typescript
// 在每条消息气泡上添加悬停操作栏
const MessageActions = ({ message }: { message: Message }) => {
    return createElement(
        'div',
        {
            style: {
                position: 'absolute',
                top: '-30px',
                right: '0',
                display: 'flex',
                gap: '4px',
                opacity: 0,
                transition: 'opacity 0.2s',
                // 通过父元素 hover 控制显示
            },
            className: 'message-actions',
        },
        createElement(
            Button,
            {
                variant: 'plain',
                size: 'small',
                onClick: () => navigator.clipboard.writeText(message.content),
            },
            createElement('i', { className: 'ti ti-copy' })
        ),
        message.role === 'assistant'
            ? createElement(
                  Button,
                  {
                      variant: 'plain',
                      size: 'small',
                      onClick: () => regenerateMessage(message.id),
                  },
                  createElement('i', { className: 'ti ti-refresh' })
              )
            : null
    );
};

// 气泡容器样式添加：
const bubbleContainerStyle = {
    position: 'relative',
};

// CSS hover 效果
const bubbleHoverCSS = `
.message-bubble:hover .message-actions {
    opacity: 1;
}
`;
```

#### 4.4 沉浸式阅读模式
```typescript
// 添加全屏阅读模式按钮
const FullscreenReadingMode = () => {
    const [isFullscreen, setIsFullscreen] = useState(false);

    const toggleFullscreen = () => {
        setIsFullscreen(!isFullscreen);
        // 隐藏 header、input、context pane
        // 只显示消息列表，宽度限制为 800px 居中
    };

    const fullscreenStyles = {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'var(--chat-bg, var(--orca-color-bg-1))',
        zIndex: 9999,
        padding: '40px',
        overflow: 'auto',
    };

    const contentStyles = {
        maxWidth: '800px',
        margin: '0 auto',
    };

    return createElement(
        Button,
        {
            variant: 'plain',
            onClick: toggleFullscreen,
            title: 'Fullscreen Reading Mode',
        },
        createElement('i', { className: 'ti ti-maximize' })
    );
};
```

---

## 🚀 实施计划

### 优先级排序
1. **P0 (必须)** - 基础视觉优化 (阶段 1)
   - 消息气泡重设计
   - 字体和排版优化
   - 输入框美化

2. **P0 (必须)** - Markdown 渲染 (阶段 2)
   - 解析器实现
   - React 渲染器
   - 集成到 AiChatPanel

3. **P1 (重要)** - 动画和交互 (阶段 3)
   - 消息淡入动画
   - 打字机效果
   - 自动滚动优化
   - 加载状态

4. **P2 (可选)** - 高级功能 (阶段 4)
   - 代码高亮
   - 主题切换
   - 消息操作
   - 沉浸式阅读模式

### 实施步骤
1. **Step 1**：创建 `src/utils/markdown-renderer.ts` 和 `src/components/MarkdownMessage.tsx`
2. **Step 2**：重构 `src/views/AiChatPanel.tsx` 的消息渲染部分
3. **Step 3**：优化 `src/views/ChatInput.tsx` 样式
4. **Step 4**：添加动画和交互效果
5. **Step 5**：测试和优化性能
6. **Step 6**：（可选）添加高级功能

### 性能优化建议
1. **虚拟化长列表**：如果消息超过 100 条，使用 `react-window` 或手动实现虚拟滚动
2. **Memo 化组件**：使用 `React.memo` 避免不必要的重渲染
3. **防抖滚动**：避免频繁触发滚动事件
4. **流式渲染优化**：避免每次更新都重新解析整个 Markdown

---

## 📝 设计规范

### 颜色系统
```typescript
// 依赖 Orca 主题变量
const colors = {
    primary: 'var(--orca-color-primary, #007bff)',
    bg1: 'var(--orca-color-bg-1)',
    bg2: 'var(--orca-color-bg-2)',
    bg3: 'var(--orca-color-bg-3)',
    text1: 'var(--orca-color-text-1)',
    text2: 'var(--orca-color-text-2)',
    text3: 'var(--orca-color-text-3)',
    border: 'var(--orca-color-border)',
    highlight: 'rgba(255, 235, 59, 0.5)',  // 高亮背景（粗体）
};
```

### 间距系统
```typescript
const spacing = {
    xs: '4px',
    sm: '8px',
    md: '12px',
    lg: '16px',
    xl: '24px',
    xxl: '32px',
};
```

### 圆角系统
```typescript
const borderRadius = {
    sm: '4px',
    md: '8px',
    lg: '12px',
    xl: '18px',
    pill: '24px',
};
```

### 阴影系统
```typescript
const shadows = {
    sm: '0 1px 4px rgba(0,0,0,0.04)',
    md: '0 2px 8px rgba(0,0,0,0.08)',
    lg: '0 4px 12px rgba(0,0,0,0.12)',
};
```

---

## 🎯 成功指标

### 视觉效果
- [ ] 消息气泡具有明确的视觉层次和对齐方式
- [ ] 字体、行高、间距符合可读性标准
- [ ] 明暗主题下颜色对比度达标（WCAG AA）

### Markdown 渲染
- [ ] 正确渲染所有基础 Markdown 语法
- [ ] 粗体使用半覆盖高亮效果
- [ ] 标题使用左边框 + 渐变背景
- [ ] 代码块具有良好的可读性

### 性能
- [ ] 100 条消息下滚动流畅（60fps）
- [ ] 流式渲染无明显卡顿
- [ ] 首屏渲染时间 < 100ms

### 用户体验
- [ ] 打字机效果自然流畅
- [ ] 自动滚动平滑无跳跃
- [ ] 加载状态清晰可见
- [ ] 支持键盘快捷键（Enter 发送，Shift+Enter 换行）

---

## 📚 参考资源

1. **设计参考**：
   - Gemini 沉浸式阅读伴侣脚本 (chatpanel_ui_suggestion.md)
   - 微信读书阅读界面
   - ChatGPT / Claude.ai 聊天界面

2. **技术文档**：
   - Orca Plugin API: `src/orca.d.ts`
   - React without JSX: https://react.dev/reference/react/createElement
   - Valtio State Management: https://github.com/pmndrs/valtio

3. **Markdown 规范**：
   - CommonMark Spec: https://commonmark.org/

---

## 🔧 附录：关键代码片段

### A. CSS 变量覆盖
```typescript
// 在 AiChatPanel 根元素上设置自定义变量
const panelRootStyle = {
    '--chat-font-serif': '"Noto Serif CJK SC", "Source Han Serif SC", Georgia, serif',
    '--chat-font-sans': '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
    '--chat-font-mono': '"JetBrains Mono", "Fira Code", Consolas, monospace',
    '--chat-highlight-bg': 'rgba(255, 235, 59, 0.5)',
    '--chat-code-bg': 'var(--orca-color-bg-3)',
};
```

### B. 流式渲染中的 Markdown 更新
```typescript
// 流式更新时避免重复解析
const [streamingContent, setStreamingContent] = useState('');
const [parsedNodes, setParsedNodes] = useState<MarkdownNode[]>([]);

// 在接收到新 chunk 时
if (chunk.type === 'content' && chunk.content) {
    const newContent = streamingContent + chunk.content;
    setStreamingContent(newContent);

    // 仅解析新增部分（优化性能）
    const newNodes = parseMarkdown(newContent);
    setParsedNodes(newNodes);
}
```

### C. 自定义滚动容器检测
```typescript
// 适配 Orca 的嵌套 panel 结构
function findScrollContainer(element: HTMLElement): HTMLElement {
    let parent = element.parentElement;
    while (parent) {
        const style = window.getComputedStyle(parent);
        if (style.overflowY === 'auto' || style.overflowY === 'scroll') {
            return parent;
        }
        if (parent.classList.contains('panel-content')) {
            return parent;  // Orca panel 容器
        }
        parent = parent.parentElement;
    }
    return document.documentElement;
}
```

---

## ✅ 交付清单

请基于以上需求，提供以下交付物：

1. **重构后的文件**：
   - `src/utils/markdown-renderer.ts` (新建)
   - `src/components/MarkdownMessage.tsx` (新建)
   - `src/views/AiChatPanel.tsx` (修改)
   - `src/views/ChatInput.tsx` (修改)

2. **样式定义**：
   - 所有 CSS-in-JS 样式常量
   - 主题变量映射

3. **测试案例**：
   - Markdown 解析器单元测试
   - 不同主题下的截图对比

4. **文档**：
   - 实施步骤详细说明
   - 性能优化建议
   - 未来扩展方向

---

**最后强调**：
- ✅ 所有实现必须使用 `window.React.createElement`，不使用 JSX
- ✅ 所有颜色必须使用 `--orca-color-*` 变量或其 fallback
- ✅ 不依赖外部 npm 包（除非已在项目中）
- ✅ 保持性能优先，避免不必要的重渲染
- ✅ 渐进式增强，优先完成 P0 功能

**期待你的精彩设计方案！** 🎨✨
