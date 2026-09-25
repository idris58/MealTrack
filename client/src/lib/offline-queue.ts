/**
 * offline-queue.ts
 *
 * IndexedDB-backed queue for offline mutations.
 * Operations that fail (or are attempted) while the device is offline are
 * persisted here and replayed when connectivity is restored.
 *
 * Store name : mealtrack-offline-queue
 * Key path   : id  (string UUID)
 */

export type OfflineOpType =
  | 'ADD_EXPENSE'
  | 'UPDATE_EXPENSE'
  | 'DELETE_EXPENSE'
  | 'ADD_DEPOSIT'
  | 'ADD_MEAL_LOG';

export interface OfflineOp {
  id: string;           // temporary local UUID (e.g. "offline-<uuid>")
  type: OfflineOpType;
  payload: Record<string, unknown>;
  createdAt: number;    // Date.now()
  attempts?: number;
  status?: 'pending' | 'failed' | 'conflict';
  lastError?: string;
}

const DB_NAME = 'mealtrack-offline';
const STORE_NAME = 'sync-queue';
export const OFFLINE_DB_VERSION = 2;

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, OFFLINE_DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains('data-cache')) {
        db.createObjectStore('data-cache', { keyPath: 'key' });
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => {
      dbPromise = null;
      reject(req.error);
    };
  });

  return dbPromise;
}

/** Add an operation to the queue. */
export async function enqueue(op: OfflineOp): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(op);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Return all queued operations, oldest first. */
export async function dequeueAll(): Promise<OfflineOp[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAll();
    req.onsuccess = () =>
      resolve((req.result as OfflineOp[]).sort((a, b) => a.createdAt - b.createdAt));
    req.onerror = () => reject(req.error);
  });
}

/** Remove a single operation from the queue by its id. */
export async function removeFromQueue(id: string): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

/** Return the IDs of all currently-queued operations. */
export async function getPendingIds(): Promise<string[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).getAllKeys();
    req.onsuccess = () => resolve(req.result as string[]);
    req.onerror = () => reject(req.error);
  });
}

/** Persist retry/dead-letter metadata without removing the user's queued change. */
export async function updateQueuedOp(op: OfflineOp): Promise<void> {
  return enqueue(op);
}

/** Clear the entire queue (use carefully — only after a successful full sync). */
export async function clearQueue(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
