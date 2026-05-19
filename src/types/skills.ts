/**
 * Skills Manager Types
 *
 * 统一的技能系统类型定义，支持三种作用域：
 * - internal: 插件内置技能（代码常量，所有仓库可用）
 * - global: 全局技能（文件存储 skills/{id}/SKILL.md，所有仓库可用）
 * - local: 局部技能（Orca 块，带 "AI SKILL" 标签）
 */

/** 技能作用域 */
export type SkillScope = "global" | "internal" | "local";

/** 技能来源类型 */
export type SkillSourceType = "file" | "block" | "builtin";

/** 块技能来源信息 */
export interface BlockSkillSource {
  blockId: number;
  pageId?: number;
  pageTitle?: string;
}

/** 技能引用（用于列表返回） */
export interface SkillRef {
  id: string;
  name: string;
  scope: SkillScope;
  /** @deprecated 使用 scope 替代 */
  isGlobal?: boolean;
}

/**
 * 技能元数据
 */
export interface SkillMetadata {
  id?: string;
  name: string;
  description?: string;
  version?: string;
  author?: string;
  tags?: string[];
  [key: string]: any;
}

/**
 * 技能文件信息（文件存储模式）
 */
export interface SkillFile {
  path: string;
  name: string;
  isDir: boolean;
  size?: number;
}

/**
 * 统一的 Skill 定义
 */
export interface Skill {
  id: string;
  name: string;
  description: string;
  instruction: string;
  /** 作用域 */
  scope: SkillScope;
  /** 来源类型 */
  sourceType: SkillSourceType;
  /** 是否启用 */
  enabled: boolean;
  /** 标签 */
  tags?: string[];
  /** 块来源信息（仅 local scope 的块技能） */
  blockSource?: BlockSkillSource;
  /** 文件列表（仅 file source 的技能） */
  files?: SkillFile[];
  /** 向后兼容：是否为全局技能 */
  isGlobal?: boolean;
  /** 向后兼容：元数据对象 */
  metadata?: SkillMetadata;
}

