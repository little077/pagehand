import { afterEach, describe, expect, it } from 'vitest';
import { InteractionBridge } from '@/lib/agent/interactions';
import { askUserTool } from '@/lib/tools/ask-user';
import { bindInteractionBridge } from '@/lib/tools/bridge';

const questions = [
  {
    id: 'which',
    question: '处理哪几个标签页？',
    options: [{ label: '前两个' }, { label: '全部' }],
  },
  { id: 'depth', question: '要结论还是要点？' },
];

function stubBridge() {
  const bridge = new InteractionBridge({
    open: () => 'i-1',
    settle: () => {},
  });
  bindInteractionBridge(bridge);
  return bridge;
}

afterEach(() => bindInteractionBridge(null));

describe('ask_user', () => {
  it('turns the user’s answers into model-visible text', async () => {
    const bridge = stubBridge();
    const running = askUserTool.execute('call-1', { questions }, undefined);

    bridge.respond('call-1', {
      status: 'answered',
      values: { which: '前两个', depth: '先给结论' },
    });

    const result = await running;
    const text = (result.content[0] as { text: string }).text;

    expect(result.isError).toBeFalsy();
    expect(text).toContain('用户的回答：');
    expect(text).toContain('处理哪几个标签页？：前两个');
    expect(text).toContain('要结论还是要点？：先给结论');
    expect(result.details).toEqual({ answers: { which: '前两个', depth: '先给结论' } });
  });

  it('marks a question the user skipped as unanswered', async () => {
    const bridge = stubBridge();
    const running = askUserTool.execute('call-1', { title: '确认范围', questions }, undefined);

    bridge.respond('call-1', { status: 'answered', values: { which: '全部' } });

    const text = (await running).content[0] as { text: string };
    expect(text.text).toContain('要结论还是要点？：（未回答）');
  });

  it('returns an error result when the card is dismissed', async () => {
    const bridge = stubBridge();
    const running = askUserTool.execute('call-1', { questions }, undefined);

    bridge.respond('call-1', { status: 'denied' });

    const result = await running;
    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toBe('用户拒绝回答这个问题。');
    expect(result.details).toEqual({ status: 'denied' });
  });

  it('is never replayed and asks at most three questions', () => {
    expect(askUserTool.replay).toBe('never');
    expect(askUserTool.name).toBe('ask_user');
    expect(askUserTool.description).toContain('不要用它的场景');
  });
});
