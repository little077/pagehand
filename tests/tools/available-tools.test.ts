import { describe, expect, it } from 'vitest';
import { availableTools } from '@/lib/tools';

describe('工具能力门控', () => {
  it('纯文本模型看不到 screenshot', () => {
    const names = availableTools(false).map((tool) => tool.name);

    expect(names).not.toContain('screenshot');
    expect(names).toContain('inspect');
    expect(names).toContain('interact');
    expect(names).toContain('read_page');
  });

  it('视觉模型能看到 screenshot', () => {
    expect(availableTools(true).map((tool) => tool.name)).toContain('screenshot');
  });
});
