import { describe, expect, it } from 'vitest';
import { parseDebugEnv } from '@/lib/config/debug-env';

const RAW = {
  baseUrl: ' https://api.example.com/v1/ ',
  apiKey: ' sk-test ',
  modelId: ' gpt-test ',
  supportsImages: 'true',
};

describe('Debug ENV 模型配置', () => {
  it('三要素齐全时生成配置，并规范化 Base URL', () => {
    expect(parseDebugEnv(RAW, true)).toEqual({
      presetId: 'custom',
      baseUrl: 'https://api.example.com/v1',
      apiKey: 'sk-test',
      modelId: 'gpt-test',
      supportsImages: true,
    });
  });

  it('缺少 Key / Base URL / 模型时回退（返回 null）', () => {
    expect(parseDebugEnv({ ...RAW, apiKey: ' ' }, true)).toBeNull();
    expect(parseDebugEnv({ ...RAW, baseUrl: '' }, true)).toBeNull();
    expect(parseDebugEnv({ ...RAW, modelId: '' }, true)).toBeNull();
    expect(parseDebugEnv(null, true)).toBeNull();
  });

  it('Base URL 不合法时不使用', () => {
    expect(parseDebugEnv({ ...RAW, baseUrl: 'api.example.com' }, true)).toBeNull();
  });

  it('非 debug 模式不使用 ENV', () => {
    expect(parseDebugEnv(RAW, false)).toBeNull();
  });

  it('图片能力默认 false，支持常见真值写法', () => {
    expect(parseDebugEnv({ ...RAW, supportsImages: '' }, true)?.supportsImages).toBe(false);
    expect(parseDebugEnv({ ...RAW, supportsImages: 'on' }, true)?.supportsImages).toBe(true);
    expect(parseDebugEnv({ ...RAW, supportsImages: '0' }, true)?.supportsImages).toBe(false);
  });
});
