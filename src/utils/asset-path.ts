/**
 * 笔记库附件路径：上传返回的 ./x、assets/x、裸文件名 x → 仓库 assets 目录下的完整路径 / file:// 地址。
 * 新版 Orca 的 orca.state.repoDir 为 null，退回 dataDir/repos/repo。
 */
import { toFileUrl } from "./local-image-paths";

export function getRepoDir(): string | null {
  const s = (globalThis as any).orca?.state;
  if (s?.repoDir) return s.repoDir;
  if (s?.dataDir && s?.repo) return `${s.dataDir}/repos/${s.repo}`;
  return null;
}

const PASS_THROUGH = /^(\/|[A-Za-z]:|file:\/\/|https?:\/\/|data:)/i;

/** 附件相对路径 → 本机完整路径；绝对路径/网址原样；拿不到仓库目录原样返回 */
export function resolveAssetPath(p: string): string {
  if (!p || PASS_THROUGH.test(p)) return p;
  const repoDir = getRepoDir();
  if (!repoDir) return p;
  const rel = p.replace(/^(\.\.?\/)+/, "").replace(/^assets\//, "");
  return `${repoDir}/assets/${rel}`;
}

/** 附件路径 → 可 fetch / 显示的地址（本机路径转 file://，Windows 盘符路径也能转） */
export function resolveAssetUrl(p: string): string {
  const full = resolveAssetPath(p);
  if (/^(file:\/\/|https?:\/\/|data:)/i.test(full)) return full;
  const slashed = full.replace(/\\/g, "/");
  if (/^[A-Za-z]:/.test(slashed)) return "file:///" + slashed.slice(0, 2) + toFileUrl(slashed.slice(2)).slice("file://".length);
  if (slashed.startsWith("/")) return toFileUrl(slashed);
  return full;
}

const IMAGE_EXT_RE = /\.(png|jpe?g|gif|webp|bmp|svg|avif|heic|tiff?)$/i;

/** 用系统打开前只放行图片扩展名（按解码后的路径、去掉 ?/# 后判断），防止 AI 回复里的 .app / .command 被启动 */
export function isImageFilePath(path: string): boolean {
  const ok = (s: string) => IMAGE_EXT_RE.test(s.replace(/[?#].*$/, "").replace(/\/+$/, ""));
  let p = path;
  try { p = decodeURIComponent(p); } catch {}
  // 解码前后都得是图片扩展名：调用方可能已解码过一次，只看解码后会放过 x.%70ng 这类
  return ok(path) && ok(p);
}

/** 用系统打开图片；不是图片扩展名就不打开并提示 */
export function openImageInSystem(path: string): void {
  if (/^https?:\/\//i.test(path)) { orca.invokeBackend("shell-open", path); return; } // 网图交给浏览器，不要求扩展名
  // 只认本机路径；smb:// 等别的协议会挂载共享或拉起程序
  if (!/^(\/|file:\/\/)/i.test(path) || !isImageFilePath(path)) {
    orca.notify("warn", "只能用系统打开图片文件");
    return;
  }
  orca.invokeBackend("shell-open", path);
}
