import { test, assert, assertEqual } from "./test-harness";
import { fetchWithReconnect, NotDeliveredError } from "../src/services/ai/local-cli-autostart";
import { stripImageNotes } from "../src/services/ai/local-cli-images";
import { isImageFilePath } from "../src/utils/asset-path";

test("重连：中转本来在跑 + 小请求体 → 不拉起，重发一次", async () => {
  let n = 0, up = 0;
  const res = await fetchWithReconnect(async () => { if (++n === 1) throw new TypeError("fetch failed"); return new Response("ok"); }, async () => { up++; return true; }, undefined, async () => true, true);
  assertEqual(await res.text(), "ok");
  assertEqual(n, 2);
  assertEqual(up, 0);
});

test("重连：中转本来在跑 + 大请求体 → 不重发，报请求没送到", async () => {
  let n = 0, err: any;
  try {
    await fetchWithReconnect(async () => { n++; throw new TypeError("fetch failed"); }, async () => true, undefined, async () => true, false);
  } catch (e) { err = e; }
  assert(err instanceof NotDeliveredError, "应抛 NotDeliveredError");
  assertEqual(n, 1);
});

test("用系统打开：只放行图片扩展名", () => {
  for (const p of ["/a/b.png", "/a/B.JPG", "/a/c.jpeg", "x.gif", "x.webp", "x.bmp", "x.svg", "x.avif", "x.HEIC", "x.tif", "x.tiff", "/a/%E5%9B%BE.png", "file:///a/x.png", "https://h/x.png?w=1"]) {
    assert(isImageFilePath(p), `应放行 ${p}`);
  }
  for (const p of ["/System/Applications/Terminal.app", "/System/Applications/Terminal.app/", "file:///tmp/x.command", "/a/x.png.app", "/a/x.sh", "/a/x.command?.png", "/a/x.app#.png", "/a/x%2Eapp", "/a/png", "/tmp/x.%70ng"]) {
    assert(!isImageFilePath(p), `不应放行 ${p}`);
  }
});

test("剥离说明段：超长空行 100ms 内完成，结果不变", () => {
  const blank = "正文" + "\n".repeat(20000) + "x";
  let t = Date.now();
  assertEqual(stripImageNotes(blank), blank);
  const tail = "正文" + " \n".repeat(20000);
  assertEqual(stripImageNotes(tail), tail);
  assert(Date.now() - t < 100, `耗时 ${Date.now() - t}ms`);
  assertEqual(stripImageNotes("正文\n\n> 没能发给本机 AI：a\n\n> 这张图片没能发给本机 AI：b\n  "), "正文");
  assertEqual(stripImageNotes("正文\n> 没能发给本机 AI：中间\n后文"), "正文\n> 没能发给本机 AI：中间\n后文");
});
