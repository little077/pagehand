import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type Browser, browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { TOOL_GATES } from '@/lib/agent/permission-gate';

const readTabGate = TOOL_GATES.find((gate) => gate.toolName === 'read_tab');
const interactGate = TOOL_GATES.find((gate) => gate.toolName === 'interact');

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

function mockFocusedWindow(id: number): void {
  vi.spyOn(browser.windows, 'getLastFocused').mockResolvedValue({ id } as never);
}

describe('read_tab 授权门禁', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    vi.restoreAllMocks();
  });

  it('does not ask when reading the focused window active tab', async () => {
    mockTab(tab({ active: true, windowId: 1 }));
    mockFocusedWindow(1);

    expect(await readTabGate?.check({ tab_id: 5 })).toBeNull();
  });

  it('asks when the tab is active but its window is not focused', async () => {
    mockTab(tab({ active: true, windowId: 2 }));
    mockFocusedWindow(1);

    expect(await readTabGate?.check({ tab_id: 5 })).not.toBeNull();
  });

  it('asks when the tab is a background tab', async () => {
    mockTab(tab({ active: false }));
    mockFocusedWindow(1);

    expect(await readTabGate?.check({ tab_id: 5 })).not.toBeNull();
  });

  it('does not ask when no tab_id is given', async () => {
    expect(await readTabGate?.check({})).toBeNull();
  });
});

describe('interact 授权门禁', () => {
  beforeEach(() => {
    fakeBrowser.reset();
    vi.restoreAllMocks();
  });

  function mockActiveTab(value: Browser.tabs.Tab): void {
    vi.spyOn(browser.tabs, 'query').mockResolvedValue([value] as never);
  }

  it('写操作按站点询问，scroll / wait_for 不打扰', async () => {
    mockActiveTab(tab({ active: true, id: 9 }));

    const click = await interactGate?.check({ action: 'click' });
    expect(click?.grant).toEqual({ origin: 'https://www.baidu.com', toolName: 'interact' });
    expect(click?.reason).toContain('代你点击或填写');

    expect(await interactGate?.check({ action: 'scroll' })).toBeNull();
    expect(await interactGate?.check({ action: 'wait_for' })).toBeNull();
  });

  it('没有活动标签页或不是普通网页时不抢话', async () => {
    vi.spyOn(browser.tabs, 'query').mockResolvedValue([] as never);
    expect(await interactGate?.check({ action: 'click' })).toBeNull();

    mockActiveTab(tab({ active: true, id: 10, url: 'chrome://settings' }));
    expect(await interactGate?.check({ action: 'click' })).toBeNull();
  });
});
