/**
 * Animated Image Service - 动图处理服务
 *
 * 支持 GIF 和 AVIF 动图的帧切割
 * 将动图转换为多张静态 JPG 图片发送给 AI
 */

import type { FileRef } from "./session-service";

/**
 * 动图帧
 */
export interface AnimatedFrame {
  index: number;
  base64: string;
  mimeType: string;
}

/**
 * 动图处理结果
 */
export interface AnimatedImageResult {
  frames: AnimatedFrame[];
  frameCount: number;
  error?: string;
}

/**
 * 帧提取配置
 */
export interface AnimatedFrameConfig {
  maxFrames: number; // 最大帧数，默认 8
  width?: number; // 缩放宽度，默认 512
  quality?: number; // JPEG 质量，默认 0.8
}

const DEFAULT_CONFIG: AnimatedFrameConfig = {
  maxFrames: 8,
  width: 512,
  quality: 0.8,
};

/**
 * 检查是否为动图文件
 */
export function isAnimatedImage(fileRef: FileRef): boolean {
  const ext = fileRef.name.split(".").pop()?.toLowerCase();
  const isGif = ext === "gif" || fileRef.mimeType === "image/gif";
  const isAvif = ext === "avif" || fileRef.mimeType === "image/avif";
  return isGif || isAvif;
}

/**
 * 处理动图文件，提取帧
 */
export async function processAnimatedImage(
  fileRef: FileRef,
  config: Partial<AnimatedFrameConfig> = {}
): Promise<AnimatedImageResult> {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  try {
    const fullPath = await getFullPath(fileRef.path);
    const frames = await extractAnimatedFrames(fullPath, fileRef.mimeType, cfg);

    return {
      frames,
      frameCount: frames.length,
    };
  } catch (error: any) {
    console.error("[animated-image-service] Process failed:", error);
    return {
      frames: [],
      frameCount: 0,
      error: error.message || "动图处理失败",
    };
  }
}

/**
 * 获取文件完整路径
 */
