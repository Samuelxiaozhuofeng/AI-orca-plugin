/**
 * Skill Recommender Service
 * 
 * 根据用户输入自动推荐相关的 Skills
 * 使用关键词匹配、标签匹配和语义相似度来推荐
 */

import { listSkills, getSkill } from "./skills-manager";
import type { Skill, SkillRef } from "../../types/skills";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface SkillRecommendation {
  skill: Skill;
  score: number;         // 匹配得分 0-1
  matchReason: string;   // 匹配原因
}

interface SkillIndex {
  skill: Skill;
  keywords: string[];    // 从 name, description, tags, instruction 提取的关键词
  normalizedName: string;
  normalizedDescription: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// 关键词提取
// ─────────────────────────────────────────────────────────────────────────────

// 常见中文停用词
const CHINESE_STOPWORDS = new Set([
  "的", "了", "是", "在", "我", "有", "和", "就", "不", "人", "都", "一", "一个",
  "上", "也", "很", "到", "说", "要", "去", "你", "会", "着", "没有", "看", "好",
  "自己", "这", "那", "什么", "他", "她", "它", "我们", "你们", "他们", "可以",
  "能", "让", "把", "被", "给", "从", "向", "为", "因为", "所以", "但是", "如果",
  "虽然", "或者", "而且", "以及", "帮我", "请", "用", "做", "怎么", "如何",
]);

// 常见英文停用词
const ENGLISH_STOPWORDS = new Set([
  "the", "a", "an", "is", "are", "was", "were", "be", "been", "being",
  "have", "has", "had", "do", "does", "did", "will", "would", "could", "should",
  "may", "might", "must", "can", "to", "of", "in", "for", "on", "with", "at",
  "by", "from", "as", "into", "through", "during", "before", "after", "above",
  "below", "between", "under", "again", "further", "then", "once", "here",
  "there", "when", "where", "why", "how", "all", "each", "few", "more", "most",
  "other", "some", "such", "no", "nor", "not", "only", "own", "same", "so",
  "than", "too", "very", "just", "and", "but", "or", "if", "because", "until",
  "while", "although", "this", "that", "these", "those", "i", "me", "my", "we",
  "our", "you", "your", "he", "him", "his", "she", "her", "it", "its", "they",
  "them", "their", "what", "which", "who", "whom", "please", "help", "want",
]);

/**
 * 从文本中提取关键词
 */
function extractKeywords(text: string): string[] {
  if (!text) return [];
  
  const normalized = text.toLowerCase();
  
  // 分词：支持中英文混合
  const tokens: string[] = [];
  
  // 英文单词
  const englishWords = normalized.match(/[a-z]+/g) || [];
  tokens.push(...englishWords.filter(w => w.length > 1 && !ENGLISH_STOPWORDS.has(w)));
  
  // 中文词汇（简单的2-4字组合）
  const chineseChars = normalized.match(/[\u4e00-\u9fa5]+/g) || [];
  for (const segment of chineseChars) {
    // 添加整个片段
    if (segment.length >= 2 && segment.length <= 6) {
      tokens.push(segment);
    }
    // 添加2字组合
    for (let i = 0; i < segment.length - 1; i++) {
      const bigram = segment.slice(i, i + 2);
      if (!CHINESE_STOPWORDS.has(bigram)) {
        tokens.push(bigram);
      }
    }
    // 添加3字组合
    for (let i = 0; i < segment.length - 2; i++) {
      const trigram = segment.slice(i, i + 3);
      tokens.push(trigram);
    }
  }
  
  // 去重
  return [...new Set(tokens)];
}

// ─────────────────────────────────────────────────────────────────────────────
// Skill 索引
// ─────────────────────────────────────────────────────────────────────────────

let skillIndexCache: SkillIndex[] | null = null;
let skillIndexTimestamp = 0;
const CACHE_TTL = 60000; // 60秒缓存

/**
 * 构建 Skill 索引
 */
async function buildSkillIndex(): Promise<SkillIndex[]> {
  const now = Date.now();
  if (skillIndexCache && now - skillIndexTimestamp < CACHE_TTL) {
    return skillIndexCache;
  }
  
  const skillRefs = await listSkills();
  const index: SkillIndex[] = [];
  
  for (const ref of skillRefs) {
    const skill = await getSkill(ref.id, ref.scope === "global");
    if (!skill || skill.mode === "disabled") continue;
    
    // 提取关键词
    const keywords: string[] = [];
    
    // 从 ID 提取
    keywords.push(...extractKeywords(skill.id));
    
    // 从名称提取
    if (skill.name) {
      keywords.push(...extractKeywords(skill.name));
    }

    // 从描述提取
    if (skill.description) {
      keywords.push(...extractKeywords(skill.description));
    }

    // 从标签提取
    if (skill.tags) {
      keywords.push(...skill.tags.map(t => t.toLowerCase()));
    }

    // 从指令的前500字符提取
    if (skill.instruction) {
      keywords.push(...extractKeywords(skill.instruction.slice(0, 500)));
    }

    index.push({
      skill,
      keywords: [...new Set(keywords)],
      normalizedName: (skill.name || skill.id).toLowerCase(),
      normalizedDescription: (skill.description || "").toLowerCase(),
    });
  }
  
  skillIndexCache = index;
  skillIndexTimestamp = now;
  
  return index;
}

// ─────────────────────────────────────────────────────────────────────────────
// 推荐算法
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 计算两个字符串的相似度（Jaccard 相似度）
 */
function jaccardSimilarity(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0;
  
  const setA = new Set(a);
  const setB = new Set(b);
  
  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection++;
  }
  
