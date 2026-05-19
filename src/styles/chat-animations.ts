/**
 * Chat Animation Styles
 *
 * CSS keyframe animations for the chat interface.
 */

export const chatAnimations = `
/* ─────────────────────────────────────────────────────────────────────────────
   Design Tokens
   统一的设计变量，供所有组件引用
   ─────────────────────────────────────────────────────────────────────────── */
:root {
  /* Border Radius Scale */
  --orca-radius-sm: 4px;
  --orca-radius-md: 8px;
  --orca-radius-lg: 12px;
  --orca-radius-xl: 16px;
  --orca-radius-2xl: 18px;
  --orca-radius-full: 9999px;

  /* Elevation / Shadow Scale */
  --orca-shadow-xs: 0 1px 2px rgba(0,0,0,0.04);
  --orca-shadow-sm: 0 1px 3px rgba(0,0,0,0.04), 0 2px 8px rgba(0,0,0,0.03);
  --orca-shadow-md: 0 4px 12px rgba(0,0,0,0.08);
  --orca-shadow-lg: 0 4px 20px rgba(0,0,0,0.12);
  --orca-shadow-xl: 0 8px 30px rgba(0,0,0,0.15);
  --orca-shadow-primary-glow: 0 2px 12px rgba(0, 123, 255, 0.2);

  /* Spacing Scale (4px grid) */
  --orca-space-1: 4px;
  --orca-space-2: 8px;
  --orca-space-3: 12px;
  --orca-space-4: 16px;
  --orca-space-5: 20px;
  --orca-space-6: 24px;

  /* Transition Tokens */
  --orca-transition-fast: 0.15s ease;
  --orca-transition-normal: 0.2s ease;
  --orca-transition-slow: 0.3s ease;
}

@keyframes orca-fade-in {
    from { opacity: 0; }
    to { opacity: 1; }
}
@keyframes orca-slide-up {
    from { opacity: 0; transform: translateY(12px); }
    to { opacity: 1; transform: translateY(0); }
}
@keyframes blink {
    0%, 50% { opacity: 1; }
    51%, 100% { opacity: 0; }
}
@keyframes loadingDots {
    0%, 80%, 100% { transform: scale(0); opacity: 0.3; }
    40% { transform: scale(1); opacity: 1; }
}

/* ─────────────────────────────────────────────────────────────────────────────
   Typing Indicator Animation (Bouncing Dots)
   Three dots with sequential bouncing pattern, 200ms delay between dots
   **Feature: chat-ui-enhancement**
   **Validates: Requirements 2.1, 2.2**
   ─────────────────────────────────────────────────────────────────────────── */

@keyframes typingBounce {
    0%, 60%, 100% {
        transform: translateY(0);
    }
    30% {
        transform: translateY(-8px);
    }
}
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

/* ─────────────────────────────────────────────────────────────────────────────
   Message Entrance Animation (Enhanced)
   Fade-in + slide-up effect for message bubbles
   **Feature: chat-ui-enhancement**
   **Validates: Requirements 1.3**
   ─────────────────────────────────────────────────────────────────────────── */

@keyframes messageFadeSlideIn {
    from {
        opacity: 0;
        transform: translateY(12px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

/* ─────────────────────────────────────────────────────────────────────────────
   Empty State Staggered Fade-In Animation
   Staggered entrance effect for empty state content
   **Feature: chat-ui-enhancement**
   **Validates: Requirements 3.3**
   ─────────────────────────────────────────────────────────────────────────── */

@keyframes emptyStateFadeIn {
    from {
        opacity: 0;
        transform: translateY(16px);
    }
    to {
        opacity: 1;
        transform: translateY(0);
    }
}

/* Staggered animation classes for empty state elements */
.empty-state-stagger-1 {
    animation: emptyStateFadeIn 0.4s ease-out forwards;
    animation-delay: 0ms;
    opacity: 0;
}

.empty-state-stagger-2 {
    animation: emptyStateFadeIn 0.4s ease-out forwards;
    animation-delay: 100ms;
    opacity: 0;
}

.empty-state-stagger-3 {
    animation: emptyStateFadeIn 0.4s ease-out forwards;
    animation-delay: 200ms;
    opacity: 0;
}

/* Suggestion card staggered animations */
.suggestion-card-stagger-0 {
    animation: emptyStateFadeIn 0.4s ease-out forwards;
    animation-delay: 200ms;
    opacity: 0;
}

.suggestion-card-stagger-1 {
    animation: emptyStateFadeIn 0.4s ease-out forwards;
    animation-delay: 280ms;
    opacity: 0;
}

.suggestion-card-stagger-2 {
    animation: emptyStateFadeIn 0.4s ease-out forwards;
    animation-delay: 360ms;
    opacity: 0;
}

.suggestion-card-stagger-3 {
    animation: emptyStateFadeIn 0.4s ease-out forwards;
    animation-delay: 440ms;
    opacity: 0;
}

/* ─────────────────────────────────────────────────────────────────────────────
   Tool Status Animations (Gemini-reviewed motion design)
   ─────────────────────────────────────────────────────────────────────────── */

/* Create Tools - Micro Sparkle Animation (✨) */
@keyframes sparkle {
    0%, 100% {
        opacity: 1;
        transform: scale(1);
    }
    50% {
        opacity: 0.7;
        transform: scale(1.1);
    }
}

/* Search Tools - Pulse Animation (🔍) - Radar scan effect */
@keyframes pulse {
    0%, 100% {
        opacity: 1;
        transform: scale(1);
    }
    50% {
        opacity: 0.8;
        transform: scale(1.08);
    }
}

/* Query Tools - Simplified Flip Animation (📖) - Subtle tilt */
@keyframes flip {
    0% {
        transform: rotateY(0deg);
    }
    50% {
        transform: rotateY(20deg);
    }
    100% {
        transform: rotateY(0deg);
    }
}

/* Fallback Shimmer Animation (if flip has performance issues) */
@keyframes shimmer {
    0% { opacity: 0.6; }
    50% { opacity: 1; }
    100% { opacity: 0.6; }
}

/* ─────────────────────────────────────────────────────────────────────────────
   Skeleton Loading Animation
   Shimmer effect for skeleton placeholders
   **Feature: chat-ui-enhancement**
   **Validates: Requirements 11.1**
   ─────────────────────────────────────────────────────────────────────────── */

@keyframes skeletonShimmer {
    0% {
        background-position: -200% 0;
    }
    100% {
        background-position: 200% 0;
    }
}

/* Spin Animation for Loading States */
@keyframes spin {
    from {
        transform: rotate(0deg);
    }
    to {
        transform: rotate(360deg);
    }
}

/* Animation Classes */
.tool-animation-sparkle {
    display: inline-block;
    animation: sparkle 1.8s ease-in-out infinite;
    will-change: transform, opacity;
}

.tool-animation-pulse {
    display: inline-block;
    animation: pulse 1.5s ease-in-out infinite;
    will-change: transform, opacity;
}

.tool-animation-flip {
    display: inline-block;
    animation: flip 2s ease-in-out infinite;
    will-change: transform;
}

.tool-animation-shimmer {
    display: inline-block;
    animation: shimmer 1.5s ease-in-out infinite;
    will-change: opacity;
}

/* ─────────────────────────────────────────────────────────────────────────────
   Ripple Effect Animation (按钮涟漪效果)
   Material Design inspired ripple animation
   ─────────────────────────────────────────────────────────────────────────── */

@keyframes ripple {
    0% {
        transform: scale(0);
        opacity: 0.5;
    }
    100% {
        transform: scale(4);
        opacity: 0;
    }
}

.ripple-container {
    position: relative;
    overflow: hidden;
}

.ripple-effect {
    position: absolute;
    border-radius: 50%;
    background: currentColor;
    opacity: 0.3;
    pointer-events: none;
    animation: ripple 0.6s ease-out forwards;
}

/* ─────────────────────────────────────────────────────────────────────────────
   Send Button Animations (发送按钮动效)
   - Sending: rotation animation
   - Success: checkmark pop animation
   ─────────────────────────────────────────────────────────────────────────── */

@keyframes sendPulse {
    0%, 100% {
        transform: scale(1);
    }
    50% {
        transform: scale(0.92);
    }
}

@keyframes sendSuccess {
    0% {
        transform: scale(0.5);
        opacity: 0;
    }
    50% {
        transform: scale(1.2);
        opacity: 1;
    }
    100% {
        transform: scale(1);
        opacity: 1;
    }
}

@keyframes sendIconExit {
    0% {
        transform: translateY(0) scale(1);
        opacity: 1;
    }
    100% {
        transform: translateY(-10px) scale(0.5);
        opacity: 0;
    }
}

@keyframes sendIconEnter {
    0% {
        transform: translateY(10px) scale(0.5);
        opacity: 0;
    }
    100% {
        transform: translateY(0) scale(1);
        opacity: 1;
    }
}

.send-btn-sending {
    animation: sendPulse 1s ease-in-out infinite;
}

.send-btn-success {
    animation: sendSuccess 0.4s ease-out forwards;
}

.send-icon-exit {
    animation: sendIconExit 0.2s ease-in forwards;
}

.send-icon-enter {
    animation: sendIconEnter 0.2s ease-out forwards;
}

/* ─────────────────────────────────────────────────────────────────────────────
   Scroll To Bottom Button Animation (滚动到底部按钮动画)
   - Bounce in entrance
   - Subtle float effect
   ─────────────────────────────────────────────────────────────────────────── */

@keyframes scrollBtnBounceIn {
    0% {
        transform: translateX(-50%) translateY(20px) scale(0.8);
        opacity: 0;
    }
    60% {
        transform: translateX(-50%) translateY(-5px) scale(1.05);
        opacity: 1;
    }
    100% {
        transform: translateX(-50%) translateY(0) scale(1);
        opacity: 1;
    }
}

@keyframes scrollBtnBounceOut {
    0% {
        transform: translateX(-50%) translateY(0) scale(1);
        opacity: 1;
    }
    100% {
        transform: translateX(-50%) translateY(20px) scale(0.8);
        opacity: 0;
    }
}

@keyframes scrollBtnFloat {
    0%, 100% {
        transform: translateX(-50%) translateY(0);
    }
    50% {
        transform: translateX(-50%) translateY(-4px);
    }
}

@keyframes arrowBounce {
    0%, 100% {
        transform: translateY(0);
    }
    50% {
        transform: translateY(3px);
    }
}

.scroll-btn-enter {
    animation: scrollBtnBounceIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
}

.scroll-btn-exit {
    animation: scrollBtnBounceOut 0.3s ease-in forwards;
}

.scroll-btn-float {
    animation: scrollBtnFloat 2s ease-in-out infinite;
}

.scroll-btn-arrow {
    animation: arrowBounce 1.5s ease-in-out infinite;
}

/* ─────────────────────────────────────────────────────────────────────────────
   Action Bar Animation (消息操作栏浮出动画)
   - Slide up from bottom with scale
   ─────────────────────────────────────────────────────────────────────────── */

@keyframes actionBarSlideIn {
    0% {
        transform: translateY(8px) scale(0.95);
        opacity: 0;
    }
    100% {
        transform: translateY(0) scale(1);
        opacity: 1;
    }
}

@keyframes actionBarSlideOut {
    0% {
        transform: translateY(0) scale(1);
        opacity: 1;
    }
    100% {
        transform: translateY(8px) scale(0.95);
        opacity: 0;
    }
}

.action-bar-enter {
    animation: actionBarSlideIn 0.2s ease-out forwards;
}

.action-bar-exit {
    animation: actionBarSlideOut 0.15s ease-in forwards;
}

/* Action bar button hover effect */
.action-bar-btn {
    transition: all 0.15s ease;
}

.action-bar-btn:hover {
    background: var(--orca-color-bg-3);
    transform: scale(1.1);
}

.action-bar-btn:active {
    transform: scale(0.95);
}

/* ─────────────────────────────────────────────────────────────────────────────
   Markdown Table Styles
   ─────────────────────────────────────────────────────────────────────────── */

.md-table-container {
    overflow-x: auto;
    margin: 12px 0;
}

.md-table-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 4px;
    opacity: 0;
    transition: opacity 0.2s;
}

.md-table-container:hover .md-table-header {
    opacity: 1;
}

.md-table-view-switcher {
    display: flex;
    gap: 2px;
    background: var(--orca-color-bg-3, rgba(128, 128, 128, 0.1));
    border-radius: 6px;
    padding: 2px;
}

.md-table-view-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 24px;
    height: 24px;
    border-radius: 4px;
    cursor: pointer;
    color: var(--orca-color-text-2, #666);
    transition: all 0.2s;
}

.md-table-view-btn:hover {
    background: var(--orca-color-bg-2, rgba(128, 128, 128, 0.15));
    color: var(--orca-color-text-1, inherit);
}

.md-table-view-btn.active {
    background: var(--orca-color-bg-3, rgba(128, 128, 128, 0.15));
    color: var(--orca-color-text-1, inherit);
    border: 1px solid var(--orca-color-border, rgba(128, 128, 128, 0.3));
}

.md-table-copy-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    font-size: 12px;
    color: var(--orca-color-text-secondary, #666);
    cursor: pointer;
    border-radius: 4px;
    background: var(--orca-color-bg, rgba(255, 255, 255, 0.9));
    transition: background 0.2s, color 0.2s;
}

.md-table-copy-btn:hover {
    background: var(--orca-color-bg-hover, rgba(128, 128, 128, 0.1));
    color: var(--orca-color-text, inherit);
}

.md-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 14px;
}

.md-table th {
    padding: 8px 12px;
    border-bottom: 2px solid var(--orca-color-border, rgba(128, 128, 128, 0.3));
    background: var(--orca-color-bg-tertiary, rgba(128, 128, 128, 0.1));
    font-weight: 600;
    white-space: nowrap;
    color: var(--orca-color-text, inherit);
}

.md-table td {
    padding: 8px 12px;
    border-bottom: 1px solid var(--orca-color-border, rgba(128, 128, 128, 0.2));
    color: var(--orca-color-text, inherit);
}

.md-table tr:hover td {
    background: var(--orca-color-bg-hover, rgba(128, 128, 128, 0.1));
}

.md-table .align-left {
    text-align: left;
}

.md-table .align-center {
    text-align: center;
}

.md-table .align-right {
    text-align: right;
}

/* Card View */
.md-table-cards {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
    gap: 12px;
}

.md-table-card {
    padding: 12px;
    border-radius: 8px;
    background: var(--orca-color-bg-2, rgba(128, 128, 128, 0.05));
    border: 1px solid var(--orca-color-border, rgba(128, 128, 128, 0.2));
    transition: border-color 0.2s, box-shadow 0.2s;
}

.md-table-card:hover {
    border-color: var(--orca-color-primary-5, var(--orca-color-primary, #007bff));
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.md-table-card-field {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin-bottom: 8px;
}

.md-table-card-field:last-child {
    margin-bottom: 0;
}

.md-table-card-label {
    font-size: 11px;
    color: var(--orca-color-text-2, #666);
    font-weight: 500;
}

.md-table-card-value {
    font-size: 14px;
    color: var(--orca-color-text-1, inherit);
}

/* List View */
.md-table-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

.md-table-list-item {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    padding: 8px 12px;
    border-radius: 6px;
    background: var(--orca-color-bg-2, rgba(128, 128, 128, 0.05));
    transition: background 0.2s;
}

.md-table-list-item:hover {
    background: var(--orca-color-bg-3, rgba(128, 128, 128, 0.1));
}

.md-table-list-cell {
    display: inline-flex;
    align-items: center;
}

.md-table-list-sep {
    margin: 0 8px;
    color: var(--orca-color-text-3, #999);
}

/* ─────────────────────────────────────────────────────────────────────────────
   Horizontal Rule
   ─────────────────────────────────────────────────────────────────────────── */

.md-hr {
    border: none;
    border-top: 1px solid var(--orca-color-border, rgba(128, 128, 128, 0.3));
    margin: 16px 0;
}

/* ─────────────────────────────────────────────────────────────────────────────
   List Styles (公众号风格)
   ─────────────────────────────────────────────────────────────────────────── */

.md-list {
    margin: 20px 0;
    padding: 5px 15px 5px 35px;
    background: rgba(0, 0, 0, 0.02);
    border-radius: 10px;
    border: 1px dashed rgba(0, 0, 0, 0.1);
    color: inherit;
}

/* 暗色模式适配 */
@media (prefers-color-scheme: dark) {
    .md-list {
        background: rgba(255, 255, 255, 0.03);
        border-color: rgba(255, 255, 255, 0.1);
    }
}

.md-list-ordered {
    list-style-type: decimal;
}

.md-list-unordered {
    list-style-type: disc;
}

/* 嵌套列表样式 */
.md-list-nested {
    margin: 8px 0;
    padding-left: 20px;
    background: transparent;
    border: none;
    border-radius: 0;
}

.md-list-nested.md-list-unordered {
    list-style-type: circle;
}

.md-list-nested .md-list-nested.md-list-unordered {
    list-style-type: square;
}

.md-list-unordered .md-list-item::marker {
    font-size: 1.3em;
}

.md-list-item {
    margin: 6px 0;
    line-height: 1.6;
    color: inherit;
}

.md-list-item::marker {
    color: var(--orca-color-primary-5, var(--orca-color-primary, #007bff));
}

/* ─────────────────────────────────────────────────────────────────────────────
   Checklist Styles (- [ ] / - [x])
   支持分组模式：标题项 + 子项
   ─────────────────────────────────────────────────────────────────────────── */

.md-checklist {
    margin: 12px 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
}

/* 分组模式 */
.md-checklist-grouped {
    gap: 16px;
}

.md-checklist-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
}

/* 标题项样式 */
.md-checklist-header {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 14px;
    border-radius: 10px;
    background: var(--orca-color-bg-3, rgba(128, 128, 128, 0.1));
    border: 1px solid var(--orca-color-border, rgba(128, 128, 128, 0.2));
    color: var(--orca-color-text-1, inherit);
    font-weight: 600;
    font-size: 14px;
}

.md-checklist-header.checked {
    opacity: 0.7;
    background: var(--orca-color-bg-3, rgba(128, 128, 128, 0.15));
    color: var(--orca-color-text-2, #888);
}

.md-checklist-header.checked .md-checklist-header-text {
    text-decoration: line-through;
}

.md-checkbox-header {
    width: 22px;
    height: 22px;
    min-width: 22px;
    border: 2px solid rgba(255, 255, 255, 0.5);
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.15);
}

.md-checkbox-header.checked {
    background: rgba(255, 255, 255, 0.9);
    border-color: rgba(255, 255, 255, 0.9);
    color: var(--orca-color-primary, #007bff);
}

.md-checklist-header-text {
    flex: 1;
    line-height: 1.4;
}

.md-checklist-header-text strong {
    font-weight: 600;
}

/* 标题序号 */
.md-checklist-header-index {
    font-size: 13px;
    font-weight: 700;
    min-width: 24px;
    opacity: 0.8;
}

/* 子项容器 */
.md-checklist-subitems {
    display: flex;
    flex-direction: column;
    gap: 4px;
    padding-left: 12px;
    margin-left: 10px;
    border-left: 2px solid var(--orca-color-border, rgba(128, 128, 128, 0.2));
}

/* 普通项样式 */
.md-checklist-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 12px;
    border-radius: 8px;
    background: var(--orca-color-bg-2, rgba(128, 128, 128, 0.05));
    transition: background 0.2s;
}

.md-checklist-item:hover {
    background: var(--orca-color-bg-3, rgba(128, 128, 128, 0.1));
}

.md-checklist-item.checked {
    opacity: 0.7;
}

.md-checklist-item.checked .md-checklist-text {
    text-decoration: line-through;
    color: var(--orca-color-text-2, #888);
}

/* 子项样式（描述性内容） */
.md-checklist-subitem {
    background: transparent;
    padding: 6px 12px;
    font-size: 13px;
    color: var(--orca-color-text-2, #666);
}

.md-checklist-subitem:hover {
    background: var(--orca-color-bg-2, rgba(128, 128, 128, 0.05));
}

.md-checklist-subitem .md-checkbox {
    width: 16px;
    height: 16px;
    min-width: 16px;
    border-width: 1.5px;
    border-radius: 3px;
    opacity: 0.6;
}

.md-checkbox {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 20px;
    height: 20px;
    min-width: 20px;
    border: 2px solid var(--orca-color-border, rgba(128, 128, 128, 0.3));
    border-radius: 4px;
    background: var(--orca-color-bg-1, #fff);
    color: transparent;
    font-size: 12px;
    transition: all 0.2s;
}

.md-checkbox.checked {
    background: var(--orca-color-bg-3, rgba(128, 128, 128, 0.15));
    border-color: var(--orca-color-border, rgba(128, 128, 128, 0.3));
    color: var(--orca-color-text-1, inherit);
}

.md-checklist-text {
    flex: 1;
    line-height: 1.5;
}

/* ─────────────────────────────────────────────────────────────────────────────
   Timeline Styles
   ─────────────────────────────────────────────────────────────────────────── */

.md-timeline {
    position: relative;
    margin: 16px 0;
    padding-left: 24px;
}

.md-timeline::before {
    content: '';
    position: absolute;
    left: 7px;
    top: 8px;
    bottom: 8px;
    width: 2px;
    background: var(--orca-color-border, rgba(128, 128, 128, 0.3));
    border-radius: 1px;
}

.md-timeline-item {
    position: relative;
    padding-bottom: 20px;
}

.md-timeline-item:last-child {
    padding-bottom: 0;
}

.md-timeline-dot {
    position: absolute;
    left: -20px;
    top: 6px;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: var(--orca-color-primary, #007bff);
    border: 2px solid var(--orca-color-bg-1, #fff);
    box-shadow: 0 0 0 2px var(--orca-color-primary, #007bff);
}

.md-timeline-content {
    padding: 8px 12px;
    background: var(--orca-color-bg-2, rgba(128, 128, 128, 0.05));
    border-radius: 8px;
    border: 1px solid var(--orca-color-border, rgba(128, 128, 128, 0.15));
}

.md-timeline-date {
    font-size: 12px;
    font-weight: 600;
    color: var(--orca-color-primary, #007bff);
    margin-bottom: 4px;
}

.md-timeline-title {
    font-size: 14px;
    font-weight: 500;
    color: var(--orca-color-text-1, inherit);
    line-height: 1.4;
}

.md-timeline-desc {
    font-size: 13px;
    color: var(--orca-color-text-2, #666);
    margin-top: 4px;
    line-height: 1.5;
}

.md-timeline-category {
    display: inline-block;
    margin-left: 8px;
    padding: 1px 6px;
    border-radius: 8px;
    font-size: 10px;
    font-weight: 500;
    color: #fff;
    text-transform: capitalize;
}

/* Block reference dot (inline) */
.md-block-dot {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    cursor: pointer;
    vertical-align: super;
    margin: 0 2px;
    transition: transform 0.2s, box-shadow 0.2s;
}

.md-block-dot:hover {
    transform: scale(1.4);
    box-shadow: 0 0 8px currentColor;
}

/* Hide br tags adjacent to block dots */
.md-block-dot + br,
br + .md-block-dot {
    display: none;
}

/* ─────────────────────────────────────────────────────────────────────────────
   Compare View Styles (Left-Right Comparison)
   ─────────────────────────────────────────────────────────────────────────── */

.md-compare {
    margin: 16px 0;
    border-radius: 8px;
    overflow: hidden;
    border: 1px solid var(--orca-color-border, rgba(128, 128, 128, 0.2));
    background: var(--orca-color-bg-2, rgba(128, 128, 128, 0.03));
}

.md-compare-header {
    display: flex;
    background: var(--orca-color-bg-3, rgba(128, 128, 128, 0.08));
    border-bottom: 2px solid var(--orca-color-border, rgba(128, 128, 128, 0.2));
}

.md-compare-title {
    flex: 1;
    padding: 12px 16px;
    font-weight: 600;
    font-size: 14px;
    color: var(--orca-color-text-1, inherit);
}

.md-compare-title.md-compare-left {
    background: rgba(0, 123, 255, 0.08);
    color: #007bff;
}

.md-compare-title.md-compare-right {
    background: rgba(40, 167, 69, 0.08);
    color: #28a745;
}

.md-compare-row {
    display: flex;
    border-bottom: 1px solid var(--orca-color-border, rgba(128, 128, 128, 0.15));
}

.md-compare-row:last-child {
    border-bottom: none;
}

.md-compare-row:hover {
    background: var(--orca-color-bg-hover, rgba(128, 128, 128, 0.05));
}

.md-compare-cell {
    flex: 1;
    padding: 10px 16px;
    font-size: 14px;
    line-height: 1.5;
    color: var(--orca-color-text-1, inherit);
}

.md-compare-cell.md-compare-left {
    border-left: 3px solid rgba(0, 123, 255, 0.3);
}

.md-compare-cell.md-compare-right {
    border-left: 3px solid rgba(40, 167, 69, 0.3);
}

.md-compare-divider {
    width: 1px;
    background: var(--orca-color-border, rgba(128, 128, 128, 0.2));
    flex-shrink: 0;
}

/* ─────────────────────────────────────────────────────────────────────────────
   Local Graph Styles (Obsidian-like relationship graph)
   ─────────────────────────────────────────────────────────────────────────── */

.local-graph-container {
    margin: 12px 0;
    width: 100%;
    background: var(--orca-color-bg-2, rgba(128, 128, 128, 0.05));
    border-radius: 8px;
    border: 1px solid var(--orca-color-border, rgba(128, 128, 128, 0.15));
    overflow: hidden;
    position: relative;
}

.local-graph-fullscreen {
    border-radius: 12px;
}

.local-graph-toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 12px;
    background: var(--orca-color-bg-3, rgba(128, 128, 128, 0.08));
    border-bottom: 1px solid var(--orca-color-border, rgba(128, 128, 128, 0.15));
}

.local-graph-svg {
    display: block;
    width: 100%;
    background: var(--orca-color-bg-1, #fff);
}

.local-graph-title {
    font-size: 12px;
    font-weight: 500;
    color: var(--orca-color-text-2, #666);
}

.local-graph-actions {
    display: flex;
    gap: 4px;
}

.local-graph-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: var(--orca-color-text-2, #666);
    cursor: pointer;
    transition: all 0.2s;
}

.local-graph-btn:hover {
    background: var(--orca-color-bg-2, rgba(128, 128, 128, 0.15));
    color: var(--orca-color-text-1, inherit);
}

.local-graph-empty {
    padding: 32px;
    text-align: center;
    color: var(--orca-color-text-2, #666);
    font-size: 13px;
}

.local-graph-link {
    stroke: var(--orca-color-border, rgba(128, 128, 128, 0.4));
    stroke-width: 1.5;
    stroke-opacity: 0.6;
}

.local-graph-node {
    cursor: pointer;
}

.local-graph-node:hover .local-graph-circle {
    filter: brightness(1.2);
    stroke: #fff;
    stroke-width: 2;
}

.local-graph-circle {
    transition: filter 0.2s;
    stroke: var(--orca-color-bg-1, #fff);
    stroke-width: 2;
    filter: drop-shadow(0 1px 2px rgba(0,0,0,0.2));
}

.local-graph-label {
    font-size: 11px;
    fill: var(--orca-color-text-1, #333);
    pointer-events: none;
    user-select: none;
    font-weight: 500;
}

.local-graph-node:hover .local-graph-label {
    font-weight: 600;
    fill: var(--orca-color-primary, #007bff);
}

.local-graph-zoom {
    position: absolute;
    bottom: 8px;
    right: 8px;
    padding: 2px 6px;
    font-size: 10px;
    color: var(--orca-color-text-3, #999);
    background: var(--orca-color-bg-1, rgba(255,255,255,0.9));
    border-radius: 4px;
    pointer-events: none;
}

/* ───────────────────────────────────────────────────────────────────────────
   Gallery Styles - Image grid with lightbox
   ─────────────────────────────────────────────────────────────────────────── */

.md-gallery {
    margin: 12px 0;
    border-radius: 8px;
    overflow: hidden;
    background: var(--orca-color-bg-2, rgba(128, 128, 128, 0.05));
}

.md-gallery-toolbar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 12px;
    border-bottom: 1px solid var(--orca-color-border, rgba(128, 128, 128, 0.2));
}

.md-gallery-count {
    font-size: 12px;
    color: var(--orca-color-text-2, #666);
}

.md-gallery-view-switcher {
    display: flex;
    gap: 4px;
}

.md-gallery-view-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border: none;
    border-radius: 4px;
    background: transparent;
    color: var(--orca-color-text-3, #999);
    cursor: pointer;
    transition: all 0.2s;
}

.md-gallery-view-btn:hover {
    background: var(--orca-color-bg-3, rgba(128, 128, 128, 0.1));
    color: var(--orca-color-text-1, #333);
}

.md-gallery-view-btn.active {
    background: var(--orca-color-bg-3, rgba(128, 128, 128, 0.15));
    color: var(--orca-color-text-1, inherit);
    border: 1px solid var(--orca-color-border, rgba(128, 128, 128, 0.3));
}

/* Grid View */
.md-gallery-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
    gap: 8px;
    padding: 12px;
}

.md-gallery-item {
    position: relative;
    aspect-ratio: 1;
    border-radius: 6px;
    overflow: hidden;
    cursor: pointer;
    background: var(--orca-color-bg-3, #f0f0f0);
    transition: transform 0.2s, box-shadow 0.2s;
}

.md-gallery-item:hover {
    transform: scale(1.02);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

.md-gallery-thumb {
    width: 100%;
    height: 100%;
    object-fit: cover;
}

.md-gallery-caption {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    padding: 4px 8px;
    font-size: 11px;
    color: #fff;
    background: linear-gradient(transparent, rgba(0, 0, 0, 0.7));
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

/* List View */
.md-gallery-list {
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding: 12px;
}

.md-gallery-list-item {
    display: flex;
    gap: 12px;
    padding: 8px;
    border-radius: 6px;
    background: var(--orca-color-bg-1, #fff);
    cursor: pointer;
    transition: background 0.2s;
}

.md-gallery-list-item:hover {
    background: var(--orca-color-bg-3, rgba(128, 128, 128, 0.1));
}

.md-gallery-list-thumb {
    width: 60px;
    height: 60px;
    object-fit: cover;
    border-radius: 4px;
    flex-shrink: 0;
}

.md-gallery-list-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    justify-content: center;
}

.md-gallery-list-title {
    font-size: 13px;
    font-weight: 500;
    color: var(--orca-color-text-1, #333);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.md-gallery-list-caption {
    font-size: 12px;
    color: var(--orca-color-text-2, #666);
    margin-top: 4px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

/* Lightbox */
.md-gallery-lightbox {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 10000;
    background: rgba(0, 0, 0, 0.9);
    display: flex;
    align-items: center;
    justify-content: center;
    animation: fadeIn 0.2s ease-out;
}

.md-gallery-lightbox-content {
    position: relative;
    max-width: 90vw;
    max-height: 90vh;
    display: flex;
    flex-direction: column;
    align-items: center;
}

.md-gallery-lightbox-img {
    max-width: 100%;
    max-height: calc(90vh - 60px);
    object-fit: contain;
    border-radius: 4px;
}

.md-gallery-lightbox-close {
    position: absolute;
    top: -40px;
    right: 0;
    width: 36px;
    height: 36px;
    border: none;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
    font-size: 18px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.2s;
}

.md-gallery-lightbox-close:hover {
    background: rgba(255, 255, 255, 0.2);
}

.md-gallery-lightbox-prev,
.md-gallery-lightbox-next {
    position: absolute;
    top: 50%;
    transform: translateY(-50%);
    width: 44px;
    height: 44px;
    border: none;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
    font-size: 20px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background 0.2s;
}

.md-gallery-lightbox-prev {
    left: -60px;
}

.md-gallery-lightbox-next {
    right: -60px;
}

.md-gallery-lightbox-prev:hover,
.md-gallery-lightbox-next:hover {
    background: rgba(255, 255, 255, 0.2);
}

.md-gallery-lightbox-info {
    display: flex;
    align-items: center;
    gap: 16px;
    margin-top: 12px;
    padding: 8px 16px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 20px;
    color: #fff;
    font-size: 13px;
}

.md-gallery-lightbox-alt {
    opacity: 0.8;
    max-width: 300px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.md-gallery-lightbox-open {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border: none;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
    cursor: pointer;
    transition: background 0.2s;
}

.md-gallery-lightbox-open:hover {
    background: rgba(255, 255, 255, 0.2);
}

/* ─────────────────────────────────────────────────────────────────────────────
   Chat Navigation Highlight Animation
   ─────────────────────────────────────────────────────────────────────────── */

@keyframes chatNavHighlight {
    0% {
        box-shadow: 0 0 0 0 rgba(0, 123, 255, 0.4);
    }
    50% {
        box-shadow: 0 0 0 8px rgba(0, 123, 255, 0.2);
    }
    100% {
        box-shadow: 0 0 0 0 rgba(0, 123, 255, 0);
    }
}

.chat-nav-highlight {
    animation: chatNavHighlight 1.5s ease-out;
    border-radius: 12px;
}

/* ─────────────────────────────────────────────────────────────────────────────
   AI Chat Block Renderer - Text Selection Support
   ─────────────────────────────────────────────────────────────────────────── */

/* 确保 AI 对话块内的文本可以被选择和复制 */
.aichat-repr-conversation,
.aichat-repr-conversation-content,
.aichat-repr-conversation-content * {
    user-select: text !important;
    -webkit-user-select: text !important;
    -moz-user-select: text !important;
    -ms-user-select: text !important;
}

/* 按钮和交互元素除外 */
.aichat-repr-conversation button,
.aichat-repr-conversation input {
    user-select: none !important;
    -webkit-user-select: none !important;
}

/* ─────────────────────────────────────────────────────────────────────────────
   Responsive Message Bubble Styles
   窄屏时消息气泡占满宽度
   ─────────────────────────────────────────────────────────────────────────── */

/* 窄屏时（面板宽度小于 500px）AI 消息占满宽度 */
@container (max-width: 500px) {
    .message-bubble-assistant {
        width: 100% !important;
        max-width: 100% !important;
    }
}

/* ─────────────────────────────────────────────────────────────────────────────
   Panel Background Override
   去除 AI Chat 插件面板内多余的背景色和边框
   使用 data-panel-title 限定范围，避免影响其他 Orca 面板
   ─────────────────────────────────────────────────────────────────────────── */

/* .orca-hideable 的直接子元素去掉背景色 */
#main .orca-panel.active[data-panel-title="AI Chat"] > .orca-hideable > div {
    background: transparent !important;
}

/* .orca-hideable 内第一个子元素去掉背景色 */
#main .orca-panel.active[data-panel-title="AI Chat"] > .orca-hideable > div > div:first-child {
    background: transparent !important;
}

/* .orca-hideable 内第四个子元素去掉边框和背景色 */
#main .orca-panel.active[data-panel-title="AI Chat"] > .orca-hideable > div > div:nth-child(4) {
    border-top: none !important;
    background: transparent !important;
}

/* 用户消息气泡样式调整 */
.message-bubble-user {
    background: var(--orca-color-bg-1) !important;
    box-shadow: none !important;
}

/* ─────────────────────────────────────────────────────────────────────────────
   CSS Class-based Hover States
   替代内联 onMouseEnter/onMouseLeave 处理器
   ─────────────────────────────────────────────────────────────────────────── */

/* Suggestion Card Hover (EmptyState) */
.suggestion-card {
    border: 1px solid var(--orca-color-border);
    transition: all 0.2s ease;
}
.suggestion-card:hover {
    transform: scale(1.03);
    box-shadow: 0 6px 16px rgba(0,0,0,0.1);
    border-color: var(--orca-color-primary);
}

/* Header Menu Item Hover */
.header-menu-item {
    transition: background 0.1s ease;
}
.header-menu-item:hover {
    background: var(--orca-color-bg-2);
}

/* Context Chip Remove Button Hover */
.context-chip-remove {
    transition: opacity 0.15s ease;
    opacity: 0.6;
}
.context-chip-remove:hover {
    opacity: 1;
}

/* Skill Recommendation Button Hover */
.skill-rec-btn {
    background: var(--orca-color-bg-1);
    transition: all 0.15s ease;
}
.skill-rec-btn:hover {
    background: rgba(16, 185, 129, 0.1);
}

`;