async function getFullPath(filePath: string): Promise<string> {
  if (filePath.startsWith("./") || filePath.startsWith("../")) {
    const repoDir = orca.state.repoDir;
    if (repoDir) {
      const relativePath = filePath.replace(/^\.\//, "");
      return `${repoDir}/assets/${relativePath}`;
    }
  }
  return filePath;
}

/**
 * 从动图中提取帧
 */
async function extractAnimatedFrames(
  imagePath: string,
  mimeType: string,
  config: AnimatedFrameConfig
): Promise<AnimatedFrame[]> {
  // 对于 GIF，使用专门的 GIF 解析
  if (mimeType === "image/gif") {
    return extractGifFrames(imagePath, config);
  }

  // 对于 AVIF 和其他格式，先加载文件
  let blob: Blob | null = null;

  // 尝试 fetch
  try {
    const fileUrl = `file:///${imagePath.replace(/\\/g, "/")}`;
    const response = await fetch(fileUrl);
    if (response.ok) {
      blob = await response.blob();
    }
  } catch {
    // Fetch failed, try backend
  }

  // 尝试 Orca 后端
  if (!blob) {
    try {
      const arrayBuffer = await orca.invokeBackend("read-file-binary", imagePath);
      if (arrayBuffer) {
        blob = new Blob([arrayBuffer], { type: mimeType });
      }
    } catch {
      // Backend read failed
    }
  }

  if (!blob) {
    throw new Error("Failed to load animated image");
  }

  // 尝试使用 ImageDecoder API
  if ("ImageDecoder" in window) {
    try {
      return await extractFramesFromBlob(blob, mimeType, config);
    } catch {
      // ImageDecoder failed, fall back to single frame
    }
  }

  // 降级：只提取单帧
  return extractSingleFrameFromBlob(blob, config);
}

/**
 * 提取 GIF 帧
 */
async function extractGifFrames(
  imagePath: string,
  config: AnimatedFrameConfig
): Promise<AnimatedFrame[]> {
  // 尝试多种方式加载 GIF
  let blob: Blob | null = null;

  // 方法1: 使用 file:// URL
  const fileUrl = `file:///${imagePath.replace(/\\/g, "/")}`;
  try {
    const response = await fetch(fileUrl);
    if (response.ok) {
      blob = await response.blob();
    }
  } catch {
    // Fetch failed
  }

  // 方法2: 使用 Orca 后端读取
  if (!blob) {
    try {
      const arrayBuffer = await orca.invokeBackend("read-file-binary", imagePath);
      if (arrayBuffer) {
        blob = new Blob([arrayBuffer], { type: "image/gif" });
      }
    } catch {
      // Backend read failed
    }
  }

  if (!blob) {
    throw new Error("Failed to load GIF file");
  }

  const arrayBuffer = await blob.arrayBuffer();

  // 解析 GIF 获取帧数
  const frameCount = countGifFrames(new Uint8Array(arrayBuffer));

  if (frameCount <= 1) {
    // 静态 GIF，直接转换
    return extractSingleFrameFromBlob(blob, config);
  }

  // 尝试使用 ImageDecoder（如果可用）
  if ("ImageDecoder" in window) {
    try {
      return await extractFramesFromBlob(blob, "image/gif", config);
    } catch {
      // ImageDecoder failed for GIF
    }
  }

  // 降级：使用简单的多次采样方法
  return extractGifFramesFallback(blob, frameCount, config);
}

/**
 * 从 Blob 提取单帧
 */
async function extractSingleFrameFromBlob(
  blob: Blob,
  config: AnimatedFrameConfig
): Promise<AnimatedFrame[]> {
  return new Promise((resolve, reject) => {
    const blobUrl = URL.createObjectURL(blob);
    const img = new Image();

    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          URL.revokeObjectURL(blobUrl);
          reject(new Error("Canvas not supported"));
          return;
        }

        const scale = config.width ? config.width / img.naturalWidth : 1;
        canvas.width = Math.round(img.naturalWidth * scale);
        canvas.height = Math.round(img.naturalHeight * scale);

        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        const dataUrl = canvas.toDataURL("image/jpeg", config.quality);
        const base64 = dataUrl.split(",")[1];

        URL.revokeObjectURL(blobUrl);

        resolve([
          {
            index: 0,
            base64,
            mimeType: "image/jpeg",
          },
        ]);
      } catch (e) {
        URL.revokeObjectURL(blobUrl);
        reject(e);
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(blobUrl);
      reject(new Error("Image load failed"));
    };

    img.src = blobUrl;
  });
}

/**
 * 使用 ImageDecoder 从 Blob 提取帧
 */
async function extractFramesFromBlob(
  blob: Blob,
  mimeType: string,
  config: AnimatedFrameConfig
): Promise<AnimatedFrame[]> {
  const arrayBuffer = await blob.arrayBuffer();

  // @ts-ignore - ImageDecoder 是较新的 API
  const decoder = new ImageDecoder({
    data: arrayBuffer,
    type: mimeType,
  });

  await decoder.decode();
  const frameCount = decoder.tracks.selectedTrack?.frameCount || 1;

  const frames: AnimatedFrame[] = [];
  const step = Math.max(1, Math.floor(frameCount / config.maxFrames));

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");

  for (let i = 0; i < frameCount && frames.length < config.maxFrames; i += step) {
    try {
      const result = await decoder.decode({ frameIndex: i });
      const frame = result.image;

      const scale = config.width ? config.width / frame.displayWidth : 1;
      canvas.width = Math.round(frame.displayWidth * scale);
      canvas.height = Math.round(frame.displayHeight * scale);

      ctx.drawImage(frame, 0, 0, canvas.width, canvas.height);
      frame.close();

      const dataUrl = canvas.toDataURL("image/jpeg", config.quality);
      const base64 = dataUrl.split(",")[1];

      frames.push({
        index: i,
        base64,
        mimeType: "image/jpeg",
      });
    } catch {
      // Failed to decode frame, skip
    }
  }

  decoder.close();
  return frames;
}

/**
 * 计算 GIF 帧数（简单解析 GIF 结构）
 */
