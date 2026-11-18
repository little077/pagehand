import type { PdfInfoData, PdfReadData, PdfSearchData } from '@/lib/page/offscreen-protocol';

function formatPdfDate(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  const match = raw.match(/^D?:?(\d{4})(\d{2})?(\d{2})?(\d{2})?(\d{2})?(\d{2})?/);
  if (!match) return raw;
  const [, year, month, day, hour, minute, second] = match;
  let result = year ?? raw;
  if (month) result += `-${month}`;
  if (day) result += `-${day}`;
  if (hour) result += ` ${hour}`;
  if (minute) result += `:${minute}`;
  if (second) result += `:${second}`;
  return result;
}

export function formatPdfInfo(info: PdfInfoData): string {
  const lines = [`页数：${info.pageCount}`];
  if (info.title) lines.push(`标题：${info.title}`);
  if (info.author) lines.push(`作者：${info.author}`);
  if (info.subject) lines.push(`主题：${info.subject}`);
  if (info.keywords) lines.push(`关键词：${info.keywords}`);
  const created = formatPdfDate(info.creationDate);
  if (created) lines.push(`创建时间：${created}`);

  lines.push('');
  if (info.outline.length === 0) {
    lines.push('目录：无');
    return lines.join('\n');
  }

  lines.push(`目录${info.outlineTruncated ? '（已截断）' : ''}：`);
  for (const item of info.outline) {
    const indent = '  '.repeat(item.level + 1);
    const page = item.page !== undefined ? `（第 ${item.page} 页）` : '';
    lines.push(`${indent}- ${item.title}${page}`);
  }
  return lines.join('\n');
}

export function formatPdfRead(data: PdfReadData): string {
  if (!data.text.trim()) {
    return (
      '这几页没有可提取的文字，可能是扫描件或纯图片 PDF。' +
      '可以改用 screenshot 截取当前 PDF 页面，交给支持图片输入的模型。'
    );
  }

  if (!data.truncated) return data.text;
  return `${data.text}\n\n...(已截断，共返回 ${data.text.length} 字符；可以用 page_range 继续读后面的页)`;
}

export function formatPdfSearch(query: string, data: PdfSearchData): string {
  if (data.hits.length === 0) {
    return `没有找到「${query}」（扫描了 ${data.pagesScanned} 页）。`;
  }

  const pages = new Set(data.hits.map((hit) => hit.page)).size;
  const header = data.truncated
    ? `找到 ${data.hits.length}+ 条「${query}」的命中，分布在 ${pages} 页（结果已截断）：`
    : `找到 ${data.hits.length} 条「${query}」的命中，分布在 ${pages} 页：`;
  const lines = [header];
  for (const hit of data.hits) {
    const snippet = hit.snippet.replace(/\s+/g, ' ').trim();
    lines.push(`[第 ${hit.page} 页] ${snippet}`);
  }
  return lines.join('\n');
}
