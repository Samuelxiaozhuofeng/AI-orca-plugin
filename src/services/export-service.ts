/**
 * Export Service
 * 提供聊天记录导出功能：导出为 Markdown 文件或保存到 Orca 笔记
 */

import type { Message, SavedSession } from "./session-service";
import { getAiChatBlockType } from "../ui/ai-chat-renderer";

/** 简化的消息格式（用于保存到块） */
interface SimplifiedMessage {
  role: "user" | "assistant";
  content: string;
  createdAt?: number;
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
 * 简化消息用于保存
 */
function simplifyMessages(messages: Message[]): SimplifiedMessage[] {
  return messages
    .filter(m => !m.localOnly && (m.role === "user" || m.role === "assistant"))
    .map(m => ({
      role: m.role as "user" | "assistant",
      content: m.content,
      createdAt: m.createdAt,
    }));
}

/**
 * 保存会话到 Orca 笔记（使用自定义块渲染器）
 */
export async function saveSessionToNote(session: SavedSession): Promise<{ success: boolean; blockId?: number; message: string }> {
  try {
    const title = session.title || "AI 对话";
    const simplifiedMessages = simplifyMessages(session.messages);
    
    if (simplifiedMessages.length === 0) {
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
      messages: simplifiedMessages,
      model: session.model || "",
      createdAt: session.createdAt,
    };
    
    // 在页面下创建自定义块
    await orca.invokeBackend("insert-blocks", pageId, "append", [{
      text: "",
      properties: [
        { name: "_repr", value: repr },
      ],
    }]);
    
    return { success: true, blockId: pageId, message: `已保存到笔记: ${title}` };
  } catch (err: any) {
    console.error("[export-service] Failed to save to note:", err);
    return { success: false, message: err?.message || "保存失败" };
  }
}

/**
 * 保存会话到今日日记（使用自定义块渲染器）
 */
export async function saveSessionToJournal(session: SavedSession): Promise<{ success: boolean; message: string }> {
  try {
    const title = session.title || "AI 对话";
    const simplifiedMessages = simplifyMessages(session.messages);
    
    console.log("[export-service] saveSessionToJournal called, messages:", simplifiedMessages.length);
    
    if (simplifiedMessages.length === 0) {
      return { success: false, message: "没有可保存的消息" };
    }
    
    // 获取今日日记 - 使用 get-journal-block API
    console.log("[export-service] Calling get-journal-block...");
    const journalResult = await orca.invokeBackend("get-journal-block", new Date());
    console.log("[export-service] get-journal-block result:", journalResult);
    
    if (!journalResult) {
      console.error("[export-service] journalResult is null/undefined");
      return { success: false, message: "获取今日日记失败，请确保已创建今日日记" };
    }
    
    // 处理可能的包装格式 - Orca 后端可能返回 { result: block } 或直接返回 block
    let journalBlock = journalResult;
    if ((journalResult as any)?.result !== undefined) {
      journalBlock = (journalResult as any).result;
    }
    
    console.log("[export-service] journalBlock:", journalBlock);
    
    const journalId = typeof journalBlock === "number" ? journalBlock : (journalBlock as any)?.id;
    
    if (!journalId) {
      console.error("[export-service] Cannot extract journalId from:", journalBlock);
      return { success: false, message: "获取今日日记失败，返回格式异常" };
    }
    
    console.log("[export-service] journalId:", journalId);
    
    // 使用自定义块类型创建对话块
    const blockType = getAiChatBlockType();
    const repr = {
      type: blockType,
      title,
      messages: simplifiedMessages,
      model: session.model || "",
      createdAt: session.createdAt,
    };
    
    // 在日记中添加自定义块
    console.log("[export-service] Inserting block to journal...");
    await orca.invokeBackend("insert-blocks", journalId, "append", [{
      text: "",
      properties: [
        { name: "_repr", value: repr },
      ],
    }]);
    
    console.log("[export-service] Successfully saved to journal");
    return { success: true, message: "已保存到今日日记" };
  } catch (err: any) {
    console.error("[export-service] Failed to save to journal:", err);
    return { success: false, message: err?.message || "保存失败" };
  }
}
