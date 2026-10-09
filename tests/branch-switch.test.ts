import { test, assertEqual } from "./test-harness";
import { createBranch, switchBranch, stashCurrentBranch } from "../src/services/branch-service";
import type { Message } from "../src/services/session-service";

const msg = (id: string): Message => ({ id, role: "user", content: id, createdAt: 0 } as Message);
const ids = (ms: Message[]) => ms.map((m) => m.id).join(",");
const strip = (ms: Message[], point: string) =>
  ms.map((m) => (m.id === point ? { ...m, activeBranchId: undefined } : m)); // 模拟旧版本存的数据

// 照 AiChatPanel：切换 / 新建前先把当前分支存回去
const switchTo = (ms: Message[], point: string, target: string) =>
  switchBranch(stashCurrentBranch(ms, point), point, target);

test("分支 B 里新聊的消息，切到主线再切回 B 还在", () => {
  const { messages, branchId: b } = createBranch([msg("p"), msg("m1")], "p");
  const onMain = switchTo([...messages, msg("b1"), msg("b2")], "p", "main");
  assertEqual(ids(onMain), "p,m1", "主线内容不对");
  assertEqual(ids(switchTo(onMain, "p", b)), "p,b1,b2", "B 的消息丢了");
});

test("在分支 B 里再新建分支 C，B 的内容先存回去", () => {
  const { messages, branchId: b } = createBranch([msg("p"), msg("m1")], "p");
  const { messages: inC } = createBranch(stashCurrentBranch([...messages, msg("b1")], "p"), "p");
  assertEqual(ids(switchTo(inC, "p", b)), "p,b1", "B 的消息丢了");
});

test("嵌套分支点：在内层切到主线后再在外层切换，不会把内容写进外层主线", () => {
  // 外层 P：main=[m]，b=[q, r]；内层 q：main=[r]，c=[]
  const outer = createBranch([msg("p"), msg("m")], "p");
  const inB = [...outer.messages, msg("q"), msg("r")];
  const inner = createBranch(inB, "q");
  const innerMain = switchTo(inner.messages, "q", "main");
  assertEqual(ids(innerMain), "p,q,r", "内层主线不对");
  const outerMain = switchTo(innerMain, "p", "main");
  assertEqual(ids(outerMain), "p,m", "外层主线被内层内容覆盖了");
  assertEqual(ids(switchTo(outerMain, "p", outer.branchId)), "p,q,r", "外层分支 b 内容丢了");
});

test("旧数据没记当前分支：按显示的消息认出主线", () => {
  const { messages, branchId: b } = createBranch([msg("p"), msg("m1")], "p");
  const onMain = strip(switchTo(messages, "p", "main"), "p");
  const onB = switchTo([...onMain, msg("m2")], "p", b);
  assertEqual(ids(switchTo(onB, "p", "main")), "p,m1,m2", "主线新消息丢了");
});

test("旧数据认不出属于哪个分支：另存成「找回的消息」分支，照常切换", () => {
  const { messages } = createBranch([msg("p"), msg("m1")], "p");
  const legacy = strip([...messages, msg("x")], "p");
  const onMain = switchTo(legacy, "p", "main");
  assertEqual(ids(onMain), "p,m1", "没切过去");
  const recovered = onMain[0].branches!.find((b) => b.name === "找回的消息");
  assertEqual(recovered ? ids(recovered.messages) : "", "x", "内容没找回");
});
