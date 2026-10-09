/**
 * Image Service - 处理图片上传、存储和转换
 * 
 * 功能：
 * - 上传图片到 vault assets 目录
 * - 读取图片转 base64（发送 API 时用）
 * - OCR 识别图片文字
 */

import type { ImageRef } from "../session-service";

/**
 * 支持的图片 MIME 类型（包括动图）
 */
const SUPPORTED_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/gif",
  "image/webp",
  "image/avif",
];

/**
 * 最大图片大小 (20MB，动图可能较大)
 */
const MAX_IMAGE_SIZE = 20 * 1024 * 1024;

/**
 * 读取图片并转换为 base64
 * @param imageRef 图片引用
 * @returns base64 字符串（不含 data: 前缀）
 */
export async function imageToBase64(imageRef: ImageRef): Promise<string | null> {
  try {
    // 构建完整路径
    let fullPath = imageRef.path;
    if (imageRef.path.startsWith("./") || imageRef.path.startsWith("../")) {
      const repoDir = orca.state.repoDir;
      if (repoDir) {
        const relativePath = imageRef.path.replace(/^\.\//, "");
        fullPath = `${repoDir}/assets/${relativePath}`;
      }
    }

    // 使用 fetch 读取本地文件
    const response = await fetch(`file:///${fullPath.replace(/\\/g, "/")}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.status}`);
    }

    const blob = await response.blob();
    
    // 检查大小
    if (blob.size > MAX_IMAGE_SIZE) {
      console.warn("[image-service] Image too large:", blob.size);
      return null;
    }

    // 转换为 base64
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        // 移除 data:image/xxx;base64, 前缀
        const base64 = result.split(",")[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error("[image-service] Failed to convert image to base64:", error);
    return null;
  }
}

/**
 * 验证文件是否为支持的图片类型
 */
export function isValidImageFile(file: File): boolean {
  return SUPPORTED_MIME_TYPES.includes(file.type);
}

/**
 * 构建发送给 API 的图片内容（OpenAI 格式）
 */
export async function buildImageContent(
  imageRef: ImageRef
): Promise<{ type: "image_url"; image_url: { url: string } } | null> {
  const base64 = await imageToBase64(imageRef);
  if (!base64) return null;

  return {
    type: "image_url",
    image_url: {
      url: `data:${imageRef.mimeType};base64,${base64}`,
    },
  };
}
