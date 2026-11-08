export interface TabSummary {
  id: number;
  title: string;
  url: string;
  active: boolean;
}

export type TabScope = 'current_window' | 'all_windows';

export function formatTabListForModel(tabs: TabSummary[], scope: TabScope): string {
  if (tabs.length === 0) {
    return '没有找到可读取的网页标签页。当前窗口可能只有浏览器内部页（chrome://、扩展商店）或空白页。';
  }

  const scopeLabel = scope === 'all_windows' ? '所有窗口' : '当前窗口';
  const lines = [`${scopeLabel}共 ${tabs.length} 个可读取的网页标签页：`];
  tabs.forEach((tab, index) => {
    const active = tab.active ? '[当前] ' : '';
    lines.push(`${index + 1}. [tab_id=${tab.id}] ${active}${tab.title || '（无标题）'}`);
    lines.push(`   ${tab.url}`);
  });
  lines.push(
    '',
    '需要读取某个标签页的正文时，调用 read_tab 并传入对应的 tab_id；不要凭标题猜 URL。',
  );
  return lines.join('\n');
}

export interface SelectionResult {
  title: string;
  url: string;
  text: string;
  totalChars: number;
  truncated: boolean;
}

export const SELECTION_MAX_CHARS = 12_000;

export function formatSelectionForModel(selection: SelectionResult): string {
  if (!selection.text) {
    return '当前页面没有选中文本。请先让用户选中要处理的文字，或改用 read_page 读取整页。';
  }

  const lines = [
    `页面标题：${selection.title || '（无标题）'}`,
    `页面地址：${selection.url}`,
    `选中文本长度：${selection.totalChars} 字${selection.truncated ? `（以下为前 ${SELECTION_MAX_CHARS} 字）` : ''}`,
    '',
    '【选中文本】',
    selection.text,
  ];
  return lines.join('\n');
}
