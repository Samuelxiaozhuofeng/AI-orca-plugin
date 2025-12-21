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
