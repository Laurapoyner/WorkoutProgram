import { CompletedSession, Exercise, ExerciseLogEntry, WorkoutPlan } from '../types';

const createdAt = '2026-09-20T11:00:00.000Z';

export const EXORLIVE_IMAGE_UPDATES = Array.from({ length: 12 }, (_, i) => ({
  id: `ex-${i + 1}`,
  imageUrl: `/imported/exorlive/ex-${i + 1}.webp`,
  imagePosition: { x: 50, y: 50, scale: 1 },
  updatedAt: createdAt,
}));

export const LSI_EXERCISES: Exercise[] = [
  {
    id: 'ex-lsi-side-hop',
    name: 'Side-to-side Hop (30 cm zone)',
    description: 'Hop sidelæns over en 30 cm zone og tilbage så mange gange som muligt på ét ben i 30 sekunder. Kun succesfulde landinger tæller. Berøring med det andet ben eller landing helt uden for zonen tæller som fejl.',
    targetArea: 'ACL LSI Test',
    defaultSets: 1,
    defaultReps: '30 sek',
    trackingMode: 'timed_score',
    defaultDurationSeconds: 30,
    defaultRounds: 1,
    restSeconds: 0,
    scoreLabel: 'Succesfulde hop',
    scoreUnit: 'hop',
    scorePerSide: true,
    isUnilateralByDefault: true,
    createdAt,
  },
  {
    id: 'ex-lsi-broad-jump',
    name: 'Single-leg Broad Jump',
    description: 'Stå på testbenet bag startlinjen, spring så langt frem som muligt og land på samme ben. Hold landingen i 2 sekunder. Tre forsøg; bedste afstand registreres.',
    targetArea: 'ACL LSI Test',
    defaultSets: 3,
    defaultReps: '3 forsøg',
    trackingMode: 'timed_score',
    defaultRounds: 3,
    scoreLabel: 'Afstand',
    scoreUnit: 'cm',
    scorePerSide: true,
    isUnilateralByDefault: true,
    createdAt,
  },
  {
    id: 'ex-lsi-triple-hop',
    name: 'Triple Hop',
    description: 'Tre maksimale sammenhængende hop fremad på samme ben. Efter tredje hop holdes landingen i 2 sekunder. Total afstand registreres.',
    targetArea: 'ACL LSI Test',
    defaultSets: 1,
    defaultReps: '1-3 forsøg',
    trackingMode: 'timed_score',
    defaultRounds: 1,
    scoreLabel: 'Total afstand',
    scoreUnit: 'cm',
    scorePerSide: true,
    isUnilateralByDefault: true,
    createdAt,
  },
  {
    id: 'ex-lsi-box-squat',
    name: 'Single-leg Box Squat (30 s)',
    description: 'Stå på testbenet foran en stabil boks/stol. Sæt dig kontrolleret tilbage til let berøring og rejs dig igen så mange gange som muligt på 30 sekunder uden støtte fra det frie ben.',
    targetArea: 'ACL LSI Test',
    defaultSets: 1,
    defaultReps: '30 sek',
    trackingMode: 'timed_score',
    defaultDurationSeconds: 30,
    defaultRounds: 1,
    scoreLabel: 'Kontrollerede gentagelser',
    scoreUnit: 'reps',
    scorePerSide: true,
    isUnilateralByDefault: true,
    createdAt,
  },
  {
    id: 'ex-lsi-pogo',
    name: 'Pogo-Jump Endurance (5 × 60 s)',
    description: 'Små hurtige hop på samme ben i 60 sekunder. Gentages 5 gange med 30 sekunders pause. En fejl er, når det andet ben rører jorden. Færre fejl er bedre.',
    targetArea: 'ACL LSI Test',
    defaultSets: 5,
    defaultReps: '60 sek',
    trackingMode: 'timed_score',
    defaultDurationSeconds: 60,
    defaultRounds: 5,
    restSeconds: 30,
    scoreLabel: 'Fejl',
    scoreUnit: 'fejl',
    lowerScoreIsBetter: true,
    scorePerSide: true,
    isUnilateralByDefault: true,
    createdAt,
  },
];

