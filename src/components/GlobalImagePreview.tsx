/**
 * Global Image Preview Component
 * 全局图片预览模态框，提供统一的图片预览体验
 */

import { subscribeToPreview, closeImagePreview, getCurrentPreviewImage, type ImagePreviewItem } from "../services/external/image-preview-service";
import { withTooltip } from "../utils/orca-tooltip";

const React = window.React as unknown as {
  createElement: typeof window.React.createElement;
  useState: <T>(initial: T | (() => T)) => [T, (next: T | ((prev: T) => T)) => void];
  useEffect: (effect: () => void | (() => void), deps?: any[]) => void;
  useCallback: <T extends (...args: any[]) => any>(fn: T, deps: any[]) => T;
  Fragment: typeof window.React.Fragment;
};
const { createElement, useState, useEffect, useCallback, Fragment } = React;

export default function GlobalImagePreview() {
  const [selectedImage, setSelectedImage] = useState<ImagePreviewItem | null>(null);

  // 订阅预览状态变化
  useEffect(() => {
    const unsubscribe = subscribeToPreview((image) => {
      setSelectedImage(image);
    });

    // 初始化当前状态
    setSelectedImage(getCurrentPreviewImage());

    return unsubscribe;
  }, []);

  const handleCloseModal = useCallback(() => {
    closeImagePreview();
  }, []);

  const handleSourceClick = useCallback((e: any, sourceUrl: string) => {
    e.stopPropagation();
    window.open(sourceUrl, '_blank', 'noopener,noreferrer');
  }, []);

  const handleSystemOpen = useCallback((url: string) => {
    // 尝试使用orca的系统打开功能
    if (typeof orca !== 'undefined' && orca.invokeBackend) {
      orca.invokeBackend("shell-open", url);
    } else {
      // 降级到浏览器打开
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  }, []);

  if (!selectedImage) {
    return null;
  }

  return createElement(
    "div",
    {
      style: {
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: "rgba(0,0,0,0.8)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 10000, // 确保在最顶层
        padding: "20px",
      },
      onClick: handleCloseModal,
    },
    createElement(
      "div",
      {
        style: {
          position: "relative",
          maxWidth: "90vw",
          maxHeight: "90vh",
          background: "var(--orca-color-bg-1)",
          borderRadius: "12px",
          overflow: "hidden",
          boxShadow: "0 20px 40px rgba(0,0,0,0.3)",
        },
        onClick: (e: any) => e.stopPropagation(),
      },
      // 关闭按钮
      createElement(
        "button",
        {
          style: {
            position: "absolute",
            top: "12px",
            right: "12px",
            background: "rgba(0,0,0,0.6)",
            border: "none",
            borderRadius: "50%",
            color: "white",
            width: "32px",
            height: "32px",
            cursor: "pointer",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1,
            transition: "background 0.2s",
          },
          onClick: handleCloseModal,
          onMouseEnter: (e: any) => {
            e.currentTarget.style.background = "rgba(0,0,0,0.8)";
          },
          onMouseLeave: (e: any) => {
            e.currentTarget.style.background = "rgba(0,0,0,0.6)";
          },
        },
        createElement("i", {
          className: "ti ti-x",
          style: { fontSize: "18px" },
        })
      ),
      // 大图
      createElement("img", {
        src: selectedImage.url,
        alt: selectedImage.title,
        style: {
          maxWidth: "100%",
          maxHeight: "calc(90vh - 100px)",
          objectFit: "contain",
          display: "block",
        },
      }),
      // 图片信息
      createElement(
        "div",
        {
          style: {
            padding: "12px 16px",
            borderTop: "1px solid var(--orca-color-border)",
            background: "var(--orca-color-bg-2)",
          },
        },
        createElement(
          "div",
          {
            style: {
              fontWeight: 500,
              marginBottom: "6px",
              color: "var(--orca-color-text-1)",
              fontSize: "clamp(13px, 2.5vw, 15px)",
            },
          },
          selectedImage.title
        ),
        createElement(
          "div",
          {
            style: {
              display: "flex",
              alignItems: "center",
              gap: "12px",
              fontSize: "clamp(11px, 2vw, 13px)",
              color: "var(--orca-color-text-2)",
              flexWrap: "wrap",
            },
          },
          selectedImage.width && selectedImage.height && createElement(
            "span",
            null,
            `${selectedImage.width} × ${selectedImage.height}`
          ),
          selectedImage.size && createElement("span", null, selectedImage.size),
          createElement(
            "div",
            {
              style: {
                display: "flex",
                gap: "8px",
                marginLeft: "auto",
              },
            },
            // 复制图片链接按钮
            withTooltip(
              "复制图片链接",
              createElement(
                "button",
                {
                  style: {
                    background: "var(--orca-color-bg-3)",
                    color: "var(--orca-color-text-1)",
                    border: "1px solid var(--orca-color-border)",
                    borderRadius: "4px",
                    padding: "4px 8px",
                    fontSize: "clamp(10px, 1.8vw, 12px)",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                    minWidth: "fit-content",
                  },
                  onClick: () => {
                    navigator.clipboard.writeText(selectedImage.url).then(() => {
                      console.log('图片链接已复制');
                    });
                  },
                },
                createElement("i", {
                  className: "ti ti-copy",
                  style: { fontSize: "clamp(10px, 1.8vw, 12px)" },
                }),
                "复制链接"
              )
            ),
            // 系统打开按钮
            withTooltip(
              "在系统中打开",
              createElement(
                "button",
                {
                  style: {
                    background: "var(--orca-color-bg-3)",
                    color: "var(--orca-color-text-1)",
                    border: "1px solid var(--orca-color-border)",
                    borderRadius: "4px",
                    padding: "4px 8px",
                    fontSize: "clamp(10px, 1.8vw, 12px)",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                    minWidth: "fit-content",
                  },
                  onClick: () => handleSystemOpen(selectedImage.url),
                },
                createElement("i", {
                  className: "ti ti-external-link",
                  style: { fontSize: "clamp(10px, 1.8vw, 12px)" },
                }),
                "系统打开"
              )
            ),
            // 查看来源按钮（如果有不同的来源URL）
            selectedImage.sourceUrl && selectedImage.sourceUrl !== selectedImage.url && withTooltip(
              "查看来源",
              createElement(
                "button",
                {
                  style: {
                    background: "var(--orca-color-bg-3)",
                    color: "var(--orca-color-text-1)",
                    border: "1px solid var(--orca-color-border)",
                    borderRadius: "4px",
                    padding: "4px 8px",
                    fontSize: "clamp(10px, 1.8vw, 12px)",
                    cursor: "pointer",
                    display: "flex",
                    alignItems: "center",
                    gap: "4px",
                    minWidth: "fit-content",
                  },
                  onClick: (e: any) => handleSourceClick(e, selectedImage.sourceUrl!),
                },
                createElement("i", {
                  className: "ti ti-external-link",
                  style: { fontSize: "clamp(10px, 1.8vw, 12px)" },
                }),
                "查看来源"
              )
            )
          )
        )
      )
    )
  );
}
