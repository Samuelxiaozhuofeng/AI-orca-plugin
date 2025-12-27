/**
 * Chat Animation Styles
 *
 * CSS keyframe animations for the chat interface.
 */

export const chatAnimations = `
@keyframes blink {
    0%, 50% { opacity: 1; }
    51%, 100% { opacity: 0; }
}
@keyframes loadingDots {
    0%, 80%, 100% { transform: scale(0); opacity: 0.3; }
    40% { transform: scale(1); opacity: 1; }
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
    background: var(--orca-color-primary-5, var(--orca-color-primary, #007bff));
    color: #fff;
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
   List Styles
   ─────────────────────────────────────────────────────────────────────────── */

.md-list {
    margin: 12px 0;
    padding-left: 24px;
    color: inherit;
}

.md-list-ordered {
    list-style-type: decimal;
}

.md-list-unordered {
    list-style-type: disc;
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
   ─────────────────────────────────────────────────────────────────────────── */

.md-checklist {
    margin: 12px 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
}

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
    background: var(--orca-color-primary, #007bff);
    border-color: var(--orca-color-primary, #007bff);
    color: #fff;
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
`;

let styleElement: HTMLStyleElement | null = null;

/**
 * Inject chat animation styles into the document head.
 * Returns a cleanup function to remove the styles.
 */
export function injectChatStyles(): () => void {
  if (!styleElement) {
    styleElement = document.createElement("style");
    styleElement.textContent = chatAnimations;
    document.head.appendChild(styleElement);
  }

  return () => {
    if (styleElement) {
      document.head.removeChild(styleElement);
      styleElement = null;
    }
  };
}
