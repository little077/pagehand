import { beforeEach, describe, expect, it } from 'vitest';
import { collectInteractiveElements } from '@/lib/page/inspect';
import { formatInspectForModel } from '@/lib/tools/inspect-format';
import { mount, resetPage } from './support';

beforeEach(resetPage);

function mountForm(): void {
  mount(`
    <input id="search" type="search" placeholder="搜索" />
    <input id="email" type="email" placeholder="邮箱" />
    <textarea placeholder="备注"></textarea>
    <button>提交</button>
    <a href="/help">帮助</a>
  `);
}

describe('inspect 筛选参数', () => {
  it('kind=input 只返回输入类元素', () => {
    mountForm();

    const snapshot = collectInteractiveElements({ kind: 'input' });

    expect(snapshot.total).toBe(3);
    expect(snapshot.elements.map((element) => element.label)).toEqual(['搜索', '邮箱', '备注']);
  });

  it('kind=button 和 kind=link 分别过滤', () => {
    mountForm();

    expect(collectInteractiveElements({ kind: 'button' }).elements.map((el) => el.label)).toEqual([
      '提交',
    ]);
    expect(collectInteractiveElements({ kind: 'link' }).elements.map((el) => el.label)).toEqual([
      '帮助',
    ]);
  });

  it('input_type 精确过滤输入框类型', () => {
    mountForm();

    const search = collectInteractiveElements({ inputType: 'search' });
    expect(search.total).toBe(1);
    expect(search.elements[0]?.label).toBe('搜索');

    const email = collectInteractiveElements({ inputType: 'email' });
    expect(email.total).toBe(1);
    expect(email.elements[0]?.label).toBe('邮箱');
  });

  it('role 精确过滤角色，搜索框和普通文本框分开', () => {
    mountForm();

    const textboxes = collectInteractiveElements({ role: 'textbox' });
    expect(textboxes.elements.map((element) => element.label)).toEqual(['邮箱', '备注']);

    const searchboxes = collectInteractiveElements({ role: 'searchbox' });
    expect(searchboxes.elements.map((element) => element.label)).toEqual(['搜索']);
  });

  it('多个条件可以组合', () => {
    mountForm();

    const snapshot = collectInteractiveElements({ kind: 'input', text: '邮箱' });

    expect(snapshot.total).toBe(1);
    expect(snapshot.elements[0]?.label).toBe('邮箱');
  });

  it('筛选不改变编号：编号仍按范围内全部候选分配', () => {
    mountForm();

    const search = collectInteractiveElements({ inputType: 'search' });
    expect(search.scope_total).toBe(5);
    expect(search.elements[0]?.ref).toBe('e1');

    const textarea = collectInteractiveElements({ role: 'textbox', text: '备注' });
    expect(textarea.elements[0]?.ref).toBe('e3');
  });

  it('条件没有命中时说明范围内还有多少元素', () => {
    mountForm();

    const snapshot = collectInteractiveElements({ inputType: 'password' });
    const text = formatInspectForModel(snapshot);

    expect(snapshot.total).toBe(0);
    expect(snapshot.scope_total).toBe(5);
    expect(text).toContain('共有 5 个可操作元素');
    expect(text).toContain('去掉 role / kind / input_type');
  });
});
