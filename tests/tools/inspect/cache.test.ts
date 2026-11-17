import { describe, expect, it } from 'vitest';
import {
  INSPECT_CACHE_TTL_MS,
  inspectCacheKey,
  shouldReuseInspect,
} from '@/lib/tools/inspect-cache';

const options = {
  selector: '#form',
  text: null,
  role: null,
  kind: null,
  inputType: null,
  includeHidden: false,
  limit: 40,
  frameId: 0,
};

describe('inspect 重复调用护栏', () => {
  it('参数不同会生成不同的缓存键', () => {
    const base = inspectCacheKey(7, options);

    expect(inspectCacheKey(7, { ...options, role: 'textbox' })).not.toBe(base);
    expect(inspectCacheKey(7, { ...options, kind: 'input' })).not.toBe(base);
    expect(inspectCacheKey(7, { ...options, inputType: 'search' })).not.toBe(base);
    expect(inspectCacheKey(7, { ...options, includeHidden: true })).not.toBe(base);
    expect(inspectCacheKey(8, options)).not.toBe(base);
  });

  it('参数和页面指纹都相同，且在有效期内，复用上一次结果', () => {
    const key = inspectCacheKey(7, options);
    const previous = { key, fingerprint: '5:abc', at: 1_000 };

    expect(shouldReuseInspect(previous, key, '5:abc', 1_500)).toBe(true);
  });

  it('参数不同、指纹不同、过期或没有历史时不复用', () => {
    const key = inspectCacheKey(7, options);
    const previous = { key, fingerprint: '5:abc', at: 1_000 };

    expect(shouldReuseInspect(undefined, key, '5:abc', 1_500)).toBe(false);
    expect(shouldReuseInspect(previous, `${key}-other`, '5:abc', 1_500)).toBe(false);
    expect(shouldReuseInspect(previous, key, '5:def', 1_500)).toBe(false);
    expect(shouldReuseInspect(previous, key, '5:abc', 1_000 + INSPECT_CACHE_TTL_MS + 1)).toBe(
      false,
    );
  });

  it('时钟回拨时不复用，避免误判页面未变化', () => {
    const key = inspectCacheKey(7, options);
    const previous = { key, fingerprint: '5:abc', at: 2_000 };

    expect(shouldReuseInspect(previous, key, '5:abc', 1_000)).toBe(false);
  });
});
