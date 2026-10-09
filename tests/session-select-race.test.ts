import { test, assertEqual } from "./test-harness";
import { createChatRequestOwner, loadIfLatest } from "../src/utils/chat-request-owner";

// 切换对话竞态：B 加载慢、期间选了 D 或新建了对话，最终显示的必须是用户最后的选择

function deferred<T>() {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => { resolve = r; });
  return { promise, resolve };
}

// 照 AiChatPanel：加载到了才上屏
function makePanel() {
  const owner = createChatRequestOwner();
  const panel = { shown: "A" };
  const select = async (load: () => Promise<string | null>) => {
    const s = await loadIfLatest(owner, load);
    if (s) panel.shown = s;
  };
  const newSession = (id: string) => { owner.invalidate(); panel.shown = id; };
  return { panel, select, newSession };
}

test("切换对话：B 加载慢、期间选 D，最终显示 D", async () => {
  const { panel, select } = makePanel();
  const b = deferred<string | null>();
  const pickB = select(() => b.promise);
  await select(async () => "D");
  b.resolve("B");
  await pickB;
  assertEqual(panel.shown, "D", "B 的慢加载覆盖了更晚选的 D");
});

test("切换对话：B 加载慢、期间新建对话 C，最终显示 C", async () => {
  const { panel, select, newSession } = makePanel();
  const b = deferred<string | null>();
  const pickB = select(() => b.promise);
  newSession("C");
  b.resolve("B");
  await pickB;
  assertEqual(panel.shown, "C", "B 的慢加载顶掉了新建的 C");
});

test("切换对话：没有后续选择时 B 照常显示", async () => {
  const { panel, select } = makePanel();
  await select(async () => "B");
  assertEqual(panel.shown, "B");
});
