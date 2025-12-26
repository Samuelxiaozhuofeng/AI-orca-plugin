/**
 * Skill Initializer - 预置 Skill 自动初始化服务
 * 首次使用插件时自动创建预置 Skills
 */

import {
  DEFAULT_SKILLS,
  DEFAULT_SKILLS_PAGE_NAME,
  type DefaultSkillDefinition,
} from "../constants/default-skills";
import { searchBlocksByTag } from "./search-service";
import { safeText } from "../utils/text-utils";
import { throwIfBackendError, unwrapBackendResult } from "../utils/block-utils";
import { PropType } from "../utils/query-types";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const LOG_PREFIX = "[skill-initializer]";

// 标记是否已检查过（避免重复检查）
let hasChecked = false;

// ─────────────────────────────────────────────────────────────────────────────
// Helper Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 获取日记根块 ID 或创建一个根位置
 * @returns 可用的根块 ID
 */
async function findOrCreateRootBlock(): Promise<number> {
  try {
    // 尝试获取今日日记的根块
    const result = await orca.invokeBackend("get-journal-block", new Date());
    const journal = unwrapBackendResult<any>(result);
    throwIfBackendError(journal, "get-journal-block");

    if (journal && typeof journal === "object" && (journal as any).id != null) {
      console.log(`${LOG_PREFIX} Using today's journal as root: ${(journal as any).id}`);
      return (journal as any).id;
    }
  } catch (error) {
    console.warn(`${LOG_PREFIX} Failed to get today's journal:`, error);
  }

  // 回退：使用根块 ID 1（大多数笔记应用的根块）
  console.log(`${LOG_PREFIX} Using default root block ID: 1`);
  return 1;
}

async function getBlockForInsert(blockId: number): Promise<any> {
  const fromState = (orca.state.blocks as any)?.[blockId];
  if (fromState) return fromState;

  const result = await orca.invokeBackend("get-block", blockId);
  const block = unwrapBackendResult<any>(result);
  throwIfBackendError(block, "get-block");
  return block;
}