let styleElement: HTMLStyleElement | null = null;
let refCount = 0;

/**
 * Inject chat animation styles into the document head.
 * Uses reference counting to ensure styles are only removed when no longer needed.
 * Returns a cleanup function to decrement the reference count.
 */
export function injectChatStyles(): () => void {
  refCount++;
  
  // 检查 DOM 中是否已存在样式元素
  const existingStyle = document.getElementById("ai-chat-styles");
  
  // 如果 DOM 中已存在但变量丢失（可能是热更新导致），重新获取引用
  if (existingStyle && !styleElement) {
    styleElement = existingStyle as HTMLStyleElement;
  }
  
  if (!styleElement) {
    styleElement = document.createElement("style");
    styleElement.id = "ai-chat-styles";
    styleElement.textContent = chatAnimations;
    document.head.appendChild(styleElement);
  }

  return () => {
    refCount--;
    // 不再自动移除样式，保持样式始终存在
    // 因为块渲染器可能在任何时候需要这些样式
  };
}

/**
 * 确保样式存在（用于块渲染器）
 * 每次调用都会检查 DOM 中是否存在样式，如果不存在则重新注入
 */
export function ensureChatStyles(): void {
  const existingStyle = document.getElementById("ai-chat-styles");
  
  if (!existingStyle) {
    // 重新创建样式元素
    const newStyle = document.createElement("style");
    newStyle.id = "ai-chat-styles";
    newStyle.textContent = chatAnimations;
    document.head.appendChild(newStyle);
    styleElement = newStyle;
  } else if (!styleElement) {
    // DOM 中存在但变量丢失，恢复引用
    styleElement = existingStyle as HTMLStyleElement;
  }
}

