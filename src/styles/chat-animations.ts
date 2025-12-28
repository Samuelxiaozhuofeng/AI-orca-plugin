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

/* 嵌套列表样式 */
.md-list-nested {
    margin: 4px 0;
    padding-left: 20px;
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
    background: var(--orca-color-primary, #007bff);
    color: #fff;
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
