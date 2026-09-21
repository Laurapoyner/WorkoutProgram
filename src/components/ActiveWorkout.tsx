import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  CheckCircle2,
  Circle,
  Clock,
  Dumbbell,
  ExternalLink,
  Save,
  Sparkles,
  Calendar,
  AlertCircle,
  TrendingUp,
  Camera,
  Check,
  ChevronRight,
  ArrowRight,
  BookmarkCheck,
  HelpCircle,
  X,
  Ban,
} from 'lucide-react';
import { WorkoutPlan, PlanExercise, ExerciseLogEntry, CompletedSession, Exercise, WorkoutDraft } from '../types';
import { ExerciseProgressModal } from './ExerciseProgressModal';
import { ImageUploadModal } from './ImageUploadModal';
import { getExerciseImageStyle } from '../utils/imageStyle';
import { StorageService } from '../db/storage';

interface ActiveWorkoutProps {
  plans: WorkoutPlan[];
  activePlanId: string;
  onChangePlan: (planId: string) => void;
  onCompleteWorkout: (session: CompletedSession) => void;
  allExercises: Exercise[];
  allLogs: ExerciseLogEntry[];
  onUpdateExercise?: (exercise: Exercise) => void;
  resumeSession?: CompletedSession | null;
  onClearResumeSession?: () => void;
  onToast?: (msg: string) => void;
}

