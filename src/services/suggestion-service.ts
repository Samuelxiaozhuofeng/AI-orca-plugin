/**
 * Suggestion Service
 * 
 * Generates AI-powered suggested replies based on current AI message
 * Uses the same API client as the main chat
 */

import { openAIChatCompletionsStream, type OpenAIChatMessage } from "./openai-client";
import { getAiChatSettings, getModelApiConfig, resolveAiModel } from "../settings/ai-chat-settings";
import { getAiChatPluginName } from "../ui/ai-chat-ui";

/**
 * Generate suggested replies using AI based on current AI message content
 * 
 * @param aiMessageContent - The current AI message content to generate suggestions for
 * @returns Array of 3-5 suggested reply texts
 */
export async function generateSuggestedReplies(aiMessageContent: string): Promise<string[]> {
  const pluginName = getAiChatPluginName();
  const settings = getAiChatSettings(pluginName);
  const model = resolveAiModel(settings);
  
  // 获取当前模型的 API 配置
  const apiConfig = getModelApiConfig(settings, model);

  // 验证设置
  if (!apiConfig.apiUrl || !apiConfig.apiKey) {
    throw new Error("请先配置 API URL 和 API Key");
  }

  if (!aiMessageContent || aiMessageContent.trim().length === 0) {
    throw new Error("AI 回复内容为空，无法生成建议");
  }

  // 截取内容，避免太长
  const content = aiMessageContent.slice(0, 1000);

  // System prompt for generating suggestions
  const systemPrompt = `根据 AI 的回复内容，生成 3-5 个用户可能想要继续追问的简短问题或回复。

要求：
1. 每个建议不超过 15 个字
2. 建议要与回复内容直接相关
3. 建议要自然、口语化
4. 只返回建议文本，每行一个，不要编号
5. 不要返回解释

示例输出：
这个方法的性能如何？
能举个实际例子吗？
有没有更简单的方案？`;

  const userPrompt = `AI 回复内容：
${content}

请生成 3-5 个相关的追问建议：`;

  const messages: OpenAIChatMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt },
  ];

  // 使用项目中已有的 API 调用方式
  let responseContent = "";
  
  for await (const chunk of openAIChatCompletionsStream({
    apiUrl: apiConfig.apiUrl,
    apiKey: apiConfig.apiKey,
    model,
    messages,
    temperature: 0.8,
    maxTokens: 150,
  })) {
    if (chunk.type === "content" && chunk.content) {
      responseContent += chunk.content;
    }
  }

  if (!responseContent) {
    throw new Error("API 返回内容为空");
  }

  // Parse suggestions (one per line)
  const suggestions = responseContent
    .split("\n")
    .map((line: string) => line.trim())
    // 移除编号前缀（如 "1. ", "- " 等）
    .map((line: string) => line.replace(/^[\d\-\.\)\*]+\s*/, ""))
    .filter((line: string) => line.length > 0 && line.length <= 50)
    .slice(0, 5);

  if (suggestions.length === 0) {
    throw new Error("无法解析 AI 返回的建议");
  }

  return suggestions;
}
