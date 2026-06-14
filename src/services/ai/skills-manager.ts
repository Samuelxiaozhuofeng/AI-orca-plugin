/**
 * Skills Manager Service
 *
 * 管理 Skills 的存储和操作，支持三种作用域：
 *
 * 内置 (internal): 插件代码常量，所有仓库共享
 * 全局 (global): {plugin-dir}/skills/{skill-id}/SKILL.md，所有仓库共享
 * 局部 (local): Orca 块（带 "AI SKILL" 标签），仅当前仓库可见
 */

import { getAiChatPluginName } from "../../ui/ai-chat-ui";
import { readBlockSkills, listBlockSkillRefs, getBlockSkill } from "./skill-block-reader";
import type { Skill, SkillRef, SkillScope, SkillMode, SkillMetadata, SkillFile } from "../../types/skills";

const SKILLS_ROOT = "skills";
const SKILL_METADATA_FILE = "SKILL.md";

// ───────────────────────────────────────────────────────────────────────────────
// Built-in Skills (内置技能)
// ───────────────────────────────────────────────────────────────────────────────

const BUILT_IN_SKILLS: Skill[] = [
  {
    id: "今日回顾",
    name: "今日回顾",
    description: "总结今天的工作和生活，提取关键事件、完成任务和待办事项。Use when users ask to review their day, summarize today's work, or reflect on daily progress.",
    instruction: `# 今日回顾

## 执行工具要求

**必须使用的工具**:
- \`getTodayJournal\` - 获取今天日记的完整内容

**执行流程**:
1. 调用 \`getTodayJournal\` 工具获取今天的日记内容
2. 分析日记内容，提取关键信息
3. 按照下面的格式组织内容
4. 生成结构化的回顾总结

## 输出格式

\`\`\`markdown
## 今日回顾

### 关键事件
- [事件 1]

### 已完成任务
✅ [任务 1]

### 未完成/待办
⏳ [待办 1]

### 明日关注
- [明日计划 1]
\`\`\`

## 执行规则
- ✅ 必须先调用 getTodayJournal 工具获取今天的日记
- ✅ 只使用日记中的真实内容，不要编造
- ✅ 关键事件最多 5 条，按重要性排序
- ❌ 不要使用其他工具`,
    scope: "internal",
    sourceType: "builtin",
    mode: "auto",
    tags: ["日记", "总结", "回顾", "反思"],
  },
  {
    id: "周报聚合",
    name: "周报聚合",
    description: "汇总一周的工作成果、项目进展和问题解决方案，生成专业周报。Use when users need to create weekly reports, summarize weekly progress, or prepare team updates.",
    instruction: `# 周报聚合

## 执行工具要求

**必须使用的工具**:
- \`queryBlocks\` - 按日期范围获取日记

**执行流程**:
1. 调用 \`queryBlocks\` 工具获取本周的日记
2. 分析日记内容，按项目/部门分类
3. 提取关键成果、问题和下周计划

## 输出格式

\`\`\`markdown
## 周报总结 (第 X 周)

### 本周成果
- [成果 1]

### 项目进展
**项目 A**
- 进度：X% → Y%
- 完成：[完成项]

### 遇到的问题
1. **问题 1**
   - 原因：[原因]
   - 解决：[解决方案]

### 下周计划
- [ ] [计划 1]
\`\`\`

## 执行规则
- ✅ 必须先调用 queryBlocks 工具获取本周日记
- ✅ 只使用日记中的真实内容
- ❌ 不要编造数据或进度`,
    scope: "internal",
    sourceType: "builtin",
    mode: "auto",
    tags: ["周报", "总结", "汇总", "报告"],
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Internal Helpers
// ─────────────────────────────────────────────────────────────────────────────

/** 获取插件名称，根据 scope 决定 */
function getPluginName(isGlobal: boolean): string {
  if (isGlobal) {
    // 全局存储：动态获取插件名称，确保存储到正确的插件目录
    const name = getAiChatPluginName();
    return name || "ai-chat";
  }
  // 局部存储：固定使用 "ai-chat"，存储在仓库的 plugin-data/ai-chat/ 目录
  return "ai-chat";
}

function buildSkillPath(skillId: string, ...parts: string[]): string {
  const pathParts = [SKILLS_ROOT, skillId, ...parts].filter(Boolean);
  return pathParts.join("/");
}

function parseSkillMetadata(content: string): { metadata: SkillMetadata; instruction: string } {
  // 解析 SKILL.md 的 frontmatter 和内容
  const frontmatterRegex = /^---\n([\s\S]*?)\n---\n([\s\S]*)$/;
  const match = content.match(frontmatterRegex);

  if (!match) {
    // 没有 frontmatter，整个内容作为 instruction
    return {
      metadata: { id: "", name: "" },
      instruction: content,
    };
  }

  const [, frontmatterStr, instruction] = match;
  const metadata: SkillMetadata = { id: "", name: "" };

  // 简单的 YAML 解析
  const lines = frontmatterStr.split("\n");
  for (const line of lines) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;

    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();

    if (key === "tags") {
      metadata.tags = value
        .replace(/^\[|\]$/g, "")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);
    } else if (value === "true") {
      (metadata as any)[key] = true;
    } else if (value === "false") {
      (metadata as any)[key] = false;
    } else {
      (metadata as any)[key] = value.replace(/^["']|["']$/g, "");
    }
  }

  return { metadata, instruction };
}

function buildSkillMetadataContent(metadata: Partial<SkillMetadata>, instruction: string): string {
  const lines: string[] = ["---"];

  for (const [key, value] of Object.entries(metadata)) {
    if (key === "id") continue; // id 不写入文件

    if (Array.isArray(value)) {
      lines.push(`${key}: [${value.map((v) => `"${v}"`).join(", ")}]`);
    } else if (typeof value === "string") {
      lines.push(`${key}: "${value}"`);
    } else if (typeof value === "boolean") {
      lines.push(`${key}: ${value}`);
    } else if (value !== null && value !== undefined) {
      lines.push(`${key}: ${JSON.stringify(value)}`);
    }
  }

  lines.push("---");
  lines.push("");
  lines.push(instruction);

  return lines.join("\n");
}

// ───────────────────────────────────────────────────────────────────────────────
// Scope Helpers - 处理全局/局部存储
// ───────────────────────────────────────────────────────────────────────────────

/** 列出指定 scope 的所有文件 */
async function listFilesForScope(isGlobal: boolean): Promise<string[]> {
  const pluginName = getPluginName(isGlobal);
  return orca.plugins.listFiles(pluginName);
}

/** 读取指定 scope 的文件 */
async function readFileForScope(path: string, isGlobal: boolean): Promise<string | null> {
  const pluginName = getPluginName(isGlobal);
  const content = await orca.plugins.readFile(pluginName, path, "string");
  if (!content) return null;
  return typeof content === 'string' 
    ? content 
    : new TextDecoder().decode(new Uint8Array(content as ArrayBuffer));
}

/** 写入指定 scope 的文件 */
async function writeFileForScope(path: string, content: string, isGlobal: boolean): Promise<void> {
  const pluginName = getPluginName(isGlobal);
  await orca.plugins.writeFile(pluginName, path, content);
}

/** 删除指定 scope 的文件 */
async function removeFileForScope(path: string, isGlobal: boolean): Promise<void> {
  const pluginName = getPluginName(isGlobal);
  await orca.plugins.removeFile(pluginName, path);
}

/** 删除指定 scope 的文件夹 */
async function removeFolderForScope(path: string, isGlobal: boolean): Promise<void> {
  const pluginName = getPluginName(isGlobal);
  await orca.plugins.removeFolder(pluginName, path);
}

/** 从文件列表中提取 Skill IDs */
function extractSkillIdsFromEntries(entries: string[]): string[] {
  const skillIds = new Set<string>();
  
  for (const entry of entries) {
    const normalizedEntry = entry.replace(/\\/g, "/");
    const skillsPrefix = `${SKILLS_ROOT}/`;
    
    if (!normalizedEntry.startsWith(skillsPrefix)) continue;
    
    const relative = normalizedEntry.slice(SKILLS_ROOT.length + 1);
    const parts = relative.split("/");
    
    if (parts.length > 0 && parts[0]) {
      skillIds.add(parts[0]);
    }
  }
  
  return Array.from(skillIds);
}

// ───────────────────────────────────────────────────────────────────────────────
// Public API
// ───────────────────────────────────────────────────────────────────────────────

/**
 * 列出所有 Skills（聚合内置、全局文件、局部块三种来源）
 * @returns SkillRef 数组，包含 id、scope 和 isGlobal（兼容旧代码）
 */
export async function listSkills(): Promise<SkillRef[]> {
  try {
    const result: SkillRef[] = [];
    const seen = new Set<string>();

    // 1. 内置技能 (internal)
    for (const skill of BUILT_IN_SKILLS) {
      result.push({ id: skill.id, name: skill.name, scope: "internal" });
      seen.add(skill.id);
    }

    // 2. 全局文件技能 (global)
    const globalEntries = await listFilesForScope(true).catch(() => []);
    const globalIds = extractSkillIdsFromEntries(globalEntries);
    for (const id of globalIds) {
      if (seen.has(id)) continue; // 内置优先
      result.push({ id, name: id, scope: "global", isGlobal: true });
      seen.add(id);
    }

    // 3. 局部块技能 (local)
    try {
      const blockRefs = await listBlockSkillRefs();
      for (const ref of blockRefs) {
        if (seen.has(ref.id)) continue;
        result.push({ id: ref.id, name: ref.name, scope: "local" });
        seen.add(ref.id);
      }
    } catch (err) {
      console.warn("[SkillsManager] Failed to list block skills:", err);
    }

    // 按名称排序
    result.sort((a, b) => a.id.localeCompare(b.id));

    console.log(`[SkillsManager] listSkills() found ${result.length} skills (internal: ${BUILT_IN_SKILLS.length}, global: ${globalIds.length}, local: ${result.filter(r => r.scope === "local").length})`);
    return result;
  } catch (err) {
    console.error("[SkillsManager] Failed to list skills:", err);
    return [];
  }
}

/**
 * 获取 Skill 详情
 * @param skillId Skill ID
 * @param isGlobal 是否为全局 Skill（兼容旧 API，建议使用 scope 参数）
 */
export async function getSkill(skillId: string, isGlobal?: boolean): Promise<Skill | null> {
  try {
    // 1. 先检查内置技能
    const builtIn = BUILT_IN_SKILLS.find((s) => s.id === skillId);
    if (builtIn) {
      const mode = await getSkillMode(skillId, "internal");
      return { ...builtIn, mode };
    }

    // 2. 块技能（从 skill-block-reader）
    if (skillId.startsWith("block-")) {
      const blockSkill = await getBlockSkill({ id: skillId, name: skillId, scope: "local" });
      if (blockSkill) {
        const mode = await getSkillMode(skillId, "local");
        return { ...blockSkill, mode };
      }
      return null;
    }

    // 3. 文件技能（全局或旧版局部）
    const skillMdPath = buildSkillPath(skillId, SKILL_METADATA_FILE);

    if (isGlobal !== undefined) {
      const content = await readFileForScope(skillMdPath, isGlobal);
      if (!content) return null;
      return await buildSkillFromContent(skillId, content, isGlobal);
    }

    // 未指定时：先全局，再局部
    const globalContent = await readFileForScope(skillMdPath, true).catch(() => null);
    if (globalContent) {
      return await buildSkillFromContent(skillId, globalContent, true);
    }

    const localContent = await readFileForScope(skillMdPath, false).catch(() => null);
    if (localContent) {
      return await buildSkillFromContent(skillId, localContent, false);
    }

    console.warn(`[SkillsManager] Skill not found: ${skillId}`);
    return null;
  } catch (err) {
    console.error(`[SkillsManager] Failed to get skill ${skillId}:`, err);
    return null;
  }
}

/** 从文件内容构建 Skill 对象 */
async function buildSkillFromContent(skillId: string, content: string, isGlobal: boolean): Promise<Skill> {
  const { metadata, instruction } = parseSkillMetadata(content);
  metadata.id = skillId;

  const files = await listSkillFiles(skillId, isGlobal);
  const mode = await getSkillMode(skillId, isGlobal ? "global" : "local");

  return {
    id: skillId,
    name: metadata.name || skillId,
    description: metadata.description || "",
    instruction,
    scope: isGlobal ? "global" : "local",
    sourceType: "file" as const,
    mode,
    tags: metadata.tags,
    files,
    isGlobal,
    metadata,
  };
}

/**
 * 创建新 Skill
 * @param skillId Skill ID
 * @param metadata Skill 元数据
 * @param instruction Skill 指令
 * @param isGlobal 是否为全局 Skill（默认 false，即局部）
 */
export async function createSkill(
  skillId: string,
  metadata: Omit<SkillMetadata, "id">,
  instruction: string,
  isGlobal: boolean = false
): Promise<boolean> {
  console.log(`[SkillsManager] createSkill() called: skillId=${skillId}, name=${metadata.name}, isGlobal=${isGlobal}`);

  try {
    // 检查在同一 scope 中是否已存在
    const existing = await getSkill(skillId, isGlobal);
    if (existing) {
      console.warn(`[SkillsManager] Skill already exists in ${isGlobal ? 'global' : 'local'} scope: ${skillId}`);
      return false;
    }

    // 创建 SKILL.md
    const skillMdPath = buildSkillPath(skillId, SKILL_METADATA_FILE);
    const fullMetadata: SkillMetadata = { id: skillId, name: metadata.name, ...metadata };
    const content = buildSkillMetadataContent(fullMetadata, instruction);

    await writeFileForScope(skillMdPath, content, isGlobal);
    
    // 验证文件已写入
    const verifyContent = await readFileForScope(skillMdPath, isGlobal);
    if (!verifyContent) {
      console.error(`[SkillsManager] Verification failed: SKILL.md not found after write`);
      return false;
    }

    console.log(`[SkillsManager] Successfully created skill: ${skillId} (${isGlobal ? 'global' : 'local'})`);
    return true;
  } catch (err) {
    console.error(`[SkillsManager] Failed to create skill ${skillId}:`, err);
    return false;
  }
}

/**
 * 更新 Skill 的元数据和指令
 * @param skillId Skill ID
 * @param metadata 要更新的元数据
 * @param instruction 新的指令（可选）
 * @param isGlobal 是否为全局 Skill
 */
export async function updateSkill(
  skillId: string,
  metadata: Partial<SkillMetadata>,
  instruction?: string,
  isGlobal?: boolean
): Promise<boolean> {
  try {
    // 如果没指定 isGlobal，先查找 Skill 确定其位置
    let targetIsGlobal = isGlobal;
    if (targetIsGlobal === undefined) {
      const skill = await getSkill(skillId);
      if (!skill) {
        console.warn(`[SkillsManager] Skill not found: ${skillId}`);
        return false;
      }
      // 内置技能和块技能不可编辑
      if (skill.scope === "internal" || skill.sourceType === "block") {
        console.warn(`[SkillsManager] Cannot update ${skill.scope}/${skill.sourceType} skill: ${skillId}`);
        return false;
      }
      targetIsGlobal = skill.isGlobal;
    }

    const skill = await getSkill(skillId, targetIsGlobal);
    if (!skill) {
      console.warn(`[SkillsManager] Skill not found: ${skillId}`);
      return false;
    }

    // 合并元数据（文件技能始终有 metadata）
    const existingMeta: SkillMetadata = skill.metadata
      ? { ...skill.metadata, id: skill.metadata.id || skillId }
      : { id: skillId, name: skill.name, description: skill.description };
    const updatedMetadata: SkillMetadata = {
      ...existingMeta,
      ...metadata,
      id: skillId,
    };

    // 使用新指令或保留原有指令
    const updatedInstruction = instruction ?? skill.instruction;

    // 更新 SKILL.md
    const skillMdPath = buildSkillPath(skillId, SKILL_METADATA_FILE);
    const content = buildSkillMetadataContent(updatedMetadata, updatedInstruction);

    await writeFileForScope(skillMdPath, content, targetIsGlobal!);

    return true;
  } catch (err) {
    console.error(`[SkillsManager] Failed to update skill ${skillId}:`, err);
    return false;
  }
}

/**
 * 删除 Skill（直接删除整个文件夹）
 * @param skillId Skill ID
 * @param isGlobal 是否为全局 Skill
 */
export async function deleteSkill(skillId: string, isGlobal: boolean): Promise<boolean> {
  try {
    console.log(`[SkillsManager] Deleting skill: ${skillId} (${isGlobal ? 'global' : 'local'})`);
    
    const skillFolderPath = buildSkillPath(skillId);
    await removeFolderForScope(skillFolderPath, isGlobal);
    
    console.log(`[SkillsManager] Successfully deleted skill: ${skillId}`);
    return true;
  } catch (err) {
    console.error(`[SkillsManager] Failed to delete skill ${skillId}:`, err);
    return false;
  }
}

/**
 * 列出 Skill 下的所有文件
 * @param skillId Skill ID
 * @param isGlobal 是否为全局 Skill
 */
export async function listSkillFiles(skillId: string, isGlobal: boolean): Promise<SkillFile[]> {
  try {
    const entries = await listFilesForScope(isGlobal);
    const skillPrefix = buildSkillPath(skillId);
    const files: SkillFile[] = [];
    const seen = new Set<string>();

    for (const entry of entries) {
      const normalizedEntry = entry.replace(/\\/g, "/");
      const normalizedPrefix = skillPrefix.replace(/\\/g, "/");
      
      if (!normalizedEntry.startsWith(`${normalizedPrefix}/`)) continue;

      const relative = normalizedEntry.slice(normalizedPrefix.length + 1);
      if (!relative) continue;

      const parts = relative.split("/");
      const name = parts[0];

      if (seen.has(name)) continue;
      seen.add(name);

      files.push({
        path: relative,
        name,
        isDir: parts.length > 1,
      });
    }

    return files.sort((a, b) => a.name.localeCompare(b.name));
  } catch (err) {
    console.error(`[SkillsManager] Failed to list files for skill ${skillId}:`, err);
    return [];
  }
}

/**
 * 读取 Skill 中的文件
 * @param skillId Skill ID
 * @param filePath 文件路径
 * @param isGlobal 是否为全局 Skill
 */
export async function readSkillFile(skillId: string, filePath: string, isGlobal: boolean): Promise<string | null> {
  try {
    const fullPath = buildSkillPath(skillId, filePath);
    return await readFileForScope(fullPath, isGlobal);
  } catch (err) {
    console.error(`[SkillsManager] Failed to read file ${filePath} from skill ${skillId}:`, err);
    return null;
  }
}

/**
 * 写入 Skill 中的文件
 * @param skillId Skill ID
 * @param filePath 文件路径
 * @param content 文件内容
 * @param isGlobal 是否为全局 Skill
 */
export async function writeSkillFile(
  skillId: string,
  filePath: string,
  content: string,
  isGlobal: boolean
): Promise<boolean> {
  try {
    const fullPath = buildSkillPath(skillId, filePath);
    await writeFileForScope(fullPath, content, isGlobal);
    return true;
  } catch (err) {
    console.error(`[SkillsManager] Failed to write file ${filePath} to skill ${skillId}:`, err);
    return false;
  }
}

/**
 * 删除 Skill 中的文件
 * @param skillId Skill ID
 * @param filePath 文件路径
 * @param isGlobal 是否为全局 Skill
 */
export async function deleteSkillFile(skillId: string, filePath: string, isGlobal: boolean): Promise<boolean> {
  try {
    const fullPath = buildSkillPath(skillId, filePath);
    await removeFileForScope(fullPath, isGlobal);
    return true;
  } catch (err) {
    console.error(`[SkillsManager] Failed to delete file ${filePath} from skill ${skillId}:`, err);
    return false;
  }
}

/**
 * 获取 Skill 的执行模式（含懒迁移）
 * @param skillId Skill ID
 * @param scopeOrIsGlobal Skill 作用域或旧版 isGlobal 布尔值
 */
export async function getSkillMode(skillId: string, scopeOrIsGlobal?: SkillScope | boolean): Promise<SkillMode> {
  const scope = normalizeScope(scopeOrIsGlobal);
  const pluginName = "ai-chat";
  const modeKey = `skills:mode:${scope}:${skillId}`;
  const oldDisabledKey = `skills:disabled:${scope}:${skillId}`;

  try {
    // 1. 先查新 key
    const modeValue = await orca.plugins.getData(pluginName, modeKey);
    if (modeValue === "auto" || modeValue === "ask" || modeValue === "disabled") {
      return modeValue as SkillMode;
    }

    // 2. 懒迁移：查旧 key
    const oldValue = await orca.plugins.getData(pluginName, oldDisabledKey);
    const newMode: SkillMode = oldValue === "true" ? "disabled" : "auto";

    // 3. 写入新 key，清理旧 key
    await orca.plugins.setData(pluginName, modeKey, newMode);
    await orca.plugins.setData(pluginName, oldDisabledKey, null);

    return newMode;
  } catch {
    return "auto"; // 默认启用
  }
}

/**
 * @deprecated 使用 getSkillMode 替代
 */
export async function isSkillEnabled(skillId: string, scopeOrIsGlobal?: SkillScope | boolean): Promise<boolean> {
  const mode = await getSkillMode(skillId, scopeOrIsGlobal);
  return mode !== "disabled";
}

/**
 * 设置 Skill 的执行模式
 * @param skillId Skill ID
 * @param mode 执行模式
 * @param scopeOrIsGlobal Skill 作用域或旧版 isGlobal 布尔值
 */
export async function setSkillMode(skillId: string, mode: SkillMode, scopeOrIsGlobal?: SkillScope | boolean): Promise<boolean> {
  const scope = normalizeScope(scopeOrIsGlobal);
  const pluginName = "ai-chat";
  const modeKey = `skills:mode:${scope}:${skillId}`;
  const oldDisabledKey = `skills:disabled:${scope}:${skillId}`;

  try {
    await orca.plugins.setData(pluginName, modeKey, mode);
    // 清理旧 key
    try { await orca.plugins.setData(pluginName, oldDisabledKey, null); } catch { /* ignore */ }
    console.log(`[SkillsManager] Skill ${skillId} mode set to ${mode} (scope: ${scope})`);
    return true;
  } catch (err) {
    console.error(`[SkillsManager] Failed to set skill ${skillId} mode=${mode}:`, err);
    return false;
  }
}

/**
 * @deprecated 使用 setSkillMode 替代
 */
export async function setSkillEnabled(skillId: string, enabled: boolean, scopeOrIsGlobal?: SkillScope | boolean): Promise<boolean> {
  return setSkillMode(skillId, enabled ? "auto" : "disabled", scopeOrIsGlobal);
}

/** Normalize old boolean isGlobal to SkillScope */
function normalizeScope(scopeOrIsGlobal?: SkillScope | boolean): SkillScope {
  if (typeof scopeOrIsGlobal === "string") return scopeOrIsGlobal;
  if (scopeOrIsGlobal === true) return "global";
  if (scopeOrIsGlobal === false) return "local";
  return "local"; // default
}

/**
 * 导出 Skill（返回 JSON 格式）
 * @param skillId Skill ID
 * @param isGlobal 是否为全局 Skill
 */
export async function exportSkill(skillId: string, isGlobal: boolean): Promise<string | null> {
  try {
    const skill = await getSkill(skillId, isGlobal);
    if (!skill) return null;

    const exported = {
      id: skill.id,
      metadata: skill.metadata || { name: skill.name, description: skill.description },
      instruction: skill.instruction,
      mode: skill.mode,
      enabled: skill.mode !== "disabled",
      isGlobal: skill.isGlobal,
    };

    return JSON.stringify(exported, null, 2);
  } catch (err) {
    console.error(`[SkillsManager] Failed to export skill ${skillId}:`, err);
    return null;
  }
}

/**
 * 导入 Skill（从 JSON 格式）
 * @param skillId Skill ID
 * @param jsonContent JSON 内容
 * @param isGlobal 是否导入为全局 Skill（默认 false）
 */
export async function importSkill(skillId: string, jsonContent: string, isGlobal: boolean = false): Promise<boolean> {
  try {
    const data = JSON.parse(jsonContent);

    // 创建 Skill
    const success = await createSkill(skillId, data.metadata, data.instruction, isGlobal);
    if (!success) return false;

    // 恢复执行模式（兼容新旧格式）
    if (data.mode && ["auto", "ask", "disabled"].includes(data.mode)) {
      await setSkillMode(skillId, data.mode as SkillMode, isGlobal);
    } else if (data.enabled !== undefined) {
      await setSkillMode(skillId, data.enabled ? "auto" : "disabled", isGlobal);
    }

    return true;
  } catch (err) {
    console.error(`[SkillsManager] Failed to import skill ${skillId}:`, err);
    return false;
  }
}

/**
 * 初始化内置 Skills（兼容旧代码）
 * 内置技能现在从内存常量 BUILT_IN_SKILLS 加载，不再写文件。
 * 此函数保留用于向后兼容，确保旧数据中的文件副本被清理。
 */
export async function ensureBuiltInSkills(): Promise<void> {
  console.log("[SkillsManager] Built-in skills loaded from memory (2 skills)");
}
