/**
 * Skill Block Reader
 *
 * 从 Orca 笔记中读取带有 "AI SKILL" 标签的块，并将其解析为 Skill 对象。
 *
 * 块格式约定：
 * - 标签：块必须有 "AI SKILL" 标签
 * - 标题：块别名 aliases[0] → 技能名称
 * - description 属性：块 properties 中名为 "description" 的属性 → 技能描述
 * - 内容：块 text → 技能指令
 * - 生成的 ID：block-{blockId}
 */

import type { Skill, SkillRef, BlockSkillSource } from "../../types/skills";

/** 技能标签名 */
const SKILL_TAG = "AI SKILL";

/** 缓存 TTL（毫秒） */
const BLOCK_SKILLS_CACHE_TTL = 30_000;

/** 缓存状态 */
let blockSkillsCache: { skills: Skill[]; timestamp: number } | null = null;

/** 解析结果 */
export interface BlockSkillParseResult {
  skills: Skill[];
  errors: Array<{ blockId: number; error: string }>;
}

/**
 * 读取所有 "AI SKILL" 标签的块并解析为 Skill[]
 * 优先使用缓存，缓存过期后重新查询
 */
export async function readBlockSkills(): Promise<BlockSkillParseResult> {
  const now = Date.now();
  if (blockSkillsCache && (now - blockSkillsCache.timestamp) < BLOCK_SKILLS_CACHE_TTL) {
    return { skills: blockSkillsCache.skills, errors: [] };
  }

  console.log("[SkillBlockReader] Fetching AI SKILL blocks from Orca...");
  const errors: Array<{ blockId: number; error: string }> = [];

  try {
    // 方式 1：使用 orca.invokeBackend 查询标签
    let rawBlocks: any[] = [];
    try {
      const result = await orca.invokeBackend("get-blocks-with-tags", [SKILL_TAG]);
      if (Array.isArray(result)) {
        rawBlocks = result;
      } else if (result?.blocks) {
        rawBlocks = result.blocks;
      }
      console.log(`[SkillBlockReader] get-blocks-with-tags returned ${rawBlocks.length} blocks`);
    } catch (e) {
      console.warn("[SkillBlockReader] get-blocks-with-tags failed, trying state scan:", e);
      // 回退：扫描当前已加载的块
      rawBlocks = scanLoadedBlocks();
    }

    // 解析每个块
    const skills: Skill[] = [];
    for (const block of rawBlocks) {
      try {
        const skill = parseBlockToSkill(block);
        if (skill) {
          skills.push(skill);
        }
      } catch (e: any) {
        errors.push({ blockId: block.id || 0, error: e?.message || String(e) });
      }
    }

    // 更新缓存
    blockSkillsCache = { skills, timestamp: now };
    console.log(`[SkillBlockReader] Parsed ${skills.length} skills, ${errors.length} errors`);
    return { skills, errors };
  } catch (err: any) {
    console.error("[SkillBlockReader] Failed to read block skills:", err);
    return { skills: blockSkillsCache?.skills || [], errors };
  }
}

/**
 * 按 ID 读取单个块技能
 */
export async function readBlockSkillById(blockId: number): Promise<Skill | null> {
  try {
    const { skills } = await readBlockSkills();
    return skills.find((s) => s.id === `block-${blockId}`) || null;
  } catch {
    return null;
  }
}

/**
 * 获取所有块技能的 SkillRef 列表
 */
export async function listBlockSkillRefs(): Promise<SkillRef[]> {
  try {
    const { skills } = await readBlockSkills();
    return skills.map((s) => ({ id: s.id, name: s.name, scope: "local" as const }));
  } catch {
    return [];
  }
}

/**
 * 按 SkillRef 获取块技能
 */
export async function getBlockSkill(ref: SkillRef): Promise<Skill | null> {
  if (ref.scope !== "local" || !ref.id.startsWith("block-")) return null;
  try {
    const { skills } = await readBlockSkills();
    return skills.find((s) => s.id === ref.id) || null;
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal helpers
// ─────────────────────────────────────────────────────────────────────────────

/** 扫描当前已加载的块（后备方案） */
function scanLoadedBlocks(): any[] {
  const blocks: any[] = [];
  try {
    const stateBlocks = (orca as any)?.state?.blocks;
    if (!stateBlocks) return blocks;

    for (const [id, block] of Object.entries(stateBlocks)) {
      if (!block) continue;
      const b = block as any;
      // 检查 refs 中是否有 "AI SKILL" 标签
      const hasTag = b.aliases?.includes(SKILL_TAG) ||
        b.refs?.some((r: any) => r.alias === SKILL_TAG);
      if (hasTag) {
        blocks.push(b);
      }
    }
  } catch {
    // 静默失败
  }
  return blocks;
}

/**
 * 将 Orca 块解析为 Skill 对象
 */
function parseBlockToSkill(block: any): Skill | null {
  if (!block) return null;

  const blockId = block.id;
  if (!blockId) return null;

  // 提取名称：优先 aliases，回退到内容首行
  let name = "";
  if (block.aliases && block.aliases.length > 0) {
    name = block.aliases[0];
  }
  if (!name && block.text) {
    // 用内容首行作为名称（去除标题标记 #）
    const firstLine = block.text.split("\n")[0]?.replace(/^#+\s*/, "").trim();
    name = firstLine || `技能-${blockId}`;
  }
  if (!name) {
    name = `技能-${blockId}`;
  }

  // 提取描述：从 block.properties 中查找名为 "description" 的属性
  let description = "";
  if (block.properties && Array.isArray(block.properties)) {
    const descProp = block.properties.find(
      (p: any) => p?.name === "description"
    );
    if (descProp && descProp.value !== undefined) {
      description = String(descProp.value);
    }
  }
  // 回退：内容中提取第一个非标题段落
  if (!description && block.text) {
    const lines = block.text.split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#") && trimmed.length > 10) {
        description = trimmed.slice(0, 200);
        break;
      }
    }
  }

  // 提取内容作为指令
  let instruction = "";
  if (typeof block.text === "string") {
    instruction = block.text;
  } else if (typeof block.content === "string") {
    instruction = block.content;
  } else if (typeof block.fullContent === "string") {
    instruction = block.fullContent;
  }

  // 提取页面信息
  let pageId: number | undefined;
  let pageTitle: string | undefined;
  if (block.page?.id) {
    pageId = block.page.id;
    pageTitle = block.page.title || block.page.name;
  }

  const blockSource: BlockSkillSource = {
    blockId,
    pageId,
    pageTitle,
  };

  // 提取标签（除了 "AI SKILL" 以外的其他标签）
  const tags: string[] = [];
  if (block.aliases && Array.isArray(block.aliases)) {
    for (const alias of block.aliases) {
      if (alias !== SKILL_TAG && alias !== name) {
        tags.push(alias);
      }
    }
  }

  return {
    id: `block-${blockId}`,
    name,
    description,
    instruction,
    scope: "local",
    sourceType: "block",
    mode: "auto",
    tags: tags.length > 0 ? tags : undefined,
    blockSource,
  };
}
