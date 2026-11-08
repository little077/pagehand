import type { BeforeToolCallResult } from '@earendil-works/pi-agent-core';
import { type Browser, browser } from 'wxt/browser';
import { addGrant, type GrantKey, isGranted, loadGrants, originOfUrl } from './grants';
import type { InteractionBridge } from './interactions';

export interface GateRequirement {
  title: string;
  reason: string;
  grant: GrantKey | null;
}

export interface ToolGate {
  toolName: string;
  /** 返回 null 表示这次调用不需要问用户。 */
  check(args: unknown): Promise<GateRequirement | null>;
}

const readTabGate: ToolGate = {
  toolName: 'read_tab',
  async check(args) {
    const tabId = (args as { tab_id?: unknown }).tab_id;
    // 不带 tab_id 就是读用户正在看的页面，那是他指着的东西，不用问。
    if (typeof tabId !== 'number') return null;

    let tab: Browser.tabs.Tab | undefined;
    try {
      tab = await browser.tabs.get(tabId);
    } catch {
      // 标签已经关了：交给工具自己的报错，门禁不抢话。
      return null;
    }
    if (tab.active) return null;

    const title = (tab.title ?? '').trim() || '未命名页面';
    const origin = originOfUrl(tab.url);
    return {
      title: `读取另一个标签页「${title}」`,
      reason: '这个标签页不是你正在看的页面，Pagehand 想读取它的正文。',
      grant: origin ? { origin, toolName: 'read_tab' } : null,
    };
  },
};

/**
 * 新工具要加执行前确认时，只在这里注册一条 gate，门禁本身不用改。
 * 只读且指向用户当前页面的工具不该出现在这里——那是骚扰，不是安全。
 */
export const TOOL_GATES: ToolGate[] = [readTabGate];

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

  const requirement = await gate.check(input.args);
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
