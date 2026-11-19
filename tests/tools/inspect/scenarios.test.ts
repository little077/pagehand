import { beforeEach, describe, expect, it } from 'vitest';
import { collectInteractiveElements } from '@/lib/page/inspect';
import { formatInspectForModel } from '@/lib/tools/inspect-format';
import { mount, resetPage, stubTopElement } from './support';

beforeEach(resetPage);

describe('inspect 用户场景', () => {
  it('填表前先找字段：密码框不会泄露给模型', () => {
    mount(`
      <form id="login-form">
        <label for="email">邮箱</label>
        <input id="email" type="email" placeholder="请输入邮箱" />
        <label for="pwd">密码</label>
        <input id="pwd" type="password" placeholder="请输入密码" />
        <button type="submit">登录</button>
      </form>
    `);

    const snapshot = collectInteractiveElements({ selector: '#login-form' });
    const text = formatInspectForModel(snapshot);

    expect(snapshot.elements.map((element) => element.label)).toEqual(['邮箱', '登录']);
    expect(text).not.toContain('请输入密码');
    expect(text).toContain('密码框不会出现');
  });

  it('银行卡和验证码的值不会出现在快照里', () => {
    mount(`
      <input id="card" name="card" autocomplete="cc-number" value="4111111111111111" />
      <input id="otp" autocomplete="one-time-code" value="123456" />
    `);

    const snapshot = collectInteractiveElements({ includeHidden: true });

    expect(snapshot.elements.every((element) => element.value === null)).toBe(true);
  });

  it('商品列表里按文字找到所有“加入购物车”，再按顺序选第二个', () => {
    mount(`
      <ul>
        <li><span>键盘 A</span><button>加入购物车</button></li>
        <li><span>键盘 B</span><button>加入购物车</button></li>
        <li><span>键盘 C</span><button>加入购物车</button></li>
      </ul>
    `);

    const snapshot = collectInteractiveElements({ text: '加入购物车' });

    expect(snapshot.total).toBe(3);
    expect(snapshot.elements.map((element) => element.ref)).toEqual(['e1', 'e2', 'e3']);
    expect(snapshot.elements.every((element) => element.label === '加入购物车')).toBe(true);

    const second = snapshot.elements[1];
    if (!second) throw new Error('missing second button');
    expect(second.ref).toBe('e2');
    expect(second.selector).toContain('li:nth-of-type(2)');
  });

  it('用户问“为什么点不动”时，说明被遮挡和鼠标穿透', () => {
    mount(`
      <button>提交订单</button>
      <button id="ghost" style="pointer-events:none">幽灵按钮</button>
      <div id="mask" aria-label="登录弹窗遮罩"></div>
    `);
    const mask = document.getElementById('mask');
    if (!mask) throw new Error('missing mask');
    stubTopElement(mask);

    const snapshot = collectInteractiveElements({});
    const text = formatInspectForModel(snapshot);

    expect(text).toContain('被遮挡（覆盖它的是 登录弹窗遮罩）');
    expect(text).toContain('鼠标穿透');
  });

  it('只看弹窗里的按钮，避免把整页按钮都列出来', () => {
    mount(`
      <button>页头登录</button>
      <div id="modal">
        <button>同意</button>
        <button>拒绝</button>
      </div>
      <button>页脚按钮</button>
    `);

    const snapshot = collectInteractiveElements({ selector: '#modal' });

    expect(snapshot.elements.map((element) => element.label)).toEqual(['同意', '拒绝']);
  });

  it('排查隐藏菜单时，开启 include_hidden 才能看到被祖先藏起来的条目', () => {
    mount(`
      <nav id="menu" style="display:none">
        <button>退出登录</button>
      </nav>
    `);

    expect(collectInteractiveElements({}).elements).toHaveLength(0);

    const snapshot = collectInteractiveElements({ includeHidden: true });
    expect(snapshot.elements[0]).toMatchObject({
      label: '退出登录',
      visible: false,
      hidden_reason: 'ancestor_hidden',
    });
    expect(formatInspectForModel(snapshot)).toContain('不可见（被祖先元素隐藏）');
  });
});
