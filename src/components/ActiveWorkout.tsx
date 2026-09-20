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

  // Modals
  const [inspectExercise, setInspectExercise] = useState<Exercise | null>(null);
  const [exerciseForImageUpload, setExerciseForImageUpload] = useState<Exercise | null>(null);

  // Track if user has initialized to avoid overwriting ongoing progress
  const hasInitializedRef = useRef(false);

  // 1. Initial Load: Check for resumeSession or stored active draft
  useEffect(() => {
    async function initSession() {
      if (hasInitializedRef.current) return;

      // Case A: User explicitly clicked "Genoptag / Gør færdig" on a past session
      if (resumeSession) {
        hasInitializedRef.current = true;
        if (resumeSession.planId && resumeSession.planId !== activePlanId) {
          onChangePlan(resumeSession.planId);
        }

        const targetPlan = plans.find((p) => p.id === resumeSession.planId) || currentPlan;
        if (targetPlan) {
          const mapped = targetPlan.exercises.map((pe) => {
            const baseEx = allExercises.find((e) => e.id === pe.exerciseId);
            const loggedEntry = resumeSession.entries.find((e) => e.exerciseId === pe.exerciseId);

            if (loggedEntry) {
              return {
                ...pe,
                imageUrl: baseEx?.imageUrl || pe.imageUrl,
                imagePosition: baseEx?.imagePosition || pe.imagePosition,
                sets: loggedEntry.sets || pe.sets,
                reps: loggedEntry.reps || pe.reps,
                weightKg: loggedEntry.weightKg ?? pe.weightKg,
                separateLegs: loggedEntry.separateLegs ?? pe.separateLegs,
                leftLegWeightKg: loggedEntry.leftLegWeightKg ?? pe.leftLegWeightKg,
                leftLegReps: loggedEntry.leftLegReps ?? pe.leftLegReps,
                rightLegWeightKg: loggedEntry.rightLegWeightKg ?? pe.rightLegWeightKg,
                rightLegReps: loggedEntry.rightLegReps ?? pe.rightLegReps,
                notes: loggedEntry.notes ?? pe.notes,
                isCompleted: true,
                activeTimerSeconds: loggedEntry.durationSeconds || 0,
              };
            }

            return {
              ...pe,
              imageUrl: baseEx?.imageUrl || pe.imageUrl,
              imagePosition: baseEx?.imagePosition || pe.imagePosition,
              isCompleted: false,
              activeTimerSeconds: 0,
            };
          });

          setSessionExercises(mapped);
          setSessionSeconds(resumeSession.durationSeconds || 0);
          setWorkoutDate(new Date().toISOString().split('T')[0]);
          setDraftBannerMessage(
            `Genoptaget pas fra ${new Date(resumeSession.date).toLocaleDateString('da-DK')}: De allerede udførte øvelser er markeret med flueben. Færdiggør de resterende herunder!`
          );
          setDraftBannerVisible(true);
          setIsDraftLoaded(true);

          if (onClearResumeSession) onClearResumeSession();
          return;
        }
      }

      // Case B: Check for automatic active draft in the shared MongoDB database
      try {
        const draft = await StorageService.getActiveWorkoutDraft();
        if (draft && draft.exercises && draft.exercises.length > 0) {
          // Check if draft has some meaningful progress
          const hasProgress =
            draft.sessionSeconds > 0 ||
            draft.exercises.some(
              (e) =>
                e.isCompleted ||
                (e.notes && e.notes.length > 0) ||
                (e.weightKg !== undefined && e.weightKg > 0) ||
                (e.leftLegWeightKg !== undefined && e.leftLegWeightKg > 0) ||
                (e.rightLegWeightKg !== undefined && e.rightLegWeightKg > 0)
            );

          if (hasProgress) {
            hasInitializedRef.current = true;
            if (draft.planId && draft.planId !== activePlanId) {
              onChangePlan(draft.planId);
            }

            // Merge image positions from current allExercises in case images were updated
            const refreshedDraftExercises = draft.exercises.map((pe) => {
              const baseEx = allExercises.find((e) => e.id === pe.exerciseId);
              return {
                ...pe,
                imageUrl: baseEx?.imageUrl || pe.imageUrl,
                imagePosition: baseEx?.imagePosition || pe.imagePosition,
              };
            });

            setSessionExercises(refreshedDraftExercises);
            setSessionSeconds(draft.sessionSeconds || 0);
            if (draft.workoutDate) setWorkoutDate(draft.workoutDate);
            if (draft.timers) setTimers(draft.timers);

            const updatedTime = draft.lastUpdated
              ? new Date(draft.lastUpdated).toLocaleTimeString('da-DK', {
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : 'for nylig';

            const doneCount = refreshedDraftExercises.filter((e) => e.isCompleted).length;
            setDraftBannerMessage(
              `Uafsluttet træningspas fundet (${doneCount} af ${refreshedDraftExercises.length} øvelser udført • gemt kl. ${updatedTime}). Du kan fortsætte hvor du slap!`
            );
            setDraftBannerVisible(true);
            setIsDraftLoaded(true);
            return;
          }
        }
      } catch (err) {
        console.warn('Error reading active draft', err);
      }

      // Case C: Fresh initial workout from currentPlan
      if (currentPlan) {
        hasInitializedRef.current = true;
        setSessionExercises(
          currentPlan.exercises.map((pe) => {
            const baseEx = allExercises.find((e) => e.id === pe.exerciseId);
            return {
              ...pe,
              imageUrl: baseEx?.imageUrl || pe.imageUrl,
              imagePosition: baseEx?.imagePosition || pe.imagePosition,
              isCompleted: false,
              activeTimerSeconds: 0,
            };
          })
        );
        setIsDraftLoaded(true);
      }
    }

    initSession();
  }, [resumeSession, activePlanId, allExercises]);

  // When changing plan manually (and not in initial resume/draft load)
  const handleSwitchPlan = (newPlanId: string) => {
    onChangePlan(newPlanId);
    const plan = plans.find((p) => p.id === newPlanId);
    if (plan) {
      setSessionExercises(
        plan.exercises.map((pe) => {
          const baseEx = allExercises.find((e) => e.id === pe.exerciseId);
          return {
            ...pe,
            imageUrl: baseEx?.imageUrl || pe.imageUrl,
            imagePosition: baseEx?.imagePosition || pe.imagePosition,
            isCompleted: false,
            activeTimerSeconds: 0,
          };
        })
      );
      setDraftBannerVisible(false);
      StorageService.clearActiveWorkoutDraft();
    }
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
        exercisesToSave.some(
          (e) =>
            e.isCompleted ||
            (e.notes && e.notes.length > 0) ||
            (e.weightKg !== undefined && e.weightKg > 0) ||
            (e.leftLegWeightKg !== undefined && e.leftLegWeightKg > 0) ||
            (e.rightLegWeightKg !== undefined && e.rightLegWeightKg > 0)
        );

      if (!hasActivity) return;

      const draft: WorkoutDraft = {
        planId: currentPlan.id,
        planTitle: currentPlan.title,
        workoutDate,
        sessionSeconds: seconds,
        lastUpdated: new Date().toISOString(),
        exercises: exercisesToSave,
        timers,
      };

      try {
        await StorageService.saveActiveWorkoutDraft(draft);
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

  const handleToggleComplete = (exerciseId: string) => {
    if (timers[exerciseId]?.isRunning) {
      setTimers((prev) => ({
        ...prev,
        [exerciseId]: { ...prev[exerciseId], isRunning: false },
      }));
    }

    setSessionExercises((prev) =>
      prev.map((item) => {
        if (item.id === exerciseId) {
          const nextCompleted = !item.isCompleted;
          return {
            ...item,
            isCompleted: nextCompleted,
            completedAt: nextCompleted ? new Date().toISOString() : undefined,
            activeTimerSeconds: timers[exerciseId]?.seconds || item.activeTimerSeconds || 0,
          };
        }
        return item;
      })
    );
  };

  const pendingExercises = sessionExercises.filter((e) => !e.isCompleted);
  const completedExercises = sessionExercises.filter((e) => e.isCompleted);

  const completedCount = completedExercises.length;
  const totalCount = sessionExercises.length;
  const progressPercent = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

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
      await StorageService.clearActiveWorkoutDraft();
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
    if (completedCount === 0) {
      if (!confirm('Du har ikke markeret nogen øvelser som udført endnu. Vil du alligevel gemme dagens pas?')) {
        return;
      }
      completeAndSaveSession(false);
      return;
    }

    // If not all exercises are completed, prompt the user with choices
    if (completedCount < totalCount) {
      setShowPartialModal(true);
      return;
    }

    // All exercises completed
    completeAndSaveSession(false);
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
      totalExercisesCount: totalCount,
      status: isPartial ? 'partial' : 'completed',
      isPartial: isPartial,
      entries: logEntries,
      remainingExercises: pendingExercises,
    };

    // Clear active draft since session is logged
    await StorageService.clearActiveWorkoutDraft();
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
      {/* 1. RESUME / ONGOING DRAFT REASSURANCE BANNER */}
      {draftBannerVisible && draftBannerMessage && (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-in fade-in duration-300">
          <div className="flex items-start gap-3">
            <div className="w-8 h-8 rounded-xl bg-amber-200/80 flex items-center justify-center text-amber-800 shrink-0 mt-0.5 sm:mt-0">
              <RotateCcw className="w-4 h-4" />
            </div>
            <div>
              <div className="font-bold text-xs flex items-center gap-2">
                <span>Igangværende træningspas indlæst</span>
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
              </div>
              <p className="text-xs text-amber-800/90 mt-0.5">{draftBannerMessage}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
            <button
              onClick={() => setDraftBannerVisible(false)}
              className="px-3 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shadow-xs transition-colors"
            >
              Fortsæt her
            </button>
            <button
              onClick={handleResetToFresh}
              className="px-2.5 py-1.5 rounded-xl bg-white hover:bg-amber-100 text-amber-900 font-semibold text-xs border border-amber-300 transition-colors"
              title="Nulstil og start helt forfra"
            >
              Start forfra
            </button>
          </div>
        </div>
      )}

      {/* 2. SESSION HEADER CARD */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 relative overflow-hidden">
        {/* Blue accent top line */}
        <div className="absolute top-0 left-0 w-24 h-1 bg-blue-600 rounded-br-full" />

        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
          {/* Plan info & selector */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
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
              <h2 className="text-2xl font-bold text-slate-900 tracking-tight">
                {currentPlan.title}
              </h2>

              {plans.length > 1 && (
                <div className="flex items-center gap-1.5">
                  <select
                    id="plan-selector-dropdown"
                    value={activePlanId}
                    onChange={(e) => handleSwitchPlan(e.target.value)}
                    className="text-xs font-semibold bg-slate-50 text-slate-700 border border-slate-200 rounded-xl px-3 py-1.5 hover:bg-slate-100 transition-colors focus:outline-none focus:border-blue-500"
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
              <span>Gem træningspas ({completedCount}/{totalCount})</span>
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
            {progressPercent}% gennemført ({completedCount} af {totalCount})
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
            Angiv belastning og tryk på "Markér som udført"
          </p>
        </div>

        {pendingExercises.length === 0 ? (
          <div className="bg-blue-50/50 border border-blue-100 rounded-2xl p-8 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-blue-600 text-white mx-auto flex items-center justify-center shadow-md shadow-blue-600/20">
              <Check className="w-6 h-6 stroke-[3]" />
            </div>
            <div>
              <h4 className="text-base font-bold text-slate-900">
                Alle øvelser i dagens pas er udført!
              </h4>
              <p className="text-xs text-slate-600 mt-1 max-w-md mx-auto">
                Fantastisk indsats! Tryk på "Gem træningspas" nedenfor for at logge din fremgang til databasen.
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

                    {/* Weight & Reps Input Section */}
                    <div className="space-y-2 pt-1 border-t border-slate-100">
                      {/* Separate legs checkbox toggle */}
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={!!exercise.separateLegs}
                            onChange={(e) => updateExerciseField(exercise.id, 'separateLegs', e.target.checked)}
                            className="rounded text-blue-600 focus:ring-blue-500 w-3.5 h-3.5"
                          />
                          <span>Opdel på venstre / højre ben</span>
                        </label>
                      </div>

                      {/* Standard weight and sets/reps input */}
                      {!exercise.separateLegs ? (
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                              Sæt
                            </span>
                            <input
                              type="number"
                              min="1"
                              value={exercise.sets}
                              onChange={(e) =>
                                updateExerciseField(exercise.id, 'sets', parseInt(e.target.value) || 1)
                              }
                              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-blue-500"
                            />
                          </div>

                          <div>
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                              Gentagelser
                            </span>
                            <input
                              type="text"
                              value={exercise.reps}
                              onChange={(e) => updateExerciseField(exercise.id, 'reps', e.target.value)}
                              placeholder="10-15"
                              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-blue-500"
                            />
                          </div>

                          <div>
                            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">
                              Belastning (kg)
                            </span>
                            <input
                              type="number"
                              step="0.5"
                              min="0"
                              value={exercise.weightKg ?? ''}
                              onChange={(e) =>
                                updateExerciseField(
                                  exercise.id,
                                  'weightKg',
                                  e.target.value === '' ? undefined : parseFloat(e.target.value)
                                )
                              }
                              placeholder="0 (krop)"
                              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-blue-500"
                            />
                          </div>
                        </div>
                      ) : (
                        /* Unilateral left/right leg separate inputs */
                        <div className="grid grid-cols-2 gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
                          <div className="bg-white p-2 sm:p-2.5 rounded-lg border border-slate-200 space-y-1.5">
                            <span className="text-xs font-bold text-blue-700 block truncate">
                              Venstre (V)
                            </span>
                            <div className="grid grid-cols-2 gap-1.5">
                              <div>
                                <span className="h-4 flex items-center text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-0.5 truncate">
                                  Kg
                                </span>
                                <input
                                  type="number"
                                  step="0.5"
                                  min="0"
                                  value={exercise.leftLegWeightKg ?? ''}
                                  onChange={(e) =>
                                    updateExerciseField(
                                      exercise.id,
                                      'leftLegWeightKg',
                                      e.target.value === '' ? undefined : parseFloat(e.target.value)
                                    )
                                  }
                                  placeholder="0"
                                  className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded text-xs font-semibold"
                                />
                              </div>
                              <div>
                                <span className="h-4 flex items-center text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-0.5 truncate">
                                  Reps
                                </span>
                                <input
                                  type="text"
                                  value={exercise.leftLegReps || exercise.reps}
                                  onChange={(e) =>
                                    updateExerciseField(exercise.id, 'leftLegReps', e.target.value)
                                  }
                                  placeholder="10-15"
                                  className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded text-xs font-semibold"
                                />
                              </div>
                            </div>
                          </div>

                          <div className="bg-white p-2 sm:p-2.5 rounded-lg border border-slate-200 space-y-1.5">
                            <span className="text-xs font-bold text-blue-700 block truncate">
                              Højre (H)
                            </span>
                            <div className="grid grid-cols-2 gap-1.5">
                              <div>
                                <span className="h-4 flex items-center text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-0.5 truncate">
                                  Kg
                                </span>
                                <input
                                  type="number"
                                  step="0.5"
                                  min="0"
                                  value={exercise.rightLegWeightKg ?? ''}
                                  onChange={(e) =>
                                    updateExerciseField(
                                      exercise.id,
                                      'rightLegWeightKg',
                                      e.target.value === '' ? undefined : parseFloat(e.target.value)
                                    )
                                  }
                                  placeholder="0"
                                  className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded text-xs font-semibold"
                                />
                              </div>
                              <div>
                                <span className="h-4 flex items-center text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-0.5 truncate">
                                  Reps
                                </span>
                                <input
                                  type="text"
                                  value={exercise.rightLegReps || exercise.reps}
                                  onChange={(e) =>
                                    updateExerciseField(exercise.id, 'rightLegReps', e.target.value)
                                  }
                                  placeholder="10-15"
                                  className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded text-xs font-semibold"
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Bottom Action: Note and Mark Complete */}
                    <div className="flex items-center justify-between gap-2 pt-1">
                      <input
                        type="text"
                        value={exercise.notes || ''}
                        onChange={(e) => updateExerciseField(exercise.id, 'notes', e.target.value)}
                        placeholder="Note (valgfri)..."
                        className="text-xs text-slate-700 placeholder-slate-400 bg-slate-50 hover:bg-slate-100/80 focus:bg-white px-2.5 py-1.5 rounded-lg border border-transparent focus:border-blue-400 focus:outline-none flex-1 min-w-0 transition-all"
                      />

                      <button
                        type="button"
                        onClick={() => handleToggleComplete(exercise.id)}
                        className="px-3.5 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-all shadow-xs shadow-blue-600/30 flex items-center gap-1.5 shrink-0 cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                        <span>Udført</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* SECTION 2: UDFØRT I DAG (Completed exercises) */}
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
                      {exercise.separateLegs ? (
                        <span>
                          V: {exercise.leftLegWeightKg ?? 0} kg ({exercise.leftLegReps || exercise.reps}) • H:{' '}
                          {exercise.rightLegWeightKg ?? 0} kg ({exercise.rightLegReps || exercise.reps})
                        </span>
                      ) : (
                        <span>
                          {exercise.sets} sæt × {exercise.reps} • {exercise.weightKg ? `${exercise.weightKg} kg` : 'Kropsvægt'}
                        </span>
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
            {completedCount === totalCount
              ? 'Alle øvelser er udført!'
              : `${completedCount} af ${totalCount} øvelser udført i dette pas`}
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            {completedCount === totalCount
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
