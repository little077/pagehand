import { describe, expect, it } from 'vitest';
import { DEBUG_DEFAULT_ROUTE, DEBUG_ROUTES, debugHash, parseDebugHash } from '@/lib/debug/routes';

describe('debug 路由', () => {
  it('打开调试页时进入总览', () => {
    expect(parseDebugHash('#/debug')).toMatchObject({
      open: true,
      route: { id: 'overview' },
    });
  });

  it('未注册的模块回退到总览', () => {
    expect(parseDebugHash('#/debug/not-a-module')).toMatchObject({
      open: true,
      route: { id: 'overview' },
    });
  });

  it('普通 hash 不打开调试页', () => {
    expect(parseDebugHash('#/chat')).toMatchObject({
      open: false,
      route: { id: 'overview' },
    });
    expect(parseDebugHash('')).toMatchObject({ open: false });
  });

  it('默认路由和 hash 生成保持一致', () => {
    expect(DEBUG_DEFAULT_ROUTE.id).toBe('overview');
    expect(debugHash(DEBUG_DEFAULT_ROUTE.id)).toBe('#/debug/overview');
  });

  it('调试模块列表里的 id 唯一', () => {
    const ids = DEBUG_ROUTES.map((route) => route.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
