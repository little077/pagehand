export interface ScreenshotViewport {
  width: number;
  height: number;
  dpr: number;
}

export interface ScreenshotRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ScreenshotMeasure {
  found: boolean;
  viewport: ScreenshotViewport;
  rect?: ScreenshotRect;
  in_viewport?: boolean;
  clipped?: boolean;
  error?: 'invalid_selector' | 'zero_size';
}

/**
 * 注入到页面里执行。只量当前视口大小和缩放比例。
 * 函数会被序列化，不能引用模块级变量。
 */
export function measureScreenshotViewport(): ScreenshotViewport {
  return {
    width: window.innerWidth,
    height: window.innerHeight,
    dpr: window.devicePixelRatio || 1,
  };
}

/**
 * 注入到页面里执行。只量当前视口内的位置，不滚动页面。
 * 函数会被序列化，不能引用模块级变量。
 */
export function measureScreenshotTarget(selector: string): ScreenshotMeasure {
  const viewport: ScreenshotViewport = {
    width: window.innerWidth,
    height: window.innerHeight,
    dpr: window.devicePixelRatio || 1,
  };

  let element: Element | null = null;
  try {
    element = document.querySelector(selector);
  } catch {
    return { found: false, viewport, error: 'invalid_selector' };
  }
  if (!element) return { found: false, viewport };

  const rect = element.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) {
    return { found: false, viewport, error: 'zero_size' };
  }

  const left = Math.max(0, rect.left);
  const top = Math.max(0, rect.top);
  const right = Math.min(viewport.width, rect.right);
  const bottom = Math.min(viewport.height, rect.bottom);

  if (right <= left || bottom <= top) {
    return { found: true, viewport, in_viewport: false };
  }

  const clipped =
    Math.abs(left - rect.left) > 1 ||
    Math.abs(top - rect.top) > 1 ||
    Math.abs(right - rect.right) > 1 ||
    Math.abs(bottom - rect.bottom) > 1;

  return {
    found: true,
    viewport,
    in_viewport: true,
    clipped,
    rect: { x: left, y: top, width: right - left, height: bottom - top },
  };
}

/** 把 CSS 像素矩形换算成截图里的像素矩形，并夹在图片范围内。 */
export function pixelCrop(
  rect: ScreenshotRect,
  viewport: ScreenshotViewport,
  dpr: number,
): { x: number; y: number; width: number; height: number } {
  const imageWidth = Math.max(1, Math.round(viewport.width * dpr));
  const imageHeight = Math.max(1, Math.round(viewport.height * dpr));
  const x = Math.min(Math.max(Math.round(rect.x * dpr), 0), imageWidth - 1);
  const y = Math.min(Math.max(Math.round(rect.y * dpr), 0), imageHeight - 1);
  const width = Math.min(Math.max(Math.round(rect.width * dpr), 1), imageWidth - x);
  const height = Math.min(Math.max(Math.round(rect.height * dpr), 1), imageHeight - y);
  return { x, y, width, height };
}
