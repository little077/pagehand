import 'fake-indexeddb/auto';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { fakeBrowser } from 'wxt/testing/fake-browser';
import { beginRun, createDebugTrace } from '@/lib/debug/trace';
import type { SessionRecord } from '@/lib/sessions/record';

const IMAGE = 'aGVsbG8=';

let store: typeof import('@/lib/sessions/store');

beforeAll(async () => {
  store = await import('@/lib/sessions/store');
});

beforeEach(() => {
  fakeBrowser.reset();
});

function record(id: string): SessionRecord {
  return {
    id,
    createdAt: 1,
    updatedAt: 2,
    title: { custom: null, ai: null, fromPrompt: '测试会话' },
    model: null,
    items: [
      {
        kind: 'user',
        id: 'u-1',
        text: '看图',
        attachments: [
          {
            id: 'a-1',
            data: IMAGE,
            mimeType: 'image/jpeg',
            width: 10,
            height: 10,
            size: 5,
          },
        ],
      },
    ],
    messages: [
      {
        role: 'user',
        content: [{ type: 'image', data: IMAGE, mimeType: 'image/jpeg' }],
      },
    ],
  };
}

async function counts(): Promise<{ attachments: number; links: number }> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open('pagehand-sessions');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  const tx = db.transaction(['attachments', 'sessionAttachments'], 'readonly');
  const read = (name: string) =>
    new Promise<number>((resolve, reject) => {
      const request = tx.objectStore(name).count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  const result = {
    attachments: await read('attachments'),
    links: await read('sessionAttachments'),
  };
  db.close();
  return result;
}

describe('IndexedDB v3', () => {
  it('写入、列表、读取、删除都走 attachments + sessionMeta', async () => {
    const id = `session-${Date.now()}`;
    await store.writeSession(record(id));

    const summaries = await store.listSessions();
    expect(summaries.find((item) => item.id === id)).toMatchObject({
      title: '测试会话',
      messageCount: 1,
    });

    const loaded = await store.readSession(id);
    if (!loaded) throw new Error('session not loaded');
    const user = loaded.items[0];
    expect(user?.kind === 'user' ? user.attachments?.[0]?.data : null).toBe(IMAGE);
    const content = (loaded.messages[0] as { content: Array<Record<string, unknown>> }).content;
    expect(content[0]).toEqual({ type: 'image', data: IMAGE, mimeType: 'image/jpeg' });

    await store.removeSession(id);
    expect(await store.readSession(id)).toBeNull();
    expect((await store.listSessions()).some((item) => item.id === id)).toBe(false);
  });

  it('相同图片重复写入只保留一份附件', async () => {
    const id = `session-${Date.now()}-dedupe`;
    await store.writeSession(record(id));
    await store.writeSession(record(id));

    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open('pagehand-sessions');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    const count = await new Promise<number>((resolve, reject) => {
      const request = db.transaction('attachments', 'readonly').objectStore('attachments').count();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    db.close();
    expect(count).toBe(1);
    await store.removeSession(id);
  });

  it('同一张图可被多个会话引用，删除其中一条不影响另一条', async () => {
    const first = `session-${Date.now()}-first`;
    const second = `session-${Date.now()}-second`;
    await store.writeSession(record(first));
    await store.writeSession(record(second));

    expect(await counts()).toEqual({ attachments: 1, links: 2 });

    const firstUser = (await store.readSession(first))?.items[0];
    const secondUser = (await store.readSession(second))?.items[0];
    expect(firstUser?.kind === 'user' ? firstUser.attachments?.[0]?.data : null).toBe(IMAGE);
    expect(secondUser?.kind === 'user' ? secondUser.attachments?.[0]?.data : null).toBe(IMAGE);

    await store.removeSession(first);
    expect(await counts()).toEqual({ attachments: 1, links: 1 });
    const survivor = (await store.readSession(second))?.items[0];
    expect(survivor?.kind === 'user' ? survivor.attachments?.[0]?.data : null).toBe(IMAGE);

    await store.removeSession(second);
    expect(await counts()).toEqual({ attachments: 0, links: 0 });
  });

  it('运行诊断随会话落盘，重新读取后仍能导出', async () => {
    const id = `session-${Date.now()}-trace`;
    const debugTrace = createDebugTrace();
    beginRun(debugTrace, {
      id: 'run-1',
      prompt: '滚动评论区',
      model: null,
      toolset: ['inspect', 'interact'],
    });
    const stored = record(id);
    stored.trace = [{ id: 'tr-1', at: 1, kind: 'run', title: '收到任务', detail: '滚动评论区' }];
    stored.debugTrace = debugTrace;
    await store.writeSession(stored);

    const loaded = await store.readSession(id);
    expect(loaded?.trace).toEqual(stored.trace);
    expect(loaded?.debugTrace?.runs[0]?.prompt).toBe('滚动评论区');

    await store.removeSession(id);
  });
});
