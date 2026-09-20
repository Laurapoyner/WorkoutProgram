import { Exercise, WorkoutPlan, ExerciseLogEntry, CompletedSession, WorkoutDraft } from '../types';
import { INITIAL_EXERCISES, INITIAL_PLANS, INITIAL_LOGS } from './defaultData';

const DB_NAME = 'TraeningSystemDB';
const DB_VERSION = 1;

const STORES = {
  EXERCISES: 'exercises',
  PLANS: 'plans',
  LOGS: 'logs',
  SESSIONS: 'sessions',
};

// IndexedDB Helper
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in window)) {
      reject(new Error('IndexedDB ikke understøttet i denne browser'));
      return;
    }

    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORES.EXERCISES)) {
        db.createObjectStore(STORES.EXERCISES, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.PLANS)) {
        db.createObjectStore(STORES.PLANS, { keyPath: 'id' });
      }
      if (!db.objectStoreNames.contains(STORES.LOGS)) {
        const logStore = db.createObjectStore(STORES.LOGS, { keyPath: 'id' });
        logStore.createIndex('exerciseId', 'exerciseId', { unique: false });
        logStore.createIndex('date', 'date', { unique: false });
      }
      if (!db.objectStoreNames.contains(STORES.SESSIONS)) {
        db.createObjectStore(STORES.SESSIONS, { keyPath: 'id' });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function getLocalFallback<T>(key: string, defaultVal: T): T {
  try {
    const item = localStorage.getItem(`traening_${key}`);
    return item ? JSON.parse(item) : defaultVal;
  } catch {
    return defaultVal;
  }
}

function setLocalFallback<T>(key: string, val: T): void {
  try {
    localStorage.setItem(`traening_${key}`, JSON.stringify(val));
  } catch (e) {
    console.warn('localStorage quota reached or unavailable', e);
  }
}

export const StorageService = {
  async init(): Promise<void> {
    try {
      // 1. Try to fetch state from backend server
      const res = await fetch('/api/db-state');
      if (res.ok) {
        const data = await res.json();
        // If server DB is completely empty, seed it with the default exercises and plans
        if (!data.exercises || data.exercises.length === 0) {
          await fetch('/api/sync', {
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
      }
    } catch (e) {
      console.log('Server sync skipped, using local cache', e);
    }

    // 2. Also initialize local IndexedDB
    try {
      const db = await openDatabase();
      const tx = db.transaction([STORES.EXERCISES, STORES.PLANS, STORES.LOGS], 'readwrite');
      const exStore = tx.objectStore(STORES.EXERCISES);
      const planStore = tx.objectStore(STORES.PLANS);
      const logStore = tx.objectStore(STORES.LOGS);

      const countReq = exStore.count();
      countReq.onsuccess = () => {
        if (countReq.result === 0) {
          INITIAL_EXERCISES.forEach((ex) => exStore.put(ex));
          INITIAL_PLANS.forEach((p) => planStore.put(p));
          INITIAL_LOGS.forEach((l) => logStore.put(l));
        }
      };
    } catch {
      if (!localStorage.getItem('traening_exercises')) {
        setLocalFallback('exercises', INITIAL_EXERCISES);
        setLocalFallback('plans', INITIAL_PLANS);
        setLocalFallback('logs', INITIAL_LOGS);
      }
    }
  },

  async getExercises(): Promise<Exercise[]> {
    // 1. Fetch from backend / MongoDB Atlas
    try {
      const res = await fetch('/api/exercises');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          // Mirror to local cache for offline resilience
          try {
            const db = await openDatabase();
            const tx = db.transaction(STORES.EXERCISES, 'readwrite');
            const store = tx.objectStore(STORES.EXERCISES);
            data.forEach((e) => store.put(e));
          } catch {
            setLocalFallback('exercises', data);
          }
          return data;
        }
      }
    } catch (err) {
      console.warn('Kunne ikke hente øvelser fra serveren, anvender lokal cache:', err);
    }

    // 2. Local IndexedDB fallback if offline
    try {
      const db = await openDatabase();
      return new Promise((resolve) => {
        const tx = db.transaction(STORES.EXERCISES, 'readonly');
        const store = tx.objectStore(STORES.EXERCISES);
        const request = store.getAll();
        request.onsuccess = () => {
          if (request.result && request.result.length > 0) {
            resolve(request.result);
          } else {
            resolve(INITIAL_EXERCISES);
          }
        };
        request.onerror = () => resolve(getLocalFallback('exercises', INITIAL_EXERCISES));
      });
    } catch {
      return getLocalFallback('exercises', INITIAL_EXERCISES);
    }
  },

  async saveExercise(exercise: Exercise): Promise<{ success: boolean; mode: 'mongodb' | 'local'; exercise: Exercise }> {
    let saveResult = { success: true, mode: 'local' as const, exercise };

    // 1. Send directly to MongoDB API endpoint
    const res = await fetch('/api/exercises', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(exercise),
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({ error: 'Netværksfejl ved gemning af øvelse' }));
      throw new Error(errData.error || `Server svarede med status ${res.status}`);
    }

    const data = await res.json();
    saveResult = {
      success: true,
      mode: data.mode || 'mongodb',
      exercise: data.exercise || exercise,
    };

    // 2. Mirror into IndexedDB / localStorage for instant offline access
    try {
      const db = await openDatabase();
      const tx = db.transaction(STORES.EXERCISES, 'readwrite');
      tx.objectStore(STORES.EXERCISES).put(saveResult.exercise);
    } catch {
      const all = getLocalFallback<Exercise[]>('exercises', []);
      const idx = all.findIndex((e) => e.id === exercise.id);
      if (idx >= 0) all[idx] = saveResult.exercise;
      else all.unshift(saveResult.exercise);
      setLocalFallback('exercises', all);
    }

    return saveResult;
  },

  async deleteExercise(id: string): Promise<void> {
    const res = await fetch(`/api/exercises/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Fejl ved sletning af øvelse' }));
      throw new Error(err.error || `Sletning mislykkedes med status ${res.status}`);
    }

    try {
      const db = await openDatabase();
      const tx = db.transaction(STORES.EXERCISES, 'readwrite');
      tx.objectStore(STORES.EXERCISES).delete(id);
    } catch {
      const all = getLocalFallback<Exercise[]>('exercises', []);
      setLocalFallback(
        'exercises',
        all.filter((e) => e.id !== id)
      );
    }
  },

  async getPlans(): Promise<WorkoutPlan[]> {
    try {
      const res = await fetch('/api/plans');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) {
          return data;
        }
      }
    } catch (err) {
      console.warn('Server get plans error', err);
    }

    try {
      const db = await openDatabase();
      return new Promise((resolve) => {
        const tx = db.transaction(STORES.PLANS, 'readonly');
        const store = tx.objectStore(STORES.PLANS);
        const request = store.getAll();
        request.onsuccess = () => {
          if (request.result && request.result.length > 0) {
            resolve(request.result);
          } else {
            resolve(INITIAL_PLANS);
          }
        };
        request.onerror = () => resolve(getLocalFallback('plans', INITIAL_PLANS));
      });
    } catch {
      return getLocalFallback('plans', INITIAL_PLANS);
    }
  },

  async savePlan(plan: WorkoutPlan): Promise<void> {
    try {
      await fetch('/api/plans', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(plan),
      });
    } catch (err) {
      console.warn('Server save plan error', err);
    }

    try {
      const db = await openDatabase();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORES.PLANS, 'readwrite');
        const store = tx.objectStore(STORES.PLANS);
        const req = store.put(plan);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch {
      const all = getLocalFallback<WorkoutPlan[]>('plans', INITIAL_PLANS);
      const idx = all.findIndex((p) => p.id === plan.id);
      if (idx >= 0) all[idx] = plan;
      else all.push(plan);
      setLocalFallback('plans', all);
    }
  },

  async deletePlan(id: string): Promise<void> {
    try {
      await fetch(`/api/plans/${id}`, { method: 'DELETE' });
    } catch (err) {
      console.warn('Server delete plan error', err);
    }

    try {
      const db = await openDatabase();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORES.PLANS, 'readwrite');
        const store = tx.objectStore(STORES.PLANS);
        const req = store.delete(id);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch {
      const all = getLocalFallback<WorkoutPlan[]>('plans', INITIAL_PLANS);
      setLocalFallback('plans', all.filter((p) => p.id !== id));
    }
  },

  async getLogs(): Promise<ExerciseLogEntry[]> {
    try {
      const res = await fetch('/api/logs');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && data.length > 0) return data;
      }
    } catch (err) {
      console.warn('Server get logs error', err);
    }

    try {
      const db = await openDatabase();
      return new Promise((resolve) => {
        const tx = db.transaction(STORES.LOGS, 'readonly');
        const store = tx.objectStore(STORES.LOGS);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result || INITIAL_LOGS);
        request.onerror = () => resolve(getLocalFallback('logs', INITIAL_LOGS));
      });
    } catch {
      return getLocalFallback('logs', INITIAL_LOGS);
    }
  },

  async addLogEntry(entry: ExerciseLogEntry): Promise<void> {
    try {
      await fetch('/api/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(entry),
      });
    } catch (err) {
      console.warn('Server add log error', err);
    }

    try {
      const db = await openDatabase();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORES.LOGS, 'readwrite');
        const store = tx.objectStore(STORES.LOGS);
        const req = store.put(entry);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch {
      const all = getLocalFallback<ExerciseLogEntry[]>('logs', INITIAL_LOGS);
      all.unshift(entry);
      setLocalFallback('logs', all);
    }
  },

  async addCompletedSession(session: CompletedSession): Promise<void> {
    try {
      await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(session),
      });
    } catch (err) {
      console.warn('Server add session error', err);
    }

    try {
      const db = await openDatabase();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction([STORES.SESSIONS, STORES.LOGS], 'readwrite');
        const sessStore = tx.objectStore(STORES.SESSIONS);
        const logStore = tx.objectStore(STORES.LOGS);

        sessStore.put(session);
        session.entries.forEach((entry) => logStore.put(entry));

        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch {
      const sessions = getLocalFallback<CompletedSession[]>('sessions', []);
      sessions.unshift(session);
      setLocalFallback('sessions', sessions);

      const logs = getLocalFallback<ExerciseLogEntry[]>('logs', INITIAL_LOGS);
      logs.unshift(...session.entries);
      setLocalFallback('logs', logs);
    }
  },

  async getCompletedSessions(): Promise<CompletedSession[]> {
    try {
      const res = await fetch('/api/sessions');
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) return data;
      }
    } catch (err) {
      console.warn('Server get sessions error', err);
    }

    try {
      const db = await openDatabase();
      return new Promise((resolve) => {
        const tx = db.transaction(STORES.SESSIONS, 'readonly');
        const store = tx.objectStore(STORES.SESSIONS);
        const request = store.getAll();
        request.onsuccess = () => resolve(request.result || []);
        request.onerror = () => resolve(getLocalFallback('sessions', []));
      });
    } catch {
      return getLocalFallback('sessions', []);
    }
  },

  async deleteCompletedSession(id: string): Promise<void> {
    try {
      await fetch(`/api/sessions/${id}`, { method: 'DELETE' });
    } catch (err) {
      console.warn('Server delete session error', err);
    }

    try {
      const db = await openDatabase();
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORES.SESSIONS, 'readwrite');
        const store = tx.objectStore(STORES.SESSIONS);
        const req = store.delete(id);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    } catch {
      const sessions = getLocalFallback<CompletedSession[]>('sessions', []);
      setLocalFallback('sessions', sessions.filter((s) => s.id !== id));
    }
  },

  // Active workout draft methods (supports resuming unfinished workouts)
  async getActiveWorkoutDraft(): Promise<WorkoutDraft | null> {
    // Check localStorage first for instant responsiveness
    try {
      const local = localStorage.getItem('traening_active_draft');
      if (local) {
        const parsed = JSON.parse(local);
        if (parsed && parsed.exercises && parsed.exercises.length > 0) {
          return parsed;
        }
      }
    } catch {
      // ignore
    }

    // Try server/mongodb
    try {
      const res = await fetch('/api/active-draft');
      if (res.ok) {
        const data = await res.json();
        if (data.draft) {
          try {
            localStorage.setItem('traening_active_draft', JSON.stringify(data.draft));
          } catch {
            // ignore
          }
          return data.draft;
        }
      }
    } catch (err) {
      console.warn('Failed to load active draft from server', err);
    }

    return null;
  },

  async saveActiveWorkoutDraft(draft: WorkoutDraft): Promise<void> {
    try {
      localStorage.setItem('traening_active_draft', JSON.stringify(draft));
    } catch {
      // ignore
    }

    try {
      await fetch('/api/active-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draft }),
      });
    } catch (err) {
      console.warn('Failed to save draft to server', err);
    }
  },

  async clearActiveWorkoutDraft(): Promise<void> {
    try {
      localStorage.removeItem('traening_active_draft');
    } catch {
      // ignore
    }

    try {
      await fetch('/api/active-draft', { method: 'DELETE' });
    } catch (err) {
      console.warn('Failed to delete draft from server', err);
    }
  },

  // Upload image to server
  async uploadImage(imageBase64: string, filename?: string): Promise<string> {
    try {
      const res = await fetch('/api/upload-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageBase64, filename }),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.url) return json.url;
      }
    } catch (err) {
      console.warn('Server image upload failed, returning base64 directly', err);
    }
    return imageBase64;
  },

  async resetToDefaults(): Promise<void> {
    try {
      await fetch('/api/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          exercises: INITIAL_EXERCISES,
          plans: INITIAL_PLANS,
          logs: INITIAL_LOGS,
        }),
      });
    } catch (e) {
      console.warn('Reset server failed', e);
    }

    try {
      const db = await openDatabase();
      const tx = db.transaction([STORES.EXERCISES, STORES.PLANS, STORES.LOGS, STORES.SESSIONS], 'readwrite');
      tx.objectStore(STORES.EXERCISES).clear();
      tx.objectStore(STORES.PLANS).clear();
      tx.objectStore(STORES.LOGS).clear();
      tx.objectStore(STORES.SESSIONS).clear();

      INITIAL_EXERCISES.forEach((ex) => tx.objectStore(STORES.EXERCISES).put(ex));
      INITIAL_PLANS.forEach((p) => tx.objectStore(STORES.PLANS).put(p));
      INITIAL_LOGS.forEach((l) => tx.objectStore(STORES.LOGS).put(l));
    } catch {
      setLocalFallback('exercises', INITIAL_EXERCISES);
      setLocalFallback('plans', INITIAL_PLANS);
      setLocalFallback('logs', INITIAL_LOGS);
      setLocalFallback('sessions', []);
    }
  },
};
