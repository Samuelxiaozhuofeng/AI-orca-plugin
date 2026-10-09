/**
 * 本机 AI 的图片：从最新一条用户消息取出图片转成 bridge 要的 { mediaType, data }，
 * 发不了的（格式不支持、太大、太多、读不出）给出中文原因，由调用方写进回复。
 */

import type { OpenAIChatMessage } from "./openai-client";

export type LocalCliImage = { mediaType: string; data: string };

// 与 bridge/orca-agent-bridge.mjs 的上限一致
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/gif", "image/webp"];
const MAX_IMAGES = 10;
const MAX_IMAGE_MB = 10;
const MAX_TOTAL_MB = 25;
const MB = 1024 * 1024;
const BASE64_RE = /^[A-Za-z0-9+/]*={0,2}$/; // 同 bridge：配合长度是 4 的倍数
// message-builder 读图失败时留下的文字标记
const LOAD_FAILED_RE = /^\[(?:图片|文件)(?:加载失败|处理错误): (.+)\]$/;

const decodedBytes = (b64: string) => Math.floor((b64.length * 3) / 4) - (b64.endsWith("==") ? 2 : b64.endsWith("=") ? 1 : 0);

async function readAsDataUrl(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`读取失败（${res.status}）`);
  const blob = await res.blob();
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("读取失败"));
    reader.readAsDataURL(blob);
  });
}

/** 最新一条用户消息里的图片；notes = 每张没发出去的图片的原因 */
export async function collectLocalCliImages(m: OpenAIChatMessage | undefined): Promise<{ images: LocalCliImage[]; notes: string[] }> {
  const images: LocalCliImage[] = [];
  const notes: string[] = [];
  const content: any = (m as any)?.content;
  if (!Array.isArray(content)) return { images, notes };
  let total = 0;
  let n = 0;
  for (const part of content) {
    if (part?.type === "text") {
      const failed = LOAD_FAILED_RE.exec(String(part.text).trim());
      if (failed) notes.push(`「${failed[1]}」没有读出来`);
      continue;
    }
    if (part?.type !== "image_url") continue;
    n++;
    const label = `第 ${n} 张图片`;
    let url = String(part.image_url?.url ?? "");
    if (!url.startsWith("data:")) {
      try { url = await readAsDataUrl(url); } catch (e: any) { notes.push(`${label}${e?.message || "读取失败"}`); continue; }
    }
    const match = /^data:([^;,]+)(?:;[^,]*)?;base64,(.*)$/.exec(url);
    if (!match) { notes.push(`${label}不是可识别的图片数据`); continue; }
    const mediaType = match[1].toLowerCase() === "image/jpg" ? "image/jpeg" : match[1].toLowerCase();
    const data = match[2];
    if (!data || data.length % 4 !== 0 || !BASE64_RE.test(data)) { notes.push(`${label}数据不是合法 base64`); continue; }
    if (!IMAGE_TYPES.includes(mediaType)) { notes.push(`${label}格式不支持（${mediaType}），只支持 PNG、JPEG、GIF、WebP`); continue; }
    if (images.length >= MAX_IMAGES) { notes.push(`${label}超出数量：一次最多发 ${MAX_IMAGES} 张`); continue; }
    const bytes = decodedBytes(data);
    if (bytes > MAX_IMAGE_MB * MB) { notes.push(`${label}太大，单张请小于 ${MAX_IMAGE_MB}MB`); continue; }
    if (total + bytes > MAX_TOTAL_MB * MB) { notes.push(`${label}超出总量：图片合计请小于 ${MAX_TOTAL_MB}MB`); continue; }
    total += bytes;
    images.push({ mediaType, data });
  }
  return { images, notes };
}

/** 没发出去的图片 / 文件写进回复末尾的提示；固定前缀，构建历史时按 IMAGE_NOTES_RE 剥掉 */
export function imageNotesText(notes: string[]): string {
  return notes.map((r) => `\n\n> 没能发给本机 AI：${r}`).join("");
}

/** 回复末尾插件写的说明段（含旧版「这张图片没能发给本机 AI：」），只认末尾，不动正文中间 */
export const IMAGE_NOTES_RE = /(?:\s*\n> (?:这张图片)?没能发给本机 AI：[^\n]*)+\s*$/;
