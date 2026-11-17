import { beforeEach, describe, expect, it } from 'vitest';
import { collectInteractiveElements } from '@/lib/page/inspect';
import { mount, resetPage, stubTopElement } from './support';

beforeEach(resetPage);

function inspectFirst(includeHidden = true) {
  const snapshot = collectInteractiveElements({ includeHidden });
  return snapshot.elements[0];
}

describe('inspect 可见性判定', () => {
  it('自身 display:none', () => {
    mount('<button style="display:none">提交</button>');

    expect(inspectFirst()).toMatchObject({
      visible: false,
      hidden_reason: 'display_none',
    });
  });

  it('祖先 display:none', () => {
    mount('<div style="display:none"><button>提交</button></div>');

    expect(inspectFirst()).toMatchObject({
      visible: false,
      hidden_reason: 'ancestor_hidden',
    });
  });

  it('visibility:hidden', () => {
    mount('<button style="visibility:hidden">提交</button>');

    expect(inspectFirst()).toMatchObject({
      visible: false,
      hidden_reason: 'visibility_hidden',
    });
  });

  it('opacity:0', () => {
    mount('<button style="opacity:0">提交</button>');

    expect(inspectFirst()).toMatchObject({
      visible: false,
      hidden_reason: 'opacity_zero',
    });
  });

  it('接近透明时说明可能在动画中', () => {
    mount('<button style="opacity:0.05">提交</button>');

    expect(inspectFirst()).toMatchObject({
      visible: false,
      hidden_reason: 'near_transparent',
    });
  });

  it('尺寸为 0', () => {
    mount('<button data-size="0">提交</button>');

    expect(inspectFirst()).toMatchObject({
      visible: false,
      hidden_reason: 'zero_size',
    });
  });

  it('鼠标穿透：看得见但点不中', () => {
    mount('<button style="pointer-events:none">提交</button>');

    expect(inspectFirst()).toMatchObject({
      visible: true,
      pointer_events_none: true,
    });
  });

  it('元素上方被别的元素盖住时标记为遮挡，并说明是谁盖住的', () => {
    mount(`
      <button>提交</button>
      <div id="mask" aria-label="遮罩"></div>
    `);
    const mask = document.getElementById('mask');
    if (!mask) throw new Error('missing mask');
    stubTopElement(mask);

    expect(inspectFirst()).toMatchObject({
      visible: true,
      covered: true,
      covered_by: '遮罩',
    });
  });

  it('不在当前视口内时给出标记', () => {
    mount('<button data-y="99999">提交</button>');

    expect(inspectFirst()).toMatchObject({
      visible: true,
      in_viewport: false,
    });
  });

  it('默认过滤不可见元素，开启 include_hidden 后才列出', () => {
    mount('<button style="display:none">提交</button>');

    expect(collectInteractiveElements({}).elements).toHaveLength(0);
    expect(collectInteractiveElements({ includeHidden: true }).elements).toHaveLength(1);
  });
});
