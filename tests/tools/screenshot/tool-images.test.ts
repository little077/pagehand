import { describe, expect, it } from 'vitest';
import { extractToolImages } from '@/lib/tools/tool-images';

describe('工具结果图片提取', () => {
  it('提取图片块，忽略文字块', () => {
    expect(
      extractToolImages({
        content: [
          { type: 'text', text: '截图完成' },
          { type: 'image', data: 'abc', mimeType: 'image/jpeg' },
        ],
      }),
    ).toEqual([{ data: 'abc', mimeType: 'image/jpeg' }]);
  });

  it('没有图片时返回 undefined', () => {
    expect(extractToolImages({ content: [{ type: 'text', text: 'hi' }] })).toBeUndefined();
    expect(extractToolImages(null)).toBeUndefined();
    expect(extractToolImages({ content: [{ type: 'image', data: 1 }] })).toBeUndefined();
  });

  it('最多保留两张图片，避免会话无限膨胀', () => {
    const images = extractToolImages({
      content: Array.from({ length: 3 }, (_, index) => ({
        type: 'image',
        data: `img-${index}`,
        mimeType: 'image/jpeg',
      })),
    });

    expect(images).toHaveLength(2);
  });
});
