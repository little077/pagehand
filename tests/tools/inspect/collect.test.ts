import { beforeEach, describe, expect, it } from 'vitest';
import { collectInteractiveElements } from '@/lib/page/inspect';
import { mount, resetPage } from './support';

beforeEach(resetPage);

describe('inspect 元素采集', () => {
  it('按文档顺序列出按钮、链接、输入框，并给每个元素编号', () => {
    mount(`
      <button id="login">登录</button>
      <a href="/forgot">忘记密码</a>
      <input id="email" name="email" autocomplete="email" placeholder="邮箱" value="a@b.com" />
      <label for="city">城市</label>
      <select id="city"><option value="bj">北京</option></select>
      <textarea placeholder="备注"></textarea>
    `);

    const snapshot = collectInteractiveElements({});

    expect(snapshot.total).toBe(5);
    expect(snapshot.scope_total).toBe(5);
    expect(snapshot.fingerprint).toContain('|5:');
    expect(snapshot.elements.map((element) => element.ref)).toEqual(['e1', 'e2', 'e3', 'e4', 'e5']);
    expect(snapshot.elements[0]).toMatchObject({
      role: 'button',
      label: '登录',
      label_source: 'text',
    });
    expect(snapshot.elements[1]).toMatchObject({
      role: 'link',
      label: '忘记密码',
      label_source: 'text',
    });
    expect(snapshot.elements[2]).toMatchObject({
      role: 'textbox',
      label: '邮箱',
      label_source: 'placeholder',
      value: 'a@b.com',
      placeholder: '邮箱',
      input_type: 'text',
      name: 'email',
      autocomplete: 'email',
    });
    expect(snapshot.elements[3]).toMatchObject({
      role: 'combobox',
      label: '城市',
      label_source: 'label',
    });
    expect(snapshot.elements[4]).toMatchObject({
      role: 'textbox',
      label: '备注',
      label_source: 'placeholder',
    });
    expect(snapshot.role_counts).toEqual(
      expect.arrayContaining([
        { role: 'textbox', total: 2, visible: 2 },
        { role: 'button', total: 1, visible: 1 },
        { role: 'link', total: 1, visible: 1 },
        { role: 'combobox', total: 1, visible: 1 },
      ]),
    );
  });

  it('返回搜索框的 placeholder、input type、name、autocomplete 和名称来源', () => {
    mount(`
      <input id="search" type="search" name="q" autocomplete="off" placeholder="杭州百丈岭" />
    `);

    const snapshot = collectInteractiveElements({});

    expect(snapshot.elements[0]).toMatchObject({
      kind: 'input',
      role: 'searchbox',
      label: '杭州百丈岭',
      label_source: 'placeholder',
      placeholder: '杭州百丈岭',
      input_type: 'search',
      name: 'q',
      autocomplete: 'off',
    });
  });

  it('不列出密码框和隐藏输入框', () => {
    mount(`
      <input type="password" id="pwd" placeholder="密码" />
      <input type="hidden" name="token" value="secret" />
      <input id="email" placeholder="邮箱" />
    `);

    const snapshot = collectInteractiveElements({});

    expect(snapshot.total).toBe(1);
    expect(snapshot.elements[0]?.label).toBe('邮箱');
    expect(snapshot.elements.some((element) => element.label === '密码')).toBe(false);
  });

  it('识别 contenteditable 和 role 控件', () => {
    mount(`
      <div contenteditable="true" aria-label="评论框"></div>
      <div role="switch" aria-label="夜间模式"></div>
      <div role="button" tabindex="0">自定义按钮</div>
    `);

    const snapshot = collectInteractiveElements({});

    expect(snapshot.elements.map((element) => element.role)).toEqual([
      'textbox',
      'switch',
      'button',
    ]);
    expect(snapshot.elements.map((element) => element.label)).toEqual([
      '评论框',
      '夜间模式',
      '自定义按钮',
    ]);
  });

  it('名称优先使用 aria-label，其次是 label、placeholder、可见文字', () => {
    mount(`
      <label for="a">绑定标签</label>
      <input id="a" aria-label="无障碍名称" placeholder="占位符" />
      <input id="b" placeholder="占位符名称" />
      <button id="c">按钮文字</button>
    `);

    const labels = collectInteractiveElements({}).elements.map((element) => element.label);
    const sources = collectInteractiveElements({}).elements.map((element) => element.label_source);

    expect(labels).toEqual(['无障碍名称', '占位符名称', '按钮文字']);
    expect(sources).toEqual(['aria-label', 'placeholder', 'text']);
  });

  it('text 参数按名称或文字过滤，不区分大小写', () => {
    mount(`
      <button>立即购买</button>
      <button>加入购物车</button>
      <button>Login</button>
    `);

    const snapshot = collectInteractiveElements({ text: 'login' });

    expect(snapshot.total).toBe(1);
    expect(snapshot.elements[0]?.label).toBe('Login');
  });

  it('selector 参数只检查指定区域', () => {
    mount(`
      <div id="form"><button>提交</button></div>
      <button>区域外按钮</button>
    `);

    const snapshot = collectInteractiveElements({ selector: '#form' });

    expect(snapshot.total).toBe(1);
    expect(snapshot.elements[0]?.label).toBe('提交');
    expect(snapshot.scope.selector).toBe('#form');
  });

  it('选择器写错时返回明确的错误标记，而不是假装页面为空', () => {
    mount('<button>提交</button>');

    const snapshot = collectInteractiveElements({ selector: 'div[' });

    expect(snapshot.scope_error).not.toBeNull();
    expect(snapshot.elements).toHaveLength(0);
  });

  it('选择器找不到时标记 scope_miss，而不是报语法错误', () => {
    mount('<button>提交</button>');

    const snapshot = collectInteractiveElements({ selector: '#missing' });

    expect(snapshot.scope_miss).toBe(true);
    expect(snapshot.scope_error).toBeNull();
  });

  it('limit 限制返回数量并标记截断', () => {
    mount('<button>一</button><button>二</button><button>三</button>');

    const snapshot = collectInteractiveElements({ limit: 2 });

    expect(snapshot.total).toBe(3);
    expect(snapshot.returned).toBe(2);
    expect(snapshot.truncated).toBe(true);
  });

  it('不可见元素默认不返回，但依然占用编号，便于后续稳定引用', () => {
    mount(`
      <button style="display:none">隐藏按钮</button>
      <button>可见按钮</button>
    `);

    const visible = collectInteractiveElements({});
    expect(visible.elements.map((element) => element.ref)).toEqual(['e2']);

    const all = collectInteractiveElements({ includeHidden: true });
    expect(all.elements.map((element) => element.ref)).toEqual(['e1', 'e2']);
    expect(all.elements[0]?.hidden_reason).toBe('display_none');
  });

  it('text 过滤不改变编号：编号按检查范围内的候选顺序分配', () => {
    mount('<button>A</button><button>B</button>');

    const snapshot = collectInteractiveElements({ text: 'B' });

    expect(snapshot.scope_total).toBe(2);
    expect(snapshot.total).toBe(1);
    expect(snapshot.elements[0]?.label).toBe('B');
    expect(snapshot.elements[0]?.ref).toBe('e2');
  });

  it('生成绝对选择器，优先使用 id', () => {
    mount('<div id="form"><button id="submit">提交</button></div>');

    const snapshot = collectInteractiveElements({});

    expect(snapshot.elements[0]?.selector).toBe('#submit');
  });
});
