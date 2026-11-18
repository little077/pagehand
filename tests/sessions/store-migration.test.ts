import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { attachmentIdFor } from '@/lib/sessions/attachments';
import { readSession, removeSession } from '@/lib/sessions/store';

const IMAGE = 'aGVsbG8=';

function openV2(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('pagehand-sessions', 2);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore('sessions', { keyPath: 'id' });
      const attachments = db.createObjectStore('attachments', { keyPath: 'id' });
      attachments.createIndex('sessionId', 'sessionId');
      db.createObjectStore('sessionMeta', { keyPath: 'id' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

describe('IndexedDB v2 → v3', () => {
  it('旧会话引用能补出关联表并正常读取', async () => {
    const attachmentId = await attachmentIdFor('image/jpeg', IMAGE);
    const sessionId = 'legacy-session';
    const db = await openV2();
    const tx = db.transaction(['sessions', 'attachments'], 'readwrite');
    tx.objectStore('sessions').put({
      id: sessionId,
      createdAt: 1,
      updatedAt: 2,
      title: { custom: null, ai: null, fromPrompt: '旧会话' },
      model: null,
      items: [
        {
          kind: 'user',
          id: 'u-1',
          text: '看图',
          attachments: [{ attachmentId, mimeType: 'image/jpeg', size: 5, width: 10, height: 10 }],
        },
      ],
      messages: [
        {
          role: 'user',
          content: [{ type: 'imageRef', attachmentId, mimeType: 'image/jpeg' }],
        },
      ],
    });
    tx.objectStore('attachments').put({
      id: attachmentId,
      sessionId,
      mimeType: 'image/jpeg',
      size: 5,
      data: IMAGE,
      createdAt: 1,
    });
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();

    const loaded = await readSession(sessionId);
    const user = loaded?.items[0];
    expect(user?.kind === 'user' ? user.attachments?.[0]?.data : null).toBe(IMAGE);

    await removeSession(sessionId);
    expect(await readSession(sessionId)).toBeNull();
  });
});
