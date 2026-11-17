import { describe, expect, it } from 'vitest';
import {
  formatScreenshotForModel,
  type ScreenshotMeta,
  summarizeScreenshot,
} from '@/lib/tools/screenshot-format';

function meta(overrides: Partial<ScreenshotMeta> = {}): ScreenshotMeta {
  return {
    source: 'viewport',
    selector: null,
    viewport_width: 1280,
    viewport_height: 720,
    dpr: 2,
    image_width: 2560,
    image_height: 1440,
    clipped: false,
    bytes: 240_000,
    ...overrides,
  };
}

describe('screenshot 给模型的说明', () => {
  it('包含范围、视口、图片尺寸和坐标提醒', () => {
    const text = formatScreenshotForModel(meta());

    expect(text).toContain('截图范围：当前可见区域');
    expect(text).toContain('视口：1280×720 CSS px · DPR 2');
    expect(text).toContain('图片：2560×1440 px');
    expect(text).toContain('只包含当前视口');
    expect(text).toContain('除以 DPR');
  });

  it('元素被视口裁掉一部分时明确提醒', () => {
    const text = formatScreenshotForModel(
      meta({ source: 'element', selector: '#chart', clipped: true }),
    );

    expect(text).toContain('元素「#chart」');
    expect(text).toContain('只有一部分在当前视口内');
  });

  it('摘要区分整屏和元素截图', () => {
    expect(summarizeScreenshot(meta())).toBe('已截图当前视口 · 2560×1440');
    expect(summarizeScreenshot(meta({ source: 'element', selector: '#chart' }))).toBe(
      '已截图元素「#chart」 · 2560×1440',
    );
  });
});
