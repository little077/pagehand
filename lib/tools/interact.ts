import type { AgentTool, AgentToolResult } from '@earendil-works/pi-agent-core';
import { Type } from 'typebox';
import { type Browser, browser } from 'wxt/browser';
import { confirmationFor, isMutatingAction } from '@/lib/agent/action-safety';
import { originOfUrl } from '@/lib/agent/grants';
import {
  assertToolTarget,
  toolTargetErrorMessage,
  toolTargetOfTab,
} from '@/lib/agent/tool-targets';
import {
  cancelPageInteraction,
  type InteractAction,
  type InteractPageParams,
  type InteractPageResult,
  type InteractTargetSummary,
  runInteraction,
} from '@/lib/page/interact';
import { requireInteractionBridge } from './bridge';
import { errorMessage } from './errors';
import { invalidateInspectCache } from './inspect';
import {
  ACTION_LABEL,
  formatInteractForModel,
  type InteractDetails,
  type InteractNavigation,
  type InteractNewTab,
  type InteractOutcome,
  type InteractToolErrorCode,
  toInteractDetails,
} from './interact-format';
import {
  applyScrollRound,
  createScrollLoopState,
  formatScrollLoopMessage,
  normalizeScrollRounds,
  shouldStopScroll,
} from './interact-scroll';

const parameters = Type.Object({
  action: Type.Union(
    [
      Type.Literal('click'),
      Type.Literal('fill'),
      Type.Literal('type'),
      Type.Literal('press'),
      Type.Literal('select'),
      Type.Literal('check'),
      Type.Literal('uncheck'),
      Type.Literal('hover'),
      Type.Literal('scroll'),
      Type.Literal('wait_for'),
    ],
    {
      description:
        '要执行的动作：click 点击，fill 替换输入，type 追加输入，press 按键，select 选原生下拉，check/uncheck 勾选，hover 悬停，scroll 滚动，wait_for 等条件。',
    },
  ),
  ref: Type.Optional(
    Type.String({
      description:
        'inspect 返回的元素编号（如 e12）。优先用它定位；页面变化后 ref 会失效，需要重新 inspect。',
      maxLength: 40,
    }),
  ),
  selector: Type.Optional(
    Type.String({
      description:
        'CSS 选择器兜底，必须只匹配一个元素。能用 ref 就不要用 selector；坐标只留给 Canvas/地图。',
      maxLength: 500,
    }),
  ),
  x: Type.Optional(
    Type.Number({
      description: '坐标点击的 CSS 视口 X，只有 click/hover 支持；优先用 ref。',
    }),
  ),
  y: Type.Optional(
    Type.Number({
      description: '坐标点击的 CSS 视口 Y，只有 click/hover 支持；优先用 ref。',
    }),
  ),
  text: Type.Optional(
    Type.String({
      description: 'fill/type 要写入的文字；fill 会替换原内容，空字符串表示清空。',
      maxLength: 8000,
    }),
  ),
  key: Type.Optional(
    Type.String({
      description:
        'press 的按键，例如 Enter、Escape、ArrowDown；只用于控制键和快捷键，输入文字用 fill/type。',
      maxLength: 40,
    }),
  ),
  modifiers: Type.Optional(
    Type.Array(Type.String(), {
      description: 'press 时按住的修饰键：ctrl、shift、alt、meta。',
      maxItems: 4,
    }),
  ),
  option: Type.Optional(
    Type.String({
      description: 'select 要选的选项值或可见文字。',
      maxLength: 200,
    }),
  ),
  delta_x: Type.Optional(Type.Number({ description: 'scroll 的横向滚动量，默认 0。' })),
  delta_y: Type.Optional(Type.Number({ description: 'scroll 的纵向滚动量，正数向下，默认 300。' })),
  to: Type.Optional(
    Type.Union([Type.Literal('bottom'), Type.Literal('top')], {
      description:
        'scroll 的绝对目标：bottom 直接滚到最底并等待懒加载，会自动重复直到到底或达到轮数上限；top 回到顶部。给了 to 就忽略 delta_x/delta_y。',
    }),
  ),
  max_rounds: Type.Optional(
    Type.Number({
      description:
        'scroll + to=bottom 时最多重复多少轮“滚到底 + 等加载”，默认 120，单次调用最多约 25 秒。',
      minimum: 1,
      maximum: 200,
    }),
  ),
  state: Type.Optional(
    Type.Union(
      [
        Type.Literal('visible'),
        Type.Literal('hidden'),
        Type.Literal('text'),
        Type.Literal('value'),
        Type.Literal('url'),
      ],
      {
        description:
          'wait_for 的条件：visible 元素出现、hidden 元素消失、text 文字出现、value 值相等、url 地址包含。visible/hidden 必须同时给 ref 或 selector；url 不需要目标。',
      },
    ),
  ),
  value: Type.Optional(
    Type.String({
      description: 'wait_for 的 text/value/url 条件值。',
      maxLength: 500,
    }),
  ),
  timeout: Type.Optional(
    Type.Number({
      description: 'wait_for 的等待毫秒数，默认 5000，范围 1000～30000。',
      minimum: 1000,
      maximum: 30000,
    }),
  ),
  frame_id: Type.Optional(
    Type.Number({
      description:
        '子框架 id，默认 0（顶层）。ref 属于哪个 frame 就传哪个；frame_id 可以从 read_page 返回的子框架列表里获取。',
      minimum: 0,
    }),
  ),
});

