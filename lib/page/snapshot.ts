// biome-ignore-all lint/performance/useDomNodeTextContent: 快照要的是渲染后可见文本；innerText 会跳过 display:none 节点并保留换行，textContent 会把隐藏的 script/style 文本也带进来

export const SNAPSHOT_MAX_CHARS = 12_000;
export const LINK_LIMIT = 40;
export const HEADING_LIMIT = 60;

export interface PageHeading {
  level: number;
  text: string;
}

export interface PageLink {
  text: string;
  href: string;
}

export interface PageSnapshot {
  title: string;
  url: string;
  text: string;
  totalChars: number;
  truncated: boolean;
  headings: PageHeading[];
  links: PageLink[];
}

/**
 * Runs inside the target page via chrome.scripting.executeScript.
 * Keep it self-contained: it is serialized, so it cannot close over imports.
 */
export function extractPageSnapshot(): PageSnapshot {
  const maxChars = 12_000;
  const headingLimit = 60;
  const linkLimit = 40;

  const cleanText = (value: string) =>
    value
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

  const main = document.querySelector<HTMLElement>('main, article, [role="main"]');
  const bodyText = cleanText(document.body?.innerText ?? '');
  const mainText = main ? cleanText(main.innerText) : '';
  const fullText = mainText.length >= 200 ? mainText : bodyText;

  const headings: PageHeading[] = [];
  for (const element of document.querySelectorAll<HTMLElement>('h1, h2, h3')) {
    const text = cleanText(element.innerText);
    if (!text) continue;
    headings.push({ level: Number(element.tagName.slice(1)), text });
    if (headings.length >= headingLimit) break;
  }

  const links: PageLink[] = [];
  const seen = new Set<string>();
  for (const anchor of document.querySelectorAll<HTMLAnchorElement>('a[href]')) {
    const href = anchor.href;
    if (!href.startsWith('http://') && !href.startsWith('https://')) continue;
    if (seen.has(href)) continue;
    const text = cleanText(anchor.innerText || anchor.getAttribute('aria-label') || '');
    if (!text) continue;
    seen.add(href);
    links.push({ text, href });
    if (links.length >= linkLimit) break;
  }

  const totalChars = fullText.length;
  const truncated = totalChars > maxChars;

  return {
    title: document.title,
    url: location.href,
    text: truncated ? fullText.slice(0, maxChars) : fullText,
    totalChars,
    truncated,
    headings,
    links,
  };
}

export function formatSnapshotForModel(snapshot: PageSnapshot): string {
  const lines: string[] = [
    `页面标题：${snapshot.title || '（无标题）'}`,
    `页面地址：${snapshot.url}`,
    `正文长度：${snapshot.totalChars} 字${snapshot.truncated ? `（以下为前 ${SNAPSHOT_MAX_CHARS} 字）` : ''}`,
    '',
    '【正文】',
    snapshot.text || '（页面没有可读正文）',
  ];

  if (snapshot.headings.length > 0) {
    lines.push('', '【标题结构】');
    for (const heading of snapshot.headings) {
      lines.push(`${'#'.repeat(heading.level)} ${heading.text}`);
    }
  }

  if (snapshot.links.length > 0) {
    lines.push('', `【页面链接（共记录 ${snapshot.links.length} 条）】`);
    for (const link of snapshot.links) {
      lines.push(`- ${link.text} → ${link.href}`);
    }
  }

  return lines.join('\n');
}
