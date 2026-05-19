import type { ProviderModel } from "../../settings/ai-chat-settings";

const AUTH_ERROR_MESSAGE = "API Key无效";
const NETWORK_ERROR_MESSAGE = "连接失败";
const EMPTY_MODELS_MESSAGE = "未找到模型";
const INVALID_RESPONSE_MESSAGE = "模型列表解析失败";

function joinUrl(base: string, path: string): string {
  const b = base.replace(/\/+$/, "");
  const p = path.replace(/^\/+/, "");
  return `${b}/${p}`;
}

function buildModelsUrl(apiUrl: string): string {
  const trimmed = apiUrl.trim().replace(/\/+$/, "");
  const lower = trimmed.toLowerCase();

  if (lower.endsWith("/v1/models") || lower.endsWith("/models")) {
    return trimmed;
  }

  if (lower.endsWith("/v1")) {
    return joinUrl(trimmed, "/models");
  }

  return joinUrl(trimmed, "/v1/models");
}

async function readErrorMessage(res: Response): Promise<string> {
  const contentType = res.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("application/json")) {
      const json = await res.json();
      const msg =
        json?.error?.message ??
        json?.message ??
        (typeof json === "string" ? json : null);
      if (typeof msg === "string" && msg.trim()) return msg.trim();
      return JSON.stringify(json);
    }
  } catch {}

  try {
    const text = await res.text();
    if (text.trim()) return text.trim();
  } catch {}

  return `HTTP ${res.status}`;
}

function normalizeModels(payload: any): ProviderModel[] {
  const list =
    (Array.isArray(payload?.data) && payload.data) ||
    (Array.isArray(payload?.models) && payload.models) ||
    (Array.isArray(payload) && payload) ||
    [];

  const models: ProviderModel[] = [];
  const seen = new Set<string>();

  for (const item of list) {
    const id =
      (typeof item === "string" && item.trim()) ||
      (typeof item?.id === "string" && item.id.trim()) ||
      (typeof item?.model === "string" && item.model.trim()) ||
      (typeof item?.name === "string" && item.name.trim()) ||
      "";

    if (!id || seen.has(id)) continue;

    const label =
      (typeof item?.label === "string" && item.label.trim()) ||
      (typeof item?.name === "string" && item.name.trim()) ||
      id;

    models.push({ id, label });
    seen.add(id);
  }

  return models;
}

/**
 * 从 OpenAI 兼容 API 获取模型列表
 */
export async function fetchModelsFromApi(apiUrl: string, apiKey: string): Promise<ProviderModel[]> {
  const url = buildModelsUrl(apiUrl);

  let response: Response;
  try {
    response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
    });
  } catch (error) {
    throw new Error(NETWORK_ERROR_MESSAGE);
  }

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      throw new Error(AUTH_ERROR_MESSAGE);
    }
    const errorText = await readErrorMessage(response);
    throw new Error(`API 请求失败: ${errorText}`);
  }

  let payload: any;
  try {
    payload = await response.json();
  } catch (error) {
    throw new Error(INVALID_RESPONSE_MESSAGE);
  }

  const models = normalizeModels(payload);
  if (models.length === 0) {
    throw new Error(EMPTY_MODELS_MESSAGE);
  }

  return models;
}