export const ActiveWorkout: React.FC<ActiveWorkoutProps> = ({
  plans,
  activePlanId,
  onChangePlan,
  onCompleteWorkout,
  allExercises,
  allLogs,
  onUpdateExercise,
  resumeSession,
  onClearResumeSession,
  onToast,
}) => {
  const currentPlan = plans.find((p) => p.id === activePlanId) || plans[0];

  // Workout date state (defaults to today)
  const [workoutDate, setWorkoutDate] = useState(() => {
    return new Date().toISOString().split('T')[0];
  });

  // Overall session timer
  const [sessionSeconds, setSessionSeconds] = useState(0);
  const [isSessionTimerRunning, setIsSessionTimerRunning] = useState(false);
  const sessionTimerRef = useRef<number | null>(null);

  // Exercises list for current active workout session
  const [sessionExercises, setSessionExercises] = useState<PlanExercise[]>([]);

  // Individual exercise active timer
  const [timers, setTimers] = useState<{ [exerciseId: string]: { seconds: number; isRunning: boolean } }>({});
  const timerIntervalRef = useRef<number | null>(null);

  // Draft and resumption state
  const [isDraftLoaded, setIsDraftLoaded] = useState(false);
  const [draftBannerVisible, setDraftBannerVisible] = useState(false);
  const [draftBannerMessage, setDraftBannerMessage] = useState<string | null>(null);
  const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);
  const [showPartialModal, setShowPartialModal] = useState(false);
  const [ongoingDrafts, setOngoingDrafts] = useState<WorkoutDraft[]>([]);
  const [showDraftList, setShowDraftList] = useState(false);
  const [skipReasonExerciseId, setSkipReasonExerciseId] = useState<string | null>(null);
  const [skipOtherText, setSkipOtherText] = useState('');

  // Modals
  const [inspectExercise, setInspectExercise] = useState<Exercise | null>(null);
  const [exerciseForImageUpload, setExerciseForImageUpload] = useState<Exercise | null>(null);

  // Track which plan/session has been loaded. This prevents background syncs from overwriting
  // unsaved UI state while still allowing a different plan to load its own independent draft.
  const loadedKeyRef = useRef<string>('');

  const refreshDraftList = useCallback(async () => {
    try {
      const drafts = await StorageService.getWorkoutDrafts();
      setOngoingDrafts(drafts);
    } catch (err) {
      console.warn('Kunne ikke hente kladder', err);
    }
  }, []);

  const freshExercisesForPlan = useCallback((plan: WorkoutPlan) => {
    return plan.exercises.map((pe) => {
      const baseEx = allExercises.find((e) => e.id === pe.exerciseId);
      return {
        ...pe,
        imageUrl: baseEx?.imageUrl || pe.imageUrl,
        imagePosition: baseEx?.imagePosition || pe.imagePosition,
        trackingMode: pe.trackingMode || baseEx?.trackingMode || 'sets_reps_weight',
        durationSeconds: pe.durationSeconds ?? baseEx?.defaultDurationSeconds,
        rounds: pe.rounds ?? baseEx?.defaultRounds,
        restSeconds: pe.restSeconds ?? baseEx?.restSeconds,
        scoreLabel: pe.scoreLabel ?? baseEx?.scoreLabel,
        scoreUnit: pe.scoreUnit ?? baseEx?.scoreUnit,
        lowerScoreIsBetter: pe.lowerScoreIsBetter ?? baseEx?.lowerScoreIsBetter,
        scorePerSide: pe.scorePerSide ?? baseEx?.scorePerSide,
        isCompleted: false,
        executionStatus: 'pending',
        skipReason: undefined,
        skipReasonText: undefined,
        activeTimerSeconds: 0,
      } as PlanExercise;
    });
  }, [allExercises]);

  // Load the draft belonging to the selected plan only. Other unfinished workouts stay untouched.
  useEffect(() => {
    async function initSession() {
      if (!currentPlan) return;
      const loadKey = `${activePlanId}:${resumeSession?.id || ''}`;
      if (loadedKeyRef.current === loadKey) return;
      loadedKeyRef.current = loadKey;
      setIsDraftLoaded(false);
      setDraftBannerVisible(false);
      setLastSavedTime(null);
      setIsSessionTimerRunning(false);
      setTimers({});

      await refreshDraftList();

      // Explicitly resume a partial historical session.
      if (resumeSession && resumeSession.planId === activePlanId) {
        const targetPlan = plans.find((p) => p.id === resumeSession.planId) || currentPlan;
        const mapped = freshExercisesForPlan(targetPlan).map((pe) => {
          const loggedEntry = resumeSession.entries.find((e) => e.exerciseId === pe.exerciseId);
          if (!loggedEntry) return pe;
          return {
            ...pe,
            sets: loggedEntry.sets || pe.sets,
            reps: loggedEntry.reps || pe.reps,
            weightKg: loggedEntry.weightKg ?? pe.weightKg,
            separateLegs: loggedEntry.separateLegs ?? pe.separateLegs,
            leftLegWeightKg: loggedEntry.leftLegWeightKg ?? pe.leftLegWeightKg,
            leftLegReps: loggedEntry.leftLegReps ?? pe.leftLegReps,
            rightLegWeightKg: loggedEntry.rightLegWeightKg ?? pe.rightLegWeightKg,
            rightLegReps: loggedEntry.rightLegReps ?? pe.rightLegReps,
            notes: loggedEntry.notes ?? pe.notes,
            trackingMode: loggedEntry.trackingMode ?? pe.trackingMode,
            scoreLabel: loggedEntry.scoreLabel ?? pe.scoreLabel,
            scoreUnit: loggedEntry.scoreUnit ?? pe.scoreUnit,
            lowerScoreIsBetter: loggedEntry.lowerScoreIsBetter ?? pe.lowerScoreIsBetter,
            scoreResults: loggedEntry.scoreResults ?? pe.scoreResults,
            isCompleted: true,
            executionStatus: 'completed',
            activeTimerSeconds: loggedEntry.durationSeconds || 0,
          };
        });
        setSessionExercises(mapped);
        setSessionSeconds(resumeSession.durationSeconds || 0);
        setWorkoutDate(new Date().toISOString().split('T')[0]);
        setDraftBannerMessage(`Genoptaget tidligere pas: ${mapped.filter((e) => e.isCompleted).length} af ${mapped.length} øvelser er allerede registreret.`);
        setDraftBannerVisible(true);
        setIsDraftLoaded(true);
        onClearResumeSession?.();
        return;
      }

      try {
        const draft = await StorageService.getWorkoutDraftForPlan(activePlanId, currentPlan.title);
        if (draft?.exercises?.length) {
          const refreshed = draft.exercises.map((pe) => {
            const baseEx = allExercises.find((e) => e.id === pe.exerciseId);
            return {
              ...pe,
              imageUrl: baseEx?.imageUrl || pe.imageUrl,
              imagePosition: baseEx?.imagePosition || pe.imagePosition,
            };
          });
          setSessionExercises(refreshed);
          setSessionSeconds(draft.sessionSeconds || 0);
          setWorkoutDate(draft.workoutDate || new Date().toISOString().split('T')[0]);
          setTimers(draft.timers || {});
          const doneCount = refreshed.filter((e) => e.executionStatus === 'completed' || e.isCompleted).length;
          const updatedTime = new Date(draft.lastUpdated).toLocaleString('da-DK', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
          setDraftBannerMessage(`Kladde til dette program: ${doneCount} af ${refreshed.length} øvelser udført · gemt ${updatedTime}.`);
          setDraftBannerVisible(true);
          setIsDraftLoaded(true);
          return;
        }
      } catch (err) {
        console.warn('Error reading plan draft', err);
      }

      setSessionExercises(freshExercisesForPlan(currentPlan));
      setSessionSeconds(0);
      setWorkoutDate(new Date().toISOString().split('T')[0]);
      setIsDraftLoaded(true);
    }
    initSession();
  }, [activePlanId, resumeSession?.id, currentPlan?.id, refreshDraftList, freshExercisesForPlan]);

  // Switching programs saves the current one as a draft, then opens the target plan/draft.
  const handleSwitchPlan = async (newPlanId: string) => {
    if (newPlanId === activePlanId) return;
    setIsSessionTimerRunning(false);
    setTimers((prev) => Object.fromEntries(Object.entries(prev).map(([k, v]) => [k, { ...v, isRunning: false }])));
    try {
      await saveDraftToStorage(sessionExercises, sessionSeconds);
    } catch {}
    loadedKeyRef.current = '';
    onChangePlan(newPlanId);
  };

  const openDraft = async (draft: WorkoutDraft) => {
    setShowDraftList(false);
    if (draft.planId !== activePlanId) {
      await handleSwitchPlan(draft.planId);
      return;
    }

    const refreshed = draft.exercises.map((pe) => {
      const baseEx = allExercises.find((e) => e.id === pe.exerciseId);
      return {
        ...pe,
        imageUrl: baseEx?.imageUrl || pe.imageUrl,
        imagePosition: baseEx?.imagePosition || pe.imagePosition,
      };
    });
    setSessionExercises(refreshed);
    setSessionSeconds(draft.sessionSeconds || 0);
    setWorkoutDate(draft.workoutDate || new Date().toISOString().split('T')[0]);
    setTimers(draft.timers || {});
    setIsDraftLoaded(true);
    const doneCount = refreshed.filter((e) => e.executionStatus === 'completed' || e.isCompleted).length;
    const updatedTime = new Date(draft.lastUpdated).toLocaleString('da-DK', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    setDraftBannerMessage(`Kladde valgt: ${doneCount} af ${refreshed.length} øvelser udført · gemt ${updatedTime}.`);
    setDraftBannerVisible(true);
  };

  // Overall session timer tick
  useEffect(() => {
    if (isSessionTimerRunning) {
      sessionTimerRef.current = window.setInterval(() => {
        setSessionSeconds((prev) => prev + 1);
      }, 1000);
    } else if (sessionTimerRef.current) {
      clearInterval(sessionTimerRef.current);
    }
    return () => {
      if (sessionTimerRef.current) clearInterval(sessionTimerRef.current);
    };
  }, [isSessionTimerRunning]);

  // Individual exercise timers tick
  useEffect(() => {
    timerIntervalRef.current = window.setInterval(() => {
      setTimers((prev) => {
        let hasChanges = false;
        const next = { ...prev };
        Object.keys(next).forEach((exId) => {
          if (next[exId].isRunning) {
            next[exId] = { ...next[exId], seconds: next[exId].seconds + 1 };
            hasChanges = true;
          }
        });
        return hasChanges ? next : prev;
      });
    }, 1000);

    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, []);

  // AUTO-SAVE DRAFT: Automatically save changes whenever exercises or timer changes
  const saveDraftToStorage = useCallback(
    async (exercisesToSave: PlanExercise[], seconds: number) => {
      if (!currentPlan || exercisesToSave.length === 0) return;

      const hasActivity =
        seconds > 0 ||
        Object.values(timers).some((timer) => Number(timer?.seconds || 0) > 0) ||
        exercisesToSave.some((e) => {
          const original = currentPlan.exercises.find((base) => base.id === e.id || base.exerciseId === e.exerciseId);
          const changedFromPlan = original
            ? e.sets !== original.sets ||
              e.reps !== original.reps ||
              e.weightKg !== original.weightKg ||
              e.separateLegs !== original.separateLegs ||
              e.leftLegWeightKg !== original.leftLegWeightKg ||
              e.leftLegReps !== original.leftLegReps ||
              e.rightLegWeightKg !== original.rightLegWeightKg ||
              e.rightLegReps !== original.rightLegReps ||
              e.durationSeconds !== original.durationSeconds ||
              e.rounds !== original.rounds
            : false;
          return Boolean(
            e.isCompleted ||
            e.executionStatus === 'skipped' ||
            (e.notes && e.notes.trim().length > 0) ||
            (Array.isArray(e.scoreResults) && e.scoreResults.length > 0) ||
            Number(e.activeTimerSeconds || 0) > 0 ||
            changedFromPlan
          );
        });

      if (!hasActivity) return;

      const draft: WorkoutDraft = {
        id: `draft-${currentPlan.id}`,
        planId: currentPlan.id,
        planTitle: currentPlan.title,
        stablePlanKey: currentPlan.title
          .toLocaleLowerCase('da-DK')
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '')
          .slice(0, 120),
        planIdAliases: [currentPlan.id],
        workoutDate,
        sessionSeconds: seconds,
        lastUpdated: new Date().toISOString(),
        exercises: exercisesToSave,
        timers,
      };

      try {
        const persistedDraft = await StorageService.saveWorkoutDraft(draft);
        setOngoingDrafts((prev) => [persistedDraft, ...prev.filter((d) => d.id !== persistedDraft.id)]);
        setLastSavedTime(
          new Date().toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' })
        );
      } catch (err) {
        console.warn('Auto-save draft failed', err);
      }
    },
    [currentPlan, workoutDate, timers]
  );

  // Debounce auto-saving draft on changes
  useEffect(() => {
    if (!isDraftLoaded || sessionExercises.length === 0) return;

    const timer = setTimeout(() => {
      saveDraftToStorage(sessionExercises, sessionSeconds);
    }, 800);

    return () => clearTimeout(timer);
  }, [sessionExercises, sessionSeconds, isDraftLoaded, saveDraftToStorage]);

  const formatTimer = (totalSec: number) => {
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const toggleExerciseTimer = (exerciseId: string) => {
    if (!isSessionTimerRunning && sessionSeconds === 0) {
      setIsSessionTimerRunning(true);
    }

    setTimers((prev) => {
      const current = prev[exerciseId] || { seconds: 0, isRunning: false };
      return {
        ...prev,
        [exerciseId]: {
          seconds: current.seconds,
          isRunning: !current.isRunning,
        },
      };
    });
  };

  const resetExerciseTimer = (exerciseId: string) => {
    setTimers((prev) => ({
      ...prev,
      [exerciseId]: { seconds: 0, isRunning: false },
    }));
  };

  const updateExerciseField = (exerciseId: string, field: keyof PlanExercise, value: any) => {
    setSessionExercises((prev) =>
      prev.map((item) => (item.id === exerciseId ? { ...item, [field]: value } : item))
    );
  };

  const updateScoreResult = (exerciseId: string, round: number, field: 'score' | 'leftScore' | 'rightScore' | 'notes', value: any) => {
    setSessionExercises((prev) => prev.map((item) => {
      if (item.id !== exerciseId) return item;
      const totalRounds = Math.max(1, item.rounds || 1);
      const results = Array.from({ length: totalRounds }, (_, i) =>
        item.scoreResults?.find((r) => r.round === i + 1) || { round: i + 1 }
      );
      const idx = Math.max(0, round - 1);
      results[idx] = { ...results[idx], [field]: value };
      return { ...item, scoreResults: results };
    }));
  };

  const handleToggleComplete = (exerciseId: string) => {
    if (timers[exerciseId]?.isRunning) {
      setTimers((prev) => ({
        ...prev,
        [exerciseId]: { ...prev[exerciseId], isRunning: false },
      }));
    }

    setSkipReasonExerciseId(null);
    setSkipOtherText('');
    setSessionExercises((prev) =>
      prev.map((item) => {
        if (item.id === exerciseId) {
          const currentlyCompleted = item.executionStatus === 'completed' || item.isCompleted;
          const nextCompleted = !currentlyCompleted;
          return {
            ...item,
            isCompleted: nextCompleted,
            executionStatus: nextCompleted ? 'completed' : 'pending',
            skipReason: undefined,
            skipReasonText: undefined,
            completedAt: nextCompleted ? new Date().toISOString() : undefined,
            activeTimerSeconds: timers[exerciseId]?.seconds || item.activeTimerSeconds || 0,
          };
        }
        return item;
      })
    );
  };

  const markExerciseSkipped = (exerciseId: string, reason: 'time' | 'other', reasonText?: string) => {
    if (timers[exerciseId]?.isRunning) {
      setTimers((prev) => ({
        ...prev,
        [exerciseId]: { ...prev[exerciseId], isRunning: false },
      }));
    }
    setSessionExercises((prev) => prev.map((item) => item.id === exerciseId ? {
      ...item,
      isCompleted: false,
      executionStatus: 'skipped',
      skipReason: reason,
      skipReasonText: reason === 'other' ? (reasonText || '').trim() : undefined,
      completedAt: undefined,
      activeTimerSeconds: timers[exerciseId]?.seconds || item.activeTimerSeconds || 0,
    } : item));
    setSkipReasonExerciseId(null);
    setSkipOtherText('');
  };

  const restoreSkippedExercise = (exerciseId: string) => {
    setSessionExercises((prev) => prev.map((item) => item.id === exerciseId ? {
      ...item,
      executionStatus: 'pending',
      skipReason: undefined,
      skipReasonText: undefined,
      isCompleted: false,
    } : item));
  };

  const pendingExercises = sessionExercises.filter((e) => (e.executionStatus || (e.isCompleted ? 'completed' : 'pending')) === 'pending');
  const completedExercises = sessionExercises.filter((e) => (e.executionStatus || (e.isCompleted ? 'completed' : 'pending')) === 'completed');
  const skippedExercises = sessionExercises.filter((e) => e.executionStatus === 'skipped');

  const completedCount = completedExercises.length;
  const skippedCount = skippedExercises.length;
  const handledCount = completedCount + skippedCount;
  const totalCount = sessionExercises.length;
  const progressPercent = totalCount > 0 ? Math.round((handledCount / totalCount) * 100) : 0;

  // Explicit action: Pause and save draft for later
  const handlePauseAndSaveDraft = async () => {
    setIsSessionTimerRunning(false);
    // Pause any individual timers
    setTimers((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((k) => {
        next[k] = { ...next[k], isRunning: false };
      });
      return next;
    });

    await saveDraftToStorage(sessionExercises, sessionSeconds);
    if (onToast) {
      onToast('Træningspas er sat på pause og gemt som kladde! Du kan fortsætte når du vil.');
    } else {
      alert('Træningspas er sat på pause og gemt som kladde! Du kan fortsætte når som helst.');
    }
  };

  // Reset to plan defaults (start fresh)
  const handleResetToFresh = async () => {
    if (confirm('Vil du nulstille og starte dette træningspas forfra? Den nuværende kladde vil blive ryddet.')) {
      setIsSessionTimerRunning(false);
      setSessionSeconds(0);
      setTimers({});
      await StorageService.deleteWorkoutDraft(`draft-${currentPlan.id}`);
      setOngoingDrafts((prev) => prev.filter((d) => d.id !== `draft-${currentPlan.id}`));
      setDraftBannerVisible(false);

      if (currentPlan) {
        setSessionExercises(
          currentPlan.exercises.map((pe) => {
            const baseEx = allExercises.find((e) => e.id === pe.exerciseId);
            return {
              ...pe,
              imageUrl: baseEx?.imageUrl || pe.imageUrl,
              imagePosition: baseEx?.imagePosition || pe.imagePosition,
              isCompleted: false,
              executionStatus: 'pending',
              skipReason: undefined,
              skipReasonText: undefined,
              activeTimerSeconds: 0,
            };
          })
        );
      }
      if (onToast) onToast('Træningspas nulstillet til start');
    }
  };

  // User triggers "Gem træningspas"
  const handleFinishWorkoutClick = () => {
    if (handledCount === 0) {
      if (!confirm('Du har ikke markeret nogen øvelser som udført endnu. Vil du alligevel gemme dagens pas?')) {
        return;
      }
      completeAndSaveSession(false);
      return;
    }

    // If not all exercises are completed, prompt the user with choices
    if (handledCount < totalCount) {
      setShowPartialModal(true);
      return;
    }

    // All exercises completed
    completeAndSaveSession(false);
  };

  const calculateScoreSymmetry = (exercise: PlanExercise): number | undefined => {
    const left = (exercise.scoreResults || []).map((r) => r.leftScore).filter((v): v is number => typeof v === 'number');
    const right = (exercise.scoreResults || []).map((r) => r.rightScore).filter((v): v is number => typeof v === 'number');
    if (!left.length || !right.length) return undefined;
    const pick = (values: number[]) => exercise.lowerScoreIsBetter ? Math.min(...values) : Math.max(...values);
    const a = pick(left);
    const b = pick(right);
    if (a === 0 && b === 0) return 100;
    const max = Math.max(Math.abs(a), Math.abs(b));
    if (max === 0) return undefined;
    return Math.round((Math.min(Math.abs(a), Math.abs(b)) / max) * 1000) / 10;
  };

  // Complete and commit session to history & database
  const completeAndSaveSession = async (isPartial: boolean) => {
    setShowPartialModal(false);
    const completedTimestamp = Date.now();

    const logEntries: ExerciseLogEntry[] = sessionExercises
      .filter((e) => e.isCompleted)
      .map((e) => ({
        id: `log-${Date.now()}-${e.exerciseId}`,
        exerciseId: e.exerciseId,
        exerciseName: e.name,
        planId: currentPlan.id,
        planTitle: currentPlan.title,
        date: workoutDate,
        timestamp: completedTimestamp,
        separateLegs: !!e.separateLegs,
        sets: e.sets,
        reps: e.reps,
        weightKg: e.weightKg,
        leftLegWeightKg: e.leftLegWeightKg,
        leftLegReps: e.leftLegReps || e.reps,
        rightLegWeightKg: e.rightLegWeightKg,
        rightLegReps: e.rightLegReps || e.reps,
        durationSeconds: timers[e.id]?.seconds || e.activeTimerSeconds || undefined,
        notes: e.notes,
        trackingMode: e.trackingMode,
        scoreLabel: e.scoreLabel,
        scoreUnit: e.scoreUnit,
        lowerScoreIsBetter: e.lowerScoreIsBetter,
        scoreResults: e.scoreResults,
        lsiPercent: e.trackingMode === 'timed_score' ? calculateScoreSymmetry(e) : undefined,
      }));

    const session: CompletedSession = {
      id: `sess-${completedTimestamp}`,
      planId: currentPlan.id,
      planTitle: currentPlan.title,
      date: workoutDate,
      startedAt: new Date(completedTimestamp - sessionSeconds * 1000).toISOString(),
      completedAt: new Date(completedTimestamp).toISOString(),
      durationSeconds: sessionSeconds,
      exercisesCompletedCount: completedCount,
      exercisesSkippedCount: skippedCount,
      totalExercisesCount: totalCount,
      status: isPartial ? 'partial' : 'completed',
      isPartial: isPartial,
      entries: logEntries,
      remainingExercises: pendingExercises,
      skippedExercises: skippedExercises.map((e) => ({
        exerciseId: e.exerciseId,
        exerciseName: e.name,
        reason: e.skipReason || 'other',
        reasonText: e.skipReasonText,
      })),
    };

    // Clear active draft since session is logged
    await StorageService.deleteWorkoutDraft(`draft-${currentPlan.id}`);
    setOngoingDrafts((prev) => prev.filter((d) => d.id !== `draft-${currentPlan.id}`));
    setIsSessionTimerRunning(false);
    onCompleteWorkout(session);
  };

  const openImageModalForExercise = (planEx: PlanExercise) => {
    const fullEx = allExercises.find((e) => e.id === planEx.exerciseId) || {
      id: planEx.exerciseId,
      name: planEx.name,
      description: planEx.description,
      imageUrl: planEx.imageUrl,
      imagePosition: planEx.imagePosition,
      defaultSets: planEx.sets,
      defaultReps: planEx.reps,
      createdAt: new Date().toISOString(),
    };
    setExerciseForImageUpload(fullEx);
  };

  if (!currentPlan) {
    return (
      <div className="p-12 text-center bg-white border border-slate-200 rounded-2xl shadow-xs">
        <p className="text-slate-500">Ingen træningsplan fundet. Vælg eller opret en plan i Programmer.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {ongoingDrafts.length > 0 && (
        <div className="rounded-2xl bg-slate-50 border border-slate-200 text-slate-700 shadow-xs overflow-hidden">
          <button
            type="button"
            onClick={() => setShowDraftList((v) => !v)}
            className="w-full p-3.5 sm:p-4 flex items-center justify-between gap-3 text-left hover:bg-slate-100/70 transition-colors"
          >
            <div className="flex items-center gap-3 min-w-0">
              <BookmarkCheck className="w-5 h-5 text-slate-500 shrink-0" />
              <div className="min-w-0">
                <div className="font-bold text-xs text-slate-800">
                  {ongoingDrafts.length === 1 ? '1 gemt kladde' : `${ongoingDrafts.length} gemte kladder`}
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5 truncate">
                  Vælg selv hvilket uafsluttet træningspas du vil fortsætte.
                </p>
              </div>
            </div>
            <ChevronRight className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${showDraftList ? 'rotate-90' : ''}`} />
          </button>

          {showDraftList && (
            <div className="border-t border-slate-200 p-2 sm:p-3 space-y-2 bg-white">
              {[...ongoingDrafts]
                .sort((a, b) => new Date(b.lastUpdated).getTime() - new Date(a.lastUpdated).getTime())
                .map((draft) => {
                  const done = draft.exercises?.filter((e) => e.isCompleted).length || 0;
                  const total = draft.exercises?.length || 0;
                  const pct = total ? Math.round((done / total) * 100) : 0;
                  const updated = new Date(draft.lastUpdated).toLocaleString('da-DK', {
                    day: '2-digit',
                    month: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                  });
                  return (
                    <button
                      key={draft.id}
                      type="button"
                      onClick={() => openDraft(draft)}
                      className="w-full rounded-xl border border-slate-200 p-3 flex items-center justify-between gap-3 text-left hover:border-blue-300 hover:bg-blue-50/40 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-semibold text-sm text-slate-900 truncate">{draft.planTitle}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500">
                          <span>{done}/{total} øvelser</span>
                          <span>·</span>
                          <span>{pct}%</span>
                          <span>·</span>
                          <span>{draft.workoutDate ? new Date(`${draft.workoutDate}T12:00:00`).toLocaleDateString('da-DK') : 'Ingen dato'}</span>
                          <span>·</span>
                          <span>gemt {updated}</span>
                        </div>
                        <div className="mt-2 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                          <div className="h-full bg-blue-500 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                      </div>
                      <span className="shrink-0 px-2.5 py-1.5 rounded-lg bg-blue-600 text-white text-[11px] font-bold">
                        Åbn
                      </span>
                    </button>
                  );
                })}
            </div>
          )}
        </div>
      )}


      {/* 1. RESUME / ONGOING DRAFT REASSURANCE BANNER */}
      {draftBannerVisible && draftBannerMessage && (
        <div className="px-3 py-2.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <RotateCcw className="w-3.5 h-3.5 text-amber-700 shrink-0" />
            <div className="min-w-0">
              <div className="font-bold text-[11px] sm:text-xs">Kladde indlæst</div>
              <p className="text-[10px] sm:text-[11px] text-amber-800/85 truncate sm:whitespace-normal">{draftBannerMessage}</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 self-end sm:self-auto shrink-0">
            <button
              onClick={() => setDraftBannerVisible(false)}
              className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[11px] transition-colors"
            >
              Fortsæt
            </button>
            <button
              onClick={handleResetToFresh}
              className="px-2.5 py-1 rounded-lg bg-white hover:bg-amber-100 text-amber-900 font-semibold text-[11px] border border-amber-300 transition-colors"
              title="Nulstil og start helt forfra"
            >
              Start forfra
            </button>
          </div>
        </div>
      )}

      {/* 2. SESSION HEADER CARD */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-4 sm:p-6 relative overflow-hidden">
        {/* Blue accent top line */}
        <div className="absolute top-0 left-0 w-24 h-1 bg-blue-600 rounded-br-full" />

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          {/* Plan info & selector */}
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-semibold text-blue-600 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                Dagens Træningspas
              </span>
              <span className="text-xs text-slate-400">•</span>
              <span className="text-xs font-medium text-slate-500">
                {currentPlan.frequency || '3-4 gange ugentligt'}
              </span>
              {lastSavedTime && (
                <>
                  <span className="text-xs text-slate-400">•</span>
                  <span className="text-[11px] text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full font-medium flex items-center gap-1 border border-emerald-100">
                    <BookmarkCheck className="w-3 h-3 text-emerald-600" />
                    Kladde gemt ({lastSavedTime})
                  </span>
                </>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                {currentPlan.title}
              </h2>

              {plans.length > 1 && (
                <div className="flex items-center gap-1.5">
                  <select
                    id="plan-selector-dropdown"
                    value={activePlanId}
                    onChange={(e) => handleSwitchPlan(e.target.value)}
                    className="text-xs font-semibold bg-slate-50 text-slate-700 border border-slate-200 rounded-xl px-3 py-1.5 hover:bg-slate-100 transition-colors focus:outline-none focus:border-blue-500 max-w-[calc(100vw-4rem)] sm:max-w-sm"
                  >
                    {plans.map((p) => (
                      <option key={p.id} value={p.id}>
                        Skift: {p.title}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <p className="text-xs text-slate-500 max-w-xl">
              {currentPlan.description || 'Gennemfør øvelserne i dit eget tempo. Alt hvad du foretager dig gemmes automatisk, så du kan forlade og genoptage træningen når som helst.'}
            </p>
          </div>

          {/* Date, Session Timer & Action Controls */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Workout Date picker */}
            <div className="flex items-center gap-2 px-3.5 py-2 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-700">
              <Calendar className="w-4 h-4 text-blue-600" />
              <input
                type="date"
                value={workoutDate}
                onChange={(e) => setWorkoutDate(e.target.value)}
                className="bg-transparent font-medium text-slate-800 focus:outline-none text-xs"
              />
            </div>

            {/* Overall timer widget */}
            <div className="flex items-center gap-2 px-3.5 py-2 bg-slate-50 rounded-xl border border-slate-200">
              <Clock className="w-4 h-4 text-blue-600" />
              <span className="font-mono text-xs font-bold text-slate-900 tracking-wider">
                {formatTimer(sessionSeconds)}
              </span>
              <button
                type="button"
                onClick={() => setIsSessionTimerRunning((prev) => !prev)}
                className="p-1 text-slate-500 hover:text-blue-600 transition-colors"
                title={isSessionTimerRunning ? 'Pause træningsur' : 'Start træningsur'}
              >
                {isSessionTimerRunning ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
              </button>
              {sessionSeconds > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setIsSessionTimerRunning(false);
                    setSessionSeconds(0);
                  }}
                  className="p-1 text-slate-400 hover:text-rose-500 transition-colors"
                  title="Nulstil tid"
                >
                  <RotateCcw className="w-3 h-3" />
                </button>
              )}
            </div>

            {/* Pause & save draft button */}
            <button
              type="button"
              onClick={handlePauseAndSaveDraft}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors border border-slate-200"
              title="Pause uret og gem kladden, så du kan gå i gang igen senere"
            >
              <Pause className="w-3.5 h-3.5 text-slate-500" />
              <span>Pause & gem kladde</span>
            </button>

            {/* Finish Workout CTA */}
            <button
              id="btn-finish-workout-top"
              onClick={handleFinishWorkoutClick}
              className="inline-flex items-center gap-2 px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-all shadow-sm shadow-blue-600/30 cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>Gem træningspas ({handledCount}/{totalCount})</span>
            </button>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mt-5 pt-4 border-t border-slate-100 flex items-center gap-4">
          <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
            <div
              className="bg-blue-600 h-full rounded-full transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
          <span className="text-xs font-bold text-slate-700 whitespace-nowrap">
            {progressPercent}% registreret ({handledCount} af {totalCount})
          </span>
        </div>
      </div>

      {/* SECTION 1: MANGLER AT UDFØRE (Pending exercises) */}
      <div className="space-y-4">
        <div className="flex items-center justify-between px-1">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-slate-900 tracking-tight">
              Mangler at udføre
            </h3>
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600">
              {pendingExercises.length} øvelser
            </span>
          </div>
          <p className="text-xs text-slate-400">
            Registrér øvelsen som udført – eller vælg ikke udført
          </p>
        </div>

        {pendingExercises.length === 0 ? (
          <div className="bg-blue-50/50 border border-blue-100 rounded-2xl p-8 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-blue-600 text-white mx-auto flex items-center justify-center shadow-md shadow-blue-600/20">
              <Check className="w-6 h-6 stroke-[3]" />
            </div>
            <div>
              <h4 className="text-base font-bold text-slate-900">
                Alle øvelser i dagens pas er registreret!
              </h4>
              <p className="text-xs text-slate-600 mt-1 max-w-md mx-auto">
                Tryk på "Gem træningspas" nedenfor for at gemme dagens udførte og ikke udførte øvelser.
              </p>
            </div>
            <button
              onClick={handleFinishWorkoutClick}
              className="inline-flex items-center gap-2 px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all shadow-md shadow-blue-600/30"
            >
              <Save className="w-4 h-4" />
              <span>Gem træningspas og se resultat</span>
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {pendingExercises.map((exercise) => {
              const fullEx = allExercises.find((e) => e.id === exercise.exerciseId);
              const timerState = timers[exercise.id] || { seconds: 0, isRunning: false };

              return (
                <div
                  key={exercise.id}
                  id={`exercise-card-${exercise.id}`}
                  className="bg-white rounded-2xl border border-slate-200 shadow-xs hover:border-blue-300 transition-all overflow-hidden flex flex-col justify-between"
                >
                  <div className="p-5 space-y-4">
                    {/* Header: Title, Image, Target Area, Buttons */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-3 min-w-0">
                        {/* Exercise thumbnail with custom focal-point style */}
                        <div
                          onClick={() => openImageModalForExercise(exercise)}
                          className="relative group w-14 h-14 rounded-xl border border-slate-200 bg-slate-50 overflow-hidden shrink-0 cursor-pointer"
                          title="Klik for at ændre eller justere billede"
                        >
                          {exercise.imageUrl ? (
                            <img
                              src={exercise.imageUrl}
                              alt={exercise.name}
                              className="w-full h-full object-cover transition-transform group-hover:scale-105"
                              style={getExerciseImageStyle(
                                exercise.imagePosition || fullEx?.imagePosition
                              )}
                              referrerPolicy="no-referrer"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-slate-400">
                              <Dumbbell className="w-6 h-6" />
                            </div>
                          )}
                          <div className="absolute inset-0 bg-slate-950/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity">
                            <Camera className="w-4 h-4 text-white" />
                          </div>
                        </div>

                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-blue-50 text-blue-700">
                              {exercise.targetArea || fullEx?.targetArea || 'Knæ'}
                            </span>
                            {exercise.separateLegs && (
                              <span className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">
                                V / H opdelt
                              </span>
                            )}
                          </div>
                          <h4 className="text-sm font-bold text-slate-900 mt-1 truncate">
                            {exercise.name}
                          </h4>
                        </div>
                      </div>

                      {/* Small actions: Inspect progress, timer toggle */}
                      <div className="flex items-center gap-1 shrink-0">
                        {fullEx && (
                          <button
                            type="button"
                            onClick={() => setInspectExercise(fullEx)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-slate-50 transition-colors"
                            title="Se historisk fremgang"
                          >
                            <TrendingUp className="w-4 h-4" />
                          </button>
                        )}
                        {exercise.videoUrl && (
                          <a
                            href={exercise.videoUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-slate-50 transition-colors"
                            title="Se videoguide"
                          >
                            <ExternalLink className="w-4 h-4" />
                          </a>
                        )}
                      </div>
                    </div>

                    {/* Exercise description */}
                    <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
                      {exercise.description}
                    </p>

                    {/* Timer control for this individual exercise */}
                    <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100 text-xs">
                      <div className="flex items-center gap-2">
                        <Clock className="w-3.5 h-3.5 text-blue-600" />
                        <span className="text-slate-600 font-medium">Tid på øvelse:</span>
                        <span className="font-mono font-bold text-slate-900">
                          {formatTimer(timerState.seconds)}
                        </span>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => toggleExerciseTimer(exercise.id)}
                          className={`px-2 py-1 rounded-lg text-[11px] font-bold flex items-center gap-1 transition-colors ${
                            timerState.isRunning
                              ? 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                              : 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                          }`}
                        >
                          {timerState.isRunning ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                          {timerState.isRunning ? 'Pause' : 'Start'}
                        </button>
                        {timerState.seconds > 0 && (
                          <button
                            type="button"
                            onClick={() => resetExerciseTimer(exercise.id)}
                            className="p-1 text-slate-400 hover:text-rose-600 transition-colors"
                            title="Nulstil tid"
                          >
                            <RotateCcw className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Tracking inputs */}
                    {exercise.trackingMode === 'timed_score' ? (
                      <div className="space-y-3 pt-1 border-t border-slate-100">
                        <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-600">
                          {exercise.durationSeconds ? <span className="px-2 py-1 rounded-lg bg-blue-50 text-blue-700 font-semibold">{exercise.durationSeconds} sek. pr. runde</span> : <span className="px-2 py-1 rounded-lg bg-slate-100 font-semibold">Forsøg uden fast tid</span>}
                          <span className="px-2 py-1 rounded-lg bg-slate-100 font-semibold">{exercise.rounds || 1} runder/forsøg</span>
                          {!!exercise.restSeconds && <span className="px-2 py-1 rounded-lg bg-slate-100 font-semibold">{exercise.restSeconds} sek. pause</span>}
                          <span className="px-2 py-1 rounded-lg bg-emerald-50 text-emerald-700 font-semibold">Score: {exercise.scoreLabel || 'Score'} ({exercise.scoreUnit || '-'})</span>
                        </div>

                        <div className="space-y-2">
                          {Array.from({ length: Math.max(1, exercise.rounds || 1) }, (_, i) => {
                            const round = i + 1;
                            const result = exercise.scoreResults?.find((r) => r.round === round) || { round };
                            return (
                              <div key={round} className="p-2.5 rounded-xl bg-slate-50 border border-slate-200">
                                <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">Runde / forsøg {round}</div>
                                {exercise.scorePerSide || exercise.separateLegs ? (
                                  <div className="grid grid-cols-2 gap-2">
                                    <div>
                                      <label className="text-[10px] text-slate-500">Venstre ({exercise.scoreUnit || 'score'})</label>
                                      <input type="number" step="any" value={result.leftScore ?? ''} onChange={(e) => updateScoreResult(exercise.id, round, 'leftScore', e.target.value === '' ? undefined : Number(e.target.value))} className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold" />
                                    </div>
                                    <div>
                                      <label className="text-[10px] text-slate-500">Højre ({exercise.scoreUnit || 'score'})</label>
                                      <input type="number" step="any" value={result.rightScore ?? ''} onChange={(e) => updateScoreResult(exercise.id, round, 'rightScore', e.target.value === '' ? undefined : Number(e.target.value))} className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold" />
                                    </div>
                                  </div>
                                ) : (
                                  <div>
                                    <label className="text-[10px] text-slate-500">{exercise.scoreLabel || 'Score'} ({exercise.scoreUnit || '-'})</label>
                                    <input type="number" step="any" value={result.score ?? ''} onChange={(e) => updateScoreResult(exercise.id, round, 'score', e.target.value === '' ? undefined : Number(e.target.value))} className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold" />
                                  </div>
                                )}
                                <input type="text" value={result.notes || ''} onChange={(e) => updateScoreResult(exercise.id, round, 'notes', e.target.value)} placeholder="Note til denne runde (valgfri)" className="w-full mt-2 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-[11px]" />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2 pt-1 border-t border-slate-100">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5 cursor-pointer">
                            <input type="checkbox" checked={!!exercise.separateLegs} onChange={(e) => updateExerciseField(exercise.id, 'separateLegs', e.target.checked)} className="rounded text-blue-600 focus:ring-blue-500 w-3.5 h-3.5" />
                            <span>Opdel på venstre / højre ben</span>
                          </label>
                        </div>

                        {!exercise.separateLegs ? (
                          <div className="grid grid-cols-3 gap-2">
                            <div><span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Sæt</span><input type="number" min="1" value={exercise.sets} onChange={(e) => updateExerciseField(exercise.id, 'sets', parseInt(e.target.value) || 1)} className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-blue-500" /></div>
                            <div><span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Gentagelser</span><input type="text" value={exercise.reps} onChange={(e) => updateExerciseField(exercise.id, 'reps', e.target.value)} placeholder="10-15" className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-blue-500" /></div>
                            <div><span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Belastning (kg)</span><input type="number" step="0.5" min="0" value={exercise.weightKg ?? ''} onChange={(e) => updateExerciseField(exercise.id, 'weightKg', e.target.value === '' ? undefined : parseFloat(e.target.value))} placeholder="0 (krop)" className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-blue-500" /></div>
                          </div>
                        ) : (
                          <div className="grid grid-cols-2 gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                            <div className="bg-white p-2 sm:p-2.5 rounded-lg border border-slate-200 space-y-1.5"><span className="text-xs font-bold text-blue-700 block">Venstre (V)</span><div className="grid grid-cols-2 gap-1.5"><div><span className="text-[10px] font-bold text-slate-500 uppercase">Kg</span><input type="number" step="0.5" min="0" value={exercise.leftLegWeightKg ?? ''} onChange={(e) => updateExerciseField(exercise.id, 'leftLegWeightKg', e.target.value === '' ? undefined : parseFloat(e.target.value))} className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded text-xs font-semibold" /></div><div><span className="text-[10px] font-bold text-slate-500 uppercase">Reps</span><input type="text" value={exercise.leftLegReps || exercise.reps} onChange={(e) => updateExerciseField(exercise.id, 'leftLegReps', e.target.value)} className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded text-xs font-semibold" /></div></div></div>
                            <div className="bg-white p-2 sm:p-2.5 rounded-lg border border-slate-200 space-y-1.5"><span className="text-xs font-bold text-blue-700 block">Højre (H)</span><div className="grid grid-cols-2 gap-1.5"><div><span className="text-[10px] font-bold text-slate-500 uppercase">Kg</span><input type="number" step="0.5" min="0" value={exercise.rightLegWeightKg ?? ''} onChange={(e) => updateExerciseField(exercise.id, 'rightLegWeightKg', e.target.value === '' ? undefined : parseFloat(e.target.value))} className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded text-xs font-semibold" /></div><div><span className="text-[10px] font-bold text-slate-500 uppercase">Reps</span><input type="text" value={exercise.rightLegReps || exercise.reps} onChange={(e) => updateExerciseField(exercise.id, 'rightLegReps', e.target.value)} className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded text-xs font-semibold" /></div></div></div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Bottom Action: Note and Mark Complete */}
                    <div className="flex items-center justify-between gap-2 pt-1">
                      <input
                        type="text"
                        value={exercise.notes || ''}
                        onChange={(e) => updateExerciseField(exercise.id, 'notes', e.target.value)}
                        placeholder="Note (valgfri)..."
                        className="text-xs text-slate-700 placeholder-slate-400 bg-slate-50 hover:bg-slate-100/80 focus:bg-white px-2.5 py-1.5 rounded-lg border border-transparent focus:border-blue-400 focus:outline-none flex-1 min-w-0 transition-all"
                      />

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => { setSkipReasonExerciseId((id) => id === exercise.id ? null : exercise.id); setSkipOtherText(''); }}
                          className="px-2.5 py-1.5 rounded-xl bg-white hover:bg-slate-50 text-slate-600 border border-slate-200 text-xs font-semibold transition-colors flex items-center gap-1.5"
                        >
                          <Ban className="w-3.5 h-3.5" />
                          <span>Ikke udført</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleToggleComplete(exercise.id)}
                          className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-all shadow-xs shadow-blue-600/30 flex items-center gap-1.5 cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5 stroke-[3]" />
                          <span>Udført</span>
                        </button>
                      </div>
                    </div>

                    {skipReasonExerciseId === exercise.id && (
                      <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3 space-y-2">
                        <div className="text-[11px] font-bold text-amber-900">Hvorfor blev øvelsen ikke udført?</div>
                        <div className="flex flex-wrap gap-2">
                          <button type="button" onClick={() => markExerciseSkipped(exercise.id, 'time')} className="px-3 py-1.5 rounded-lg bg-white border border-amber-300 text-amber-900 text-xs font-semibold hover:bg-amber-100">Tid</button>
                          <button type="button" onClick={() => setSkipOtherText((v) => v || ' ')} className="px-3 py-1.5 rounded-lg bg-white border border-amber-300 text-amber-900 text-xs font-semibold hover:bg-amber-100">Andet</button>
                        </div>
                        {skipOtherText !== '' && (
                          <div className="flex flex-col sm:flex-row gap-2">
                            <input
                              type="text"
                              autoFocus
                              value={skipOtherText.trimStart()}
                              onChange={(e) => setSkipOtherText(e.target.value)}
                              placeholder="Skriv hvorfor…"
                              className="flex-1 min-w-0 px-3 py-2 rounded-lg bg-white border border-amber-300 text-xs text-slate-800 focus:outline-none focus:border-amber-500"
                            />
                            <button
                              type="button"
                              disabled={!skipOtherText.trim()}
                              onClick={() => markExerciseSkipped(exercise.id, 'other', skipOtherText)}
                              className="px-3 py-2 rounded-lg bg-amber-600 disabled:opacity-40 text-white text-xs font-bold"
                            >
                              Gem begrundelse
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* SECTION 2: IKKE UDFØRT */}
      {skippedExercises.length > 0 && (
        <div className="space-y-3 pt-2">
          <div className="flex items-center gap-2 px-1">
            <h3 className="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-2">
              <Ban className="w-4 h-4 text-amber-600" />
              Ikke udført
            </h3>
            <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-800">{skippedCount}</span>
          </div>
          <div className="space-y-2">
            {skippedExercises.map((exercise) => (
              <div key={exercise.id} className="bg-white rounded-2xl border border-amber-200 p-3.5 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-bold text-slate-900 truncate">{exercise.name}</div>
                  <div className="text-xs text-amber-800 mt-0.5">
                    {exercise.skipReason === 'time' ? 'Begrundelse: Tid' : `Begrundelse: ${exercise.skipReasonText || 'Andet'}`}
                  </div>
                </div>
                <button type="button" onClick={() => restoreSkippedExercise(exercise.id)} className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 text-xs font-semibold shrink-0">Fortryd / Rediger</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SECTION 3: UDFØRT I DAG (Completed exercises) */}
      {completedExercises.length > 0 && (
        <div className="space-y-4 pt-4">
          <div className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-bold text-slate-900 tracking-tight flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                Udført i dag
              </h3>
              <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800">
                {completedExercises.length} færdige
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Disse øvelser registreres i logbogen og databasen
            </p>
          </div>

          <div className="space-y-3">
            {completedExercises.map((exercise) => (
              <div
                key={exercise.id}
                id={`exercise-completed-${exercise.id}`}
                className="bg-white rounded-2xl border border-emerald-200/90 shadow-xs p-4 flex items-center justify-between gap-4 transition-all"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                    <Check className="w-4 h-4 stroke-[3]" />
                  </div>
                  {exercise.imageUrl && (
                    <img
                      src={exercise.imageUrl}
                      alt={exercise.name}
                      className="w-12 h-12 rounded-xl border border-slate-100 hidden sm:block"
                      style={getExerciseImageStyle(
                        exercise.imagePosition ||
                          allExercises.find((e) => e.id === exercise.exerciseId)?.imagePosition
                      )}
                      referrerPolicy="no-referrer"
                    />
                  )}
                  <div>
                    <h4 className="text-sm font-bold text-slate-900">
                      {exercise.name}
                    </h4>
                    <p className="text-xs text-slate-600">
                      {exercise.trackingMode === 'timed_score' ? (
                        <span>{exercise.scoreResults?.length || 0} runder registreret · {exercise.scoreLabel || 'Score'} ({exercise.scoreUnit || '-'})</span>
                      ) : exercise.separateLegs ? (
                        <span>V: {exercise.leftLegWeightKg ?? 0} kg ({exercise.leftLegReps || exercise.reps}) • H: {exercise.rightLegWeightKg ?? 0} kg ({exercise.rightLegReps || exercise.reps})</span>
                      ) : (
                        <span>{exercise.sets} sæt × {exercise.reps} • {exercise.weightKg ? `${exercise.weightKg} kg` : 'Kropsvægt'}</span>
                      )}
                      {exercise.notes && <span className="italic ml-2 text-slate-400">"{exercise.notes}"</span>}
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => handleToggleComplete(exercise.id)}
                  className="px-3 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-600 text-xs font-semibold transition-colors shrink-0"
                >
                  Fortryd / Rediger
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* BOTTOM FINISH BAR */}
      <div className="p-5 rounded-2xl bg-white border border-slate-200 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <div className="font-bold text-sm text-slate-900">
            {handledCount === totalCount
              ? (skippedCount > 0 ? `Alle øvelser er registreret (${completedCount} udført, ${skippedCount} ikke udført)` : 'Alle øvelser er udført!')
              : `${handledCount} af ${totalCount} øvelser registreret i dette pas`}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            {handledCount === totalCount
              ? 'Tryk på knappen for at gemme og afslutte passet i databasen.'
              : 'Du kan gemme nu som delvist gennemført, eller sætte på pause og fortsætte senere.'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={handlePauseAndSaveDraft}
            className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors border border-slate-200"
          >
            Pause & gem kladde
          </button>

          <button
            type="button"
            onClick={handleFinishWorkoutClick}
            className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all shadow-md shadow-blue-600/25 flex items-center gap-2"
          >
            <Save className="w-4 h-4" />
            <span>Gem træningspas</span>
          </button>
        </div>
      </div>

      {/* PARTIAL COMPLETION MODAL */}
      {showPartialModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-md w-full p-6 shadow-2xl space-y-4 text-left relative animate-in fade-in zoom-in-95 duration-200">
            <button
              onClick={() => setShowPartialModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-700 p-1"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center shrink-0">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Uafsluttet træningspas
                </h3>
                <p className="text-xs text-slate-500">
                  Du har udført {completedCount} af {totalCount} øvelser i dag.
                </p>
              </div>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Hvad vil du gøre med dette træningspas? Vælg den løsning, der passer dig bedst:
            </p>

            <div className="space-y-2.5 pt-1">
              {/* Choice 1: Save as Partial */}
              <button
                type="button"
                onClick={() => completeAndSaveSession(true)}
                className="w-full text-left p-3.5 rounded-xl bg-amber-50/70 hover:bg-amber-100/80 border border-amber-200 transition-colors group"
              >
                <div className="font-bold text-xs text-amber-900 flex items-center justify-between">
                  <span>Gem som delvist gennemført pas</span>
                  <ArrowRight className="w-3.5 h-3.5 text-amber-700 transition-transform group-hover:translate-x-0.5" />
                </div>
                <p className="text-[11px] text-amber-800/80 mt-1">
                  Gemmer de {completedCount} øvelser i historikken med mærket "Delvis". Du kan altid åbne tabellen og klikke <strong>"Genoptag"</strong> for at gøre resten færdig!
                </p>
              </button>

              {/* Choice 2: Save as complete anyway */}
              <button
                type="button"
                onClick={() => completeAndSaveSession(false)}
                className="w-full text-left p-3.5 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 transition-colors group"
              >
                <div className="font-bold text-xs text-slate-800 flex items-center justify-between">
                  <span>Gem som fuldført pas alligevel</span>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-500 transition-transform group-hover:translate-x-0.5" />
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Hvis du er færdig for i dag og ikke ønsker at lave de resterende øvelser.
                </p>
              </button>

              {/* Choice 3: Keep active draft */}
              <button
                type="button"
                onClick={() => {
                  setShowPartialModal(false);
                  handlePauseAndSaveDraft();
                }}
                className="w-full text-left p-3.5 rounded-xl bg-slate-50 hover:bg-slate-100 border border-slate-200 transition-colors group"
              >
                <div className="font-bold text-xs text-slate-800 flex items-center justify-between">
                  <span>Pause & behold i Dagens Pas</span>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-500 transition-transform group-hover:translate-x-0.5" />
                </div>
                <p className="text-[11px] text-slate-500 mt-1">
                  Lukker appen midlertidigt uden at gemme i historikken. Du kan fortsætte direkte her i dag eller i morgen.
                </p>
              </button>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => setShowPartialModal(false)}
                className="w-full py-2 text-center text-xs font-semibold text-slate-500 hover:text-slate-800"
              >
                Fortryd og bliv i træningen
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modals */}
      {inspectExercise && (
        <ExerciseProgressModal
          exercise={inspectExercise}
          logs={allLogs}
          onClose={() => setInspectExercise(null)}
        />
      )}

      {exerciseForImageUpload && (
        <ImageUploadModal
          exercise={exerciseForImageUpload}
          onClose={() => setExerciseForImageUpload(null)}
          onSaveImage={async (updated) => {
            if (onUpdateExercise) {
              await onUpdateExercise(updated);
            }
            setSessionExercises((prev) =>
              prev.map((item) =>
                item.exerciseId === updated.id
                  ? { ...item, imageUrl: updated.imageUrl, imagePosition: updated.imagePosition }
                  : item
              )
            );
            setExerciseForImageUpload(null);
          }}
        />
      )}
    </div>
  );
};
