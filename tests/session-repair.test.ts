import { describe, expect, it } from 'vitest';
import type { ChatItem } from '@/lib/ipc/protocol';
import type { SessionRecord } from '@/lib/sessions/record';
import { createSessionTitle } from '@/lib/sessions/record';
import { repairRecord } from '@/lib/sessions/repair';

function record(items: ChatItem[], messages: unknown[]): SessionRecord {
  return {
    id: 's-1',
    createdAt: 1,
    updatedAt: 2,
    title: createSessionTitle('对比一下'),
    model: null,
    items,
    messages,
  };
}

const pendingCard: ChatItem = {
  kind: 'interaction',
  id: 'i-1',
  toolCallId: 'call-ask',
  mode: 'ask',
  title: '需要你补充信息',
  questions: [{ id: 'which', question: '处理哪几个？' }],
  status: 'pending',
  startedAt: 10,
};

const runningStep: ChatItem = {
  kind: 'tool',
  id: 't-2',
  toolCallId: 'call-read',
  name: 'read_tab',
  status: 'running',
  summary: '正在执行…',
  startedAt: 11,
};

describe('repairRecord', () => {
  it('cancels a card and marks a running step as interrupted', () => {
    const outcome = repairRecord(record([pendingCard, runningStep], []));

    expect(outcome.items[0]).toMatchObject({ kind: 'interaction', status: 'cancelled' });
    expect(outcome.items[1]).toMatchObject({ kind: 'tool', status: 'error', summary: '已中断' });
    expect(outcome.interrupted).toBe(2);
  });

  it('appends a tool result only for calls that never got one', () => {
    const messages = [
      {
        role: 'assistant',
        content: [
          { type: 'text', text: '我先问两件事。' },
          { type: 'toolCall', id: 'call-ask', name: 'ask_user', arguments: {} },
          { type: 'toolCall', id: 'call-read', name: 'read_tab', arguments: { tab_id: 3 } },
        ],
      },
      {
        role: 'toolResult',
        toolCallId: 'call-ask',
        toolName: 'ask_user',
        content: [{ type: 'text', text: '用户的回答：' }],
        isError: false,
        timestamp: 5,
      },
    ];

    const outcome = repairRecord(record([], messages));
    const appended = outcome.messages.slice(messages.length);

    expect(appended).toHaveLength(1);
    expect(appended[0]).toMatchObject({
      role: 'toolResult',
      toolCallId: 'call-read',
      isError: true,
    });
    expect(outcome.interrupted).toBe(1);
  });

  it('leaves a finished session untouched', () => {
    const done: ChatItem = {
      kind: 'interaction',
      id: 'i-1',
      toolCallId: 'call-ask',
      mode: 'ask',
      title: '需要你补充信息',
      status: 'answered',
      answers: { which: '前两个' },
      startedAt: 10,
    };
    const outcome = repairRecord(record([done], []));

    expect(outcome.items).toEqual([done]);
    expect(outcome.messages).toEqual([]);
    expect(outcome.interrupted).toBe(0);
  });
});
