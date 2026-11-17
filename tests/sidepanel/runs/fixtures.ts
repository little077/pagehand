import {
  type ConversationBlock,
  groupConversation,
  type RunView,
} from '@/entrypoints/sidepanel/lib/runs';
import type { ChatItem } from '@/lib/ipc/protocol';

let seq = 0;

export function user(text: string): ChatItem {
  seq += 1;
  return { kind: 'user', id: `u${seq}`, text };
}

export function assistant(
  text: string,
  status: 'streaming' | 'done' | 'error' = 'done',
  id = `a${++seq}`,
): ChatItem {
  return { kind: 'assistant', id, text, status };
}

export function tool(
  name = 'inspect',
  status: 'running' | 'ok' | 'error' = 'ok',
  overrides: Partial<Extract<ChatItem, { kind: 'tool' }>> = {},
): ChatItem {
  const id = `t${++seq}`;
  return {
    kind: 'tool',
    id,
    toolCallId: id,
    name,
    status,
    summary: status === 'running' ? '正在执行…' : '完成',
    startedAt: 1_000,
    durationMs: status === 'running' ? undefined : 500,
    ...overrides,
  };
}

export function requireRun(blocks: ConversationBlock[], index = 0): RunView {
  const runs = blocks.filter(
    (block): block is Extract<ConversationBlock, { kind: 'run' }> => block.kind === 'run',
  );
  const block = runs[index];
  if (!block) throw new Error('missing run');
  return block.run;
}

export function runOf(items: ChatItem[], busy = false, now = 2_000): RunView {
  return requireRun(groupConversation(items, { busy, now }));
}
