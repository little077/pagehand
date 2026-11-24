import { beforeEach, describe, expect, it, vi } from 'vitest';
import { type Browser, browser } from 'wxt/browser';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import type { InteractionBridge } from '@/lib/agent/interactions';
import { evaluateToolGate } from '@/lib/agent/permission-gate';
import { clearToolTargets } from '@/lib/agent/tool-targets';
import { getPdfInfo } from '@/lib/page/offscreen';
import { pdfTool } from '@/lib/tools/pdf';

vi.mock('@/lib/page/offscreen', () => ({
  getPdfInfo: vi.fn(),
  getPdfText: vi.fn(),
  searchPdf: vi.fn(),
}));

function tab(overrides: Partial<Browser.tabs.Tab> = {}): Browser.tabs.Tab {
  return {
    id: 5,
    windowId: 1,
    active: false,
    title: 'guide.pdf',
    url: 'https://a.example/guide.pdf',
    ...overrides,
  } as Browser.tabs.Tab;
}

beforeEach(() => {
  fakeBrowser.reset();
  vi.restoreAllMocks();
  vi.mocked(getPdfInfo).mockReset();
  clearToolTargets();
});

describe('pdf 目标绑定', () => {
  it('当前 PDF 免授权，显式 tab_id 仍绑定后执行', async () => {
    vi.spyOn(browser.tabs, 'get').mockResolvedValue(tab({ active: true }) as never);
    vi.spyOn(browser.windows, 'getLastFocused').mockResolvedValue({ id: 1 } as never);
    vi.mocked(getPdfInfo).mockResolvedValue({
      pageCount: 2,
      outline: [],
      outlineTruncated: false,
    });
    const bridge = { request: vi.fn() } as unknown as InteractionBridge;

    await evaluateToolGate(
      { toolName: 'pdf', toolCallId: 'call-current', args: { action: 'info', tab_id: 5 } },
      bridge,
    );
    const result = await pdfTool.execute('call-current', { action: 'info', tab_id: 5 }, undefined);

    expect(bridge.request).not.toHaveBeenCalled();
    expect(result.isError).not.toBe(true);
    expect(getPdfInfo).toHaveBeenCalledWith('https://a.example/guide.pdf');
  });

  it('后台 PDF 授权后变了站点会阻止读取', async () => {
    vi.spyOn(browser.tabs, 'get')
      .mockResolvedValueOnce(tab() as never)
      .mockResolvedValueOnce(tab({ url: 'https://b.example/guide.pdf' }) as never);
    vi.spyOn(browser.windows, 'getLastFocused').mockResolvedValue({ id: 1 } as never);
    const bridge = {
      request: vi.fn().mockResolvedValue({ status: 'answered', always: false }),
    } as unknown as InteractionBridge;

    await evaluateToolGate(
      { toolName: 'pdf', toolCallId: 'call-race', args: { action: 'info', tab_id: 5 } },
      bridge,
    );
    const result = await pdfTool.execute('call-race', { action: 'info', tab_id: 5 }, undefined);

    expect(result.isError).toBe(true);
    expect(result.details).toMatchObject({ code: 'permission_target_mismatch' });
    expect(getPdfInfo).not.toHaveBeenCalled();
  });
});
