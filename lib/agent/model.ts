import type { Model } from '@earendil-works/pi-ai';
import type { ProviderConfig } from '@/lib/ipc/protocol';

export function toPiModel(config: ProviderConfig): Model<'openai-completions'> {
  return {
    id: config.modelId,
    name: config.modelId,
    api: 'openai-completions',
    provider: config.presetId === 'custom' ? 'pagehand-custom' : config.presetId,
    baseUrl: config.baseUrl,
    input: ['text'],
    reasoning: false,
    contextWindow: 128_000,
    maxTokens: 8_192,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  };
}
