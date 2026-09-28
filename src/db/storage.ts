import { Exercise, WorkoutPlan, ExerciseLogEntry, CompletedSession, WorkoutDraft } from '../types';
import { INITIAL_EXERCISES, INITIAL_PLANS, INITIAL_LOGS } from './defaultData';
import {
  getLocalCache,
  setLocalCache,
  queueMutation,
  listQueuedMutations,
  removeQueuedMutation,
  getQueuedMutationCount,
} from './offlineStore';

export interface SyncStatus {
  online: boolean;
  syncing: boolean;
  pending: number;
  lastSyncedAt?: string;
  lastError?: string;
}

type DatabaseState = {
  exercises: Exercise[];
  plans: WorkoutPlan[];
  logs: ExerciseLogEntry[];
  sessions: CompletedSession[];
};

const CACHE_KEYS = {
  exercises: 'exercises',
  plans: 'plans',
  logs: 'logs',
  sessions: 'sessions',
  drafts: 'drafts',
} as const;

let syncStatus: SyncStatus = {
  online: typeof navigator === 'undefined' ? true : navigator.onLine,
  syncing: false,
  pending: 0,
};
const statusListeners = new Set<(status: SyncStatus) => void>();
let flushTimer: number | null = null;
let initializedBrowserListeners = false;

function notifyStatus(patch?: Partial<SyncStatus>) {
  if (patch) syncStatus = { ...syncStatus, ...patch };
  statusListeners.forEach((listener) => listener({ ...syncStatus }));
}

async function refreshPendingStatus() {
  const pending = await getQueuedMutationCount();
  notifyStatus({ pending, online: typeof navigator === 'undefined' ? true : navigator.onLine });
}

async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  // Keep retries deliberately low. Training data is stored locally first, so hammering
  // a struggling Worker only makes Cloudflare CPU-limit problems worse.
  const retryableStatuses = new Set([502, 503, 504]);
  const maxAttempts = 2;
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, init);
    } catch {
      lastError = new Error('Kan ikke kontakte serveren. Ændringen er gemt lokalt og synkroniseres senere.');
      if (attempt < maxAttempts) {
        await new Promise((resolve) => setTimeout(resolve, 250));
        continue;
      }
      throw lastError;
    }

    if (res.ok) return res.json() as Promise<T>;

    const body = await res.json().catch(() => ({ error: `Serverfejl (${res.status})` }));
    lastError = new Error(body.error || `Serverfejl (${res.status})`);

    if (retryableStatuses.has(res.status) && attempt < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 350));
      continue;
    }

    throw lastError;
  }

  throw lastError || new Error('Ukendt serverfejl');
}

async function cacheDatabaseState(state: DatabaseState) {
  await Promise.all([
    setLocalCache(CACHE_KEYS.exercises, state.exercises || []),
    setLocalCache(CACHE_KEYS.plans, state.plans || []),
    setLocalCache(CACHE_KEYS.logs, state.logs || []),
    setLocalCache(CACHE_KEYS.sessions, state.sessions || []),
  ]);
}

async function getCachedState(): Promise<DatabaseState> {
  const [exercises, plans, logs, sessions] = await Promise.all([
    getLocalCache<Exercise[]>(CACHE_KEYS.exercises),
    getLocalCache<WorkoutPlan[]>(CACHE_KEYS.plans),
    getLocalCache<ExerciseLogEntry[]>(CACHE_KEYS.logs),
    getLocalCache<CompletedSession[]>(CACHE_KEYS.sessions),
  ]);
  return {
    exercises: exercises || INITIAL_EXERCISES,
    plans: plans || INITIAL_PLANS,
    logs: logs || INITIAL_LOGS,
    sessions: sessions || [],
  };
}

async function upsertCacheItem<T extends { id: string }>(key: string, item: T, prepend = false) {
  const existing = (await getLocalCache<T[]>(key)) || [];
  const next = existing.filter((entry) => entry.id !== item.id);
  if (prepend) next.unshift(item);
  else next.push(item);
  await setLocalCache(key, next);
}

async function deleteCacheItem<T extends { id: string }>(key: string, id: string) {
  const existing = (await getLocalCache<T[]>(key)) || [];
  await setLocalCache(key, existing.filter((entry) => entry.id !== id));
}

async function enqueueRequest(
  dedupeKey: string,
  url: string,
  method: string,
  body?: unknown,
  flushDelayMs = 2500,
) {
  await queueMutation({ dedupeKey, url, method, body });
  await refreshPendingStatus();
  scheduleFlush(flushDelayMs);
}

function scheduleFlush(delayMs = 2500) {
  if (typeof window === 'undefined') return;
  // Do not continually push the timer out while a workout timer is ticking.
  // The first local change schedules a sync; later local saves simply replace the
  // pending payload with the newest version until that sync happens.
  if (flushTimer !== null) return;
  flushTimer = window.setTimeout(async () => {
    flushTimer = null;
    await StorageService.flushPendingChanges();
  }, delayMs);
}

