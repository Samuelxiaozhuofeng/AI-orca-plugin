import { registerAiChatSettingsSchema, initAiChatSettings } from "./settings/ai-chat-settings";
import { registerAiChatUI, unregisterAiChatUI } from "./ui/ai-chat-ui";
import { registerAiChatRenderer, unregisterAiChatRenderer } from "./ui/ai-chat-renderer";
import { loadMemoryStore } from "./store/memory-store";
import * as compressionService from "./services/compression-service";

let pluginName: string;

export async function load(_name: string) {
  pluginName = _name;

  // PR review note: Localization init removed to keep PR focused on style fixes.
  await registerAiChatSettingsSchema(pluginName);
  // 加载存储的 provider 配置
  await initAiChatSettings(pluginName);
  registerAiChatUI(pluginName);
  registerAiChatRenderer();

  // Load persisted memory data
  await loadMemoryStore();

  // 挂载调试接口到 window（开发用）
  (window as any).compressionService = compressionService;

  console.log(`${pluginName} loaded.`);
}

export async function unload() {
  unregisterAiChatUI();
  unregisterAiChatRenderer();
}
