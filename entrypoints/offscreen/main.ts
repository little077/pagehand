import { browser } from 'wxt/browser';
import { articleToMarkdown, htmlToMarkdown } from '@/lib/page/markdown';
import {
  isConvertRequest,
  isCropRequest,
  type OffscreenConvertRequest,
  type OffscreenConvertResponse,
  type OffscreenCropRequest,
  type OffscreenCropResponse,
} from '@/lib/page/offscreen-protocol';

function convert(request: OffscreenConvertRequest): OffscreenConvertResponse {
  if (request.article) {
    const markdown = articleToMarkdown(request.html, request.url ?? '');
    return markdown === null ? { ok: false, error: 'readability-failed' } : { ok: true, markdown };
  }
  return { ok: true, markdown: htmlToMarkdown(request.html, request.url) };
}

async function cropImage(request: OffscreenCropRequest): Promise<OffscreenCropResponse> {
  const response = await fetch(request.dataUrl);
  const blob = await response.blob();
  const bitmap = await createImageBitmap(blob);
  try {
    const source = request.crop ?? {
      x: 0,
      y: 0,
      width: bitmap.width,
      height: bitmap.height,
    };
    const maxDimension = request.maxDimension ?? 0;
    const scale =
      maxDimension > 0 ? Math.min(1, maxDimension / Math.max(source.width, source.height)) : 1;
    const width = Math.max(1, Math.round(source.width * scale));
    const height = Math.max(1, Math.round(source.height * scale));

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return { ok: false, error: 'Canvas 不可用' };
    context.drawImage(bitmap, source.x, source.y, source.width, source.height, 0, 0, width, height);
    return {
      ok: true,
      dataUrl: canvas.toDataURL('image/jpeg', request.quality ?? 0.8),
      width,
      height,
    };
  } finally {
    bitmap.close();
  }
}

browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (isConvertRequest(message)) {
    try {
      sendResponse(convert(message));
    } catch (error) {
      sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
    }
    return undefined;
  }

  if (isCropRequest(message)) {
    cropImage(message)
      .then(sendResponse)
      .catch((error: unknown) => {
        sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
      });
    return true;
  }

  return undefined;
});
