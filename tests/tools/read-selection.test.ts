import { afterEach, describe, expect, it } from 'vitest';
import { formatSelectionForModel } from '@/lib/tools/format';
import { extractSelection } from '@/lib/tools/read-selection';

afterEach(() => {
  document.body.replaceChildren();
  window.getSelection()?.removeAllRanges();
});

describe('选中文本读取边界', () => {
  it('焦点在密码框时不读取字段值，也不回退到其他选区', () => {
    const publicText = document.createElement('div');
    publicText.textContent = '这段普通文字不能被顺带返回';
    document.body.append(publicText);
    const range = document.createRange();
    range.selectNodeContents(publicText);
    window.getSelection()?.addRange(range);

    const password = document.createElement('input');
    password.type = 'password';
    password.value = 'secret-value';
    document.body.append(password);
    password.focus();
    password.setSelectionRange(2, 7);

    const result = extractSelection();
    expect(result).toMatchObject({
      excludedSensitive: true,
      text: '',
      totalChars: 0,
      truncated: false,
    });
    expect(formatSelectionForModel(result)).toContain('不会读取或返回这些内容');
    expect(formatSelectionForModel(result)).not.toContain('secret-value');
  });

  it('普通输入框的选中文字仍可读取', () => {
    const input = document.createElement('input');
    input.value = 'hello world';
    document.body.append(input);
    input.focus();
    input.setSelectionRange(6, 11);

    expect(extractSelection()).toMatchObject({
      excludedSensitive: false,
      text: 'world',
      totalChars: 5,
    });
  });

  it.each([
    { autocomplete: 'current-password', label: '当前密码' },
    { autocomplete: 'one-time-code', label: '短信验证码' },
    { autocomplete: '', label: 'verification_code' },
  ])('排除敏感字段 $label', ({ autocomplete, label }) => {
    const publicText = document.createElement('div');
    publicText.textContent = '这段普通文字不能被顺带返回';
    document.body.append(publicText);
    const range = document.createRange();
    range.selectNodeContents(publicText);
    window.getSelection()?.addRange(range);

    const input = document.createElement('input');
    input.setAttribute('autocomplete', autocomplete);
    input.setAttribute('aria-label', label);
    input.value = '123456';
    document.body.append(input);
    input.focus();
    input.setSelectionRange(0, 6);

    const result = extractSelection();
    expect(result).toMatchObject({ excludedSensitive: true, text: '', totalChars: 0 });
    expect(formatSelectionForModel(result)).not.toContain('123456');
  });

  it('排除 name 为 captcha 的字段', () => {
    const input = document.createElement('input');
    input.name = 'captcha';
    input.value = 'ABCDE';
    document.body.append(input);
    input.focus();
    input.setSelectionRange(0, 5);

    expect(extractSelection()).toMatchObject({ excludedSensitive: true, text: '' });
  });

  it('排除通过关联 label 标注的验证码字段', () => {
    const label = document.createElement('label');
    label.htmlFor = 'sms-code';
    label.textContent = '短信验证码';
    const input = document.createElement('input');
    input.id = 'sms-code';
    input.value = '123456';
    document.body.append(label, input);
    input.focus();
    input.setSelectionRange(0, 6);

    expect(extractSelection()).toMatchObject({ excludedSensitive: true, text: '' });
  });
});
