import { Exercise, WorkoutPlan, ExerciseLogEntry, CompletedSession, WorkoutDraft } from '../types';
import { INITIAL_EXERCISES, INITIAL_PLANS, INITIAL_LOGS } from './defaultData';

async function apiJson<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new Error('Kan ikke kontakte serveren. Tjek internetforbindelsen og prøv igen.');
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: `Serverfejl (${res.status})` }));
    throw new Error(body.error || `Serverfejl (${res.status})`);
  }

  return res.json() as Promise<T>;
}

/**
 * MongoDB Atlas is the single source of truth.
 * Browser storage is intentionally NOT used as a write fallback, because that
 * would create different data on different devices if the server is unavailable.
 */
export const StorageService = {
  async init(): Promise<void> {
    const state = await apiJson<{
      exercises: Exercise[];
      plans: WorkoutPlan[];
      logs: ExerciseLogEntry[];
      sessions: CompletedSession[];
    }>('/api/db-state');

    // Seed a brand-new shared database once with the built-in starter content.
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
  },

  async getExercises(): Promise<Exercise[]> {
    return apiJson<Exercise[]>('/api/exercises');
  },

  async saveExercise(exercise: Exercise): Promise<{ success: boolean; mode: 'mongodb'; exercise: Exercise }> {
    return apiJson('/api/exercises', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(exercise),
    });
  },

  async deleteExercise(id: string): Promise<void> {
    await apiJson(`/api/exercises/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },

  async getPlans(): Promise<WorkoutPlan[]> {
    return apiJson<WorkoutPlan[]>('/api/plans');
  },

  async savePlan(plan: WorkoutPlan): Promise<void> {
    await apiJson('/api/plans', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(plan),
    });
  },

  async deletePlan(id: string): Promise<void> {
    await apiJson(`/api/plans/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },

  async getLogs(): Promise<ExerciseLogEntry[]> {
    return apiJson<ExerciseLogEntry[]>('/api/logs');
  },

  async addLogEntry(entry: ExerciseLogEntry): Promise<void> {
    await apiJson('/api/logs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(entry),
    });
  },

  async addCompletedSession(session: CompletedSession): Promise<void> {
    await apiJson('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(session),
    });
  },

  async getCompletedSessions(): Promise<CompletedSession[]> {
    return apiJson<CompletedSession[]>('/api/sessions');
  },

  async deleteCompletedSession(id: string): Promise<void> {
    await apiJson(`/api/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' });
  },

  async getActiveWorkoutDraft(): Promise<WorkoutDraft | null> {
    const data = await apiJson<{ draft: WorkoutDraft | null }>('/api/active-draft');
    return data.draft || null;
  },

  async saveActiveWorkoutDraft(draft: WorkoutDraft): Promise<void> {
    await apiJson('/api/active-draft', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ draft }),
    });
  },

  async clearActiveWorkoutDraft(): Promise<void> {
    await apiJson('/api/active-draft', { method: 'DELETE' });
  },

  async uploadImage(imageBase64: string, filename?: string): Promise<string> {
    const json = await apiJson<{ url: string }>('/api/upload-image', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageBase64, filename }),
    });
    if (!json.url) throw new Error('Serveren returnerede ingen billedadresse.');
    return json.url;
  },

  async resetToDefaults(): Promise<void> {
    await apiJson('/api/reset', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        exercises: INITIAL_EXERCISES,
        plans: INITIAL_PLANS,
        logs: INITIAL_LOGS,
      }),
    });
  },
};
