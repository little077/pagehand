import { beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { CONFIG_STORAGE_KEY, loadConfig, maskApiKey, saveConfig } from '@/lib/config/storage';

beforeEach(() => {
  fakeBrowser.reset();
});

describe('config storage', () => {
  it('saves a normalized config and reads it back', async () => {
    const saved = await saveConfig({
      presetId: 'deepseek',
      baseUrl: ' https://api.deepseek.com/v1/ ',
      modelId: ' deepseek-v4-flash ',
      apiKey: ' sk-1234567890 ',
    });

    expect(saved).toEqual({
      presetId: 'deepseek',
      baseUrl: 'https://api.deepseek.com/v1',
      modelId: 'deepseek-v4-flash',
      apiKey: 'sk-1234567890',
    });
    expect(await loadConfig()).toEqual(saved);
    expect(await fakeBrowser.storage.local.get(CONFIG_STORAGE_KEY)).toHaveProperty(
      CONFIG_STORAGE_KEY,
    );
  });

  it('returns null for missing or malformed values', async () => {
    expect(await loadConfig()).toBeNull();
    await fakeBrowser.storage.local.set({ [CONFIG_STORAGE_KEY]: { baseUrl: 1 } });
    expect(await loadConfig()).toBeNull();
  });

  it('masks api keys for display', () => {
    expect(maskApiKey('sk-1234567890')).toBe('sk-1••••7890');
    expect(maskApiKey('short')).toBe('••••••••');
  });
});
