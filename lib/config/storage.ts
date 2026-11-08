import { browser } from 'wxt/browser';
import type { ProviderConfig } from '@/lib/ipc/protocol';

export const CONFIG_STORAGE_KEY = 'pagehand.provider.v1';

function isProviderConfig(value: unknown): value is ProviderConfig {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.presetId === 'string' &&
    typeof record.baseUrl === 'string' &&
    typeof record.modelId === 'string' &&
    typeof record.apiKey === 'string'
  );
}

export async function loadConfig(): Promise<ProviderConfig | null> {
  const stored = await browser.storage.local.get(CONFIG_STORAGE_KEY);
  const value = stored[CONFIG_STORAGE_KEY];
  return isProviderConfig(value) ? value : null;
}

export async function saveConfig(config: ProviderConfig): Promise<ProviderConfig> {
  const normalized: ProviderConfig = {
    presetId: config.presetId,
    baseUrl: config.baseUrl.trim().replace(/\/+$/, ''),
    modelId: config.modelId.trim(),
    apiKey: config.apiKey.trim(),
  };
  await browser.storage.local.set({ [CONFIG_STORAGE_KEY]: normalized });
  return normalized;
}

export function maskApiKey(apiKey: string): string {
  if (apiKey.length <= 8) return '••••••••';
  return `${apiKey.slice(0, 4)}••••${apiKey.slice(-4)}`;
}
