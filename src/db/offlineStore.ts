export interface QueuedMutation {
  dedupeKey: string;
  url: string;
  method: string;
  body?: unknown;
  createdAt: string;
  updatedAt: string;
}

const DB_NAME = 'workoutprogram-offline-v1';
const DB_VERSION = 1;
const CACHE_STORE = 'cache';
const QUEUE_STORE = 'mutations';
const LS_CACHE_PREFIX = 'workoutprogram:cache:';
const LS_QUEUE_KEY = 'workoutprogram:sync-queue';

let dbPromise: Promise<IDBDatabase> | null = null;

function canUseLocalStorage() {
  try {
    return typeof localStorage !== 'undefined';
  } catch {
    return false;
  }
}

function readLocalStorageQueue(): Record<string, QueuedMutation> {
  if (!canUseLocalStorage()) return {};
  try {
    return JSON.parse(localStorage.getItem(LS_QUEUE_KEY) || '{}');
  } catch {
    return {};
  }
}

function writeLocalStorageQueue(queue: Record<string, QueuedMutation>) {
  if (!canUseLocalStorage()) return;
  try {
    localStorage.setItem(LS_QUEUE_KEY, JSON.stringify(queue));
  } catch (error) {
    console.warn('localStorage queue write failed', error);
  }
}

function openDb(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB er ikke tilgængelig'));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(CACHE_STORE)) db.createObjectStore(CACHE_STORE, { keyPath: 'key' });
      if (!db.objectStoreNames.contains(QUEUE_STORE)) db.createObjectStore(QUEUE_STORE, { keyPath: 'dedupeKey' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Kunne ikke åbne lokal database'));
  });
  return dbPromise;
}

function completeTransaction(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error || new Error('Lokal databasefejl'));
    tx.onabort = () => reject(tx.error || new Error('Lokal databasehandling blev afbrudt'));
  });
}

export async function getLocalCache<T>(key: string): Promise<T | null> {
  try {
    const db = await openDb();
    const tx = db.transaction(CACHE_STORE, 'readonly');
    const request = tx.objectStore(CACHE_STORE).get(key);
    const result = await new Promise<any>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return (result?.value as T) ?? null;
  } catch (error) {
    // Safari/private modes can occasionally reject IndexedDB. Keep a small
    // localStorage fallback so a workout still survives a reload.
    if (canUseLocalStorage()) {
      try {
        const raw = localStorage.getItem(`${LS_CACHE_PREFIX}${key}`);
        return raw ? (JSON.parse(raw) as T) : null;
      } catch {}
    }
    console.warn('Local cache read failed', error);
    return null;
  }
}

export async function setLocalCache<T>(key: string, value: T): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(CACHE_STORE, 'readwrite');
    tx.objectStore(CACHE_STORE).put({ key, value, updatedAt: new Date().toISOString() });
    await completeTransaction(tx);
    return;
  } catch (error) {
    if (canUseLocalStorage()) {
      try {
        localStorage.setItem(`${LS_CACHE_PREFIX}${key}`, JSON.stringify(value));
        return;
      } catch {}
    }
    console.warn('Local cache write failed', error);
  }
}

export async function queueMutation(input: Omit<QueuedMutation, 'createdAt' | 'updatedAt'>): Promise<void> {
  const existing = await getQueuedMutation(input.dedupeKey);
  const now = new Date().toISOString();
  const mutation: QueuedMutation = {
    ...input,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };

  try {
    const db = await openDb();
    const tx = db.transaction(QUEUE_STORE, 'readwrite');
    tx.objectStore(QUEUE_STORE).put(mutation);
    await completeTransaction(tx);
  } catch (error) {
    const queue = readLocalStorageQueue();
    queue[input.dedupeKey] = mutation;
    writeLocalStorageQueue(queue);
    console.warn('IndexedDB queue unavailable; using localStorage fallback', error);
  }
}

export async function getQueuedMutation(dedupeKey: string): Promise<QueuedMutation | null> {
  try {
    const db = await openDb();
    const tx = db.transaction(QUEUE_STORE, 'readonly');
    const request = tx.objectStore(QUEUE_STORE).get(dedupeKey);
    const result = await new Promise<any>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    return (result as QueuedMutation) || null;
  } catch {
    return readLocalStorageQueue()[dedupeKey] || null;
  }
}

export async function listQueuedMutations(): Promise<QueuedMutation[]> {
  try {
    const db = await openDb();
    const tx = db.transaction(QUEUE_STORE, 'readonly');
    const request = tx.objectStore(QUEUE_STORE).getAll();
    const items = await new Promise<QueuedMutation[]>((resolve, reject) => {
      request.onsuccess = () => resolve((request.result || []) as QueuedMutation[]);
      request.onerror = () => reject(request.error);
    });
    return items.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  } catch {
    return Object.values(readLocalStorageQueue()).sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }
}

export async function removeQueuedMutation(dedupeKey: string): Promise<void> {
  try {
    const db = await openDb();
    const tx = db.transaction(QUEUE_STORE, 'readwrite');
    tx.objectStore(QUEUE_STORE).delete(dedupeKey);
    await completeTransaction(tx);
  } catch {
    const queue = readLocalStorageQueue();
    delete queue[dedupeKey];
    writeLocalStorageQueue(queue);
  }
}

export async function getQueuedMutationCount(): Promise<number> {
  try {
    const db = await openDb();
    const tx = db.transaction(QUEUE_STORE, 'readonly');
    const request = tx.objectStore(QUEUE_STORE).count();
    return await new Promise<number>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result || 0);
      request.onerror = () => reject(request.error);
    });
  } catch {
    return Object.keys(readLocalStorageQueue()).length;
  }
}
