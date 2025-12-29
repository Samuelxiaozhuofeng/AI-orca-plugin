/**
 * FlashcardReview - 闪卡复习组件
 */

const React = window.React as unknown as {
  createElement: typeof window.React.createElement;
  useState: <T>(initial: T | (() => T)) => [T, (next: T | ((prev: T) => T)) => void];
  useCallback: <T extends (...args: any[]) => any>(fn: T, deps: any[]) => T;
};
const { createElement, useState, useCallback } = React;

export interface Flashcard {
  id: string;
  front: string;
  back: string;
  tags?: string[];
  cardType?: "basic" | "choice";
  options?: { text: string; isCorrect: boolean }[];
  ordered?: boolean;
}

interface FlashcardReviewProps {
  cards: Flashcard[];
  onComplete: (keptCards: Flashcard[]) => void;
  onKeepCard?: (card: Flashcard) => Promise<void>;
  onCancel?: () => void;
}

export default function FlashcardReview({ cards, onComplete, onKeepCard, onCancel }: FlashcardReviewProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [keptCount, setKeptCount] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);
  const [isExiting, setIsExiting] = useState(false);
  const [exitDirection, setExitDirection] = useState<"left" | "right" | null>(null);
  const [isCompleted, setIsCompleted] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const currentCard = cards[currentIndex];
  const progress = cards.length > 0 ? ((currentIndex + 1) / cards.length) * 100 : 0;

  const handleFlip = useCallback(() => {
    if (!isExiting && !isSaving) setIsFlipped(!isFlipped);
  }, [isFlipped, isExiting, isSaving]);

  const moveToNext = useCallback(async (direction: "left" | "right", kept: boolean) => {
    if (isSaving) return;
    setIsExiting(true);
    setExitDirection(direction);

    if (kept && onKeepCard) {
      setIsSaving(true);
      try {
        await onKeepCard(currentCard);
        setKeptCount(prev => prev + 1);
      } catch (err) {
        console.error("[FlashcardReview] Save failed:", err);
      } finally {
        setIsSaving(false);
      }
    } else if (kept) {
      setKeptCount(prev => prev + 1);
    } else {
      setSkippedCount(prev => prev + 1);
    }

    setTimeout(() => {
      if (currentIndex + 1 >= cards.length) {
        setIsCompleted(true);
        const keptCardsPlaceholder = Array(keptCount + (kept ? 1 : 0)).fill({} as Flashcard);
        onComplete(keptCardsPlaceholder);
      } else {
        setCurrentIndex(prev => prev + 1);
        setIsFlipped(false);
        setIsExiting(false);
        setExitDirection(null);
      }
    }, 300);
  }, [currentIndex, cards.length, currentCard, onComplete, onKeepCard, isSaving, keptCount]);

  const handleSkip = useCallback(() => {
    if (!isExiting && !isSaving) moveToNext("left", false);
  }, [isExiting, isSaving, moveToNext]);

  const handleKeep = useCallback(() => {
    if (!isExiting && !isSaving) moveToNext("right", true);
  }, [isExiting, isSaving, moveToNext]);

  // 完成状态
  if (isCompleted) {
    return createElement("div", {
      style: { padding: "20px", textAlign: "center" }
    },
      createElement("div", { style: { fontSize: "24px", marginBottom: "8px" } }, "✅"),
      createElement("div", {
        style: { fontSize: "14px", fontWeight: 600, color: "#333", marginBottom: "8px" }
      }, "复习完成"),
      createElement("div", {
        style: { fontSize: "13px", color: "#666" }
      }, `保留 ${keptCount} · 跳过 ${skippedCount}`)
    );
  }

  // 空卡片
  if (!currentCard) {
    return createElement("div", {
      style: { padding: "20px", textAlign: "center", color: "#666" }
    }, "没有闪卡");
  }

  const cardTransform = isExiting
    ? `translateX(${exitDirection === "left" ? "-100%" : "100%"})`
    : isFlipped ? "rotateY(180deg)" : "rotateY(0deg)";

  return createElement("div", { style: { padding: "12px" } },
    // 顶部
    createElement("div", {
      style: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: "12px",
      }
    },
      createElement("span", { style: { fontSize: "13px", color: "#333", fontWeight: 500 } },
        `${currentIndex + 1} / ${cards.length}`
      ),
      createElement("button", {
        onClick: onCancel,
        style: { background: "none", border: "none", cursor: "pointer", color: "#999", padding: "4px" }
      }, createElement("i", { className: "ti ti-x" }))
    ),

    // 进度条
    createElement("div", {
      style: { height: "4px", background: "#eee", borderRadius: "2px", marginBottom: "16px" }
    },
      createElement("div", {
        style: { width: `${progress}%`, height: "100%", background: "#007bff", borderRadius: "2px", transition: "width 0.3s" }
      })
    ),

    // 卡片
    createElement("div", { style: { perspective: "600px", marginBottom: "16px" } },
      createElement("div", {
        onClick: handleFlip,
        style: {
          position: "relative",
          minHeight: "120px",
          transformStyle: "preserve-3d",
          transition: isExiting ? "transform 0.3s, opacity 0.3s" : "transform 0.5s",
          transform: cardTransform,
          opacity: isExiting ? 0 : 1,
          cursor: "pointer",
        }
      },
        // 正面
        createElement("div", {
          style: {
            position: isFlipped ? "absolute" : "relative",
            width: "100%",
            minHeight: "120px",
            backfaceVisibility: "hidden",
            padding: "16px",
            background: "#fff",
            border: "1px solid #ddd",
            borderRadius: "8px",
            boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
          }
        },
          currentCard.cardType === "choice" && createElement("span", {
            style: {
              display: "inline-block",
              padding: "2px 8px",
              marginBottom: "8px",
              borderRadius: "4px",
              background: "#007bff",
              color: "#fff",
              fontSize: "11px",
            }
          }, "选择题"),
          createElement("div", {
            style: { fontSize: "15px", lineHeight: 1.6, color: "#333" }
          }, currentCard.front),
          createElement("div", {
            style: { marginTop: "12px", fontSize: "12px", color: "#999" }
          }, "点击查看答案")
        ),

        // 背面
        isFlipped && createElement("div", {
          style: {
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            minHeight: "120px",
            backfaceVisibility: "hidden",
            padding: "16px",
            background: "#007bff",
            borderRadius: "8px",
            transform: "rotateY(180deg)",
          }
        },
          currentCard.cardType === "choice" && currentCard.options
            ? currentCard.options.map((opt, i) =>
                createElement("div", {
                  key: i,
                  style: {
                    padding: "8px 12px",
                    marginBottom: "6px",
                    borderRadius: "6px",
                    background: opt.isCorrect ? "rgba(40,167,69,0.9)" : "rgba(255,255,255,0.2)",
                    color: "#fff",
                    fontSize: "13px",
                    display: "flex",
                    alignItems: "center",
                    gap: "8px",
                  }
                },
                  createElement("span", {
                    style: {
                      width: "20px",
                      height: "20px",
                      borderRadius: "50%",
                      background: opt.isCorrect ? "#28a745" : "rgba(255,255,255,0.3)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "12px",
                      flexShrink: 0,
                    }
                  }, opt.isCorrect ? "✓" : String.fromCharCode(65 + i)),
                  opt.text
                )
              )
            : createElement("div", {
                style: { fontSize: "15px", lineHeight: 1.6, color: "#fff" }
              }, currentCard.back)
        )
      )
    ),

    // 按钮
    createElement("div", { style: { display: "flex", gap: "12px" } },
      createElement("button", {
        onClick: handleSkip,
        disabled: isExiting || isSaving,
        style: {
          flex: 1,
          padding: "10px",
          borderRadius: "8px",
          border: "1px solid #ddd",
          background: "#fff",
          color: "#666",
          cursor: "pointer",
          fontSize: "14px",
          fontWeight: 500,
        }
      }, "跳过"),
      createElement("button", {
        onClick: handleKeep,
        disabled: isExiting || isSaving,
        style: {
          flex: 1,
          padding: "10px",
          borderRadius: "8px",
          border: "none",
          background: "#007bff",
          color: "#fff",
          cursor: "pointer",
          fontSize: "14px",
          fontWeight: 500,
        }
      }, isSaving ? "保存中..." : "保留")
    )
  );
}
