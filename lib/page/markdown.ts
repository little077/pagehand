import { Readability } from '@mozilla/readability';
import TurndownService from 'turndown';
import { gfm } from 'turndown-plugin-gfm';

function createConverter(): TurndownService {
  const service = new TurndownService({
    headingStyle: 'atx',
    hr: '---',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    fence: '```',
    emDelimiter: '*',
    strongDelimiter: '**',
    linkStyle: 'inlined',
  });
  service.use(gfm);
  service.remove(['script', 'style', 'noscript', 'template']);
  return service;
}

const converter = createConverter();

function parse(html: string): Document {
  return new DOMParser().parseFromString(html, 'text/html');
}

/** 同一路径同时出现裸链接和带参数的链接时，优先用带参数的完整版本。 */
function preferRicherAnchorHrefs(doc: Document): void {
  const richest = new Map<string, string>();
  for (const anchor of Array.from(doc.querySelectorAll('a[href]'))) {
    const href = anchor.getAttribute('href');
    if (!href) continue;
    try {
      const url = new URL(href, doc.baseURI);
      if (!/^https?:$/i.test(url.protocol) || !url.search) continue;
      const key = `${url.origin}${url.pathname}`;
      const current = richest.get(key);
      if (!current || href.length > current.length) richest.set(key, href);
    } catch {
      // 保留无法解析的原值。
    }
  }
  for (const anchor of Array.from(doc.querySelectorAll('a[href]'))) {
    const href = anchor.getAttribute('href');
    if (!href) continue;
    try {
      const url = new URL(href, doc.baseURI);
      if (url.search) continue;
      const richer = richest.get(`${url.origin}${url.pathname}`);
      if (richer) anchor.setAttribute('href', richer);
    } catch {
      // 保留无法解析的原值。
    }
  }
}

/** 内联 base64 图片对模型没有价值，还会把上下文和截断额度吃光。 */
function stripInlineDataImages(doc: Document): void {
  for (const image of Array.from(doc.querySelectorAll('img[src]'))) {
    const src = image.getAttribute('src') ?? '';
    if (!src.startsWith('data:') && !src.startsWith('blob:')) continue;
    const alt = image.getAttribute('alt')?.trim();
    image.replaceWith(doc.createTextNode(alt ? `[图片：${alt}]` : ''));
  }
  for (const source of Array.from(doc.querySelectorAll('source[src]'))) {
    const src = source.getAttribute('src') ?? '';
    if (src.startsWith('data:') || src.startsWith('blob:')) source.remove();
  }
}

/** Turndown 只读属性值，不会自己解析相对地址；在转换前统一换成绝对地址。 */
function absolutizeUrls(doc: Document, baseUrl?: string): void {
  if (!baseUrl) return;
  for (const element of doc.querySelectorAll('a[href], img[src], source[src], video[poster]')) {
    const attribute =
      element.tagName === 'A' ? 'href' : element.tagName === 'VIDEO' ? 'poster' : 'src';
    const raw = element.getAttribute(attribute);
    if (!raw) continue;
    try {
      element.setAttribute(attribute, new URL(raw, baseUrl).href);
    } catch {
      // 保留无法解析的原值。
    }
  }
}

export function htmlToMarkdown(html: string, url?: string): string {
  const doc = parse(html);
  absolutizeUrls(doc, url);
  preferRicherAnchorHrefs(doc);
  stripInlineDataImages(doc);
  return converter.turndown(doc.body);
}

/** 阅读模式：抽不到正文时返回 null，由调用方决定回退方式。 */
export function articleToMarkdown(html: string, url: string): string | null {
  const doc = parse(html);
  absolutizeUrls(doc, url);
  preferRicherAnchorHrefs(doc);
  stripInlineDataImages(doc);
  const article = new Readability(doc, { charThreshold: 200, keepClasses: false }).parse();
  if (!article?.content) return null;
  return converter.turndown(article.content);
}
