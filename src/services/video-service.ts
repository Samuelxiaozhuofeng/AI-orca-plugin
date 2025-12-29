/**
 * Video Service - 视频处理服务
 *
 * 技术原理：
 * 1. 视觉维度：抽取关键帧（每秒1-2帧）
 * 2. 时间维度：保留帧的时间戳信息
 * 3. 听觉维度：提取音频进行语音识别
 *
 * 处理模式：
 * - full: 完整处理（抽帧 + 音频识别）
 * - audio-only: 仅提取音频转文字
 * - frames-only: 仅抽取关键帧
 *
 * 输出：多张图片 + 音频转文字，供 AI 理解视频内容
 */

import type { FileRef, VideoProcessMode } from "./session-service";

/**
 * 视频处理结果
 */
export interface VideoProcessResult {
  frames: VideoFrame[]; // 抽取的关键帧
  audioText?: string; // 音频转文字结果
  duration?: number; // 视频时长（秒）
  error?: string;
  mode?: VideoProcessMode; // 处理模式
}

/**
 * 视频帧
 */
export interface VideoFrame {
  timestamp: number; // 时间戳（秒）
  base64: string; // 图片 base64
  mimeType: string;
}

/**
 * 抽帧配置
 */
export interface FrameExtractionConfig {
  fps: number; // 每秒抽取帧数，默认 1
  maxFrames: number; // 最大帧数，默认 10
  width?: number; // 缩放宽度，默认 512
  mode?: VideoProcessMode; // 处理模式
}

const DEFAULT_CONFIG: FrameExtractionConfig = {
  fps: 1,
  maxFrames: 10,
  width: 512,
  mode: "full",
};

/**
 * 处理视频文件
 * 根据模式选择处理方式
 */
export async function processVideo(
  fileRef: FileRef,
  config: Partial<FrameExtractionConfig> = {}
): Promise<VideoProcessResult> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  // 优先使用 fileRef 中的 videoMode
  const mode = fileRef.videoMode || cfg.mode || "full";

  try {
    // 获取视频完整路径
    const videoPath = await getFullPath(fileRef.path);

    // 根据模式处理
    if (mode === "audio-only") {
      // 仅音频模式
      const audioText = await extractAudioText(videoPath);
      return {
        frames: [],
        audioText,
        mode,
      };
    }

    if (mode === "frames-only") {
      // 仅抽帧模式
      const framesResult = await extractFrames(videoPath, cfg);
      return {
        frames: framesResult.frames,
        duration: framesResult.duration,
        mode,
      };
    }

    // 完整模式：并行处理抽帧 + 音频识别
    const [framesResult, audioResult] = await Promise.all([
      extractFrames(videoPath, cfg),
      extractAudioText(videoPath),
    ]);

    return {
      frames: framesResult.frames,
      duration: framesResult.duration,
      audioText: audioResult,
      mode,
    };
  } catch (error: any) {
    console.error("[video-service] Process video failed:", error);
    return {
      frames: [],
      error: error.message || "视频处理失败",
      mode,
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
 * 使用 Canvas 从视频中抽取帧
 * 浏览器端实现，无需 FFmpeg
 */
async function extractFrames(
  videoPath: string,
  config: FrameExtractionConfig
): Promise<{ frames: VideoFrame[]; duration: number }> {
  return new Promise(async (resolve, reject) => {
    const video = document.createElement("video");
    video.muted = true;
    video.preload = "metadata";

    const frames: VideoFrame[] = [];
    let duration = 0;
    let blobUrl: string | null = null;

    // 清理函数
    const cleanup = () => {
      video.remove();
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }
    };

    video.onloadedmetadata = async () => {
      duration = video.duration;

      // 计算抽帧时间点
      const interval = 1 / config.fps;
      const timestamps: number[] = [];

      for (let t = 0; t < duration && timestamps.length < config.maxFrames; t += interval) {
        timestamps.push(t);
      }

      // 确保包含最后一帧
      if (timestamps.length < config.maxFrames && duration > 0) {
        const lastTs = timestamps[timestamps.length - 1];
        if (duration - lastTs > interval * 0.5) {
          timestamps.push(duration - 0.1);
        }
      }

      console.log(`[video-service] Extracting ${timestamps.length} frames from ${duration.toFixed(1)}s video`);

      // 创建 Canvas
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        cleanup();
        reject(new Error("Canvas not supported"));
        return;
      }

      // 计算缩放尺寸
      const scale = config.width ? config.width / video.videoWidth : 1;
      canvas.width = Math.round(video.videoWidth * scale);
      canvas.height = Math.round(video.videoHeight * scale);

      // 逐帧抽取
      for (const timestamp of timestamps) {
        try {
          const frame = await captureFrame(video, canvas, ctx, timestamp);
          frames.push(frame);
        } catch (err) {
          console.warn(`[video-service] Failed to capture frame at ${timestamp}s:`, err);
        }
      }

      cleanup();
      resolve({ frames, duration });
    };

    video.onerror = (e) => {
      console.error("[video-service] Video load error:", e);
      cleanup();
      reject(new Error("视频加载失败"));
    };

    // 尝试多种方式加载视频
    loadVideoSource(videoPath).then(url => {
      blobUrl = url;
      video.src = url;
    }).catch(err => {
      cleanup();
      reject(err);
    });
  });
}

