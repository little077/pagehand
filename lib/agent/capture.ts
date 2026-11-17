import { browser } from 'wxt/browser';
import type { CaptureResult } from '@/lib/ipc/protocol';
import { type CaptureOverlayResult, captureOverlay } from '@/lib/page/capture-overlay';
import { transformScreenshot } from '@/lib/page/offscreen';
import { pixelCrop } from '@/lib/page/screenshot';

type InjectionDetails = {
  target: { tabId: number };
  func: (...args: unknown[]) => unknown;
  args?: unknown[];
};

type InjectionResult = { frameId: number; result?: unknown };

const injectScript = browser.scripting.executeScript as unknown as (
  details: InjectionDetails,
) => Promise<InjectionResult[]>;

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** 入口 B：用户从输入框触发截屏，后台注入提示层、截可见区域并按框选裁剪。 */
export async function captureForComposer(): Promise<CaptureResult> {
  const [tab] = await browser.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab?.id) return { ok: false, error: '找不到当前标签页，请先打开一个网页。' };
  if (!tab.url || !/^https?:/i.test(tab.url)) {
    return { ok: false, error: '当前标签页不是普通网页，无法截图。' };
  }

  let overlay: CaptureOverlayResult | undefined;
  try {
    const results = await injectScript({
      target: { tabId: tab.id },
      func: captureOverlay as unknown as (...args: unknown[]) => unknown,
    });
    overlay = results[0]?.result as CaptureOverlayResult | undefined;
  } catch (error) {
    return { ok: false, error: `无法在页面显示截图提示：${messageOf(error)}` };
  }

  if (!overlay) return { ok: false, error: '页面没有返回截图结果，请重试。' };
  if (overlay.cancelled) {
    return {
      ok: false,
      cancelled: true,
      reason: overlay.reason,
      error:
        overlay.reason === 'too_small'
          ? '拖动大于 12 × 12 的区域再松开。'
          : overlay.reason === 'timeout'
            ? '截图等待超时，请重试。'
            : '已取消截图。',
    };
  }

  let dataUrl: string;
  try {
    dataUrl =
      tab.windowId !== undefined
        ? await browser.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg', quality: 80 })
        : await browser.tabs.captureVisibleTab({ format: 'jpeg', quality: 80 });
  } catch (error) {
    return { ok: false, error: `截图失败：${messageOf(error)}` };
  }

  try {
    const result = await transformScreenshot(
      dataUrl,
      pixelCrop(overlay.rect, overlay.viewport, overlay.viewport.dpr),
      0.8,
      1600,
    );
    const comma = result.dataUrl.indexOf(',');
    const data = comma >= 0 ? result.dataUrl.slice(comma + 1) : '';
    if (!data) return { ok: false, error: '截图返回了空图片，请重试。' };
    return {
      ok: true,
      image: {
        id: crypto.randomUUID(),
        data,
        mimeType: 'image/jpeg',
        width: result.width,
        height: result.height,
        size: Math.round(data.length * 0.75),
      },
    };
  } catch (error) {
    return { ok: false, error: `截图处理失败：${messageOf(error)}` };
  }
}
