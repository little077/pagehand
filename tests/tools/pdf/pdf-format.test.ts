import { describe, expect, it } from 'vitest';
import type { PdfInfoData, PdfReadData, PdfSearchData } from '@/lib/page/offscreen-protocol';
import { formatPdfInfo, formatPdfRead, formatPdfSearch } from '@/lib/tools/pdf-format';

describe('PDF info 格式化', () => {
  const info: PdfInfoData = {
    pageCount: 12,
    title: '测试报告',
    author: '张三',
    creationDate: 'D:20260102123456',
    outline: [
      { title: '第一章', page: 1, level: 0 },
      { title: '1.1 背景', page: 2, level: 1 },
    ],
    outlineTruncated: false,
  };

  it('包含元信息和目录缩进', () => {
    const text = formatPdfInfo(info);
    expect(text).toContain('页数：12');
    expect(text).toContain('标题：测试报告');
    expect(text).toContain('作者：张三');
    expect(text).toContain('创建时间：2026-01-02 12:34:56');
    expect(text).toContain('  - 第一章（第 1 页）');
    expect(text).toContain('    - 1.1 背景（第 2 页）');
  });

  it('没有目录时明确说明', () => {
    const text = formatPdfInfo({ ...info, outline: [] });
    expect(text).toContain('目录：无');
  });
});

describe('PDF read 格式化', () => {
  it('空文本提示扫描件', () => {
    const data: PdfReadData = {
      text: '',
      pages: [],
      requestedPages: 2,
      truncated: false,
    };
    expect(formatPdfRead(data)).toContain('可能是扫描件');
  });

  it('完整文本原样返回', () => {
    const data: PdfReadData = {
      text: '=== Page 1 ===\n正文',
      pages: [1],
      requestedPages: 1,
      truncated: false,
    };
    expect(formatPdfRead(data)).toBe('=== Page 1 ===\n正文');
  });

  it('截断时追加提示', () => {
    const data: PdfReadData = {
      text: '正文',
      pages: [1],
      requestedPages: 3,
      truncated: true,
    };
    expect(formatPdfRead(data)).toContain('已截断');
  });
});

describe('PDF search 格式化', () => {
  it('没有命中时说明扫描页数', () => {
    const data: PdfSearchData = { hits: [], truncated: false, pagesScanned: 4 };
    expect(formatPdfSearch('违约金', data)).toContain('没有找到「违约金」');
    expect(formatPdfSearch('违约金', data)).toContain('扫描了 4 页');
  });

  it('命中按页码列出并压缩空白', () => {
    const data: PdfSearchData = {
      hits: [
        { page: 3, index: 0, length: 3, snippet: '第一条\n  违约金' },
        { page: 5, index: 0, length: 3, snippet: '违约金 上限' },
      ],
      truncated: true,
      pagesScanned: 5,
    };
    const text = formatPdfSearch('违约金', data);
    expect(text).toContain('找到 2+ 条');
    expect(text).toContain('[第 3 页] 第一条 违约金');
    expect(text).toContain('[第 5 页] 违约金 上限');
  });
});
