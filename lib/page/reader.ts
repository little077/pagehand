// biome-ignore-all lint/performance/useDomNodeTextContent: 读取页面需要渲染后的可见文本；textContent 会把隐藏节点的文字也带进来

import { type Browser, browser } from 'wxt/browser';
import { articleToMarkdown, htmlToMarkdown } from './offscreen';
import { isPdfUrl } from './pdf-detect';

export { isPdfUrl };

export const READ_DEFAULT_MAX_CHARS = 12_000;
export const READ_MIN_MAX_CHARS = 1_000;
export const READ_MAX_MAX_CHARS = 100_000;
const THIN_TEXT_CHARS = 400;
const FRAME_LIMIT = 8;
const FRAME_MIN_CHARS = 40;

export type ReadMode = 'markdown' | 'article' | 'text' | 'html';

export const READ_MODE_LABEL: Record<ReadMode, string> = {
  markdown: '整页 Markdown',
  article: '文章正文',
  text: '纯文本',
  html: '清洗后的 HTML',
};

export interface ReadRequest {
  tabId?: number;
  mode?: ReadMode;
  selector?: string | null;
  maxLength?: number;
  frameId?: number;
}

export interface ChildFrame {
  frameId: number;
  title: string;
  url: string;
  chars: number;
}

export interface ReadOutcome {
  tabId: number;
  title: string;
  url: string;
  mode: ReadMode;
  selector: string | null;
  frameId: number;
  content: string;
  totalChars: number;
  truncated: boolean;
  frames: ChildFrame[];
}

export type ReadErrorCode =
  | 'no_tab'
  | 'unsupported_scheme'
  | 'pdf'
  | 'selector_miss'
  | 'inject_failed'
  | 'convert_failed';

export class PageReadError extends Error {
  readonly code: ReadErrorCode;

  constructor(code: ReadErrorCode, message: string) {
    super(message);
    this.name = 'PageReadError';
    this.code = code;
  }
}

interface Extracted {
  title: string;
  url: string;
  found: boolean;
  body: string;
  textChars: number;
}

/**
 * 注入到页面里执行。函数会被序列化，不能引用模块级变量。
 */
function readVisibleText(selector: string | null): Extracted {
  const root = selector ? document.querySelector(selector) : document.body;
  if (!root) {
    return { title: document.title, url: location.href, found: false, body: '', textChars: 0 };
  }
  const text = ((root as HTMLElement).innerText ?? '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  return {
    title: document.title,
    url: location.href,
    found: true,
    body: text,
    textChars: text.length,
  };
}

/**
 * 注入到页面里执行。去掉脚本、样式、隐藏节点和行内样式，并把相对链接换成绝对地址。
 */
function readCleanHtml(selector: string | null): Extracted {
  const root = selector ? document.querySelector(selector) : document.body;
  if (!root) {
    return { title: document.title, url: location.href, found: false, body: '', textChars: 0 };
  }

  const clone = root.cloneNode(true) as HTMLElement;
  for (const node of clone.querySelectorAll(
    'script, style, noscript, template, svg, canvas, link[rel="stylesheet"]',
  )) {
    node.remove();
  }
  for (const node of clone.querySelectorAll('[hidden], [aria-hidden="true"]')) node.remove();
  for (const node of clone.querySelectorAll('[style]')) node.removeAttribute('style');

  const comments: Node[] = [];
  const walker = document.createTreeWalker(clone, NodeFilter.SHOW_COMMENT);
  while (walker.nextNode()) comments.push(walker.currentNode);
  for (const node of comments) node.parentNode?.removeChild(node);

  for (const anchor of Array.from(clone.querySelectorAll('a[href]'))) {
    const href = anchor.getAttribute('href');
    if (!href) continue;
    try {
      anchor.setAttribute('href', new URL(href, document.baseURI).href);
    } catch {
      // 保留无法解析的原值。
    }
  }
  for (const image of Array.from(clone.querySelectorAll('img[src], source[src]'))) {
    const src = image.getAttribute('src');
    if (!src) continue;
    try {
      image.setAttribute('src', new URL(src, document.baseURI).href);
    } catch {
      // 保留无法解析的原值。
    }
  }

  const textChars = ((root as HTMLElement).innerText ?? '').trim().length;
  return {
    title: document.title,
    url: location.href,
    found: true,
    body: clone.innerHTML,
    textChars,
  };
}

