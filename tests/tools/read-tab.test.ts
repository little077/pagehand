import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type Browser, browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import type { InteractionBridge } from '@/lib/agent/interactions';
import { evaluateToolGate } from '@/lib/agent/permission-gate';
import { clearToolTargets } from '@/lib/agent/tool-targets';
import { type ReadOutcome, readPage } from '@/lib/page/reader';
import { readTabTool } from '@/lib/tools/read-tab';

vi.mock('@/lib/page/reader', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/page/reader')>();
  return { ...actual, readPage: vi.fn() };
});

function tab(overrides: Partial<Browser.tabs.Tab> = {}): Browser.tabs.Tab {
  return {
    id: 5,
    windowId: 1,
    active: false,
    title: 'A',
    url: 'https://a.example/',
    ...overrides,
  } as Browser.tabs.Tab;
}

const readOutcome: ReadOutcome = {
  tabId: 5,
  title: 'A',
  url: 'https://a.example/',
  mode: 'markdown',
  selector: null,
  frameId: 0,
  content: 'hello',
  totalChars: 5,
  truncated: false,
  frames: [],
};

beforeEach(() => {
  fakeBrowser.reset();
  vi.restoreAllMocks();
  vi.mocked(readPage).mockReset();
  clearToolTargets();
});

describe('read_tab 目标绑定', () => {
  it('当前标签页免授权，显式 tab_id 仍绑定后执行', async () => {
    const current = tab({ active: true });
    vi.spyOn(browser.tabs, 'get').mockResolvedValue(current as never);
    vi.spyOn(browser.windows, 'getLastFocused').mockResolvedValue({ id: 1 } as never);
    vi.mocked(readPage).mockImplementation(async (request) => {
      request.validateTarget?.(current);
      return readOutcome;
    });
    const bridge = { request: vi.fn() } as unknown as InteractionBridge;

    await evaluateToolGate(
      { toolName: 'read_tab', toolCallId: 'call-current', args: { tab_id: 5 } },
      bridge,
    );
    const result = await readTabTool.execute('call-current', { tab_id: 5 }, undefined);

    expect(bridge.request).not.toHaveBeenCalled();
    expect(result.isError).not.toBe(true);
    expect(readPage).toHaveBeenCalledOnce();
  });

  it('后台标签页授权后变了站点会阻止读取', async () => {
    vi.spyOn(browser.tabs, 'get')
      .mockResolvedValueOnce(tab() as never)
      .mockResolvedValueOnce(tab({ url: 'https://b.example/' }) as never);
    vi.spyOn(browser.windows, 'getLastFocused').mockResolvedValue({ id: 1 } as never);
    vi.mocked(readPage).mockImplementation(async (request) => {
      request.validateTarget?.(tab({ url: 'https://b.example/' }));
      return readOutcome;
    });
    const bridge = {
      request: vi.fn().mockResolvedValue({ status: 'answered', always: false }),
    } as unknown as InteractionBridge;

    await evaluateToolGate(
      { toolName: 'read_tab', toolCallId: 'call-race', args: { tab_id: 5 } },
      bridge,
    );
    const result = await readTabTool.execute('call-race', { tab_id: 5 }, undefined);

    expect(result.isError).toBe(true);
    expect(result.details).toMatchObject({ code: 'permission_target_mismatch' });
    expect(readPage).toHaveBeenCalledOnce();
  });

  it('读取器解析目标时再次核对，拦住检查后的同标签页换站', async () => {
    const targetTab = tab();
    vi.spyOn(browser.tabs, 'get').mockResolvedValue(targetTab as never);
    vi.spyOn(browser.windows, 'getLastFocused').mockResolvedValue({ id: 1 } as never);
    vi.mocked(readPage).mockImplementation(async (request) => {
      request.validateTarget?.(tab({ url: 'https://b.example/' }));
      return readOutcome;
    });
    const bridge = {
      request: vi.fn().mockResolvedValue({ status: 'answered', always: false }),
    } as unknown as InteractionBridge;

    await evaluateToolGate(
      { toolName: 'read_tab', toolCallId: 'call-late-race', args: { tab_id: 5 } },
      bridge,
    );
    const result = await readTabTool.execute('call-late-race', { tab_id: 5 }, undefined);

    expect(result.isError).toBe(true);
    expect(result.details).toMatchObject({ code: 'permission_target_mismatch' });
    expect(readPage).toHaveBeenCalledOnce();
  });
});