/**
 * 加载视频源，返回可用的 URL
 */
async function loadVideoSource(videoPath: string): Promise<string> {
  // 方法1: 尝试使用 fetch + Blob URL
  try {
    const fileUrl = `file:///${videoPath.replace(/\\/g, "/")}`;
    const response = await fetch(fileUrl);
    if (response.ok) {
      const blob = await response.blob();
      return URL.createObjectURL(blob);
    }
  } catch (e) {
    console.log("[video-service] Fetch failed, trying alternative methods");
  }

  // 方法2: 尝试使用 Orca 后端读取文件
  try {
    const arrayBuffer = await orca.invokeBackend("read-file-binary", videoPath);
    if (arrayBuffer) {
      const blob = new Blob([arrayBuffer], { type: "video/mp4" });
      return URL.createObjectURL(blob);
    }
  } catch (e) {
    console.log("[video-service] Backend read failed");
  }

  // 方法3: 直接使用 file:// URL（某些环境可能支持）
  return `file:///${videoPath.replace(/\\/g, "/")}`;
}

/**
 * 捕获单帧
 */
function captureFrame(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  timestamp: number
): Promise<VideoFrame> {
  return new Promise((resolve, reject) => {
    const onSeeked = () => {
      video.removeEventListener("seeked", onSeeked);
      
      try {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
        const base64 = dataUrl.split(",")[1];
        
        resolve({
          timestamp,
          base64,
          mimeType: "image/jpeg",
        });
      } catch (err) {
        reject(err);
      }
    };

    video.addEventListener("seeked", onSeeked);
    video.currentTime = timestamp;

    // 超时处理
    setTimeout(() => {
      video.removeEventListener("seeked", onSeeked);
      reject(new Error("Seek timeout"));
    }, 5000);
  });
}

/**
 * 提取视频音频并转文字
 * 尝试使用 Orca 后端的语音识别
 */
async function extractAudioText(videoPath: string): Promise<string | undefined> {
  try {
    // 尝试调用后端的音频识别 API
    const result = await orca.invokeBackend("video-to-text", videoPath);
    if (result && typeof result === "string") {
      return result;
    }
    
    // 备选：尝试 audio-transcribe API
    const audioResult = await orca.invokeBackend("audio-transcribe", videoPath);
    if (audioResult && typeof audioResult === "string") {
      return audioResult;
    }
  } catch (error) {
    console.log("[video-service] Audio extraction not available:", error);
  }
  
  return undefined;
}

/**
 * 构建视频内容用于发送给 AI
 * 根据处理模式返回不同内容：
 * - full: 关键帧图片 + 音频文字
 * - audio-only: 仅音频文字
 * - frames-only: 仅关键帧图片
 */
