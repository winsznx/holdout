const DB_NAME = 'holdout-desk';
const STORE = 'kv';

const memory = new Map<string, unknown>();
let dbPromise: Promise<IDBDatabase | null> | null = null;
let lastFailure: string | null = null;

export function persistenceFailure(): string | null {
  return lastFailure;
}

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase | null>((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') {
        lastFailure = 'IndexedDB is not available in this browser, so data stays in memory for this tab.';
        resolve(null);
        return;
      }
      const request = indexedDB.open(DB_NAME, 1);
      request.onupgradeneeded = () => {
        request.result.createObjectStore(STORE);
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        lastFailure = `IndexedDB refused to open (${request.error?.message ?? 'unknown reason'}), so data stays in memory for this tab.`;
        resolve(null);
      };
      request.onblocked = () => {
        lastFailure = 'IndexedDB is blocked by another tab, so data stays in memory for this tab.';
        resolve(null);
      };
    } catch (e) {
      lastFailure = `IndexedDB threw (${e instanceof Error ? e.message : 'unknown'}), so data stays in memory for this tab.`;
      resolve(null);
    }
  });
  return dbPromise;
}

function runRequest<T>(db: IDBDatabase, mode: IDBTransactionMode, make: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = make(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });
}

export async function kvGet<T>(key: string): Promise<T | undefined> {
  const db = await openDb();
  if (db) {
    try {
      const value = await runRequest<T | undefined>(db, 'readonly', (s) => s.get(key) as IDBRequest<T | undefined>);
      if (value !== undefined) return value;
    } catch (e) {
      lastFailure = `IndexedDB read failed (${e instanceof Error ? e.message : 'unknown'}), using memory.`;
    }
  }
  return memory.get(key) as T | undefined;
}

export async function kvSet(key: string, value: unknown): Promise<void> {
  memory.set(key, value);
  const db = await openDb();
  if (!db) return;
  try {
    await runRequest(db, 'readwrite', (s) => s.put(value, key));
  } catch (e) {
    lastFailure = `IndexedDB write failed (${e instanceof Error ? e.message : 'unknown'}), data stays in memory for this tab.`;
  }
}

export async function kvDelete(key: string): Promise<void> {
  memory.delete(key);
  const db = await openDb();
  if (!db) return;
  try {
    await runRequest(db, 'readwrite', (s) => s.delete(key));
  } catch (e) {
    lastFailure = `IndexedDB delete failed (${e instanceof Error ? e.message : 'unknown'}).`;
  }
}

export async function kvClearAll(): Promise<void> {
  memory.clear();
  const db = await openDb();
  if (!db) return;
  try {
    await runRequest(db, 'readwrite', (s) => s.clear());
  } catch (e) {
    lastFailure = `IndexedDB clear failed (${e instanceof Error ? e.message : 'unknown'}).`;
  }
}

export function randomDeviceId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return `dev_${Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')}`;
}
