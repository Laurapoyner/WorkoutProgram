import React, { useState, useMemo } from 'react';
import {
  Plus,
  Calendar,
  Layers,
  Dumbbell,
  Check,
  Trash2,
  Play,
  Clock,
  ChevronRight,
  ExternalLink,
  Edit2,
  Sparkles,
  Search,
  ChevronDown,
  Filter,
  CheckCheck,
  X,
} from 'lucide-react';
import { WorkoutPlan, Exercise, PlanExercise } from '../types';
import { getExerciseImageStyle } from '../utils/imageStyle';
import { AddExerciseModal } from './AddExerciseModal';
import { ExorLivePdfImportModal } from './ExorLivePdfImportModal';

interface PlanManagerProps {
  plans: WorkoutPlan[];
  exercises: Exercise[];
  activePlanId: string;
  onSelectPlanToWorkOut: (planId: string) => void;
  onSavePlan: (plan: WorkoutPlan) => void;
  onDeletePlan: (planId: string) => void;
  onSaveExercise: (exercise: Exercise) => Promise<void> | void;
}

export const PlanManager: React.FC<PlanManagerProps> = ({
  plans,
  exercises,
  activePlanId,
  onSelectPlanToWorkOut,
  onSavePlan,
  onDeletePlan,
  onSaveExercise,
}) => {
  const [editingPlan, setEditingPlan] = useState<WorkoutPlan | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [showExerciseSelector, setShowExerciseSelector] = useState(false);
  const [isCategoryMenuOpen, setIsCategoryMenuOpen] = useState(false);
  const [showCreateExercise, setShowCreateExercise] = useState(false);
  const [showPdfImport, setShowPdfImport] = useState(false);

  // Exercise selector modal filtering
  const [selectorCategory, setSelectorCategory] = useState<string>('alle');
  const [selectorSearch, setSelectorSearch] = useState<string>('');

  // Extract all unique categories with exercise counts
  const categoriesWithCount = useMemo(() => {
    const map = new Map<string, number>();
    exercises.forEach((ex) => {
      const cat = ex.targetArea?.trim() || 'Generelt';
      map.set(cat, (map.get(cat) || 0) + 1);
    });
    return Array.from(map.entries())
      .map(([category, count]) => ({ category, count }))
      .sort((a, b) => b.count - a.count);
  }, [exercises]);

  // New/Edit plan form state
  const [planTitle, setPlanTitle] = useState('');
  const [planDesc, setPlanDesc] = useState('');
  const [planFrequency, setPlanFrequency] = useState('3-4 gange om ugen');
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [dateInput, setDateInput] = useState('');
  const [planExercises, setPlanExercises] = useState<PlanExercise[]>([]);

  const startCreateNewPlan = () => {
    setIsCreatingNew(true);
    setEditingPlan(null);
    setPlanTitle('');
    setPlanDesc('');
    setPlanFrequency('3-4 gange om ugen');
    setSelectedDates([new Date().toISOString().split('T')[0]]);
    setPlanExercises([]);
    setIsCategoryMenuOpen(false);
  };

  const startCreatePlanByCategory = (categoryName: string) => {
    setIsCreatingNew(true);
    setEditingPlan(null);
    setPlanTitle(`Fokus: ${categoryName}`);
    setPlanDesc(`Målrettet genoptræning og muskelaktivering med fokus på ${categoryName.toLowerCase()}.`);
    setPlanFrequency('3-4 gange om ugen');
    setSelectedDates([new Date().toISOString().split('T')[0]]);

    // Find all exercises belonging to this category
    const matchingExercises = exercises.filter(
      (ex) => ex.targetArea?.trim().toLowerCase() === categoryName.trim().toLowerCase()
    );

    const initialPlanExercises: PlanExercise[] = matchingExercises.map((exercise) => ({
      id: `pe-${Date.now()}-${exercise.id}`,
      exerciseId: exercise.id,
      name: exercise.name,
      description: exercise.description,
      imageUrl: exercise.imageUrl,
      videoUrl: exercise.videoUrl,
      targetArea: exercise.targetArea,
      sets: exercise.defaultSets || 3,
      reps: exercise.defaultReps || '10-15',
      weightKg: exercise.defaultWeightKg ?? 0,
      separateLegs: exercise.isUnilateralByDefault ?? false,
      leftLegWeightKg: exercise.defaultWeightKg ?? 0,
      leftLegReps: exercise.defaultReps || '10-15',
      rightLegWeightKg: exercise.defaultWeightKg ?? 0,
      rightLegReps: exercise.defaultReps || '10-15',
    }));

    setPlanExercises(initialPlanExercises);
    setIsCategoryMenuOpen(false);
  };

  const handleAddAllFilteredExercises = (exercisesToAdd: Exercise[]) => {
    const newItems: PlanExercise[] = [];
    exercisesToAdd.forEach((ex) => {
      if (!planExercises.some((pe) => pe.exerciseId === ex.id)) {
        newItems.push({
          id: `pe-${Date.now()}-${ex.id}-${Math.random().toString(36).substring(2, 6)}`,
          exerciseId: ex.id,
          name: ex.name,
          description: ex.description,
          imageUrl: ex.imageUrl,
          imagePosition: ex.imagePosition,
          videoUrl: ex.videoUrl,
          targetArea: ex.targetArea,
          sets: ex.defaultSets || 3,
          reps: ex.defaultReps || '10-15',
          weightKg: ex.defaultWeightKg ?? 0,
          separateLegs: ex.isUnilateralByDefault ?? false,
          leftLegWeightKg: ex.defaultWeightKg ?? 0,
          leftLegReps: ex.defaultReps || '10-15',
          rightLegWeightKg: ex.defaultWeightKg ?? 0,
          rightLegReps: ex.defaultReps || '10-15',
          trackingMode: ex.trackingMode || 'sets_reps_weight',
          durationSeconds: ex.defaultDurationSeconds,
          rounds: ex.defaultRounds,
          restSeconds: ex.restSeconds,
          scoreLabel: ex.scoreLabel,
          scoreUnit: ex.scoreUnit,
          lowerScoreIsBetter: ex.lowerScoreIsBetter,
          scorePerSide: ex.scorePerSide,
        });
      }
    });
    setPlanExercises([...planExercises, ...newItems]);
  };

  const handleRemoveAllFilteredExercises = (exercisesToRemove: Exercise[]) => {
    const idsToRemove = new Set(exercisesToRemove.map((e) => e.id));
    setPlanExercises(planExercises.filter((pe) => !idsToRemove.has(pe.exerciseId)));
  };

  const startEditPlan = (plan: WorkoutPlan) => {
    setIsCreatingNew(false);
    setEditingPlan(plan);
    setPlanTitle(plan.title);
    setPlanDesc(plan.description || '');
    setPlanFrequency(plan.frequency || '3-4 gange om ugen');
    setSelectedDates(plan.scheduledDates || []);
    setPlanExercises([...plan.exercises]);
    setIsCategoryMenuOpen(false);
  };

  const handleAddDate = () => {
    if (!dateInput) return;
    if (!selectedDates.includes(dateInput)) {
      setSelectedDates([...selectedDates, dateInput].sort());
    }
    setDateInput('');
  };

  const handleRemoveDate = (date: string) => {
    setSelectedDates(selectedDates.filter((d) => d !== date));
  };

  const toggleExerciseInPlan = (exercise: Exercise) => {
    const existingIndex = planExercises.findIndex((pe) => pe.exerciseId === exercise.id);
    if (existingIndex >= 0) {
      setPlanExercises(planExercises.filter((_, idx) => idx !== existingIndex));
    } else {
      const newPlanEx: PlanExercise = {
        id: `pe-${Date.now()}-${exercise.id}`,
        exerciseId: exercise.id,
        name: exercise.name,
        description: exercise.description,
        imageUrl: exercise.imageUrl,
        imagePosition: exercise.imagePosition,
        videoUrl: exercise.videoUrl,
        targetArea: exercise.targetArea,
        sets: exercise.defaultSets || 3,
        reps: exercise.defaultReps || '10-15',
        weightKg: exercise.defaultWeightKg ?? 0,
        separateLegs: exercise.isUnilateralByDefault ?? false,
        leftLegWeightKg: exercise.defaultWeightKg ?? 0,
        leftLegReps: exercise.defaultReps || '10-15',
        rightLegWeightKg: exercise.defaultWeightKg ?? 0,
        rightLegReps: exercise.defaultReps || '10-15',
        trackingMode: exercise.trackingMode || 'sets_reps_weight',
        durationSeconds: exercise.defaultDurationSeconds,
        rounds: exercise.defaultRounds,
        restSeconds: exercise.restSeconds,
        scoreLabel: exercise.scoreLabel,
        scoreUnit: exercise.scoreUnit,
        lowerScoreIsBetter: exercise.lowerScoreIsBetter,
        scorePerSide: exercise.scorePerSide,
      };
      setPlanExercises([...planExercises, newPlanEx]);
    }
  };

  const handleUpdatePlanExercise = (
    index: number,
    field: keyof PlanExercise,
    value: any
  ) => {
    const updated = [...planExercises];
    updated[index] = { ...updated[index], [field]: value };
    setPlanExercises(updated);
  };

  const handleSavePlanForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!planTitle.trim()) return;

    const savedPlan: WorkoutPlan = {
      id: editingPlan ? editingPlan.id : `plan-${Date.now()}`,
      title: planTitle.trim(),
      description: planDesc.trim(),
      frequency: planFrequency.trim(),
      scheduledDates: selectedDates,
      exercises: planExercises,
      createdAt: editingPlan ? editingPlan.createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    onSavePlan(savedPlan);
    setEditingPlan(null);
    setIsCreatingNew(false);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner Card */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs relative overflow-hidden flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="absolute top-0 left-0 w-24 h-1 bg-blue-600 rounded-br-full" />

        <div className="pt-1">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">
              Træningsprogrammer & Planer
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
              {plans.length} aktive planer
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Definer sæt, gentagelser, planlagte ugedatoer og vælg om øvelser skal registreres samlet eller for hvert ben.
          </p>
        </div>

        {!isCreatingNew && !editingPlan && (
          <div className="flex flex-wrap items-center gap-2 shrink-0 relative">
            {/* Category dropdown button */}
            <div className="relative">
              <button
                type="button"
                id="btn-create-plan-by-category"
                onClick={() => setIsCategoryMenuOpen(!isCategoryMenuOpen)}
                className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 border border-blue-200 text-xs font-semibold transition-all cursor-pointer"
              >
                <Layers className="w-4 h-4 text-blue-600" />
                <span>Opret ud fra kategori</span>
                <ChevronDown className={`w-3.5 h-3.5 transition-transform ${isCategoryMenuOpen ? 'rotate-180' : ''}`} />
              </button>

              {isCategoryMenuOpen && (
                <div
                  id="category-plan-dropdown"
                  className="absolute right-0 mt-2 w-64 bg-white rounded-2xl shadow-xl border border-slate-200 py-2 z-30 animate-in fade-in slide-in-from-top-2 duration-150"
                >
                  <div className="px-3.5 py-2 border-b border-slate-100">
                    <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider block">
                      Vælg muskelgruppe / fokus:
                    </span>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Opretter automatisk en plan fyldt med øvelser fra den valgte kategori.
                    </p>
                  </div>

                  <div className="max-h-60 overflow-y-auto py-1">
                    {categoriesWithCount.map((cat) => (
                      <button
                        key={cat.category}
                        type="button"
                        onClick={() => startCreatePlanByCategory(cat.category)}
                        className="w-full px-3.5 py-2.5 text-left text-xs hover:bg-blue-50/70 hover:text-blue-700 flex items-center justify-between transition-colors group"
                      >
                        <span className="font-semibold text-slate-800 group-hover:text-blue-700">
                          {cat.category}
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 group-hover:bg-blue-100 group-hover:text-blue-700 text-slate-600">
                          {cat.count} {cat.count === 1 ? 'øvelse' : 'øvelser'}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Standard New Plan button */}
            <button
              id="btn-create-new-plan"
              onClick={startCreateNewPlan}
              className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-all shadow-sm shadow-blue-600/30 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Opret tomt program</span>
            </button>
          </div>
        )}
      </div>

      {/* Plan Editor Form */}
      {(isCreatingNew || editingPlan) && (
        <form
          onSubmit={handleSavePlanForm}
          className="bg-white border border-slate-200 rounded-2xl p-6 shadow-xs space-y-6 relative overflow-hidden"
        >
          <div className="absolute top-0 left-0 w-32 h-1 bg-blue-600 rounded-br-full" />

          <div className="flex items-center justify-between pb-4 border-b border-slate-100">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                {isCreatingNew ? 'Opret ny træningsplan' : `Rediger plan: ${editingPlan?.title}`}
              </h3>
              <p className="text-xs text-slate-500">
                Vælg øvelser fra biblioteket, definer sæt/reps/vægt og angiv evt. individuel bensporing
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                setIsCreatingNew(false);
                setEditingPlan(null);
              }}
              className="px-3.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors"
            >
              Annuller
            </button>
          </div>

          {/* Basic info */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Planens titel *
              </label>
              <input
                type="text"
                required
                value={planTitle}
                onChange={(e) => setPlanTitle(e.target.value)}
                placeholder="fx Genoptræning for knæ eller Styrke pas A"
                className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-900 placeholder-slate-400 text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Hyppighed / Anbefaling
              </label>
              <input
                type="text"
                value={planFrequency}
                onChange={(e) => setPlanFrequency(e.target.value)}
                placeholder="fx 3-4 gange om ugen"
                className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-900 placeholder-slate-400 text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Beskrivelse / Fysioterapeut bemærkninger
              </label>
              <textarea
                rows={2}
                value={planDesc}
                onChange={(e) => setPlanDesc(e.target.value)}
                placeholder="fx Vejledning fra fysioterapeuten: rolige kontrollerede bevægelser..."
                className="w-full px-3.5 py-2 rounded-xl bg-white border border-slate-300 text-slate-900 placeholder-slate-400 text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 resize-none"
              />
            </div>
          </div>

          {/* Scheduled Dates */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/80 space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-blue-600" />
                Planlagte træningsdatoer
              </label>
              <span className="text-xs text-slate-500">
                Angiv datoer for hvornår øvelserne skal udføres
              </span>
            </div>

            <div className="flex gap-2">
              <input
                type="date"
                value={dateInput}
                onChange={(e) => setDateInput(e.target.value)}
                className="px-3.5 py-2 rounded-xl bg-white border border-slate-300 text-slate-900 text-xs focus:outline-none focus:border-blue-500"
              />
              <button
                type="button"
                onClick={handleAddDate}
                disabled={!dateInput}
                className="px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-colors disabled:opacity-40"
              >
                Tilføj dato
              </button>
            </div>

            {selectedDates.length > 0 ? (
              <div className="flex flex-wrap gap-2 pt-1">
                {selectedDates.map((date) => (
                  <span
                    key={date}
                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs bg-white text-slate-800 border border-slate-200 shadow-xs"
                  >
                    <span>
                      {new Date(date).toLocaleDateString('da-DK', {
                        weekday: 'short',
                        day: 'numeric',
                        month: 'short',
                      })}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveDate(date)}
                      className="text-slate-400 hover:text-rose-500 font-bold ml-0.5"
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500 italic">
                Ingen specifikke datoer tilføjet endnu (planen kan også udføres vilkårlig dag).
              </p>
            )}
          </div>

          {/* Exercises in this Plan */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                  <Dumbbell className="w-3.5 h-3.5 text-blue-600" />
                  Øvelser i planen ({planExercises.length})
                </h4>
                <p className="text-xs text-slate-500">
                  Definer parametre og vælg om ben skal spores samlet eller individuelt
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowExerciseSelector(true)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-blue-50 text-blue-700 border border-blue-200 hover:bg-blue-100 text-xs font-semibold transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Vælg fra bibliotek
                </button>
                <button type="button" onClick={() => setShowCreateExercise(true)} className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200 text-xs font-semibold">
                  <Plus className="w-3.5 h-3.5" /> Opret ny øvelse
                </button>
                <button type="button" onClick={() => setShowPdfImport(true)} className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 text-xs font-semibold">
                  Importer ExorLive PDF
                </button>
              </div>
            </div>

            {planExercises.length === 0 ? (
              <div className="p-8 text-center bg-slate-50 rounded-xl border border-dashed border-slate-300">
                <Dumbbell className="w-8 h-8 text-slate-400 mx-auto mb-2" />
                <p className="text-xs font-semibold text-slate-700">Ingen øvelser er tilføjet til planen endnu</p>
                <button
                  type="button"
                  onClick={() => setShowExerciseSelector(true)}
                  className="mt-3 px-4 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold"
                >
                  Åbn bibliotek for at tilføje øvelser
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {planExercises.map((pe, idx) => (
                  <div
                    key={pe.id || idx}
                    className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center shrink-0">
                          {idx + 1}
                        </span>
                        <div>
                          <h5 className="font-bold text-slate-900 text-sm">{pe.name}</h5>
                          <span className="text-xs text-blue-600 font-medium">{pe.targetArea}</span>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => {
                          setPlanExercises(planExercises.filter((_, i) => i !== idx));
                        }}
                        className="p-1 rounded text-slate-400 hover:text-rose-500 transition-colors"
                        title="Fjern fra plan"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    {pe.trackingMode === 'timed_score' && (
                      <div className="bg-white p-3 rounded-lg border border-blue-100 shadow-xs">
                        <div className="text-[10px] font-bold text-blue-700 uppercase mb-2">Tid / score</div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                          <div><label className="text-[10px] text-slate-500">Sekunder</label><input type="number" min="0" value={pe.durationSeconds ?? 0} onChange={(e) => handleUpdatePlanExercise(idx, 'durationSeconds', Number(e.target.value) || 0)} className="w-full px-2 py-1.5 rounded border border-slate-200 text-xs" /></div>
                          <div><label className="text-[10px] text-slate-500">Runder/forsøg</label><input type="number" min="1" value={pe.rounds ?? 1} onChange={(e) => handleUpdatePlanExercise(idx, 'rounds', Number(e.target.value) || 1)} className="w-full px-2 py-1.5 rounded border border-slate-200 text-xs" /></div>
                          <div><label className="text-[10px] text-slate-500">Pause sek.</label><input type="number" min="0" value={pe.restSeconds ?? 0} onChange={(e) => handleUpdatePlanExercise(idx, 'restSeconds', Number(e.target.value) || 0)} className="w-full px-2 py-1.5 rounded border border-slate-200 text-xs" /></div>
                          <div><label className="text-[10px] text-slate-500">Enhed</label><input value={pe.scoreUnit || ''} onChange={(e) => handleUpdatePlanExercise(idx, 'scoreUnit', e.target.value)} className="w-full px-2 py-1.5 rounded border border-slate-200 text-xs" /></div>
                        </div>
                      </div>
                    )}

                    {/* Leg selection checkbox */}
                    <div className="bg-white p-3 rounded-lg border border-slate-200 shadow-xs">
                      <label className="flex items-center gap-2.5 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={pe.separateLegs}
                          onChange={(e) =>
                            handleUpdatePlanExercise(idx, 'separateLegs', e.target.checked)
                          }
                          className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 accent-blue-600 cursor-pointer"
                        />
                        <span className="text-xs font-semibold text-slate-800">
                          Angiv vægt & gentagelser individuelt for hvert ben (Venstre / Højre)
                        </span>
                        <span className="text-[11px] text-slate-400 ml-auto hidden sm:inline">
                          {pe.separateLegs ? 'Separat' : 'Samlet for begge ben (standard)'}
                        </span>
                      </label>

                      {/* Inputs: Samlet (Standard) vs Individuelt */}
                      {pe.trackingMode !== 'timed_score' && (pe.separateLegs ? (
                        <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {/* Venstre ben */}
                          <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
                            <span className="text-xs font-bold text-blue-700 block">
                              Venstre ben (V)
                            </span>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="text-[10px] text-slate-500 block">Vægt (kg)</label>
                                <input
                                  type="number"
                                  step="0.5"
                                  min="0"
                                  value={pe.leftLegWeightKg ?? ''}
                                  onChange={(e) =>
                                    handleUpdatePlanExercise(
                                      idx,
                                      'leftLegWeightKg',
                                      e.target.value === '' ? 0 : parseFloat(e.target.value)
                                    )
                                  }
                                  placeholder="0 kg"
                                  className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-xs font-semibold text-slate-900"
                                />
                              </div>
                              <div>
                                <label className="text-[10px] text-slate-500 block">Gentagelser</label>
                                <input
                                  type="text"
                                  value={pe.leftLegReps || pe.reps}
                                  onChange={(e) =>
                                    handleUpdatePlanExercise(idx, 'leftLegReps', e.target.value)
                                  }
                                  placeholder="10-15"
                                  className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-xs font-semibold text-slate-900"
                                />
                              </div>
                            </div>
                          </div>

                          {/* Højre ben */}
                          <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 space-y-2">
                            <span className="text-xs font-bold text-blue-700 block">
                              Højre ben (H)
                            </span>
                            <div className="grid grid-cols-2 gap-2">
                              <div>
                                <label className="text-[10px] text-slate-500 block">Vægt (kg)</label>
                                <input
                                  type="number"
                                  step="0.5"
                                  min="0"
                                  value={pe.rightLegWeightKg ?? ''}
                                  onChange={(e) =>
                                    handleUpdatePlanExercise(
                                      idx,
                                      'rightLegWeightKg',
                                      e.target.value === '' ? 0 : parseFloat(e.target.value)
                                    )
                                  }
                                  placeholder="0 kg"
                                  className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-xs font-semibold text-slate-900"
                                />
                              </div>
                              <div>
                                <label className="text-[10px] text-slate-500 block">Gentagelser</label>
                                <input
                                  type="text"
                                  value={pe.rightLegReps || pe.reps}
                                  onChange={(e) =>
                                    handleUpdatePlanExercise(idx, 'rightLegReps', e.target.value)
                                  }
                                  placeholder="10-15"
                                  className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-xs font-semibold text-slate-900"
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-3 pt-3 border-t border-slate-100 grid grid-cols-3 gap-3">
                          <div>
                            <label className="text-[10px] font-semibold text-slate-500 block uppercase">
                              Sæt
                            </label>
                            <input
                              type="number"
                              min="1"
                              value={pe.sets}
                              onChange={(e) =>
                                handleUpdatePlanExercise(
                                  idx,
                                  'sets',
                                  parseInt(e.target.value, 10) || 1
                                )
                              }
                              className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-900"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-semibold text-slate-500 block uppercase">
                              Gentagelser
                            </label>
                            <input
                              type="text"
                              value={pe.reps}
                              onChange={(e) =>
                                handleUpdatePlanExercise(idx, 'reps', e.target.value)
                              }
                              placeholder="10-15"
                              className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-900"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-semibold text-slate-500 block uppercase">
                              Vægt (kg)
                            </label>
                            <input
                              type="number"
                              step="0.5"
                              min="0"
                              value={pe.weightKg ?? ''}
                              onChange={(e) =>
                                handleUpdatePlanExercise(
                                  idx,
                                  'weightKg',
                                  e.target.value === '' ? 0 : parseFloat(e.target.value)
                                )
                              }
                              placeholder="0 (krop)"
                              className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-900"
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => {
                setIsCreatingNew(false);
                setEditingPlan(null);
              }}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100"
            >
              Annuller
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-all shadow-sm shadow-blue-600/30 flex items-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              Gem træningsplan
            </button>
          </div>
        </form>
      )}

      {/* Plans List Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {plans.map((plan) => {
          const isActive = plan.id === activePlanId;
          const planCategories = Array.from(
            new Set(plan.exercises.map((pe) => pe.targetArea).filter(Boolean))
          );

          return (
            <div
              key={plan.id}
              className={`bg-white rounded-2xl border p-6 shadow-xs hover:shadow-md transition-all flex flex-col justify-between relative overflow-hidden ${
                isActive ? 'border-blue-500 ring-2 ring-blue-500/20' : 'border-slate-200'
              }`}
            >
              {isActive && (
                <div className="absolute top-0 left-0 w-24 h-1 bg-blue-600 rounded-br-full" />
              )}

              <div className="space-y-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-1.5 mb-1.5">
                      {isActive && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-600 text-white">
                          Aktiv i dag
                        </span>
                      )}
                      <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-700">
                        {plan.frequency || '3-4 gange ugentligt'}
                      </span>
                      {planCategories.map((cat) => (
                        <span
                          key={cat}
                          className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-100"
                        >
                          {cat}
                        </span>
                      ))}
                    </div>
                    <h3 className="text-base font-bold text-slate-900 tracking-tight">
                      {plan.title}
                    </h3>
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => startEditPlan(plan)}
                      className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
                      title="Rediger plan"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    {plans.length > 1 && (
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm(`Vil du slette planen "${plan.title}"?`)) {
                            onDeletePlan(plan.id);
                          }
                        }}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                        title="Slet plan"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                <p className="text-xs text-slate-500 line-clamp-2">
                  {plan.description || 'Ingen yderligere instruktioner.'}
                </p>

                {/* Exercises list preview */}
                <div className="space-y-2 pt-2 border-t border-slate-100">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block">
                    {plan.exercises.length} øvelser i programmet:
                  </span>
                  <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                    {plan.exercises.map((pe, i) => (
                      <div
                        key={pe.id || i}
                        className="flex items-center justify-between text-xs py-1 px-2.5 rounded-lg bg-slate-50 text-slate-700"
                      >
                        <span className="font-medium truncate mr-2">
                          {i + 1}. {pe.name}
                        </span>
                        <span className="text-[11px] text-slate-500 whitespace-nowrap font-mono">
                          {pe.sets}×{pe.reps}
                          {pe.separateLegs ? ' (V/H)' : pe.weightKg ? ` @ ${pe.weightKg}kg` : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Bottom CTA to start workout */}
              <div className="pt-5 border-t border-slate-100 flex items-center justify-between mt-4">
                <span className="text-xs text-slate-400">
                  {plan.scheduledDates?.length
                    ? `${plan.scheduledDates.length} planlagte datoer`
                    : 'Fleksibel udførelse'}
                </span>

                <button
                  type="button"
                  onClick={() => onSelectPlanToWorkOut(plan.id)}
                  className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition-all ${
                    isActive
                      ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-sm shadow-blue-600/30'
                      : 'bg-slate-100 hover:bg-blue-50 text-slate-800 hover:text-blue-700'
                  }`}
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>{isActive ? 'Start træning' : 'Vælg og start'}</span>
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {showCreateExercise && (
        <AddExerciseModal
          exercises={exercises}
          onClose={() => setShowCreateExercise(false)}
          onSave={async (exercise) => {
            await onSaveExercise(exercise);
            if (!planExercises.some((pe) => pe.exerciseId === exercise.id)) {
              toggleExerciseInPlan(exercise);
            }
            setShowCreateExercise(false);
          }}
        />
      )}

      {showPdfImport && (
        <ExorLivePdfImportModal
          exercises={exercises}
          onSaveExercise={onSaveExercise}
          onSavePlan={onSavePlan}
          onClose={() => setShowPdfImport(false)}
        />
      )}

      {/* Modal: Exercise Selector for Plan with Categories */}
      {showExerciseSelector && (() => {
        const filteredSelectorExercises = exercises.filter((ex) => {
          const matchesCategory =
            selectorCategory === 'alle' ||
            (ex.targetArea && ex.targetArea.toLowerCase() === selectorCategory.toLowerCase());

          const matchesSearch =
            !selectorSearch.trim() ||
            ex.name.toLowerCase().includes(selectorSearch.toLowerCase()) ||
            ex.description.toLowerCase().includes(selectorSearch.toLowerCase()) ||
            ex.targetArea?.toLowerCase().includes(selectorSearch.toLowerCase());

          return matchesCategory && matchesSearch;
        });

        return (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto"
            onClick={(e) => {
              if (e.target === e.currentTarget) setShowExerciseSelector(false);
            }}
          >
            <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-2xl overflow-hidden text-slate-900 my-8 flex flex-col max-h-[85vh]">
              <div className="h-1 bg-blue-600 w-full" />

              {/* Modal Header */}
              <div className="p-5 border-b border-slate-100 flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-slate-900">Vælg øvelser til planen</h3>
                  <p className="text-xs text-slate-500">
                    Filtrer efter kategori eller søg for hurtigt at sammensætte dit program
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
                    {planExercises.length} valgt
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowExerciseSelector(false)}
                    className="px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold cursor-pointer"
                  >
                    Færdig
                  </button>
                </div>
              </div>

              {/* Search & Category Filter Controls */}
              <div className="p-4 border-b border-slate-100 bg-slate-50/50 space-y-3">
                {/* Search field */}
                <div className="relative">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={selectorSearch}
                    onChange={(e) => setSelectorSearch(e.target.value)}
                    placeholder="Søg i øvelser efter navn eller nøgleord..."
                    className="w-full pl-9 pr-8 py-2 rounded-xl bg-white border border-slate-200 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                  />
                  {selectorSearch && (
                    <button
                      type="button"
                      onClick={() => setSelectorSearch('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Category Pills */}
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
                  <button
                    type="button"
                    onClick={() => setSelectorCategory('alle')}
                    className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-colors ${
                      selectorCategory === 'alle'
                        ? 'bg-blue-600 text-white shadow-xs'
                        : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    Alle ({exercises.length})
                  </button>
                  {categoriesWithCount.map((cat) => (
                    <button
                      key={cat.category}
                      type="button"
                      onClick={() => setSelectorCategory(cat.category)}
                      className={`px-3 py-1.5 rounded-lg font-medium whitespace-nowrap transition-colors ${
                        selectorCategory === cat.category
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {cat.category} ({cat.count})
                    </button>
                  ))}
                </div>

                {/* Batch Action Bar */}
                {filteredSelectorExercises.length > 0 && (
                  <div className="flex items-center justify-between text-xs pt-1">
                    <span className="text-slate-500 font-medium">
                      Viser {filteredSelectorExercises.length} af {exercises.length} øvelser
                    </span>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleAddAllFilteredExercises(filteredSelectorExercises)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-blue-50 text-blue-700 hover:bg-blue-100 font-medium text-[11px] transition-colors"
                      >
                        <CheckCheck className="w-3.5 h-3.5" />
                        Vælg alle ({filteredSelectorExercises.length})
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveAllFilteredExercises(filteredSelectorExercises)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-slate-100 text-slate-600 hover:bg-slate-200 font-medium text-[11px] transition-colors"
                      >
                        Fjern alle
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Exercises List */}
              <div className="p-4 overflow-y-auto space-y-2 max-h-[50vh]">
                {filteredSelectorExercises.length === 0 ? (
                  <div className="py-10 text-center text-slate-500">
                    <Dumbbell className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="text-xs font-semibold text-slate-700">Ingen øvelser matcher</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">
                      Prøv at vælge en anden kategori eller ryd søgefeltet.
                    </p>
                  </div>
                ) : (
                  filteredSelectorExercises.map((ex) => {
                    const isSelected = planExercises.some((pe) => pe.exerciseId === ex.id);

                    return (
                      <div
                        key={ex.id}
                        onClick={() => toggleExerciseInPlan(ex)}
                        className={`flex items-center justify-between p-3 rounded-xl cursor-pointer border transition-all ${
                          isSelected
                            ? 'bg-blue-50/70 border-blue-300 shadow-xs'
                            : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/60'
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 transition-colors ${
                              isSelected
                                ? 'bg-blue-600 border-blue-600 text-white'
                                : 'border-slate-300 bg-white'
                            }`}
                          >
                            {isSelected && <Check className="w-3.5 h-3.5 stroke-[3]" />}
                          </div>
                          {ex.imageUrl && (
                            <img
                              src={ex.imageUrl}
                              alt={ex.name}
                              className="w-11 h-11 rounded-lg border border-slate-200 hidden sm:block shrink-0"
                              style={getExerciseImageStyle(ex.imagePosition)}
                              referrerPolicy="no-referrer"
                            />
                          )}
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="text-sm font-bold text-slate-900">{ex.name}</h4>
                              <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-blue-50 text-blue-700 border border-blue-100">
                                {ex.targetArea}
                              </span>
                            </div>
                            <p className="text-xs text-slate-500 line-clamp-1 mt-0.5">
                              {ex.description}
                            </p>
                          </div>
                        </div>

                        <div className="text-right shrink-0 ml-3">
                          <span className="text-xs font-bold text-slate-700 font-mono block">
                            {ex.defaultSets} sæt × {ex.defaultReps}
                          </span>
                          {ex.isUnilateralByDefault && (
                            <span className="text-[10px] text-blue-600 font-semibold">
                              Hvert ben
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
