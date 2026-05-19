/**
 * Agentic RAG Service
 * 智能检索增强生成 - 让 AI 自主决定检索策略，支持多轮迭代
 * 
 * 基于 Anthropic "Building Effective Agents" 和 Weaviate 团队的 Agentic Workflow 理论：
 * 
 * 【核心理念】
 * - 传统 RAG：检索 → 生成（单次，确定性流程）
 * - Agentic RAG：规划 → 检索 → 反思 → 迭代 → 生成（自主性流程）
 * 
 * 【三大核心能力】
 * 1. Planning（规划）- 任务分解，将复杂问题拆解为可执行的检索步骤
 * 2. Tool Use（工具使用）- 智能选择和组合多种检索工具
 * 3. Reflection（反思）- 评估检索质量，自我修正，决定是否继续迭代
 * 
 * 【与纯 Agent 的区别】
 * - Agent：完全自主，自由发挥
 * - Agentic Workflow：有预设流程框架，但在框架内具备自主决策能力
 * 
 * 注意：此功能会增加 token 消耗（多次 LLM 调用）
 */

import { executeTool } from "./ai-tools";
import { isWebSearchEnabled } from "../../store/tool-store";

// 检查是否是 Skill 工具
function isSkillToolName(toolName: string): boolean {
  return toolName.startsWith("skill_");
}

// 获取 Skill 显示名称
function getSkillDisplayName(toolName: string): string {
  if (!isSkillToolName(toolName)) return toolName;
  const skillId = toolName.slice("skill_".length);
  return skillId;
}

// ═══════════════════════════════════════════════════════════════════════════
// 类型定义
// ═══════════════════════════════════════════════════════════════════════════

export interface AgenticRAGOptions {
  /** 最大迭代次数（防止无限循环），默认 5 */
  maxIterations?: number;
  /** 是否启用反思机制，默认 true */
  enableReflection?: boolean;
  /** 是否启用联网搜索 */
  enableWebSearch?: boolean;
  /** 置信度阈值（0-1），低于此值继续检索，默认 0.7 */
  confidenceThreshold?: number;
  /** 进度回调，用于实时更新 UI */
  onProgress?: (update: RAGProgressUpdate) => void;
  /** 是否启用多步骤规划（一次规划多个检索步骤），默认 false */
  enableMultiStepPlanning?: boolean;
  /** 是否启用自我修正（检索失败时调整策略），默认 true */
  enableSelfCorrection?: boolean;
}

/** 进度更新类型 */
export interface RAGProgressUpdate {
  /** 当前阶段 */
  phase: "analyzing" | "planning" | "retrieving" | "reflecting" | "answering" | "done";
  /** 简短状态文字 */
  status: string;
  /** 详细思考过程（累积） */
  reasoning: string;
  /** 当前步骤信息 */
  step?: RAGStep;
  /** 当前迭代轮数 */
  iteration?: number;
}

export interface RAGStep {
  type: "plan" | "retrieve" | "reflect" | "answer" | "correct";
  tool?: string;
  args?: Record<string, any>;
  result?: string;
  reasoning?: string;
  confidence?: number;
  timestamp: number;
  /** 是否为修正步骤（自我修正后的重试） */
  isCorrection?: boolean;
  /** 修正原因（如果是修正步骤） */
  correctionReason?: string;
}

export interface RAGResult {
  /** 最终答案 */
  answer: string;
  /** 执行步骤记录 */
  steps: RAGStep[];
  /** 收集到的上下文 */
  collectedContext: string;
  /** 总迭代次数 */
  iterations: number;
  /** 是否因达到上限而停止 */
  hitLimit: boolean;
  /** 检索策略摘要 */
  strategySummary?: string;
}

/** LLM 调用函数类型 */
export type LLMCaller = (
  prompt: string,
  options?: { temperature?: number; maxTokens?: number }
) => Promise<string>;

/** 检索结果缓存项 */
interface CacheEntry {
  result: string;
  timestamp: number;
  hitCount: number;
}

/** 语义策略记录 */
interface SemanticStrategy {
  tool: string;
  args: Record<string, any>;
  keywords: string[];  // 提取的关键词
  timestamp: number;
  success: boolean;    // 是否成功获取结果
}

/** 检索记忆 - 记录已尝试的检索策略，避免重复 */
interface RetrievalMemory {
  /** 已使用的工具和参数组合（精确匹配） */
  usedStrategies: Set<string>;
  /** 语义策略列表（用于语义去重） */
  semanticStrategies: SemanticStrategy[];
  /** 失败的策略（用于自我修正） */
  failedStrategies: Map<string, string>;
  /** 成功获取信息的策略 */
  successfulStrategies: string[];
  /** 累积的关键信息点 */
  keyFindings: string[];
  /** 检索结果缓存 */
  cache: Map<string, CacheEntry>;
}

