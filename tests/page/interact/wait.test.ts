import { beforeEach, describe, expect, it } from 'vitest';
import { runInteraction } from '@/lib/page/interact';
import { mount, resetPage } from './support';

beforeEach(resetPage);

describe('interact wait_for', () => {
  it('等待元素出现', async () => {
    mount('<div id="root"></div>');
    setTimeout(() => {
      const button = document.createElement('button');
      button.id = 'later';
      button.textContent = '稍后出现';
      document.querySelector('#root')?.append(button);
    }, 60);

    const result = await runInteraction({
      phase: 'act',
      action: 'wait_for',
      selector: '#later',
      state: 'visible',
      timeout: 1000,
    });

    expect(result.ok).toBe(true);
    expect(result.target?.label).toBe('稍后出现');
  });

  it('等待元素消失', async () => {
    mount('<div id="loading">加载中</div>');
    setTimeout(() => document.querySelector('#loading')?.remove(), 60);

    const result = await runInteraction({
      phase: 'act',
      action: 'wait_for',
      selector: '#loading',
      state: 'hidden',
      timeout: 1000,
    });

    expect(result.ok).toBe(true);
  });

  it('等待输入值相等', async () => {
    mount('<input id="q" />');
    setTimeout(() => {
      const input = document.querySelector('#q') as HTMLInputElement;
      input.value = '完成';
      input.dispatchEvent(new Event('input', { bubbles: true }));
    }, 60);

    const result = await runInteraction({
      phase: 'act',
      action: 'wait_for',
      selector: '#q',
      state: 'value',
      value: '完成',
      timeout: 1000,
    });

    expect(result.ok).toBe(true);
  });

  it('超时返回 timeout，不假装条件满足', async () => {
    mount('<div id="root"></div>');

    const result = await runInteraction({
      phase: 'act',
      action: 'wait_for',
      selector: '#never',
      state: 'visible',
      timeout: 1000,
    });

    expect(result.ok).toBe(false);
    expect(result.code).toBe('timeout');
  });
});
