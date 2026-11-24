import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type Browser, browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import type { InteractionBridge } from '@/lib/agent/interactions';
import { evaluateToolGate, TOOL_GATES } from '@/lib/agent/permission-gate';
import {
  assertToolTarget,
  clearToolTargets,
  type ToolTarget,
  toolTargetOfTab,
} from '@/lib/agent/tool-targets';

function tab(overrides: Partial<Browser.tabs.Tab>): Browser.tabs.Tab {
  return {
    id: 5,
    windowId: 1,
    active: false,
    title: '百度一下，你就知道',
    url: 'https://www.baidu.com/',
    ...overrides,
  } as Browser.tabs.Tab;
}

function mockTab(value: Browser.tabs.Tab): void {
  vi.spyOn(browser.tabs, 'get').mockResolvedValue(value as never);
}

function mockActiveTab(value: Browser.tabs.Tab): void {
  vi.spyOn(browser.tabs, 'query').mockResolvedValue([value] as never);
}

function targetOf(value: Browser.tabs.Tab): ToolTarget {
  const target = toolTargetOfTab(value);
  if (!target) throw new Error('expected a tool target');
  return target;
}

function mockFocusedWindow(id: number): void {
  vi.spyOn(browser.windows, 'getLastFocused').mockResolvedValue({ id } as never);
}

async function resolveGate(toolName: string, args: unknown) {
  const gate = TOOL_GATES.find((candidate) => candidate.toolName === toolName);
  if (!gate) throw new Error(`missing gate: ${toolName}`);
  return gate.resolve(args);
}

function bridgeAnswering(status: 'answered' | 'denied') {
  const request = vi.fn().mockResolvedValue({ status, always: false });
  return { bridge: { request } as unknown as InteractionBridge, request };
}

beforeEach(() => {
  fakeBrowser.reset();
  vi.restoreAllMocks();
  clearToolTargets();
});

describe('read_tab 授权门禁', () => {
  it('读取焦点窗口的活动标签页时不提问，但绑定目标', async () => {
    const current = tab({ active: true, windowId: 1 });
    mockTab(current);
    mockFocusedWindow(1);

    const resolution = await resolveGate('read_tab', { tab_id: 5 });
    expect(resolution.requirement).toBeNull();
    expect(resolution.target).toEqual(toolTargetOfTab(current));
  });

  it('标签页所在窗口不是焦点窗口时会提问', async () => {
    mockTab(tab({ active: true, windowId: 2 }));
    mockFocusedWindow(1);

    const resolution = await resolveGate('read_tab', { tab_id: 5 });
    expect(resolution.requirement?.grant).toEqual({
      origin: 'https://www.baidu.com',
      toolName: 'read_tab',
    });
    expect(resolution.target?.tabId).toBe(5);
  });

  it('后台标签页会提问', async () => {
    mockTab(tab({ active: false }));
    mockFocusedWindow(1);

    expect((await resolveGate('read_tab', { tab_id: 5 })).requirement).not.toBeNull();
  });

  it('不带 tab_id 时不绑定后台读取目标', async () => {
    expect(await resolveGate('read_tab', {})).toEqual({ requirement: null, target: null });
  });
});

describe('pdf 授权门禁', () => {
  it('读取当前活动 PDF 时不提问，但绑定显式 tab_id', async () => {
    const current = tab({ active: true, url: 'https://example.com/guide.pdf' });
    mockTab(current);
    mockFocusedWindow(1);

    const resolution = await resolveGate('pdf', { action: 'info', tab_id: 5 });
    expect(resolution.requirement).toBeNull();
    expect(resolution.target).toEqual(toolTargetOfTab(current));
  });

  it('读取后台 PDF 时按站点提问', async () => {
    mockTab(tab({ active: false, url: 'https://example.com/guide.pdf' }));
    mockFocusedWindow(1);

    const resolution = await resolveGate('pdf', { action: 'read', tab_id: 5 });
    expect(resolution.requirement?.grant).toEqual({
      origin: 'https://example.com',
      toolName: 'pdf',
    });
    expect(resolution.target?.url).toBe('https://example.com/guide.pdf');
  });

  it('省略 tab_id 读取当前 PDF 时不提问', async () => {
    expect(await resolveGate('pdf', { action: 'info' })).toEqual({
      requirement: null,
      target: null,
    });
  });
});

describe('interact 授权门禁', () => {
  it('写操作按站点询问并绑定当前标签页，scroll / wait_for 不打扰', async () => {
    const current = tab({ active: true, id: 9 });
    mockActiveTab(current);

    const click = await resolveGate('interact', { action: 'click' });
    expect(click.requirement?.grant).toEqual({
      origin: 'https://www.baidu.com',
      toolName: 'interact',
    });
    expect(click.requirement?.reason).toContain('代你点击或填写');
    expect(click.target).toEqual(toolTargetOfTab(current));

    expect(await resolveGate('interact', { action: 'scroll' })).toEqual({
      requirement: null,
      target: null,
    });
    expect(await resolveGate('interact', { action: 'wait_for' })).toEqual({
      requirement: null,
      target: null,
    });
  });

  it('没有活动标签页或不是普通网页时不抢话', async () => {
    vi.spyOn(browser.tabs, 'query').mockResolvedValue([] as never);
    expect(await resolveGate('interact', { action: 'click' })).toEqual({
      requirement: null,
      target: null,
    });

    mockActiveTab(tab({ active: true, id: 10, url: 'chrome://settings' }));
    expect(await resolveGate('interact', { action: 'click' })).toEqual({
      requirement: null,
      target: null,
    });
  });
});

describe('授权目标绑定', () => {
  it('批准后只允许同一标签页的同一站点，换站或换工具都会失败', async () => {
    const targetTab = tab({ active: true, id: 9 });
    mockActiveTab(targetTab);
    const { bridge, request } = bridgeAnswering('answered');

    await evaluateToolGate(
      { toolName: 'interact', toolCallId: 'call-1', args: { action: 'click' } },
      bridge,
    );

    expect(request).toHaveBeenCalledOnce();
    expect(assertToolTarget('call-1', 'interact', targetOf(targetTab))).toBeNull();
    expect(assertToolTarget('call-1', 'interact', targetOf(tab({ active: true, id: 10 })))).toBe(
      'permission_target_mismatch',
    );
    expect(
      assertToolTarget(
        'call-1',
        'interact',
        targetOf(tab({ active: true, id: 9, url: 'https://example.com/' })),
      ),
    ).toBe('permission_target_mismatch');
    expect(assertToolTarget('call-1', 'read_tab', targetOf(targetTab))).toBe(
      'permission_target_missing',
    );
  });

  it('用户拒绝后不会留下可执行的目标绑定', async () => {
    mockActiveTab(tab({ active: true, id: 9 }));
    const { bridge } = bridgeAnswering('denied');

    const result = await evaluateToolGate(
      { toolName: 'interact', toolCallId: 'call-denied', args: { action: 'click' } },
      bridge,
    );

    expect(result).toMatchObject({ block: true, terminate: true });
    expect(
      assertToolTarget('call-denied', 'interact', targetOf(tab({ active: true, id: 9 }))),
    ).toBe('permission_target_missing');
  });
});
