import { beforeEach, describe, expect, it } from 'vitest';
import { runInteraction } from '@/lib/page/interact';
import { mount, resetPage, stubTopElement } from './support';

beforeEach(resetPage);

describe('interact 授权目标复核', () => {
  it('注入前发现网站已变化就停止操作', async () => {
    mount('<button id="go">继续</button>');
    const button = document.querySelector('#go') as HTMLButtonElement;
    let clicks = 0;
    button.addEventListener('click', () => {
      clicks += 1;
    });
    stubTopElement(button);

    const result = await runInteraction({
      phase: 'act',
      action: 'click',
      selector: '#go',
      expectedOrigin: 'https://other.example',
    });

    expect(result).toMatchObject({ ok: false, code: 'permission_target_mismatch' });
    expect(clicks).toBe(0);
  });

  it('确认后同一选择器指向新元素时停止操作', async () => {
    mount('<button id="target">删除项目 A</button>');
    const probe = await runInteraction({
      phase: 'probe',
      action: 'click',
      selector: '#target',
    });
    expect(probe.ok).toBe(true);

    const replacement = document.createElement('button');
    replacement.id = 'target';
    replacement.textContent = '删除项目 B';
    document.querySelector('#target')?.replaceWith(replacement);
    let clicks = 0;
    replacement.addEventListener('click', () => {
      clicks += 1;
    });
    stubTopElement(replacement);

    const result = await runInteraction({
      phase: 'act',
      action: 'click',
      selector: '#target',
      expectedTargetRef: probe.target?.ref ?? undefined,
    });

    expect(result).toMatchObject({ ok: false, code: 'permission_target_mismatch' });
    expect(clicks).toBe(0);
  });
});

describe('interact 动作语义', () => {
  it('fill 替换输入并触发 input 事件', async () => {
    mount('<input id="q" />');
    const input = document.querySelector('#q') as HTMLInputElement;
    let inputEvents = 0;
    input.addEventListener('input', () => {
      inputEvents += 1;
    });
    input.value = '旧内容';

    const result = await runInteraction({
      phase: 'act',
      action: 'fill',
      selector: '#q',
      text: '机械键盘',
    });

    expect(result.ok).toBe(true);
    expect(result.changed).toBe(true);
    expect(input.value).toBe('机械键盘');
    expect(inputEvents).toBeGreaterThan(0);
    expect(result.state?.value).toBe('机械键盘');
  });

  it('type 追加内容，不覆盖原值', async () => {
    mount('<input id="q" value="机械" />');
    const input = document.querySelector('#q') as HTMLInputElement;

    const result = await runInteraction({
      phase: 'act',
      action: 'type',
      selector: '#q',
      text: '键盘',
    });

    expect(result.ok).toBe(true);
    expect(input.value).toBe('机械键盘');
  });

  it('contenteditable 富文本没有 execCommand 时回退写入', async () => {
    mount('<div id="editor" contenteditable="true"></div>');
    const editor = document.querySelector('#editor') as HTMLElement;

    const result = await runInteraction({
      phase: 'act',
      action: 'fill',
      selector: '#editor',
      text: '你好',
    });

    expect(result.ok).toBe(true);
    expect(editor.textContent).toContain('你好');
  });

  it('click 派发点击并观察到页面变化', async () => {
    mount('<button id="go">搜索</button><p id="status">未点击</p>');
    const button = document.querySelector('#go') as HTMLButtonElement;
    const status = document.querySelector('#status') as HTMLParagraphElement;
    button.addEventListener('click', () => {
      status.textContent = '已点击';
    });
    stubTopElement(button);

    const result = await runInteraction({ phase: 'act', action: 'click', selector: '#go' });

    expect(result.ok).toBe(true);
    expect(result.changed).toBe(true);
    expect(result.mutated).toBeGreaterThan(0);
    expect(status.textContent).toBe('已点击');
  });

  it('click 没有变化时如实返回，不假装成功', async () => {
    mount('<button id="go">没反应</button>');
    const button = document.querySelector('#go') as HTMLButtonElement;
    stubTopElement(button);

    const result = await runInteraction({ phase: 'act', action: 'click', selector: '#go' });

    expect(result.ok).toBe(true);
    expect(result.changed).toBe(false);
    expect(result.message).toContain('没有看到页面变化');
  });

  it('select 按可见文字选择原生下拉', async () => {
    mount(
      '<select id="city"><option value="bj">北京</option><option value="xa">西安</option></select>',
    );

    const result = await runInteraction({
      phase: 'act',
      action: 'select',
      selector: '#city',
      option: '西安',
    });

    expect(result.ok).toBe(true);
    expect((document.querySelector('#city') as HTMLSelectElement).value).toBe('xa');
  });

  it('check 幂等：第二次不再点击', async () => {
    mount('<input id="agree" type="checkbox" />');
    const checkbox = document.querySelector('#agree') as HTMLInputElement;
    stubTopElement(checkbox);

    const first = await runInteraction({
      phase: 'act',
      action: 'check',
      selector: '#agree',
    });
    const second = await runInteraction({
      phase: 'act',
      action: 'check',
      selector: '#agree',
    });

    expect(first.ok).toBe(true);
    expect(checkbox.checked).toBe(true);
    expect(second.ok).toBe(true);
    expect(second.changed).toBe(false);
    expect(second.details.already).toBe(true);
  });

  it('press 只在目标获得焦点后派发按键', async () => {
    mount('<input id="q" />');
    const input = document.querySelector('#q') as HTMLInputElement;
    let keys: string[] = [];
    input.addEventListener('keydown', (event) => {
      keys = [...keys, event.key];
    });

    const result = await runInteraction({
      phase: 'act',
      action: 'press',
      selector: '#q',
      key: 'Enter',
    });

    expect(result.ok).toBe(true);
    expect(keys).toContain('Enter');
  });

  it('press 不要求鼠标命中，遮罩存在时 Escape 仍能发给当前焦点', async () => {
    mount('<div id="mask"></div><p id="status">关闭</p>');
    const mask = document.querySelector('#mask') as HTMLDivElement;
    stubTopElement(mask);

    const result = await runInteraction({
      phase: 'act',
      action: 'press',
      key: 'Escape',
    });

    expect(result.ok).toBe(true);
  });

  it('hover 派发悬停事件，同时提示 CSS :hover 限制', async () => {
    mount('<div id="menu">菜单</div><p id="status">关闭</p>');
    const menu = document.querySelector('#menu') as HTMLDivElement;
    const status = document.querySelector('#status') as HTMLParagraphElement;
    menu.addEventListener('mouseover', () => {
      status.textContent = '打开';
    });
    stubTopElement(menu);

    const result = await runInteraction({ phase: 'act', action: 'hover', selector: '#menu' });

    expect(result.ok).toBe(true);
    expect(status.textContent).toBe('打开');
    expect(result.warnings.join('')).toContain('CSS :hover');
  });
});
