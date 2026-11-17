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
    const canvas = document.createElement('canvas');
    canvas.width = request.crop.width;
    canvas.height = request.crop.height;
    const context = canvas.getContext('2d');
    if (!context) return { ok: false, error: 'Canvas 不可用' };
    context.drawImage(
      bitmap,
      request.crop.x,
      request.crop.y,
      request.crop.width,
      request.crop.height,
      0,
      0,
      request.crop.width,
      request.crop.height,
    );
    return {
      ok: true,
      dataUrl: canvas.toDataURL('image/jpeg', request.quality ?? 0.8),
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
