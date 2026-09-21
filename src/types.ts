export interface ImagePosition {
  x: number;
  y: number;
  scale?: number;
}

export type ExerciseTrackingMode = 'sets_reps_weight' | 'timed_score';

export interface ScoreRoundResult {
  round: number;
  score?: number;
  leftScore?: number;
  rightScore?: number;
  notes?: string;
}

export interface Exercise {
  id: string;
  name: string;
  description: string;
  imageUrl?: string;
  imagePosition?: ImagePosition;
  videoUrl?: string;
  targetArea?: string;
  categories?: string[];
  defaultSets: number;
  defaultReps: string;
  defaultWeightKg?: number;
  isUnilateralByDefault?: boolean;
  trackingMode?: ExerciseTrackingMode;
  defaultDurationSeconds?: number;
  defaultRounds?: number;
  restSeconds?: number;
  scoreLabel?: string;
  scoreUnit?: string;
  lowerScoreIsBetter?: boolean;
  scorePerSide?: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface PlanExercise {
  id: string;
  exerciseId: string;
  name: string;
  description: string;
  imageUrl?: string;
  imagePosition?: ImagePosition;
  videoUrl?: string;
  targetArea?: string;
  categories?: string[];
  sets: number;
  reps: string;
  weightKg?: number;
  separateLegs: boolean;
  leftLegWeightKg?: number;
  leftLegReps?: string;
  rightLegWeightKg?: number;
  rightLegReps?: string;
  notes?: string;
  isCompleted?: boolean;
  completedAt?: string;
  activeTimerSeconds?: number;
  trackingMode?: ExerciseTrackingMode;
  durationSeconds?: number;
  rounds?: number;
  restSeconds?: number;
  scoreLabel?: string;
  scoreUnit?: string;
  lowerScoreIsBetter?: boolean;
  scorePerSide?: boolean;
  scoreResults?: ScoreRoundResult[];
}

export interface WorkoutPlan {
  id: string;
  title: string;
  description?: string;
  frequency?: string;
  scheduledDates: string[];
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
  date: string;
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
  trackingMode?: ExerciseTrackingMode;
  scoreLabel?: string;
  scoreUnit?: string;
  lowerScoreIsBetter?: boolean;
  scoreResults?: ScoreRoundResult[];
  lsiPercent?: number;
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
  status?: 'completed' | 'partial';
  isPartial?: boolean;
  entries: ExerciseLogEntry[];
  remainingExercises?: PlanExercise[];
  notes?: string;
}

export interface WorkoutDraft {
  id: string;
  planId: string;
  planTitle: string;
  /** Stable identity used to reconnect a draft if a plan id changes between deployments. */
  stablePlanKey?: string;
  /** Previous ids this plan/draft has been known under. */
  planIdAliases?: string[];
  workoutDate: string;
  sessionSeconds: number;
  lastUpdated: string;
  exercises: PlanExercise[];
  timers?: { [exerciseId: string]: { seconds: number; isRunning: boolean } };
  isPartiallyCompleted?: boolean;
}