export const LSI_PLAN: WorkoutPlan = {
  id: 'plan-lsi-protocol',
  title: 'ACL Return-to-Sport LSI Testprotokol',
  description: 'Standardiseret LSI-testbatteri: Side-to-side Hop, Single-leg Broad Jump, Triple Hop, Single-leg Box Squat og Pogo-Jump Endurance. Følg rækkefølgen og hold 5 minutters pause mellem testtyper.',
  frequency: 'Test / retest efter behov',
  scheduledDates: [],
  createdAt,
  updatedAt: createdAt,
  exercises: LSI_EXERCISES.map((ex, index) => ({
    id: `pe-lsi-${index + 1}`,
    exerciseId: ex.id,
    name: ex.name,
    description: ex.description,
    targetArea: ex.targetArea,
    imageUrl: ex.imageUrl,
    sets: ex.defaultSets,
    reps: ex.defaultReps,
    separateLegs: true,
    trackingMode: ex.trackingMode,
    durationSeconds: ex.defaultDurationSeconds,
    rounds: ex.defaultRounds,
    restSeconds: ex.restSeconds,
    scoreLabel: ex.scoreLabel,
    scoreUnit: ex.scoreUnit,
    lowerScoreIsBetter: ex.lowerScoreIsBetter,
    scorePerSide: true,
    notes: index < 4 ? '5 min pause før næste testtype.' : undefined,
  })),
};

function scoreLog(
  id: string,
  exerciseId: string,
  exerciseName: string,
  date: string,
  values: { left: Array<number | undefined>; right: Array<number | undefined> },
  meta: { unit: string; label: string; lsi?: number; notes?: string; duration?: number; lower?: boolean }
): ExerciseLogEntry {
  const rounds = Math.max(values.left.length, values.right.length);
  return {
    id,
    exerciseId,
    exerciseName,
    planId: LSI_PLAN.id,
    planTitle: LSI_PLAN.title,
    date,
    timestamp: new Date(`${date}T12:00:00+01:00`).getTime(),
    separateLegs: true,
    sets: rounds,
    reps: meta.duration ? `${meta.duration} sek` : `${rounds} forsøg`,
    durationSeconds: meta.duration,
    trackingMode: 'timed_score',
    scoreLabel: meta.label,
    scoreUnit: meta.unit,
    lowerScoreIsBetter: meta.lower,
    scoreResults: Array.from({ length: rounds }, (_, i) => ({
      round: i + 1,
      leftScore: values.left[i],
      rightScore: values.right[i],
    })),
    lsiPercent: meta.lsi,
    notes: meta.notes,
  };
}

const logs20251211: ExerciseLogEntry[] = [
  scoreLog('lsi-2025-12-11-sidehop', 'ex-lsi-side-hop', 'Side-to-side Hop (30 cm zone)', '2025-12-11', { left: [0], right: [27] }, { unit: 'hop', label: 'Succesfulde hop', lsi: 0, duration: 30, notes: 'Smerte ved forsøg (uden hop, bare støtten).' }),
  scoreLog('lsi-2025-12-11-broad', 'ex-lsi-broad-jump', 'Single-leg Broad Jump', '2025-12-11', { left: [10], right: [108, 140, 142] }, { unit: 'cm', label: 'Afstand', lsi: 7 }),
  scoreLog('lsi-2025-12-11-triple', 'ex-lsi-triple-hop', 'Triple Hop', '2025-12-11', { left: [55], right: [460] }, { unit: 'cm', label: 'Total afstand', lsi: 12 }),
  scoreLog('lsi-2025-12-11-box', 'ex-lsi-box-squat', 'Single-leg Box Squat (30 s)', '2025-12-11', { left: [17], right: [16] }, { unit: 'reps', label: 'Kontrollerede gentagelser', lsi: 106, duration: 30 }),
  scoreLog('lsi-2025-12-11-pogo', 'ex-lsi-pogo', 'Pogo-Jump Endurance (5 × 60 s)', '2025-12-11', { left: [2,3,2,2,2], right: [0,0,0,0,0] }, { unit: 'fejl', label: 'Fejl', lower: true, notes: 'H: 0 fejl. V: 11 fejl. Jeg kan hoppe 25% hop af hvad jeg kan på højre.' }),
];

