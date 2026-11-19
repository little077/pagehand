import type { AgentTool } from '@earendil-works/pi-agent-core';
import { Type } from 'typebox';
import { browser } from 'wxt/browser';
import {
  collectInteractiveElements,
  type InspectCollectOptions,
  type InspectKind,
} from '@/lib/page/inspect';
import { errorMessage } from './errors';
import { type InspectCacheEntry, inspectCacheKey, shouldReuseInspect } from './inspect-cache';
import { formatInspectForModel, type InspectDetails, toInspectDetails } from './inspect-format';

const parameters = Type.Object({
  selector: Type.Optional(
    Type.String({
      description:
        '只看页面里匹配这个 CSS 选择器的区域，省略则检查整页。写错会明确报错，按报错改正即可。',
      maxLength: 500,
    }),
  ),
  text: Type.Optional(
    Type.String({
      description:
        '只保留名称、提示文字或文字里包含这个片段的元素，不区分大小写。例如用户说“找写着立即购买的按钮”时传“立即购买”。',
      maxLength: 200,
    }),
  ),
  role: Type.Optional(
    Type.String({
      description:
        '只返回角色匹配的元素，例如 textbox（文本输入）、searchbox（搜索框）、button、link、checkbox、combobox、radio。不区分大小写。',
      maxLength: 40,
    }),
  ),
  kind: Type.Optional(
    Type.Union([Type.Literal('input'), Type.Literal('button'), Type.Literal('link')], {
      description:
        '按大类过滤：input 是输入类（输入框、文本域、下拉框、可编辑区域），button 是按钮类，link 是链接类。找输入框时优先用它。',
    }),
  ),
  input_type: Type.Optional(
    Type.String({
      description:
        '只返回 input 的 type 匹配的输入框，例如 search、email、tel、text。密码框始终不会返回。',
      maxLength: 40,
    }),
  ),
  include_hidden: Type.Optional(
    Type.Boolean({
      description:
        '是否把不可见的元素也列出来，默认 false。排查“按钮为什么点不到”时传 true，结果会说明每个元素不可见的原因。',
    }),
  ),
  limit: Type.Optional(
    Type.Number({
      description: '最多返回多少个元素，默认 40，范围 1～200。',
      minimum: 1,
      maximum: 200,
    }),
  ),
  frame_id: Type.Optional(
    Type.Number({
      description:
        '要检查的子框架 id，默认 0（顶层页面）。先不传读取整页，结果里出现子框架提示时再用对应的 frame_id。',
      minimum: 0,
    }),
  ),
});

type InjectionDetails = {
  target: { tabId: number; frameIds?: number[] };
  func: (...args: unknown[]) => unknown;
  args?: unknown[];
};

type InjectionResult = { frameId: number; result?: unknown };

const injectScript = browser.scripting.executeScript as unknown as (
  details: InjectionDetails,
) => Promise<InjectionResult[]>;

const lastInspect = new Map<number, InspectCacheEntry>();

/** 写操作后页面可能已经变化，下一次 inspect 不应再复用旧结果。 */
export function invalidateInspectCache(tabId: number): void {
  lastInspect.delete(tabId);
}

function normalizeFrameId(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

export const inspectTool: AgentTool<typeof parameters, InspectDetails> = {
  name: 'inspect',
  label: '检查页面元素',
  description:
    '列出当前页面里能操作的元素：按钮、链接、输入框、下拉框、复选框、可编辑区域。每个元素带编号（如 e3）、类型、名称、名称来源、placeholder、input type、name、当前值、是否可见、是否被遮挡，以及不可见的原因。' +
    '用户问“这个页面哪里能点 / 按钮在哪 / 输入框在哪 / 为什么点不动”，或者你需要先确认页面上有什么再决定下一步时用它。' +
    '找输入框优先用 kind="input" 或 role="textbox"；找搜索框用 input_type="search"；找按钮用 kind="button"。' +
    '结果里已经有 placeholder、input_type、name 等字段，需要这些信息时直接看结果，不要再读一遍 HTML。' +
    '要读文章正文用 read_page，不要用 inspect；要看图表等画面用截图。' +
    'ref 在元素移除或页面跳转后失效；要操作时用 interact。' +
    '不可见元素默认不列出，排查点击问题时可传 include_hidden=true。' +
    '出于安全考虑，密码框不会出现在结果里。' +
    '只读：不点击、不填写、不滚动、不修改页面。需要操作页面时用 interact。shadow DOM 内部和跨域 iframe 的正文不在结果里。',
  parameters,
  replay: 'safe',
  async execute(_toolCallId, params, signal) {
    if (signal?.aborted) {
      return {
        isError: true,
        content: [{ type: 'text', text: '检查页面元素已取消。' }],
        details: { error: '检查已取消', code: 'unknown' },
      };
    }

    const [tab] = await browser.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab?.id) {
      return {
        isError: true,
        content: [{ type: 'text', text: '找不到当前标签页，请先打开一个网页再试。' }],
        details: { error: '找不到当前标签页', code: 'no_tab' },
      };
    }

    if (!tab.url || !/^https?:/i.test(tab.url)) {
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: '当前标签页不是普通网页（可能是浏览器内部页、扩展商店或本地文件），Pagehand 无法检查它的元素。请切换到 http/https 网页。',
          },
        ],
        details: { error: '当前标签页不是普通网页', code: 'unsupported_scheme' },
      };
    }

    const frameId = normalizeFrameId(params.frame_id);
    const options: InspectCollectOptions = {
      selector: params.selector ?? null,
      text: params.text ?? null,
      role: params.role ?? null,
      kind: (params.kind as InspectKind | undefined) ?? null,
      inputType: params.input_type ?? null,
      includeHidden: params.include_hidden === true,
      limit: params.limit,
      frameId,
    };

    try {
      const results = await injectScript({
        target: frameId > 0 ? { tabId: tab.id, frameIds: [frameId] } : { tabId: tab.id },
        func: collectInteractiveElements as unknown as (...args: unknown[]) => unknown,
        args: [options],
      });
      const snapshot = results[0]?.result as
        | ReturnType<typeof collectInteractiveElements>
        | undefined;
      if (!snapshot) {
        throw new Error('页面没有返回元素列表，可能还在加载。');
      }

      const now = Date.now();
      const key = inspectCacheKey(tab.id, options);
      const repeated =
        snapshot.scope_error === null &&
        shouldReuseInspect(lastInspect.get(tab.id), key, snapshot.fingerprint, now);
      if (snapshot.scope_error === null) {
        lastInspect.set(tab.id, { key, fingerprint: snapshot.fingerprint, at: now });
      }

      if (repeated) {
        return {
          isError: false,
          content: [
            {
              type: 'text',
              text:
                '这次检查与上一次完全相同，页面没有变化。请直接使用上一次的结果，不要重复调用 inspect。' +
                '需要更多信息时，换 role / kind / input_type / text / selector，或改用 read_page。',
            },
          ],
          details: toInspectDetails(snapshot, true),
        };
      }

      return {
        isError: snapshot.scope_error !== null,
        content: [{ type: 'text', text: formatInspectForModel(snapshot) }],
        details: toInspectDetails(snapshot),
      };
    } catch (error) {
      const message = errorMessage(error);
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `检查页面元素失败：${message}。可能这个页面不允许扩展读取、子框架已经变化，或者后台标签已经休眠——让用户先在浏览器里点开那个标签再试。`,
          },
        ],
        details: { error: message, code: 'inject_failed' },
      };
    }
  },
};
