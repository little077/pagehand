import { describe, expect, it } from 'vitest';
import { InteractionBridge, type InteractionRequest } from '@/lib/agent/interactions';

const ask: InteractionRequest = {
  kind: 'ask',
  toolCallId: 'call-1',
  title: '需要你补充信息',
  questions: [{ id: 'which', question: '处理哪几个标签页？' }],
};

function makeBridge() {
  const opened: string[] = [];
  const settled: [string, string][] = [];
  const bridge = new InteractionBridge({
    open: (request) => {
      opened.push(request.toolCallId);
      return 'i-1';
    },
    settle: (id, status) => {
      settled.push([id, status]);
    },
  });
  return { bridge, opened, settled };
}

describe('InteractionBridge', () => {
  it('holds a request until the user answers, then settles the card once', async () => {
    const { bridge, opened, settled } = makeBridge();
    const pending = bridge.request(ask);

    expect(opened).toEqual(['call-1']);
    expect(bridge.pendingCount).toBe(1);

    expect(bridge.respond('call-1', { status: 'answered', values: { which: '前两个' } })).toBe(
      true,
    );
    await expect(pending).resolves.toEqual({
      status: 'answered',
      values: { which: '前两个' },
    });

    expect(bridge.pendingCount).toBe(0);
    expect(settled).toEqual([['i-1', 'answered']]);
    // 重复回填不会再动卡片
    expect(bridge.respond('call-1', { status: 'denied' })).toBe(false);
    expect(settled).toHaveLength(1);
  });

  it('treats a new user message as an unanswered card', async () => {
    const { bridge, settled } = makeBridge();
    const pending = bridge.request(ask);
    bridge.dismissAll();

    await expect(pending).resolves.toEqual({ status: 'dismissed' });
    expect(settled).toEqual([['i-1', 'dismissed']]);
    expect(bridge.pendingCount).toBe(0);
  });

  it('cancels when the turn is aborted', async () => {
    const { bridge, settled } = makeBridge();
    const controller = new AbortController();
    const pending = bridge.request(ask, controller.signal);

    controller.abort();
    await expect(pending).resolves.toEqual({ status: 'cancelled' });
    expect(settled).toEqual([['i-1', 'cancelled']]);
  });

  it('settles immediately when the signal is already aborted', async () => {
    const { bridge } = makeBridge();
    const controller = new AbortController();
    controller.abort();

    await expect(bridge.request(ask, controller.signal)).resolves.toEqual({
      status: 'cancelled',
    });
  });
});
