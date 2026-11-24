import { beforeEach, describe, expect, it, vi } from 'vitest';
import { authorizeToolTarget, clearToolTargets } from '@/lib/agent/tool-targets';
import { interactTool } from '@/lib/tools/interact';

const mocks = vi.hoisted(() => ({
  executeScript: vi.fn(),
  query: vi.fn(),
  get: vi.fn(),
  updatedListeners: new Set<(id: number, info: { status?: string; url?: string }) => void>(),
}));

vi.mock('wxt/browser', () => ({
  browser: {
    tabs: {
      query: mocks.query,
      get: mocks.get,
      onUpdated: {
        addListener: vi.fn((listener) => mocks.updatedListeners.add(listener)),
        removeListener: vi.fn((listener) => mocks.updatedListeners.delete(listener)),
      },
      onCreated: { addListener: vi.fn(), removeListener: vi.fn() },
      onRemoved: { addListener: vi.fn(), removeListener: vi.fn() },
    },
    scripting: { executeScript: mocks.executeScript },
  },
}));

const origin = 'https://a.example';
const otherOrigin = 'https://b.example';

function tab(url: string) {
  return { id: 9, windowId: 1, active: true, status: 'complete', title: 'Test', url };
}

function page(overrides: Record<string, unknown> = {}) {
  return {
    ok: true,
    code: null,
    message: '',
    action: 'click',
    phase: 'act',
    target: {
      ref: 'e1',
      tag: 'button',
      role: 'button',
      label: '普通按钮',
      selector: '#target',
    },
    state: null,
    changed: false,
    url_before: `${origin}/`,
    url_after: `${origin}/`,
    title_after: 'Test',
    frame_url: `${origin}/`,
    mutated: 0,
    by_coords: false,
    duration_ms: 1,
    warnings: [],
    details: {},
    ...overrides,
  };
}

beforeEach(() => {
  clearToolTargets();
  mocks.updatedListeners.clear();
  mocks.executeScript.mockReset();
  mocks.query.mockReset().mockResolvedValue([tab(`${origin}/`)]);
  mocks.get.mockReset().mockResolvedValue(tab(`${origin}/`));
});

describe('interact 授权竞态', () => {
  it('最后检查后跨站，权限错误不会被导航结果覆盖', async () => {
    authorizeToolTarget('call-race', 'interact', {
      tabId: 9,
      url: `${origin}/`,
      origin,
    });
    mocks.get
      .mockResolvedValueOnce(tab(`${origin}/`))
      .mockResolvedValueOnce(tab(`${otherOrigin}/`))
      .mockResolvedValueOnce(tab(`${otherOrigin}/`));
    mocks.executeScript
      .mockResolvedValueOnce([{ frameId: 0, result: page({ phase: 'probe' }) }])
      .mockResolvedValueOnce([
        {
          frameId: 0,
          result: page({
            ok: false,
            code: 'permission_target_mismatch',
            message: '授权后的页面已经切换到其他网站',
            url_after: `${otherOrigin}/`,
          }),
        },
      ]);

    const result = await interactTool.execute(
      'call-race',
      { action: 'click', ref: 'e1' },
      undefined,
    );

    expect(result.isError).toBe(true);
    expect(result.details).toMatchObject({ code: 'permission_target_mismatch' });
  });

  it('导航事件先到时，后返回的权限错误仍会保留', async () => {
    authorizeToolTarget('call-nav-first', 'interact', {
      tabId: 9,
      url: `${origin}/`,
      origin,
    });
    mocks.get
      .mockResolvedValueOnce(tab(`${origin}/`))
      .mockResolvedValueOnce(tab(`${otherOrigin}/`))
      .mockResolvedValueOnce(tab(`${otherOrigin}/`));
    mocks.executeScript
      .mockResolvedValueOnce([{ frameId: 0, result: page({ phase: 'probe' }) }])
      .mockImplementationOnce(() => {
        for (const listener of mocks.updatedListeners) listener(9, { status: 'loading' });
        return new Promise((resolve) => {
          setTimeout(() => {
            resolve([
              {
                frameId: 0,
                result: page({
                  ok: false,
                  code: 'permission_target_mismatch',
                  message: '授权后的页面已经切换到其他网站',
                  url_after: `${otherOrigin}/`,
                }),
              },
            ]);
          }, 0);
        });
      });

    const result = await interactTool.execute(
      'call-nav-first',
      { action: 'click', ref: 'e1' },
      undefined,
    );

    expect(result.isError).toBe(true);
    expect(result.details).toMatchObject({ code: 'permission_target_mismatch' });
  });

  it('滚到底的每一轮都携带已确认目标 ref', async () => {
    mocks.executeScript
      .mockResolvedValueOnce([{ frameId: 0, result: page({ phase: 'probe', action: 'scroll' }) }])
      .mockResolvedValueOnce([
        {
          frameId: 0,
          result: page({
            action: 'scroll',
            changed: true,
            details: {
              at_bottom: true,
              grew: true,
              loading: false,
              end_marker: null,
              scroll_height: 2000,
              before_height: 1000,
              waited_ms: 10,
            },
          }),
        },
      ])
      .mockResolvedValueOnce([
        {
          frameId: 0,
          result: page({
            action: 'scroll',
            details: {
              at_bottom: true,
              grew: false,
              loading: false,
              end_marker: '没有更多',
              scroll_height: 2000,
              before_height: 1000,
              waited_ms: 10,
            },
          }),
        },
      ]);

    const result = await interactTool.execute(
      'call-scroll',
      { action: 'scroll', selector: '#target', to: 'bottom', max_rounds: 3 },
      undefined,
    );

    expect(result.isError).not.toBe(true);
    expect(mocks.executeScript).toHaveBeenCalledTimes(3);
    expect(mocks.executeScript.mock.calls[1]?.[0].args[0].expectedTargetRef).toBe('e1');
    expect(mocks.executeScript.mock.calls[2]?.[0].args[0].expectedTargetRef).toBe('e1');
  });
});
