import { normalizeBaseUrl } from './presets';

const MODEL_LIST_TIMEOUT_MS = 15_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

/** 解析 OpenAI `GET /models` 的响应，兼容直接返回字符串数组的端点。 */
export function parseOpenAIModelIds(payload: unknown): string[] {
  const entries = Array.isArray(payload)
    ? payload
    : isRecord(payload) && Array.isArray(payload.data)
      ? payload.data
      : [];

  const ids = entries.flatMap((entry) => {
    if (typeof entry === 'string') return [entry.trim()];
    if (isRecord(entry) && typeof entry.id === 'string') return [entry.id.trim()];
    return [];
  });

  return [...new Set(ids.filter(Boolean))];
}

export async function fetchOpenAIModels(baseUrl: string, apiKey: string): Promise<string[]> {
  let response: Response;
  try {
    response = await fetch(`${normalizeBaseUrl(baseUrl)}/models`, {
      headers: { Authorization: `Bearer ${apiKey.trim()}` },
      signal: AbortSignal.timeout(MODEL_LIST_TIMEOUT_MS),
    });
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === 'TimeoutError';
    throw new Error(
      timedOut
        ? '获取模型超时，请检查 Base URL 和网络。'
        : '无法连接该端点，请检查 Base URL 和网络。',
    );
  }

  if (response.status === 401 || response.status === 403) {
    throw new Error(`API Key 被拒绝（HTTP ${response.status}）。`);
  }
  if (response.status === 404) {
    throw new Error('该端点没有 /models 接口（HTTP 404），请检查 Base URL。');
  }
  if (!response.ok) {
    throw new Error(`获取模型失败（HTTP ${response.status}）。`);
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    throw new Error('模型列表不是合法 JSON。');
  }

  const models = parseOpenAIModelIds(payload);
  if (models.length === 0) {
    throw new Error('该端点没有返回可用模型。');
  }
  return models;
}
