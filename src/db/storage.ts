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

    // Seed a brand-new shared database once with the built-in starter content first.
    // This ensures the one-time rehab migration can also attach the real ExorLive PDF images to ex-1..ex-12.
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

    // Idempotent migration: adds the ExorLive images, LSI test plan and historical test data once.
    await apiJson('/api/migrations/rehab-2026', { method: 'POST' });

    // Remove orphan exercise logs left behind by older versions when a workout session was deleted.
    await apiJson('/api/migrations/cleanup-orphan-logs', { method: 'POST' });
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

  async getWorkoutDrafts(): Promise<WorkoutDraft[]> {
    const data = await apiJson<{ drafts: WorkoutDraft[] }>('/api/drafts');
    return data.drafts || [];
  },

  async getWorkoutDraftForPlan(planId: string, planTitle?: string): Promise<WorkoutDraft | null> {
    const titleQuery = planTitle ? `?title=${encodeURIComponent(planTitle)}` : '';
    const data = await apiJson<{ draft: WorkoutDraft | null }>(`/api/drafts/plan/${encodeURIComponent(planId)}${titleQuery}`);
    return data.draft || null;
  },

  async saveWorkoutDraft(draft: WorkoutDraft): Promise<WorkoutDraft> {
    const data = await apiJson<{ draft?: WorkoutDraft }>('/api/drafts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ draft }),
    });
    return data.draft || draft;
  },

  async deleteWorkoutDraft(draftId: string): Promise<void> {
    await apiJson(`/api/drafts/${encodeURIComponent(draftId)}`, { method: 'DELETE' });
  },

  // Backwards-compatible aliases used by older UI code.
  async getActiveWorkoutDraft(): Promise<WorkoutDraft | null> {
    const drafts = await this.getWorkoutDrafts();
    return drafts[0] || null;
  },

  async saveActiveWorkoutDraft(draft: WorkoutDraft): Promise<void> {
    await this.saveWorkoutDraft(draft);
  },

  async clearActiveWorkoutDraft(draftId?: string): Promise<void> {
    if (draftId) return this.deleteWorkoutDraft(draftId);
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
