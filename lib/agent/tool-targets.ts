import type { Browser } from 'wxt/browser';
import { originOfUrl } from './grants';

export interface ToolTarget {
  tabId: number;
  url: string;
  origin: string | null;
}

export type ToolTargetErrorCode = 'permission_target_missing' | 'permission_target_mismatch';

interface ToolTargetAuthorization {
  toolName: string;
  target: ToolTarget;
}

const authorizations = new Map<string, ToolTargetAuthorization>();

class ToolTargetError extends Error {
  readonly code: ToolTargetErrorCode;

  constructor(code: ToolTargetErrorCode) {
    super(toolTargetErrorMessage(code));
    this.name = 'ToolTargetError';
    this.code = code;
  }
}

export function toolTargetOfTab(
  tab: Pick<Browser.tabs.Tab, 'id' | 'url'> | null | undefined,
): ToolTarget | null {
  if (tab?.id === undefined || !tab.url) return null;
  return { tabId: tab.id, url: tab.url, origin: originOfUrl(tab.url) };
}

export function authorizeToolTarget(
  toolCallId: string,
  toolName: string,
  target: ToolTarget,
): void {
  authorizations.set(toolCallId, { toolName, target });
}

export function assertToolTarget(
  toolCallId: string,
  toolName: string,
  target: ToolTarget,
): ToolTargetErrorCode | null {
  const authorization = authorizations.get(toolCallId);
  if (!authorization || authorization.toolName !== toolName) return 'permission_target_missing';

  const authorized = authorization.target;
  const sameTarget =
    authorized.tabId === target.tabId &&
    (authorized.origin && target.origin
      ? authorized.origin === target.origin
      : authorized.url === target.url);
  return sameTarget ? null : 'permission_target_mismatch';
}

export function requireToolTarget(toolCallId: string, toolName: string, target: ToolTarget): void {
  const code = assertToolTarget(toolCallId, toolName, target);
  if (code) throw new ToolTargetError(code);
}

export function toolTargetErrorCode(error: unknown): ToolTargetErrorCode | null {
  return error instanceof ToolTargetError ? error.code : null;
}

export function releaseToolTarget(toolCallId: string): void {
  authorizations.delete(toolCallId);
}

export function clearToolTargets(): void {
  authorizations.clear();
}

export function toolTargetErrorMessage(code: ToolTargetErrorCode): string {
  if (code === 'permission_target_missing') {
    return '这次调用没有绑定已授权的页面目标，已阻止执行。请重新发起调用，不要直接重试或绕过。';
  }
  return '授权后的目标页面已经变化，已阻止执行。请让用户针对当前页面重新确认，再发起新的调用。';
}
