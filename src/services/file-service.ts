/**
 * File Service - 处理各种文件类型的导入
 *
 * 支持的文件类型：
 * - 图片：PNG, JPEG, GIF, WebP
 * - 视频：MP4, WebM, MOV（抽帧+音频识别）
 * - 音频：MP3, WAV, OGG
 * - 文档：PDF, TXT, Markdown, Word (docx)
 * - 代码：各种编程语言
 * - 数据：CSV, JSON, Excel (xlsx)
 */

import type { FileRef } from "./session-service";
import { buildVideoContentForApi, isVideoFile, generateVideoThumbnail } from "./video-service";
import { parseDocument } from "./document-parser";

/**
 * 文件类型分类
 */
export type FileCategory = "image" | "video" | "audio" | "document" | "code" | "data" | "other";

/**
 * 支持的文件类型配置
 */
interface FileTypeConfig {
  extensions: string[];
  mimeTypes: string[];
  category: FileCategory;
  maxSize: number; // bytes
  icon: string; // Tabler icon class
  canPreview: boolean;
  extractText: boolean; // 是否需要提取文本内容
}

const FILE_TYPE_CONFIGS: Record<string, FileTypeConfig> = {
  // 图片类型
  image: {
    extensions: ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"],
    mimeTypes: ["image/png", "image/jpeg", "image/gif", "image/webp", "image/bmp", "image/svg+xml"],
    category: "image",
    maxSize: 10 * 1024 * 1024, // 10MB
    icon: "ti ti-photo",
    canPreview: true,
    extractText: false,
  },
  // 视频类型
  video: {
    extensions: ["mp4", "webm", "mov", "avi", "mkv", "m4v"],
    mimeTypes: ["video/mp4", "video/webm", "video/quicktime", "video/x-msvideo", "video/x-matroska"],
    category: "video",
    maxSize: 100 * 1024 * 1024, // 100MB
    icon: "ti ti-video",
    canPreview: true,
    extractText: false,
  },
  // 音频类型
  audio: {
    extensions: ["mp3", "wav", "ogg", "m4a", "flac", "aac"],
    mimeTypes: ["audio/mpeg", "audio/wav", "audio/ogg", "audio/mp4", "audio/flac", "audio/aac"],
    category: "audio",
    maxSize: 50 * 1024 * 1024, // 50MB
    icon: "ti ti-music",
    canPreview: false,
    extractText: false,
  },
  // PDF
  pdf: {
    extensions: ["pdf"],
    mimeTypes: ["application/pdf"],
    category: "document",
    maxSize: 20 * 1024 * 1024, // 20MB
    icon: "ti ti-file-type-pdf",
    canPreview: false,
    extractText: true,
  },
  // 纯文本
  text: {
    extensions: ["txt", "log", "ini", "cfg", "conf"],
    mimeTypes: ["text/plain"],
    category: "document",
    maxSize: 5 * 1024 * 1024, // 5MB
    icon: "ti ti-file-text",
    canPreview: false,
    extractText: true,
  },
  // Markdown
  markdown: {
    extensions: ["md", "markdown", "mdx"],
    mimeTypes: ["text/markdown", "text/x-markdown"],
    category: "document",
    maxSize: 5 * 1024 * 1024,
    icon: "ti ti-markdown",
    canPreview: false,
    extractText: true,
  },
  // Word 文档
  word: {
    extensions: ["docx", "doc"],
    mimeTypes: [
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/msword",
    ],
    category: "document",
    maxSize: 20 * 1024 * 1024,
    icon: "ti ti-file-type-docx",
    canPreview: false,
    extractText: true,
  },
  // 代码文件
  code: {
    extensions: [
      "js", "ts", "jsx", "tsx", "py", "java", "c", "cpp", "h", "hpp",
      "cs", "go", "rs", "rb", "php", "swift", "kt", "scala", "vue",
      "html", "css", "scss", "less", "sass", "xml", "yaml", "yml",
      "sh", "bash", "zsh", "ps1", "bat", "cmd",
    ],
    mimeTypes: [
      "text/javascript", "application/javascript", "text/typescript",
      "text/x-python", "text/x-java", "text/x-c", "text/x-c++",
      "text/html", "text/css", "text/xml", "application/xml",
      "text/x-yaml", "application/x-yaml",
    ],
    category: "code",
    maxSize: 2 * 1024 * 1024, // 2MB
    icon: "ti ti-code",
    canPreview: false,
    extractText: true,
  },
  // CSV
  csv: {
    extensions: ["csv", "tsv"],
    mimeTypes: ["text/csv", "text/tab-separated-values"],
    category: "data",
    maxSize: 10 * 1024 * 1024,
    icon: "ti ti-file-spreadsheet",
    canPreview: false,
    extractText: true,
  },
  // JSON
  json: {
    extensions: ["json", "jsonl", "geojson"],
    mimeTypes: ["application/json", "application/geo+json"],
    category: "data",
    maxSize: 5 * 1024 * 1024,
    icon: "ti ti-braces",
    canPreview: false,
    extractText: true,
  },
  // Excel
  excel: {
    extensions: ["xlsx", "xls"],
    mimeTypes: [
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "application/vnd.ms-excel",
    ],
    category: "data",
    maxSize: 20 * 1024 * 1024,
    icon: "ti ti-file-type-xls",
    canPreview: false,
    extractText: true,
  },
};

