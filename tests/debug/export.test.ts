import { strFromU8, unzipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { buildTraceArchive } from '@/entrypoints/sidepanel/lib/debug-export';
import { beginRun, beginStep, createDebugTrace, finishStep } from '@/lib/debug/trace';
import type { ChatItem } from '@/lib/ipc/protocol';

describe('debug trace 导出包', () => {
  it('包含 trace.json、summary.md 和截图文件', () => {
    const trace = createDebugTrace();
    const run = beginRun(trace, {
      id: 'run-1',
      prompt: '检查截图',
      model: {
        presetId: 'custom',
        baseUrl: 'https://api.example.com/v1',
        modelId: 'vision-model',
        supportsImages: true,
      },
      toolset: ['screenshot'],
    });
    const step = beginStep(run, {
      tool: 'screenshot',
      toolCallId: 'shot-1',
      args: {},
    });
    finishStep(run, step, {
      result: {
        content: [
          { type: 'text', text: '已截图' },
          { type: 'image', data: 'aGVsbG8=', mimeType: 'image/png' },
        ],
        details: {},
      },
      isError: false,
      summary: '已截图',
    });

    const items: ChatItem[] = [
      {
        kind: 'tool',
        id: 't-1',
        toolCallId: 'shot-1',
        name: 'screenshot',
        status: 'ok',
        summary: '已截图',
        startedAt: 1,
        images: [{ data: 'aGVsbG8=', mimeType: 'image/png' }],
      },
    ];

    const archive = buildTraceArchive(trace, items);
    expect(archive.name).toMatch(/^pagehand-trace-.*\.zip$/);
    const files = unzipSync(archive.bytes);

    expect(files['trace.json']).toBeDefined();
    expect(files['summary.md']).toBeDefined();
    expect(files['screenshots/step-01-screenshot-1.png']).toBeDefined();
    expect(strFromU8(files['summary.md'] as Uint8Array)).toContain('检查截图');
    expect(strFromU8(files['trace.json'] as Uint8Array)).toContain('"version": 1');
  });

  it('没有截图时也能导出纯文本诊断包', () => {
    const trace = createDebugTrace();
    beginRun(trace, {
      id: 'run-2',
      prompt: '读页面',
      model: null,
      toolset: ['read_page'],
    });

    const files = unzipSync(buildTraceArchive(trace, []).bytes);
    expect(Object.keys(files).sort()).toEqual(['summary.md', 'trace.json']);
  });
});
