import { browser } from 'wxt/browser';
import { articleToMarkdown, htmlToMarkdown } from '@/lib/page/markdown';
import {
  isConvertRequest,
  type OffscreenConvertRequest,
  type OffscreenConvertResponse,
} from '@/lib/page/offscreen-protocol';

function convert(request: OffscreenConvertRequest): OffscreenConvertResponse {
  if (request.article) {
    const markdown = articleToMarkdown(request.html, request.url ?? '');
    return markdown === null ? { ok: false, error: 'readability-failed' } : { ok: true, markdown };
  }
  return { ok: true, markdown: htmlToMarkdown(request.html, request.url) };
}

browser.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!isConvertRequest(message)) return undefined;

  try {
    sendResponse(convert(message));
  } catch (error) {
    sendResponse({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
  return undefined;
});
