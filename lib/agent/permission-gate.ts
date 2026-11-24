import type { BeforeToolCallResult } from '@earendil-works/pi-agent-core';
import { type Browser, browser } from 'wxt/browser';
import type { InteractAction } from '@/lib/page/interact';
import { isMutatingAction } from './action-safety';
import { addGrant, type GrantKey, isGranted, loadGrants, originOfUrl } from './grants';
import type { InteractionBridge } from './interactions';
import { authorizeToolTarget, releaseToolTarget, type ToolTarget } from './tool-targets';

export interface GateRequirement {
  title: string;
  reason: string;
  grant: GrantKey | null;
}

export interface GateResolution {
  requirement: GateRequirement | null;
  target: ToolTarget | null;
}

export interface ToolGate {
  toolName: string;
  resolve(args: unknown): Promise<GateResolution>;
}

const EMPTY_RESOLUTION: GateResolution = { requirement: null, target: null };

async function isFocusedActiveTab(tab: Browser.tabs.Tab): Promise<boolean> {
  if (!tab.active) return false;
  const focused = await browser.windows
    .getLastFocused({ windowTypes: ['normal'] })
    .catch(() => undefined);
  return focused?.id === tab.windowId;
}

const interactGate: ToolGate = {
  toolName: 'interact',
  async resolve(args) {
    const action = (args as { action?: unknown }).action;
    if (typeof action !== 'string' || !isMutatingAction(action as InteractAction)) {
      return EMPTY_RESOLUTION;
    }

    const [tab] = await browser.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab?.id) return EMPTY_RESOLUTION;
    const origin = originOfUrl(tab.url);
    if (!origin) return EMPTY_RESOLUTION;

    return {
      requirement: {
        title: `操作 ${origin.replace(/^https?:\/\//, '')}`,
        reason: 'Pagehand 将在这个网站上代你点击或填写。只在你确认后才执行；换站点会重新询问。',
        grant: { origin, toolName: 'interact' },
      },
      target: { tabId: tab.id, url: tab.url ?? '', origin },
    };
  },
};

const readTabGate: ToolGate = {
  toolName: 'read_tab',
  async resolve(args) {
    const tabId = (args as { tab_id?: unknown }).tab_id;
    if (typeof tabId !== 'number') return EMPTY_RESOLUTION;

    let tab: Browser.tabs.Tab;
    try {
      tab = await browser.tabs.get(tabId);
    } catch {
      return EMPTY_RESOLUTION;
    }
    if (tab.id === undefined || !tab.url) return EMPTY_RESOLUTION;

    const target: ToolTarget = {
      tabId: tab.id,
      url: tab.url,
      origin: originOfUrl(tab.url),
    };
    if (await isFocusedActiveTab(tab)) return { requirement: null, target };

    const title = (tab.title ?? '').trim() || '未命名页面';
    return {
      requirement: {
        title: `读取另一个标签页「${title}」`,
        reason: '这个标签页不是你正在看的页面，Pagehand 想读取它的正文。',
        grant: target.origin ? { origin: target.origin, toolName: 'read_tab' } : null,
      },
      target,
    };
  },
};

const pdfGate: ToolGate = {
  toolName: 'pdf',
  async resolve(args) {
    const tabId = (args as { tab_id?: unknown }).tab_id;
    if (typeof tabId !== 'number') return EMPTY_RESOLUTION;

    let tab: Browser.tabs.Tab;
    try {
      tab = await browser.tabs.get(tabId);
    } catch {
      return EMPTY_RESOLUTION;
    }
    if (tab.id === undefined || !tab.url) return EMPTY_RESOLUTION;

    const target: ToolTarget = {
      tabId: tab.id,
      url: tab.url,
      origin: originOfUrl(tab.url),
    };
    if (await isFocusedActiveTab(tab)) return { requirement: null, target };

    const title = (tab.title ?? '').trim() || '未命名 PDF';
    return {
      requirement: {
        title: `读取另一个标签页的 PDF「${title}」`,
        reason: '这个 PDF 标签页不是你正在看的页面，Pagehand 想读取它的内容。',
        grant: target.origin ? { origin: target.origin, toolName: 'pdf' } : null,
      },
      target,
    };
  },
};

/** 新工具要加执行前确认时，只在这里注册一条 gate，门禁本身不用改。 */
export const TOOL_GATES: ToolGate[] = [readTabGate, interactGate, pdfGate];

export interface GateCheckInput {
  toolName: string;
  toolCallId: string;
  args: unknown;
  signal?: AbortSignal;
}

export async function evaluateToolGate(
  input: GateCheckInput,
  bridge: InteractionBridge,
): Promise<BeforeToolCallResult | undefined> {
  const gate = TOOL_GATES.find((candidate) => candidate.toolName === input.toolName);
  if (!gate) return undefined;

  const { requirement, target } = await gate.resolve(input.args);
  if (target) authorizeToolTarget(input.toolCallId, input.toolName, target);
  if (!requirement) return undefined;

  if (requirement.grant && isGranted(await loadGrants(), requirement.grant)) return undefined;

  const answer = await bridge.request(
    {
      kind: 'permission',
      toolCallId: input.toolCallId,
      title: requirement.title,
      reason: requirement.reason,
      grantOrigin: requirement.grant?.origin ?? null,
    },
    input.signal,
  );

  if (answer.status === 'answered') {
    if (answer.always && requirement.grant) await addGrant(requirement.grant);
    return undefined;
  }

  releaseToolTarget(input.toolCallId);
  return {
    block: true,
    terminate: true,
    reason: reasonForStatus(answer.status, requirement.grant),
  };
}

function reasonForStatus(
  status: 'denied' | 'dismissed' | 'cancelled',
  grant: GrantKey | null,
): string {
  switch (status) {
    case 'denied':
      return '用户拒绝了这个操作。请停下来告诉用户没有执行，并问要不要换个做法，不要试图绕过。';
    case 'dismissed':
      return '用户没有回应授权卡片，直接发了新消息。这次按未授权处理。';
    default:
      return `授权请求已取消（用户点了停止或切换了会话）${grant ? `，${grant.toolName} 没有执行` : ''}。`;
  }
}
