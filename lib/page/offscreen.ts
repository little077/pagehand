import { browser } from 'wxt/browser';
import {
  OFFSCREEN_CONVERT_MESSAGE,
  type OffscreenConvertRequest,
  type OffscreenConvertResponse,
} from './offscreen-protocol';

const OFFSCREEN_PAGE = 'offscreen.html';
const CONVERT_TIMEOUT_MS = 20_000;

interface OffscreenApi {
  createDocument(options: { url: string; reasons: string[]; justification: string }): Promise<void>;
}

interface RuntimeWithContexts {
  getContexts?: (filter: { contextTypes: string[] }) => Promise<unknown[]>;
}

let creating: Promise<void> | null = null;

function offscreenApi(): OffscreenApi | undefined {
  // Chrome 里 wxt 的 browser 就是 chrome 命名空间；Firefox 没有离屏文档。
  return (browser as unknown as { offscreen?: OffscreenApi }).offscreen;
}

async function hasOffscreenDocument(): Promise<boolean> {
  const runtime = browser.runtime as unknown as RuntimeWithContexts;
  if (typeof runtime.getContexts !== 'function') return false;
  const contexts = await runtime.getContexts({ contextTypes: ['OFFSCREEN_DOCUMENT'] });
  return contexts.length > 0;
}

async function createOffscreenDocument(): Promise<void> {
  const api = offscreenApi();
  if (!api) {
    throw new Error('当前浏览器不支持离屏文档，无法把 HTML 转成 Markdown');
  }

  try {
    await api.createDocument({
      url: OFFSCREEN_PAGE,
      reasons: ['DOM_PARSER'],
      justification: '在后台把页面 HTML 转成 Markdown，需要 DOM 解析环境',
    });
  } catch (error) {
    // 并发创建时第二次调用会报“只能有一个离屏文档”，说明目标已经达成。
    if (!/single offscreen|already exists/i.test(String(error))) throw error;
  }
}

async function ensureOffscreenDocument(): Promise<void> {
  if (await hasOffscreenDocument()) return;
  if (!creating) {
    creating = createOffscreenDocument().finally(() => {
      creating = null;
    });
  }
  await creating;
}

async function sendConvertRequest(
  request: OffscreenConvertRequest,
): Promise<OffscreenConvertResponse> {
  const response = (await browser.runtime.sendMessage(request)) as
    | OffscreenConvertResponse
    | undefined;
  if (!response) throw new Error('离屏文档没有返回结果');
  return response;
}

async function withTimeout<T>(task: Promise<T>, timeoutMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error('HTML 转 Markdown 超时')), timeoutMs);
  });
  try {
    return await Promise.race([task, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function convert(html: string, url?: string, article?: boolean): Promise<string | null> {
  await ensureOffscreenDocument();
  const request: OffscreenConvertRequest = {
    type: OFFSCREEN_CONVERT_MESSAGE,
    html,
    ...(url ? { url } : {}),
    ...(article ? { article: true } : {}),
  };

  let response: OffscreenConvertResponse;
  try {
    response = await withTimeout(sendConvertRequest(request), CONVERT_TIMEOUT_MS);
  } catch (error) {
    // 离屏文档刚创建完时监听器可能还没挂上，重试一次。
    if (!/Receiving end does not exist|Could not establish connection/i.test(String(error))) {
      throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, 80));
    response = await withTimeout(sendConvertRequest(request), CONVERT_TIMEOUT_MS);
  }

  if (response.ok) return response.markdown;
  if (response.error === 'readability-failed') return null;
  throw new Error(response.error);
}

/** 整页或局部 HTML 转 Markdown；转换失败时抛错，正文抽取失败时返回 null 由调用方回退。 */
export async function htmlToMarkdown(html: string, url?: string): Promise<string> {
  const markdown = await convert(html, url, false);
  return markdown ?? '';
}

/** Readability 读取模式；正文识别失败返回 null。 */
export async function articleToMarkdown(html: string, url: string): Promise<string | null> {
  return convert(html, url, true);
}
