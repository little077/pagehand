export type ScreenshotErrorCode =
  | 'no_tab'
  | 'unsupported_scheme'
  | 'images_unsupported'
  | 'capture_failed'
  | 'selector_miss'
  | 'selector_offscreen'
  | 'selector_size'
  | 'crop_failed'
  | 'unknown';

export interface ScreenshotMeta {
  source: 'viewport' | 'element';
  selector: string | null;
  viewport_width: number;
  viewport_height: number;
  dpr: number;
  image_width: number;
  image_height: number;
  clipped: boolean;
  bytes: number;
}

export type ScreenshotDetails = ScreenshotMeta | { error: string; code: ScreenshotErrorCode };

export function formatScreenshotForModel(meta: ScreenshotMeta): string {
  const lines = [
    `截图范围：${meta.source === 'element' ? `元素「${meta.selector ?? ''}」` : '当前可见区域'}`,
    `视口：${meta.viewport_width}×${meta.viewport_height} CSS px · DPR ${meta.dpr}`,
    `图片：${meta.image_width}×${meta.image_height} px（JPEG，约 ${Math.round(meta.bytes / 1024)} KB）`,
  ];
  if (meta.clipped) lines.push('注意：元素只有一部分在当前视口内，截图只包含可见部分。');
  lines.push('说明：截图只包含当前视口。图片像素 = CSS 像素 × DPR；按图片坐标操作时要除以 DPR。');
  return lines.join('\n');
}

export function summarizeScreenshot(meta: ScreenshotMeta): string {
  if (meta.source === 'element' && meta.selector) {
    return `已截图元素「${meta.selector}」 · ${meta.image_width}×${meta.image_height}`;
  }
  return `已截图当前视口 · ${meta.image_width}×${meta.image_height}`;
}
