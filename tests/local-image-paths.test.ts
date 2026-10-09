import { test, assertEqual } from "./test-harness";
import { appendLocalImagePreviews, toFileUrl } from "../src/utils/local-image-paths";

test("本机图片路径：段落后补预览，路径保留", () => {
  assertEqual(appendLocalImagePreviews("截图保存在 /Users/a/shot.png。\n下一行\n\n第二段"),
    "截图保存在 /Users/a/shot.png。\n下一行\n\n![](file:///Users/a/shot.png)\n\n\n第二段");
  // 反引号里带空格、中文、括号
  assertEqual(appendLocalImagePreviews("见 `/Users/a b/图(1).jpg`"), "见 `/Users/a b/图(1).jpg`\n\n![](file:///Users/a%20b/%E5%9B%BE%281%29.jpg)\n");
  // 链接里的也补
  assertEqual(appendLocalImagePreviews("[图](/x/y.webp)"), "[图](/x/y.webp)\n\n![](file:///x/y.webp)\n");
});

test("本机图片路径：不误伤", () => {
  const same = [
    "网址 https://x.com/a.png 不算",
    "已经是图片 ![](/x/y.png)",
    "```\n/x/in-code.png\n```",
    "不是图片 /x/y.png.bak 和 /x/y.pdf",
    "相对路径 a/b.png 不算",
  ];
  for (const s of same) assertEqual(appendLocalImagePreviews(s), s);
  // 同一张图提到两次只补一次；两张图连着放（会合并成图集）
  assertEqual(appendLocalImagePreviews("/a.png 和 /a.png 还有 /b.gif"), "/a.png 和 /a.png 还有 /b.gif\n\n![](file:///a.png)\n\n![](file:///b.gif)\n");
  assertEqual(toFileUrl("file:///x%20y.png"), "file:///x%20y.png");
});
