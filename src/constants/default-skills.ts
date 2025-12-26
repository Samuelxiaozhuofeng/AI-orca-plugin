/**
 * Default Skills - 预置 Skill 定义
 * 首次使用插件时自动创建的 AI 技能模板
 */

import type { SkillType } from "../store/skill-store";

/**
 * 预置 Skill 定义接口
 */
export interface DefaultSkillDefinition {
  name: string;
  type: SkillType;
  description?: string;
  prompt: string;
  tools?: string[];
}

/**
 * 预置 Skills 常量数组
 * 包含：翻译助手、内容总结、写作润色、笔记整理、知识检索
 */
export const DEFAULT_SKILLS: DefaultSkillDefinition[] = [
  {
    name: "翻译助手",
    type: "prompt",
    description: "将内容翻译为目标语言",
    prompt: `请将用户提供的内容翻译为目标语言。保持原意，语句通顺自然。
如果用户未指定目标语言，请先询问。`,
  },
  {
    name: "内容总结",
    type: "prompt",
    description: "提取内容要点",
    prompt: `请总结以下内容的要点：
1. 提取核心观点（3-5 个）
2. 使用简洁的语言
3. 保留关键数据和结论`,
  },
  {
    name: "写作润色",
    type: "prompt",
    description: "优化文字表达",
    prompt: `请优化以下文字的表达：
1. 改进语句通顺度
2. 修正语法错误
3. 提升专业性和可读性
4. 保持原意不变`,
  },
  {
    name: "笔记整理",
    type: "tools",
    description: "整理和写入笔记",
    prompt: "专注于帮助用户整理和写入笔记内容。在写入前，确认用户想要的位置和格式。",
    tools: ["createBlock", "insertTag", "createPage"],
  },
  {
    name: "知识检索",
    type: "tools",
    description: "搜索和查找笔记",
    prompt: "专注于帮助用户搜索和查找笔记内容。优先使用精确搜索，必要时使用模糊搜索。",
    tools: ["searchBlocksByTag", "searchBlocksByText", "queryBlocksByTag", "getPage"],
  },
];

/**
 * 预置 Skills 页面名称
 */
export const DEFAULT_SKILLS_PAGE_NAME = "AI Skills";
