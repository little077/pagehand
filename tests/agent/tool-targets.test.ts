import { beforeEach, describe, expect, it } from 'vitest';
import {
  assertToolTarget,
  authorizeToolTarget,
  clearToolTargets,
  releaseToolTarget,
  type ToolTarget,
} from '@/lib/agent/tool-targets';

const target: ToolTarget = {
  tabId: 7,
  url: 'https://example.com/a',
  origin: 'https://example.com',
};

beforeEach(clearToolTargets);

describe('工具目标绑定', () => {
  it('同一标签页的同源导航仍视为同一授权站点', () => {
    authorizeToolTarget('call-1', 'interact', target);

    expect(
      assertToolTarget('call-1', 'interact', {
        tabId: 7,
        url: 'https://example.com/b',
        origin: 'https://example.com',
      }),
    ).toBeNull();
  });

  it('没有 origin 的地址必须精确匹配', () => {
    const fileTarget: ToolTarget = {
      tabId: 8,
      url: 'file:///D:/reports/a.pdf',
      origin: null,
    };
    authorizeToolTarget('call-1', 'pdf', fileTarget);

    expect(
      assertToolTarget('call-1', 'pdf', { ...fileTarget, url: 'file:///D:/reports/b.pdf' }),
    ).toBe('permission_target_mismatch');
  });

  it('未授权调用和已释放调用都会失败', () => {
    expect(assertToolTarget('missing', 'interact', target)).toBe('permission_target_missing');

    authorizeToolTarget('call-1', 'interact', target);
    releaseToolTarget('call-1');
    expect(assertToolTarget('call-1', 'interact', target)).toBe('permission_target_missing');
  });

  it('可以一次清空本轮所有目标', () => {
    authorizeToolTarget('call-1', 'interact', target);
    authorizeToolTarget('call-2', 'pdf', target);
    clearToolTargets();

    expect(assertToolTarget('call-1', 'interact', target)).toBe('permission_target_missing');
    expect(assertToolTarget('call-2', 'pdf', target)).toBe('permission_target_missing');
  });
});
