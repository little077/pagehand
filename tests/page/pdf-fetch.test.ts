import { beforeEach, describe, expect, it, vi } from 'vitest';
import { handlePdfInfo } from '@/entrypoints/offscreen/pdf';
import { loadPdfJs } from '@/entrypoints/offscreen/pdfjs-loader';

vi.mock('@/entrypoints/offscreen/pdfjs-loader', () => ({
  loadPdfJs: vi.fn(),
}));

const getDocument = vi.fn();

beforeEach(() => {
  vi.resetAllMocks();
  vi.unstubAllGlobals();
  const doc = {
    numPages: 1,
    getMetadata: vi.fn().mockResolvedValue({ info: {} }),
    getOutline: vi.fn().mockResolvedValue(null),
  };
  getDocument.mockReturnValue({ promise: Promise.resolve(doc) });
  vi.mocked(loadPdfJs).mockResolvedValue({ getDocument } as never);
});

describe('PDF 下载授权边界', () => {
  it('禁止跨站跳转，并拒绝跳到其他网站的最终地址', async () => {
    const arrayBuffer = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      url: 'https://b.example/final.pdf',
      headers: new Headers({ 'Content-Type': 'application/pdf' }),
      arrayBuffer,
    });
    vi.stubGlobal('fetch', fetchMock);

    await expect(handlePdfInfo('https://a.example/guide.pdf')).rejects.toThrow('其他网站');

    expect(fetchMock).toHaveBeenCalledWith('https://a.example/guide.pdf', {
      credentials: 'include',
      redirect: 'follow',
    });
    expect(arrayBuffer).not.toHaveBeenCalled();
    expect(getDocument).not.toHaveBeenCalled();
  });

  it('网络失败给出可行动提示', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));

    await expect(handlePdfInfo('https://a.example/redirect.pdf')).rejects.toThrow(
      '网络不可达或地址无法访问',
    );
    expect(getDocument).not.toHaveBeenCalled();
  });

  it('同站重定向仍正常读取', async () => {
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);
    const response = new Response(bytes, {
      headers: { 'Content-Type': 'application/pdf' },
    });
    Object.defineProperty(response, 'url', { value: 'https://a.example/final.pdf' });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));

    await expect(handlePdfInfo('https://a.example/redirect-ok.pdf')).resolves.toMatchObject({
      pageCount: 1,
    });
  });

  it('同站直连 PDF 仍正常读取', async () => {
    const bytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]);
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(new Response(bytes, { headers: { 'Content-Type': 'application/pdf' } })),
    );

    await expect(handlePdfInfo('https://a.example/direct.pdf')).resolves.toMatchObject({
      pageCount: 1,
      outline: [],
    });
  });
});