/**
 * 获取文件扩展名
 */
function getExtension(filename: string): string {
  return filename.split(".").pop()?.toLowerCase() || "";
}

/**
 * 根据文件名或 MIME 类型获取文件类型配置
 */
export function getFileTypeConfig(filename: string, mimeType?: string): FileTypeConfig | null {
  const ext = getExtension(filename);
  
  for (const config of Object.values(FILE_TYPE_CONFIGS)) {
    if (config.extensions.includes(ext)) {
      return config;
    }
    if (mimeType && config.mimeTypes.includes(mimeType)) {
      return config;
    }
  }
  
  return null;
}

/**
 * 检查文件是否支持
 */
export function isSupportedFile(file: File): boolean {
  return getFileTypeConfig(file.name, file.type) !== null;
}

/**
 * 检查文件是否为图片
 */
export function isImageFile(file: File): boolean {
  const config = getFileTypeConfig(file.name, file.type);
  return config?.category === "image";
}

/**
 * 获取文件图标
 */
export function getFileIcon(filename: string, mimeType?: string): string {
  const config = getFileTypeConfig(filename, mimeType);
  return config?.icon || "ti ti-file";
}

/**
 * 获取文件分类
 */
export function getFileCategory(filename: string, mimeType?: string): FileCategory {
  const config = getFileTypeConfig(filename, mimeType);
  return config?.category || "other";
}

/**
 * 获取支持的文件扩展名列表（用于 file input accept）
 */
export function getSupportedExtensions(): string {
  const extensions: string[] = [];
  for (const config of Object.values(FILE_TYPE_CONFIGS)) {
    extensions.push(...config.extensions.map(ext => `.${ext}`));
  }
  return extensions.join(",");
}

/**
 * 获取支持的 MIME 类型列表
 */
export function getSupportedMimeTypes(): string[] {
  const mimeTypes: string[] = [];
  for (const config of Object.values(FILE_TYPE_CONFIGS)) {
    mimeTypes.push(...config.mimeTypes);
  }
  return mimeTypes;
}

/**
 * 读取文本文件内容
 */
export async function readTextFile(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

/**
 * 读取文件为 ArrayBuffer
 */
export async function readFileAsArrayBuffer(file: File): Promise<ArrayBuffer> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = () => reject(reader.error);
    reader.readAsArrayBuffer(file);
  });
}

/**
 * 从文件路径读取文本内容
 */
