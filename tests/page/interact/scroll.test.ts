import { beforeEach, describe, expect, it } from 'vitest';
import { runInteraction } from '@/lib/page/interact';
import { mount, resetPage } from './support';

beforeEach(resetPage);

interface Metrics {
  height: number;
  client: number;
  top: number;
}

/** happy-dom 不排版，滚动尺寸手动打桩；growBy 模拟懒加载长出新内容。 */
function stubScroll(element: HTMLElement, initial: Metrics, growBy = 0): Metrics {
  const metrics = { ...initial };
  let grown = false;
  Object.defineProperty(element, 'clientHeight', { configurable: true, get: () => metrics.client });
  Object.defineProperty(element, 'scrollHeight', { configurable: true, get: () => metrics.height });
  Object.defineProperty(element, 'scrollTop', {
    configurable: true,
    get: () => metrics.top,
    set: (value: number) => {
      metrics.top = value;
      if (growBy > 0 && !grown) {
        grown = true;
        setTimeout(() => {
          metrics.height += growBy;
        }, 60);
      }
    },
  });
  return metrics;
}

describe('interact scroll 绝对定位', () => {
  it('to=bottom 直接滚到容器最底并报告位置', async () => {
    mount('<div id="list" style="overflow-y: auto">x</div>');
    const list = document.querySelector('#list') as HTMLElement;
    const metrics = stubScroll(list, { height: 1000, client: 200, top: 0 });

    const result = await runInteraction({
      phase: 'act',
      action: 'scroll',
      selector: '#list',
      to: 'bottom',
      settleMs: 200,
    });

    expect(result.ok).toBe(true);
    expect(result.changed).toBe(true);
    expect(metrics.top).toBe(800);
    expect(result.details).toMatchObject({
      to: 'bottom',
      at_bottom: true,
      grew: false,
      scroll_top: 800,
      scroll_height: 1000,
      client_height: 200,
      distance_bottom: 0,
      container_from: 'self',
    });
  });

  it('目标是不可滚的外层时，自动选择内部真正的滚动区', async () => {
    mount('<div id="wrap"><div id="inner" style="overflow-y: auto">x</div></div>');
    const inner = document.querySelector('#inner') as HTMLElement;
    const metrics = stubScroll(inner, { height: 1000, client: 200, top: 0 });

    const result = await runInteraction({
      phase: 'act',
      action: 'scroll',
      selector: '#wrap',
      to: 'bottom',
      settleMs: 200,
    });

    expect(metrics.top).toBe(800);
    expect(result.details).toMatchObject({
      at_bottom: true,
      container_from: 'descendant',
      container_selector: '#inner',
    });
  });

  it('滚到底后等懒加载变长，如实报告新高度', async () => {
    mount('<div id="list" style="overflow-y: auto">x</div>');
    const list = document.querySelector('#list') as HTMLElement;
    const metrics = stubScroll(list, { height: 1000, client: 200, top: 0 }, 400);

    const result = await runInteraction({
      phase: 'act',
      action: 'scroll',
      selector: '#list',
      to: 'bottom',
      settleMs: 300,
    });

    expect(metrics.height).toBe(1400);
    expect(result.details).toMatchObject({
      before_height: 1000,
      scroll_height: 1400,
      grew: true,
      at_bottom: false,
      distance_bottom: 400,
    });
  });

  it('到底还在转圈时报告 loading，不冒充到底', async () => {
    mount(
      '<div id="list" style="overflow-y: auto">x<div class="loading-spinner">加载中</div></div>',
    );
    const list = document.querySelector('#list') as HTMLElement;
    stubScroll(list, { height: 1000, client: 200, top: 0 });

    const result = await runInteraction({
      phase: 'act',
      action: 'scroll',
      selector: '#list',
      to: 'bottom',
      settleMs: 200,
    });

    expect(result.details).toMatchObject({
      at_bottom: true,
      grew: false,
      loading: true,
      loading_label: '加载中',
      end_marker: null,
    });
  });

  it('页面有“没有更多”时识别为结束标记', async () => {
    mount('<div id="list" style="overflow-y: auto">x 没有更多评论</div>');
    const list = document.querySelector('#list') as HTMLElement;
    stubScroll(list, { height: 1000, client: 200, top: 0 });

    const result = await runInteraction({
      phase: 'act',
      action: 'scroll',
      selector: '#list',
      to: 'bottom',
      settleMs: 200,
    });

    expect(result.details).toMatchObject({ at_bottom: true, end_marker: '没有更多评论' });
  });

  it('to=top 回到顶部并报告位置', async () => {
    mount('<div id="list" style="overflow-y: auto">x</div>');
    const list = document.querySelector('#list') as HTMLElement;
    const metrics = stubScroll(list, { height: 1000, client: 200, top: 500 });

    const result = await runInteraction({
      phase: 'act',
      action: 'scroll',
      selector: '#list',
      to: 'top',
    });

    expect(metrics.top).toBe(0);
    expect(result.changed).toBe(true);
    expect(result.details).toMatchObject({ to: 'top', scroll_top: 0, at_bottom: false });
  });

  it('相对滚动仍按 delta 执行，并补充滚动位置', async () => {
    mount('<div id="list" style="overflow-y: auto">x</div>');
    const list = document.querySelector('#list') as HTMLElement;
    const metrics = stubScroll(list, { height: 1000, client: 200, top: 0 });

    const result = await runInteraction({
      phase: 'act',
      action: 'scroll',
      selector: '#list',
      deltaY: 300,
    });

    expect(metrics.top).toBe(300);
    expect(result.changed).toBe(true);
    expect(result.details).toMatchObject({ scroll_top: 300, scroll_height: 1000 });
  });
});
