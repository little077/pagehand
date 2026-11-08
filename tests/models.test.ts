import { describe, expect, it } from 'vitest';
import { parseOpenAIModelIds } from '@/lib/config/models';

describe('parseOpenAIModelIds', () => {
  it('reads the OpenAI data[].id shape', () => {
    expect(
      parseOpenAIModelIds({
        object: 'list',
        data: [{ id: 'deepseek-chat' }, { id: 'deepseek-reasoner' }],
      }),
    ).toEqual(['deepseek-chat', 'deepseek-reasoner']);
  });

  it('accepts a bare array of ids or objects', () => {
    expect(parseOpenAIModelIds(['glm-4.6', { id: 'glm-4.5' }])).toEqual(['glm-4.6', 'glm-4.5']);
  });

  it('trims, drops blanks and deduplicates', () => {
    expect(
      parseOpenAIModelIds({
        data: [{ id: ' qwen3-max ' }, { id: 'qwen3-max' }, { id: '' }, { name: 'x' }, null],
      }),
    ).toEqual(['qwen3-max']);
  });

  it('returns an empty list for unknown payloads', () => {
    expect(parseOpenAIModelIds({ error: 'nope' })).toEqual([]);
    expect(parseOpenAIModelIds(null)).toEqual([]);
  });
});
