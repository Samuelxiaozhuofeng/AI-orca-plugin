/**
 * 回复里出现的本机图片路径（截图、生成的图）→ 在所在段落下方补一张图片预览（路径文字保留）。
 * 图从原位置读取，不复制进笔记库；文件挪走/删掉后预览显示不出来。
 */

const EXT = "(?:png|jpe?g|gif|webp|bmp|svg)";
// 反引号里（可带空格）、[文字](路径) 链接里、裸路径（不带空格；前面不能紧跟字母/冒号/斜杠，避免吃到网址里的路径）
const PATTERNS = [
  new RegExp("`((?:file://)?/[^`\\n]*?\\." + EXT + ")`", "gi"),
  new RegExp("(?<!!)\\[[^\\]\\n]*\\]\\(<?((?:file://)?/[^)\\n>]*?\\." + EXT + ")>?\\)", "gi"),
  new RegExp("(?<![\\w/`(<.:~-])((?:file://)?/[^\\s`\"'()（）「」<>\\[\\]]+?\\." + EXT + ")(?![\\w/.-])", "gi"),
];
const EXISTING_IMAGE = /!\[[^\]\n]*\]\(<?([^)\n>]+)>?\)/g;

/** 本机绝对路径 → file:// 地址（逐段编码，空格、中文、#、括号都安全）；已是 file:// 原样返回 */
export function toFileUrl(path: string): string {
  if (path.startsWith("file://")) return path;
  return "file://" + path.split("/").map((seg) => encodeURIComponent(seg).replace(/\(/g, "%28").replace(/\)/g, "%29")).join("/");
}

/** 段落（空行或代码块边界为界）里出现的本机图片路径，在段落后补 ![](file://...)；代码块里的不管，同一张图只补一次 */
export function appendLocalImagePreviews(text: string): string {
  if (!text.includes("/")) return text;
  const seen = new Set<string>();
  for (const m of text.matchAll(EXISTING_IMAGE)) seen.add(toFileUrl(m[1]));

  const out: string[] = [];
  let pending: string[] = [];
  let inFence = false;
  const flush = () => {
    if (pending.length) out.push("", ...pending.flatMap((url, i) => (i ? ["", `![](${url})`] : [`![](${url})`])), "");
    pending = [];
  };
  for (const line of text.split("\n")) {
    const isFence = /^\s*(```|~~~)/.test(line);
    if (isFence || (!inFence && !line.trim())) flush();
    if (isFence) inFence = !inFence;
    out.push(line);
    if (inFence || isFence) continue;
    for (const re of PATTERNS) {
      for (const m of line.matchAll(re)) {
        const url = toFileUrl(m[1]);
        if (seen.has(url)) continue;
        seen.add(url);
        pending.push(url);
      }
    }
  }
  flush();
  return out.join("\n");
}
