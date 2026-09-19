export interface Exercise {
  id: string;
  name: string;
  description: string;
  imageUrl?: string;
  videoUrl?: string;
  targetArea?: string; // fx 'Knæ', 'Lår', 'Hofte', 'Core'
  defaultSets: number;
  defaultReps: string;
  defaultWeightKg?: number;
  isUnilateralByDefault?: boolean;
  createdAt: string;
}

export interface PlanExercise {
  id: string;
  exerciseId: string;
  name: string;
  description: string;
  imageUrl?: string;
  videoUrl?: string;
  targetArea?: string;
  sets: number;
  reps: string;
  weightKg?: number;
  separateLegs: boolean; // default false (samlet)
  leftLegWeightKg?: number;
  leftLegReps?: string;
  rightLegWeightKg?: number;
  rightLegReps?: string;
  notes?: string;
  isCompleted?: boolean;
  completedAt?: string;
  activeTimerSeconds?: number;
}

export interface WorkoutPlan {
  id: string;
  title: string;
  description?: string;
  frequency?: string;
  scheduledDates: string[]; // YYYY-MM-DD
  exercises: PlanExercise[];
  createdAt: string;
  updatedAt: string;
}

export interface ExerciseLogEntry {
  id: string;
  exerciseId: string;
  exerciseName: string;
  planId?: string;
  planTitle?: string;
  date: string; // YYYY-MM-DD
  timestamp: number;
  separateLegs: boolean;
  sets: number;
  reps: string;
  weightKg?: number;
  leftLegWeightKg?: number;
  leftLegReps?: string;
  rightLegWeightKg?: number;
  rightLegReps?: string;
  durationSeconds?: number;
  notes?: string;
}

export interface CompletedSession {
  id: string;
  planId: string;
  planTitle: string;
  date: string;
  startedAt: string;
  completedAt: string;
  durationSeconds: number;
  exercisesCompletedCount: number;
  totalExercisesCount: number;
  entries: ExerciseLogEntry[];
}
