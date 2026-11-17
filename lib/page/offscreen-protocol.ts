export const OFFSCREEN_CONVERT_MESSAGE = 'pagehand:html-to-markdown';

export interface OffscreenConvertRequest {
  type: typeof OFFSCREEN_CONVERT_MESSAGE;
  html: string;
  url?: string;
  article?: boolean;
}

export type OffscreenConvertResponse =
  | { ok: true; markdown: string }
  | { ok: false; error: string };

export function isConvertRequest(value: unknown): value is OffscreenConvertRequest {
  if (!value || typeof value !== 'object') return false;
  const message = value as { type?: unknown; html?: unknown };
  return message.type === OFFSCREEN_CONVERT_MESSAGE && typeof message.html === 'string';
}
