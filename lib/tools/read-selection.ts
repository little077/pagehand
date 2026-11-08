import type { AgentTool } from '@earendil-works/pi-agent-core';
import { Type } from 'typebox';
import { browser } from 'wxt/browser';
import { errorMessage } from './errors';
import { formatSelectionForModel, type SelectionResult } from './format';

/**
 * Runs inside the target page via chrome.scripting.executeScript.
 * Keep it self-contained: it is serialized, so it cannot close over imports.
 */
export function extractSelection(): SelectionResult {
  const maxChars = 12_000;
  const cleanText = (value: string) =>
    value
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();

  let raw = '';
  const active = document.activeElement;
  if (active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement) {
    const start = active.selectionStart ?? 0;
    const end = active.selectionEnd ?? start;
    if (end > start) raw = active.value.slice(start, end);
  }
  if (!raw.trim()) {
    raw = window.getSelection()?.toString() ?? '';
  }

  const text = cleanText(raw);
  return {
    title: document.title,
    url: location.href,
    text: text.slice(0, maxChars),
    totalChars: text.length,
    truncated: text.length > maxChars,
  };
}

type ReadSelectionDetails =
  | { chars: number; truncated: boolean; empty: boolean; title: string; url: string }
  | { error: string };

const parameters = Type.Object({});

export const readSelectionTool: AgentTool<typeof parameters, ReadSelectionDetails> = {
  name: 'read_selection',
  label: '读取选中文本',
  description:
    '读取用户当前在页面上选中的文本，附带页面标题和 URL。当用户说“选中的这段 / 划线的内容 / 翻译我选的”时调用。只读当前活动标签页；没有选中时返回空结果，不要改用它去猜正文。',
  parameters,
  replay: 'safe',
  async execute(_toolCallId, _params, signal) {
    if (signal?.aborted) {
      return {
        isError: true,
        content: [{ type: 'text', text: '读取选中文本已取消。' }],
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

    if (!tab.url || !/^https?:/i.test(tab.url)) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: '当前标签页不是普通网页（可能是浏览器内部页或扩展商店），Pagehand 无法读取选中文本。',
          },
        ],
        details: { error: 'unsupported_scheme' },
      };
    }

    try {
      const results = await browser.scripting.executeScript({
        target: { tabId: tab.id },
        func: extractSelection,
      });
      const selection = results[0]?.result as SelectionResult | undefined;
      if (!selection) {
        throw new Error('页面没有返回选中内容');
      }

      return {
        content: [{ type: 'text', text: formatSelectionForModel(selection) }],
        details: {
          chars: selection.totalChars,
          truncated: selection.truncated,
          empty: selection.text.length === 0,
          title: selection.title,
          url: selection.url,
        },
      };
    } catch (error) {
      const message = errorMessage(error);
      return {
        isError: true,
        content: [{ type: 'text', text: `读取选中文本失败：${message}` }],
        details: { error: message },
      };
    }
  },
};
