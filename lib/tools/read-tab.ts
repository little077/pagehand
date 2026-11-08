import type { AgentTool } from '@earendil-works/pi-agent-core';
import { Type } from 'typebox';
import { type Browser, browser } from 'wxt/browser';
import {
  extractPageSnapshot,
  formatSnapshotForModel,
  type PageSnapshot,
} from '@/lib/page/snapshot';
import { errorMessage } from './errors';

type ReadTabDetails =
  | {
      tabId: number;
      title: string;
      url: string;
      totalChars: number;
      truncated: boolean;
      headingCount: number;
      linkCount: number;
    }
  | { error: string; tabId?: number; url?: string };

const parameters = Type.Object({
  tab_id: Type.Optional(
    Type.Number({
      description: '要读取的标签页 id，来自 list_tabs 返回的 tab_id。省略时读取当前活动标签页。',
    }),
  ),
});

export const readTabTool: AgentTool<typeof parameters, ReadTabDetails> = {
  name: 'read_tab',
  label: '读取指定标签页',
  description:
    '按 tab_id 读取用户已经打开的某个标签页的标题、正文、标题结构和链接，可以读取后台标签，不会切换页面。tab_id 必须来自 list_tabs，不要猜。只读，不点击、不提交、不修改页面。',
  parameters,
  replay: 'safe',
  async execute(_toolCallId, params, signal) {
    if (signal?.aborted) {
      return {
        isError: true,
        content: [{ type: 'text', text: '读取已取消。' }],
        details: { error: 'aborted' },
      };
    }

    let tab: Browser.tabs.Tab | undefined;
    if (params.tab_id !== undefined) {
      try {
        tab = await browser.tabs.get(params.tab_id);
      } catch {
        return {
          isError: true,
          content: [
            {
              type: 'text',
              text: `找不到编号为 ${params.tab_id} 的标签页，可能已经关闭。请重新调用 list_tabs 获取最新的 tab_id。`,
            },
          ],
          details: { error: 'tab_not_found', tabId: params.tab_id },
        };
      }
    } else {
      [tab] = await browser.tabs.query({ active: true, lastFocusedWindow: true });
    }

    if (!tab?.id) {
      return {
        isError: true,
        content: [{ type: 'text', text: '找不到要读取的标签页，请先打开一个网页再试。' }],
        details: { error: 'no_tab', tabId: params.tab_id },
      };
    }

    if (!tab.url || !/^https?:/i.test(tab.url)) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `这个标签页不是普通网页（${tab.url ?? '未知地址'}），Pagehand 无法读取。请换一个 http/https 页面。`,
          },
        ],
        details: { error: 'unsupported_scheme', tabId: tab.id, url: tab.url },
      };
    }

    try {
      const results = await browser.scripting.executeScript({
        target: { tabId: tab.id },
        func: extractPageSnapshot,
      });
      const snapshot = results[0]?.result as PageSnapshot | undefined;
      if (!snapshot) {
        throw new Error('页面没有返回内容');
      }

      return {
        content: [{ type: 'text', text: formatSnapshotForModel(snapshot) }],
        details: {
          tabId: tab.id,
          title: snapshot.title,
          url: snapshot.url,
          totalChars: snapshot.totalChars,
          truncated: snapshot.truncated,
          headingCount: snapshot.headings.length,
          linkCount: snapshot.links.length,
        },
      };
    } catch (error) {
      const message = errorMessage(error);
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `读取标签页失败：${message}。如果这是 PDF、浏览器内部页或扩展商店，Pagehand 读不了；如果是休眠的后台标签，先在浏览器里打开它再试。`,
          },
        ],
        details: { error: message, tabId: tab.id, url: tab.url },
      };
    }
  },
};
