/**
 * Orca Image Extractor - 从消息中提取 Orca 笔记图片链接
 * 
 * 支持格式：
 * - [!image(...)](orca-block:xxx) - Orca 笔记中的图片引用
 * - ![alt](orca-block:xxx) - 标准 markdown 图片格式引用 block
 * 
 * 工作流程：
 * 1. 解析消息中的 orca-block 图片链接
 * 2. 通过 Orca API 获取 block 内容
 * 3. 从 block 中提取图片路径
 * 4. 转换为 base64 发送给 AI
 */

import type { ImageRef } from "../services/session-service";
import { imageToBase64 } from "../services/image-service";

/**
 * 图片链接匹配结果
 */
export interface OrcaImageMatch {
  fullMatch: string;       // 完整匹配的文本
  blockId: number;         // block ID
  altText?: string;        // 替代文本
  startIndex: number;      // 在原文中的起始位置
  endIndex: number;        // 在原文中的结束位置
}

/**
 * 提取的图片信息
 */
export interface ExtractedImage {
  blockId: number;
  path: string;            // 图片路径
  mimeType: string;
  base64?: string;         // base64 编码（可选，按需加载）
  altText?: string;
}

/**
 * 匹配 Orca 图片链接的正则表达式
 * 
 * 支持的格式：
 * 1. [!image(path)](orca-block:123) - Orca 内部格式
 * 2. ![alt](orca-block:123) - 标准 markdown 图片格式
 * 3. [图片描述](orca-block:123) - 带描述的链接（可能是图片 block）
 */
const ORCA_IMAGE_PATTERNS = [
  // [!image(xxx)](orca-block:123) - Orca 内部图片格式
  /\[!image\([^\)]*\)\]\(orca-block:(\d+)\)/gi,
  // ![alt](orca-block:123) - 标准 markdown 图片格式
  /!\[([^\]]*)\]\(orca-block:(\d+)\)/gi,
];

/**
 * 从文本中提取所有 Orca 图片链接
 */