async function fetchRemoteState(): Promise<DatabaseState> {
  const state = await apiJson<DatabaseState>('/api/db-state');
  await cacheDatabaseState(state);
  notifyStatus({ lastSyncedAt: new Date().toISOString(), lastError: undefined, online: true });
  return state;
}

function installBrowserListeners() {
  if (initializedBrowserListeners || typeof window === 'undefined') return;
  initializedBrowserListeners = true;
  window.addEventListener('online', () => {
    notifyStatus({ online: true });
    StorageService.flushPendingChanges().catch(() => {});
  });
  window.addEventListener('offline', () => {
    notifyStatus({ online: false });
  });
  // Best effort only. IndexedDB already contains the latest workout state, so if
  // this request cannot finish nothing is lost.
  window.addEventListener('pagehide', () => {
    if (navigator.onLine) StorageService.flushPendingChanges().catch(() => {});
  });
}

export const StorageService = {
  subscribeSyncStatus(listener: (status: SyncStatus) => void): () => void {
    statusListeners.add(listener);
    listener({ ...syncStatus });
    refreshPendingStatus().catch(() => {});
    installBrowserListeners();
    return () => statusListeners.delete(listener);
  },

  getSyncStatus(): SyncStatus {
    return { ...syncStatus };
  },

  async init(): Promise<void> {
    installBrowserListeners();
    await refreshPendingStatus();
    // Ask the browser to keep IndexedDB data persistently when supported.
    // Browsers may decline; workout data still remains available under normal storage rules.
    try {
      await navigator.storage?.persist?.();
    } catch {}

    // If the Worker is unavailable, the UI can still start from IndexedDB/defaults.
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      notifyStatus({ online: false });
      return;
    }

    try {
      const state = await fetchRemoteState();

      // Seed a brand-new shared database once with starter content.
      if ((!state.exercises || state.exercises.length === 0) && (!state.plans || state.plans.length === 0)) {
        await apiJson('/api/sync', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            exercises: INITIAL_EXERCISES,
            plans: INITIAL_PLANS,
            logs: INITIAL_LOGS,
            sessions: [],
          }),
        });
      }

      // Migrations are server-only, but they do not need to run on every app open.
      // Remember successful migration checks per device to reduce Worker CPU usage.
      const rehabMigrationDone = await getLocalCache<boolean>('meta:migration-rehab-2026');
      if (!rehabMigrationDone) {
        await apiJson('/api/migrations/rehab-2026', { method: 'POST' });
        await setLocalCache('meta:migration-rehab-2026', true);
      }
      const cleanupMigrationDone = await getLocalCache<boolean>('meta:migration-cleanup-orphan-logs');
      if (!cleanupMigrationDone) {
        await apiJson('/api/migrations/cleanup-orphan-logs', { method: 'POST' });
        await setLocalCache('meta:migration-cleanup-orphan-logs', true);
      }
      await this.flushPendingChanges();
    } catch (error: any) {
      notifyStatus({
        online: typeof navigator === 'undefined' ? true : navigator.onLine,
        lastError: error?.message || 'Serveren kunne ikke kontaktes',
      });
      console.warn('Starter fra lokal cache; server init fejlede', error);
    }
  },

  async getDatabaseState(options?: { remoteFirst?: boolean }): Promise<DatabaseState> {
    const remoteFirst = options?.remoteFirst !== false;
    if (remoteFirst && (typeof navigator === 'undefined' || navigator.onLine)) {
      try {
        const flushResult = await this.flushPendingChanges();
        // If pending local changes could not reach the server, do not replace the local
        // cache with an older server snapshot. The local version is authoritative until
        // synchronization succeeds.
        if (flushResult.pending > 0) return getCachedState();
        return await fetchRemoteState();
      } catch (error: any) {
        notifyStatus({ lastError: error?.message, online: typeof navigator === 'undefined' ? true : navigator.onLine });
      }
    }
    return getCachedState();
  },

  async flushPendingChanges(): Promise<{ synced: number; pending: number }> {
    if (syncStatus.syncing) return { synced: 0, pending: syncStatus.pending };
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      await refreshPendingStatus();
      notifyStatus({ online: false });
      return { synced: 0, pending: syncStatus.pending };
    }

    const queue = await listQueuedMutations();
    if (!queue.length) {
      notifyStatus({ pending: 0, online: true });
      return { synced: 0, pending: 0 };
    }

    notifyStatus({ syncing: true, online: true, lastError: undefined });
    let synced = 0;
    try {
      for (const mutation of queue) {
        const res = await fetch(mutation.url, {
          method: mutation.method,
          headers: mutation.body === undefined ? undefined : { 'Content-Type': 'application/json' },
          body: mutation.body === undefined ? undefined : JSON.stringify(mutation.body),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({ error: `Serverfejl (${res.status})` }));
          throw new Error(body.error || `Serverfejl (${res.status})`);
        }
        await removeQueuedMutation(mutation.dedupeKey);
        synced++;
      }
      const pending = await getQueuedMutationCount();
      notifyStatus({
        syncing: false,
        pending,
        lastSyncedAt: new Date().toISOString(),
        lastError: undefined,
        online: true,
      });
      return { synced, pending };
    } catch (error: any) {
      const pending = await getQueuedMutationCount();
      notifyStatus({
        syncing: false,
        pending,
        lastError: error?.message || 'Kunne ikke synkronisere',
        online: typeof navigator === 'undefined' ? true : navigator.onLine,
      });
      return { synced, pending };
    }
  },

  async getExercises(): Promise<Exercise[]> {
    return (await this.getDatabaseState()).exercises;
  },

  async saveExercise(exercise: Exercise): Promise<{ success: boolean; mode: 'mongodb' | 'local'; exercise: Exercise }> {
    await upsertCacheItem(CACHE_KEYS.exercises, exercise, true);
    await enqueueRequest(`exercise:${exercise.id}`, '/api/exercises', 'POST', exercise);
    return { success: true, mode: syncStatus.pending > 0 ? 'local' : 'mongodb', exercise };
  },

  async deleteExercise(id: string): Promise<void> {
    await deleteCacheItem<Exercise>(CACHE_KEYS.exercises, id);
    await enqueueRequest(`exercise:${id}`, `/api/exercises/${encodeURIComponent(id)}`, 'DELETE');
  },

  async getPlans(): Promise<WorkoutPlan[]> {
    return (await this.getDatabaseState()).plans;
  },

  async savePlan(plan: WorkoutPlan): Promise<void> {
    await upsertCacheItem(CACHE_KEYS.plans, plan);
    await enqueueRequest(`plan:${plan.id}`, '/api/plans', 'POST', plan);
  },

  async deletePlan(id: string): Promise<void> {
    await deleteCacheItem<WorkoutPlan>(CACHE_KEYS.plans, id);
    await enqueueRequest(`plan:${id}`, `/api/plans/${encodeURIComponent(id)}`, 'DELETE');
  },

  async getLogs(): Promise<ExerciseLogEntry[]> {
    return (await this.getDatabaseState()).logs;
  },

  async addLogEntry(entry: ExerciseLogEntry): Promise<void> {
    await upsertCacheItem(CACHE_KEYS.logs, entry, true);
    await enqueueRequest(`log:${entry.id}`, '/api/logs', 'POST', entry);
  },

  async addCompletedSession(session: CompletedSession): Promise<void> {
    await upsertCacheItem(CACHE_KEYS.sessions, session, true);
    const cachedLogs = (await getLocalCache<ExerciseLogEntry[]>(CACHE_KEYS.logs)) || [];
    const entryIds = new Set(session.entries.map((entry) => entry.id));
    await setLocalCache(CACHE_KEYS.logs, [...session.entries, ...cachedLogs.filter((entry) => !entryIds.has(entry.id))]);
    await enqueueRequest(`session:${session.id}`, '/api/sessions', 'POST', session, 1000);
  },

  async getCompletedSessions(): Promise<CompletedSession[]> {
    return (await this.getDatabaseState()).sessions;
  },

  async updateCompletedSession(session: CompletedSession): Promise<void> {
    await upsertCacheItem(CACHE_KEYS.sessions, session, true);
    const cachedLogs = (await getLocalCache<ExerciseLogEntry[]>(CACHE_KEYS.logs)) || [];
    const entryIds = new Set(session.entries.map((entry) => entry.id));
    await setLocalCache(CACHE_KEYS.logs, [...session.entries, ...cachedLogs.filter((entry) => !entryIds.has(entry.id))]);
    await enqueueRequest(`session:${session.id}`, `/api/sessions/${encodeURIComponent(session.id)}`, 'PUT', session);
  },

  async deleteCompletedSession(id: string): Promise<void> {
    const sessions = (await getLocalCache<CompletedSession[]>(CACHE_KEYS.sessions)) || [];
    const removed = sessions.find((session) => session.id === id);
    await setLocalCache(CACHE_KEYS.sessions, sessions.filter((session) => session.id !== id));
    if (removed) {
      const ids = new Set(removed.entries.map((entry) => entry.id));
      const logs = (await getLocalCache<ExerciseLogEntry[]>(CACHE_KEYS.logs)) || [];
      await setLocalCache(CACHE_KEYS.logs, logs.filter((entry) => !ids.has(entry.id)));
    }
    await enqueueRequest(`session:${id}`, `/api/sessions/${encodeURIComponent(id)}`, 'DELETE');
  },

  async getWorkoutDrafts(): Promise<WorkoutDraft[]> {
    const localDrafts = (await getLocalCache<WorkoutDraft[]>(CACHE_KEYS.drafts)) || [];
    if (typeof navigator !== 'undefined' && !navigator.onLine) return localDrafts;

    try {
      const data = await apiJson<{ drafts: WorkoutDraft[] }>('/api/drafts');
      const remote = data.drafts || [];
      // Pending local drafts win over an older remote copy until their queued write is flushed.
      const pendingKeys = new Set((await listQueuedMutations()).filter((m) => m.dedupeKey.startsWith('draft:')).map((m) => m.dedupeKey.slice(6)));
      const merged = [
        ...localDrafts.filter((d) => pendingKeys.has(d.id)),
        ...remote.filter((d) => !pendingKeys.has(d.id)),
      ].sort((a, b) => (b.lastUpdated || '').localeCompare(a.lastUpdated || ''));
      await setLocalCache(CACHE_KEYS.drafts, merged);
      return merged;
    } catch {
      return localDrafts;
    }
  },

  async getWorkoutDraftForPlan(planId: string, planTitle?: string): Promise<WorkoutDraft | null> {
    const drafts = await this.getWorkoutDrafts();
    const normalizedTitle = (planTitle || '').trim().toLocaleLowerCase('da-DK');
    return drafts.find((draft) =>
      draft.planId === planId ||
      draft.planIdAliases?.includes(planId) ||
      (!!normalizedTitle && draft.planTitle?.trim().toLocaleLowerCase('da-DK') === normalizedTitle)
    ) || null;
  },

  async saveWorkoutDraft(draft: WorkoutDraft): Promise<WorkoutDraft> {
    const drafts = (await getLocalCache<WorkoutDraft[]>(CACHE_KEYS.drafts)) || [];
    const next = [draft, ...drafts.filter((item) => item.id !== draft.id)];
    await setLocalCache(CACHE_KEYS.drafts, next);
    // Draft writes are deliberately coalesced and sent less frequently. IndexedDB is
    // the immediate safety copy; MongoDB catches up in the background.
    await enqueueRequest(`draft:${draft.id}`, '/api/drafts', 'POST', { draft }, 30000);
    return draft;
  },

  async deleteWorkoutDraft(draftId: string): Promise<void> {
    const drafts = (await getLocalCache<WorkoutDraft[]>(CACHE_KEYS.drafts)) || [];
    await setLocalCache(CACHE_KEYS.drafts, drafts.filter((draft) => draft.id !== draftId));
    await enqueueRequest(`draft:${draftId}`, `/api/drafts/${encodeURIComponent(draftId)}`, 'DELETE', undefined, 1000);
  },

  async getActiveWorkoutDraft(): Promise<WorkoutDraft | null> {
    const drafts = await this.getWorkoutDrafts();
    return drafts[0] || null;
  },

  async saveActiveWorkoutDraft(draft: WorkoutDraft): Promise<void> {
    await this.saveWorkoutDraft(draft);
  },

  async clearActiveWorkoutDraft(draftId?: string): Promise<void> {
    if (draftId) return this.deleteWorkoutDraft(draftId);
    const drafts = (await getLocalCache<WorkoutDraft[]>(CACHE_KEYS.drafts)) || [];
    await setLocalCache(CACHE_KEYS.drafts, []);
    for (const draft of drafts) {
      await enqueueRequest(`draft:${draft.id}`, `/api/drafts/${encodeURIComponent(draft.id)}`, 'DELETE');
    }
  },

  // Image/PDF uploads stay online-only on purpose. They are occasional heavy operations;
  // normal workout registration never depends on them.
  async uploadImage(imageBase64: string, filename?: string): Promise<string> {
    const json = await apiJson<{ url: string }>('/api/upload-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64, filename }),
    });
    if (!json.url) throw new Error('Serveren returnerede ingen billedadresse.');
    return json.url;
  },

  async uploadImagesBatch(images: Array<{ key: string; imageBase64: string; filename?: string }>): Promise<Record<string, string>> {
    if (!images.length) return {};
    const json = await apiJson<{ images: Array<{ key: string; url: string }> }>('/api/upload-images-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ images }),
    });
    return Object.fromEntries((json.images || []).map((item) => [item.key, item.url]));
  },

  async resetToDefaults(): Promise<void> {
    await cacheDatabaseState({
      exercises: INITIAL_EXERCISES,
      plans: INITIAL_PLANS,
      logs: INITIAL_LOGS,
      sessions: [],
    });
    await enqueueRequest('reset:defaults', '/api/reset', 'POST', {
      exercises: INITIAL_EXERCISES,
      plans: INITIAL_PLANS,
      logs: INITIAL_LOGS,
    }, 1000);
  },
};
