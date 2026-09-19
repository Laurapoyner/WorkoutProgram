import React, { useState, useEffect, useRef } from 'react';
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
} from 'lucide-react';
import { WorkoutPlan, PlanExercise, ExerciseLogEntry, CompletedSession, Exercise } from '../types';
import { ExerciseProgressModal } from './ExerciseProgressModal';
import { ImageUploadModal } from './ImageUploadModal';

interface ActiveWorkoutProps {
  plans: WorkoutPlan[];
  activePlanId: string;
  onChangePlan: (planId: string) => void;
  onCompleteWorkout: (session: CompletedSession) => void;
  allExercises: Exercise[];
  allLogs: ExerciseLogEntry[];
  onUpdateExercise?: (exercise: Exercise) => void;
}

export const ActiveWorkout: React.FC<ActiveWorkoutProps> = ({
  plans,
  activePlanId,
  onChangePlan,
  onCompleteWorkout,
  allExercises,
  allLogs,
  onUpdateExercise,
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

  // Modals
  const [inspectExercise, setInspectExercise] = useState<Exercise | null>(null);
  const [exerciseForImageUpload, setExerciseForImageUpload] = useState<Exercise | null>(null);

  // Initialize session exercises when current plan changes
  useEffect(() => {
    if (currentPlan) {
      setSessionExercises(
        currentPlan.exercises.map((pe) => {
          // match latest image from allExercises if available
          const baseEx = allExercises.find((e) => e.id === pe.exerciseId);
          return {
            ...pe,
            imageUrl: baseEx?.imageUrl || pe.imageUrl,
            isCompleted: false,
            activeTimerSeconds: 0,
          };
        })
      );
    }
  }, [currentPlan?.id, allExercises]);

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

  const handleFinishWorkout = () => {
    if (completedCount === 0) {
      if (!confirm('Du har ikke markeret nogen øvelser som udført endnu. Vil du alligevel gemme dagens pas?')) {
        return;
      }
    }

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
      entries: logEntries,
    };

    onCompleteWorkout(session);
    setIsSessionTimerRunning(false);
  };

  const openImageModalForExercise = (planEx: PlanExercise) => {
    const fullEx = allExercises.find((e) => e.id === planEx.exerciseId) || {
      id: planEx.exerciseId,
      name: planEx.name,
      description: planEx.description,
      imageUrl: planEx.imageUrl,
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
      {/* Session Header Card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 relative overflow-hidden">
        {/* Blue accent top line matching the ModuleX screenshot */}
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
                    onChange={(e) => onChangePlan(e.target.value)}
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
              {currentPlan.description || 'Gennemfør øvelserne nedenfor i dit eget tempo. Marker som udført undervejs.'}
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

            {/* Finish Workout CTA */}
            <button
              id="btn-finish-workout-top"
              onClick={handleFinishWorkout}
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
              onClick={handleFinishWorkout}
              className="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-sm shadow-blue-600/30 transition-all inline-flex items-center gap-2"
            >
              <Save className="w-4 h-4" />
              <span>Gennemfør og gem træningspas</span>
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {pendingExercises.map((exercise) => {
              const fullEx = allExercises.find((e) => e.id === exercise.exerciseId);
              const timerState = timers[exercise.id] || { seconds: 0, isRunning: false };

              return (
                <div
                  key={exercise.id}
                  id={`exercise-pending-${exercise.id}`}
                  className="bg-white rounded-2xl border border-slate-200 shadow-xs hover:border-blue-300 transition-all p-5 overflow-hidden flex flex-col md:flex-row gap-5"
                >
                  {/* Left: Exercise Image & Upload Button */}
                  <div className="w-full md:w-52 h-40 shrink-0 relative rounded-xl overflow-hidden bg-slate-100 border border-slate-100 group">
                    {exercise.imageUrl ? (
                      <img
                        src={exercise.imageUrl}
                        alt={exercise.name}
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-full h-full flex flex-col items-center justify-center text-slate-400 p-4 text-center">
                        <Dumbbell className="w-8 h-8 opacity-30 mb-1" />
                        <span className="text-[11px] font-medium text-slate-400">Intet billede</span>
                      </div>
                    )}

                    {/* Quick photo upload button */}
                    <button
                      type="button"
                      onClick={() => openImageModalForExercise(exercise)}
                      className="absolute bottom-2 right-2 px-2 py-1 rounded-lg bg-white/90 hover:bg-white text-blue-700 shadow-xs text-[11px] font-semibold flex items-center gap-1 transition-all"
                      title="Tilføj eller skift billede til øvelsen"
                    >
                      <Camera className="w-3 h-3" />
                      <span>{exercise.imageUrl ? 'Skift foto' : 'Tilføj foto'}</span>
                    </button>
                  </div>

                  {/* Middle: Details & inputs */}
                  <div className="flex-1 flex flex-col justify-between space-y-4">
                    <div>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <h4 className="text-base font-bold text-slate-900 tracking-tight">
                            {exercise.name}
                          </h4>
                          {exercise.targetArea && (
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600">
                              {exercise.targetArea}
                            </span>
                          )}
                        </div>

                        {/* Video / Progress link */}
                        <div className="flex items-center gap-2 text-xs">
                          {exercise.videoUrl && (
                            <a
                              href={exercise.videoUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-600 hover:text-blue-700 font-medium flex items-center gap-1"
                            >
                              <span>Video</span>
                              <ExternalLink className="w-3 h-3" />
                            </a>
                          )}
                          <button
                            type="button"
                            onClick={() => {
                              if (fullEx) setInspectExercise(fullEx);
                            }}
                            className="text-slate-500 hover:text-blue-600 font-medium flex items-center gap-1"
                          >
                            <TrendingUp className="w-3 h-3 text-blue-600" />
                            <span>Graf</span>
                          </button>
                        </div>
                      </div>

                      <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                        {exercise.description}
                      </p>
                    </div>

                    {/* Leg Differentiation Tabs (Samlet vs Hvert ben) */}
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-200/80 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex bg-white p-0.5 rounded-lg border border-slate-200 text-xs">
                          <button
                            type="button"
                            onClick={() => updateExerciseField(exercise.id, 'separateLegs', false)}
                            className={`px-3 py-1 rounded-md font-semibold transition-all ${
                              !exercise.separateLegs
                                ? 'bg-blue-600 text-white shadow-xs'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            Samlet for begge ben
                          </button>
                          <button
                            type="button"
                            onClick={() => updateExerciseField(exercise.id, 'separateLegs', true)}
                            className={`px-3 py-1 rounded-md font-semibold transition-all ${
                              exercise.separateLegs
                                ? 'bg-blue-600 text-white shadow-xs'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                          >
                            Separat for V & H ben
                          </button>
                        </div>

                        {/* Optional timer for exercise */}
                        <div className="flex items-center gap-1.5 text-xs text-slate-600">
                          <span className="font-mono font-bold text-slate-800">
                            {formatTimer(timerState.seconds)}
                          </span>
                          <button
                            type="button"
                            onClick={() => toggleExerciseTimer(exercise.id)}
                            className="p-1 rounded bg-white border border-slate-200 text-blue-600 hover:bg-blue-50"
                            title={timerState.isRunning ? 'Pause' : 'Start timer'}
                          >
                            {timerState.isRunning ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                          </button>
                          {timerState.seconds > 0 && (
                            <button
                              type="button"
                              onClick={() => resetExerciseTimer(exercise.id)}
                              className="p-1 text-slate-400 hover:text-rose-500"
                              title="Nulstil"
                            >
                              <RotateCcw className="w-2.5 h-2.5" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Inputs: Samlet vs Separat */}
                      {!exercise.separateLegs ? (
                        <div className="grid grid-cols-3 gap-3">
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-500 uppercase">
                              Sæt
                            </label>
                            <input
                              type="number"
                              min="1"
                              value={exercise.sets}
                              onChange={(e) =>
                                updateExerciseField(exercise.id, 'sets', parseInt(e.target.value, 10) || 1)
                              }
                              className="w-full mt-0.5 px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-900 focus:outline-none focus:border-blue-500"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-500 uppercase">
                              Gentagelser (Reps)
                            </label>
                            <input
                              type="text"
                              value={exercise.reps}
                              onChange={(e) => updateExerciseField(exercise.id, 'reps', e.target.value)}
                              placeholder="10-15"
                              className="w-full mt-0.5 px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-900 focus:outline-none focus:border-blue-500"
                            />
                          </div>
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-500 uppercase">
                              Vægt (kg)
                            </label>
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
                              placeholder="0 (kropsvægt)"
                              className="w-full mt-0.5 px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-900 focus:outline-none focus:border-blue-500"
                            />
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-2 gap-3 pt-1">
                          {/* Left leg */}
                          <div className="bg-white p-2.5 rounded-lg border border-slate-200 space-y-1.5">
                            <span className="text-xs font-bold text-blue-700 block">
                              🦵 Venstre ben (V)
                            </span>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <span className="text-[10px] text-slate-500">Vægt (kg)</span>
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
                                  placeholder="0 kg"
                                  className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded text-xs font-semibold"
                                />
                              </div>
                              <div>
                                <span className="text-[10px] text-slate-500">Reps</span>
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

                          {/* Right leg */}
                          <div className="bg-white p-2.5 rounded-lg border border-slate-200 space-y-1.5">
                            <span className="text-xs font-bold text-blue-700 block">
                              🦵 Højre ben (H)
                            </span>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <span className="text-[10px] text-slate-500">Vægt (kg)</span>
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
                                  placeholder="0 kg"
                                  className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded text-xs font-semibold"
                                />
                              </div>
                              <div>
                                <span className="text-[10px] text-slate-500">Reps</span>
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

                    {/* Bottom Action */}
                    <div className="flex items-center justify-between pt-1">
                      <input
                        type="text"
                        value={exercise.notes || ''}
                        onChange={(e) => updateExerciseField(exercise.id, 'notes', e.target.value)}
                        placeholder="Tilføj personlig note (fx let ømhed, godt træk)..."
                        className="text-xs text-slate-600 placeholder-slate-400 bg-transparent border-b border-transparent hover:border-slate-200 focus:border-blue-400 focus:outline-none flex-1 max-w-sm mr-3"
                      />

                      <button
                        type="button"
                        onClick={() => handleToggleComplete(exercise.id)}
                        className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-all shadow-sm shadow-blue-600/30 flex items-center gap-1.5 cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                        <span>Markér som udført</span>
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
                      className="w-12 h-12 rounded-xl object-cover border border-slate-100 hidden sm:block"
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
          onSaveImage={(updated) => {
            if (onUpdateExercise) {
              onUpdateExercise(updated);
            }
            // Also update local state
            setSessionExercises((prev) =>
              prev.map((item) =>
                item.exerciseId === updated.id ? { ...item, imageUrl: updated.imageUrl } : item
              )
            );
            setExerciseForImageUpload(null);
          }}
        />
      )}
    </div>
  );
};
