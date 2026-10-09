import { test, assertEqual } from "./test-harness";
import { openAIChatCompletionsStream } from "../src/services/ai/openai-client";
import { getModelRuntimeConfig, getModelApiConfig, getCurrentApiConfig, validateCurrentConfig, type AiChatSettings } from "../src/settings/ai-chat-settings";

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

function withProviders(): AiChatSettings {
  const base = makeSettings({ id: "shared-model" });
  const p = (id: string, enabled: boolean) => ({
    id, name: id, apiUrl: `https://${id}.example.com/v1`, apiKey: `sk-${id}`,
    protocol: "openai" as const, enabled, models: [{ id: "shared-model" }],
  });
  return { ...base, providers: [p("off", false), p("on", true)], selectedProviderId: "off", selectedModelId: "shared-model" };
}

test("getModelApiConfig never resolves to a disabled provider", () => {
  const settings = withProviders();
  assertEqual(getModelApiConfig(settings, "shared-model").apiUrl, "https://on.example.com/v1");
  assertEqual(getModelApiConfig(settings, "shared-model", "off").apiUrl, "");
  assertEqual(getModelApiConfig(settings, "shared-model", "on").apiUrl, "https://on.example.com/v1");
});

test("getModelApiConfig returns empty config when the only match is disabled", () => {
  const settings = withProviders();
  settings.providers = settings.providers.filter((p) => p.id === "off");
  const cfg = getModelApiConfig(settings, "shared-model");
  assertEqual(cfg.apiUrl, "");
  assertEqual(cfg.apiKey, "");
});

test("disabled selected provider is treated as not configured", () => {
  const settings = withProviders();
  assertEqual(getCurrentApiConfig(settings).apiUrl, "");
  assertEqual(validateCurrentConfig(settings), "off 已停用，请换一个平台");
  settings.selectedProviderId = "on";
  assertEqual(getCurrentApiConfig(settings).apiUrl, "https://on.example.com/v1");
  assertEqual(validateCurrentConfig(settings), null);
});

test("model only on a disabled provider is not rerouted to the selected provider", () => {
  const settings = withProviders();
  settings.providers[1].models = [{ id: "other-model" }];
  settings.selectedProviderId = "on";
  assertEqual(getModelApiConfig(settings, "shared-model").apiUrl, "");
  assertEqual(getModelApiConfig(settings, "unknown-model").apiUrl, "https://on.example.com/v1");
});

test("chat stream refuses to send when resolved config has no url", async () => {
  const realFetch = globalThis.fetch;
  let fetched = 0;
  globalThis.fetch = (async () => { fetched++; throw new Error("should not fetch"); }) as typeof fetch;
  try {
    let error = "";
    try {
      for await (const _ of openAIChatCompletionsStream({ apiUrl: "", apiKey: "", model: "gpt-4o", messages: [{ role: "user", content: "hi" }] } as any)) { /* drain */ }
    } catch (e) { error = String(e); }
    assertEqual(fetched, 0);
    assertEqual(error.includes("未配置 API"), true);
  } finally {
    globalThis.fetch = realFetch;
  }
});
