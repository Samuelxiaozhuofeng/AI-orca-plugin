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
