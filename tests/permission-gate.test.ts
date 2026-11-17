import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type Browser, browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { TOOL_GATES } from '@/lib/agent/permission-gate';

const readTabGate = TOOL_GATES.find((gate) => gate.toolName === 'read_tab');

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