type Params = {
  action: InteractAction;
  ref?: string;
  selector?: string;
  x?: number;
  y?: number;
  text?: string;
  key?: string;
  modifiers?: string[];
  option?: string;
  delta_x?: number;
  delta_y?: number;
  to?: 'bottom' | 'top';
  max_rounds?: number;
  state?: 'visible' | 'hidden' | 'text' | 'value' | 'url';
  value?: string;
  timeout?: number;
  frame_id?: number;
};

type InjectionDetails = {
  target: { tabId: number; frameIds?: number[] };
  func: (...args: unknown[]) => unknown;
  args?: unknown[];
};

type InjectionResult = { frameId: number; result?: unknown };

const injectScript = browser.scripting.executeScript as unknown as (
  details: InjectionDetails,
) => Promise<InjectionResult[]>;

const DEFAULT_INJECT_TIMEOUT_MS = 8_000;
const NAVIGATION_TIMEOUT_MS = 10_000;

const tabChains = new Map<number, Promise<unknown>>();

function errorResult(
  message: string,
  code: InteractToolErrorCode,
): AgentToolResult<InteractDetails> {
  return {
    isError: true,
    content: [{ type: 'text', text: message }],
    details: { error: message, code },
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function normalizeFrameId(value: number | undefined): number {
  if (value === undefined || !Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

function frameTarget(tabId: number, frameId: number): { tabId: number; frameIds?: number[] } {
  return frameId > 0 ? { tabId, frameIds: [frameId] } : { tabId };
}

async function isStillActive(tabId: number): Promise<boolean> {
  const [tab] = await browser.tabs.query({ active: true, lastFocusedWindow: true });
  return tab?.id === tabId;
}

function toPageParams(
  params: Params,
  phase: 'probe' | 'act',
  expectedOrigin?: string,
  expectedTargetRef?: string,
): InteractPageParams {
  return {
    phase,
    action: params.action,
    ref: params.ref,
    selector: params.selector,
    x: params.x,
    y: params.y,
    text: params.text,
    key: params.key,
    modifiers: params.modifiers,
    option: params.option,
    deltaX: params.delta_x,
    deltaY: params.delta_y,
    to: params.to,
    state: params.state,
    value: params.value,
    timeout: params.timeout,
    frameId: params.frame_id,
    expectedOrigin,
    expectedTargetRef,
  };
}

async function injectAction(
  tabId: number,
  frameId: number,
  params: InteractPageParams,
  timeoutMs: number,
): Promise<InteractPageResult> {
  const results = await withTimeout(
    injectScript({
      target: frameTarget(tabId, frameId),
      func: runInteraction as unknown as (...args: unknown[]) => unknown,
      args: [params],
    }),
    timeoutMs,
    '执行超时',
  );
  const result = results[0]?.result as InteractPageResult | undefined;
  if (!result) throw new Error('页面没有返回操作结果');
  return result;
}

async function cancelWait(tabId: number, frameId: number): Promise<void> {
  try {
    await injectScript({
      target: frameTarget(tabId, frameId),
      func: cancelPageInteraction as unknown as (...args: unknown[]) => unknown,
    });
  } catch {
    // 页面已经跳转或关闭时取消失败，忽略。
  }
}

function actionTimeout(params: Params): number {
  if (params.action !== 'wait_for') return DEFAULT_INJECT_TIMEOUT_MS;
  const wait = Math.min(30_000, Math.max(1_000, params.timeout ?? 5_000));
  return wait + 2_000;
}

const SCROLL_ROUND_TIMEOUT_MS = 5_000;
const SCROLL_SETTLE_MS = 2_500;
/** 单次调用最多花多久滚到底；到时间就返回进度，模型可以再调一次。 */
const SCROLL_TIME_BUDGET_MS = 25_000;

interface ScrollLoopResult {
  page: InteractPageResult | null;
  error?: { message: string; code: InteractToolErrorCode };
}

function numericDetail(details: Record<string, unknown>, key: string, fallback: number): number {
  const value = details[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function textDetail(details: Record<string, unknown>, key: string): string | null {
  const value = details[key];
  return typeof value === 'string' && value ? value : null;
}

/**
 * 虚拟列表/无限加载一次滚动只加载一批，必须在工具内循环到“到底且不再长高”。
 * 到底但还在转圈不等于没有更多；只有出现“没有更多”或彻底安静才算结束。
 */
async function scrollToBottom(
  tabId: number,
  frameId: number,
  params: Params,
  signal: AbortSignal | undefined,
  expectedOrigin?: string,
  expectedTargetRef?: string,
): Promise<ScrollLoopResult> {
  const maxRounds = normalizeScrollRounds(params.max_rounds);
  const startedAt = Date.now();
  let state = createScrollLoopState();
  let last: InteractPageResult | null = null;
  let initialHeight: number | null = null;
  let lastHeight = 0;
  let noGrowthMs = 0;

  while (state.rounds < maxRounds && Date.now() - startedAt < SCROLL_TIME_BUDGET_MS) {
    if (signal?.aborted) {
      return {
        page: null,
        error: { message: '操作已停止；已经滚动的部分保留在页面上。', code: 'aborted' },
      };
    }
    if (!(await isStillActive(tabId))) {
      return {
        page: null,
        error: { message: '当前标签页已经切换，滚动已停止。', code: 'aborted' },
      };
    }
    let page: InteractPageResult;
    try {
      page = await injectAction(
        tabId,
        frameId,
        {
          ...toPageParams(params, 'act', expectedOrigin, expectedTargetRef),
          settleMs: SCROLL_SETTLE_MS,
        },
        SCROLL_ROUND_TIMEOUT_MS,
      );
    } catch (error) {
      return {
        page: null,
        error: { message: `滚动失败：${errorMessage(error)}。`, code: 'inject_failed' },
      };
    }
    if (!page.ok) return { page };
    last = page;

    const details = page.details;
    const height = numericDetail(details, 'scroll_height', 0);
    if (initialHeight === null) {
      initialHeight = numericDetail(details, 'before_height', height);
    }
    lastHeight = height;
    const grew = details.grew === true;
    if (!grew) noGrowthMs += numericDetail(details, 'waited_ms', 0);

    state = applyScrollRound(state, {
      atBottom: details.at_bottom === true,
      grew,
      changed: page.changed,
      loading: details.loading === true,
      endMarker: textDetail(details, 'end_marker'),
      at: Date.now(),
    });
    if (shouldStopScroll(state)) break;
  }

  if (!last) {
    return { page: null, error: { message: '没有拿到滚动结果。', code: 'unknown' } };
  }

  const outcome = state.outcome ?? 'budget_exhausted';
  const finalState = { ...state, outcome };
  const atBottom = last.details.at_bottom === true;
  const distance = numericDetail(last.details, 'distance_bottom', 0);
  const gained = initialHeight === null ? 0 : Math.max(0, lastHeight - initialHeight);
  return {
    page: {
      ...last,
      changed: state.changed,
      message: formatScrollLoopMessage(finalState, {
        atBottom,
        distance,
        gained,
        loadingLabel: textDetail(last.details, 'loading_label'),
        noGrowthMs,
        endMarker: textDetail(last.details, 'end_marker'),
      }),
      details: {
        ...last.details,
        to: 'bottom',
        rounds: state.rounds,
        at_bottom: atBottom,
        distance_bottom: distance,
        height_gain: gained,
        outcome,
        no_growth_ms: noGrowthMs,
      },
    },
  };
}

function enqueue<T>(tabId: number, task: () => Promise<T>): Promise<T> {
  const previous = tabChains.get(tabId) ?? Promise.resolve();
  const current = previous.then(task, task);
  const tail = current.then(
    () => undefined,
    () => undefined,
  );
  tabChains.set(tabId, tail);
  void tail.then(() => {
    if (tabChains.get(tabId) === tail) tabChains.delete(tabId);
  });
  return current;
}

async function confirmHighRisk(
  toolCallId: string,
  action: InteractAction,
  target: InteractTargetSummary,
  tabUrl: string,
  detail: string,
  signal: AbortSignal | undefined,
): Promise<string | null> {
  const labelText = target.risk_label || target.label;
  const label = labelText ? `「${labelText}」` : '';
  const origin = originOfUrl(tabUrl) ?? tabUrl;
  try {
    const bridge = requireInteractionBridge();
    const answer = await bridge.request(
      {
        kind: 'permission',
        toolCallId: `${toolCallId}:risk`,
        title: `要${ACTION_LABEL[action]}${label || '这个元素'}吗？`,
        reason: `这是高风险操作（${detail}），可能产生不可逆结果。页面：${origin}。确认后只会执行这一次，不会自动重试。`,
        grantOrigin: null,
      },
      signal,
    );
    if (answer.status === 'answered') return null;
    if (answer.status === 'denied') return '用户拒绝了这次高风险操作，没有执行。';
    if (answer.status === 'dismissed') return '用户没有回应高风险确认，这次按未执行处理。';
    return '高风险确认已取消，没有执行。';
  } catch {
    return '无法弹出高风险确认卡片，为安全起见没有执行这次操作。';
  }
}

interface NavigationWatch {
  stop: () => void;
  sawNavigation: () => boolean;
  newTab: () => Browser.tabs.Tab | null;
  /** 导航或新标签页一发生就 resolve，用来避免等注入通道自己超时。 */
  started: Promise<void>;
}

function watchNavigation(tabId: number): NavigationWatch {
  let sawNavigation = false;
  let created: Browser.tabs.Tab | null = null;
  let resolveStarted: (() => void) | null = null;
  const started = new Promise<void>((resolve) => {
    resolveStarted = resolve;
  });
  const markStarted = () => {
    if (!resolveStarted) return;
    resolveStarted();
    resolveStarted = null;
  };
  const onUpdated = (id: number, info: Browser.tabs.OnUpdatedInfo) => {
    if (id !== tabId) return;
    if (info.status === 'loading' || typeof info.url === 'string') {
      sawNavigation = true;
      markStarted();
    }
  };
  const onCreated = (tab: Browser.tabs.Tab) => {
    if (!created && tab.openerTabId === tabId) {
      created = tab;
      markStarted();
    }
  };
  browser.tabs.onUpdated.addListener(onUpdated);
  browser.tabs.onCreated.addListener(onCreated);
  return {
    stop: () => {
      browser.tabs.onUpdated.removeListener(onUpdated);
      browser.tabs.onCreated.removeListener(onCreated);
    },
    sawNavigation: () => sawNavigation,
    newTab: () => created,
    started,
  };
}

async function waitForComplete(
  tabId: number,
  timeoutMs: number,
): Promise<'completed' | 'timeout' | 'closed'> {
  const current = await browser.tabs.get(tabId).catch(() => null);
  if (!current) return 'closed';
  if (current.status === 'complete') return 'completed';
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: 'completed' | 'timeout' | 'closed') => {
      if (settled) return;
      settled = true;
      browser.tabs.onUpdated.removeListener(onUpdated);
      browser.tabs.onRemoved.removeListener(onRemoved);
      clearTimeout(timer);
      resolve(value);
    };
    const onUpdated = (id: number, info: Browser.tabs.OnUpdatedInfo) => {
      if (id === tabId && info.status === 'complete') finish('completed');
    };
    const onRemoved = (id: number) => {
      if (id === tabId) finish('closed');
    };
    const timer = setTimeout(() => finish('timeout'), timeoutMs);
    browser.tabs.onUpdated.addListener(onUpdated);
    browser.tabs.onRemoved.addListener(onRemoved);
  });
}

async function readNewTab(tab: Browser.tabs.Tab): Promise<InteractNewTab | null> {
  if (!tab.id) return null;
  await sleep(250);
  const current = await browser.tabs.get(tab.id).catch(() => null);
  if (!current) return null;
  return {
    id: current.id ?? tab.id,
    url: current.url ?? '',
    title: current.title ?? '',
  };
}

function syntheticPage(
  action: InteractAction,
  beforeUrl: string,
  current: Browser.tabs.Tab | null,
): InteractPageResult {
  return {
    ok: true,
    code: null,
    message: '动作已发出，页面开始跳转。',
    action,
    phase: 'act',
    target: null,
    state: null,
    changed: true,
    url_before: beforeUrl,
    url_after: current?.url ?? beforeUrl,
    title_after: current?.title ?? '',
    frame_url: current?.url ?? beforeUrl,
    mutated: 0,
    by_coords: false,
    duration_ms: 0,
    warnings: [],
    details: {},
  };
}

function finish(outcome: InteractOutcome): AgentToolResult<InteractDetails> {
  return {
    isError: !outcome.page.ok,
    content: [{ type: 'text', text: formatInteractForModel(outcome) }],
    details: toInteractDetails(outcome),
  };
}

async function performAction(
  toolCallId: string,
  params: Params,
  signal: AbortSignal | undefined,
): Promise<AgentToolResult<InteractDetails>> {
  if (signal?.aborted) return errorResult('操作已取消。', 'aborted');
  if (params.to && params.action !== 'scroll') {
    return errorResult('to 参数只用于 scroll 动作。', 'unsupported_action');
  }

  const [tab] = await browser.tabs.query({ active: true, lastFocusedWindow: true });
  if (!tab?.id) return errorResult('找不到当前标签页，请先打开一个网页再试。', 'no_tab');
  if (!tab.url || !/^https?:/i.test(tab.url)) {
    return errorResult(
      '当前标签页不是普通网页（可能是浏览器内部页、扩展商店或本地文件），Pagehand 无法操作。请切换到 http/https 网页。',
      'unsupported_page',
    );
  }

  const tabId = tab.id;
  let expectedOrigin: string | undefined;
  if (isMutatingAction(params.action)) {
    const target = toolTargetOfTab(tab);
    const code = target
      ? assertToolTarget(toolCallId, 'interact', target)
      : 'permission_target_missing';
    if (code) return errorResult(toolTargetErrorMessage(code), code);
    expectedOrigin = target?.origin ?? undefined;
  }

  // 只要开始一次操作，下一次 inspect 就应该重新看页面，不能复用旧缓存。
  invalidateInspectCache(tabId);
  const frameId = normalizeFrameId(params.frame_id);
  return enqueue(tabId, async () => {
    let probe: InteractPageResult | null = null;
    let expectedTargetRef: string | undefined;
    if (params.action !== 'wait_for') {
      try {
        probe = await injectAction(
          tabId,
          frameId,
          toPageParams(params, 'probe', expectedOrigin),
          DEFAULT_INJECT_TIMEOUT_MS,
        );
      } catch (error) {
        return errorResult(
          `无法检查页面目标：${errorMessage(error)}。让用户点开这个标签页，等页面加载完再试。`,
          'inject_failed',
        );
      }
      if (!probe.ok) {
        return finish({ page: probe, frame_id: frameId, navigation: 'none', new_tab: null });
      }
      if (frameId > 0 && originOfUrl(probe.frame_url) !== originOfUrl(tab.url)) {
        return errorResult(
          'v0.7 只允许操作同源 iframe。跨域 iframe（常见于支付、登录）需要用户手动完成。',
          'blocked_policy',
        );
      }
      if (signal?.aborted) return errorResult('操作已取消。', 'aborted');
      expectedTargetRef =
        params.ref || params.selector || params.x !== undefined || params.y !== undefined
          ? (probe.target?.ref ?? undefined)
          : undefined;
      if (!(await isStillActive(tabId))) {
        return errorResult('当前标签页已经切换，操作已取消。请切回目标页面再试。', 'aborted');
      }
      if (probe.details.already === true) {
        return finish({ page: probe, frame_id: frameId, navigation: 'none', new_tab: null });
      }
      const decision = confirmationFor(params.action, probe.target, {
        key: params.key,
        option: params.option ?? params.text,
      });
      if (decision.required && probe.target) {
        const blocked = await confirmHighRisk(
          toolCallId,
          params.action,
          probe.target,
          tab.url ?? '',
          decision.detail,
          signal,
        );
        if (blocked) return errorResult(blocked, signal?.aborted ? 'aborted' : 'blocked_policy');
      }
    }

    if (signal?.aborted) return errorResult('操作已取消。', 'aborted');
    if (!(await isStillActive(tabId))) {
      return errorResult('当前标签页已经切换，操作已取消。请切回目标页面再试。', 'aborted');
    }
    const latest = await browser.tabs.get(tabId).catch(() => null);
    if (!latest || latest.url !== (tab.url ?? '')) {
      if (isMutatingAction(params.action)) {
        const latestTarget = toolTargetOfTab(latest);
        const code = latestTarget
          ? assertToolTarget(toolCallId, 'interact', latestTarget)
          : 'permission_target_mismatch';
        if (code) return errorResult(toolTargetErrorMessage(code), code);
      }
      return errorResult('页面在检查后已经跳转或关闭。请重新 inspect 后再操作。', 'ref_stale');
    }

    if (params.action === 'scroll' && params.to === 'bottom') {
      const loop = await scrollToBottom(
        tabId,
        frameId,
        params,
        signal,
        expectedOrigin,
        expectedTargetRef,
      );
      if (!loop.page) {
        return errorResult(loop.error?.message ?? '滚动失败。', loop.error?.code ?? 'unknown');
      }
      invalidateInspectCache(tabId);
      return finish({ page: loop.page, frame_id: frameId, navigation: 'none', new_tab: null });
    }

    const beforeUrl = tab.url ?? '';
    const watch = watchNavigation(tabId);
    let page: InteractPageResult | null = null;
    let failure: unknown = null;
    const onAbort = () => {
      void cancelWait(tabId, frameId);
    };
    if (signal) signal.addEventListener('abort', onAbort, { once: true });

    try {
      const act = injectAction(
        tabId,
        frameId,
        toPageParams(params, 'act', expectedOrigin, expectedTargetRef),
        actionTimeout(params),
      );
      const actResult = act.then(
        (value) => ({ kind: 'page' as const, value }),
        (error: unknown) => ({ kind: 'error' as const, error }),
      );
      const raced = await Promise.race([
        actResult,
        watch.started.then(() => ({ kind: 'nav' as const })),
      ]);
      const settled = raced.kind === 'nav' ? await actResult : raced;
      if (settled.kind === 'page') page = settled.value;
      else failure = settled.error;
    } finally {
      if (signal) signal.removeEventListener('abort', onAbort);
      watch.stop();
      invalidateInspectCache(tabId);
    }

    const created = watch.newTab();
    const sawNavigation = watch.sawNavigation();
    const current = await browser.tabs.get(tabId).catch(() => null);
    const newTab = created ? await readNewTab(created) : null;
    const closed = current === null;
    const navigated =
      closed ||
      sawNavigation ||
      (page !== null && page.url_after !== page.url_before) ||
      (current !== null && beforeUrl !== '' && current.url !== beforeUrl);

    if (signal?.aborted) {
      return errorResult(
        '操作已停止；动作可能已经发出，请检查页面状态后再决定是否重试。',
        'aborted',
      );
    }

    let navigation: InteractNavigation = 'none';
    if (closed) {
      navigation = 'closed';
    } else if (navigated) {
      const completion = await waitForComplete(tabId, NAVIGATION_TIMEOUT_MS);
      navigation = completion === 'completed' ? 'completed' : completion;
    } else if (newTab) {
      navigation = 'started';
    }

    if (!page) {
      if (navigated || newTab) {
        page = syntheticPage(params.action, beforeUrl, current);
      } else if (failure instanceof Error && failure.message === '执行超时') {
        return errorResult(
          '操作没有在预期时间内返回。页面可能弹出了 alert/confirm 对话框，或正在执行长任务；请用户手动处理后再试。',
          'page_busy',
        );
      } else {
        return errorResult(
          `操作失败：${errorMessage(failure)}。页面可能已经跳转或关闭。`,
          'inject_failed',
        );
      }
    }

    const authorizationFailure = page.code === 'permission_target_mismatch';
    if (!page.ok && (navigated || newTab) && !authorizationFailure) {
      page = {
        ...page,
        ok: true,
        code: null,
        message: '动作已发出，页面开始跳转。',
        changed: true,
      };
    }

    return finish({ page, frame_id: frameId, navigation, new_tab: newTab });
  });
}

export const interactTool: AgentTool<typeof parameters, InteractDetails> = {
  name: 'interact',
  label: '操作页面',
  description:
    '在当前活动标签页里执行一次页面操作：click 点击、fill 替换输入、type 追加输入、press 按键、select 选原生下拉、check/uncheck 勾选、hover 悬停、scroll 滚动、wait_for 等条件。' +
    '要滚到列表/评论区最底时，用 scroll + to="bottom"：工具会自动重复“滚到底 + 等懒加载”，一次调用完成；不要用多次 delta_y 硬滚。' +
    '优先用 inspect 返回的 ref 定位；selector 必须只匹配一个元素；坐标只留给 Canvas/地图。' +
    '只操作当前活动标签页，不操作后台标签页、浏览器内部页、跨域 iframe 或 shadow DOM 内部。' +
    '执行前会检查可见、稳定、遮挡、禁用、inert 和可编辑；执行后会观察 URL、DOM 和状态变化，并如实返回。' +
    '密码、短信验证码、银行卡、文件上传、验证码区域一律拒绝；支付、删除、发布、发送、提交表单等高风险管理动作每次都会弹确认。' +
    '这是合成输入：不会触发 CSS :hover、原生 select 弹层、浏览器默认的 Tab/回车提交；需要这些行为时改用点击或让用户操作。' +
    '动作可能改变页面状态；没有变化时先 inspect 确认，不要连续重复点击同一个目标。',
  parameters,
  replay: 'never',
  async execute(toolCallId, params, signal) {
    return performAction(toolCallId, params as Params, signal);
  },
};
