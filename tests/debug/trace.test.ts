import { describe, expect, it } from 'vitest';
import {
  addRunUsage,
  beginRun,
  beginStep,
  channelFor,
  createDebugTrace,
  finishRun,
  finishStep,
  isDebugTrace,
  pageFromDetails,
  redactArgs,
  setRunAnswer,
  traceSummaryMarkdown,
} from '@/lib/debug/trace';
import type { DebugTraceRun } from '@/lib/ipc/protocol';

function makeTrace() {
  const trace = createDebugTrace();
  const run = beginRun(trace, {
    id: 'run-1',
    prompt: '在小红书搜索“机械键盘”，把前 5 条笔记的标题列出来。不要点进笔记。',
    model: {
      presetId: 'custom',
      baseUrl: 'https://api.example.com/v1',
      modelId: 'text-model',
      supportsImages: false,
    },
    toolset: ['inspect', 'fill', 'interact', 'read_page'],
  });
  return { trace, run };
}

function step(
  run: DebugTraceRun,
  tool: string,
  args: unknown,
  text: string,
  details: Record<string, unknown> = {},
) {
  const current = beginStep(run, { tool, toolCallId: `${tool}-${run.steps.length}`, args });
  finishStep(run, current, {
    result: { content: [{ type: 'text', text }], details },
    isError: false,
    summary: text,
    durationMs: 12,
  });
  return current;
}

describe('debug trace 纯函数', () => {
  it('按工具和动作区分观测通道', () => {
    expect(channelFor('screenshot', {})).toBe('pixels');
    expect(channelFor('inspect', {})).toBe('structure');
    expect(channelFor('read_page', {})).toBe('text');
    expect(channelFor('interact', { action: 'click' })).toBe('action');
    expect(channelFor('interact', { action: 'wait_for' })).toBe('wait');
    expect(channelFor('ask_user', {})).toBe('interaction');
  });

  it('参数脱敏，但保留 ref / selector / option', () => {
    expect(
      redactArgs('interact', {
        action: 'fill',
        ref: 'e3',
        text: '机械键盘',
        token: 'secret',
      }),
    ).toEqual({
      action: 'fill',
      ref: 'e3',
      text: '<text:4 chars>',
      token: '<redacted>',
    });
    expect(redactArgs('interact', { action: 'select', ref: 'e4', option: '西安' })).toMatchObject({
      option: '西安',
    });
  });

  it('从工具 details 提取页面和目标', () => {
    expect(pageFromDetails({ url: 'https://example.com/a', title: '示例' })).toEqual({
      url: 'https://example.com/a',
      title: '示例',
    });
    expect(pageFromDetails({ url_after: 'https://example.com/b', title_after: '结果' })).toEqual({
      url: 'https://example.com/b',
      title: '结果',
    });
  });

  it('标记文字任务先截图、重复调用、未 inspect 先操作、未验证和禁止目标', () => {
    const { trace, run } = makeTrace();
    step(run, 'screenshot', {}, '已截图当前视口');
    step(run, 'inspect', {}, '找到 3 个可操作元素', { total: 3 });
    step(run, 'interact', { action: 'click', ref: 'e1' }, '已点击按钮「关注」', {
      target: { ref: 'e1', role: 'button', label: '关注' },
      changed: true,
    });
    step(run, 'interact', { action: 'click', ref: 'e1' }, '已点击按钮「关注」', {
      target: { ref: 'e1', role: 'button', label: '关注' },
      changed: true,
    });
    step(run, 'read_page', {}, '没有可读内容', { totalChars: 0 });
    step(run, 'interact', { action: 'click', ref: 'e2' }, '已点击按钮「下一页」');

    finishRun(run, 'done');
    setRunAnswer(run, '答案');

    expect(run.flags.screenshotCount).toBe(1);
    expect(run.flags.screenshotBeforeRead).toBe(true);
    expect(run.flags.screenshotOnTextTask).toBe(true);
    expect(run.flags.repeatCalls).toBe(1);
    expect(run.flags.actionWithoutInspect).toBe(false); // inspect 在第一次点击前
    expect(run.flags.unverifiedActions).toBeGreaterThan(0);
    expect(run.flags.readEmpty).toBe(1);
    expect(run.flags.forbiddenLabels).toContain('关注');
    expect(run.status).toBe('done');
    expect(run.endedAt).not.toBeNull();
    expect(trace.runs[0]?.answer).toBe('答案');
    expect(traceSummaryMarkdown(trace)).toContain('小红书');
    expect(traceSummaryMarkdown(trace)).toContain('关注');
  });

  it('interact 在 inspect 前发生时标记 actionWithoutInspect', () => {
    const { run } = makeTrace();
    step(run, 'interact', { action: 'fill', ref: 'e1' }, '已填写输入框');
    expect(run.flags.actionWithoutInspect).toBe(true);
  });

  it('识别登录/验证码阻塞，但 inspect 的安全提示不算阻塞', () => {
    const { run } = makeTrace();
    step(run, 'inspect', {}, '出于安全考虑，银行卡和验证码的值不会回传');
    expect(run.flags.blocked).toBe(false);
    step(run, 'read_page', {}, '请登录后查看搜索结果');
    expect(run.flags.blocked).toBe(true);
  });
});

describe('isDebugTrace', () => {
  it('接受自己写出的 trace，拒绝空值和坏形状', () => {
    expect(isDebugTrace(createDebugTrace())).toBe(true);
    expect(isDebugTrace(null)).toBe(false);
    expect(isDebugTrace({})).toBe(false);
    expect(isDebugTrace({ version: 2, runs: [] })).toBe(false);
    expect(isDebugTrace({ version: 1, runs: 'nope' })).toBe(false);
  });
});

describe('token 用量', () => {
  it('按每次模型响应累加输入、输出和缓存 token', () => {
    const { run } = makeTrace();
    addRunUsage(run, { input: 1000, output: 200, cacheRead: 300, totalTokens: 1500 });
    addRunUsage(run, { input: 2000, output: 300, cacheRead: 500, totalTokens: 2800 });

    expect(run.usage).toEqual({
      calls: 2,
      input: 3000,
      output: 500,
      cacheRead: 800,
      cacheWrite: 0,
      totalTokens: 4300,
    });
  });

  it('供应商没给合计时按各项相加', () => {
    const { run } = makeTrace();
    addRunUsage(run, { input: 100, output: 50 });
    expect(run.usage?.totalTokens).toBe(150);
    expect(run.usage?.calls).toBe(1);
  });

  it('summary.md 输出 Token 表和合计', () => {
    const { trace, run } = makeTrace();
    addRunUsage(run, { input: 1000, output: 200, cacheRead: 300, totalTokens: 1500 });
    const second = beginRun(trace, {
      id: 'run-2',
      prompt: '第二轮',
      model: null,
      toolset: ['read_page'],
    });
    addRunUsage(second, { input: 500, output: 100, totalTokens: 600 });

    const markdown = traceSummaryMarkdown(trace);
    expect(markdown).toContain('## Token 用量');
    expect(markdown).toContain('| 合计 | 2 | 1500 | 300 | 0 | 300 | 2100 |');
    expect(markdown).toContain('输入 1000');
  });

  it('旧诊断包没有 usage 时显示占位，不崩', () => {
    const { trace, run } = makeTrace();
    run.usage = undefined;
    expect(traceSummaryMarkdown(trace)).toContain(`| ${run.id} | 0 | — | — | — | — | — |`);
  });
});
