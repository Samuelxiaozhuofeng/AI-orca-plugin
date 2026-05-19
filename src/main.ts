import { registerAiChatSettingsSchema, initAiChatSettings } from "./settings/ai-chat-settings";
import { registerAiChatUI, unregisterAiChatUI, openAiChatPanel } from "./ui/ai-chat-ui";
import { registerAiChatRenderer, unregisterAiChatRenderer } from "./ui/ai-chat-renderer";
import { loadMemoryStore } from "./store/memory-store";
import { AiChatPluginAPI } from "./services/plugin-api";

import { initCommands } from "./services/commands-loader";
import { loadVisionModelConfig } from "./services/ai/vision-model-service";
import { initMcpServers } from "./services/external/mcp-server-manager";
import { loadMcpSettings, ensureDefaultMcpServer } from "./store/mcp-store";

let pluginName: string;
let hideableObserver: MutationObserver | null = null;
const AI_CHAT_OPEN_COMMAND_SUFFIX = "openAiChatPanel";

function getAiChatOpenCommandId(): string {
  return `${pluginName}.${AI_CHAT_OPEN_COMMAND_SUFFIX}`;
}

function getDefaultAiChatShortcut(): string {
  if (typeof navigator !== "undefined") {
    const platform = navigator.platform || "";
    if (/Mac|iPhone|iPad|iPod/i.test(platform)) {
      return "meta+shift+k";
    }
  }
  return "ctrl+shift+k";
}

function findShortcutForCommand(commandId: string): string | null {
  const shortcuts = orca.state?.shortcuts;
  if (!shortcuts) return null;
  for (const [shortcut, id] of Object.entries(shortcuts)) {
    if (id === commandId) return shortcut;
  }
  return null;
}

/**
 * 为 .orca-hideable 的直接子元素根据功能添加对应的类名
 * - .orca-block-editor -> .orca-hideable-editor
 * - 其他元素根据已有类名或标签推断
 */
function markHideableChildren() {
  document.querySelectorAll('.orca-hideable').forEach(hideable => {
    Array.from(hideable.children).forEach(child => {
      if (!(child instanceof HTMLElement)) return;
      
      // 已经标记过的跳过
      if (child.dataset.hideableMarked) return;
      
      let className = '';
      
      // 根据子元素特征判断功能类型
      if (child.classList.contains('orca-block-editor')) {
        className = 'orca-hideable-editor';
      } else if (child.classList.contains('orca-toolbar') || child.querySelector('.orca-toolbar')) {
        className = 'orca-hideable-toolbar';
      } else if (child.classList.contains('orca-sidebar') || child.classList.contains('orca-side')) {
        className = 'orca-hideable-sidebar';
      } else if (child.classList.contains('orca-header') || child.tagName === 'HEADER') {
        className = 'orca-hideable-header';
      } else if (child.classList.contains('orca-footer') || child.tagName === 'FOOTER') {
        className = 'orca-hideable-footer';
      } else if (child.classList.contains('orca-nav') || child.tagName === 'NAV') {
        className = 'orca-hideable-nav';
      } else {
        // 其他未知类型，使用通用类名
        className = 'orca-hideable-content';
      }
      
      if (className && !child.classList.contains(className)) {
        child.classList.add(className);
        child.dataset.hideableMarked = '1';
      }
    });
  });
}

/**
 * 启动 MutationObserver 监听 DOM 变化，自动标记新增的 hideable 子元素
 */
function startHideableObserver() {
  markHideableChildren(); // 先处理已有元素
  
  hideableObserver = new MutationObserver(() => {
    markHideableChildren();
  });
  
  hideableObserver.observe(document.body, {
    childList: true,
    subtree: true,
  });
}

function stopHideableObserver() {
  if (hideableObserver) {
    hideableObserver.disconnect();
    hideableObserver = null;
  }
}

export async function load(_name: string) {
  pluginName = _name;

  // PR review note: Localization init removed to keep PR focused on style fixes.
  await registerAiChatSettingsSchema(pluginName);
  // 加载存储的 provider 配置
  await initAiChatSettings(pluginName);
  
  // 先注册 UI，这样 window.getAiChatPluginName 才能被设置
  registerAiChatUI(pluginName);
  registerAiChatRenderer();

  const openCommandId = getAiChatOpenCommandId();
  orca.commands.registerCommand(
    openCommandId,
    () => {
      openAiChatPanel();
    },
    "Open AI Chat Panel",
  );

  const defaultShortcut = getDefaultAiChatShortcut();
  const existingShortcut = findShortcutForCommand(openCommandId);
  if (!existingShortcut && orca.shortcuts?.assign) {
    const boundCommand = orca.state?.shortcuts?.[defaultShortcut];
    if (!boundCommand || boundCommand === openCommandId) {
      await orca.shortcuts.assign(defaultShortcut, openCommandId);
    } else {
      console.warn(
        `[AiChat] Shortcut ${defaultShortcut} already bound to ${boundCommand}, skipping assignment.`,
      );
    }
  }

  // Load persisted memory data
  await loadMemoryStore();

  // 加载视觉模型配置
  await loadVisionModelConfig(pluginName);

  // 内置 Skills 已从代码常量加载，无需文件初始化

  // 初始化 Commands 目录（确保默认命令模板存在）
  await initCommands();

  // 初始化 MCP 服务器连接（非阻塞，允许失败）
  await loadMcpSettings();
  ensureDefaultMcpServer();
  initMcpServers().catch((err) => console.warn("[MCP] 初始化出错:", err));

  // 挂载 Plugin API 到全局，供外部插件调用
  (window as any).AiChatPluginAPI = AiChatPluginAPI;

  // 启动 hideable 子元素标记
  startHideableObserver();

  console.log(`${pluginName} loaded.`);
}

export async function unload() {
  stopHideableObserver();
  const openCommandId = getAiChatOpenCommandId();
  if (orca.shortcuts?.assign) {
    try {
      await orca.shortcuts.assign("", openCommandId);
    } catch (err) {
      console.warn("[AiChat] Failed to clear shortcut for AI Chat:", err);
    }
  }
  if (orca.commands?.unregisterCommand) {
    orca.commands.unregisterCommand(openCommandId);
  }
  unregisterAiChatUI();
  unregisterAiChatRenderer();
}
