import { describe, expect, it } from 'vitest';
import { describeRun } from '@/entrypoints/sidepanel/lib/runs';
import { assistant, runOf, tool, user } from './fixtures';

describe('运行块用户场景', () => {
  it('真实页面里连续 7 次工具调用收成一块，而不是 7 张平铺卡片', () => {
    const items = [
      user('看下页面输入框的在哪？placeholder 又是什么'),
      tool('inspect'),
      tool('inspect'),
      tool('read_page'),
      tool('inspect'),
      tool('inspect'),
      tool('read_page'),
      tool('inspect'),
      assistant('页面上只有一个输入框，就是顶部导航栏的搜索框。'),
    ];
    const run = runOf(items);

    expect(run.tools).toHaveLength(7);
    expect(run.stepCount).toBe(7);
    expect(run.answer?.text).toContain('顶部导航栏的搜索框');
    expect(describeRun(run)).toBe('已执行 7 个工具');
  });

  it('第 4 步失败时头部直接指出失败位置', () => {
    const items = [
      user('帮我填这个表'),
      tool('inspect'),
      tool('read_page'),
      tool('inspect'),
      tool('read_page', 'error'),
      assistant('表单读取失败，请确认页面是否还在。'),
    ];
    const run = runOf(items);

    expect(describeRun(run)).toBe('工具执行失败 · 第 4 步');
  });

  it('用户中途停止时，头部显示已停止而不是一直转圈', () => {
    const items = [user('查一下'), tool('inspect', 'running')];
    const run = runOf(items, false);

    expect(describeRun(run)).toBe('工具执行已停止 · 1 个');
  });

  it('纯问答不出现运行块文案，保持聊天阅读节奏', () => {
    const run = runOf([user('你好'), assistant('你好，我在。')]);

    expect(run.tools).toHaveLength(0);
    expect(run.status).toBe('done');
  });
});