  const union = setA.size + setB.size - intersection;
  return union > 0 ? intersection / union : 0;
}

/**
 * 计算关键词匹配得分
 */
function calculateMatchScore(
  inputKeywords: string[],
  skillIndex: SkillIndex
): { score: number; matchedKeywords: string[] } {
  const matchedKeywords: string[] = [];
  let score = 0;
  
  const inputSet = new Set(inputKeywords);
  
  for (const keyword of skillIndex.keywords) {
    if (inputSet.has(keyword)) {
      matchedKeywords.push(keyword);
      // 根据关键词长度加权（更长的关键词更有意义）
      score += Math.min(keyword.length / 4, 1);
    }
    
    // 部分匹配
    for (const input of inputKeywords) {
      if (input.length >= 2 && keyword.includes(input) && !matchedKeywords.includes(keyword)) {
        matchedKeywords.push(keyword);
        score += 0.5;
      }
      if (keyword.length >= 2 && input.includes(keyword) && !matchedKeywords.includes(keyword)) {
        matchedKeywords.push(keyword);
        score += 0.5;
      }
    }
  }
  
  // 归一化得分
  const maxScore = Math.max(inputKeywords.length, skillIndex.keywords.length);
  const normalizedScore = maxScore > 0 ? Math.min(score / maxScore, 1) : 0;
  
  return { score: normalizedScore, matchedKeywords };
}

/**
 * 检测意图关键词
 */
const INTENT_PATTERNS: Array<{ pattern: RegExp; boost: number; reason: string }> = [
  { pattern: /(?:帮我|请|想要|需要|如何|怎么).*(?:写|生成|创建|制作)/i, boost: 0.3, reason: "创建内容意图" },
  { pattern: /(?:分析|解读|理解|学习)/i, boost: 0.2, reason: "分析理解意图" },
  { pattern: /(?:总结|归纳|概括|提炼)/i, boost: 0.2, reason: "总结归纳意图" },
  { pattern: /(?:翻译|转换|转化)/i, boost: 0.2, reason: "转换意图" },
  { pattern: /(?:优化|改进|提升|修改)/i, boost: 0.2, reason: "优化改进意图" },
  { pattern: /(?:回顾|复盘|反思)/i, boost: 0.3, reason: "回顾反思意图" },
  { pattern: /(?:计划|规划|安排)/i, boost: 0.2, reason: "规划意图" },
  { pattern: /(?:代码|编程|开发|debug)/i, boost: 0.3, reason: "编程意图" },
];

