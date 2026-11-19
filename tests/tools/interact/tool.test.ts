import { describe, expect, it } from 'vitest';
import { interactTool } from '@/lib/tools/interact';

describe('interact 工具边界', () => {
  it('没有活动标签页时返回可行动错误', async () => {
    const result = await interactTool.execute('call-1', { action: 'click', ref: 'e1' }, undefined);

    expect(result.isError).toBe(true);
    expect(result.details).toMatchObject({ code: 'no_tab' });
  });

  it('有副作用，禁止 replay', () => {
    expect(interactTool.replay).toBe('never');
    expect(interactTool.name).toBe('interact');
  });

  it('工具描述写清了限制和不做的场景', () => {
    expect(interactTool.description).toContain('跨域 iframe');
    expect(interactTool.description).toContain('密码');
    expect(interactTool.description).toContain('高风险');
    expect(interactTool.description).toContain('不要连续重复点击');
  });
});
