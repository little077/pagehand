import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Header } from '@/entrypoints/sidepanel/components/Header';
import { Home } from '@/entrypoints/sidepanel/components/Home';

describe('产品能力文案', () => {
  it('首页说明会代操作，但保留高风险动作边界', () => {
    const html = renderToStaticMarkup(
      createElement(Home, {
        configured: true,
        onPick: () => {},
        onOpenSettings: () => {},
      }),
    );

    expect(html).toContain('在你授权后代你点击、填写');
    expect(html).toContain('不会自动发送消息、付款、删除或提交表单');
    expect(html).toContain('代操作和后台读取会先征求授权');
    expect(html).not.toContain('第一版只有读取能力');
    expect(html).not.toContain('它不会点击、填写或提交');
  });

  it('连接状态不再标成只读模式', () => {
    const html = renderToStaticMarkup(
      createElement(Header, {
        connection: 'ready',
        hasThread: false,
        onNewThread: () => {},
        onOpenTrace: () => {},
        onOpenSessions: () => {},
        onOpenSettings: () => {},
      }),
    );

    expect(html).toContain('已连接');
    expect(html).not.toContain('只读模式');
  });
});
