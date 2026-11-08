import type { ChatItem } from '@/lib/ipc/protocol';
import type { SessionRecord } from './record';

export interface RepairOutcome {
  items: ChatItem[];
  messages: unknown[];
  /** 被判定为中断的卡片 / 步骤数量，用于提示用户。 */
  interrupted: number;
}

interface LooseToolCall {
  type?: unknown;
  id?: unknown;
  name?: unknown;
}

interface LooseMessage {
  role?: unknown;
  content?: unknown;
  toolCallId?: unknown;
}

const INTERRUPTED_RESULT_TEXT = '这一轮在会话中断时结束，这个请求没有执行完。';

/**
 * 恢复历史时把「跑到一半」的状态收尾：卡片作废、执行中的步骤标成中断，
 * 并给上下文里悬空的 toolCall 补一条 toolResult——否则下一轮请求会因为
 * 「有调用没有结果」被模型端拒绝。
 */
export function repairRecord(record: SessionRecord): RepairOutcome {
  let interrupted = 0;

  const items = record.items.map((item): ChatItem => {
    if (item.kind === 'interaction' && item.status === 'pending') {
      interrupted += 1;
      return { ...item, status: 'cancelled' };
    }
    if (item.kind === 'tool' && item.status === 'running') {
      interrupted += 1;
      return { ...item, status: 'error', summary: '已中断' };
    }
    return item;
  });

  const answered = new Set<string>();
  const calls: { id: string; name: string }[] = [];

  for (const message of record.messages as LooseMessage[]) {
    if (message?.role === 'toolResult' && typeof message.toolCallId === 'string') {
      answered.add(message.toolCallId);
      continue;
    }
    if (message?.role !== 'assistant' || !Array.isArray(message.content)) continue;
    for (const block of message.content as LooseToolCall[]) {
      if (block?.type !== 'toolCall') continue;
      if (typeof block.id !== 'string' || typeof block.name !== 'string') continue;
      calls.push({ id: block.id, name: block.name });
    }
  }

  const dangling = calls.filter((call) => !answered.has(call.id));
  interrupted += dangling.length;

  const messages = [
    ...record.messages,
    ...dangling.map((call) => ({
      role: 'toolResult',
      toolCallId: call.id,
      toolName: call.name,
      content: [{ type: 'text', text: INTERRUPTED_RESULT_TEXT }],
      isError: true,
      timestamp: Date.now(),
    })),
  ];

  return { items, messages, interrupted };
}
