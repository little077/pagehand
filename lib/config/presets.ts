export interface ProviderPreset {
  id: string;
  label: string;
  baseUrl: string;
  modelId: string;
  keyHint: string;
}

const DEEPSEEK_PRESET: ProviderPreset = {
  id: 'deepseek',
  label: 'DeepSeek',
  baseUrl: 'https://api.deepseek.com/v1',
  modelId: 'deepseek-v4-flash',
  keyHint: 'sk-...',
};

export const DEFAULT_PROVIDER_PRESET = DEEPSEEK_PRESET;

export const PROVIDER_PRESETS: ProviderPreset[] = [
  DEEPSEEK_PRESET,
  {
    id: 'moonshot',
    label: '月之暗面 Kimi',
    baseUrl: 'https://api.moonshot.cn/v1',
    modelId: 'kimi-k2.5',
    keyHint: 'sk-...',
  },
  {
    id: 'zhipu',
    label: '智谱 GLM',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    modelId: 'glm-4.6',
    keyHint: '以 . 分隔的 API Key',
  },
  {
    id: 'dashscope',
    label: '阿里通义',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    modelId: 'qwen3-max',
    keyHint: 'sk-...',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
    modelId: 'gpt-5-mini',
    keyHint: 'sk-...',
  },
  {
    id: 'custom',
    label: '自定义',
    baseUrl: '',
    modelId: '',
    keyHint: '任意 OpenAI 兼容端点',
  },
];

export function findPreset(id: string): ProviderPreset | undefined {
  return PROVIDER_PRESETS.find((preset) => preset.id === id);
}

export function isLikelyApiKey(value: string): boolean {
  return value.trim().length >= 8;
}

export function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, '');
}
