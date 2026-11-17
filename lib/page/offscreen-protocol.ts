export const OFFSCREEN_CONVERT_MESSAGE = 'pagehand:html-to-markdown';
export const OFFSCREEN_CROP_MESSAGE = 'pagehand:crop-image';

export interface OffscreenConvertRequest {
  type: typeof OFFSCREEN_CONVERT_MESSAGE;
  html: string;
  url?: string;
  article?: boolean;
}

export type OffscreenConvertResponse =
  | { ok: true; markdown: string }
  | { ok: false; error: string };

export interface OffscreenCropRequest {
  type: typeof OFFSCREEN_CROP_MESSAGE;
  dataUrl: string;
  crop: { x: number; y: number; width: number; height: number };
  quality?: number;
}

export type OffscreenCropResponse = { ok: true; dataUrl: string } | { ok: false; error: string };

export function isConvertRequest(value: unknown): value is OffscreenConvertRequest {
  if (!value || typeof value !== 'object') return false;
  const message = value as { type?: unknown; html?: unknown };
  return message.type === OFFSCREEN_CONVERT_MESSAGE && typeof message.html === 'string';
}

export function isCropRequest(value: unknown): value is OffscreenCropRequest {
  if (!value || typeof value !== 'object') return false;
  const message = value as {
    type?: unknown;
    dataUrl?: unknown;
    crop?: Record<string, unknown> | null;
  };
  if (message.type !== OFFSCREEN_CROP_MESSAGE || typeof message.dataUrl !== 'string') {
    return false;
  }
  const crop = message.crop;
  if (!crop || typeof crop !== 'object') return false;
  return ['x', 'y', 'width', 'height'].every((key) => Number.isFinite(crop[key]));
}