export function extractOrcaImageLinks(text: string): OrcaImageMatch[] {
  const matches: OrcaImageMatch[] = [];
  
  for (const pattern of ORCA_IMAGE_PATTERNS) {
    // 重置正则表达式的 lastIndex
    pattern.lastIndex = 0;
    
    let match;
    while ((match = pattern.exec(text)) !== null) {
      // 根据不同的模式提取 blockId
      let blockId: number;
      let altText: string | undefined;
      
      if (match[0].startsWith("[!image")) {
        // [!image(xxx)](orca-block:123) 格式
        blockId = parseInt(match[1], 10);
      } else {
        // ![alt](orca-block:123) 格式
        altText = match[1] || undefined;
        blockId = parseInt(match[2], 10);
      }
      
      if (!isNaN(blockId)) {
        matches.push({
          fullMatch: match[0],
          blockId,
          altText,
          startIndex: match.index,
          endIndex: match.index + match[0].length,
        });
      }
    }
  }
  
  // 按位置排序，去重
  const seen = new Set<string>();
  return matches
    .filter(m => {
      const key = `${m.blockId}-${m.startIndex}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => a.startIndex - b.startIndex);
}

/**
 * 从 Block 中提取图片路径
 * 
 * Block 可能的图片存储方式：
 * 1. content 中包含 image 类型的 fragment
 * 2. properties 中包含 image/attachmentUrl 字段
 * 3. text 字段包含图片路径
 */
async function extractImagePathFromBlock(blockId: number): Promise<string | null> {
  try {
    const block = await orca.invokeBackend("get-block", blockId);
    if (!block) {
      console.warn(`[orca-image-extractor] Block ${blockId} not found`);
      return null;
    }
    
    // 1. 检查 content fragments
    if (block.content && Array.isArray(block.content)) {
      for (const fragment of block.content) {
        // 图片类型的 fragment
        if (fragment.t === "image" && fragment.v) {
          return fragment.v;
        }
        // 附件类型
        if (fragment.t === "attachment" && fragment.v) {
          const path = typeof fragment.v === "string" ? fragment.v : fragment.v.path;
          if (path && isImagePath(path)) {
            return path;
          }
        }
      }
    }
    
    // 2. 检查 properties
    if (block.properties && Array.isArray(block.properties)) {
      for (const prop of block.properties) {
        if ((prop.name === "image" || prop.name === "attachmentUrl") && prop.value) {
          const path = typeof prop.value === "string" ? prop.value : prop.value.path;
          if (path && isImagePath(path)) {
            return path;
          }
        }
      }
    }
    
    // 3. 检查 text 字段（可能直接是图片路径）
    if (block.text && isImagePath(block.text)) {
      return block.text;
    }
    
    console.warn(`[orca-image-extractor] No image found in block ${blockId}`);
    return null;
  } catch (error) {
    console.error(`[orca-image-extractor] Failed to get block ${blockId}:`, error);
    return null;
  }
}

/**
 * 检查路径是否为图片
 */
function isImagePath(path: string): boolean {
  const imageExtensions = [".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg"];
  const lowerPath = path.toLowerCase();
  return imageExtensions.some(ext => lowerPath.endsWith(ext));
}

/**
 * 从路径获取 MIME 类型
 */
function getMimeTypeFromPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase() || "";
  const mimeMap: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    webp: "image/webp",
    bmp: "image/bmp",
    svg: "image/svg+xml",
  };
  return mimeMap[ext] || "image/png";
}

/**
 * 获取图片的完整路径
 */
function getFullImagePath(imagePath: string): string {
  // 如果已经是绝对路径，直接返回
  if (imagePath.startsWith("/") || imagePath.includes(":")) {
    return imagePath;
  }
  
  // 相对路径，拼接 repo 目录
  const repoDir = orca.state.repoDir;
  if (repoDir) {
    // 移除开头的 ./ 或 ../
    const relativePath = imagePath.replace(/^\.\//, "").replace(/^\.\.\//, "");
    // 检查是否在 assets 目录下
    if (!relativePath.startsWith("assets/")) {
      return `${repoDir}/assets/${relativePath}`;
    }
    return `${repoDir}/${relativePath}`;
  }
  
  return imagePath;
}

/**
 * 从 Orca block 提取图片并转换为 base64
 */
export async function extractOrcaImage(blockId: number): Promise<ExtractedImage | null> {
  const imagePath = await extractImagePathFromBlock(blockId);
  if (!imagePath) {
    return null;
  }
  
  const fullPath = getFullImagePath(imagePath);
  const mimeType = getMimeTypeFromPath(imagePath);
  
  // 创建 ImageRef 并转换为 base64
  const imageRef: ImageRef = {
    path: fullPath,
    name: imagePath.split("/").pop() || "image",
    mimeType,
  };
  
  const base64 = await imageToBase64(imageRef);
  
  return {
    blockId,
    path: fullPath,
    mimeType,
    base64: base64 || undefined,
  };
}

/**
 * 从消息文本中提取所有 Orca 图片并转换为 base64
 * 
 * @param text 消息文本
 * @returns 提取的图片列表和清理后的文本
 */
export async function extractOrcaImagesFromText(text: string): Promise<{
  images: ExtractedImage[];
  cleanedText: string;
}> {
  const matches = extractOrcaImageLinks(text);
  
  if (matches.length === 0) {
    return { images: [], cleanedText: text };
  }
  
  const images: ExtractedImage[] = [];
  let cleanedText = text;
  
  // 从后往前替换，避免索引偏移
  for (let i = matches.length - 1; i >= 0; i--) {
    const match = matches[i];
    const image = await extractOrcaImage(match.blockId);
    
    if (image) {
      image.altText = match.altText;
      images.unshift(image); // 保持原始顺序
      
      // 替换为描述文本
      const replacement = match.altText 
        ? `[图片: ${match.altText}]` 
        : `[图片 #${match.blockId}]`;
      cleanedText = cleanedText.slice(0, match.startIndex) + replacement + cleanedText.slice(match.endIndex);
    }
  }
  
  return { images, cleanedText };
}

/**
 * 检查文本是否包含 Orca 图片链接
 */
export function hasOrcaImageLinks(text: string): boolean {
  return ORCA_IMAGE_PATTERNS.some(pattern => {
    pattern.lastIndex = 0;
    return pattern.test(text);
  });
}
