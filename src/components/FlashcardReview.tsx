/**
 * FlashcardReview - 闪卡复习组件
 * 
 * 优化版本：
 * - 使用 Orca 主题变量，融入整体 UI
 * - 修复选择题 UI 重叠问题
 * - 支持状态持久化（从外部传入初始状态）
 */

const React = window.React as unknown as {
  createElement: typeof window.React.createElement;
  useState: <T>(initial: T | (() => T)) => [T, (next: T | ((prev: T) => T)) => void];
  useCallback: <T extends (...args: any[]) => any>(fn: T, deps: any[]) => T;
  useEffect: (fn: () => void | (() => void), deps: any[]) => void;
};
const { createElement, useState, useCallback, useEffect } = React;

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
  // 状态持久化支持
  initialIndex?: number;
  initialKeptCount?: number;
  initialSkippedCount?: number;
  onStateChange?: (index: number, keptCount: number, skippedCount: number) => void;
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function FlashcardReview({ 
  cards, 
  onComplete, 
  onKeepCard, 
  onCancel,
  initialIndex = 0,
  initialKeptCount = 0,
  initialSkippedCount = 0,
  onStateChange,
}: FlashcardReviewProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [isFlipped, setIsFlipped] = useState(false);
  const [keptCount, setKeptCount] = useState(initialKeptCount);
  const [skippedCount, setSkippedCount] = useState(initialSkippedCount);
  const [isExiting, setIsExiting] = useState(false);
  const [exitDirection, setExitDirection] = useState<"left" | "right" | null>(null);
  const [isCompleted, setIsCompleted] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const currentCard = cards[currentIndex];
  const progress = cards.length > 0 ? ((currentIndex + 1) / cards.length) * 100 : 0;

  // 通知父组件状态变化
  useEffect(() => {
    if (onStateChange && !isCompleted) {
      onStateChange(currentIndex, keptCount, skippedCount);
    }
  }, [currentIndex, keptCount, skippedCount, isCompleted, onStateChange]);

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
    }, 280);
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
      style: {
        padding: "28px 20px",
        textAlign: "center",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: "12px",
      }
    },
      createElement("div", {
        style: {
          width: "52px",
          height: "52px",
          borderRadius: "50%",
          background: "linear-gradient(135deg, #28a745 0%, #20c997 100%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: "22px",
          color: "#fff",
        }
      }, createElement("i", { className: "ti ti-check" })),
      createElement("div", {
        style: {
          fontSize: "15px",
          fontWeight: 600,
          color: "var(--orca-color-text-1)",
        }
      }, "复习完成"),
      createElement("div", {
        style: {
          display: "flex",
          gap: "20px",
          marginTop: "4px",
        }
      },
        createElement("div", {
          style: { display: "flex", flexDirection: "column", alignItems: "center", gap: "2px" }
        },
          createElement("span", {
            style: { fontSize: "18px", fontWeight: 600, color: "#28a745" }
          }, keptCount),
          createElement("span", {
            style: { fontSize: "11px", color: "var(--orca-color-text-3)" }
          }, "已保留")
        ),
        createElement("div", {
          style: { display: "flex", flexDirection: "column", alignItems: "center", gap: "2px" }
        },
          createElement("span", {
            style: { fontSize: "18px", fontWeight: 600, color: "var(--orca-color-text-3)" }
          }, skippedCount),
          createElement("span", {
            style: { fontSize: "11px", color: "var(--orca-color-text-3)" }
          }, "已跳过")
        )
      )
    );
  }

  // 空卡片
  if (!currentCard) {
    return createElement("div", {
      style: { 
        padding: "28px 20px", 
        textAlign: "center", 
        color: "var(--orca-color-text-3)",
        fontSize: "13px",
      }
    }, "没有闪卡可供复习");
  }

  // 计算卡片高度 - 选择题根据选项数量动态调整
  const optionsCount = currentCard.options?.length || 0;
  const baseHeight = 140;
  const cardHeight = currentCard.cardType === "choice" 
    ? Math.max(baseHeight, 60 + optionsCount * 44) 
    : baseHeight;

  // 卡片变换
  const getCardTransform = () => {
    if (isExiting) {
      const x = exitDirection === "left" ? -110 : 110;
      const rotate = exitDirection === "left" ? -8 : 8;
      return `translateX(${x}%) rotate(${rotate}deg)`;
    }
    return isFlipped ? "rotateY(180deg)" : "rotateY(0deg)";
  };

  return createElement("div", {
    style: { padding: "14px 16px" }
  },
    // 顶部：进度信息和关闭按钮
    createElement("div", {
      style: {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: "10px",
      }
    },
      createElement("span", {
        style: {
          fontSize: "12px",
          fontWeight: 500,
          color: "var(--orca-color-text-2)",
        }
      }, `${currentIndex + 1} / ${cards.length}`),
      createElement("button", {
        onClick: onCancel,
        style: {
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "var(--orca-color-text-3)",
          padding: "4px",
          borderRadius: "4px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          transition: "all 0.15s",
        },
        onMouseEnter: (e: any) => {
          e.currentTarget.style.background = "var(--orca-color-bg-3)";
          e.currentTarget.style.color = "var(--orca-color-text-1)";
        },
        onMouseLeave: (e: any) => {
          e.currentTarget.style.background = "none";
          e.currentTarget.style.color = "var(--orca-color-text-3)";
        },
      }, createElement("i", { className: "ti ti-x", style: { fontSize: "16px" } }))
    ),

    // 进度条
    createElement("div", {
      style: {
        height: "3px",
        background: "var(--orca-color-bg-3)",
        borderRadius: "2px",
        marginBottom: "14px",
        overflow: "hidden",
      }
    },
      createElement("div", {
        style: {
          width: `${progress}%`,
          height: "100%",
          background: "var(--orca-color-primary)",
          borderRadius: "2px",
          transition: "width 0.25s ease",
        }
      })
    ),

    // 卡片区域
    createElement("div", {
      style: {
        perspective: "800px",
        marginBottom: "14px",
      }
    },
      createElement("div", {
        onClick: handleFlip,
        style: {
          position: "relative",
          width: "100%",
          height: `${cardHeight}px`,
          transformStyle: "preserve-3d",
          transition: isExiting 
            ? "transform 0.25s ease-out, opacity 0.25s ease-out" 
            : "transform 0.4s cubic-bezier(0.4, 0, 0.2, 1)",
          transform: getCardTransform(),
          opacity: isExiting ? 0 : 1,
          cursor: "pointer",
        }
      },
        // 正面
        createElement("div", {
          style: {
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            backfaceVisibility: "hidden",
            borderRadius: "10px",
            padding: "14px 16px",
            boxSizing: "border-box",
            display: "flex",
            flexDirection: "column",
            background: "var(--orca-color-bg-1)",
            border: "1px solid var(--orca-color-border)",
            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.06)",
          }
        },
          // 选择题标签
          currentCard.cardType === "choice" && createElement("div", {
            style: {
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              padding: "3px 8px",
              marginBottom: "10px",
              borderRadius: "4px",
              background: "var(--orca-color-primary)",
              color: "#fff",
              fontSize: "10px",
              fontWeight: 500,
              alignSelf: "flex-start",
            }
          },
            createElement("i", { className: "ti ti-list-check", style: { fontSize: "11px" } }),
            "选择题"
          ),
          // 问题内容
          createElement("div", {
            style: {
              fontSize: "14px",
              lineHeight: 1.6,
              color: "var(--orca-color-text-1)",
              flex: 1,
              overflow: "auto",
            }
          }, currentCard.front),
          // 翻转提示
          createElement("div", {
            style: {
              marginTop: "auto",
              paddingTop: "10px",
              fontSize: "11px",
              color: "var(--orca-color-text-3)",
              display: "flex",
              alignItems: "center",
              gap: "4px",
            }
          },
            createElement("i", { className: "ti ti-rotate", style: { fontSize: "12px" } }),
            "点击查看答案"
          )
        ),

        // 背面
        createElement("div", {
          style: {
            position: "absolute",
            top: 0,
            left: 0,
            width: "100%",
            height: "100%",
            backfaceVisibility: "hidden",
            borderRadius: "10px",
            padding: "14px 16px",
            boxSizing: "border-box",
            display: "flex",
            flexDirection: "column",
            background: "var(--orca-color-primary)",
            transform: "rotateY(180deg)",
            overflow: "auto",
          }
        },
          currentCard.cardType === "choice" && currentCard.options
            // 选择题选项
            ? currentCard.options.map((opt, i) =>
                createElement("div", {
                  key: i,
                  style: {
                    padding: "8px 12px",
                    marginBottom: "6px",
                    borderRadius: "6px",
                    background: opt.isCorrect 
                      ? "rgba(40, 167, 69, 0.9)" 
                      : "rgba(255, 255, 255, 0.12)",
                    color: "#fff",
                    fontSize: "12px",
                    lineHeight: 1.5,
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "8px",
                    border: opt.isCorrect 
                      ? "1px solid rgba(40, 167, 69, 0.4)" 
                      : "1px solid rgba(255, 255, 255, 0.08)",
                  }
                },
                  createElement("span", {
                    style: {
                      width: "18px",
                      height: "18px",
                      borderRadius: "50%",
                      background: opt.isCorrect ? "#28a745" : "rgba(255, 255, 255, 0.2)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "10px",
                      fontWeight: 600,
                      flexShrink: 0,
                    }
                  }, opt.isCorrect ? "✓" : String.fromCharCode(65 + i)),
                  createElement("span", { style: { flex: 1 } }, opt.text)
                )
              )
            // 普通答案
            : createElement("div", {
                style: {
                  fontSize: "14px",
                  lineHeight: 1.6,
                  color: "#fff",
                  flex: 1,
                }
              }, currentCard.back)
        )
      )
    ),

    // 操作按钮
    createElement("div", {
      style: { display: "flex", gap: "10px" }
    },
      // 跳过按钮
      createElement("button", {
        onClick: handleSkip,
        disabled: isExiting || isSaving,
        style: {
          flex: 1,
          padding: "10px 14px",
          borderRadius: "8px",
          border: "1px solid var(--orca-color-border)",
          background: "var(--orca-color-bg-1)",
          color: isExiting || isSaving ? "var(--orca-color-text-3)" : "var(--orca-color-text-2)",
          cursor: isExiting || isSaving ? "not-allowed" : "pointer",
          fontSize: "13px",
          fontWeight: 500,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "5px",
          transition: "all 0.15s",
          opacity: isExiting || isSaving ? 0.6 : 1,
        },
        onMouseEnter: (e: any) => {
          if (!isExiting && !isSaving) {
            e.currentTarget.style.background = "var(--orca-color-bg-2)";
          }
        },
        onMouseLeave: (e: any) => {
          e.currentTarget.style.background = "var(--orca-color-bg-1)";
        },
      },
        createElement("i", { className: "ti ti-x", style: { fontSize: "14px" } }),
        "跳过"
      ),
      // 保留按钮
      createElement("button", {
        onClick: handleKeep,
        disabled: isExiting || isSaving,
        style: {
          flex: 1,
          padding: "10px 14px",
          borderRadius: "8px",
          border: "none",
          background: isExiting || isSaving 
            ? "var(--orca-color-bg-3)" 
            : "var(--orca-color-primary)",
          color: isExiting || isSaving ? "var(--orca-color-text-3)" : "#fff",
          cursor: isExiting || isSaving ? "not-allowed" : "pointer",
          fontSize: "13px",
          fontWeight: 500,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "5px",
          transition: "all 0.15s",
          opacity: isExiting || isSaving ? 0.6 : 1,
        },
        onMouseEnter: (e: any) => {
          if (!isExiting && !isSaving) {
            e.currentTarget.style.filter = "brightness(1.1)";
          }
        },
        onMouseLeave: (e: any) => {
          e.currentTarget.style.filter = "none";
        },
      },
        isSaving 
          ? createElement("i", { 
              className: "ti ti-loader", 
              style: { fontSize: "14px", animation: "spin 1s linear infinite" } 
            })
          : createElement("i", { className: "ti ti-check", style: { fontSize: "14px" } }),
        isSaving ? "保存中..." : "保留"
      )
    )
  );
}
