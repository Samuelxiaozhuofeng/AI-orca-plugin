/**
 * Image Service - 处理图片上传、存储和转换
 * 
 * 功能：
 * - 上传图片到 vault assets 目录
 * - 读取图片转 base64（发送 API 时用）
 * - OCR 识别图片文字
 */

import type { ImageRef } from "./session-service";

/**
 * 支持的图片 MIME 类型
 */
const SUPPORTED_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/gif",
  "image/webp",
];

/**
 * 最大图片大小 (10MB)
 */
const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

/**
 * 从文件路径获取 MIME 类型
 */
function getMimeType(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase() || "";
  const mimeMap: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
  };
  return mimeMap[ext] || "image/png";
}

/**
 * 从文件路径获取文件名
 */
function getFileName(filePath: string): string {
  return filePath.split(/[/\\]/).pop() || "image";
}

/**
 * 上传图片到 vault assets 目录
 * @param filePaths 本地文件路径数组
 * @returns 上传后的 ImageRef 数组
 */
export async function uploadImages(filePaths: string[]): Promise<ImageRef[]> {
  const results: ImageRef[] = [];

  for (const filePath of filePaths) {
    try {
      // 使用 Orca 的 upload-assets API 复制到 vault
      const assetPath = await orca.invokeBackend("upload-assets", [filePath]);
      
      if (assetPath && Array.isArray(assetPath) && assetPath.length > 0) {
        results.push({
          path: assetPath[0], // 返回的是 vault 中的相对路径
          name: getFileName(filePath),
          mimeType: getMimeType(filePath),
        });
      }
    } catch (error) {
      console.error("[image-service] Failed to upload image:", filePath, error);
    }
  }

  return results;
}

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
 * 使用 OCR 识别图片中的文字
 * @param imageRef 图片引用
 * @returns 识别出的文字
 */
export async function ocrImage(imageRef: ImageRef): Promise<string | null> {
  try {
    let imagePath = imageRef.path;
    
    // 如果是相对路径，构建完整路径
    if (!imagePath.startsWith("/") && !imagePath.includes(":")) {
      const repoDir = orca.state.repoDir;
      if (repoDir) {
        const relativePath = imagePath.replace(/^\.\//, "");
        imagePath = `${repoDir}/assets/${relativePath}`;
      }
    }

    const result = await orca.invokeBackend("image-ocr", imagePath);
    return result || null;
  } catch (error) {
    console.error("[image-service] OCR failed:", error);
    return null;
  }
}

/**
 * 获取图片的显示 URL（用于 UI 预览）
 * @param imageRef 图片引用
 * @returns file:// URL
 */
export function getImageDisplayUrl(imageRef: ImageRef): string {
  let fullPath = imageRef.path;
  
  if (imageRef.path.startsWith("./") || imageRef.path.startsWith("../")) {
    const repoDir = orca.state.repoDir;
    if (repoDir) {
      const relativePath = imageRef.path.replace(/^\.\//, "");
      fullPath = `${repoDir}/assets/${relativePath}`;
    }
  }

  return `file:///${fullPath.replace(/\\/g, "/")}`;
}

/**
 * 验证文件是否为支持的图片类型
 */
export function isValidImageFile(file: File): boolean {
  return SUPPORTED_MIME_TYPES.includes(file.type);
}

/**
 * 从 File 对象创建 ImageRef（用于拖拽/粘贴）
 * 会先上传到 vault
 */
export async function createImageRefFromFile(file: File): Promise<ImageRef | null> {
  if (!isValidImageFile(file)) {
    console.warn("[image-service] Unsupported image type:", file.type);
    return null;
  }

  if (file.size > MAX_IMAGE_SIZE) {
    console.warn("[image-service] Image too large:", file.size);
    return null;
  }

  try {
    // 读取文件为 ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();
    
    // 使用 upload-asset-binary 上传
    const assetPath = await orca.invokeBackend(
      "upload-asset-binary",
      file.type,
      arrayBuffer
    );

    if (assetPath) {
      return {
        path: assetPath,
        name: file.name,
        mimeType: file.type,
      };
    }
  } catch (error) {
    console.error("[image-service] Failed to upload file:", error);
  }

  return null;
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