export async function buildVideoContentForApi(
  fileRef: FileRef,
  config?: Partial<FrameExtractionConfig>
): Promise<Array<{ type: string; [key: string]: any }>> {
  const result = await processVideo(fileRef, config);
  const contents: Array<{ type: string; [key: string]: any }> = [];
  const mode = result.mode || fileRef.videoMode || "full";

  // 仅音频模式
  if (mode === "audio-only") {
    if (result.audioText) {
      contents.push({
        type: "text",
        text: `[视频音频: ${fileRef.name}]\n音频内容: "${result.audioText}"`,
      });
    } else {
      contents.push({
        type: "text",
        text: `[视频: ${fileRef.name}] (音频识别失败或无音频内容)`,
      });
    }
    return contents;
  }

  // 如果抽帧失败或没有帧，尝试直接发送视频
  if (result.error || result.frames.length === 0) {
    console.log("[video-service] Frame extraction failed, trying direct video upload");

    // 尝试直接发送视频 base64
    const base64 = await videoToBase64(fileRef);
    if (base64) {
      contents.push({
        type: "text",
        text: `[视频: ${fileRef.name}]${result.audioText ? `\n[音频内容: "${result.audioText}"]` : ""}`,
      });
      contents.push({
        type: "video_url",
        video_url: {
          url: `data:${fileRef.mimeType};base64,${base64}`,
        },
      });
      return contents;
    }

    // 完全失败，但如果有音频内容还是返回
    if (result.audioText) {
      contents.push({
        type: "text",
        text: `[视频: ${fileRef.name}] (视频处理失败)\n[音频内容: "${result.audioText}"]`,
      });
      return contents;
    }

    contents.push({
      type: "text",
      text: `[视频: ${fileRef.name}] (无法处理，请确保视频格式正确)`,
    });
    return contents;
  }

  // 添加视频描述
  let description = `[视频: ${fileRef.name}`;
  if (result.duration) {
    description += `, 时长: ${result.duration.toFixed(1)}秒`;
  }
  if (mode === "frames-only") {
    description += `, 仅抽帧模式`;
  }
  description += `, 抽取了 ${result.frames.length} 帧]`;

  if (result.audioText && mode === "full") {
    description += `\n[音频内容: "${result.audioText}"]`;
  }

  contents.push({ type: "text", text: description });

  // 添加关键帧图片
  for (const frame of result.frames) {
    contents.push({
      type: "image_url",
      image_url: {
        url: `data:${frame.mimeType};base64,${frame.base64}`,
      },
    });

    // 添加时间戳标注
    contents.push({
      type: "text",
      text: `[帧 @ ${frame.timestamp.toFixed(1)}s]`,
    });
  }

  return contents;
}

/**
 * 视频转 base64（用于直接发送）
 */
async function videoToBase64(fileRef: FileRef): Promise<string | null> {
  try {
    const fullPath = await getFullPath(fileRef.path);
    
    // 尝试 fetch
    try {
      const response = await fetch(`file:///${fullPath.replace(/\\/g, "/")}`);
      if (response.ok) {
        const blob = await response.blob();
        return new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            const result = reader.result as string;
            resolve(result.split(",")[1]);
          };
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      }
    } catch (e) {
      console.log("[video-service] Fetch for base64 failed");
    }

    // 尝试后端读取
    try {
      const arrayBuffer = await orca.invokeBackend("read-file-binary", fullPath);
      if (arrayBuffer) {
        const bytes = new Uint8Array(arrayBuffer);
        let binary = "";
        for (let i = 0; i < bytes.length; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
      }
    } catch (e) {
      console.log("[video-service] Backend read for base64 failed");
    }

    return null;
  } catch (error) {
    console.error("[video-service] videoToBase64 failed:", error);
    return null;
  }
}

/**
 * 检查是否为视频文件
 */
export function isVideoFile(fileRef: FileRef): boolean {
  return fileRef.category === "video" || 
    fileRef.mimeType.startsWith("video/") ||
    /\.(mp4|webm|mov|avi|mkv|m4v)$/i.test(fileRef.name);
}

/**
 * 生成视频缩略图
 * 从视频第一帧或指定时间点生成缩略图
 */
export async function generateVideoThumbnail(
  videoFile: File,
  timestamp: number = 0.5,
  width: number = 120
): Promise<string | null> {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.muted = true;
    video.preload = "metadata";

    let blobUrl: string | null = null;

    const cleanup = () => {
      video.remove();
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }
    };

    const captureThumb = () => {
      try {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          cleanup();
          resolve(null);
          return;
        }

        // 计算缩放尺寸
        const scale = width / video.videoWidth;
        canvas.width = width;
        canvas.height = Math.round(video.videoHeight * scale);

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
        const base64 = dataUrl.split(",")[1];

        cleanup();
        resolve(base64);
      } catch (err) {
        console.error("[video-service] Thumbnail capture failed:", err);
        cleanup();
        resolve(null);
      }
    };

    video.onloadedmetadata = () => {
      // 确保时间点在视频范围内
      const seekTime = Math.min(timestamp, video.duration * 0.1 || 0.5);
      video.currentTime = seekTime;
    };

    video.onseeked = captureThumb;

    video.onerror = () => {
      console.error("[video-service] Video load error for thumbnail");
      cleanup();
      resolve(null);
    };

    // 超时处理
    setTimeout(() => {
      cleanup();
      resolve(null);
    }, 5000);

    // 加载视频
    blobUrl = URL.createObjectURL(videoFile);
    video.src = blobUrl;
  });
}