/**
 * 根据用户输入推荐 Skills
 * @param input 用户输入
 * @param maxResults 最大返回数量
 * @param minScore 最低匹配得分阈值
 */
export async function recommendSkills(
  input: string,
  maxResults: number = 3,
  minScore: number = 0.15
): Promise<SkillRecommendation[]> {
  if (!input || input.trim().length < 2) {
    return [];
  }
  
  const skillIndex = await buildSkillIndex();
  if (skillIndex.length === 0) {
    return [];
  }
  
  const inputKeywords = extractKeywords(input);
  if (inputKeywords.length === 0) {
    return [];
  }
  
  const recommendations: SkillRecommendation[] = [];
  
  for (const indexed of skillIndex) {
    const { score: baseScore, matchedKeywords } = calculateMatchScore(inputKeywords, indexed);
    
    // 检测意图并加分
    let intentBoost = 0;
    let intentReason = "";
    for (const { pattern, boost, reason } of INTENT_PATTERNS) {
      if (pattern.test(input)) {
        // 检查 Skill 是否与该意图相关
        const skillText = indexed.normalizedName + " " + indexed.normalizedDescription;
        if (pattern.test(skillText)) {
          intentBoost = Math.max(intentBoost, boost);
          intentReason = reason;
        }
      }
    }
    
    // 名称直接匹配加分（提高权重使命名触发更可靠）
    let nameBoost = 0;
    const inputLower = input.toLowerCase();
    if (inputLower.includes(indexed.normalizedName) || indexed.normalizedName.includes(inputLower)) {
      nameBoost = 0.55;
    }
    
    const finalScore = Math.min(baseScore + intentBoost + nameBoost, 1);
    
    if (finalScore >= minScore && matchedKeywords.length > 0) {
      let reason = `匹配关键词: ${matchedKeywords.slice(0, 3).join(", ")}`;
      if (intentReason) {
        reason += ` (${intentReason})`;
      }
      if (nameBoost > 0) {
        reason = `名称匹配`;
      }
      
      recommendations.push({
        skill: indexed.skill,
        score: finalScore,
        matchReason: reason,
      });
    }
  }
  
  // 按得分排序
  recommendations.sort((a, b) => b.score - a.score);
  
  return recommendations.slice(0, maxResults);
}

/**
 * 快速检测是否有相关 Skill（用于 UI 显示提示）
 */
export async function hasRelevantSkills(input: string): Promise<boolean> {
  const recommendations = await recommendSkills(input, 1, 0.2);
  return recommendations.length > 0;
}

/**
 * 自动触发检测：高置信度返回匹配技能，否则返回 null
 * 当用户输入明确匹配某个技能时，自动激活该技能
 * @param input 用户输入
 * @param threshold 置信度阈值（默认 0.5）
 */
export async function getAutoTriggerSkill(
  input: string,
  threshold: number = 0.5
): Promise<Skill | null> {
  if (!input || input.trim().length < 4) return null;

  const recommendations = await recommendSkills(input, 1, 0.1);
  if (recommendations.length === 0) return null;

  const top = recommendations[0];
  if (top.score >= threshold) {
    console.log(
      `[SkillRecommender] Auto-trigger: ${top.skill.name} (score: ${top.score.toFixed(2)}, reason: ${top.matchReason})`
    );
    return top.skill;
  }

  return null;
}

/**
 * 获取 Skill 的简短描述（用于 UI 显示）
 */
export function getSkillSummary(skill: Skill): string {
  if (skill.description) {
    return skill.description.length > 50
      ? skill.description.slice(0, 47) + "..."
      : skill.description;
  }
  return skill.name || skill.id;
}
