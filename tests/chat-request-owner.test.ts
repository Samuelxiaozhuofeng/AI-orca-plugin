import { test, assert, assertEqual } from "./test-harness";
import { createChatRequestOwner, settlePendingConfirms } from "../src/utils/chat-request-owner";

// 第二轮 G3：请求归属补全（中止器登记、生成状态写入、内联技能确认）

test("G3 失效请求不覆盖 abortRef，新请求的中止器留在 ref 里", () => {
  const owner = createChatRequestOwner();
  const ref = { current: null as AbortController | null };
  const a = owner.begin();
  owner.invalidate(); // A 还在异步准备时换了对话
  const b = owner.begin();
  const bAborter = b.newAborter(ref);
  assertEqual(ref.current, bAborter);
  const aAborter = a.newAborter(ref); // A 恢复后才建中止器
  assert(aAborter.signal.aborted, "失效请求的中止器应生来即中止");
  assertEqual(ref.current, bAborter, "失效请求覆盖了当前请求的中止器");
  if (ref.current === aAborter) ref.current = null; // A 的 finally 清理
  assertEqual(ref.current, bAborter, "失效请求清空了当前请求的中止器");
});

test("G3 失效请求的 sending / streamingMessageId / 多模型 / updateMessage 写入一律丢弃", () => {
  const owner = createChatRequestOwner();
  const state = { sending: false, streaming: null as string | null, multi: 0, updated: [] as string[] };
  const setters = (req: ReturnType<typeof owner.begin>) => ({
    setSending: req.guard((v: boolean) => { state.sending = v; }),
    setStreaming: req.guard((v: string | null) => { state.streaming = v; }),
    setMulti: req.guard((v: number) => { state.multi = v; }),
    updateMessage: req.guard((id: string) => { state.updated.push(id); }),
  });
  const a = setters(owner.begin());
  a.setSending(true);
  owner.invalidate();
  const b = setters(owner.begin());
  b.setSending(true);
  b.setStreaming("b-msg");
  a.setSending(false);
  a.setStreaming(null);
  a.setMulti(9);
  a.updateMessage("a-msg"); // RAG onProgress 走的就是它
  assertEqual(state.sending, true, "旧请求清掉了 sending");
  assertEqual(state.streaming, "b-msg", "旧请求清掉了 streamingMessageId");
  assertEqual(state.multi, 0, "旧请求写入了多模型面板");
  assertEqual(state.updated.length, 0, "旧请求的 updateMessage 未被拦下");
});

test("G3 准备阶段 await 恢复后能察觉已失效", async () => {
  const owner = createChatRequestOwner();
  const req = owner.begin();
  const pending = (async () => {
    await new Promise((r) => setTimeout(r, 10));
    return req.isCurrent();
  })();
  owner.invalidate();
  assertEqual(await pending, false);
});

test("G3 换对话时未决的技能确认按拒绝结算并删除 resolver", async () => {
  const resolvers = new Map<string, (approved: boolean) => void>();
  const waiting = new Promise<boolean>((resolve) => resolvers.set("m1", resolve));
  settlePendingConfirms(resolvers);
  assertEqual(await waiting, false);
  assertEqual(resolvers.size, 0);
});
