import { afterEach, describe, expect, it } from 'vitest';
import { imageSupportEnabled, setImageSupport } from '@/lib/tools/runtime';

afterEach(() => setImageSupport(false));

describe('截图能力开关', () => {
  it('默认关闭', () => {
    expect(imageSupportEnabled()).toBe(false);
  });

  it('设置后立即生效', () => {
    setImageSupport(true);
    expect(imageSupportEnabled()).toBe(true);
    setImageSupport(false);
    expect(imageSupportEnabled()).toBe(false);
  });
});
