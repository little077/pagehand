import { browser } from 'wxt/browser';
import { dehydrateSession, hydrateSession, isStoredAttachment } from './attachments';
import {
  isSessionRecord,
  type SessionRecord,
  type SessionSummary,
  toSessionSummary,
} from './record';

const DB_NAME = 'pagehand-sessions';
const DB_VERSION = 3;
const SESSION_STORE = 'sessions';
const ATTACHMENT_STORE = 'attachments';
const META_STORE = 'sessionMeta';
const LINK_STORE = 'sessionAttachments';
const CURRENT_KEY = 'pagehand.sessions.current.v1';

interface AttachmentLink {
  key: string;
  sessionId: string;
  attachmentId: string;
}

function linkKey(sessionId: string, attachmentId: string): string {
  return `${sessionId}::${attachmentId}`;
}

function attachmentIdFromLinkKey(key: string): string | null {
  const index = key.indexOf('::');
  return index < 0 ? null : key.slice(index + 2);
}

function isAttachmentLink(value: unknown): value is AttachmentLink {
  if (!value || typeof value !== 'object') return false;
  const link = value as Record<string, unknown>;
  return (
    typeof link.key === 'string' &&
    typeof link.sessionId === 'string' &&
    typeof link.attachmentId === 'string'
  );
}

/** 递归找出会话记录里所有 attachmentId；升级到 v3 时用它补关联表。 */
function collectAttachmentIds(value: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) collectAttachmentIds(item, out);
    return out;
  }
  if (!value || typeof value !== 'object') return out;
  const record = value as Record<string, unknown>;
  if (typeof record.attachmentId === 'string') out.add(record.attachmentId);
  for (const item of Object.values(record)) collectAttachmentIds(item, out);
  return out;
}

/** 关联表删完后，只有没有任何会话再引用时才删附件本体。 */
function deleteIfUnused(
  attachments: IDBObjectStore,
  links: IDBObjectStore,
  attachmentId: string,
): void {
  const request = links.index('attachmentId').count(attachmentId);
  request.onsuccess = () => {
    if (request.result === 0) attachments.delete(attachmentId);
  };
}

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (event) => {
      const db = request.result;
      const tx = request.transaction;
      if (!db.objectStoreNames.contains(SESSION_STORE)) {
        db.createObjectStore(SESSION_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(ATTACHMENT_STORE)) {
        db.createObjectStore(ATTACHMENT_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(LINK_STORE)) {
        const links = db.createObjectStore(LINK_STORE, { keyPath: 'key' });
        links.createIndex('sessionId', 'sessionId');
        links.createIndex('attachmentId', 'attachmentId');
      }
      // v1 → v2：回填列表元数据；旧记录的图片仍是内联，读取时兼容。
      if (event.oldVersion < 2 && tx) {
        const sessions = tx.objectStore(SESSION_STORE);
        const meta = tx.objectStore(META_STORE);
        const cursorRequest = sessions.openCursor();
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          if (!cursor) return;
          const value = cursor.value;
          if (isSessionRecord(value)) meta.put(toSessionSummary(value));
          cursor.continue();
        };
      }
      // v2 → v3：附件不再只归一个 sessionId，按会话引用补一张关联表。
      if (event.oldVersion < 3 && tx) {
        const sessions = tx.objectStore(SESSION_STORE);
        const links = tx.objectStore(LINK_STORE);
        const cursorRequest = sessions.openCursor();
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          if (!cursor) return;
          const value = cursor.value;
          if (isSessionRecord(value)) {
            for (const attachmentId of collectAttachmentIds(value)) {
              links.put({
                key: linkKey(value.id, attachmentId),
                sessionId: value.id,
                attachmentId,
              } satisfies AttachmentLink);
            }
          }
          cursor.continue();
        };
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('无法打开会话数据库'));
  });
  return dbPromise;
}

function toPromise<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('会话读写失败'));
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('会话事务失败'));
    tx.onabort = () => reject(tx.error ?? new Error('会话事务已取消'));
  });
}

function isSessionSummary(value: unknown): value is SessionSummary {
  if (!value || typeof value !== 'object') return false;
  const summary = value as Record<string, unknown>;
  return (
    typeof summary.id === 'string' &&
    typeof summary.title === 'string' &&
    typeof summary.updatedAt === 'number' &&
    typeof summary.createdAt === 'number' &&
    typeof summary.messageCount === 'number'
  );
}

async function withStore<T>(
  storeName: string,
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  return toPromise(action(db.transaction(storeName, mode).objectStore(storeName)));
}

