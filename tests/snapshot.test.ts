import { describe, expect, it } from 'vitest';
import { formatSnapshotForModel, type PageSnapshot } from '@/lib/page/snapshot';

const snapshot: PageSnapshot = {
  title: '示例文章',
  url: 'https://example.com/post',
  text: '第一段正文。\n\n第二段正文。',
  totalChars: 16,
  truncated: false,
  headings: [
    { level: 1, text: '示例文章' },
    { level: 2, text: '小节' },
  ],
  links: [{ text: '延伸阅读', href: 'https://example.com/more' }],
};

describe('formatSnapshotForModel', () => {
  it('includes title, url, body, headings and links', () => {
    const text = formatSnapshotForModel(snapshot);
    expect(text).toContain('页面标题：示例文章');
    expect(text).toContain('页面地址：https://example.com/post');
    expect(text).toContain('第一段正文。');
    expect(text).toContain('# 示例文章');
    expect(text).toContain('## 小节');
    expect(text).toContain('- 延伸阅读 → https://example.com/more');
  });

  it('mentions truncation only when truncated', () => {
    expect(formatSnapshotForModel(snapshot)).not.toContain('以下为前');
    const truncated = formatSnapshotForModel({ ...snapshot, truncated: true });
    expect(truncated).toContain('以下为前 12000 字');
  });

  it('handles empty pages', () => {
    const text = formatSnapshotForModel({
      ...snapshot,
      text: '',
      headings: [],
      links: [],
    });
    expect(text).toContain('（页面没有可读正文）');
    expect(text).not.toContain('【标题结构】');
    expect(text).not.toContain('【页面链接');
  });
});