/** 缓存配置 */
const CACHE_TTL_MS = 5 * 60 * 1000; // 缓存有效期 5 分钟
const CACHE_MAX_SIZE = 50;          // 最大缓存条目数
const SEMANTIC_SIMILARITY_THRESHOLD = 0.7; // 语义相似度阈值

// ═══════════════════════════════════════════════════════════════════════════
// 语义去重工具函数
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 从文本中提取关键词（用于语义比较）
 */
function extractKeywords(text: string): string[] {
  if (!text) return [];
  
  // 移除标点符号，转小写，分词
  const cleaned = text
    .toLowerCase()
    .replace(/[\u3000-\u303f\uff00-\uffef]/g, ' ') // 中文标点
    .replace(/[^\u4e00-\u9fa5a-z0-9\s]/g, ' ')     // 保留中英文和数字
    .trim();
  
  // 分词（中文按字，英文按空格）
  const words: string[] = [];
  let currentWord = '';
  
  for (const char of cleaned) {
    if (/[\u4e00-\u9fa5]/.test(char)) {
      // 中文字符：先保存之前的英文单词，然后添加中文字
      if (currentWord) {
        words.push(currentWord);
        currentWord = '';
      }
      words.push(char);
    } else if (/[a-z0-9]/.test(char)) {
      currentWord += char;
    } else if (currentWord) {
      words.push(currentWord);
      currentWord = '';
    }
  }
  if (currentWord) words.push(currentWord);
  
  // 过滤短词和停用词
  const stopWords = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'shall', 'can', 'need', 'dare', 'ought', 'used', 'to', 'of', 'in', 'for', 'on', 'with', 'at', 'by', 'from', 'as', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'between', 'under', 'again', 'further', 'then', 'once', 'here', 'there', 'when', 'where', 'why', 'how', 'all', 'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just', 'and', 'but', 'if', 'or', 'because', 'until', 'while', 'of', 'at', 'by', 'about', 'against', 'between', 'into', 'through', 'during', 'before', 'after', 'above', 'below', 'to', 'from', 'up', 'down', 'in', 'out', 'on', 'off', 'over', 'under', 'again', 'further', 'then', 'once', '的', '了', '是', '在', '我', '有', '和', '就', '不', '人', '都', '一', '一个', '上', '也', '很', '到', '说', '要', '去', '你', '会', '着', '没有', '看', '好', '自己', '这']);
  
  return words.filter(w => w.length > 1 && !stopWords.has(w));
}

/**
 * 从工具参数中提取关键词
 */
function extractKeywordsFromArgs(tool: string, args: Record<string, any>): string[] {
  const keywords: string[] = [tool]; // 工具名也是关键词
  
  // 常见的搜索参数名
  const searchParamNames = ['query', 'text', 'tag_query', 'pageName', 'keyword', 'search', 'q'];
  
  for (const [key, value] of Object.entries(args)) {
    if (typeof value === 'string') {
      if (searchParamNames.includes(key)) {
        // 搜索参数：提取关键词
        keywords.push(...extractKeywords(value));
      } else {
        // 其他参数：直接添加
        keywords.push(value.toLowerCase());
      }
    } else if (typeof value === 'number') {
      keywords.push(String(value));
    }
  }
  
  return [...new Set(keywords)]; // 去重
}

/**
 * 计算两个关键词列表的 Jaccard 相似度
 */
function calculateSimilarity(keywords1: string[], keywords2: string[]): number {
  if (keywords1.length === 0 || keywords2.length === 0) return 0;
  
  const set1 = new Set(keywords1);
  const set2 = new Set(keywords2);
  
  // 计算交集
  let intersection = 0;
  for (const word of set1) {
    if (set2.has(word)) intersection++;
  }
  
  // 计算并集
  const union = set1.size + set2.size - intersection;
  
  return union > 0 ? intersection / union : 0;
}

/**
 * 检查是否存在语义相似的**成功**策略
 * 注意：只对成功的策略进行去重，失败的策略不应该阻止相似查询的尝试
 */
