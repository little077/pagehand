import type { AgentTool } from '@earendil-works/pi-agent-core';
import { Type } from 'typebox';
import type { Browser } from 'wxt/browser';
import {
  requireToolTarget,
  toolTargetErrorCode,
  toolTargetErrorMessage,
  toolTargetOfTab,
} from '@/lib/agent/tool-targets';
import { pdfRedirectMessage } from '@/lib/page/pdf-detect';
import { READ_MODE_LABEL, readErrorCode, readErrorMessage, readPage } from '@/lib/page/reader';
import { formatReadResultForModel } from './format';
import type { ReadToolDetails } from './read-page';
import { readExtractionParameters } from './read-params';

const parameters = Type.Object({
  tab_id: Type.Optional(
    Type.Number({
      description: '要读取的标签页 id，来自 list_tabs 返回的 tab_id。省略时读取当前活动标签页。',
    }),
  ),
  ...readExtractionParameters,
});

export const readTabTool: AgentTool<typeof parameters, ReadToolDetails> = {
  name: 'read_tab',
  label: '读取指定标签页',
  description:
    '按 tab_id 读取浏览器里任意一个已经打开的标签页。用户说“另一个标签页 / 后台那个 / 我刚才打开的那个 / 我开着的其他页面”时用它；' +
    '如果用户说的是当前正在看的页面，直接用 read_page，不需要授权。' +
    '参数和 read_page 一样：默认整页 Markdown，长文用 article，可以用 selector 只读某一块、用 frame_id 读子框架。' +
    '可以读取后台标签页，不会切换过去。tab_id 必须来自 list_tabs，不要猜。' +
    '读取非当前标签页会先征求用户授权；用户拒绝或没回应就停下，不要绕路。' +
    '只读，不点击、不提交、不修改页面。',
  parameters,
  replay: 'safe',
  async execute(toolCallId, params, signal) {
    if (signal?.aborted) {
      return {
        isError: true,
        content: [{ type: 'text', text: '读取标签页已取消。' }],
        details: { error: 'aborted', code: 'unknown', tabId: params.tab_id },
      };
    }

    try {
      const result = await readPage({
        tabId: params.tab_id,
        mode: params.mode,
        selector: params.selector,
        maxLength: params.max_length,
        frameId: params.frame_id,
        ...(params.tab_id !== undefined
          ? {
              validateTarget: (tab: Browser.tabs.Tab) => {
                const target = toolTargetOfTab(tab);
                if (target) requireToolTarget(toolCallId, 'read_tab', target);
              },
            }
          : {}),
      });

      return {
        content: [{ type: 'text', text: formatReadResultForModel(result) }],
        details: {
          title: result.title,
          url: result.url,
          mode: result.mode,
          modeLabel: READ_MODE_LABEL[result.mode],
          frameId: result.frameId,
          totalChars: result.totalChars,
          truncated: result.truncated,
          frameCount: result.frames.length,
          tabId: result.tabId,
        },
      };
    } catch (error) {
      const targetCode = toolTargetErrorCode(error);
      if (targetCode) {
        const message = toolTargetErrorMessage(targetCode);
        return {
          isError: true,
          content: [{ type: 'text', text: message }],
          details: { error: message, code: targetCode, tabId: params.tab_id },
        };
      }
      if (readErrorCode(error) === 'pdf') {
        const message = pdfRedirectMessage(params.tab_id);
        return {
          content: [{ type: 'text', text: message }],
          details: {
            route: 'pdf',
            message,
            ...(params.tab_id !== undefined ? { tabId: params.tab_id } : {}),
          },
        };
      }
      return {
        isError: true,
        content: [{ type: 'text', text: readErrorMessage(error) }],
        details: {
          error: readErrorMessage(error),
          code: readErrorCode(error),
          tabId: params.tab_id,
        },
      };
    }
  },
};
