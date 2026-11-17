import { describe, expect, it } from 'vitest';
import { articleToMarkdown, htmlToMarkdown } from '@/lib/page/markdown';

describe('htmlToMarkdown', () => {
  it('keeps headings, links and images with absolute URLs', () => {
    const html = `
      <h1>标题</h1>
      <p>正文 <a href="/more">延伸阅读</a></p>
      <img src="/cover.png" alt="封面" />
    `;
    const markdown = htmlToMarkdown(html, 'https://example.com/post');
    expect(markdown).toContain('# 标题');
    expect(markdown).toContain('[延伸阅读](https://example.com/more)');
    expect(markdown).toContain('![封面](https://example.com/cover.png)');
  });

  it('converts tables to GFM', () => {
    const html = `
      <table>
        <thead><tr><th>型号</th><th>价格</th></tr></thead>
        <tbody><tr><td>A</td><td>100</td></tr></tbody>
      </table>
    `;
    const markdown = htmlToMarkdown(html);
    expect(markdown).toContain('| 型号 | 价格 |');
    expect(markdown).toContain('| A | 100 |');
  });

  it('drops scripts and styles instead of leaking their text', () => {
    const markdown = htmlToMarkdown(
      '<style>.a{color:red}</style><script>alert(1)</script><p>正文</p>',
    );
    expect(markdown).toContain('正文');
    expect(markdown).not.toContain('alert');
    expect(markdown).not.toContain('color:red');
  });
});

describe('articleToMarkdown', () => {
  it('keeps the article body and removes navigation', () => {
    const html = `
      <html><body>
        <nav><a href="/home">首页</a><a href="/about">关于</a></nav>
        <article>
          <h1>一篇长文</h1>
          <p>${'这是正文段落。'.repeat(40)}</p>
        </article>
        <footer>版权信息</footer>
      </body></html>
    `;
    const markdown = articleToMarkdown(html, 'https://example.com/post');
    expect(markdown).toContain('# 一篇长文');
    expect(markdown).toContain('这是正文段落。');
    expect(markdown).not.toContain('版权信息');
  });

  it('returns null when there is no article to extract', () => {
    expect(articleToMarkdown('<html><body></body></html>', 'https://example.com')).toBeNull();
  });
});
