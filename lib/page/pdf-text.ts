export interface PdfMatch {
  index: number;
  length: number;
  snippet: string;
}

export interface PdfSearchOptions {
  regex?: boolean;
  caseInsensitive?: boolean;
  limit?: number;
}

const SNIPPET_CONTEXT = 100;

/** 把 '1-3,7,10-12' 解析成去重、升序、1-based 页码。语法错误直接抛。 */
export function parsePageRange(spec: string | undefined, pageCount: number): number[] {
  if (pageCount <= 0) return [];
  const value = spec?.trim();
  if (!value) return Array.from({ length: pageCount }, (_, index) => index + 1);

  const pages = new Set<number>();
  for (const rawPart of value.split(',')) {
    const part = rawPart.trim();
    if (!part) continue;

    const range = part.match(/^(\d+)\s*-\s*(\d+)$/);
    if (range) {
      let start = Number(range[1]);
      let end = Number(range[2]);
      if (start > end) [start, end] = [end, start];
      start = Math.max(1, start);
      end = Math.min(pageCount, end);
      for (let page = start; page <= end; page += 1) pages.add(page);
      continue;
    }

    if (/^\d+$/.test(part)) {
      const page = Number(part);
      if (page >= 1 && page <= pageCount) pages.add(page);
      continue;
    }

    throw new Error(`页码范围格式不正确：「${part}」。可用写法：5、1-10、1-3,7,10-12。`);
  }

  return [...pages].sort((a, b) => a - b);
}

/** 合并 pdf.js 文本项后的空白整理；不改变文字本身。 */
export function normalizePageText(raw: string): string {
  return raw
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function buildPageSegment(pageNumber: number, text: string, hasPrevious: boolean): string {
  return `${hasPrevious ? '\n\f\n' : ''}=== Page ${pageNumber} ===\n${text}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 单页搜索；跨页的命中上限由调用方累计。 */
export function findPdfMatches(
  text: string,
  query: string,
  options: PdfSearchOptions = {},
): PdfMatch[] {
  if (!query.trim()) throw new Error('搜索词不能为空。');
  const limit = options.limit ?? Number.POSITIVE_INFINITY;
  if (limit <= 0) return [];

  const flags = options.caseInsensitive === false ? 'g' : 'gi';
  let matcher: RegExp;
  try {
    matcher = options.regex ? new RegExp(query, flags) : new RegExp(escapeRegExp(query), flags);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`正则表达式无效：${message}`);
  }

  const matches: PdfMatch[] = [];
  for (;;) {
    const match = matcher.exec(text);
    if (!match) break;
    const index = match.index;
    const length = match[0].length;
    const start = Math.max(0, index - SNIPPET_CONTEXT);
    const end = Math.min(text.length, index + length + SNIPPET_CONTEXT);
    matches.push({
      index,
      length,
      snippet: `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`,
    });

    if (matches.length >= limit) break;
    // 零宽匹配不会推进 lastIndex，手动前进避免死循环。
    if (length === 0) matcher.lastIndex += 1;
  }
  return matches;
}