function normalizeSkillName(text: string): string {
  return text
    .replace(/#skill\b/gi, "")
    .replace(/\[\[skill\]\]/gi, "")
    .replace(/^[-*]\s*/, "")
    .trim();
}

/**
 * 创建块并返回新块 ID（使用后端 API）
 */
async function createBlock(
  refBlockId: number,
  position: "before" | "after" | "firstChild" | "lastChild",
  content: string
): Promise<number> {
  const refBlock = await getBlockForInsert(refBlockId);

  const newBlockId = await orca.commands.invokeEditorCommand(
    "core.editor.insertBlock",
    null, // cursor context (not required for programmatic insert)
    refBlock,
    position,
    [{ t: "t", v: content }],
  );

  if (typeof newBlockId === "number" && Number.isFinite(newBlockId)) {
    return newBlockId;
  }

  throw new Error(`Failed to create block, result: ${JSON.stringify(newBlockId)}`);
}

/**
 * 为块添加标签（使用后端 API）
 */
async function insertTag(
  blockId: number,
  tagName: string,
  properties?: Array<{ name: string; value: any; type?: number; typeArgs?: any }>
): Promise<void> {
  await orca.commands.invokeEditorCommand(
    "core.editor.insertTag",
    null, // cursor context
    blockId,
    tagName,
    properties && properties.length ? properties : undefined,
  );
}

/**
 * 为块创建页面别名（使用后端 API）
 */
async function createPage(blockId: number, pageName: string): Promise<void> {
  await orca.commands.invokeEditorCommand(
    "core.editor.createAlias",
    null, // cursor context
    pageName,
    blockId,
    true, // asPage
  );
}

/**
 * 确保 #skill 标签存在，并创建/更新其 tag schema
 * - property: type (TextChoices)
 * - choices: tool / prompt
 */
async function ensureSkillTagSchema(refBlockIdForTagBlock: number): Promise<void> {
  let tagBlock: any | null = null;

  try {
    tagBlock = await orca.invokeBackend("get-block-by-alias", "skill");
  } catch (error) {
    console.warn(`${LOG_PREFIX} Failed to lookup tag block "skill":`, error);
  }

  // 如果 tag block 不存在，创建一个并设置 alias=skill（asPage=false）
  if (!tagBlock || typeof tagBlock !== "object" || tagBlock.id == null) {
    const tagBlockId = await createBlock(refBlockIdForTagBlock, "lastChild", "skill");

    const err = await orca.commands.invokeEditorCommand(
      "core.editor.createAlias",
      null,
      "skill",
      tagBlockId,
      false, // asPage
    );

    // core.editor.createAlias 返回 error object（如名称冲突），这里仅记录不阻断初始化流程
    if (err) {
      console.warn(`${LOG_PREFIX} Failed to create alias "skill" (may already exist):`, err);
    }

    try {
      tagBlock = await orca.invokeBackend("get-block", tagBlockId);
    } catch (error) {
      console.warn(`${LOG_PREFIX} Failed to fetch newly created tag block:`, error);
      tagBlock = { id: tagBlockId };
    }
  }

  const tagBlockId = tagBlock.id as number;
  const existing = Array.isArray(tagBlock.properties)
    ? tagBlock.properties.find((p: any) => p && typeof p.name === "string" && p.name === "type")
    : undefined;

  const existingChoices = (() => {
    const choices = existing?.typeArgs?.choices;
    if (!Array.isArray(choices)) return [];
    return choices
      .map((c: any) => (typeof c === "string" ? c : (c?.n ?? c?.name ?? "")))
      .filter((s: any) => typeof s === "string" && s.trim())
      .map((s: string) => s.trim().toLowerCase());
  })();

  const hasTool = existing?.type === PropType.TextChoices && existingChoices.includes("tool");
  const hasPrompt = existing?.type === PropType.TextChoices && existingChoices.includes("prompt");

  if (hasTool && hasPrompt) {
    console.log(`${LOG_PREFIX} Tag schema already has "type" choices: tool/prompt`);
    return;
  }

  // 通过 setProperties 给 tag block 设置 schema 属性（BlockProperty 支持 typeArgs）
  await orca.commands.invokeEditorCommand(
    "core.editor.setProperties",
    null,
    [tagBlockId],
    [
      {
        name: "type",
        type: PropType.TextChoices,
        typeArgs: { choices: [{ n: "tool" }, { n: "prompt" }] },
        value: [],
      },
    ],
  );

  console.log(`${LOG_PREFIX} Ensured tag schema for #skill: type (tool/prompt)`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Functions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 创建预置 Skills 页面和技能块
 */
async function createDefaultSkillsPage(): Promise<number> {
  console.log(`${LOG_PREFIX} Creating default skills page...`);

  // 1. 获取根块位置
  const rootBlockId = await findOrCreateRootBlock();

  // 2. 创建 "AI Skills" 页面块
  const pageBlockId = await createBlock(
    rootBlockId,
    "lastChild",
    DEFAULT_SKILLS_PAGE_NAME
  );

  console.log(`${LOG_PREFIX} Created page block: ${pageBlockId}`);

  // 3. 为页面块创建别名
  await createPage(pageBlockId, DEFAULT_SKILLS_PAGE_NAME);
  console.log(`${LOG_PREFIX} Created page alias: ${DEFAULT_SKILLS_PAGE_NAME}`);

  return pageBlockId;
}

/**
 * 创建单个 Skill 块
 */
async function createSkillBlock(
  parentBlockId: number,
  skill: DefaultSkillDefinition
): Promise<void> {
  try {
    // 1. 创建 skill 根块（名称）
    const skillBlockId = await createBlock(parentBlockId, "lastChild", skill.name);

    console.log(`${LOG_PREFIX} Created skill block: ${skill.name} (${skillBlockId})`);

    // 2. 添加 #skill 标签（带 type property）
    await insertTag(skillBlockId, "skill", [
      { name: "type", type: PropType.TextChoices, value: [skill.type] },
    ]);

    // 3. 创建向后兼容的元数据子块（即使 tag properties 读取不到，也能解析）
    await createBlock(skillBlockId, "lastChild", `类型: ${skill.type}`);
    if (skill.description) {
      await createBlock(skillBlockId, "lastChild", `描述: ${skill.description}`);
    }

    // 4. 如果是工具型 Skill，创建工具列表子块
    if (skill.type === "tools" && skill.tools && skill.tools.length > 0) {
      await createBlock(skillBlockId, "lastChild", `工具: ${skill.tools.join(", ")}`);
    }

    // 5. 创建 prompt 子块
    await createBlock(skillBlockId, "lastChild", `提示词: ${skill.prompt}`);

    console.log(`${LOG_PREFIX} Completed skill: ${skill.name}`);
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to create skill "${skill.name}":`, error);
  }
}

/**
 * 确保默认 Skills 存在
 * 首次使用插件时自动创建预置 Skills
 *
 * @returns true 如果创建了新的 Skills，false 如果已存在
 */
export async function ensureDefaultSkills(): Promise<boolean> {
  // 避免重复检查
  if (hasChecked) {
    console.log(`${LOG_PREFIX} Already checked, skipping`);
    return false;
  }

  hasChecked = true;

  try {
    console.log(`${LOG_PREFIX} Checking for existing skills...`);

    // 1. 获取/创建 Skills 页面
    let pageBlockId: number | undefined;
    try {
      const existingPage = await orca.invokeBackend("get-block-by-alias", DEFAULT_SKILLS_PAGE_NAME);
      if (existingPage && typeof existingPage === "object" && (existingPage as any).id != null) {
        pageBlockId = (existingPage as any).id;
      }
    } catch (error) {
      console.warn(`${LOG_PREFIX} Failed to lookup skills page by alias:`, error);
    }

    if (!pageBlockId) {
      pageBlockId = await createDefaultSkillsPage();
    }

    // 确保 #skill 的 tag schema 已创建（type: tool/prompt）
    await ensureSkillTagSchema(pageBlockId);

    // 2. 检查已有技能名称，避免重复创建同名预置 Skill
    const existingSkillBlocks = await searchBlocksByTag("skill", 100);
    const existingNames = new Set(
      existingSkillBlocks
        .map((b) => normalizeSkillName(safeText(b)))
        .filter((n) => n.length > 0),
    );

    let createdCount = 0;
    for (const skill of DEFAULT_SKILLS) {
      if (existingNames.has(skill.name)) continue;
      await createSkillBlock(pageBlockId, skill);
      createdCount += 1;
    }

    if (createdCount > 0) {
      console.log(`${LOG_PREFIX} Created ${createdCount} default skill(s)`);

      if (typeof orca.notify === "function") {
        orca.notify("info", "已为您创建 AI 技能模板，可在笔记中自定义");
      }

      return true;
    }

    console.log(`${LOG_PREFIX} Default skills already present, skipping creation`);
    return false;
  } catch (error) {
    console.error(`${LOG_PREFIX} Failed to initialize default skills:`, error);

    // 创建失败时不阻止插件使用
    if (typeof orca.notify === "function") {
      orca.notify("warn", "AI 技能模板创建失败，您可以手动创建 #skill 标签");
    }

    return false;
  }
}

/**
 * 重置检查状态（用于测试或手动触发）
 */
export function resetSkillInitializerState(): void {
  hasChecked = false;
}
