import { beforeEach, describe, expect, it } from 'vitest';
import { cancelPageInteraction, runInteraction } from '@/lib/page/interact';
import { mount, resetPage } from './support';

beforeEach(resetPage);

describe('页面注入函数可序列化', () => {
  it('runInteraction 脱离模块作用域也能执行', async () => {
    mount('<input id="q" />');

    // executeScript 用的是函数源码，复制到独立作用域后仍必须能跑。
    const clone = new Function(`return (${runInteraction.toString()})`)() as typeof runInteraction;
    const result = await clone({
      phase: 'probe',
      action: 'fill',
      selector: '#q',
      text: '键盘',
    });

    expect(result.ok).toBe(true);
    expect(result.target?.selector).toContain('#q');
  });

  it('cancelPageInteraction 能独立设置取消标记', () => {
    const clone = new Function(
      `return (${cancelPageInteraction.toString()})`,
    )() as typeof cancelPageInteraction;
    (globalThis as unknown as Record<string, unknown>).__pagehandRefStoreV1 = {
      cancelled: false,
    };

    clone();

    const store = (globalThis as unknown as Record<string, unknown>).__pagehandRefStoreV1 as {
      cancelled: boolean;
    };
    expect(store.cancelled).toBe(true);
  });
});
