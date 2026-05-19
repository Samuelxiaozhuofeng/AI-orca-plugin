import {
  emptyStateContainerStyle,
  emptyStateTitleStyle,
  emptyStateSubtitleStyle,
  suggestionGridStyle,
  suggestionCardStyle,
  suggestionIconStyle,
  suggestionTitleStyle,
  suggestionDescStyle,
} from "../styles/ai-chat-styles";
import { getTimeGreeting } from "../utils/chat-ui-utils";

const React = window.React as unknown as {
  createElement: typeof window.React.createElement;
};
const { createElement } = React;

interface EmptyStateProps {
  onSuggestionClick: (text: string) => void;
}

const SUGGESTIONS = [
  {
    icon: "ti ti-notes",
    title: "总结当前笔记",
    desc: "快速获取当前页面的核心内容摘要",
    prompt: "请总结当前笔记的主要内容。",
  },
  {
    icon: "ti ti-search",
    title: "搜索我的笔记",
    desc: "查找包含特定关键词的笔记块",
    prompt: "请帮我搜索关于[关键词]的笔记。",
  },
  {
    icon: "ti ti-wand",
    title: "润色这段文字",
    desc: "优化选中文字的表达和流畅度",
    prompt: "请帮我润色这段文字：[粘贴文字]",
  },
  {
    icon: "ti ti-bulb",
    title: "AI 能做什么？",
    desc: "了解 AI 助手的功能和使用技巧",
    prompt: "请介绍一下你可以帮我做哪些事情？有哪些可用的工具？",
  },
];

/**
 * Enhanced EmptyState component with:
 * - Time-based greeting (早上好/下午好/晚上好)
 * - Card hover animation (scale up slightly)
 * - Staggered fade-in effect
 * 
 * **Feature: chat-ui-enhancement**
 * **Validates: Requirements 3.1, 3.2, 3.3**
 */
export default function EmptyState({ onSuggestionClick }: EmptyStateProps) {
  // Get time-based greeting (Requirements 3.1)
  const greeting = getTimeGreeting();

  return createElement(
    "div",
    { style: emptyStateContainerStyle },
    // Title with time greeting and staggered animation (Requirements 3.1, 3.3)
    createElement(
      "div",
      { 
        style: emptyStateTitleStyle,
        className: "empty-state-stagger-1"
      },
      `👋 ${greeting}，欢迎使用 AI Chat`
    ),
    // Subtitle with staggered animation (Requirements 3.3)
    createElement(
      "div",
      { 
        style: emptyStateSubtitleStyle,
        className: "empty-state-stagger-2"
      },
      "选择下方建议或输入问题开始对话"
    ),
    // Suggestion grid with staggered card animations (Requirements 3.2, 3.3)
    createElement(
      "div",
      { 
        style: suggestionGridStyle,
        className: "empty-state-stagger-3"
      },
      ...SUGGESTIONS.map((item, index) =>
        createElement(
          "div",
          {
            key: index,
            style: suggestionCardStyle,
            className: `suggestion-card suggestion-card-stagger-${index}`,
            onClick: () => onSuggestionClick(item.prompt),
          },
          createElement("i", { className: item.icon, style: suggestionIconStyle }),
          createElement("div", { style: suggestionTitleStyle }, item.title),
          createElement("div", { style: suggestionDescStyle }, item.desc)
        )
      )
    )
  );
}