const logs20260325: ExerciseLogEntry[] = [
  scoreLog('lsi-2026-03-25-sidehop', 'ex-lsi-side-hop', 'Side-to-side Hop (30 cm zone)', '2026-03-25', { left: [9], right: [30] }, { unit: 'hop', label: 'Succesfulde hop', lsi: 30, duration: 30, notes: 'Måtte prøve 2 gange, da jeg ikke kunne udføre første.' }),
  scoreLog('lsi-2026-03-25-broad', 'ex-lsi-broad-jump', 'Single-leg Broad Jump', '2026-03-25', { left: [17,19,23], right: [116,145,148] }, { unit: 'cm', label: 'Afstand', lsi: 16 }),
  scoreLog('lsi-2026-03-25-triple', 'ex-lsi-triple-hop', 'Triple Hop', '2026-03-25', { left: [125], right: [500] }, { unit: 'cm', label: 'Total afstand', lsi: 25 }),
  scoreLog('lsi-2026-03-25-box', 'ex-lsi-box-squat', 'Single-leg Box Squat (30 s)', '2026-03-25', { left: [21], right: [22] }, { unit: 'reps', label: 'Kontrollerede gentagelser', lsi: 95, duration: 30 }),
  scoreLog('lsi-2026-03-25-pogo', 'ex-lsi-pogo', 'Pogo-Jump Endurance (5 × 60 s)', '2026-03-25', { left: [0,0,2,1,0], right: [0,0,0,0,0] }, { unit: 'fejl', label: 'Fejl', lower: true, notes: 'H: 0 fejl. V: 3 fejl. Jeg kan hoppe 50% hop af hvad jeg kan på højre.' }),
];

const logs20260520: ExerciseLogEntry[] = [
  scoreLog('lsi-2026-05-20-sidehop', 'ex-lsi-side-hop', 'Side-to-side Hop (30 cm zone)', '2026-05-20', { left: [15], right: [61,63] }, { unit: 'hop', label: 'Succesfulde hop', lsi: 24.6, duration: 30, notes: 'På uninjured fik jeg først 61 og efter 63 - testet to gange, da resultatet fra sidst undrede. Skadet ben: 15 (9 ved forrige test).' }),
  scoreLog('lsi-2026-05-20-broad', 'ex-lsi-broad-jump', 'Single-leg Broad Jump', '2026-05-20', { left: [30,51,48], right: [145,146,155] }, { unit: 'cm', label: 'Afstand', lsi: 32.9 }),
  scoreLog('lsi-2026-05-20-triple', 'ex-lsi-triple-hop', 'Triple Hop', '2026-05-20', { left: [188], right: [500] }, { unit: 'cm', label: 'Total afstand', lsi: 37.6 }),
  scoreLog('lsi-2026-05-20-box', 'ex-lsi-box-squat', 'Single-leg Box Squat (30 s)', '2026-05-20', { left: [21], right: [22] }, { unit: 'reps', label: 'Kontrollerede gentagelser', lsi: 95.5, duration: 30 }),
  scoreLog('lsi-2026-05-20-pogo', 'ex-lsi-pogo', 'Pogo-Jump Endurance (5 × 60 s)', '2026-05-20', { left: [0,0,0,0,0], right: [0,0,0,0,0] }, { unit: 'fejl', label: 'Fejl', lower: true, notes: 'H: 0 fejl. V: 0 fejl. Jeg kan hoppe 50% hop af hvad jeg kan på højre.' }),
];

export const LSI_HISTORICAL_LOGS: ExerciseLogEntry[] = [
  ...logs20251211,
  ...logs20260325,
  ...logs20260520,
];

function makeSession(date: string, entries: ExerciseLogEntry[], notes: string): CompletedSession {
  return {
    id: `sess-lsi-${date}`,
    planId: LSI_PLAN.id,
    planTitle: LSI_PLAN.title,
    date,
    startedAt: `${date}T11:00:00.000Z`,
    completedAt: `${date}T12:00:00.000Z`,
    durationSeconds: 3600,
    exercisesCompletedCount: entries.length,
    totalExercisesCount: LSI_PLAN.exercises.length,
    status: 'completed',
    isPartial: false,
    entries,
    notes,
  };
}

export const LSI_HISTORICAL_SESSIONS: CompletedSession[] = [
  makeSession('2025-12-11', logs20251211, 'Opvarmning 30 min. Udført med smerte på opereret knæ; efterfølgende hævelse og smerter i 17-18 dage.'),
  makeSession('2026-03-25', logs20260325, 'Opvarmning 15 min (plejer 1 time cardio). Knæet stift i starten, almindeligt dagen efter. Mental begrænsning. Side-to-side kunne først udføres efter box squat.'),
  makeSession('2026-05-20', logs20260520, 'Opvarmning 15 min.'),
];

export const REHAB_MIGRATION_ID = 'rehab-seed-2026-09-v2';
