import { describe, expect, it } from 'vitest';
import { hasPdfMagic, isPdfContentType, isPdfUrl, pdfRedirectMessage } from '@/lib/page/pdf-detect';

describe('PDF URL 判断', () => {
  it('识别 http/https/file 的 .pdf 地址', () => {
    expect(isPdfUrl('https://example.com/report.pdf')).toBe(true);
    expect(isPdfUrl('https://example.com/report.pdf?download=1')).toBe(true);
    expect(isPdfUrl('http://example.com/a/b/REPORT.PDF#page=2')).toBe(true);
    expect(isPdfUrl('file:///C:/docs/report.pdf')).toBe(true);
  });

  it('不把普通页面和内部页面当 PDF', () => {
    expect(isPdfUrl('https://example.com/post')).toBe(false);
    expect(isPdfUrl('https://example.com/pdf-viewer')).toBe(false);
    expect(isPdfUrl('chrome://extensions')).toBe(false);
    expect(isPdfUrl('chrome-extension://abc/index.html?file=x.pdf')).toBe(false);
    expect(isPdfUrl(null)).toBe(false);
    expect(isPdfUrl('not a url')).toBe(false);
  });
});

describe('PDF Content-Type', () => {
  it('接受 PDF、octet-stream 和空值', () => {
    expect(isPdfContentType('application/pdf')).toBe(true);
    expect(isPdfContentType('application/pdf; charset=binary')).toBe(true);
    expect(isPdfContentType('application/x-pdf')).toBe(true);
    expect(isPdfContentType('application/octet-stream')).toBe(true);
    expect(isPdfContentType('')).toBe(true);
    expect(isPdfContentType(null)).toBe(true);
  });

  it('拒绝 HTML 和其他明确类型', () => {
    expect(isPdfContentType('text/html')).toBe(false);
    expect(isPdfContentType('image/png')).toBe(false);
    expect(isPdfContentType('application/json')).toBe(false);
  });
});

describe('PDF 文件头', () => {
  it('只认 %PDF- 开头', () => {
    const magic = new TextEncoder().encode('%PDF-1.7\n');
    expect(hasPdfMagic(magic)).toBe(true);
    expect(hasPdfMagic(new TextEncoder().encode('%PDF'))).toBe(false);
    expect(hasPdfMagic(new TextEncoder().encode('<html>'))).toBe(false);
  });
});

describe('PDF 分流提示', () => {
  it('包含 tabId 和三个 action', () => {
    const message = pdfRedirectMessage(12);
    expect(message).toContain('标签页 12');
    expect(message).toContain('action="info"');
    expect(message).toContain('action="read"');
    expect(message).toContain('action="search"');
  });
});
