export const OFFSCREEN_CONVERT_MESSAGE = 'pagehand:html-to-markdown';
export const OFFSCREEN_CROP_MESSAGE = 'pagehand:crop-image';
export const OFFSCREEN_PDF_INFO_MESSAGE = 'pagehand:pdf-info';
export const OFFSCREEN_PDF_READ_MESSAGE = 'pagehand:pdf-read';
export const OFFSCREEN_PDF_SEARCH_MESSAGE = 'pagehand:pdf-search';

export interface OffscreenConvertRequest {
  type: typeof OFFSCREEN_CONVERT_MESSAGE;
  html: string;
  url?: string;
  article?: boolean;
}

export type OffscreenConvertResponse =
  | { ok: true; markdown: string }
  | { ok: false; error: string };

export interface OffscreenCropRequest {
  type: typeof OFFSCREEN_CROP_MESSAGE;
  dataUrl: string;
  crop?: { x: number; y: number; width: number; height: number };
  maxDimension?: number;
  quality?: number;
}

export type OffscreenCropResponse =
  | { ok: true; dataUrl: string; width: number; height: number }
  | { ok: false; error: string };

export function isConvertRequest(value: unknown): value is OffscreenConvertRequest {
  if (!value || typeof value !== 'object') return false;
  const message = value as { type?: unknown; html?: unknown };
  return message.type === OFFSCREEN_CONVERT_MESSAGE && typeof message.html === 'string';
}

export interface PdfOutlineItem {
  title: string;
  page?: number;
  level: number;
}

export interface PdfInfoData {
  pageCount: number;
  title?: string;
  author?: string;
  subject?: string;
  keywords?: string;
  creationDate?: string;
  outline: PdfOutlineItem[];
  outlineTruncated: boolean;
}

export interface PdfReadData {
  text: string;
  pages: number[];
  requestedPages: number;
  truncated: boolean;
}

export interface PdfSearchHitData {
  page: number;
  index: number;
  length: number;
  snippet: string;
}

export interface PdfSearchData {
  hits: PdfSearchHitData[];
  truncated: boolean;
  pagesScanned: number;
}

export interface OffscreenPdfInfoRequest {
  type: typeof OFFSCREEN_PDF_INFO_MESSAGE;
  url: string;
}

export interface OffscreenPdfReadRequest {
  type: typeof OFFSCREEN_PDF_READ_MESSAGE;
  url: string;
  pageRange?: string;
  maxChars?: number;
}

export interface OffscreenPdfSearchRequest {
  type: typeof OFFSCREEN_PDF_SEARCH_MESSAGE;
  url: string;
  query: string;
  pageRange?: string;
  regex?: boolean;
  caseInsensitive?: boolean;
  maxHits?: number;
}

export type OffscreenPdfInfoResponse =
  | { ok: true; info: PdfInfoData }
  | { ok: false; error: string };

export type OffscreenPdfReadResponse =
  | { ok: true; result: PdfReadData }
  | { ok: false; error: string };

export type OffscreenPdfSearchResponse =
  | { ok: true; result: PdfSearchData }
  | { ok: false; error: string };

export function isPdfInfoRequest(value: unknown): value is OffscreenPdfInfoRequest {
  if (!value || typeof value !== 'object') return false;
  const message = value as { type?: unknown; url?: unknown };
  return message.type === OFFSCREEN_PDF_INFO_MESSAGE && typeof message.url === 'string';
}

export function isPdfReadRequest(value: unknown): value is OffscreenPdfReadRequest {
  if (!value || typeof value !== 'object') return false;
  const message = value as {
    type?: unknown;
    url?: unknown;
    pageRange?: unknown;
    maxChars?: unknown;
  };
  if (message.type !== OFFSCREEN_PDF_READ_MESSAGE || typeof message.url !== 'string') {
    return false;
  }
  if (message.pageRange !== undefined && typeof message.pageRange !== 'string') return false;
  if (message.maxChars !== undefined && !Number.isFinite(message.maxChars)) return false;
  return true;
}

export function isPdfSearchRequest(value: unknown): value is OffscreenPdfSearchRequest {
  if (!value || typeof value !== 'object') return false;
  const message = value as {
    type?: unknown;
    url?: unknown;
    query?: unknown;
    pageRange?: unknown;
    regex?: unknown;
    caseInsensitive?: unknown;
    maxHits?: unknown;
  };
  if (
    message.type !== OFFSCREEN_PDF_SEARCH_MESSAGE ||
    typeof message.url !== 'string' ||
    typeof message.query !== 'string'
  ) {
    return false;
  }
  if (message.pageRange !== undefined && typeof message.pageRange !== 'string') return false;
  if (message.regex !== undefined && typeof message.regex !== 'boolean') return false;
  if (message.caseInsensitive !== undefined && typeof message.caseInsensitive !== 'boolean') {
    return false;
  }
  if (message.maxHits !== undefined && !Number.isFinite(message.maxHits)) return false;
  return true;
}

export function isCropRequest(value: unknown): value is OffscreenCropRequest {
  if (!value || typeof value !== 'object') return false;
  const message = value as {
    type?: unknown;
    dataUrl?: unknown;
    crop?: Record<string, unknown> | null;
    maxDimension?: unknown;
  };
  if (message.type !== OFFSCREEN_CROP_MESSAGE || typeof message.dataUrl !== 'string') {
    return false;
  }
  if (message.crop !== undefined) {
    const crop = message.crop;
    if (!crop || typeof crop !== 'object') return false;
    if (!['x', 'y', 'width', 'height'].every((key) => Number.isFinite(crop[key]))) {
      return false;
    }
  }
  if (message.maxDimension !== undefined && !Number.isFinite(message.maxDimension)) {
    return false;
  }
  return true;
}
