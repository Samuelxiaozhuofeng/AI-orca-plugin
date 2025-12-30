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
  contextRefs?: Array<{ title: string; kind: string; blockId?: number }>;
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
 * 生成可搜索的文本内容（用于块的 text 字段，支持全文搜索）
 */
function generateSearchableText(title: string, messages: SavedMessage[]): string {
  const parts: string[] = [`AI 对话: ${title}`];

  for (const msg of messages) {
    if (msg.content) {
      const role = msg.role === "user" ? "用户" : "AI";
      parts.push(`【${role}】${msg.content}`);
    }
  }

  return parts.join("\n\n");
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
      await orca.commands.invokeGroup(async () => {
        await orca.commands.invokeEditorCommand(
          "core.editor.insertTag",
          null,
          blockId,
          "Ai会话保存"
        );
      }, { topGroup: true, undoable: true });
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
    
    // 使用 core.editor.insertBlock 创建自定义块
    const blockId = await orca.commands.invokeEditorCommand(
      "core.editor.insertBlock",
      null,           // cursor
      journalBlockObj, // refBlock
      "lastChild",    // position
      [{ t: "t", v: searchableText }], // content (可搜索)
      repr            // repr (自定义块数据)
    );
    
    console.log("[export-service] insertBlock result:", blockId);
    
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
      await orca.commands.invokeGroup(async () => {
        await orca.commands.invokeEditorCommand(
          "core.editor.insertTag",
          null,
          blockId,
          "Ai会话保存"
        );
      }, { topGroup: true, undoable: true });
    } catch (tagErr) {
      console.warn("[export-service] saveSessionToJournal: Failed to add tag:", tagErr);
    }
    
    return { success: true, message: "已保存到今日日记" };
  } catch (err: any) {
    console.error("[export-service] Failed to save to journal:", err);
    return { success: false, message: err?.message || "保存失败" };
  }
}
