import { describe, expect, it } from 'vitest';
import {
  clampMaxLength,
  isPdfUrl,
  normalizeSelector,
  READ_DEFAULT_MAX_CHARS,
  READ_MAX_MAX_CHARS,
  READ_MIN_MAX_CHARS,
  type ReadOutcome,
} from '@/lib/page/reader';
import { formatReadResultForModel } from '@/lib/tools/format';

describe('normalizeSelector', () => {
  it('strips quotes the model wrapped around the selector', () => {
    expect(normalizeSelector('"#main"')).toBe('#main');
    expect(normalizeSelector("'.result'")).toBe('.result');
  });

  it('strips a single stray quote at either end', () => {
    expect(normalizeSelector('#main"')).toBe('#main');
    expect(normalizeSelector('"#main')).toBe('#main');
  });

  it('leaves valid selectors with internal quotes untouched', () => {
    expect(normalizeSelector('a[href="https://example.com"]')).toBe(
      'a[href="https://example.com"]',
    );
  });

  it('treats blank input as no selector', () => {
    expect(normalizeSelector(undefined)).toBeNull();
    expect(normalizeSelector('   ')).toBeNull();
  });
});

describe('clampMaxLength', () => {
  it('uses the default when omitted or invalid', () => {
    expect(clampMaxLength(undefined)).toBe(READ_DEFAULT_MAX_CHARS);
    expect(clampMaxLength(Number.NaN)).toBe(READ_DEFAULT_MAX_CHARS);
  });

  it('keeps values inside the allowed range', () => {
    expect(clampMaxLength(10)).toBe(READ_MIN_MAX_CHARS);
    expect(clampMaxLength(1_000_000)).toBe(READ_MAX_MAX_CHARS);
    expect(clampMaxLength(20_000)).toBe(20_000);
  });
});

describe('isPdfUrl', () => {
  it('detects pdf URLs with query strings and fragments', () => {
    expect(isPdfUrl('https://example.com/report.pdf')).toBe(true);
    expect(isPdfUrl('https://example.com/report.pdf?download=1')).toBe(true);
    expect(isPdfUrl('https://example.com/report.pdf#page=2')).toBe(true);
  });

  it('does not flag normal pages', () => {
    expect(isPdfUrl('https://example.com/post')).toBe(false);
    expect(isPdfUrl('https://example.com/pdf-viewer')).toBe(false);
  });
});

const outcome: ReadOutcome = {
  tabId: 7,
  title: '示例文章',
  url: 'https://example.com/post',
  mode: 'markdown',
  selector: null,
  frameId: 0,
  content: '# 示例文章\n\n第一段正文。',
  totalChars: 16,
  truncated: false,
  frames: [],
};

describe('formatReadResultForModel', () => {
  it('includes title, url, mode and content', () => {
    const text = formatReadResultForModel(outcome);
    expect(text).toContain('页面标题：示例文章');
    expect(text).toContain('页面地址：https://example.com/post');
    expect(text).toContain('读取方式：整页 Markdown');
    expect(text).toContain('内容来源：顶层页面');
    expect(text).toContain('第一段正文。');
  });

  it('reports the selector and child frame when reading a scoped region', () => {
    const text = formatReadResultForModel({
      ...outcome,
      selector: '#main',
      frameId: 3,
      mode: 'text',
    });
    expect(text).toContain('选择器：#main');
    expect(text).toContain('内容来源：子框架（frame_id=3）');
  });

  it('does not pretend an empty page has content', () => {
    const text = formatReadResultForModel({ ...outcome, content: '', totalChars: 0 });
    expect(text).toContain('（页面没有可读正文）');
  });
});
