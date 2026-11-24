import type { PDFDocumentProxy } from 'pdfjs-dist';
import type {
  PdfInfoData,
  PdfOutlineItem,
  PdfReadData,
  PdfSearchData,
} from '@/lib/page/offscreen-protocol';
import { hasPdfMagic, isPdfContentType } from '@/lib/page/pdf-detect';
import {
  buildPageSegment,
  findPdfMatches,
  normalizePageText,
  parsePageRange,
} from '@/lib/page/pdf-text';
import { loadPdfJs } from './pdfjs-loader';

const PDF_MAX_BYTES = 80 * 1024 * 1024;
const CACHE_LIMIT = 2;
const OUTLINE_LIMIT = 40;
const OUTLINE_DEPTH = 2;
const DEFAULT_MAX_CHARS = 20_000;
const MAX_MAX_CHARS = 60_000;
const DEFAULT_MAX_HITS = 50;
const MAX_MAX_HITS = 200;
const TITLE_MAX_CHARS = 200;

const documentCache = new Map<string, Promise<PDFDocumentProxy>>();

function touchCache(url: string, promise: Promise<PDFDocumentProxy>): void {
  documentCache.delete(url);
  documentCache.set(url, promise);
  while (documentCache.size > CACHE_LIMIT) {
    const oldest = documentCache.keys().next().value;
    if (oldest === undefined) break;
    // 不在这里 destroy：可能还有调用正在遍历同一文档；缓存只保留最近两份。
    documentCache.delete(oldest);
  }
}

async function fetchPdfBytes(url: string): Promise<Uint8Array> {
  try {
    new URL(url);
  } catch {
    throw new Error(`PDF 地址无效：${url}`);
  }

  let response: Response;
  try {
    response = await fetch(url, { credentials: 'include', redirect: 'follow' });
  } catch (error) {
    if (error instanceof TypeError) {
      throw new Error('PDF 下载失败：网络不可达或地址无法访问。请检查地址后重试。');
    }
    throw error;
  }
  if (!response.ok) {
    throw new Error(`下载 PDF 失败：HTTP ${response.status} ${response.statusText}`);
  }

  const requestedUrl = new URL(url);
  const finalUrl = response.url ? new URL(response.url) : requestedUrl;
  if (finalUrl.origin !== requestedUrl.origin) {
    throw new Error('PDF 地址跳转到了其他网站，已停止读取。请直接打开最终 PDF 地址后重试。');
  }

  const contentType = response.headers.get('content-type');
  if (!isPdfContentType(contentType)) {
    throw new Error(`这个地址返回的不是 PDF（Content-Type: ${contentType ?? '未知'}）。`);
  }

  const declared = Number(response.headers.get('content-length') ?? '');
  if (Number.isFinite(declared) && declared > PDF_MAX_BYTES) {
    throw new Error(tooLargeMessage(declared));
  }

  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > PDF_MAX_BYTES) {
    throw new Error(tooLargeMessage(buffer.byteLength));
  }
  if (!hasPdfMagic(buffer)) {
    throw new Error('这个地址返回的内容不是有效的 PDF 文件。');
  }
  return new Uint8Array(buffer);
}

function tooLargeMessage(bytes: number): string {
  const size = (bytes / 1024 / 1024).toFixed(1);
  const cap = PDF_MAX_BYTES / 1024 / 1024;
  return `PDF 太大（${size} MB），当前上限是 ${cap} MB。`;
}

async function getDocument(url: string): Promise<PDFDocumentProxy> {
  const cached = documentCache.get(url);
  if (cached) {
    touchCache(url, cached);
    return cached;
  }

  const loading = (async () => {
    const pdfjs = await loadPdfJs();
    const bytes = await fetchPdfBytes(url);
    const task = pdfjs.getDocument({
      data: bytes,
      disableFontFace: true,
      verbosity: 0,
    });
    return task.promise;
  })();

  touchCache(url, loading);
  loading.catch(() => {
    if (documentCache.get(url) === loading) documentCache.delete(url);
  });
  return loading;
}

export function pdfErrorMessage(error: unknown): string {
  const name = (error as { name?: string } | null)?.name;
  if (name === 'PasswordException') return '这个 PDF 有密码，当前版本不支持解锁。';
  if (name === 'InvalidPDFException') return '这个文件不是有效的 PDF，或已经损坏。';
  return error instanceof Error ? error.message : String(error);
}

interface PdfTextItem {
  str: string;
  hasEOL: boolean;
}

async function extractPageText(doc: PDFDocumentProxy, pageNumber: number): Promise<string> {
  const page = await doc.getPage(pageNumber);
  try {
    const content = await page.getTextContent();
    let raw = '';
    for (const item of content.items) {
      if (!('str' in item)) continue;
      const textItem = item as PdfTextItem;
      raw += textItem.str;
      raw += textItem.hasEOL ? '\n' : ' ';
    }
    return normalizePageText(raw);
  } finally {
    page.cleanup();
  }
}

interface RawOutlineNode {
  title?: string;
  dest?: unknown;
  items?: RawOutlineNode[];
}

