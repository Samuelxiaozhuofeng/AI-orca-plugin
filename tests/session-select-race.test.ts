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

// 照 AiChatPanel 首次加载：读列表之前就登记归属，读完再恢复上次的活动对话
test("首次加载：列表还没读完就新建对话 B，最终显示 B（不被旧活动对话 A 盖掉）", async () => {
  const { panel, select, newSession } = makePanel();
  panel.shown = "空白";
  const list = deferred<string>();
  const initial = select(async () => { const activeId = await list.promise; return activeId; });
  newSession("B");
  list.resolve("A");
  await initial;
  assertEqual(panel.shown, "B", "首次加载拿到的旧对话 A 顶掉了新建的 B");
});

test("首次加载：列表还没读完就切到 D，最终显示 D", async () => {
  const { panel, select } = makePanel();
  const list = deferred<string>();
  const initial = select(async () => list.promise);
  await select(async () => "D");
  list.resolve("A");
  await initial;
  assertEqual(panel.shown, "D", "首次加载拿到的旧对话 A 顶掉了用户选的 D");
});
