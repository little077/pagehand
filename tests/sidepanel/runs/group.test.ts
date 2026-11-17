import { describe, expect, it } from 'vitest';
import { groupConversation } from '@/entrypoints/sidepanel/lib/runs';
import { assistant, requireRun, runOf, tool, user } from './fixtures';

describe('groupConversation', () => {
  it('把一轮用户消息之后的工具和回答归为一个运行块', () => {
    const items = [user('看看输入框'), tool(), assistant('页面上有一个搜索框。')];
    const blocks = groupConversation(items, { busy: false, now: 2_000 });

    expect(blocks).toHaveLength(2);
    expect(blocks[0]?.kind).toBe('user');

    const run = requireRun(blocks);
    expect(run.tools).toHaveLength(1);
    expect(run.answer?.text).toBe('页面上有一个搜索框。');
    expect(run.status).toBe('done');
    expect(run.stepCount).toBe(1);
  });

  it('多条用户消息切成多个运行块', () => {
    const items = [
      user('第一件事'),
      tool(),
      assistant('第一件完成'),
      user('第二件事'),
      tool('read_page'),
      assistant('第二件完成'),
    ];
    const blocks = groupConversation(items, { busy: false, now: 2_000 });

    expect(blocks.filter((block) => block.kind === 'user')).toHaveLength(2);
    expect(blocks.filter((block) => block.kind === 'run')).toHaveLength(2);
  });

  it('交互卡片不参与分组，也不会把一次运行切成两段', () => {
    const interaction = {
      kind: 'interaction' as const,
      id: 'i1',
      toolCallId: 't1',
      mode: 'ask' as const,
      title: '需要你补充信息',
      status: 'answered' as const,
      startedAt: 1_000,
    };
    const items = [user('做件事'), tool(), interaction, tool('read_page'), assistant('完成')];
    const run = runOf(items);

    expect(run.tools).toHaveLength(2);
  });

  it('工具调用之间的文字是过程说明，最后一次回答单独成气泡', () => {
    const items = [
      user('查一下'),
      assistant('我先检查页面。'),
      tool(),
      assistant('找到搜索框了。'),
    ];
    const run = runOf(items);

    expect(run.notes.map((note) => note.text)).toEqual(['我先检查页面。']);
    expect(run.answer?.text).toBe('找到搜索框了。');
  });

  it('没有工具调用时只保留回答，不生成运行步骤', () => {
    const run = runOf([user('你好'), assistant('你好，我在。')]);

    expect(run.tools).toHaveLength(0);
    expect(run.answer?.text).toBe('你好，我在。');
    expect(run.status).toBe('done');
  });

  it('用户刚发出任务、模型还没返回时生成可折叠的运行块', () => {
    const blocks = groupConversation([user('看看这个页面')], { busy: true, now: 2_000 });
    const run = requireRun(blocks);

    expect(run.tools).toHaveLength(0);
    expect(run.status).toBe('running');
    expect(run.answer).toBeNull();
  });

  it('旧运行不会因为当前 busy 被误判为运行中', () => {
    const items = [
      user('第一件事'),
      tool(),
      assistant('第一件完成'),
      user('第二件事'),
      tool('read_page', 'running'),
    ];
    const blocks = groupConversation(items, { busy: true, now: 2_000 });

    expect(requireRun(blocks, 0).status).toBe('done');
    expect(requireRun(blocks, 1).status).toBe('running');
  });

  it('过滤掉已经结束且为空的回答，但保留正在流式的空回答', () => {
    const items = [
      user('你好'),
      assistant('', 'done', 'a-empty-done'),
      assistant('', 'streaming', 'a-empty-streaming'),
    ];
    const run = runOf(items, true);

    expect(run.items.map((item) => item.id)).toEqual(['a-empty-streaming']);
    expect(run.answer?.id).toBe('a-empty-streaming');
  });
});
