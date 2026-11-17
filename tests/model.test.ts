import { describe, expect, it } from 'vitest';
import { toPiModel } from '@/lib/agent/model';
import type { ProviderConfig } from '@/lib/ipc/protocol';

function config(overrides: Partial<ProviderConfig> = {}): ProviderConfig {
  return {
    presetId: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    modelId: 'gpt-5-mini',
    apiKey: 'sk-test',
    ...overrides,
  };
}

describe('toPiModel 图片能力', () => {
  it('未开启图片时只声明文本输入', () => {
    expect(toPiModel(config({ supportsImages: false })).input).toEqual(['text']);
    expect(toPiModel(config()).input).toEqual(['text']);
  });

  it('开启图片后声明文本和图片输入', () => {
    expect(toPiModel(config({ supportsImages: true })).input).toEqual(['text', 'image']);
  });
});