function findSimilarStrategy(
  tool: string,
  args: Record<string, any>,
  semanticStrategies: SemanticStrategy[],
  threshold: number = SEMANTIC_SIMILARITY_THRESHOLD
): SemanticStrategy | null {
  const newKeywords = extractKeywordsFromArgs(tool, args);
  
  for (const strategy of semanticStrategies) {
    // 工具不同，跳过
    if (strategy.tool !== tool) continue;
    
    // ⭐ 关键修复：只检查成功的策略
    // 如果之前的相似策略失败了，应该允许尝试变体
    if (!strategy.success) continue;
    
    const similarity = calculateSimilarity(newKeywords, strategy.keywords);
    
    if (similarity >= threshold) {
      console.log(`[AgenticRAG] 语义相似策略检测: similarity=${similarity.toFixed(2)}, threshold=${threshold}`);
      console.log(`  新策略: ${tool}(${JSON.stringify(args)})`);
      console.log(`  已有成功策略: ${strategy.tool}(${JSON.stringify(strategy.args)})`);
      return strategy;
    }
  }
  
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// 缓存工具函数
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 生成缓存键
 */
function getCacheKey(tool: string, args: Record<string, any>): string {
  return `${tool}:${JSON.stringify(args)}`;
}

/**
 * 从缓存中获取结果
 */
function getFromCache(cache: Map<string, CacheEntry>, key: string): string | null {
  const entry = cache.get(key);
  if (!entry) return null;
  
  // 检查是否过期
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  
  // 更新命中次数
  entry.hitCount++;
  return entry.result;
}

/**
 * 存入缓存
 */
function setToCache(cache: Map<string, CacheEntry>, key: string, result: string): void {
  // 如果缓存已满，删除最早的条目
  if (cache.size >= CACHE_MAX_SIZE) {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    
    for (const [k, v] of cache.entries()) {
      if (v.timestamp < oldestTime) {
        oldestTime = v.timestamp;
        oldestKey = k;
      }
    }
    
    if (oldestKey) {
      cache.delete(oldestKey);
    }
  }
  
  cache.set(key, {
    result,
    timestamp: Date.now(),
    hitCount: 0,
  });
}

/**
 * 清理过期缓存
 */
function cleanExpiredCache(cache: Map<string, CacheEntry>): void {
  const now = Date.now();
  for (const [key, entry] of cache.entries()) {
    if (now - entry.timestamp > CACHE_TTL_MS) {
      cache.delete(key);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Prompt 模板
// ═══════════════════════════════════════════════════════════════════════════

function buildPlanningPrompt(
  userQuery: string,
  previousSteps: RAGStep[],
  enableWebSearch: boolean,
  memory: RetrievalMemory
): string {
  const stepsSummary = previousSteps.length > 0
    ? `\n\n【已执行的步骤】\n${previousSteps
        .filter(s => s.type === "retrieve" || s.type === "reflect" || s.type === "correct")
        .map((s, i) => {
          if (s.type === "retrieve") {
            const status = s.result?.includes("Error") ? "❌" : (s.result?.includes("No ") ? "⚠️" : "✅");
            return `${i + 1}. ${status} 检索 ${s.tool}(${JSON.stringify(s.args)}) → ${s.result?.substring(0, 100)}...`;
          }
          if (s.type === "correct") {
            return `${i + 1}. 🔄 修正策略: ${s.correctionReason}`;
          }
          return `${i + 1}. 💭 反思: ${s.reasoning}`;
        })
        .join("\n")}`
    : "";

  // 显示已尝试过的策略，避免重复
  const triedStrategies = memory.usedStrategies.size > 0
    ? `\n\n【已尝试的策略】（请勿重复）\n${Array.from(memory.usedStrategies).slice(-5).join("\n")}`
    : "";

  // 显示失败的策略，帮助 AI 调整
  const failedInfo = memory.failedStrategies.size > 0
    ? `\n\n【失败的策略】（请避免或调整）\n${Array.from(memory.failedStrategies.entries()).map(([k, v]) => `- ${k}: ${v}`).join("\n")}`
    : "";

  // 显示已发现的关键信息
  const findingsInfo = memory.keyFindings.length > 0
    ? `\n\n【已发现的关键信息】\n${memory.keyFindings.slice(-3).map(f => `- ${f}`).join("\n")}`
    : "";

  // 检查是否已经尝试过本地检索但没有结果
  const localSearchFailed = memory.failedStrategies.size > 0 && 
    Array.from(memory.failedStrategies.keys()).some(k => 
      k.startsWith("query_blocks:") || k.startsWith("get_today_journal:")
    );

  const webSearchNote = enableWebSearch
    ? "\n- webSearch: 联网搜索外部信息（当本地笔记找不到答案、需要外部知识或最新资讯时使用）"
    : "";

  // 根据是否有本地搜索失败，调整决策规则
  const webSearchGuidance = enableWebSearch && localSearchFailed
    ? `\n8. **重要**：本地笔记中未找到相关信息，请使用 webSearch 联网搜索获取答案`
    : (enableWebSearch 
        ? `\n8. 如果问题涉及外部知识（人物、事件、概念等）且本地笔记可能没有，优先使用 webSearch`
        : "");

  return `你是一个智能检索规划助手。分析用户问题，决定下一步检索策略。

【用户问题】
${userQuery}
${stepsSummary}${triedStrategies}${failedInfo}${findingsInfo}

【可用的检索工具】
- query_blocks: 组合条件搜索笔记（支持标签、文本、属性过滤）
- get_blocks_text: 读取指定块的完整内容
- get_page: 查找块所属页面并读取内容
- get_today_journal: 获取今天日记
- get_tags_and_pages: 列出所有标签和页面${webSearchNote}

【决策规则】
1. 首次收到问题时，必须先检索相关信息，不要直接说"信息不足"
2. 如果问题涉及用户个人笔记/日记/学习记录，优先使用 query_blocks 或 get_today_journal
3. 如果问题涉及特定标签，使用 query_blocks 带 tag 参数
4. 如果问题涉及外部知识（人物、动漫、游戏、历史、科学等），且启用了 webSearch，应该使用 webSearch
5. 如果之前的本地检索没有结果，且问题需要外部知识，必须使用 webSearch（如果可用）
6. 不要重复使用完全相同的工具和参数组合
7. 只有在已经执行过检索且确实没有相关信息时，才返回 canAnswer${webSearchGuidance}

请返回 JSON 格式的决策（不要包含其他内容）：
{
  "needsRetrieval": true,
  "tool": "工具名",
  "args": { "参数名": "参数值" },
  "reasoning": "选择这个工具的理由",
  "expectedInfo": "期望获取什么信息"
}

只有在已经检索过且信息充足时，才返回：
{
  "needsRetrieval": false,
  "canAnswer": true,
  "reasoning": "已有足够信息的原因",
  "keyPoints": ["关键信息点1", "关键信息点2"]
}`;
}

function buildReflectionPrompt(
  userQuery: string,
  collectedContext: string,
  lastStep: RAGStep,
  memory: RetrievalMemory
): string {
  const findingsContext = memory.keyFindings.length > 0
    ? `\n\n【已确认的关键发现】\n${memory.keyFindings.map(f => `- ${f}`).join("\n")}`
    : "";

  return `评估检索结果是否足以回答用户问题。

【用户问题】
${userQuery}

【最新检索结果】
工具: ${lastStep.tool}
参数: ${JSON.stringify(lastStep.args)}
结果: ${lastStep.result?.substring(0, 1500) || "(无结果)"}

【已收集的全部信息】
${collectedContext.substring(0, 3000) || "(无)"}
${findingsContext}

【评估要点】
1. 检索结果是否与问题相关？
2. 信息是否完整，能否回答用户的核心问题？
3. 是否需要补充其他角度的信息？
4. 如果信息不足，具体缺少什么？

请评估并返回 JSON（不要包含其他内容）：
{
  "sufficient": true/false,
  "confidence": 0.0-1.0,
  "relevance": "high/medium/low/none",
  "keyFindings": ["从本次检索中提取的关键信息点"],
  "missingInfo": "如果不充足，说明缺少什么信息",
  "suggestion": "如果需要继续，建议下一步做什么",
  "shouldCorrect": false,
  "correctionReason": "如果需要修正策略，说明原因"
}`;
}

function buildAnswerPrompt(
  userQuery: string,
  collectedContext: string,
  steps: RAGStep[],
  memory: RetrievalMemory
): string {
  const searchSummary = steps
    .filter(s => s.type === "retrieve")
    .map(s => {
      const status = s.result?.includes("Error") ? "❌" : (s.result?.includes("No ") ? "⚠️" : "✅");
      return `- ${status} ${s.tool}: ${s.reasoning}`;
    })
    .join("\n");

  const keyFindingsSummary = memory.keyFindings.length > 0
    ? `\n\n【关键发现摘要】\n${memory.keyFindings.map(f => `- ${f}`).join("\n")}`
    : "";

  // 检查是否有成功的检索
  const hasSuccessfulRetrieval = steps.some(s => 
    s.type === "retrieve" && s.result && !s.result.includes("Error") && !s.result.includes("No ")
  );

  return `基于检索到的信息，回答用户问题。

【用户问题】
${userQuery}

【检索过程】
${searchSummary || "(直接回答)"}
${keyFindingsSummary}

【检索到的信息】
${collectedContext || "(无检索结果)"}

【回答要求】
1. 直接用自然语言回答，不要返回 JSON 格式
2. 基于检索到的信息回答，不要编造
3. 如果信息不足，诚实说明并给出建议
4. 引用笔记时保留 [标题](orca-block:id) 格式
5. 使用中文回答
6. 不要包含 "thoughts"、"answer" 等字段，直接输出回答内容
7. 如果有多个相关笔记，可以综合整理后回答

【禁止事项】
- 绝对不要说"无法访问互联网"、"无法联网搜索"、"无法为您搜索"等
- 不要说"我处于XX模式"、"我目前只能提供信息"等
- 不要建议用户"自己去搜索引擎搜索"
- 如果没有找到信息，直接说"在笔记中未找到相关信息"即可`;
}

// ═══════════════════════════════════════════════════════════════════════════
// 核心服务
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 从文本中提取 JSON
 */
function extractJSON(text: string): any {
  if (!text || !text.trim()) {
    console.warn("[AgenticRAG] extractJSON: empty input");
    return null;
  }
  
  const trimmed = text.trim();
  console.log("[AgenticRAG] extractJSON input:", trimmed.substring(0, 200));
  
  // 尝试直接解析
  try {
    return JSON.parse(trimmed);
  } catch {
    // 继续尝试其他方式
  }
  
  // 尝试提取 ```json ... ``` 代码块
  const jsonBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (jsonBlockMatch) {
    try {
      const parsed = JSON.parse(jsonBlockMatch[1].trim());
      console.log("[AgenticRAG] extractJSON: parsed from code block");
      return parsed;
    } catch {
      // 继续尝试
    }
  }
  
  // 尝试提取 { ... } 对象
  const objectMatch = trimmed.match(/\{[\s\S]*\}/);
  if (objectMatch) {
    try {
      const parsed = JSON.parse(objectMatch[0]);
      console.log("[AgenticRAG] extractJSON: parsed from object match");
      return parsed;
    } catch {
      // 继续尝试
    }
  }
  
  // 尝试修复常见的 JSON 格式问题
  // 1. 移除尾部逗号
  // 2. 处理单引号
  const fixedText = trimmed
    .replace(/,\s*([}\]])/g, '$1')  // 移除尾部逗号
    .replace(/'/g, '"');  // 单引号转双引号
  
  const fixedMatch = fixedText.match(/\{[\s\S]*\}/);
  if (fixedMatch) {
    try {
      const parsed = JSON.parse(fixedMatch[0]);
      console.log("[AgenticRAG] extractJSON: parsed after fixing");
      return parsed;
    } catch {
      // 放弃
    }
  }
  
  console.warn("[AgenticRAG] extractJSON: failed to parse:", trimmed.substring(0, 300));
  return null;
}

/**
 * 根据问题内容构建默认检索计划
 */
function buildDefaultPlan(userQuery: string, enableWebSearch: boolean = false): any {
  const queryLower = userQuery.toLowerCase();
  
  // 检测是否是需要外部知识的问题（人物、动漫、游戏、历史、科学等）
  const externalKnowledgePatterns = [
    /谁是|是谁|什么是|是什么/,  // 定义类问题
    /介绍一下|讲讲|说说/,  // 介绍类问题
    /红A|Fate|动漫|番剧|游戏|电影|小说|漫画/i,  // 娱乐内容
    /历史|科学|技术|编程|代码/,  // 知识类
    /最新|新闻|消息|更新/,  // 时效性内容
  ];
  
  const needsExternalKnowledge = externalKnowledgePatterns.some(p => p.test(userQuery));
  
  // 如果启用了 webSearch 且问题需要外部知识，优先使用 webSearch
  if (enableWebSearch && needsExternalKnowledge) {
    // 提取搜索关键词
    const keywords = userQuery
      .replace(/[？?！!。，,、：:""''（）()【】\[\]谁是什么介绍一下讲讲说说]/g, " ")
      .trim()
      .split(/\s+/)
      .filter(w => w.length > 1)
      .slice(0, 5)
      .join(" ");
    
    return {
      needsRetrieval: true,
      tool: "webSearch",
      args: { query: keywords || userQuery.substring(0, 30) },
      reasoning: "问题涉及外部知识，需要联网搜索获取信息",
      expectedInfo: `关于 "${keywords || userQuery.substring(0, 30)}" 的信息`,
    };
  }
  
  // 日记相关
  if (queryLower.includes("日记") || queryLower.includes("最近") || queryLower.includes("今天")) {
    if (queryLower.includes("今天") || queryLower.includes("今日")) {
      return {
        needsRetrieval: true,
        tool: "get_today_journal",
        args: { includeChildren: true },
        reasoning: "问题涉及今天的日记，获取今日日记内容",
        expectedInfo: "今天的日记记录",
      };
    }
    return {
      needsRetrieval: true,
      tool: "query_blocks",
      args: { query: "最近日记", maxResults: 20 },
      reasoning: "问题涉及日记/最近内容，需要查询最近的日记记录",
      expectedInfo: "最近的日记内容",
    };
  }
  
  // 标签相关
  if (queryLower.includes("#")) {
    const tagMatch = userQuery.match(/#(\S+)/);
    return {
      needsRetrieval: true,
      tool: "query_blocks",
      args: { tag_query: tagMatch ? tagMatch[0] : "#" },
      reasoning: "问题包含标签，需要按标签搜索相关笔记",
      expectedInfo: `带有 ${tagMatch ? tagMatch[0] : "标签"} 的笔记`,
    };
  }
  
  // 页面引用相关
  const pageRefMatch = userQuery.match(/\[\[([^\]]+)\]\]/);
  if (pageRefMatch) {
    return {
      needsRetrieval: true,
      tool: "getPage",
      args: { pageName: pageRefMatch[1] },
      reasoning: "问题引用了特定页面，需要获取该页面内容",
      expectedInfo: `页面 [[${pageRefMatch[1]}]] 的内容`,
    };
  }
  
  // 默认全文搜索
  const keywords = userQuery
    .replace(/[？?！!。，,、：:""''（）()【】\[\]]/g, " ")
    .trim()
    .split(/\s+/)
    .filter(w => w.length > 1)
    .slice(0, 3)
    .join(" ");
  
  return {
    needsRetrieval: true,
    tool: "query_blocks",
    args: { query: keywords || userQuery.substring(0, 20) },
    reasoning: "需要在笔记中搜索相关内容",
    expectedInfo: `包含关键词 "${keywords || userQuery.substring(0, 20)}" 的笔记`,
  };
}

/**
 * 执行 Agentic RAG 流程
 */
export async function executeAgenticRAG(
  userQuery: string,
  callLLM: LLMCaller,
  options: AgenticRAGOptions = {}
): Promise<RAGResult> {
  const {
    maxIterations = 5,
    enableReflection = true,
    enableWebSearch = isWebSearchEnabled(),
    confidenceThreshold = 0.7,
    onProgress,
    enableSelfCorrection = true,
  } = options;

  const steps: RAGStep[] = [];
  let collectedContext = "";
  let iteration = 0;
  let hitLimit = false;
  
  // 初始化检索记忆
  const memory: RetrievalMemory = {
    usedStrategies: new Set(),
    semanticStrategies: [],
    failedStrategies: new Map(),
    successfulStrategies: [],
    keyFindings: [],
    cache: new Map(),
  };
  
  // 定期清理过期缓存
  const cleanupInterval = setInterval(() => cleanExpiredCache(memory.cache), 60000);
  
  // 确保函数结束时清理
  const cleanup = () => clearInterval(cleanupInterval);
  
  // 累积的思考过程文本
  let reasoningLog = "";
  
  // 辅助函数：生成策略标识（用于去重）
  const getStrategyKey = (tool: string, args: Record<string, any>): string => {
    return `${tool}:${JSON.stringify(args)}`;
  };
  
  // 辅助函数：添加思考日志并通知 UI
  const addReasoning = (
    phase: RAGProgressUpdate["phase"],
    status: string,
    text: string,
    step?: RAGStep
  ) => {
    reasoningLog += text + "\n";
    onProgress?.({
      phase,
      status,
      reasoning: reasoningLog,
      step,
      iteration,
    });
  };

  console.log("[AgenticRAG] Starting with query:", userQuery);
  addReasoning("analyzing", "分析问题中...", `🧠 **分析用户问题**\n> ${userQuery}\n`);

  while (iteration < maxIterations) {
    iteration++;
    console.log(`[AgenticRAG] Iteration ${iteration}/${maxIterations}`);
    
    if (iteration > 1) {
      addReasoning("planning", `第 ${iteration} 轮检索...`, `\n---\n\n🔄 **第 ${iteration} 轮检索**\n`);
    }

    // Step 1: 规划 - 让 AI 决定下一步（传入 memory 帮助避免重复）
    addReasoning("planning", "规划检索策略...", `\n📋 **规划检索策略**\n正在分析需要什么信息...\n`);
    const planningPrompt = buildPlanningPrompt(userQuery, steps, enableWebSearch, memory);
    const planResponse = await callLLM(planningPrompt, { temperature: 0.3, maxTokens: 600 });
    
    let plan = extractJSON(planResponse);
    
    // 如果解析失败且是第一次迭代，使用默认检索策略
    if (!plan && iteration === 1) {
      console.log("[AgenticRAG] Planning parse failed, using default retrieval strategy");
      plan = buildDefaultPlan(userQuery, enableWebSearch);
      addReasoning("planning", "使用默认策略", `⚠️ AI 规划解析失败，使用默认策略\n`);
    }
    
    if (!plan) {
      console.warn("[AgenticRAG] Failed to parse planning response, stopping");
      addReasoning("planning", "规划失败", `❌ 无法解析 AI 的规划响应，停止检索\n`);
      break;
    }

    // 记录规划决策
    const expectedInfo = plan.expectedInfo ? `\n   期望获取: ${plan.expectedInfo}` : "";
    addReasoning(
      "planning",
      plan.needsRetrieval ? "需要检索" : "信息充足",
      `💡 **决策**: ${plan.reasoning}${expectedInfo}\n`
    );

    steps.push({
      type: "plan",
      reasoning: plan.reasoning,
      timestamp: Date.now(),
    });

    // 如果不需要检索，跳出循环
    if (!plan.needsRetrieval || plan.canAnswer) {
      console.log("[AgenticRAG] AI decided no more retrieval needed:", plan.reasoning);
      // 记录关键信息点
      if (plan.keyPoints && Array.isArray(plan.keyPoints)) {
        memory.keyFindings.push(...plan.keyPoints);
      }
      addReasoning("done", "信息收集完成", `\n✅ **信息收集完成**\n${plan.reasoning}\n`);
      break;
    }

    // Step 2: 执行检索
    if (!plan.tool || !plan.args) {
      console.warn("[AgenticRAG] Invalid plan, missing tool or args");
      addReasoning("planning", "规划无效", `❌ 规划缺少工具或参数\n`);
      break;
    }

    // 检查是否重复策略（精确匹配）
    const strategyKey = getStrategyKey(plan.tool, plan.args);
    if (memory.usedStrategies.has(strategyKey)) {
      console.log("[AgenticRAG] Duplicate strategy detected, skipping:", strategyKey);
      addReasoning("planning", "跳过重复策略", `⏭️ 跳过重复的检索策略: ${plan.tool}\n`);
      continue;
    }
    
    // 检查是否存在语义相似的策略（模糊匹配）
    const similarStrategy = findSimilarStrategy(plan.tool, plan.args, memory.semanticStrategies);
    if (similarStrategy) {
      console.log("[AgenticRAG] Semantically similar strategy detected, skipping");
      addReasoning(
        "planning", 
        "跳过相似策略", 
        `⏭️ 跳过语义相似的策略: ${plan.tool}\n   已有相似: ${similarStrategy.tool}(${JSON.stringify(similarStrategy.args)})\n`
      );
      continue;
    }
    
    // 记录策略（先添加，成功状态稍后更新）
    memory.usedStrategies.add(strategyKey);
    const currentStrategyIndex = memory.semanticStrategies.length;
    memory.semanticStrategies.push({
      tool: plan.tool,
      args: plan.args,
      keywords: extractKeywordsFromArgs(plan.tool, plan.args),
      timestamp: Date.now(),
      success: false, // 先设为 false，执行成功后更新
    });

    // 显示正在执行的工具
    const toolDisplayName = getToolDisplayName(plan.tool);
    const argsStr = JSON.stringify(plan.args, null, 2);
    addReasoning(
      "retrieving",
      `${toolDisplayName}...`,
      `\n🔍 **执行检索: ${toolDisplayName}**\n\`\`\`json\n${argsStr}\n\`\`\`\n`
    );

    console.log(`[AgenticRAG] Executing tool: ${plan.tool}`, plan.args);
    
    let toolResult: string;
    let isError = false;
    let cacheHit = false;
    
    // 先检查缓存
    const cacheKey = getCacheKey(plan.tool, plan.args);
    const cachedResult = getFromCache(memory.cache, cacheKey);
    
    if (cachedResult !== null) {
      toolResult = cachedResult;
      cacheHit = true;
      console.log(`[AgenticRAG] 💾 缓存命中: ${plan.tool}`);
    } else {
      // 执行检索
      try {
        toolResult = await executeTool(plan.tool, plan.args);
        isError = toolResult.includes("Error:");
        
        // 如果成功，存入缓存
        if (!isError) {
          setToCache(memory.cache, cacheKey, toolResult);
        }
      } catch (err: any) {
        toolResult = `Error: ${err.message || err}`;
        isError = true;
        console.error("[AgenticRAG] Tool execution failed:", err);
      }
    }

    const retrieveStep: RAGStep = {
      type: "retrieve",
      tool: plan.tool,
      args: plan.args,
      result: toolResult,
      reasoning: plan.reasoning,
      timestamp: Date.now(),
    };
    steps.push(retrieveStep);

    // 显示检索结果摘要
    const resultPreview = toolResult.length > 300 
      ? toolResult.substring(0, 300) + "..." 
      : toolResult;
    const resultCountMatch = toolResult.match(/Found (\d+)/);
    const hasNoResults = toolResult.includes("No blocks found") || toolResult.includes("No journal");
    const resultSummary = isError 
      ? "检索出错" 
      : (hasNoResults ? "未找到结果" : (resultCountMatch ? `找到 ${resultCountMatch[1]} 条结果` : "检索完成"));
    
    addReasoning(
      "retrieving",
      resultSummary,
      `📄 **检索结果**: ${resultSummary}\n> ${resultPreview.split('\n').slice(0, 3).join('\n> ')}\n`,
      retrieveStep
    );

    // 记录成功/失败策略
    if (isError || hasNoResults) {
      memory.failedStrategies.set(strategyKey, resultSummary);
      // 语义策略保持 success: false
    } else {
      memory.successfulStrategies.push(strategyKey);
      // ⭐ 更新语义策略为成功状态
      if (memory.semanticStrategies[currentStrategyIndex]) {
        memory.semanticStrategies[currentStrategyIndex].success = true;
      }
      // 累积上下文（只累积有结果的）
      collectedContext += `\n\n--- ${plan.tool} 结果 ---\n${toolResult}`;
    }

    // Step 3: 反思 - 评估结果质量
    if (enableReflection && iteration < maxIterations) {
      addReasoning("reflecting", "评估检索结果...", `\n💭 **评估检索结果**\n正在判断信息是否充足...\n`);
      const reflectionPrompt = buildReflectionPrompt(userQuery, collectedContext, retrieveStep, memory);
      const reflectionResponse = await callLLM(reflectionPrompt, { temperature: 0.2, maxTokens: 400 });
      
      const reflection = extractJSON(reflectionResponse);
      if (reflection) {
        const confidencePercent = Math.round((reflection.confidence || 0) * 100);
        const relevanceMap: Record<string, string> = { high: "🎯", medium: "📍", low: "📌", none: "❌" };
        const relevanceKey = (reflection.relevance || "medium") as string;
        const relevanceEmoji = relevanceMap[relevanceKey] || "📍";
        
        // 提取关键发现
        if (reflection.keyFindings && Array.isArray(reflection.keyFindings)) {
          memory.keyFindings.push(...reflection.keyFindings);
        }
        
        const reflectReasoning = reflection.sufficient 
          ? `信息充足 (置信度: ${confidencePercent}%)`
          : `信息不足: ${reflection.missingInfo || "需要更多信息"}`;
        
        steps.push({
          type: "reflect",
          reasoning: reflectReasoning,
          confidence: reflection.confidence,
          timestamp: Date.now(),
        });

        // 自我修正：如果需要调整策略
        if (enableSelfCorrection && reflection.shouldCorrect && reflection.correctionReason) {
          console.log("[AgenticRAG] Self-correction triggered:", reflection.correctionReason);
          steps.push({
            type: "correct",
            reasoning: reflection.correctionReason,
            correctionReason: reflection.correctionReason,
            isCorrection: true,
            timestamp: Date.now(),
          });
          addReasoning(
            "reflecting",
            "调整策略",
            `🔄 **策略修正**: ${reflection.correctionReason}\n`
          );
        }

        // 如果信息充足且置信度达标，停止检索
        if (reflection.sufficient && reflection.confidence >= confidenceThreshold) {
          console.log(`[AgenticRAG] Sufficient info with confidence ${reflection.confidence}`);
          addReasoning(
            "done",
            `信息充足 (${confidencePercent}%)`,
            `✅ **评估结果**: 信息充足\n- 置信度: ${confidencePercent}%\n- 相关性: ${relevanceEmoji} ${reflection.relevance || "medium"}\n- 可以回答用户问题\n`
          );
          break;
        } else if (!reflection.sufficient) {
          addReasoning(
            "reflecting",
            "需要更多信息",
            `⚠️ **评估结果**: 信息不足\n- 置信度: ${confidencePercent}%\n- 相关性: ${relevanceEmoji} ${reflection.relevance || "medium"}\n- 缺少: ${reflection.missingInfo || "更多相关信息"}\n- 建议: ${reflection.suggestion || "继续检索"}\n`
          );
        }
      }
    }
  }

  if (iteration >= maxIterations) {
    hitLimit = true;
    console.log("[AgenticRAG] Hit max iterations limit");
    addReasoning("done", "达到最大轮数", `\n⚠️ **达到最大检索轮数** (${maxIterations} 轮)\n将基于已收集的信息生成回答\n`);
  }

  // Step 4: 生成最终答案
  addReasoning("answering", "生成回答中...", `\n✍️ **正在生成回答**\n基于收集到的信息整理答案...\n`);
  const answerPrompt = buildAnswerPrompt(userQuery, collectedContext, steps, memory);
  const answer = await callLLM(answerPrompt, { temperature: 0.7 });

  steps.push({
    type: "answer",
    result: answer,
    timestamp: Date.now(),
  });

  // 清理定时器
  cleanup();
  
  // 统计缓存命中情况
  let cacheHits = 0;
  for (const entry of memory.cache.values()) {
    cacheHits += entry.hitCount;
  }
  
  // 生成策略摘要
  const strategySummary = [
    `成功策略: ${memory.successfulStrategies.length}`,
    `失败策略: ${memory.failedStrategies.size}`,
    `语义去重: ${memory.semanticStrategies.length}`,
    `缓存命中: ${cacheHits}`,
    `关键发现: ${memory.keyFindings.length}`,
  ].join(" | ");

  console.log(`[AgenticRAG] Completed with ${iteration} iterations, ${steps.length} steps`);
  console.log(`[AgenticRAG] Strategy summary: ${strategySummary}`);
  console.log(`[AgenticRAG] Cache stats: size=${memory.cache.size}, hits=${cacheHits}`);

  return {
    answer,
    steps,
    collectedContext,
    iterations: iteration,
    hitLimit,
    strategySummary,
  };
}

/**
 * 获取工具的中文显示名称
 */
export function getToolDisplayName(toolName: string): string {
  if (isSkillToolName(toolName)) {
    return getSkillDisplayName(toolName);
  }
  const names: Record<string, string> = {
    query_blocks: "组合查询",
    get_blocks_text: "读取块内容",
    get_page: "查找页面",
    get_today_journal: "获取今日日记",
    get_tags_and_pages: "标签与页面",
    insert_markdown: "插入内容",
    insert_tags: "添加标签",
    create_page: "创建页面",
    create_tags: "创建标签",
    move_blocks: "移动块",
    delete_blocks: "删除块",
    remove_tags: "移除标签",
    webSearch: "联网搜索",
  };
  return names[toolName] || toolName;
}

