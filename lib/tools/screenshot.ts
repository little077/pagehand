import type { AgentTool } from '@earendil-works/pi-agent-core';
import { Type } from 'typebox';
import { browser } from 'wxt/browser';
import { cropScreenshot } from '@/lib/page/offscreen';
import { normalizeSelector } from '@/lib/page/reader';
import {
  measureScreenshotTarget,
  measureScreenshotViewport,
  pixelCrop,
  type ScreenshotMeasure,
  type ScreenshotViewport,
} from '@/lib/page/screenshot';
import { errorMessage } from './errors';
import { imageSupportEnabled } from './runtime';
import {
  formatScreenshotForModel,
  type ScreenshotDetails,
  type ScreenshotErrorCode,
  type ScreenshotMeta,
} from './screenshot-format';

const parameters = Type.Object({
  selector: Type.Optional(
    Type.String({
      description:
        '只截页面里匹配这个 CSS 选择器的元素，省略则截当前可见区域。元素必须已经在当前视口内；不在视口内会明确报错。可以用 inspect 返回的 selector。',
      maxLength: 500,
    }),
  ),
});

type InjectionDetails = {
  target: { tabId: number };
  func: (...args: unknown[]) => unknown;
  args?: unknown[];
};

type InjectionResult = { frameId: number; result?: unknown };

const injectScript = browser.scripting.executeScript as unknown as (
  details: InjectionDetails,
) => Promise<InjectionResult[]>;

function errorResult(
  message: string,
  code: ScreenshotErrorCode,
): { isError: true; content: { type: 'text'; text: string }[]; details: ScreenshotDetails } {
  return {
    isError: true,
    content: [{ type: 'text', text: message }],
    details: { error: message, code },
  };
}

function base64Of(dataUrl: string): string | null {
  const comma = dataUrl.indexOf(',');
  if (comma < 0) return null;
  const base64 = dataUrl.slice(comma + 1);
  return base64 || null;
}

export const screenshotTool: AgentTool<typeof parameters, ScreenshotDetails> = {
  name: 'screenshot',
  label: '截图',
  description:
    '截取当前标签页的可见画面，用来回答“画面上是什么”这类问题：Canvas/WebGL 图表、图片里的文字、验证码、视频帧、布局错位、遮挡或渲染问题。' +
    '默认截当前可见区域；传 selector 只截某个元素。截图只包含当前视口，不滚动、不拼接整页；元素不在视口内会报错。' +
    '不要用它找按钮或读正文：找元素用 inspect，读文字用 read_page。' +
    '只有用户在设置里开启了“该模型支持图片输入”才能用；不支持时工具会明确报错，不要反复重试。',
  parameters,
  replay: 'safe',
  async execute(_toolCallId, params, signal) {
    if (signal?.aborted) {
      return errorResult('截图已取消。', 'unknown');
    }
    if (!imageSupportEnabled()) {
      return errorResult(
        '当前模型没有开启图片输入。请在设置里打开“该模型支持图片输入”，或换一个支持视觉的模型后再试。',
        'images_unsupported',
      );
    }

    const [tab] = await browser.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab?.id) {
      return errorResult('找不到当前标签页，请先打开一个网页再试。', 'no_tab');
    }
    if (!tab.url || !/^https?:/i.test(tab.url)) {
      return errorResult(
        '当前标签页不是普通网页（可能是浏览器内部页、扩展商店或本地文件），Pagehand 无法截图。',
        'unsupported_scheme',
      );
    }

    const selector = normalizeSelector(params.selector);
    let viewport: ScreenshotViewport | null = null;
    let measure: ScreenshotMeasure | null = null;

    if (selector) {
      let results: InjectionResult[];
      try {
        results = await injectScript({
          target: { tabId: tab.id },
          func: measureScreenshotTarget as unknown as (...args: unknown[]) => unknown,
          args: [selector],
        });
      } catch (error) {
        return errorResult(
          `无法读取页面元素位置：${errorMessage(error)}。可能这个页面不允许扩展读取，或页面还在加载。`,
          'capture_failed',
        );
      }
      const measured = results[0]?.result as ScreenshotMeasure | undefined;
      if (!measured) {
        return errorResult('页面没有返回元素位置，可能还在加载。', 'capture_failed');
      }
      measure = measured;
      viewport = measured.viewport;
      if (measure.error === 'invalid_selector') {
        return errorResult(`选择器「${selector}」语法无效，请改正后重试。`, 'selector_miss');
      }
      if (measure.error === 'zero_size') {
        return errorResult(`元素「${selector}」的尺寸为 0，可能还没渲染出来。`, 'selector_size');
      }
      if (!measure.found) {
        return errorResult(
          `页面里找不到元素「${selector}」。先用 inspect 找到目标元素，再传它的 selector。`,
          'selector_miss',
        );
      }
      if (!measure.in_viewport || !measure.rect) {
        return errorResult(
          `元素「${selector}」不在当前可见区域。截图只能截当前视口；请先让用户滚动到它可见，或改截整页可见区域。`,
          'selector_offscreen',
        );
      }
    } else {
      let results: InjectionResult[];
      try {
        results = await injectScript({
          target: { tabId: tab.id },
          func: measureScreenshotViewport as unknown as (...args: unknown[]) => unknown,
        });
      } catch (error) {
        return errorResult(
          `无法读取页面视口：${errorMessage(error)}。可能这个页面不允许扩展读取，或页面还在加载。`,
          'capture_failed',
        );
      }
      const measured = results[0]?.result as ScreenshotViewport | undefined;
      if (!measured) {
        return errorResult('页面没有返回视口信息，可能还在加载。', 'capture_failed');
      }
      viewport = measured;
    }

    let dataUrl: string;
    try {
      dataUrl =
        tab.windowId !== undefined
          ? await browser.tabs.captureVisibleTab(tab.windowId, { format: 'jpeg', quality: 80 })
          : await browser.tabs.captureVisibleTab({ format: 'jpeg', quality: 80 });
    } catch (error) {
      return errorResult(`截图失败：${errorMessage(error)}`, 'capture_failed');
    }

    let finalDataUrl = dataUrl;
    let imageWidth = Math.round(viewport.width * viewport.dpr);
    let imageHeight = Math.round(viewport.height * viewport.dpr);
    let clipped = false;

    if (selector && measure?.rect) {
      const crop = pixelCrop(measure.rect, viewport, viewport.dpr);
      try {
        finalDataUrl = await cropScreenshot(dataUrl, crop, 0.8);
      } catch (error) {
        return errorResult(`裁剪截图失败：${errorMessage(error)}`, 'crop_failed');
      }
      imageWidth = crop.width;
      imageHeight = crop.height;
      clipped = measure.clipped === true;
    }

    const base64 = base64Of(finalDataUrl);
    if (!base64) {
      return errorResult('截图返回了空图片，请重试。', 'capture_failed');
    }

    const meta: ScreenshotMeta = {
      source: selector ? 'element' : 'viewport',
      selector,
      viewport_width: Math.round(viewport.width),
      viewport_height: Math.round(viewport.height),
      dpr: viewport.dpr,
      image_width: imageWidth,
      image_height: imageHeight,
      clipped,
      bytes: Math.round(base64.length * 0.75),
    };

    return {
      content: [
        { type: 'text', text: formatScreenshotForModel(meta) },
        { type: 'image', data: base64, mimeType: 'image/jpeg' },
      ],
      details: meta,
    };
  },
};
