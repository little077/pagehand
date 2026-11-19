import { describe, expect, it } from 'vitest';
import {
  describeRun,
  firstFailedStep,
  formatDuration,
  formatElapsed,
} from '@/entrypoints/sidepanel/lib/runs';
import { assistant, runOf, tool, user } from './fixtures';

describe('运行块头部文案', () => {
  it('工具执行中显示正在做什么', () => {
    const run = runOf([user('查一下'), tool('inspect', 'running')], true);
    expect(describeRun(run)).toBe('正在执行工具（1/1）：检查页面元素…');
  });

  it('没有工具在跑但仍在等待模型时显示思考中', () => {
    const run = runOf([user('查一下')], true);
    expect(describeRun(run)).toBe('思考中…');
  });

  it('回答正在流式输出时显示正在整理回答', () => {
    const run = runOf([user('查一下'), tool(), assistant('正在写', 'streaming')], true);
    expect(describeRun(run)).toBe('已执行 1 个工具 · 正在整理回答…');
  });

  it('用户停止后显示已停止和步数', () => {
    const run = runOf([user('查一下'), tool('inspect', 'running')], false);
    expect(describeRun(run)).toBe('工具执行已停止 · 1 个');
  });

  it('单步失败但最终有回答时，整体仍算完成', () => {
    const run = runOf([
      user('查一下'),
      tool(),
      tool('read_page', 'error'),
      assistant('已经继续完成'),
    ]);
    expect(firstFailedStep(run)).toBe(2);
    expect(run.status).toBe('done');
    expect(describeRun(run)).toBe('已执行 2 个工具 · 1 步失败但已继续');
  });

  it('工具失败且没有最终回答时，整体算失败', () => {
    const run = runOf([user('查一下'), tool(), tool('read_page', 'error')]);
    expect(firstFailedStep(run)).toBe(2);
    expect(run.status).toBe('error');
    expect(describeRun(run)).toBe('工具执行失败 · 第 2 步');
  });

  it('回答生成失败时显示执行失败', () => {
    const run = runOf([user('查一下'), tool(), assistant('出错了', 'error')]);
    expect(describeRun(run)).toBe('工具执行完成 · 回答生成失败');
  });

  it('完成后显示步数和耗时', () => {
    const run = runOf([
      user('查一下'),
      tool('inspect', 'ok', { startedAt: 1_000, durationMs: 2_000 }),
    ]);
    expect(describeRun(run)).toBe('已执行 1 个工具 · 2 秒');
  });
});

describe('时间格式化', () => {
  it('步骤耗时少于 1 秒用毫秒', () => {
    expect(formatDuration(16)).toBe('16 ms');
  });

  it('步骤耗时超过 1 秒用秒', () => {
    expect(formatDuration(1_200)).toBe('1.2s');
  });

  it('运行耗时用中文描述', () => {
    expect(formatElapsed(800)).toBe('不足 1 秒');
    expect(formatElapsed(2_000)).toBe('2 秒');
    expect(formatElapsed(65_000)).toBe('1 分 5 秒');
  });
});
