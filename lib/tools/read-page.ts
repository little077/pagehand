import type { AgentTool } from '@earendil-works/pi-agent-core';
import { Type } from 'typebox';
import { browser } from 'wxt/browser';
import {
  extractPageSnapshot,
  formatSnapshotForModel,
  type PageSnapshot,
} from '@/lib/page/snapshot';

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

type ReadPageDetails =
  | {
      title: string;
      url: string;
      totalChars: number;
      truncated: boolean;
      headingCount: number;
      linkCount: number;
    }
  | { error: string; url?: string };

const parameters = Type.Object({});

export const readPageTool: AgentTool<typeof parameters, ReadPageDetails> = {
  name: 'read_page',
  label: '读取当前页面',
  description:
    '读取用户当前标签页的标题、正文、标题结构和链接列表。当问题涉及“这个页面 / 当前页 / 这篇文章 / 网页上写了什么”时调用。只读，不点击、不提交、不修改页面。不要用它打开新网页，也不要用它读取浏览器内部页面（chrome://、扩展商店）。',
  parameters,
  replay: 'safe',
  async execute(_toolCallId, _params, signal) {
    if (signal?.aborted) {
      return {
        isError: true,
        content: [{ type: 'text', text: '读取已取消。' }],
        details: { error: 'aborted' },
      };
    }

    const [tab] = await browser.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab?.id) {
      return {
        isError: true,
        content: [{ type: 'text', text: '找不到当前标签页，请先打开一个网页再试。' }],
        details: { error: 'no_active_tab' },
      };
    }

    if (tab.url && !/^https?:/i.test(tab.url)) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: '当前标签页不是普通网页（可能是浏览器内部页或扩展商店），Pagehand 无法读取。请切换到一个 http/https 网页。',
          },
        ],
        details: { error: 'unsupported_scheme', url: tab.url },
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
            text: `读取页面失败：${message}。可能是当前标签页没有授权，回到要读取的页面后重新点击扩展图标再试。`,
          },
        ],
        details: { error: message },
      };
    }
  },
};
