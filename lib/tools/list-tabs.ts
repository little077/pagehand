import type { AgentTool } from '@earendil-works/pi-agent-core';
import { Type } from 'typebox';
import { browser } from 'wxt/browser';
import { errorMessage } from './errors';
import { formatTabListForModel, type TabSummary } from './format';

type ListTabsDetails = { count: number; tabs: TabSummary[] } | { error: string };

const parameters = Type.Object({
  all_windows: Type.Optional(
    Type.Boolean({
      description: '是否列出所有窗口的标签页。默认 false，只列当前窗口。',
    }),
  ),
});

export const listTabsTool: AgentTool<typeof parameters, ListTabsDetails> = {
  name: 'list_tabs',
  label: '列出标签页',
  description:
    '列出用户浏览器里已打开的网页标签页：tab_id、标题、URL、是否当前页。当用户说“我开了哪些页面 / 另一个标签页 / 刚才那个页面”，或任务需要跨多个已开页面时先调用。只读，不读正文、不切换、不关闭标签。',
  parameters,
  replay: 'safe',
  async execute(_toolCallId, params, signal) {
    if (signal?.aborted) {
      return {
        isError: true,
        content: [{ type: 'text', text: '列标签页已取消。' }],
        details: { error: 'aborted' },
      };
    }

    const allWindows = params.all_windows === true;

    try {
      const tabs = await browser.tabs.query(allWindows ? {} : { currentWindow: true });
      const summaries: TabSummary[] = [];
      for (const tab of tabs) {
        if (tab.id === undefined) continue;
        if (!tab.url || !/^https?:/i.test(tab.url)) continue;
        summaries.push({
          id: tab.id,
          title: (tab.title ?? '').trim(),
          url: tab.url,
          active: tab.active === true,
        });
      }

      return {
        content: [
          {
            type: 'text',
            text: formatTabListForModel(summaries, allWindows ? 'all_windows' : 'current_window'),
          },
        ],
        details: { count: summaries.length, tabs: summaries },
      };
    } catch (error) {
      const message = errorMessage(error);
      return {
        isError: true,
        content: [{ type: 'text', text: `列出标签页失败：${message}` }],
        details: { error: message },
      };
    }
  },
};
