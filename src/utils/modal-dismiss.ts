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

/**
 * 弹窗挂到 document.body：留在面板里时，右侧（后面）的面板内容会画在遮罩上面
 * （面板各自成层，弹窗的 zIndex 出不了本栏）。
 */
export function toBody(el: any) {
  return (window as any).ReactDOM.createPortal(el, document.body);
}
