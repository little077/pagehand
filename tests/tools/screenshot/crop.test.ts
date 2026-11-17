import { beforeEach, describe, expect, it } from 'vitest';
import { isCropRequest } from '@/lib/page/offscreen-protocol';
import { measureScreenshotTarget, pixelCrop } from '@/lib/page/screenshot';

beforeEach(() => {
  document.body.innerHTML = '';
});

function stubRect(width: number, height: number, x = 0, y = 0): void {
  const element = document.querySelector('#target');
  if (!element) throw new Error('missing #target');
  Object.defineProperty(element, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      x,
      y,
      width,
      height,
      top: y,
      left: x,
      right: x + width,
      bottom: y + height,
      toJSON: () => ({}),
    }),
  });
}

describe('screenshot 目标测量', () => {
  it('量出视口内的元素位置', () => {
    document.body.innerHTML = '<div id="target"></div>';
    stubRect(100, 50, 10, 20);

    const result = measureScreenshotTarget('#target');

    expect(result.found).toBe(true);
    expect(result.in_viewport).toBe(true);
    expect(result.clipped).toBe(false);
    expect(result.rect).toEqual({ x: 10, y: 20, width: 100, height: 50 });
  });

  it('元素完全在视口外时标记不可截', () => {
    document.body.innerHTML = '<div id="target"></div>';
    stubRect(100, 50, 99_999, 20);

    const result = measureScreenshotTarget('#target');

    expect(result.found).toBe(true);
    expect(result.in_viewport).toBe(false);
  });

  it('元素部分在视口内时裁剪到可见部分', () => {
    document.body.innerHTML = '<div id="target"></div>';
    stubRect(100, 50, window.innerWidth - 20, 10);

    const result = measureScreenshotTarget('#target');

    expect(result.in_viewport).toBe(true);
    expect(result.clipped).toBe(true);
    expect(result.rect?.width).toBe(20);
  });

  it('尺寸为 0 时给出原因', () => {
    document.body.innerHTML = '<div id="target"></div>';
    stubRect(0, 0);

    expect(measureScreenshotTarget('#target')).toMatchObject({
      found: false,
      error: 'zero_size',
    });
  });

  it('元素不存在时返回 found=false', () => {
    expect(measureScreenshotTarget('#missing')).toMatchObject({ found: false });
  });
});

describe('pixelCrop', () => {
  it('按 DPR 把 CSS 像素换算成图片像素', () => {
    expect(
      pixelCrop({ x: 10, y: 20, width: 100, height: 50 }, { width: 1280, height: 720, dpr: 2 }, 2),
    ).toEqual({ x: 20, y: 40, width: 200, height: 100 });
  });

  it('把裁剪框夹在图片范围内', () => {
    expect(
      pixelCrop(
        { x: 1270, y: 700, width: 100, height: 100 },
        { width: 1280, height: 720, dpr: 1 },
        1,
      ),
    ).toEqual({ x: 1270, y: 700, width: 10, height: 20 });
  });

  it('非整数 DPR 四舍五入', () => {
    expect(
      pixelCrop({ x: 3, y: 3, width: 10, height: 10 }, { width: 100, height: 100, dpr: 1.5 }, 1.5),
    ).toEqual({ x: 5, y: 5, width: 15, height: 15 });
  });
});

describe('离屏裁剪消息校验', () => {
  it('接受合法的裁剪请求', () => {
    expect(
      isCropRequest({
        type: 'pagehand:crop-image',
        dataUrl: 'data:image/jpeg;base64,abc',
        crop: { x: 0, y: 0, width: 10, height: 10 },
      }),
    ).toBe(true);
  });

  it('省略裁剪矩形表示整图缩放；矩形类型不对时拒绝', () => {
    expect(isCropRequest({ type: 'pagehand:crop-image', dataUrl: 'x' })).toBe(true);
    expect(
      isCropRequest({
        type: 'pagehand:crop-image',
        dataUrl: 'x',
        crop: { x: 0, y: 0, width: '10', height: 10 },
      }),
    ).toBe(false);
    expect(isCropRequest({ type: 'other', dataUrl: 'x', crop: {} })).toBe(false);
    expect(isCropRequest({ type: 'pagehand:crop-image', dataUrl: 'x', maxDimension: 'big' })).toBe(
      false,
    );
  });
});
