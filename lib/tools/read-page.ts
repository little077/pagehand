import type { AgentTool } from '@earendil-works/pi-agent-core';
import { Type } from 'typebox';
import type { ToolTargetErrorCode } from '@/lib/agent/tool-targets';
import { pdfRedirectMessage } from '@/lib/page/pdf-detect';
import {
  READ_MODE_LABEL,
  type ReadErrorCode,
  type ReadMode,
  readErrorCode,
  readErrorMessage,
  readPage,
} from '@/lib/page/reader';
import { formatReadResultForModel } from './format';
import { readExtractionParameters } from './read-params';

export type ReadToolDetails =
  | {
      title: string;
      url: string;
      mode: ReadMode;
      modeLabel: string;
      frameId: number;
      totalChars: number;
      truncated: boolean;
      frameCount: number;
      tabId?: number;
    }
  | { error: string; code: ReadErrorCode | ToolTargetErrorCode | 'unknown'; tabId?: number }
  | { route: 'pdf'; message: string; tabId?: number };

const parameters = Type.Object({ ...readExtractionParameters });

export const readPageTool: AgentTool<typeof parameters, ReadToolDetails> = {
  name: 'read_page',
  label: '读取当前页面',
  description:
    '读取用户当前正在看的这个标签页的正文。用户说“这个页面 / 当前页 / 我正看的 / 这篇文章 / 页面上写了什么”时用它。' +
    '默认把整页转成 Markdown，标题、链接、图片都保留，链接是绝对地址。' +
    '长文章用 mode="article" 去掉导航和侧栏；只想要文字用 mode="text"；排查页面结构用 mode="html"。' +
    '可以用 selector 只读某一块，用 frame_id 读页面里的子框架。同一路径同时出现裸链接和带参数的链接时，优先引用带参数的完整 URL；裸路径可能缺少运行时 token。' +
    '如果用户指的是浏览器里的另一个标签页（“另一个页面 / 后台那个 / 我刚才开的 / 我开着的其他页面”），不要用这个工具：' +
    '先调用 list_tabs 找到 tab_id，再用 read_tab。' +
    '只读，不点击、不提交、不修改页面。不要读 chrome:// 或扩展商店；PDF 请改用 pdf 工具。',
  parameters,
  replay: 'safe',
  async execute(_toolCallId, params, signal) {
    if (signal?.aborted) {
      return {
        isError: true,
        content: [{ type: 'text', text: '读取页面已取消。' }],
        details: { error: 'aborted', code: 'unknown' },
      };
    }

    try {
      const result = await readPage({
        mode: params.mode,
        selector: params.selector,
        maxLength: params.max_length,
        frameId: params.frame_id,
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
        },
      };
    } catch (error) {
      if (readErrorCode(error) === 'pdf') {
        const message = pdfRedirectMessage();
        return {
          content: [{ type: 'text', text: message }],
          details: { route: 'pdf', message },
        };
      }
      return {
        isError: true,
        content: [{ type: 'text', text: readErrorMessage(error) }],
        details: { error: readErrorMessage(error), code: readErrorCode(error) },
      };
    }
  },
};
