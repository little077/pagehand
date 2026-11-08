import { browser } from 'wxt/browser';
import {
  isSessionRecord,
  type SessionRecord,
  type SessionSummary,
  toSessionSummary,
} from './record';

const DB_NAME = 'pagehand-sessions';
const DB_VERSION = 1;
const SESSION_STORE = 'sessions';
const CURRENT_KEY = 'pagehand.sessions.current.v1';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(SESSION_STORE)) {
        db.createObjectStore(SESSION_STORE, { keyPath: 'id' });
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

async function withStore<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await openDb();
  return toPromise(action(db.transaction(SESSION_STORE, mode).objectStore(SESSION_STORE)));
}

export async function writeSession(record: SessionRecord): Promise<void> {
  await withStore('readwrite', (store) => store.put(record));
}

export async function readSession(id: string): Promise<SessionRecord | null> {
  const value = await withStore<unknown>('readonly', (store) => store.get(id));
  return isSessionRecord(value) ? value : null;
}

/** 列表只回摘要，正文留在 IndexedDB，避免一条 Port 消息塞进整个历史。 */
export async function listSessions(): Promise<SessionSummary[]> {
  const values = await withStore<unknown[]>('readonly', (store) => store.getAll());
  return values
    .filter(isSessionRecord)
    .map(toSessionSummary)
    .sort((a, b) => b.updatedAt - a.updatedAt);
}

export async function removeSession(id: string): Promise<void> {
  await withStore('readwrite', (store) => store.delete(id));
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
