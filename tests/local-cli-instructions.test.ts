import { test, assert, assertEqual } from "./test-harness";
import { buildLocalCliPrompt } from "../src/services/ai/local-cli-client";
import { buildLocalCliInstructions } from "../src/services/ai/dynamic-prompt";

// 技能、格式要求作为「个人设定」放在本机 AI prompt 最前面

const msgs: any[] = [
  { role: "system", content: "sys" },
  { role: "user", content: "第一问" },
  { role: "assistant", content: "第一答" },
  { role: "user", content: "第二问" },
];

test("buildLocalCliPrompt：有个人设定时放在最前面", () => {
  const p = buildLocalCliPrompt(msgs, "笔记甲", "用户信息:\n喜欢简洁");
  assert(p.startsWith("以下是用户的个人设定与要求，请遵守：\n\n用户信息:\n喜欢简洁\n\n---\n"), p);
  assert(p.indexOf("喜欢简洁") < p.indexOf("笔记甲") && p.indexOf("笔记甲") < p.indexOf("第一问"), p);
  assert(p.endsWith("第二问"), p);
});

test("buildLocalCliPrompt：没有或空白个人设定时与原来完全一样", () => {
  for (const [m, c] of [[msgs, undefined], [msgs, "笔记甲"], [msgs.slice(0, 2), undefined], [msgs.slice(0, 2), "笔记甲"]] as const) {
    const before = buildLocalCliPrompt(m as any, c);
    assertEqual(buildLocalCliPrompt(m as any, c, undefined), before);
    assertEqual(buildLocalCliPrompt(m as any, c, ""), before);
    assertEqual(buildLocalCliPrompt(m as any, c, "  \n "), before);
  }
});

test("buildLocalCliInstructions：没有技能和格式要求时为空；有则不含插件工具说明", () => {
  assertEqual(buildLocalCliInstructions({}), "");
  assertEqual(buildLocalCliInstructions({ skills: [], formatSuffix: "" }), "");
  const text = buildLocalCliInstructions({
    skills: [{ name: "写周报", description: "整理本周工作", instruction: "# 标题\n列出完成事项\n列出下周计划" }],
    autoActivatedSkill: { name: "写周报", instruction: "完整指令" },
    formatSuffix: "\n\n【回答风格】用户要求简洁回答。",
  });
  assert(text.includes("## 🔔 已自动激活技能: 写周报") && text.includes("完整指令"), text);
  assert(text.includes("- **写周报**：整理本周工作\n  核心要求：列出完成事项；列出下周计划"), text);
  assert(text.includes("【回答风格】用户要求简洁回答。") && text.endsWith("【回答风格】用户要求简洁回答。"), text);
  assert(!text.includes("用户信息"), text);
  assert(!text.includes("skill_") && !text.includes("function call"), text);
});
