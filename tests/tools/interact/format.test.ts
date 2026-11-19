import { describe, expect, it } from 'vitest';
import type { InteractPageResult } from '@/lib/page/interact';
import {
  formatInteractForModel,
  type InteractOutcome,
  toInteractDetails,
} from '@/lib/tools/interact-format';

function page(overrides: Partial<InteractPageResult> = {}): InteractPageResult {
  return {
    ok: true,
    code: null,
    message: '操作已执行，页面有变化。',
    action: 'click',
    phase: 'act',
    target: {
      ref: 'e3',
      tag: 'button',
      role: 'button',
      label: '搜索',
      selector: 'body > button',
    },
    state: null,
    changed: true,
    url_before: 'https://example.com/',
    url_after: 'https://example.com/',
    title_after: '示例',
    frame_url: 'https://example.com/',
    mutated: 1,
    by_coords: false,
    duration_ms: 120,
    warnings: [],
    details: {},
    ...overrides,
  };
}

function outcome(overrides: Partial<InteractOutcome> = {}): InteractOutcome {
  return {
    page: page(),
    frame_id: 0,
    navigation: 'none',
    new_tab: null,
    ...overrides,
  };
}

describe('interact 结果格式化', () => {
  it('成功时说明点击目标和页面变化', () => {
    const text = formatInteractForModel(outcome());

    expect(text).toContain('已点击按钮「搜索」');
    expect(text).not.toContain('没有可见变化');
  });

  it('页面无变化时明确提醒先 inspect，不假装成功', () => {
    const text = formatInteractForModel(outcome({ page: page({ changed: false, mutated: 0 }) }));

    expect(text).toContain('没有可见变化');
    expect(text).toContain('inspect');
  });

  it('导航后提示 ref 失效', () => {
    const text = formatInteractForModel(
      outcome({
        page: page({ url_after: 'https://example.com/result' }),
        navigation: 'completed',
      }),
    );

    expect(text).toContain('页面已跳转');
    expect(text).toContain('重新 inspect');
  });

  it('新标签页只报告，不假装在新页面里操作了', () => {
    const text = formatInteractForModel(
      outcome({
        new_tab: { id: 7, url: 'https://example.com/new', title: '新页面' },
      }),
    );

    expect(text).toContain('打开了新标签页');
    expect(text).toContain('新页面');
  });

  it('失败时给模型一个可行动的下一步', () => {
    const text = formatInteractForModel(
      outcome({
        page: page({
          ok: false,
          code: 'covered',
          message: '目标的点击点被「登录遮罩」挡住。',
        }),
      }),
    );

    expect(text).toContain('登录遮罩');
    expect(text).toContain('下一步：先关闭弹窗');
  });

  it('给 UI 的 details 保留目标、变化和导航信息', () => {
    const details = toInteractDetails(outcome({ navigation: 'completed', new_tab: null }));

    expect(details).toMatchObject({
      action: 'click',
      changed: true,
      navigation: 'completed',
      target: { ref: 'e3', label: '搜索' },
    });
  });

  it('错误详情只保留错误和错误码，不塞整页结果', () => {
    const details = toInteractDetails(
      outcome({ page: page({ ok: false, code: 'ref_stale', message: '元素已移除' }) }),
    );

    expect(details).toEqual({ error: '元素已移除', code: 'ref_stale' });
  });
});
