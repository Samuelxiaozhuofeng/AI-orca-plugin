import { test, assertEqual } from "./test-harness";
import { getModelRuntimeConfig, type AiChatSettings } from "../src/settings/ai-chat-settings";

function makeSettings(model: AiChatSettings["providers"][number]["models"][number]): AiChatSettings {
  return {
    providers: [
      {
        id: "test",
        name: "Test",
        apiUrl: "https://example.com/v1",
        apiKey: "sk-test",
        protocol: "openai",
        enabled: true,
        models: [model],
      },
    ],
    selectedProviderId: "test",
    selectedModelId: model.id,
    temperature: 0.7,
    maxTokens: 4096,
    maxToolRounds: 7,
    currency: "USD",
    maxHistoryMessages: 0,
    maxToolResultChars: 8000,
    maxContextChars: 60000,
    streamTimeout: 30000,
    webSearch: {
      enabled: false,
      maxResults: 5,
      instances: [],
      imageSearchEnabled: true,
      maxImageResults: 3,
    },
  };
}

test("getModelRuntimeConfig inherits global tool rounds when model has no override", () => {
  const settings = makeSettings({ id: "model-a", maxToolRounds: 0 });

  const runtime = getModelRuntimeConfig(settings, "model-a");

  assertEqual(runtime.maxToolRounds, 7);
});

test("getModelRuntimeConfig preserves global unlimited tool rounds", () => {
  const settings = {
    ...makeSettings({ id: "model-c" }),
    maxToolRounds: 0,
  };

  const runtime = getModelRuntimeConfig(settings, "model-c");

  assertEqual(runtime.maxToolRounds, 0);
});

test("getModelRuntimeConfig respects explicit model tool round override", () => {
  const settings = makeSettings({
    id: "model-b",
    maxToolRounds: 0,
    maxToolRoundsOverride: true,
  });

  const runtime = getModelRuntimeConfig(settings, "model-b");

  assertEqual(runtime.maxToolRounds, 0);
});
