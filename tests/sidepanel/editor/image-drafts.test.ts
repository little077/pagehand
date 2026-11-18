import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  MAX_ATTACHMENTS,
  MAX_IMAGE_BYTES,
  prepareImageFile,
  scaleToMaxEdge,
  selectImageFiles,
} from '@/entrypoints/sidepanel/editor/image-drafts';

function fileOf(type: string, bytes: number, name = 'image.png'): File {
  return new File([new Uint8Array(bytes)], name, { type });
}

describe('图片尺寸换算', () => {
  it('小图不放大', () => {
    expect(scaleToMaxEdge(800, 600, 1600)).toEqual({ width: 800, height: 600 });
  });

  it('按最长边等比缩小', () => {
    expect(scaleToMaxEdge(3200, 1600, 1600)).toEqual({ width: 1600, height: 800 });
    expect(scaleToMaxEdge(1000, 4000, 1600)).toEqual({ width: 400, height: 1600 });
  });
});

describe('图片文件筛选', () => {
  it('按剩余槽位截断，并提示数量', () => {
    const files = [fileOf('image/png', 10), fileOf('image/jpeg', 10), fileOf('image/webp', 10)];
    const result = selectImageFiles(MAX_ATTACHMENTS - 1, files);
    expect(result.accepted).toHaveLength(1);
    expect(result.error).toContain('最多还能添加 1 张图片');
  });

  it('已满时全部拒绝', () => {
    const result = selectImageFiles(MAX_ATTACHMENTS, [fileOf('image/png', 10)]);
    expect(result.accepted).toHaveLength(0);
    expect(result.error).toContain('最多 3 张图片');
  });

  it('拒绝非图片和 SVG', () => {
    const result = selectImageFiles(0, [
      fileOf('text/plain', 10),
      fileOf('image/svg+xml', 10, 'icon.svg'),
    ]);
    expect(result.accepted).toHaveLength(0);
    expect(result.error).toContain('只支持 PNG / JPEG / WebP / GIF');
  });

  it('原图超过 20 MB 直接拒绝', () => {
    const result = selectImageFiles(0, [fileOf('image/png', 21 * 1024 * 1024)]);
    expect(result.accepted).toHaveLength(0);
    expect(result.error).toContain('20 MB');
  });
});

describe('图片预处理', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('小图直接转 base64 并读取尺寸', async () => {
    const close = vi.fn();
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 120, height: 80, close })),
    );
    const file = new File([new Uint8Array([1, 2, 3])], 'shot.png', { type: 'image/png' });
    const prepared = await prepareImageFile(file);

    expect(prepared).toMatchObject({
      mimeType: 'image/png',
      width: 120,
      height: 80,
      size: 3,
      name: 'shot.png',
    });
    expect(prepared.data).toBe(btoa('\u0001\u0002\u0003'));
    expect(close).toHaveBeenCalled();
  });

  it('GIF 超过 2 MB 不重编码，直接报错', async () => {
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () => ({ width: 100, height: 100, close: vi.fn() })),
    );
    const file = fileOf('image/gif', MAX_IMAGE_BYTES + 1, 'anim.gif');
    await expect(prepareImageFile(file)).rejects.toThrow('GIF 图片不能超过 2 MB');
  });
});
