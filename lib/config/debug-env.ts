import type { ProviderConfig } from '@/lib/ipc/protocol';

interface RawDebugEnv {
  baseUrl?: string;
  apiKey?: string;
  modelId?: string;
  supportsImages?: string;
}

/** 纯函数，方便单测：三要素齐全且 Base URL 合法才返回配置。 */
export function parseDebugEnv(raw: RawDebugEnv | null, isDebug: boolean): ProviderConfig | null {
  if (!isDebug || !raw) return null;
  const baseUrl = (raw.baseUrl ?? '').trim().replace(/\/+$/, '');
  const apiKey = (raw.apiKey ?? '').trim();
  const modelId = (raw.modelId ?? '').trim();
  if (!/^https?:\/\//i.test(baseUrl) || !apiKey || !modelId) return null;
  return {
    presetId: 'custom',
    baseUrl,
    modelId,
    apiKey,
    supportsImages: /^(1|true|yes|on)$/i.test((raw.supportsImages ?? '').trim()),
  };
}

/**
 * 只在 DEV + MODE=debug 时读取由 wxt.config.ts 注入的 ENV 配置。
 * 生产构建里这个全局是 null，不会包含密钥。
 */
export function debugEnvConfig(): ProviderConfig | null {
  if (!import.meta.env.DEV || import.meta.env.MODE !== 'debug') return null;
  const raw = typeof __PAGEHAND_DEBUG_ENV__ === 'undefined' ? null : __PAGEHAND_DEBUG_ENV__;
  return parseDebugEnv(raw, true);
}
