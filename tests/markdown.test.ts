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

  it('strips inline base64 images so they do not eat the output budget', () => {
    const markdown = htmlToMarkdown(
      '<p>前</p><img src="data:image/png;base64,iVBORw0KGgo=" alt="封面" /><p>后</p>',
      'https://example.com/post',
    );
    expect(markdown).toContain('前');
    expect(markdown).toContain('后');
    expect(markdown).toContain('图片：封面');
    expect(markdown).not.toContain('data:image');
    expect(markdown).not.toContain('base64');
  });

  it('同一路径优先使用带查询参数的完整链接', () => {
    const markdown = htmlToMarkdown(
      '<a href="/explore/abc">封面</a><a href="/explore/abc?xsec_token=token&xsec_source=pc_search">标题</a>',
      'https://www.example.com/search',
    );
    expect(markdown).toContain('xsec_token=token');
    expect(markdown).not.toContain('https://www.example.com/explore/abc)');
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
