import type { InteractionBridge } from '@/lib/agent/interactions';

let bridge: InteractionBridge | null = null;

/** 工具在后台执行，交互桥由 AgentSession 建好后交进来。 */
export function bindInteractionBridge(next: InteractionBridge | null): void {
  bridge = next;
}

export function requireInteractionBridge(): InteractionBridge {
  if (!bridge) throw new Error('交互桥尚未绑定');
  return bridge;
}