async function attachmentsOf(sessionId: string): Promise<unknown[]> {
  const db = await openDb();
  const links = (await toPromise(
    db
      .transaction(LINK_STORE, 'readonly')
      .objectStore(LINK_STORE)
      .index('sessionId')
      .getAll(sessionId),
  )) as unknown[];
  const ids = [...new Set(links.filter(isAttachmentLink).map((link) => link.attachmentId))];

  const attachments: unknown[] = [];
  for (const id of ids) {
    const value = await withStore<unknown>(ATTACHMENT_STORE, 'readonly', (store) => store.get(id));
    if (value !== undefined) attachments.push(value);
  }
  return attachments;
}

export async function writeSession(record: SessionRecord): Promise<void> {
  const { record: stored, attachments } = await dehydrateSession(record);
  const db = await openDb();
  const tx = db.transaction([SESSION_STORE, ATTACHMENT_STORE, META_STORE, LINK_STORE], 'readwrite');
  const sessions = tx.objectStore(SESSION_STORE);
  const attachmentStore = tx.objectStore(ATTACHMENT_STORE);
  const meta = tx.objectStore(META_STORE);
  const links = tx.objectStore(LINK_STORE);

  sessions.put(stored);
  meta.put(toSessionSummary(record));
  for (const attachment of attachments) attachmentStore.put(attachment);

  // 重建这条会话的引用；只有没有任何会话再引用的附件才删本体。
  const keep = new Set(attachments.map((attachment) => attachment.id));
  const oldLinksRequest = links.index('sessionId').getAllKeys(record.id);
  oldLinksRequest.onsuccess = () => {
    const removed = new Set<string>();
    for (const rawKey of oldLinksRequest.result) {
      links.delete(rawKey);
      const attachmentId = attachmentIdFromLinkKey(String(rawKey));
      if (attachmentId && !keep.has(attachmentId)) removed.add(attachmentId);
    }
    for (const attachmentId of keep) {
      links.put({
        key: linkKey(record.id, attachmentId),
        sessionId: record.id,
        attachmentId,
      } satisfies AttachmentLink);
    }
    for (const attachmentId of removed) {
      deleteIfUnused(attachmentStore, links, attachmentId);
    }
  };

  await txDone(tx);
}

export async function readSession(id: string): Promise<SessionRecord | null> {
  const stored = await withStore<unknown>(SESSION_STORE, 'readonly', (store) => store.get(id));
  if (stored === undefined) return null;
  const attachments = (await attachmentsOf(id)).filter(isStoredAttachment);
  return hydrateSession(stored, attachments);
}

/** 列表只读摘要，不再 getAll 整条会话记录。 */
export async function listSessions(): Promise<SessionSummary[]> {
  let summaries = (
    await withStore<unknown[]>(META_STORE, 'readonly', (store) => store.getAll())
  ).filter(isSessionSummary);

  // 兼容极端情况：元数据缺失时从会话记录回填一次。
  if (summaries.length === 0) {
    const sessions = await withStore<unknown[]>(SESSION_STORE, 'readonly', (store) =>
      store.getAll(),
    );
    summaries = sessions.filter(isSessionRecord).map(toSessionSummary);
    if (summaries.length > 0) {
      const db = await openDb();
      const repair = db.transaction(META_STORE, 'readwrite');
      const store = repair.objectStore(META_STORE);
      for (const summary of summaries) store.put(summary);
      await txDone(repair);
    }
  }

  return summaries.sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function removeSession(id: string): Promise<void> {
  const db = await openDb();
  const tx = db.transaction([SESSION_STORE, ATTACHMENT_STORE, META_STORE, LINK_STORE], 'readwrite');
  tx.objectStore(SESSION_STORE).delete(id);
  tx.objectStore(META_STORE).delete(id);

  const attachmentStore = tx.objectStore(ATTACHMENT_STORE);
  const links = tx.objectStore(LINK_STORE);
  const keysRequest = links.index('sessionId').getAllKeys(id);
  keysRequest.onsuccess = () => {
    const removed = new Set<string>();
    for (const rawKey of keysRequest.result) {
      links.delete(rawKey);
      const attachmentId = attachmentIdFromLinkKey(String(rawKey));
      if (attachmentId) removed.add(attachmentId);
    }
    for (const attachmentId of removed) {
      deleteIfUnused(attachmentStore, links, attachmentId);
    }
  };
  await txDone(tx);

  const current = await loadCurrentSessionId();
  if (current === id) await saveCurrentSessionId(null);
}

export async function loadCurrentSessionId(): Promise<string | null> {
  const stored = await browser.storage.local.get(CURRENT_KEY);
  const value = stored[CURRENT_KEY];
  return typeof value === 'string' && value ? value : null;
}

export async function saveCurrentSessionId(id: string | null): Promise<void> {
  if (id) {
    await browser.storage.local.set({ [CURRENT_KEY]: id });
    return;
  }
  await browser.storage.local.remove(CURRENT_KEY);
}
