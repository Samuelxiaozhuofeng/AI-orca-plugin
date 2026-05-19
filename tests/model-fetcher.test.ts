import { test, assertEqual } from "./test-harness";
import { fetchModelsFromApi } from "../src/services/ai/model-fetcher";

function mockFetchOnce(handler: () => Promise<Response>) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => handler();
  return () => {
    globalThis.fetch = originalFetch;
  };
}

test("fetchModelsFromApi 解析标准 data 列表", async () => {
  const restore = mockFetchOnce(async () => {
    const payload = { data: [{ id: "gpt-4o" }, { id: "gpt-4o-mini", name: "GPT-4o Mini" }] };
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });

  try {
    const models = await fetchModelsFromApi("https://api.openai.com/v1", "sk-test");
    assertEqual(models.length, 2, "模型数量不正确");
    assertEqual(models[0].id, "gpt-4o");
    assertEqual(models[1].label, "GPT-4o Mini");
  } finally {
    restore();
  }
});

test("fetchModelsFromApi 支持 models 字符串列表", async () => {
  const restore = mockFetchOnce(async () => {
    const payload = { models: ["deepseek-chat", "deepseek-reasoner"] };
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });

  try {
    const models = await fetchModelsFromApi("https://api.deepseek.com", "sk-test");
    assertEqual(models.length, 2, "模型数量不正确");
    assertEqual(models[0].id, "deepseek-chat");
  } finally {
    restore();
  }
});

test("fetchModelsFromApi 401 返回 API Key 无效", async () => {
  const restore = mockFetchOnce(async () => {
    return new Response(JSON.stringify({ error: { message: "Unauthorized" } }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  });

  try {
    let errorMessage = "";
    try {
      await fetchModelsFromApi("https://api.openai.com/v1", "bad-key");
    } catch (error: any) {
      errorMessage = error?.message ?? "";
    }
    assertEqual(errorMessage, "API Key无效");
  } finally {
    restore();
  }
});

test("fetchModelsFromApi 网络错误返回连接失败", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("network down");
  };

  try {
    let errorMessage = "";
    try {
      await fetchModelsFromApi("https://api.openai.com/v1", "sk-test");
    } catch (error: any) {
      errorMessage = error?.message ?? "";
    }
    assertEqual(errorMessage, "连接失败");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("fetchModelsFromApi 空列表返回未找到模型", async () => {
  const restore = mockFetchOnce(async () => {
    const payload = { data: [] };
    return new Response(JSON.stringify(payload), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  });

  try {
    let errorMessage = "";
    try {
      await fetchModelsFromApi("https://api.openai.com/v1", "sk-test");
    } catch (error: any) {
      errorMessage = error?.message ?? "";
    }
    assertEqual(errorMessage, "未找到模型");
  } finally {
    restore();
  }
});