/**
 * 注入到页面里执行。给 Readability 用的整份文档；保留样式表，因为正文识别会参考可见性。
 */
function readDocumentHtml(): Extracted {
  const clone = document.documentElement.cloneNode(true) as HTMLElement;
  for (const node of clone.querySelectorAll('script, noscript, template')) node.remove();

  for (const anchor of Array.from(clone.querySelectorAll('a[href]'))) {
    const href = anchor.getAttribute('href');
    if (!href) continue;
    try {
      anchor.setAttribute('href', new URL(href, document.baseURI).href);
    } catch {
      // 保留无法解析的原值。
    }
  }
  for (const image of Array.from(clone.querySelectorAll('img[src], source[src]'))) {
    const src = image.getAttribute('src');
    if (!src) continue;
    try {
      image.setAttribute('src', new URL(src, document.baseURI).href);
    } catch {
      // 保留无法解析的原值。
    }
  }

  const textChars = (document.body?.innerText ?? '').trim().length;
  return {
    title: document.title,
    url: location.href,
    found: true,
    body: clone.outerHTML,
    textChars,
  };
}

/**
 * 注入到页面里执行。只回报框架身份和正文长度，用来发现“内容藏在 iframe 里”。
 */
function probeFrame(): { title: string; url: string; chars: number } {
  const text = (document.body?.innerText ?? '').trim();
  return { title: document.title, url: location.href, chars: text.length };
}

type InjectionDetails = {
  target: { tabId: number; frameIds?: number[]; allFrames?: boolean };
  func: (...args: unknown[]) => unknown;
  args?: unknown[];
};

type InjectionResult = { frameId: number; result?: unknown };

const injectScript = browser.scripting.executeScript as unknown as (
  details: InjectionDetails,
) => Promise<InjectionResult[]>;

async function inject<A extends unknown[], R>(
  tabId: number,
  frameId: number,
  func: (...args: A) => R,
  args: A,
): Promise<R> {
  const target: InjectionDetails['target'] =
    frameId > 0 ? { tabId, frameIds: [frameId] } : { tabId };
  let results: InjectionResult[];
  try {
    results = await injectScript({
      target,
      func: func as unknown as (...args: unknown[]) => unknown,
      args: args as unknown[],
    });
  } catch (error) {
    throw new PageReadError(
      'inject_failed',
      `读取页面失败：${errorMessage(error)}。可能这个页面不允许扩展读取、子框架已经变化，或者后台标签已经休眠——让用户先在浏览器里点开那个标签再试。`,
    );
  }

  const result = results[0]?.result as R | undefined;
  if (result === undefined) {
    throw new PageReadError('inject_failed', '页面没有返回内容，可能是页面还在加载。');
  }
  return result;
}

async function resolveTab(tabId?: number): Promise<Browser.tabs.Tab> {
  if (tabId !== undefined) {
    try {
      const tab = await browser.tabs.get(tabId);
      if (tab.id === undefined) throw new Error('missing tab id');
      return tab;
    } catch {
      throw new PageReadError(
        'no_tab',
        `找不到编号为 ${tabId} 的标签页，可能已经关闭。请重新调用 list_tabs 获取最新的 tab_id。`,
      );
    }
  }

  const [tab] = await browser.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab?.id) {
    throw new PageReadError('no_tab', '找不到当前标签页，请先打开一个网页再试。');
  }
  return tab;
}

