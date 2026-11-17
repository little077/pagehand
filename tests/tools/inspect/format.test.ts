import { describe, expect, it } from 'vitest';
import type { InspectElement, InspectSnapshot } from '@/lib/page/inspect';
import {
  formatInspectForModel,
  summarizeInspect,
  toInspectDetails,
} from '@/lib/tools/inspect-format';

function element(overrides: Partial<InspectElement> = {}): InspectElement {
  return {
    ref: 'e1',
    selector: '#submit',
    tag: 'button',
    kind: 'button',
    role: 'button',
    label: '提交订单',
    label_source: 'text',
    text: '提交订单',
    value: null,
    placeholder: null,
    input_type: null,
    name: null,
    autocomplete: null,
    state: null,
    visible: true,
    hidden_reason: null,
    pointer_events_none: false,
    covered: false,
    covered_by: null,
    in_viewport: true,
    rect: { x: 10, y: 20, w: 120, h: 32 },
    ...overrides,
  };
}

function snapshot(overrides: Partial<InspectSnapshot> = {}): InspectSnapshot {
  return {
    title: '结算页',
    url: 'https://shop.example.com/checkout',
    scope_total: 1,
    total: 1,
    returned: 1,
    hidden_count: 0,
    covered_count: 0,
    truncated: false,
    scope_miss: false,
    scope_error: null,
    role_counts: [],
    fingerprint: '1:abc',
    scope: { selector: null, text: null, frame_id: 0 },
    elements: [element()],
    ...overrides,
  };
}

describe('inspect 给模型的文本格式', () => {
  it('包含页面信息、检查范围、数量与元素行', () => {
    const text = formatInspectForModel(
      snapshot({
        total: 2,
        returned: 2,
        elements: [
          element(),
          element({ ref: 'e2', role: 'textbox', label: '邮箱', value: 'a@b.com' }),
        ],
      }),
    );

    expect(text).toContain('页面：结算页');
    expect(text).toContain('https://shop.example.com/checkout');
    expect(text).toContain('检查范围：整页');
    expect(text).toContain('匹配到 2 个可操作元素');
    expect(text).toContain('[e1] button「提交订单」 · 可见');
    expect(text).toContain('[e2] textbox「邮箱」 · 可见 · 当前值：a@b.com');
    expect(text).toContain('密码框不会出现在结果里');
  });

  it('说明不可见原因、遮挡和状态', () => {
    const text = formatInspectForModel(
      snapshot({
        hidden_count: 1,
        covered_count: 1,
        elements: [
          element({ hidden_reason: 'ancestor_hidden', visible: false }),
          element({ ref: 'e2', covered: true, covered_by: '遮罩' }),
          element({
            ref: 'e3',
            role: 'checkbox',
            label: '记住我',
            state: { checked: true, disabled: true },
          }),
        ],
      }),
    );

    expect(text).toContain('不可见（被祖先元素隐藏）');
    expect(text).toContain('被遮挡（覆盖它的是 遮罩）');
    expect(text).toContain('[e3] checkbox「记住我」 · 可见 · 已勾选、已禁用');
  });

  it('范围里没有元素时给出可能原因', () => {
    const text = formatInspectForModel(
      snapshot({ total: 0, returned: 0, scope_total: 0, elements: [] }),
    );

    expect(text).toContain('没有可操作元素');
    expect(text).toContain('子框架');
  });

  it('选择器找不到时提示重新确认选择器', () => {
    const text = formatInspectForModel(
      snapshot({ scope_miss: true, scope: { selector: '#missing', text: null, frame_id: 0 } }),
    );

    expect(text).toContain('找不到选择器「#missing」');
  });

  it('结果被截断时提醒缩小范围或调大 limit', () => {
    const text = formatInspectForModel(snapshot({ truncated: true, total: 100, returned: 40 }));

    expect(text).toContain('结果已截断');
    expect(text).toContain('调大 limit');
  });

  it('UI 详情最多保留 20 个元素，避免会话记录膨胀', () => {
    const many = Array.from({ length: 25 }, (_, index) =>
      element({ ref: `e${index + 1}`, label: `按钮${index + 1}` }),
    );
    const details = toInspectDetails(snapshot({ total: 25, returned: 25, elements: many }));

    if ('error' in details) throw new Error('unexpected error details');
    expect(details.elements).toHaveLength(20);
    expect(details.elements[0]?.ref).toBe('e1');
  });

  it('摘要给出数量和问题点', () => {
    expect(summarizeInspect(snapshot())).toBe('找到 1 个可操作元素');
    expect(summarizeInspect(snapshot({ hidden_count: 2, covered_count: 1 }))).toBe(
      '找到 1 个可操作元素 · 2 个不可见 · 1 个被遮挡',
    );
    expect(summarizeInspect(snapshot({ total: 0, elements: [] }))).toBe('没有找到可操作元素');
  });

  it('placeholder 和名称分开显示，避免把提示文字当成字段名', () => {
    const text = formatInspectForModel(
      snapshot({
        elements: [
          element({
            tag: 'input',
            kind: 'input',
            role: 'searchbox',
            label: '杭州百丈岭',
            label_source: 'placeholder',
            text: null,
            placeholder: '杭州百丈岭',
            input_type: 'search',
            name: 'q',
            autocomplete: 'off',
          }),
        ],
      }),
    );

    expect(text).toContain('placeholder「杭州百丈岭」');
    expect(text).not.toContain('searchbox「杭州百丈岭」');
    expect(text).toContain('类型：search');
    expect(text).toContain('name=q');
    expect(text).toContain('autocomplete=off');
  });

  it('按类型汇总，帮助模型选择下一次筛选条件', () => {
    const text = formatInspectForModel(
      snapshot({
        total: 3,
        returned: 3,
        role_counts: [
          { role: 'button', total: 2, visible: 2 },
          { role: 'textbox', total: 1, visible: 0 },
        ],
        elements: [element(), element({ ref: 'e2' }), element({ ref: 'e3' })],
      }),
    );

    expect(text).toContain('按类型：button 2 · textbox 1（可见 0）');
  });

  it('筛选条件没有命中时，说明范围里还有多少元素', () => {
    const text = formatInspectForModel(
      snapshot({ total: 0, returned: 0, scope_total: 12, elements: [] }),
    );

    expect(text).toContain('共有 12 个可操作元素');
    expect(text).toContain('去掉 role / kind / input_type');
  });

  it('UI 详情带 scope_total 和缓存标记', () => {
    const details = toInspectDetails(snapshot({ scope_total: 8 }), true);

    if ('error' in details) throw new Error('unexpected error details');
    expect(details.scope_total).toBe(8);
    expect(details.cached).toBe(true);
    expect(details.role_counts).toEqual([]);
  });

  it('摘要说明返回数量少于匹配数量', () => {
    expect(summarizeInspect(snapshot({ total: 100, returned: 40, elements: [] }))).toContain(
      '返回 40 个',
    );
  });
});
