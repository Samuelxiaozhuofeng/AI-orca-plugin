import { setupL10N } from "./libs/l10n";
import zhCN from "./translations/zhCN";
import { registerAiChatSettingsSchema } from "./settings/ai-chat-settings";
import { registerAiChatUI, unregisterAiChatUI } from "./ui/ai-chat-ui";
import { ensureDefaultSkills } from "./services/skill-initializer";
import { loadMemoryStore } from "./store/memory-store";

let pluginName: string;

export async function load(_name: string) {
  pluginName = _name;

  setupL10N(orca.state.locale, { "zh-CN": zhCN });

  await registerAiChatSettingsSchema(pluginName);
  registerAiChatUI(pluginName);

  // Load persisted memory data
  await loadMemoryStore();

  // 后台初始化预置 Skills（不阻塞插件加载）
  ensureDefaultSkills().catch((error) => {
    console.warn("[main] Failed to ensure default skills:", error);
  });

  console.log(`${pluginName} loaded.`);
}

export async function unload() {
  unregisterAiChatUI();
}
