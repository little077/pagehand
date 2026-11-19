import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';
import { TraceSheet } from '@/entrypoints/sidepanel/components/TraceSheet';
import { beginRun, beginStep, createDebugTrace, finishStep } from '@/lib/debug/trace';
import type { DebugTrace } from '@/lib/ipc/protocol';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function traceFixture(): DebugTrace {
  const trace = createDebugTrace();
  const run = beginRun(trace, {
    id: 'run-ui',
    prompt: '列出前 5 条标题',
    model: {
      presetId: 'custom',
      baseUrl: 'https://api.example.com/v1',
      modelId: 'text-model',
      supportsImages: false,
    },
    toolset: ['inspect', 'read_page'],
  });
  const step = beginStep(run, { tool: 'inspect', toolCallId: 'inspect-1', args: {} });
  finishStep(run, step, {
    result: { content: [{ type: 'text', text: '找到 3 个可操作元素' }], details: { total: 3 } },
    isError: false,
    summary: '找到 3 个可操作元素',
  });
  return trace;
}

async function renderSheet(trace: DebugTrace | null, debugEnabled: boolean) {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(
      createElement(TraceSheet, {
        open: true,
        entries: [],
        debugTrace: trace,
        items: [],
        debugEnabled,
        onClose: () => undefined,
      }),
    );
  });
  return {
    container,
    cleanup: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('TraceSheet 开发者诊断', () => {
  it('debug 模式显示工具链和导出按钮', async () => {
    const rendered = await renderSheet(traceFixture(), true);
    try {
      expect(rendered.container.textContent).toContain('开发者诊断');
      expect(rendered.container.textContent).toContain('导出诊断包');
      expect(rendered.container.textContent).toContain('找到 3 个可操作元素');
    } finally {
      rendered.cleanup();
    }
  });

  it('非 debug 模式不显示诊断区', async () => {
    const rendered = await renderSheet(traceFixture(), false);
    try {
      expect(rendered.container.textContent).not.toContain('开发者诊断');
      expect(rendered.container.textContent).not.toContain('导出诊断包');
    } finally {
      rendered.cleanup();
    }
  });
});
