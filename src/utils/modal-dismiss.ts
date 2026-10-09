/**
 * Modal dismiss helper: Escape closes, and the overlay closes only when the
 * press both started and ended on the overlay (drag-selecting text out of an input won't close it).
 */

const { useEffect, useRef } = window.React;

export function useModalDismiss(isOpen: boolean, onClose: () => void, onEscape: () => void = onClose) {
  const downOnOverlayRef = useRef(false);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !e.isComposing) onEscape();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onEscape]);

  return {
    onMouseDown: (e: any) => {
      downOnOverlayRef.current = e.target === e.currentTarget;
    },
    onClick: (e: any) => {
      if (e.target === e.currentTarget && downOnOverlayRef.current) onClose();
      downOnOverlayRef.current = false;
    },
  };
}
