/**
 * ImageGallery Component
 * 显示AI回复中的图片，支持点击放大、来源链接等功能
 */

import { openImagePreview } from "../services/external/image-preview-service";
import { withTooltip } from "../utils/orca-tooltip";

const React = window.React as unknown as {
  createElement: typeof window.React.createElement;
  useState: <T>(initial: T | (() => T)) => [T, (next: T | ((prev: T) => T)) => void];
  useCallback: <T extends (...args: any[]) => any>(fn: T, deps: any[]) => T;
  useMemo: <T>(factory: () => T, deps: any[]) => T;
  useEffect: (effect: () => void | (() => void), deps?: any[]) => void;
  Fragment: typeof window.React.Fragment;
};
const { createElement, useState, useCallback, useMemo, Fragment } = React;

export interface ImageItem {
  url: string;
  title: string;
  sourceUrl?: string;
  width?: number;
  height?: number;
  size?: string;
}

interface ImageGalleryProps {
  images: ImageItem[];
  maxDisplay?: number; // 最多显示多少张图片
  layout?: "grid" | "row"; // 布局方式
}

export default function ImageGallery({ 
  images, 
  maxDisplay = 6,
  layout = "grid" 
}: ImageGalleryProps) {
  const [loadedImages, setLoadedImages] = useState<Set<string>>(new Set());
  const [failedImages, setFailedImages] = useState<Set<string>>(new Set());

  const displayImages = useMemo(() => {
    return images.slice(0, maxDisplay);
  }, [images, maxDisplay]);

  // 过滤掉加载失败的图片，只显示成功加载的
  const visibleImages = useMemo(() => {
    return displayImages.filter(img => !failedImages.has(img.url));
  }, [displayImages, failedImages]);

  const handleImageLoad = useCallback((url: string) => {
    setLoadedImages(prev => new Set([...prev, url]));
  }, []);

  const handleImageError = useCallback((url: string) => {
    setFailedImages(prev => new Set([...prev, url]));
  }, []);

  const handleImageClick = useCallback((image: ImageItem) => {
    // 使用全局预览服务
    openImagePreview({
      url: image.url,
      title: image.title,
      sourceUrl: image.sourceUrl,
      width: image.width,
      height: image.height,
      size: image.size,
    });
  }, []);

  const handleImageDoubleClick = useCallback((image: ImageItem) => {
    // 双击直接打开原图链接（新标签页）
    if (image.sourceUrl) {
      window.open(image.sourceUrl, '_blank', 'noopener,noreferrer');
    }
  }, []);

  const handleSourceClick = useCallback((e: any, sourceUrl: string) => {
    e.stopPropagation();
    window.open(sourceUrl, '_blank', 'noopener,noreferrer');
  }, []);

  if (visibleImages.length === 0 && loadedImages.size === 0 && failedImages.size === displayImages.length) {
    // 所有图片都加载失败，不显示任何内容
    return null;
  }

  if (displayImages.length === 0) {
    return null;
  }

  // 智能布局样式 - 基于实际可见图片数量
  const actualVisibleCount = visibleImages.length > 0 ? visibleImages.length : displayImages.length;

  // 智能布局样式 - 基于图片实际尺寸和数量
  const getResponsiveGridColumns = () => {
    const imageCount = actualVisibleCount;
    if (layout === "row") {
      return `repeat(${Math.min(imageCount, 4)}, minmax(120px, 1fr))`;
    }
    
    // 网格布局：根据图片数量智能调整
    if (imageCount === 1) return "1fr";
    if (imageCount === 2) return "1fr 1fr"; // 两列等宽
    if (imageCount === 3) return "repeat(3, 1fr)"; // 三列等宽
    if (imageCount === 4) return "repeat(2, 1fr)"; // 2x2网格
    if (imageCount === 5) return "repeat(3, 1fr)"; // 3列布局，第一行2张，第二行3张
    if (imageCount === 6) return "repeat(3, 1fr)"; // 3x2网格
    if (imageCount >= 7 && imageCount <= 9) return "repeat(3, 1fr)"; // 3列网格
    if (imageCount >= 10) return "repeat(4, 1fr)"; // 4列网格，适合大量图片
    return "repeat(3, 1fr)"; // 默认3列
  };

  const getGridRows = () => {
    const imageCount = actualVisibleCount;
    // 使用auto而不是1fr，让行高度自适应图片内容
    if (imageCount <= 2) return "auto";
    if (imageCount === 3) return "auto"; // 单行
    if (imageCount === 4) return "auto auto"; // 2行，自适应高度
    if (imageCount === 5) return "auto auto"; // 2行，自适应高度
    if (imageCount === 6) return "auto auto"; // 2行，自适应高度
    if (imageCount >= 7 && imageCount <= 9) return "auto auto auto"; // 3行，自适应高度
    if (imageCount >= 10) return "auto"; // 自适应行数和高度
    return "auto"; // 默认自适应
  };

  const gridStyle: React.CSSProperties = {
    display: "grid",
    gridTemplateColumns: getResponsiveGridColumns(),
    gridTemplateRows: getGridRows(),
    gap: "8px",
    marginTop: "12px",
    marginBottom: "8px",
    width: "100%",
    maxWidth: "min(100%, 600px)",
    // 移除特殊的gridAutoFlow，让所有布局都使用标准的网格流
    gridAutoFlow: "row",
  };

  const rowStyle: React.CSSProperties = {
    display: "flex",
    gap: "8px",
    marginTop: "12px",
    marginBottom: "8px",
    overflowX: "auto",
    paddingBottom: "4px",
    width: "100%",
    maxWidth: "min(100%, 600px)",
    // 让行布局中的项目高度自适应
    alignItems: "flex-start",
  };

  return createElement(
    Fragment,
    null,
    // 图片网格/行 - 只渲染未失败的图片
    createElement(
      "div",
      { style: layout === "grid" ? gridStyle : rowStyle },
      ...displayImages.map((image, index) => {
        const isLoaded = loadedImages.has(image.url);
        
        // 跳过加载失败的图片，不渲染任何内容
        if (failedImages.has(image.url)) {
          return null;
        }
        
        // 计算每张图片的网格位置 - 简化为标准网格布局
        const getGridPosition = (idx: number, totalCount: number) => {
          // 对于5张图片，使用特殊布局：第一行2张，第二行3张
          if (totalCount === 5) {
            if (idx < 2) {
              return { gridColumn: `${idx + 1} / ${idx + 2}` }; // 第一行：第1、2列
            } else {
              return { 
                gridRow: "2",
                gridColumn: `${idx - 1} / ${idx}` // 第二行：第1、2、3列
              };
            }
          }
          // 其他情况使用标准网格流
          return {};
        };

        return createElement(
          "div",
          {
            key: `${image.url}-${index}`,
            style: {
              position: "relative",
              borderRadius: "8px",
              overflow: "hidden",
              cursor: "pointer",
              background: "var(--orca-color-bg-2)",
              border: "1px solid var(--orca-color-border)",
              // 确保容器有合适的高度
              minHeight: "120px",
              aspectRatio: "4/3", // 设置统一的宽高比
              transition: "transform 0.2s, box-shadow 0.2s",
              fontSize: "clamp(10px, 2vw, 12px)",
              // 应用网格位置
              ...getGridPosition(index, displayImages.length),
            },
            onClick: () => handleImageClick(image),
            onDoubleClick: () => handleImageDoubleClick(image),
            onMouseEnter: (e: any) => {
              e.currentTarget.style.transform = "scale(1.02)";
              e.currentTarget.style.boxShadow = "0 4px 12px rgba(0,0,0,0.15)";
            },
            onMouseLeave: (e: any) => {
              e.currentTarget.style.transform = "scale(1)";
              e.currentTarget.style.boxShadow = "none";
            },
          },
          // 图片
          createElement("img", {
            src: image.url,
            alt: image.title,
            style: {
              width: "100%",
              height: "100%", // 填满容器高度
              objectFit: "cover", // 保持比例并填满容器
              display: isLoaded ? "block" : "none",
              minHeight: "120px", // 设置最小高度，确保有内容显示
            },
            onLoad: () => handleImageLoad(image.url),
            onError: () => handleImageError(image.url),
          }),
          // 加载中占位符
          !isLoaded && createElement(
            "div",
            {
              style: {
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                minHeight: "80px", // 给加载状态一个最小高度
                color: "var(--orca-color-text-3)",
                fontSize: "clamp(10px, 2vw, 12px)",
                padding: "8px",
              },
            },
            createElement("i", {
              className: "ti ti-photo",
              style: { 
                fontSize: "clamp(16px, 4vw, 20px)",
                marginBottom: "4px" 
              },
            }),
            createElement("div", null, "加载中...")
          ),
          // 图片信息覆盖层
          isLoaded && createElement(
            "div",
            {
              style: {
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                background: "linear-gradient(transparent, rgba(0,0,0,0.7))",
                color: "white",
                padding: "6px",
                fontSize: "clamp(9px, 1.8vw, 11px)", // 响应式字体
                opacity: 0,
                transition: "opacity 0.2s",
              },
              onMouseEnter: (e: any) => {
                e.currentTarget.style.opacity = "1";
              },
              onMouseLeave: (e: any) => {
                e.currentTarget.style.opacity = "0";
              },
            },
            createElement(
              "div",
              {
                style: {
                  fontWeight: 500,
                  marginBottom: "1px",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                },
              },
              image.title
            ),
            image.width && image.height && createElement(
              "div",
              { 
                style: { 
                  fontSize: "clamp(8px, 1.5vw, 10px)", // 更小的响应式字体
                  opacity: 0.8 
                } 
              },
              `${image.width}×${image.height}${image.size ? ` • ${image.size}` : ""}`
            )
          ),
          // 来源链接按钮
          image.sourceUrl && isLoaded && withTooltip(
            "查看来源",
            createElement(
              "button",
              {
                style: {
                  position: "absolute",
                  top: "4px",
                  right: "4px",
                  background: "rgba(0,0,0,0.6)",
                  border: "none",
                  borderRadius: "3px",
                  color: "white",
                  padding: "3px 5px",
                  fontSize: "clamp(8px, 1.5vw, 10px)", // 响应式字体
                  cursor: "pointer",
                  opacity: 0,
                  transition: "opacity 0.2s",
                  display: "flex",
                  alignItems: "center",
                  gap: "2px",
                },
                onClick: (e: any) => handleSourceClick(e, image.sourceUrl!),
                onMouseEnter: (e: any) => {
                  e.currentTarget.style.opacity = "1";
                  e.currentTarget.style.background = "rgba(0,0,0,0.8)";
                },
                onMouseLeave: (e: any) => {
                  e.currentTarget.style.opacity = "0";
                  e.currentTarget.style.background = "rgba(0,0,0,0.6)";
                },
              },
              createElement("i", {
                className: "ti ti-external-link",
                style: { fontSize: "clamp(10px, 2vw, 12px)" }, // 响应式图标
              })
            )
          )
        );
      })
    ),
    // 图片数量提示
    images.length > maxDisplay && createElement(
      "div",
      {
        style: {
          fontSize: "clamp(9px, 1.8vw, 11px)", // 响应式字体
          color: "var(--orca-color-text-3)",
          textAlign: "center",
          marginTop: "4px",
        },
      },
      `显示 ${maxDisplay} / ${images.length} 张图片`
    )
  );
}
