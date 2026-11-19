import { beforeEach, describe, expect, it } from 'vitest';
import { collectInteractiveElements } from '@/lib/page/inspect';
import { runInteraction } from '@/lib/page/interact';
import { mount, resetPage } from './support';

beforeEach(resetPage);

describe('interact 执行前检查', () => {
  it('不可见、禁用、密码框、文件框和歧义选择器都明确拒绝', async () => {
    mount(`
      <div style="display:none"><button id="hidden">提交</button></div>
      <button id="off" disabled>禁用按钮</button>
      <input id="pwd" type="password" />
      <input id="file" type="file" />
      <button class="dup">重复 A</button>
      <button class="dup">重复 B</button>
    `);

    const hidden = await runInteraction({ phase: 'act', action: 'click', selector: '#hidden' });
    expect(hidden.code).toBe('not_visible');

    const disabled = await runInteraction({ phase: 'act', action: 'click', selector: '#off' });
    expect(disabled.code).toBe('disabled');

    const password = await runInteraction({
      phase: 'act',
      action: 'fill',
      selector: '#pwd',
      text: 'secret',
    });
    expect(password.code).toBe('unsupported_input');
    expect((document.querySelector('#pwd') as HTMLInputElement).value).toBe('');

    const file = await runInteraction({ phase: 'act', action: 'click', selector: '#file' });
    expect(file.code).toBe('unsupported_input');

    const ambiguous = await runInteraction({ phase: 'act', action: 'click', selector: '.dup' });
    expect(ambiguous.code).toBe('ambiguous');
  });

  it('缺少必要参数时直接报错，不把空值当成清空或“条件已满足”', async () => {
    mount('<input id="q" /><div id="root"></div>');

    const fill = await runInteraction({ phase: 'probe', action: 'fill', selector: '#q' });
    expect(fill.code).toBe('unsupported_action');

    const wait = await runInteraction({
      phase: 'act',
      action: 'wait_for',
      selector: '#q',
      state: 'text',
    });
    expect(wait.code).toBe('unsupported_action');
  });

  it('银行卡和验证码字段不代填，原值也不回传', async () => {
    mount(`
      <input id="card" autocomplete="cc-number" value="4111111111111111" />
      <input id="otp" autocomplete="one-time-code" value="123456" />
    `);

    const card = await runInteraction({
      phase: 'act',
      action: 'fill',
      selector: '#card',
      text: '4000000000000000',
    });
    expect(card.code).toBe('unsupported_input');
    expect((document.querySelector('#card') as HTMLInputElement).value).toBe('4111111111111111');

    const otp = await runInteraction({
      phase: 'act',
      action: 'fill',
      selector: '#otp',
      text: '000000',
    });
    expect(otp.code).toBe('unsupported_input');
    expect((document.querySelector('#otp') as HTMLInputElement).value).toBe('123456');
  });

  it('ref 缺失和元素移除后都要求重新 inspect', async () => {
    mount('<button id="target">按钮</button>');
    const snapshot = collectInteractiveElements({});
    const ref = snapshot.elements[0]?.ref;
    if (!ref) throw new Error('missing ref');

    const stale = await (async () => {
      document.querySelector('#target')?.remove();
      return runInteraction({ phase: 'act', action: 'click', ref });
    })();
    expect(stale.code).toBe('ref_stale');

    const missing = await runInteraction({ phase: 'act', action: 'click', ref: 'e999' });
    expect(missing.code).toBe('ref_missing');
  });

  it('被遮罩挡住时返回覆盖者，不派发点击', async () => {
    mount(`
      <button id="target">提交</button>
      <div id="mask" aria-label="登录遮罩"></div>
    `);
    const target = document.querySelector('#target');
    const mask = document.querySelector('#mask');
    if (!target || !mask) throw new Error('missing elements');
    document.elementFromPoint = () => mask;
    let clicked = false;
    target.addEventListener('click', () => {
      clicked = true;
    });

    const result = await runInteraction({ phase: 'act', action: 'click', selector: '#target' });

    expect(result.code).toBe('covered');
    expect(result.message).toContain('登录遮罩');
    expect(clicked).toBe(false);
  });
});
