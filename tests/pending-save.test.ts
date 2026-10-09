import { test, assertEqual } from "./test-harness";
import { createPendingSave } from "../src/utils/pending-save";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// 模拟面板：消息变化 → 登记防抖保存；切走对话 → 先 flush 再清理（effect 清理只 cancel）
test("回复结束后 0.5 秒切走，离开的对话仍存有最后一条回复", async () => {
  const store = new Map<string, string[]>();
  const pending = createPendingSave(100);
  const onMessages = (sessionId: string, messages: string[]) =>
    pending.schedule(() => {
      const snap = [...messages];
      return () => { store.set(sessionId, snap); };
    });

  onMessages("A", ["问", "答"]);
  await wait(50); // 防抖窗口一半
  void pending.flush(); // handleSelectSession / handleNewSession 里离开前补存（不等）
  pending.cancel(); // 随后 effect 清理
  await wait(150);
  assertEqual(store.get("A")?.join(","), "问,答", "离开的对话丢了最后一条回复");
});

test("防抖照旧：连续变化只存最后一次，flush 没东西时不保存", async () => {
  const saves: string[] = [];
  const pending = createPendingSave(30);
  pending.schedule(() => () => { saves.push("1"); });
  pending.schedule(() => () => { saves.push("2"); });
  await wait(60);
  assertEqual(saves.join(","), "2");
  await pending.flush();
  assertEqual(saves.join(","), "2", "已经存过的又被 flush 存了一次");
});

test("flush 当场拍快照；写入串行，等正在写的那次写完；失败不让 flush 抛错", async () => {
  const pending = createPendingSave(10);
  const order: string[] = [];
  pending.schedule(() => async () => { await wait(50); order.push("A1"); });
  await wait(20); // A1 正在写
  let ui = "A";
  pending.schedule(() => { const snap = ui; return () => { order.push(snap + "2"); }; });
  const flushed = pending.flush();
  ui = "B"; // 界面已换成新对话
  await flushed;
  assertEqual(order.join(","), "A1,A2", "快照拍晚了或写入没按顺序");
  pending.schedule(() => () => { throw new Error("disk full"); });
  await pending.flush(); // 不应抛错
  pending.schedule(() => { throw new Error("bad snapshot"); });
  await pending.flush();
});
