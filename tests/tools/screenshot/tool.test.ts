import { afterEach, describe, expect, it } from 'vitest';
import { setImageSupport } from '@/lib/tools/runtime';
import { screenshotTool } from '@/lib/tools/screenshot';

afterEach(() => setImageSupport(false));

describe('screenshot 模型能力门禁', () => {
  it('模型未开启图片能力时直接返回可行动的错误，不截空图', async () => {
    setImageSupport(false);

    const result = await screenshotTool.execute('call-1', {}, undefined);

    expect(result.isError).toBe(true);
    expect(result.content[0]).toMatchObject({ type: 'text' });
    expect(result.details).toMatchObject({ code: 'images_unsupported' });
  });
});
