import { test, assertEqual } from "./test-harness";
import { getRepoDir, resolveAssetPath, resolveAssetUrl } from "../src/utils/asset-path";

function withState(state: any, fn: () => void) {
  const orig = (globalThis as any).orca;
  (globalThis as any).orca = { state };
  try { fn(); } finally { (globalThis as any).orca = orig; }
}

test("asset-path: repoDir 有值优先用", () => withState({ repoDir: "/R", dataDir: "/d", repo: "r" }, () => {
  assertEqual(getRepoDir(), "/R");
  assertEqual(resolveAssetPath("x.png"), "/R/assets/x.png");
}));

test("asset-path: repoDir 为 null 退回 dataDir/repos/repo，各种相对写法", () => withState({ repoDir: null, dataDir: "/d", repo: "r" }, () => {
  assertEqual(getRepoDir(), "/d/repos/r");
  assertEqual(resolveAssetPath("x.png"), "/d/repos/r/assets/x.png");
  assertEqual(resolveAssetPath("./x.png"), "/d/repos/r/assets/x.png");
  assertEqual(resolveAssetPath("../x.png"), "/d/repos/r/assets/x.png");
  assertEqual(resolveAssetPath("assets/x.png"), "/d/repos/r/assets/x.png");
  assertEqual(resolveAssetUrl("a b.png"), "file:///d/repos/r/assets/a%20b.png");
}));

test("asset-path: 绝对路径和网址原样", () => withState({ repoDir: null, dataDir: "/d", repo: "r" }, () => {
  for (const p of ["/abs/x.png", "C:\\x.png", "file:///a.png", "http://a/b.png", "https://a/b.png", "data:image/png;base64,AA"]) {
    assertEqual(resolveAssetPath(p), p);
  }
  assertEqual(resolveAssetUrl("C:\\a b\\x.png"), "file:///C:/a%20b/x.png");
}));

test("asset-path: 拿不到仓库目录原样返回", () => withState({ repoDir: null, dataDir: null, repo: null }, () => {
  assertEqual(getRepoDir(), null);
  assertEqual(resolveAssetPath("./x.png"), "./x.png");
  assertEqual(resolveAssetUrl("./x.png"), "./x.png");
}));
