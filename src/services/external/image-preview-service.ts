/**
 * Image Preview Service
 * 统一的图片预览功能，为MarkdownMessage和ImageGallery提供一致的体验
 */

export interface ImagePreviewItem {
  url: string;
  title: string;
  sourceUrl?: string;
  width?: number;
  height?: number;
  size?: string;
}

// 全局图片预览状态
let currentPreviewImage: ImagePreviewItem | null = null;
let previewCallbacks: Set<(image: ImagePreviewItem | null) => void> = new Set();

/**
 * 打开图片预览
 */
export function openImagePreview(image: ImagePreviewItem) {
  currentPreviewImage = image;
  previewCallbacks.forEach(callback => callback(image));
}

/**
 * 关闭图片预览
 */
export function closeImagePreview() {
  currentPreviewImage = null;
  previewCallbacks.forEach(callback => callback(null));
}

/**
 * 获取当前预览的图片
 */
export function getCurrentPreviewImage(): ImagePreviewItem | null {
  return currentPreviewImage;
}

/**
 * 订阅预览状态变化
 */
export function subscribeToPreview(callback: (image: ImagePreviewItem | null) => void): () => void {
  previewCallbacks.add(callback);
  
  // 返回取消订阅函数
  return () => {
    previewCallbacks.delete(callback);
  };
}

/**
 * 从图片URL创建预览项
 */
export function createImagePreviewItem(
  url: string, 
  title?: string, 
  sourceUrl?: string
): ImagePreviewItem {
  return {
    url,
    title: title || '图片',
    sourceUrl: sourceUrl || url,
  };
}