function assertReadableUrl(url: string | undefined): string {
  if (!url || !/^https?:/i.test(url)) {
    throw new PageReadError(
      'unsupported_scheme',
      '这个标签页不是普通网页（可能是浏览器内部页、扩展商店或本地文件），Pagehand 无法读取。请切换到 http/https 网页。',
    );
  }
  return url;
}

export function normalizeSelector(raw: string | null | undefined): string | null {
  if (raw === null || raw === undefined) return null;
  let selector = raw.trim();
  if (!selector) return null;

  if (
    selector.length >= 2 &&
    (selector.startsWith('"') || selector.startsWith("'")) &&
    selector.at(-1) === selector[0]
  ) {
    selector = selector.slice(1, -1).trim();
  }

  // 模型偶尔会把选择器连同引号一起吐出来；落单的首尾引号一定是笔误。
  if (selector.startsWith('"') || selector.startsWith("'")) selector = selector.slice(1).trim();
  if (selector.endsWith('"') || selector.endsWith("'")) selector = selector.slice(0, -1).trim();

  return selector || null;
}

export function clampMaxLength(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return READ_DEFAULT_MAX_CHARS;
  return Math.min(READ_MAX_MAX_CHARS, Math.max(READ_MIN_MAX_CHARS, Math.floor(value)));
}

