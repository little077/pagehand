import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type Browser, browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import type { InteractionBridge } from '@/lib/agent/interactions';
import { evaluateToolGate } from '@/lib/agent/permission-gate';
import { clearToolTargets } from '@/lib/agent/tool-targets';
import { interactTool } from '@/lib/tools/interact';

function tab(overrides: Partial<Browser.tabs.Tab> = {}): Browser.tabs.Tab {
  return {
    id: 9,
    windowId: 1,
    active: true,
    title: 'Example',
    url: 'https://example.com/',
    ...overrides,
  } as Browser.tabs.Tab;
}

beforeEach(() => {
  fakeBrowser.reset();
  vi.restoreAllMocks();
  clearToolTargets();
});

describe('interact 工具边界', () => {
  it('没有活动标签页时返回可行动错误', async () => {
    const result = await interactTool.execute('call-1', { action: 'click', ref: 'e1' }, undefined);

    expect(result.isError).toBe(true);
    expect(result.details).toMatchObject({ code: 'no_tab' });
  });

  it('授权 A 后切到 B 执行写操作会阻止，并且不注入页面', async () => {
    const targetTab = tab({ id: 9, url: 'https://a.example/' });
    const otherTab = tab({ id: 10, url: 'https://b.example/' });
    vi.spyOn(browser.tabs, 'query')
      .mockResolvedValueOnce([targetTab] as never)
      .mockResolvedValueOnce([otherTab] as never);
    const executeScript = vi.spyOn(browser.scripting, 'executeScript');
    const bridge = {
      request: vi.fn().mockResolvedValue({ status: 'answered', always: false }),
    } as unknown as InteractionBridge;

    await evaluateToolGate(
      { toolName: 'interact', toolCallId: 'call-race', args: { action: 'click' } },
      bridge,
    );
    const result = await interactTool.execute(
      'call-race',
      { action: 'click', ref: 'e1' },
      undefined,
    );

    expect(result.isError).toBe(true);
    expect(result.details).toMatchObject({ code: 'permission_target_mismatch' });
    expect(executeScript).not.toHaveBeenCalled();
  });

  it('没有目标绑定的写操作失败关闭', async () => {
    vi.spyOn(browser.tabs, 'query').mockResolvedValue([tab()] as never);
    const executeScript = vi.spyOn(browser.scripting, 'executeScript');

    const result = await interactTool.execute(
      'call-unbound',
      { action: 'click', ref: 'e1' },
      undefined,
    );

    expect(result.details).toMatchObject({ code: 'permission_target_missing' });
    expect(executeScript).not.toHaveBeenCalled();
  });

  it('有副作用，禁止 replay', () => {
    expect(interactTool.replay).toBe('never');
    expect(interactTool.name).toBe('interact');
  });

  it('工具描述写清了限制和不做的场景', () => {
    expect(interactTool.description).toContain('跨域 iframe');
    expect(interactTool.description).toContain('密码');
    expect(interactTool.description).toContain('高风险');
    expect(interactTool.description).toContain('不要连续重复点击');
  });
});
