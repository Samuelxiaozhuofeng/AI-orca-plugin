/**
 * Export Service
 * 提供聊天记录导出功能：导出为 Markdown 文件或保存到 Orca 笔记
 */

import type { Message, SavedSession } from "./session-service";
import { getAiChatBlockType } from "../ui/ai-chat-renderer";

/** 完整的消息格式（用于保存到块，与 Message 类型同步） */
interface SavedMessage {
  role: "user" | "assistant";
  content: string;
  createdAt?: number;
  // 文件/图片
  files?: Array<{
    path: string;
    name: string;
    mimeType: string;
    size?: number;
    category?: "image" | "video" | "audio" | "document" | "code" | "data" | "other";
  }>;
  images?: Array<{
    path: string;
    name: string;
    mimeType: string;
  }>;
  // 推理过程
  reasoning?: string;
  // 模型
  model?: string;
  // 上下文引用
  contextRefs?: Array<{ title: string; kind: string; blockId?: number; preview?: string }>;
  // Web 搜索结果来源
  searchResults?: Array<{
    title: string;
    url: string;
    snippet?: string;
    publishedDate?: string;
    domain?: string;
  }>;
  // 工具调用
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: {
      name: string;
      arguments: string;
    };
  }>;
  // 重要标记
  pinned?: boolean;
}

/**
 * 将消息转换为 Markdown 格式
 */
function messageToMarkdown(msg: Message): string {
  const roleLabel = msg.role === "user" ? "👤 用户" : msg.role === "assistant" ? "🤖 AI" : "🔧 工具";
  const time = new Date(msg.createdAt).toLocaleString("zh-CN");
  
  let content = msg.content || "";
  
  // 处理推理内容
  if (msg.reasoning) {
    content = `<details>\n<summary>💭 推理过程</summary>\n\n${msg.reasoning}\n</details>\n\n${content}`;
  }
  
  // 处理工具调用
  if (msg.tool_calls && msg.tool_calls.length > 0) {
    const toolCallsText = msg.tool_calls.map(tc => {
      return `- 调用 \`${tc.function.name}\``;
    }).join("\n");
    content = `${content}\n\n**工具调用:**\n${toolCallsText}`;
  }
  
  return `### ${roleLabel}\n*${time}*\n\n${content}\n`;
}

/**
 * 将会话导出为 Markdown 字符串
 */
export function sessionToMarkdown(session: SavedSession): string {
  const title = session.title || "AI 对话";
  const createdAt = new Date(session.createdAt).toLocaleString("zh-CN");
  const model = session.model || "未知模型";
  
  const header = `# ${title}\n\n- **创建时间**: ${createdAt}\n- **模型**: ${model}\n\n---\n\n`;
  
  const messages = session.messages
    .filter(m => !m.localOnly && m.role !== "tool")
    .map(messageToMarkdown)
    .join("\n---\n\n");
  
  return header + messages;
}

/**
 * 导出会话为 Markdown 文件（下载）
 */