function normalizeFrameId(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

async function listChildFrames(tabId: number): Promise<ChildFrame[]> {
  let results: InjectionResult[];
  try {
    results = await injectScript({
      target: { tabId, allFrames: true },
      func: probeFrame as unknown as (...args: unknown[]) => unknown,
    });
  } catch {
    return [];
  }

  const frames: ChildFrame[] = [];
  for (const item of results) {
    if (item.frameId === 0) continue;
    const result = item.result as { title?: string; url?: string; chars?: number } | undefined;
    if (!result) continue;
    const chars = typeof result.chars === 'number' ? result.chars : 0;
    if (chars < FRAME_MIN_CHARS) continue;
    frames.push({
      frameId: item.frameId,
      title: (result.title ?? '').trim() || '（无标题框架）',
      url: result.url ?? '',
      chars,
    });
  }

  return frames.sort((a, b) => b.chars - a.chars).slice(0, FRAME_LIMIT);
}

function truncate(content: string, maxLength: number): { content: string; truncated: boolean } {
  if (content.length <= maxLength) return { content, truncated: false };
  return {
    content: `${content.slice(0, maxLength)}\n\n…（已截断：原文约 ${content.length} 字，本次返回前 ${maxLength} 字。需要更多内容时，把 max_length 调大并在一次调用里重读，不要循环拼接。）`,
    truncated: true,
  };
}

function formatFrameHint(frames: ChildFrame[]): string {
  if (frames.length === 0) return '';
  const lines = [
    '',
    '【页面里还有子框架】',
    '顶层正文很少，内容可能在这些子框架里。需要时带上 frame_id 再读一次：',
  ];
  for (const frame of frames) {
    lines.push(
      `- frame_id=${frame.frameId} · 约 ${frame.chars} 字 · ${frame.title} · ${frame.url}`,
    );
  }
  return lines.join('\n');
}

async function extractText(
  tabId: number,
  frameId: number,
  selector: string | null,
): Promise<Extracted> {
  const extracted = await inject(tabId, frameId, readVisibleText, [selector]);
  if (selector && !extracted.found) {
    throw new PageReadError(
      'selector_miss',
      `页面里找不到选择器「${selector}」。请确认选择器；如果内容可能在子框架里，先不传 selector 读取整页，按返回的子框架列表重试。`,
    );
  }
  return extracted;
}

async function extractHtml(
  tabId: number,
  frameId: number,
  selector: string | null,
): Promise<Extracted> {
  const extracted = await inject(tabId, frameId, readCleanHtml, [selector]);
  if (selector && !extracted.found) {
    throw new PageReadError(
      'selector_miss',
      `页面里找不到选择器「${selector}」。请确认选择器；如果内容可能在子框架里，先不传 selector 读取整页，按返回的子框架列表重试。`,
    );
  }
  return extracted;
}

async function extractMarkdown(
  tabId: number,
  frameId: number,
  selector: string | null,
): Promise<{ extracted: Extracted; content: string }> {
  const extracted = await extractHtml(tabId, frameId, selector);
  let content: string;
  try {
    content = await htmlToMarkdown(extracted.body, extracted.url);
  } catch (error) {
    throw new PageReadError(
      'convert_failed',
      `HTML 转 Markdown 失败：${errorMessage(error)}。页面可能过大或结构异常；请用 selector 缩小范围，或改用 mode="text"。`,
    );
  }
  if (!content.trim()) {
    const text = await extractText(tabId, frameId, selector);
    content = `（页面转成 Markdown 后为空，以下为纯文本）\n\n${text.body}`;
  }
  return { extracted, content };
}

async function extractArticle(
  tabId: number,
  frameId: number,
): Promise<{ extracted: Extracted; content: string }> {
  const extracted = await inject(tabId, frameId, readDocumentHtml, []);
  let content: string | null;
  try {
    content = await articleToMarkdown(extracted.body, extracted.url);
  } catch (error) {
    throw new PageReadError(
      'convert_failed',
      `正文识别失败：${errorMessage(error)}。页面可能过大或结构异常；请改用 mode="text"，或用 selector 指定正文区域。`,
    );
  }
  if (content === null) {
    const text = await extractText(tabId, frameId, null);
    return {
      extracted,
      content: `（正文识别失败，以下为整页纯文本）\n\n${text.body}`,
    };
  }
  return { extracted, content };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export async function readPage(request: ReadRequest): Promise<ReadOutcome> {
  const tab = await resolveTab(request.tabId);
  const tabId = tab.id as number;
  const url = assertReadableUrl(tab.url);

  if (isPdfUrl(url)) {
    throw new PageReadError(
      'pdf',
      '这是一个 PDF 文件，read_page 只能读 HTML 页面。请使用 pdf 工具读取正文。',
    );
  }

  const mode = request.mode ?? 'markdown';
  const selector = normalizeSelector(request.selector);
  const frameId = normalizeFrameId(request.frameId);
  const maxLength = clampMaxLength(request.maxLength);

  let extracted: Extracted;
  let content: string;

  switch (mode) {
    case 'text': {
      extracted = await extractText(tabId, frameId, selector);
      content = extracted.body;
      break;
    }
    case 'html': {
      extracted = await extractHtml(tabId, frameId, selector);
      content = extracted.body;
      break;
    }
    case 'article': {
      const result =
        selector === null
          ? await extractArticle(tabId, frameId)
          : await extractMarkdown(tabId, frameId, selector);
      extracted = result.extracted;
      content = result.content;
      break;
    }
    default: {
      const result = await extractMarkdown(tabId, frameId, selector);
      extracted = result.extracted;
      content = result.content;
      break;
    }
  }

  const totalChars = content.length;
  const trimmed = truncate(content, maxLength);
  const frames =
    frameId === 0 && extracted.textChars < THIN_TEXT_CHARS ? await listChildFrames(tabId) : [];

  return {
    tabId,
    title: extracted.title || tab.title || '',
    url: extracted.url || url,
    mode,
    selector,
    frameId,
    content: `${trimmed.content}${formatFrameHint(frames)}`,
    totalChars,
    truncated: trimmed.truncated,
    frames,
  };
}

export function readErrorCode(error: unknown): ReadErrorCode | 'unknown' {
  return error instanceof PageReadError ? error.code : 'unknown';
}

export function readErrorMessage(error: unknown): string {
  return error instanceof PageReadError ? error.message : `读取页面失败：${errorMessage(error)}`;
}
