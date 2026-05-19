/**
 * Dynamic System Prompt Builder
 *
 * 参考 CoreCoder prompt.py 设计：基础提示词 + 按能力动态组装段落。
 * 只在相关功能启用时才注入对应指令，避免浪费 token。
 */

import type { OpenAITool } from "./openai-client";

const BASE_PROMPT = `你是笔记库智能助手。遵守工具返回的所有指令。

## 核心原则
- **先读后说**：拿到 blockid 后必须先调用工具读取内容，再基于实际内容总结。严禁凭名称猜测主题含义，严禁不读原文就下定论
- **精确执行**：严格使用用户原词，不擅自替换、扩展或联想
- **真实可靠**：只引用工具实际返回的内容，绝对禁止编造
- **简洁直接**：结论先行，短句优先，不废话`;

const TOOL_USE_SECTION = `## 工具使用
- 使用标准的 function calling 机制调用工具，不要在回复文本中输出 <invoke>、</invoke>、<parameter> 等 XML 标签
- ❌ 禁止在 content 文本中输出工具调用语法（如 \`<invoke name="...">\`），工具调用必须通过 function call 完成
- 看到 "✅ Search complete" 或 "🚫 STOP" 立即停止，不再调用其他工具
- 搜索0结果时才能尝试近义词，且必须明确告知用户
- 工具参数必须是合法的 JSON，禁止传入残缺的 JSON（如空的 blockIds: {}）
- ❌ 禁止在回复中直接粘贴工具返回的原始 JSON 数据，必须用自然语言总结
- 工具结果中如出现"...[已截断"字样，说明数据过长已被截断，不要抱怨截断
- 如果工具调用返回错误，仔细检查参数后再重试，最多重试 1 次`;

const MCP_TOOLS_SECTION = `- 以 mcp__ 开头的是外部 MCP 工具，根据描述和场景按需调用`;

const TODOIST_SECTION = `## Todoist 任务管理
- 用户可通过 /todoist-ai 模式管理 Todoist 任务
- 创建任务时，若用户未指定日期，默认设为今天
- 完成任务前先确认任务 ID`;

const CITATION_SECTION = `## 引用标注规范
- 引用笔记块时，在句中使用双括号包裹块 ID，格式：((数字))
- 多个块引用连续书写，示例：((5006))((1003))
- 引用位置要紧跟被引用内容之后
- ❌ 禁止：无标题时使用 () 或 (未命名) 等空括号占位
- blockid 必须从工具返回中复制，禁止编造`;

const WEB_SEARCH_SECTION = `## 联网搜索
- webSearch 用于获取实时信息
- imageSearch 用于搜索相关图片
- 优先使用用户笔记库中的内容，只在需要外部信息时搜索`;

const DRAGGED_CONTEXT_SECTION = `## 上下文优先
- 用户已提供具体内容块，优先基于这些块回答
- 不需要再搜索笔记库`;

export interface SkillPromptInfo {
  name: string;
  description: string;
  instruction: string;
}

/** 自动激活的技能信息 */
export interface AutoActivatedSkill {
  name: string;
  instruction: string;
}

export interface PromptOptions {
  hasMcpTools?: boolean;
  hasTodoistTools?: boolean;
  hasWebSearch?: boolean;
  hasDraggedContext?: boolean;
  skills?: SkillPromptInfo[];
  /** 自动激活的技能（高置信度匹配时自动注入指令） */
  autoActivatedSkill?: AutoActivatedSkill;
  repoId?: string;
}

export function buildDynamicSystemPrompt(options: PromptOptions = {}): string {
  const sections: string[] = [BASE_PROMPT];

  // 工具使用（有 MCP 工具时才扩展）
  if (options.hasMcpTools) {
    sections.push(TOOL_USE_SECTION + "\n" + MCP_TOOLS_SECTION);
  } else {
    sections.push(TOOL_USE_SECTION);
  }

  // 引用格式
  sections.push(CITATION_SECTION);

  // 自动激活的技能（高置信度匹配，强制注入完整指令）
  if (options.autoActivatedSkill) {
    sections.push(buildAutoActivatedSkillSection(options.autoActivatedSkill));
  }

  // 可用技能（注入到系统提示词，AI 自动识别并按需遵循）
  if (options.skills && options.skills.length > 0) {
    sections.push(buildSkillsSection(options.skills));
  }

  // Technical Notes（动态值，如 repoId）
  if (options.repoId) {
    sections.push(buildTechnicalNotes(options.repoId));
  }

  // 联网搜索相关
  if (options.hasWebSearch) {
    sections.push(WEB_SEARCH_SECTION);
  }

  // 拖入上下文
  if (options.hasDraggedContext) {
    sections.push(DRAGGED_CONTEXT_SECTION);
  }

  // Todoist 模式
  if (options.hasTodoistTools) {
    sections.push(TODOIST_SECTION);
  }

  return sections.join("\n\n");
}

function buildAutoActivatedSkillSection(skill: AutoActivatedSkill): string {
  return `## 🔔 已自动激活技能: ${skill.name}

系统已根据你的请求自动匹配并激活了此技能。你必须严格遵循以下指令来完成任务：

${skill.instruction}`;
}

function buildSkillsSection(skills: SkillPromptInfo[]): string {
  const header = `## 可用技能 (Skills)
以下是已启用的专业技能。当用户请求与某个技能描述高度匹配时，你**必须**在函数列表中查找并调用对应的 \`skill_*\` 工具。

【关键规则】
- 识别到匹配技能后，立即调用对应的 skill 工具
- 调用工具后，严格按返回的完整指令执行任务
- 技能工具名称格式为 \`skill_<技能ID>\`，可在可用函数列表中查找

可用技能列表：

`;
  const parts = [header];

  for (const skill of skills) {
    // 只取指令的前 5 行核心要点，避免 token 浪费
    const instructionLines = skill.instruction.split("\n");
    const keyPoints: string[] = [];
    for (const line of instructionLines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#") || trimmed.startsWith("---")) continue;
      keyPoints.push(trimmed);
      if (keyPoints.length >= 5) break;
    }

    parts.push(`- **${skill.name}**：${skill.description}
  核心要求：${keyPoints.join("；")}`);
  }

  return parts.join("\n");
}

function buildTechnicalNotes(repoId: string): string {
  return `## Technical Notes
- 调用需要 \`repoId\` 参数的工具时，使用 \`"${repoId}"\` 作为其值`;
}

/**
 * 获取当前仓库标识符，用于注入到系统提示词中。
 * 不同仓库返回不同值，确保 MCP 工具调用时使用正确的 repoId。
 */
export function getCurrentRepoId(): string {
  try {
    return (typeof orca !== "undefined" && orca.state?.repo) || "unknown";
  } catch {
    return "unknown";
  }
}