export function exportSessionAsFile(session: SavedSession): void {
  const markdown = sessionToMarkdown(session);
  const title = session.title || "AI对话";
  const filename = `${title.replace(/[\\/:*?"<>|]/g, "_")}_${new Date().toISOString().slice(0, 10)}.md`;
  
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/**
 * 子块信息接口
 */
export interface BlockInfo {
  id: number;
  content: string;
  created?: string;
  modified?: string;
  depth: number;        // 嵌套深度，0 为顶级
}

/**
 * 日记条目接口
 */
export interface JournalEntry {
  date: string;
  content: string;
  blockId?: number;
  // 元数据
  created?: string;      // 创建时间 ISO 格式
  modified?: string;     // 修改时间 ISO 格式
  wordCount?: number;    // 字数统计
  tags?: string[];       // 标签列表
  hasImages?: boolean;   // 是否包含图片
  hasLinks?: boolean;    // 是否包含链接
  childCount?: number;   // 子块数量
  // 子块详情（包含每个块的时间信息）
  blocks?: BlockInfo[];
}

/**
 * 将日记条目导出为 Markdown 文件
 * @param entries - 日记条目数组
 * @param rangeLabel - 范围标签（如 "2024年" 或 "2024年5月"）
 */
export function exportJournalsAsFile(entries: JournalEntry[], rangeLabel: string): void {
  const header = `# ${rangeLabel} 日记\n\n导出时间: ${new Date().toLocaleString("zh-CN")}\n共 ${entries.length} 篇日记\n\n---\n\n`;
  
  const content = entries.map(entry => {
    const dateHeader = `## ${entry.date}\n\n`;
    return dateHeader + entry.content + "\n";
  }).join("\n---\n\n");
  
  const markdown = header + content;
  const filename = `日记_${rangeLabel.replace(/[\\/:*?"<>|]/g, "_")}.md`;
  
  const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  
  orca.notify("success", `已导出 ${entries.length} 篇日记到 ${filename}`);
}

/**
 * 导出日记为 JSON 文件
 * @param entries - 日记条目数组
 * @param rangeLabel - 范围标签（如 "2024年" 或 "2024年5月"）
 */
export function exportJournalsAsJson(entries: JournalEntry[], rangeLabel: string): void {
  // 计算统计信息
  const totalWords = entries.reduce((sum, e) => sum + (e.wordCount || 0), 0);
  const totalBlocks = entries.reduce((sum, e) => sum + (e.blocks?.length || 0), 0);
  const entriesWithImages = entries.filter(e => e.hasImages).length;
  const entriesWithLinks = entries.filter(e => e.hasLinks).length;
  const allTags = [...new Set(entries.flatMap(e => e.tags || []))];
  
  const exportData = {
    exportTime: new Date().toISOString(),
    rangeLabel,
    // 统计信息
    statistics: {
      totalEntries: entries.length,
      totalBlocks,
      totalWords,
      entriesWithImages,
      entriesWithLinks,
      uniqueTags: allTags.length,
      allTags,
    },
    // 日记条目
    entries: entries.map(entry => ({
      date: entry.date,
      blockId: entry.blockId,
      // 元数据
      meta: {
        created: entry.created,
        modified: entry.modified,
        wordCount: entry.wordCount,
        childCount: entry.childCount,
        hasImages: entry.hasImages,
        hasLinks: entry.hasLinks,
        tags: entry.tags,
      },
      // 子块详情（每个块的内容和时间）
      blocks: entry.blocks,
      // 完整内容（纯文本）
      content: entry.content,
    })),
  };
  
  const json = JSON.stringify(exportData, null, 2);
  const filename = `日记_${rangeLabel.replace(/[\\/:*?"<>|]/g, "_")}.json`;
  
  const blob = new Blob([json], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  
  orca.notify("success", `已导出 ${entries.length} 篇日记到 ${filename}`);
}

/**
 * 转换消息用于保存（保留完整信息）
 */
function convertMessages(messages: Message[]): SavedMessage[] {
  return messages
    .filter(m => !m.localOnly && (m.role === "user" || m.role === "assistant"))
    .map(m => {
      const saved: SavedMessage = {
        role: m.role as "user" | "assistant",
        content: m.content,
        createdAt: m.createdAt,
      };
      // 文件/图片
      if (m.files && m.files.length > 0) {
        saved.files = m.files.map(f => ({
          path: f.path,
          name: f.name,
          mimeType: f.mimeType,
          size: f.size,
          category: f.category,
        }));
      }
      if (m.images && m.images.length > 0 && !m.files) {
        saved.images = m.images.map(img => ({
          path: img.path,
          name: img.name,
          mimeType: img.mimeType,
        }));
      }
      // 推理过程
      if (m.reasoning) {
        saved.reasoning = m.reasoning;
      }
      // 模型
      if (m.model) {
        saved.model = m.model;
      }
      // 上下文引用
      if (m.contextRefs && m.contextRefs.length > 0) {
        saved.contextRefs = m.contextRefs;
      }
      // Web 搜索结果来源
      if (m.searchResults && m.searchResults.length > 0) {
        saved.searchResults = m.searchResults.map(r => ({
          title: r.title,
          url: r.url,
          snippet: r.snippet,
          publishedDate: r.publishedDate,
          domain: r.domain,
        }));
      }
      // 工具调用
      if (m.tool_calls && m.tool_calls.length > 0) {
        saved.tool_calls = m.tool_calls;
      }
      // 重要标记
      if (m.pinned) {
        saved.pinned = true;
      }
      return saved;
    });
}

/**
 * 提取文本中的关键词（用于搜索）
 * 提取中文词汇、英文单词、数字等
 */
function extractKeywords(text: string, maxKeywords: number = 50): string[] {
  if (!text) return [];
  
  // 移除 markdown 语法
  const cleanText = text
    .replace(/```[\s\S]*?```/g, " ") // 代码块
    .replace(/`[^`]+`/g, " ")        // 行内代码
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1") // 链接
    .replace(/[#*_~>\-|]/g, " ")     // markdown 符号
    .replace(/\s+/g, " ")
    .trim();
  
  // 提取有意义的词汇
  const words: string[] = [];
  
  // 中文词汇（2-6字）
  const chineseMatches = cleanText.match(/[\u4e00-\u9fa5]{2,6}/g) || [];
  words.push(...chineseMatches);
  
  // 英文单词（3字母以上）
  const englishMatches = cleanText.match(/[a-zA-Z]{3,}/gi) || [];
  words.push(...englishMatches.map(w => w.toLowerCase()));
  
  // 数字（可能是版本号、配置值等）
  const numberMatches = cleanText.match(/\d+(\.\d+)*/g) || [];
  words.push(...numberMatches);
  
  // 去重并限制数量
  const uniqueWords = [...new Set(words)];
  return uniqueWords.slice(0, maxKeywords);
}

/**
 * 生成可搜索的文本内容（用于块的 text 字段，支持全文搜索）
 * 
 * 策略：Orca 的 text 字段有长度限制（约 2000 字符），所以：
 * 1. 标题和用户问题完整保留（最重要的搜索目标）
 * 2. AI 回答只保留摘要和关键词
 * 3. 总长度控制在 2000 字符以内
 */
function generateSearchableText(title: string, messages: SavedMessage[]): string {
  const MAX_LENGTH = 2000;
  const parts: string[] = [`AI 对话: ${title}`];
  
  // 收集用户问题和 AI 回答
  const userQuestions: string[] = [];
  const aiContents: string[] = [];
  
  for (const msg of messages) {
    if (msg.content) {
      if (msg.role === "user") {
        userQuestions.push(msg.content);
      } else {
        aiContents.push(msg.content);
      }
    }
  }
  
  // 用户问题完整保留（通常是搜索的关键）
  if (userQuestions.length > 0) {
    parts.push("【问题】" + userQuestions.join(" | "));
  }
  
  // 计算剩余空间
  const currentLength = parts.join("\n").length;
  const remainingSpace = MAX_LENGTH - currentLength - 50; // 留点余量
  
  if (remainingSpace > 100 && aiContents.length > 0) {
    // 从 AI 回答中提取关键词
    const allAiText = aiContents.join(" ");
    const keywords = extractKeywords(allAiText, 100);
    
    if (keywords.length > 0) {
      // 构建关键词文本，控制长度
      let keywordText = "【关键词】" + keywords.join(" ");
      if (keywordText.length > remainingSpace) {
        // 截断关键词
        const maxKeywords = Math.floor(remainingSpace / 5); // 平均每个关键词5字符
        keywordText = "【关键词】" + keywords.slice(0, maxKeywords).join(" ");
      }
      parts.push(keywordText);
    }
  }
  
  const result = parts.join("\n");
  
  // 最终安全截断
  if (result.length > MAX_LENGTH) {
    return result.slice(0, MAX_LENGTH - 3) + "...";
  }
  
  return result;
}

/**
 * 保存会话到 Orca 笔记（使用自定义块渲染器）
 */
export async function saveSessionToNote(session: SavedSession): Promise<{ success: boolean; blockId?: number; message: string }> {
  try {
    const title = session.title || "AI 对话";
    const savedMessages = convertMessages(session.messages);
    
    if (savedMessages.length === 0) {
      return { success: false, message: "没有可保存的消息" };
    }
    
    // 创建新页面
    const result = await orca.invokeBackend("create-page", title);
    
    if (!result || typeof result !== "number") {
      return { success: false, message: "创建页面失败" };
    }
    
    const pageId = result;
    
    // 使用自定义块类型创建对话块
    const blockType = getAiChatBlockType();
    const repr = {
      type: blockType,
      title,
      messages: savedMessages,
      model: session.model || "",
      createdAt: session.createdAt,
    };
    
    // 在页面下创建自定义块
    await orca.invokeBackend("insert-blocks", pageId, "append", [{
      text: "",
      repr: repr, // 直接使用 repr 字段
    }]);
    
    return { success: true, blockId: pageId, message: `已保存到笔记: ${title}` };
  } catch (err: any) {
    console.error("[export-service] Failed to save to note:", err);
    return { success: false, message: err?.message || "保存失败" };
  }
}

/**
 * 保存选中的消息到今日日记（使用自定义块渲染器）
 * @param messages 要保存的消息数组
 * @param title 可选标题
 * @param model 可选模型名称
 */
export async function saveMessagesToJournal(
  messages: Message[],
  title?: string,
  model?: string
): Promise<{ success: boolean; message: string }> {
  try {
    const savedMessages = convertMessages(messages);
    
    if (savedMessages.length === 0) {
      return { success: false, message: "没有可保存的消息" };
    }
    
    // 生成标题
    const finalTitle = title || (savedMessages.length === 1 
      ? `AI 对话片段` 
      : `AI 对话 (${savedMessages.length} 条消息)`);
    
    // 获取今日日记
    const journalResult = await orca.invokeBackend("get-journal-block", new Date());
    
    if (!journalResult) {
      return { success: false, message: "获取今日日记失败，请确保已创建今日日记" };
    }
    
    let journalBlock = journalResult;
    if ((journalResult as any)?.result !== undefined) {
      journalBlock = (journalResult as any).result;
    }
    
    const journalId = typeof journalBlock === "number" ? journalBlock : (journalBlock as any)?.id;
    
    if (!journalId) {
      return { success: false, message: "获取今日日记失败，返回格式异常" };
    }
    
    if (!orca.commands || !orca.commands.invokeEditorCommand) {
      return { success: false, message: "Orca 命令接口不可用" };
    }
    
    // 导航到日记页面
    orca.nav.openInLastPanel("block", { blockId: journalId });
    await new Promise(resolve => setTimeout(resolve, 100));
    
    let journalBlockObj = orca.state.blocks[journalId];
    if (!journalBlockObj) {
      journalBlockObj = await orca.invokeBackend("get-block", journalId);
    }
    
    if (!journalBlockObj) {
      return { success: false, message: "导航后无法获取日记块" };
    }
    
    // 使用自定义块类型
    const blockType = getAiChatBlockType();
    const repr = {
      type: blockType,
      title: finalTitle,
      messages: savedMessages,
      model: model || "",
      createdAt: Date.now(),
    };
    
    // 生成可搜索的文本内容
    const searchableText = generateSearchableText(finalTitle, savedMessages);
    
    const blockId = await orca.commands.invokeEditorCommand(
      "core.editor.insertBlock",
      null,
      journalBlockObj,
      "lastChild",
      [{ t: "t", v: searchableText }],
      repr
    );
    
    if (!blockId) {
      return { success: false, message: "创建块失败" };
    }
    
    // 尝试更新块的文本内容以支持搜索
    try {
      await orca.invokeBackend("update-block", blockId, {
        content: [{ t: "t", v: searchableText }],
      });
    } catch (updateErr) {
      console.warn("[export-service] Failed to update block content:", updateErr);
    }
    
    // 添加标签 "Ai会话保存"
    try {
      if (typeof orca.commands?.invokeGroup === "function") {
        await orca.commands.invokeGroup(async () => {
          await orca.commands.invokeEditorCommand(
            "core.editor.insertTag",
            null,
            blockId,
            "Ai会话保存"
          );
        }, { topGroup: true, undoable: true });
      } else {
        await orca.commands.invokeEditorCommand(
          "core.editor.insertTag",
          null,
          blockId,
          "Ai会话保存"
        );
      }
    } catch (tagErr) {
      console.warn("[export-service] saveMessagesToJournal: Failed to add tag:", tagErr);
    }
    
    return { success: true, message: `已保存 ${savedMessages.length} 条消息到今日日记` };
  } catch (err: any) {
    console.error("[export-service] Failed to save messages to journal:", err);
    return { success: false, message: err?.message || "保存失败" };
  }
}

/**
 * 保存单条消息到今日日记
 */
export async function saveSingleMessageToJournal(
  message: Message,
  model?: string
): Promise<{ success: boolean; message: string }> {
  return saveMessagesToJournal([message], undefined, model);
}

/**
 * 保存会话到今日日记（使用自定义块渲染器）
 */
export async function saveSessionToJournal(session: SavedSession): Promise<{ success: boolean; message: string }> {
  try {
    const title = session.title || "AI 对话";
    const savedMessages = convertMessages(session.messages);
    
    console.log("[export-service] saveSessionToJournal called, messages:", savedMessages.length);
    
    if (savedMessages.length === 0) {
      return { success: false, message: "没有可保存的消息" };
    }
    
    // 获取今日日记
    console.log("[export-service] Calling get-journal-block...");
    const journalResult = await orca.invokeBackend("get-journal-block", new Date());
    console.log("[export-service] get-journal-block result:", journalResult);
    
    if (!journalResult) {
      return { success: false, message: "获取今日日记失败，请确保已创建今日日记" };
    }
    
    // 处理可能的包装格式
    let journalBlock = journalResult;
    if ((journalResult as any)?.result !== undefined) {
      journalBlock = (journalResult as any).result;
    }
    
    const journalId = typeof journalBlock === "number" ? journalBlock : (journalBlock as any)?.id;
    
    if (!journalId) {
      return { success: false, message: "获取今日日记失败，返回格式异常" };
    }
    
    console.log("[export-service] journalId:", journalId);
    
    // 检查 orca.commands 是否可用
    if (!orca.commands || !orca.commands.invokeEditorCommand) {
      return { success: false, message: "Orca 命令接口不可用" };
    }
    
    // 先导航到日记页面（编辑器命令需要目标页面在编辑器中打开）
    orca.nav.openInLastPanel("block", { blockId: journalId });
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // 获取日记块对象
    let journalBlockObj = orca.state.blocks[journalId];
    if (!journalBlockObj) {
      journalBlockObj = await orca.invokeBackend("get-block", journalId);
    }
    
    if (!journalBlockObj) {
      return { success: false, message: "导航后无法获取日记块" };
    }
    
    // 使用自定义块类型
    const blockType = getAiChatBlockType();
    const repr = {
      type: blockType,
      title,
      messages: savedMessages,
      model: session.model || "",
      createdAt: session.createdAt,
    };
    
    console.log("[export-service] Creating block with repr:", repr);
    
    // 生成可搜索的文本内容
    const searchableText = generateSearchableText(title, savedMessages);
    console.log("[export-service] searchableText length:", searchableText.length);
    
    // 方法1: 使用 insert-blocks 直接创建带 text 的块
    let blockId: number | null = null;
    try {
      const insertResult = await orca.invokeBackend("insert-blocks", journalId, "append", [{
        text: searchableText,  // 直接设置 text 字段
        repr: repr,
      }]);
      
      if (insertResult && Array.isArray(insertResult) && insertResult.length > 0) {
        blockId = insertResult[0];
        console.log("[export-service] insert-blocks succeeded, blockId:", blockId);
      }
    } catch (insertErr) {
      console.warn("[export-service] insert-blocks failed:", insertErr);
    }
    
    // 方法2: 如果方法1失败，使用 editor command
    if (!blockId) {
      blockId = await orca.commands.invokeEditorCommand(
        "core.editor.insertBlock",
        null,           // cursor
        journalBlockObj, // refBlock
        "lastChild",    // position
        [{ t: "t", v: searchableText }], // content (可搜索)
        repr            // repr (自定义块数据)
      );
      console.log("[export-service] insertBlock result:", blockId);
      
      // 尝试更新块的 text 字段
      if (blockId) {
        try {
          await orca.invokeBackend("update-block", blockId, {
            text: searchableText,
          });
          console.log("[export-service] update-block text succeeded");
        } catch (updateErr) {
          console.warn("[export-service] Failed to update block text:", updateErr);
        }
      }
    }
    
    // 添加标签 "Ai会话保存"
    try {
      if (typeof orca.commands?.invokeGroup === "function") {
        await orca.commands.invokeGroup(async () => {
          await orca.commands.invokeEditorCommand(
            "core.editor.insertTag",
            null,
            blockId,
            "Ai会话保存"
          );
        }, { topGroup: true, undoable: true });
      } else {
        await orca.commands.invokeEditorCommand(
          "core.editor.insertTag",
          null,
          blockId,
          "Ai会话保存"
        );
      }
    } catch (tagErr) {
      console.warn("[export-service] saveSessionToJournal: Failed to add tag:", tagErr);
    }
    
    return { success: true, message: "已保存到今日日记" };
  } catch (err: any) {
    console.error("[export-service] Failed to save to journal:", err);
    return { success: false, message: err?.message || "保存失败" };
  }
}
