import { test, assert, assertEqual } from "./test-harness";
import { createChatRequestOwner, shouldReportFailure } from "../src/utils/chat-request-owner";

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

// 第三轮 H2：同一对话里每次发送都是新身份，接替时作废上一请求；H4：中止 / 失效不报错

test("H2 同对话连发两次：旧请求写入被丢弃、旧中止器已中止，新请求正常", () => {
  const owner = createChatRequestOwner();
  const ref = { current: null as AbortController | null };
  const writes: string[] = [];
  const a = owner.begin();
  const aAborter = a.newAborter(ref);
  const aWrite = a.guard((s: string) => writes.push(s));
  const b = owner.begin(); // 同一对话里再发一次，没换对话
  const bAborter = b.newAborter(ref);
  aWrite("a");
  b.guard((s: string) => writes.push(s))("b");
  assert(aAborter.signal.aborted, "旧请求的中止器应已中止");
  assert(!a.isCurrent() && b.isCurrent(), "旧请求应失效、新请求为当前");
  assert(!bAborter.signal.aborted, "新请求的中止器不应被中止");
  assertEqual(writes.join(","), "b", "旧请求的写入未被丢弃");
  assertEqual(ref.current, bAborter);
  if (ref.current === aAborter) ref.current = null; // A 的 finally 清理
  assertEqual(ref.current, bAborter, "旧请求收尾清掉了新请求的中止器");
});

test("H4 shouldReportFailure：中止或请求已失效都不报错，当前请求的真错误才报", () => {
  const owner = createChatRequestOwner();
  const a = owner.begin();
  const boom = new Error("boom");
  const aborted = new DOMException("Aborted", "AbortError");
  assertEqual(shouldReportFailure(a.isCurrent, boom), true);
  assertEqual(shouldReportFailure(a.isCurrent, aborted), false);
  owner.begin();
  assertEqual(shouldReportFailure(a.isCurrent, boom), false);
  owner.invalidate();
  assertEqual(shouldReportFailure(a.isCurrent, boom), false);
});
