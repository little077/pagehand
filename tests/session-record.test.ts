import { describe, expect, it } from 'vitest';
import type { ChatItem } from '@/lib/ipc/protocol';
import {
  applyAiTitle,
  createSessionTitle,
  displayTitle,
  formatRelativeTime,
  isSessionRecord,
  promptTitleOf,
  renameTitle,
  resolveTitle,
  resumeSequence,
  type SessionRecord,
  toSessionSummary,
} from '@/lib/sessions/record';

const DAY = 86_400_000;

function record(overrides: Partial<SessionRecord> = {}): SessionRecord {
  return {
    id: 'session-1',
    createdAt: 1_000,
    updatedAt: 2_000,
    title: createSessionTitle('帮我把这一页总结成五条要点'),
    model: {
      presetId: 'deepseek',
      baseUrl: 'https://api.deepseek.com/v1',
      modelId: 'deepseek-v4-flash',
    },
    items: [],
    messages: [],
    ...overrides,
  };
}

describe('promptTitleOf', () => {
  it('collapses whitespace and keeps at most 20 characters', () => {
    const title = promptTitleOf('  把这三篇\n\n评测的结论   对比一下  ');
    expect(title).toBe('把这三篇 评测的结论 对比一下');
    expect(Array.from(title).length).toBeLessThanOrEqual(20);
  });

  it('cuts long prompts at 20 code points without breaking emoji', () => {
    const title = promptTitleOf(`${'😀'.repeat(30)}abc`);
    expect(Array.from(title)).toHaveLength(20);
    expect(title).toBe('😀'.repeat(20));
  });

  it('returns empty for whitespace-only input', () => {
    expect(promptTitleOf('   \n  ')).toBe('');
  });
});

describe('title sources', () => {
  it('prefers the user rename over the AI title and the prompt title', () => {
    let title = createSessionTitle('帮我整理成表格导出数据');
    title = applyAiTitle(title, '表格导出方案');
    expect(resolveTitle(title)).toEqual({ text: '表格导出方案', source: 'ai' });

    title = renameTitle(title, '比价记录');
    expect(resolveTitle(title)).toEqual({ text: '比价记录', source: 'user' });

    // AI 之后再总结也不该盖掉用户手改的名字
    title = applyAiTitle(title, '新的总结');
    expect(resolveTitle(title).source).toBe('user');
  });

  it('falls back to the default title when the rename is cleared', () => {
    const title = renameTitle(renameTitle(createSessionTitle('默认标题内容'), '临时名字'), '   ');
    expect(title.custom).toBeNull();
    expect(resolveTitle(title)).toEqual({ text: '默认标题内容', source: 'prompt' });
  });

  it('labels an untitled session', () => {
    expect(displayTitle(createSessionTitle(''))).toBe('新会话');
  });
});

describe('session summaries', () => {
  it('counts UI items and keeps the resolved title', () => {
    const items: ChatItem[] = [
      { kind: 'user', id: 'u-1', text: '第一条' },
      { kind: 'assistant', id: 'a-2', text: '回答', status: 'done' },
    ];
    const summary = toSessionSummary(record({ items }));
    expect(summary.title).toBe('帮我把这一页总结成五条要点'.slice(0, 20));
    expect(summary.titleSource).toBe('prompt');
    expect(summary.messageCount).toBe(2);
    expect(summary.updatedAt).toBe(2_000);
  });

  it('shows 新会话 when nothing was typed', () => {
    const summary = toSessionSummary(record({ title: createSessionTitle('') }));
    expect(summary.title).toBe('新会话');
  });
});

describe('isSessionRecord', () => {
  it('accepts a well formed record', () => {
    expect(isSessionRecord(record())).toBe(true);
  });

  it('rejects broken records instead of crashing the list', () => {
    expect(isSessionRecord(undefined)).toBe(false);
    expect(isSessionRecord({ ...record(), id: '' })).toBe(false);
    expect(isSessionRecord({ ...record(), items: undefined })).toBe(false);
    expect(isSessionRecord({ ...record(), messages: 'nope' })).toBe(false);
    expect(isSessionRecord({ ...record(), title: { fromPrompt: 1 } })).toBe(false);
    expect(isSessionRecord({ ...record(), title: { custom: 3, ai: null, fromPrompt: '' } })).toBe(
      false,
    );
  });
});

describe('resumeSequence', () => {
  it('continues numbering after restored ids', () => {
    const items: ChatItem[] = [
      { kind: 'user', id: 'u-3', text: 'a' },
      { kind: 'assistant', id: 'a-11', text: 'b', status: 'done' },
      {
        kind: 'tool',
        id: 't-7',
        toolCallId: 'c',
        name: 'read_page',
        status: 'ok',
        summary: '',
        startedAt: 0,
      },
    ];
    expect(resumeSequence(items)).toBe(11);
    expect(resumeSequence([])).toBe(0);
  });
});

describe('formatRelativeTime', () => {
  const now = new Date('2026-11-09T12:00:00Z').getTime();

  it('switches granularity as a session ages', () => {
    expect(formatRelativeTime(now, now)).toBe('刚刚');
    expect(formatRelativeTime(now - 5 * 60_000, now)).toBe('5 分钟前');
    expect(formatRelativeTime(now - 3 * 3_600_000, now)).toBe('3 小时前');
    expect(formatRelativeTime(now - DAY * 2, now)).toBe('11月7日');
  });
});
