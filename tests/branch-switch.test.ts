import { test, assertEqual } from "./test-harness";
import { createBranch, switchBranch, stashCurrentBranch } from "../src/services/branch-service";
import type { Message } from "../src/services/session-service";

const msg = (id: string): Message => ({ id, role: "user", content: id, createdAt: 0 } as Message);
const ids = (ms: Message[]) => ms.map((m) => m.id).join(",");

// 照 AiChatPanel：切换 / 新建前先把当前分支存回去
function switchTo(ms: Message[], point: string, current: string | null, target: string) {
  const stashed = stashCurrentBranch(ms, point, current);
  if (!stashed) throw new Error("认不出当前分支");
  return switchBranch(stashed, point, target);
}

test("分支 B 里新聊的消息，切到主线再切回 B 还在", () => {
  const { messages, branchId: b } = createBranch([msg("p"), msg("m1")], "p");
  const inB = [...messages, msg("b1"), msg("b2")];
  const onMain = switchTo(inB, "p", b, "main");
  assertEqual(ids(onMain), "p,m1", "主线内容不对");
  const backToB = switchTo(onMain, "p", "main", b);
  assertEqual(ids(backToB), "p,b1,b2", "B 的消息丢了");
});

test("重载后不记得当前分支：刚建、没离开过的空分支认作当前分支", () => {
  const { messages, branchId: b } = createBranch([msg("p"), msg("m1")], "p");
  const inB = [...messages, msg("b1")];
  const onMain = switchTo(inB, "p", null, "main");
  assertEqual(ids(switchTo(onMain, "p", null, b)), "p,b1", "B 的消息丢了");
});

test("重载后不记得当前分支：按显示的消息认出主线", () => {
  const { messages, branchId: b } = createBranch([msg("p"), msg("m1")], "p");
  const onMain = switchTo(messages, "p", b, "main");
  const edited = [...onMain, msg("m2")];
  const onB = switchTo(edited, "p", null, b);
  assertEqual(ids(switchTo(onB, "p", null, "main")), "p,m1,m2", "主线新消息丢了");
});

test("分支点后有内容却认不出属于哪个分支：不切", () => {
  const first = createBranch([msg("p"), msg("m1")], "p");
  const second = createBranch(first.messages, "p");
  assertEqual(stashCurrentBranch([...second.messages, msg("x")], "p", null), null, "应拒绝");
});

test("在分支 B 里再新建分支 C，B 的内容先存回去", () => {
  const { messages, branchId: b } = createBranch([msg("p"), msg("m1")], "p");
  const inB = [...messages, msg("b1")];
  const stashed = stashCurrentBranch(inB, "p", b)!;
  const { messages: inC } = createBranch(stashed, "p");
  assertEqual(ids(switchTo(inC, "p", null, b)), "p,b1", "B 的消息丢了");
});
