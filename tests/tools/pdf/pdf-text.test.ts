import { describe, expect, it } from 'vitest';
import {
  buildPageSegment,
  findPdfMatches,
  normalizePageText,
  parsePageRange,
} from '@/lib/page/pdf-text';

describe('PDF 页范围', () => {
  it('省略时返回全部页', () => {
    expect(parsePageRange(undefined, 3)).toEqual([1, 2, 3]);
    expect(parsePageRange('  ', 3)).toEqual([1, 2, 3]);
  });

  it('解析单页、区间和组合，并去重排序', () => {
    expect(parsePageRange('5', 10)).toEqual([5]);
    expect(parsePageRange('1-3,7,10-12', 20)).toEqual([1, 2, 3, 7, 10, 11, 12]);
    expect(parsePageRange('5-3,4', 10)).toEqual([3, 4, 5]);
  });

  it('越界页码夹到有效范围', () => {
    expect(parsePageRange('0,1,99', 5)).toEqual([1]);
    expect(parsePageRange('4-99', 5)).toEqual([4, 5]);
    expect(parsePageRange('99-100', 5)).toEqual([]);
  });

  it('语法错误直接抛出', () => {
    expect(() => parsePageRange('abc', 5)).toThrow('页码范围格式不正确');
    expect(() => parsePageRange('1-', 5)).toThrow('页码范围格式不正确');
  });
});

describe('PDF 文本整理', () => {
  it('压缩空格、统一换行、去掉多余空行', () => {
    expect(normalizePageText('  a   b \r\n\r\n\r\n c\t d  ')).toBe('a b\n\nc d');
  });

  it('页与页之间加分隔标记', () => {
    expect(buildPageSegment(1, '第一页', false)).toBe('=== Page 1 ===\n第一页');
    expect(buildPageSegment(2, '第二页', true)).toBe('\n\f\n=== Page 2 ===\n第二页');
  });
});

describe('PDF 搜索', () => {
  const page = '甲乙丙，甲乙丁。甲';

  it('默认不区分大小写并返回上下文', () => {
    const hits = findPdfMatches('Hello hello', 'hello');
    expect(hits).toHaveLength(2);
    expect(hits[0]).toMatchObject({ index: 0, length: 5 });
    expect(hits[1]).toMatchObject({ index: 6, length: 5 });
  });

  it('支持正则和大小写敏感', () => {
    expect(findPdfMatches('a1 b2 c3', '\\d', { regex: true })).toHaveLength(3);
    expect(findPdfMatches('A a', 'a', { caseInsensitive: false })).toHaveLength(1);
  });

  it('非法正则给出明确错误', () => {
    expect(() => findPdfMatches(page, '(', { regex: true })).toThrow('正则表达式无效');
  });

  it('命中数量受 limit 限制', () => {
    expect(findPdfMatches(page, '甲', { limit: 2 })).toHaveLength(2);
  });

  it('零宽正则不会死循环', () => {
    expect(findPdfMatches('abc', '(?=b)', { regex: true })).toHaveLength(1);
  });

  it('长文本两侧加省略号', () => {
    const long = `${'前'.repeat(200)}目标${'后'.repeat(200)}`;
    const [hit] = findPdfMatches(long, '目标');
    expect(hit?.snippet.startsWith('…')).toBe(true);
    expect(hit?.snippet.endsWith('…')).toBe(true);
  });
});
