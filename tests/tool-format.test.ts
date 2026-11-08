import { describe, expect, it } from 'vitest';
import {
  formatSelectionForModel,
  formatTabListForModel,
  type SelectionResult,
  type TabSummary,
} from '@/lib/tools/format';

const tabs: TabSummary[] = [
  { id: 7, title: '商品详情', url: 'https://shop.example.com/a', active: true },
  { id: 9, title: '', url: 'https://docs.example.com/guide', active: false },
];

describe('formatTabListForModel', () => {
  it('lists tab_id, active marker and url', () => {
    const text = formatTabListForModel(tabs, 'current_window');
    expect(text).toContain('当前窗口共 2 个可读取的网页标签页');
    expect(text).toContain('[tab_id=7] [当前] 商品详情');
    expect(text).toContain('[tab_id=9] （无标题）');
    expect(text).toContain('https://docs.example.com/guide');
    expect(text).toContain('调用 read_tab');
  });

  it('explains an empty tab list instead of pretending there is content', () => {
    const text = formatTabListForModel([], 'all_windows');
    expect(text).toContain('没有找到可读取的网页标签页');
  });
});

const selection: SelectionResult = {
  title: '示例文章',
  url: 'https://example.com/post',
  text: '选中的第一段。',
  totalChars: 7,
  truncated: false,
};

describe('formatSelectionForModel', () => {
  it('includes page context and selected text', () => {
    const text = formatSelectionForModel(selection);
    expect(text).toContain('页面标题：示例文章');
    expect(text).toContain('页面地址：https://example.com/post');
    expect(text).toContain('【选中文本】');
    expect(text).toContain('选中的第一段。');
    expect(text).not.toContain('以下为前');
  });

  it('mentions truncation only when truncated', () => {
    const text = formatSelectionForModel({ ...selection, truncated: true });
    expect(text).toContain('以下为前 12000 字');
  });

  it('tells the model how to recover when nothing is selected', () => {
    const text = formatSelectionForModel({ ...selection, text: '', totalChars: 0 });
    expect(text).toContain('没有选中文本');
    expect(text).toContain('read_page');
  });
});
