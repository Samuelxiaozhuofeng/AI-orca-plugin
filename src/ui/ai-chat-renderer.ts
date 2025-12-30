/**
 * AI Chat Block Renderer Registration
 * 注册 AI 对话块的自定义渲染器
 */

import AiChatBlockRenderer from "../components/AiChatBlockRenderer";
import { chatAnimations } from "../styles/chat-animations";

const BLOCK_TYPE = "aichat.conversation";
const STYLE_ID = "ai-chat-block-styles";

/**
 * 注入块渲染器样式
 */
function injectBlockStyles(): void {
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = chatAnimations;
    document.head.appendChild(style);
    console.log("[ai-chat-renderer] Block styles injected");
  }
}

/**
 * 注册 AI 对话块渲染器
 */
export function registerAiChatRenderer(): void {
  // 注入块渲染器专用样式
  injectBlockStyles();
  
  // 注册块渲染器
  // isEditable = true 允许块参与正常的编辑操作（缩进、移动等）
  // useChildren = true 允许其他块缩进到此块下成为子块
  orca.renderers.registerBlock(
    BLOCK_TYPE,
    true, // 可编辑（允许缩进等操作）
    AiChatBlockRenderer as any,
    [], // 无资源字段
    true // useChildren - 允许子块
  );
  console.log("[ai-chat-renderer] Registered block renderer:", BLOCK_TYPE);
  
  // 注册 plain 格式转换器（用于搜索）
  orca.converters.registerBlock(
    "plain",
    BLOCK_TYPE,
    (blockContent: any, repr: any) => {
      const title = repr?.title || "AI 对话";
      const messages = repr?.messages || [];
      const lines = [`[AI 对话: ${title}]`];
      for (const msg of messages) {
        const role = msg.role === "user" ? "👤" : "🤖";
        const content = (msg.content || "").slice(0, 100);
        lines.push(`${role} ${content}${msg.content?.length > 100 ? "..." : ""}`);
      }
      return lines.join("\n");
    }
  );
  
  // 注册 html 格式转换器（用于复制）
  orca.converters.registerBlock(
    "html",
    BLOCK_TYPE,
    (blockContent: any, repr: any) => {
      const title = repr?.title || "AI 对话";
      const messages = repr?.messages || [];
      const model = repr?.model || "";
      const createdAt = repr?.createdAt ? new Date(repr.createdAt).toLocaleDateString("zh-CN") : "";
      
      let html = `<div class="ai-chat-block">`;
      html += `<div class="ai-chat-header"><strong>${escapeHtml(title)}</strong>`;
      if (model) html += ` <span>(${escapeHtml(model)})</span>`;
      if (createdAt) html += ` <span>${createdAt}</span>`;
      html += `</div>`;
      
      for (const msg of messages) {
        const role = msg.role === "user" ? "用户" : "AI";
        const content = msg.content || "";
        html += `<div class="ai-chat-message ai-chat-${msg.role}">`;
        html += `<div class="ai-chat-role">${role}</div>`;
        html += `<div class="ai-chat-content">${escapeHtml(content)}</div>`;
        html += `</div>`;
      }
      
      html += `</div>`;
      return html;
    }
  );
  
  // 注册 markdown 格式转换器（用于复制为 Markdown）
  orca.converters.registerBlock(
    "markdown",
    BLOCK_TYPE,
    (blockContent: any, repr: any) => {
      const title = repr?.title || "AI 对话";
      const messages = repr?.messages || [];
      const model = repr?.model || "";
      
      let md = `## ${title}\n\n`;
      if (model) md += `*模型: ${model}*\n\n`;
      
      for (const msg of messages) {
        const role = msg.role === "user" ? "**用户**" : "**AI**";
        const content = msg.content || "";
        md += `${role}:\n\n${content}\n\n---\n\n`;
      }
      
      return md;
    }
  );
  
  console.log("[ai-chat-renderer] Registered block converters:", BLOCK_TYPE);
}

/**
 * HTML 转义
 */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/**
 * 注销 AI 对话块渲染器
 */
export function unregisterAiChatRenderer(): void {
  // 注销转换器
  try {
    orca.converters.unregisterBlock("plain", BLOCK_TYPE);
    orca.converters.unregisterBlock("html", BLOCK_TYPE);
    orca.converters.unregisterBlock("markdown", BLOCK_TYPE);
  } catch (e) {
    // ignore
  }
  // 不移除样式，保持对话块正常显示
  console.log("[ai-chat-renderer] Unregistered block renderer:", BLOCK_TYPE);
}

/**
 * 获取块类型名称
 */
export function getAiChatBlockType(): string {
  return BLOCK_TYPE;
}