async function resolveOutlinePage(
  doc: PDFDocumentProxy,
  destination: unknown,
): Promise<number | undefined> {
  try {
    let target: unknown[] | null = null;
    if (Array.isArray(destination)) {
      target = destination;
    } else if (typeof destination === 'string') {
      const resolved = await doc.getDestination(destination);
      if (Array.isArray(resolved)) target = resolved;
    }
    if (!target || target.length === 0) return undefined;
    const pageIndex = await doc.getPageIndex(target[0] as never);
    return typeof pageIndex === 'number' ? pageIndex + 1 : undefined;
  } catch {
    return undefined;
  }
}

async function readOutline(doc: PDFDocumentProxy): Promise<{
  outline: PdfOutlineItem[];
  truncated: boolean;
}> {
  let raw: RawOutlineNode[] | null;
  try {
    raw = (await doc.getOutline()) as RawOutlineNode[] | null;
  } catch {
    raw = null;
  }
  if (!raw || raw.length === 0) return { outline: [], truncated: false };

  const outline: PdfOutlineItem[] = [];
  let truncated = false;

  async function walk(nodes: RawOutlineNode[], level: number): Promise<void> {
    for (const node of nodes) {
      if (outline.length >= OUTLINE_LIMIT) {
        truncated = true;
        return;
      }
      const title = (node.title ?? '').trim().slice(0, TITLE_MAX_CHARS);
      const page = await resolveOutlinePage(doc, node.dest);
      outline.push({ title, level, ...(page !== undefined ? { page } : {}) });

      if (node.items && node.items.length > 0) {
        if (level + 1 < OUTLINE_DEPTH) {
          await walk(node.items, level + 1);
        } else {
          truncated = true;
        }
      }
      if (outline.length >= OUTLINE_LIMIT) {
        truncated = true;
        return;
      }
    }
  }

  await walk(raw, 0);
  return { outline, truncated };
}

function textValue(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export async function handlePdfInfo(url: string): Promise<PdfInfoData> {
  const doc = await getDocument(url);
  const metadata = await doc.getMetadata().catch(() => null);
  const info = (metadata?.info ?? {}) as Record<string, unknown>;
  const { outline, truncated } = await readOutline(doc);

  return {
    pageCount: doc.numPages,
    ...(textValue(info.Title) ? { title: textValue(info.Title) } : {}),
    ...(textValue(info.Author) ? { author: textValue(info.Author) } : {}),
    ...(textValue(info.Subject) ? { subject: textValue(info.Subject) } : {}),
    ...(textValue(info.Keywords) ? { keywords: textValue(info.Keywords) } : {}),
    ...(textValue(info.CreationDate) ? { creationDate: textValue(info.CreationDate) } : {}),
    outline,
    outlineTruncated: truncated,
  };
}

export async function handlePdfRead(
  url: string,
  pageRange: string | undefined,
  maxChars: number | undefined,
): Promise<PdfReadData> {
  const doc = await getDocument(url);
  const pages = parsePageRange(pageRange, doc.numPages);
  if (pages.length === 0) {
    throw new Error(`页码范围「${pageRange ?? ''}」没有匹配到任何页（共 ${doc.numPages} 页）。`);
  }

  const limit = Math.min(MAX_MAX_CHARS, Math.max(1, Math.floor(maxChars ?? DEFAULT_MAX_CHARS)));
  const segments: string[] = [];
  const included: number[] = [];
  let total = 0;
  let truncated = false;
  let hasText = false;

  for (const pageNumber of pages) {
    const pageText = await extractPageText(doc, pageNumber);
    if (pageText) hasText = true;
    const segment = buildPageSegment(pageNumber, pageText, segments.length > 0);

    if (total + segment.length > limit) {
      const remaining = Math.max(0, limit - total);
      if (remaining > 0) {
        segments.push(segment.slice(0, remaining));
        included.push(pageNumber);
      }
      truncated = true;
      break;
    }

    segments.push(segment);
    included.push(pageNumber);
    total += segment.length;
    if (total >= limit) {
      truncated = true;
      break;
    }
  }

  return {
    text: hasText ? segments.join('') : '',
    pages: hasText ? included : [],
    requestedPages: pages.length,
    truncated,
  };
}

export async function handlePdfSearch(
  url: string,
  query: string,
  pageRange: string | undefined,
  options: { regex?: boolean; caseInsensitive?: boolean; maxHits?: number } = {},
): Promise<PdfSearchData> {
  if (!query.trim()) throw new Error('搜索词不能为空。');
  const doc = await getDocument(url);
  const pages = parsePageRange(pageRange, doc.numPages);
  if (pages.length === 0) {
    throw new Error(`页码范围「${pageRange ?? ''}」没有匹配到任何页（共 ${doc.numPages} 页）。`);
  }

  const maxHits = Math.min(
    MAX_MAX_HITS,
    Math.max(1, Math.floor(options.maxHits ?? DEFAULT_MAX_HITS)),
  );
  const hits: PdfSearchData['hits'] = [];
  let pagesScanned = 0;
  let truncated = false;

  for (const pageNumber of pages) {
    pagesScanned += 1;
    const pageText = await extractPageText(doc, pageNumber);
    const matches = findPdfMatches(pageText, query, {
      ...(options.regex !== undefined ? { regex: options.regex } : {}),
      ...(options.caseInsensitive !== undefined
        ? { caseInsensitive: options.caseInsensitive }
        : {}),
      limit: maxHits - hits.length,
    });
    for (const match of matches) hits.push({ page: pageNumber, ...match });

    if (hits.length >= maxHits) {
      truncated = true;
      break;
    }
  }

  return { hits, truncated, pagesScanned };
}
