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
  return converter.turndown(doc.body);
}

/** 阅读模式：抽不到正文时返回 null，由调用方决定回退方式。 */
export function articleToMarkdown(html: string, url: string): string | null {
  const doc = parse(html);
  absolutizeUrls(doc, url);
  const article = new Readability(doc, { charThreshold: 200, keepClasses: false }).parse();
  if (!article?.content) return null;
  return converter.turndown(article.content);
}