async function readTextFromPath(filePath: string): Promise<string | null> {
  try {
    let fullPath = filePath;
    if (filePath.startsWith("./") || filePath.startsWith("../")) {
      const repoDir = orca.state.repoDir;
      if (repoDir) {
        const relativePath = filePath.replace(/^\.\//, "");
        fullPath = `${repoDir}/assets/${relativePath}`;
      }
    }

    const response = await fetch(`file:///${fullPath.replace(/\\/g, "/")}`);
    if (!response.ok) return null;
    return await response.text();
  } catch (error) {
    console.error("[file-service] Failed to read text from path:", error);
    return null;
  }
}

/**
 * 从文件路径读取二进制内容
 */
async function readBinaryFromPath(filePath: string): Promise<ArrayBuffer | null> {
  try {
    let fullPath = filePath;
    if (filePath.startsWith("./") || filePath.startsWith("../")) {
      const repoDir = orca.state.repoDir;
      if (repoDir) {
        const relativePath = filePath.replace(/^\.\//, "");
        fullPath = `${repoDir}/assets/${relativePath}`;
      }
    }

    const response = await fetch(`file:///${fullPath.replace(/\\/g, "/")}`);
    if (!response.ok) return null;
    return await response.arrayBuffer();
  } catch (error) {
    console.error("[file-service] Failed to read binary from path:", error);
    return null;
  }
}

/**
 * 提取文件的文本内容（用于发送给 AI）
 */
export async function extractFileContent(fileRef: FileRef): Promise<string | null> {
  const config = getFileTypeConfig(fileRef.name, fileRef.mimeType);
  if (!config || !config.extractText) {
    return null;
  }

  try {
    // 图片类型不提取文本
    if (config.category === "image") {
      return null;
    }

    // 文本类文件直接读取
    if (
      ["text", "markdown", "code", "csv", "json"].some((type) => FILE_TYPE_CONFIGS[type] === config)
    ) {
      const content = await readTextFromPath(fileRef.path);
      if (content) {
        return `[文件: ${fileRef.name}]\n\`\`\`\n${content}\n\`\`\``;
      }
    }

    // PDF、Word、Excel 使用前端解析器
    if (
      config === FILE_TYPE_CONFIGS.pdf ||
      config === FILE_TYPE_CONFIGS.word ||
      config === FILE_TYPE_CONFIGS.excel
    ) {
      const arrayBuffer = await readBinaryFromPath(fileRef.path);
      if (arrayBuffer) {
        const result = await parseDocument(arrayBuffer, fileRef.name, fileRef.mimeType);
        if (result) {
          return result;
        }
      }
      return `[文件: ${fileRef.name}] (无法读取文件内容)`;
    }

    return null;
  } catch (error) {
    console.error("[file-service] Failed to extract file content:", error);
    return null;
  }
}

/**
 * 上传文件到 vault
 */
export async function uploadFile(file: File): Promise<FileRef | null> {
  const config = getFileTypeConfig(file.name, file.type);
  if (!config) {
    console.warn("[file-service] Unsupported file type:", file.name, file.type);
    orca.notify("warn", `不支持的文件类型: ${file.name}`);
    return null;
  }

  if (file.size > config.maxSize) {
    const maxMB = Math.round(config.maxSize / 1024 / 1024);
    console.warn("[file-service] File too large:", file.size);
    orca.notify("warn", `文件过大: ${file.name} (最大 ${maxMB}MB)`);
    return null;
  }

  try {
    const arrayBuffer = await readFileAsArrayBuffer(file);
    const assetPath = await orca.invokeBackend(
      "upload-asset-binary",
      file.type || "application/octet-stream",
      arrayBuffer
    );

    if (assetPath) {
      const fileRef: FileRef = {
        path: assetPath,
        name: file.name,
        mimeType: file.type || "application/octet-stream",
        size: file.size,
        category: config.category,
      };

      // 为视频生成缩略图
      if (config.category === "video") {
        const thumbnail = await generateVideoThumbnail(file);
        if (thumbnail) {
          fileRef.thumbnail = thumbnail;
        }
      }

      return fileRef;
    }
  } catch (error) {
    console.error("[file-service] Failed to upload file:", error);
    orca.notify("error", `上传失败: ${file.name}`);
  }

  return null;
}

/**
 * 批量上传文件
 */
export async function uploadFiles(files: FileList | File[]): Promise<FileRef[]> {
  const results: FileRef[] = [];
  const fileArray = Array.from(files);

  for (const file of fileArray) {
    const ref = await uploadFile(file);
    if (ref) {
      results.push(ref);
    }
  }

  return results;
}

/**
 * 获取文件显示 URL（用于图片预览）
 */
export function getFileDisplayUrl(fileRef: FileRef): string {
  const fullPath = getFileFullPath(fileRef);
  return `file:///${fullPath.replace(/\\/g, "/")}`;
}

/**
 * 获取文件完整路径（用于 shell-open 等操作）
 */
export function getFileFullPath(fileRef: FileRef): string {
  let fullPath = fileRef.path;

  if (fileRef.path.startsWith("./") || fileRef.path.startsWith("../")) {
    const repoDir = orca.state.repoDir;
    if (repoDir) {
      const relativePath = fileRef.path.replace(/^\.\//, "");
      fullPath = `${repoDir}/assets/${relativePath}`;
    }
  }

  return fullPath;
}

/**
 * 图片转 base64（用于发送 API）
 */
export async function imageToBase64(fileRef: FileRef): Promise<string | null> {
  const config = getFileTypeConfig(fileRef.name, fileRef.mimeType);
  if (config?.category !== "image") {
    return null;
  }

  try {
    let fullPath = fileRef.path;
    if (fileRef.path.startsWith("./") || fileRef.path.startsWith("../")) {
      const repoDir = orca.state.repoDir;
      if (repoDir) {
        const relativePath = fileRef.path.replace(/^\.\//, "");
        fullPath = `${repoDir}/assets/${relativePath}`;
      }
    }

    const response = await fetch(`file:///${fullPath.replace(/\\/g, "/")}`);
    if (!response.ok) return null;

    const blob = await response.blob();
    
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        const base64 = result.split(",")[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error("[file-service] Failed to convert image to base64:", error);
    return null;
  }
}

/**
 * 文件转 base64（用于发送 API，支持图片和视频）
 */
export async function fileToBase64(fileRef: FileRef): Promise<string | null> {
  try {
    let fullPath = fileRef.path;
    if (fileRef.path.startsWith("./") || fileRef.path.startsWith("../")) {
      const repoDir = orca.state.repoDir;
      if (repoDir) {
        const relativePath = fileRef.path.replace(/^\.\//, "");
        fullPath = `${repoDir}/assets/${relativePath}`;
      }
    }

    const response = await fetch(`file:///${fullPath.replace(/\\/g, "/")}`);
    if (!response.ok) return null;

    const blob = await response.blob();
    
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        const result = reader.result as string;
        const base64 = result.split(",")[1];
        resolve(base64);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error("[file-service] Failed to convert file to base64:", error);
    return null;
  }
}

/**
 * 构建发送给 API 的文件内容
 * - 图片：返回 image_url 格式
 * - 视频：返回 video_url 格式（Gemini 等支持）
 * - 音频：返回 audio_url 格式
 * - 其他：返回提取的文本内容
 */
export async function buildFileContentForApi(
  fileRef: FileRef
): Promise<
  | { type: "image_url"; image_url: { url: string } }
  | { type: "video_url"; video_url: { url: string } }
  | { type: "audio_url"; audio_url: { url: string } }
  | { type: "text"; text: string }
  | null
> {
  const config = getFileTypeConfig(fileRef.name, fileRef.mimeType);
  if (!config) return null;

  // 图片类型
  if (config.category === "image") {
    const base64 = await fileToBase64(fileRef);
    if (!base64) return null;
    return {
      type: "image_url",
      image_url: {
        url: `data:${fileRef.mimeType};base64,${base64}`,
      },
    };
  }

  // 视频类型 - 使用抽帧处理
  if (config.category === "video") {
    // 视频需要特殊处理，返回 null 让调用方使用 buildFileContentsForApi
    return null;
  }

  // 音频类型
  if (config.category === "audio") {
    const base64 = await fileToBase64(fileRef);
    if (!base64) return null;
    return {
      type: "audio_url",
      audio_url: {
        url: `data:${fileRef.mimeType};base64,${base64}`,
      },
    };
  }

  // 其他类型提取文本
  const textContent = await extractFileContent(fileRef);
  if (textContent) {
    return {
      type: "text",
      text: textContent,
    };
  }

  return null;
}

/**
 * 构建发送给 API 的文件内容（支持返回多个内容）
 * 主要用于视频处理（抽帧返回多张图片）
 */
export async function buildFileContentsForApi(
  fileRef: FileRef
): Promise<Array<{ type: string; [key: string]: any }>> {
  const config = getFileTypeConfig(fileRef.name, fileRef.mimeType);
  if (!config) return [];

  // 视频类型 - 抽帧 + 音频识别
  if (config.category === "video" || isVideoFile(fileRef)) {
    try {
      return await buildVideoContentForApi(fileRef);
    } catch (error) {
      console.error("[file-service] Video processing failed:", error);
      // 降级：尝试直接发送 base64（小视频）
      const base64 = await fileToBase64(fileRef);
      if (base64) {
        return [{
          type: "video_url",
          video_url: { url: `data:${fileRef.mimeType};base64,${base64}` },
        }];
      }
      return [{ type: "text", text: `[视频处理失败: ${fileRef.name}]` }];
    }
  }

  // 其他类型使用单内容函数
  const content = await buildFileContentForApi(fileRef);
  return content ? [content] : [];
}