function countGifFrames(data: Uint8Array): number {
  let count = 0;
  let i = 0;

  // 跳过 GIF 头部 (6 bytes: GIF89a or GIF87a)
  if (data[0] !== 0x47 || data[1] !== 0x49 || data[2] !== 0x46) {
    return 1; // 不是有效的 GIF
  }
  i = 6;

  // 跳过逻辑屏幕描述符 (7 bytes)
  const flags = data[10];
  i = 13;

  // 如果有全局颜色表，跳过它
  if (flags & 0x80) {
    const colorTableSize = 3 * Math.pow(2, (flags & 0x07) + 1);
    i += colorTableSize;
  }

  // 遍历数据块
  while (i < data.length) {
    const blockType = data[i];

    if (blockType === 0x21) {
      // 扩展块
      i += 2;

      // 跳过扩展块数据
      while (i < data.length && data[i] !== 0) {
        i += data[i] + 1;
      }
      i++; // 跳过块终止符
    } else if (blockType === 0x2c) {
      // 图像描述符 = 一帧
      count++;
      i += 10; // 跳过图像描述符

      // 检查局部颜色表
      const localFlags = data[i - 1];
      if (localFlags & 0x80) {
        const localColorTableSize = 3 * Math.pow(2, (localFlags & 0x07) + 1);
        i += localColorTableSize;
      }

      // 跳过 LZW 最小码大小
      i++;

      // 跳过图像数据子块
      while (i < data.length && data[i] !== 0) {
        i += data[i] + 1;
      }
      i++; // 跳过块终止符
    } else if (blockType === 0x3b) {
      // GIF 结束标记
      break;
    } else {
      i++;
    }
  }

  return Math.max(1, count);
}

/**
 * GIF 帧提取后备方案
 * 通过多次渲染同一图片尝试获取不同帧
 */
async function extractGifFramesFallback(
  blob: Blob,
  frameCount: number,
  config: AnimatedFrameConfig
): Promise<AnimatedFrame[]> {
  const frames: AnimatedFrame[] = [];
  const blobUrl = URL.createObjectURL(blob);

  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = reject;
      img.src = blobUrl;
    });

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not supported");

    // 计算缩放尺寸
    const scale = config.width ? config.width / img.naturalWidth : 1;
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);

    // 由于浏览器限制，我们只能获取当前显示的帧
    // 尝试通过延时多次捕获来获取不同帧
    const step = Math.max(1, Math.floor(frameCount / config.maxFrames));
    const captureCount = Math.min(config.maxFrames, frameCount);

    for (let i = 0; i < captureCount; i++) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      const dataUrl = canvas.toDataURL("image/jpeg", config.quality);
      const base64 = dataUrl.split(",")[1];

      frames.push({
        index: i * step,
        base64,
        mimeType: "image/jpeg",
      });

      // 等待一小段时间让 GIF 动画播放到下一帧
      if (i < captureCount - 1) {
        await new Promise((r) => setTimeout(r, 100));
      }
    }
  } finally {
    URL.revokeObjectURL(blobUrl);
  }

  return frames;
}

/**
 * 构建动图内容用于发送给 AI
 */
export async function buildAnimatedImageContentForApi(
  fileRef: FileRef,
  config?: Partial<AnimatedFrameConfig>
): Promise<Array<{ type: string; [key: string]: any }>> {
  const result = await processAnimatedImage(fileRef, config);
  const contents: Array<{ type: string; [key: string]: any }> = [];

  if (result.error || result.frames.length === 0) {
    // 处理失败，返回错误提示
    contents.push({
      type: "text",
      text: `[动图: ${fileRef.name}] (处理失败: ${result.error || "无法提取帧"})`,
    });
    return contents;
  }

  // 添加描述
  contents.push({
    type: "text",
    text: `[动图: ${fileRef.name}, 提取了 ${result.frames.length} 帧]`,
  });

  // 添加帧图片
  for (const frame of result.frames) {
    contents.push({
      type: "image_url",
      image_url: {
        url: `data:${frame.mimeType};base64,${frame.base64}`,
      },
    });
  }

  return contents;
}
