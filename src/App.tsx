/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import {
  Activity,
  Dumbbell,
  Layers,
  Calendar,
  Sparkles,
  CheckCircle2,
  Bell,
  Search,
  Plus,
  Menu,
  X,
  ChevronRight,
  Database,
  Cloud,
  Check,
  User,
  ShieldCheck,
} from 'lucide-react';
import { StorageService } from './db/storage';
import { Exercise, WorkoutPlan, ExerciseLogEntry, CompletedSession } from './types';
import { INITIAL_EXERCISES, INITIAL_PLANS, INITIAL_LOGS } from './db/defaultData';
import { ActiveWorkout } from './components/ActiveWorkout';
import { PlanManager } from './components/PlanManager';
import { ExerciseLibrary } from './components/ExerciseLibrary';
import { HistoryLogView } from './components/HistoryLogView';
import { AddExerciseModal } from './components/AddExerciseModal';

type TabType = 'active' | 'plans' | 'library' | 'history';

export default function App() {
  const [activeTab, setActiveTab] = useState<TabType>('active');
  const [isLoading, setIsLoading] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [globalSearch, setGlobalSearch] = useState('');
  const [isAddExerciseModalOpen, setIsAddExerciseModalOpen] = useState(false);

  // Core database state
  const [exercises, setExercises] = useState<Exercise[]>(INITIAL_EXERCISES);
  const [plans, setPlans] = useState<WorkoutPlan[]>(INITIAL_PLANS);
  const [logs, setLogs] = useState<ExerciseLogEntry[]>(INITIAL_LOGS);
  const [sessions, setSessions] = useState<CompletedSession[]>([]);
  const [activePlanId, setActivePlanId] = useState<string>('plan-kneerehab');

  // Success toast message
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Load from database on startup
  useEffect(() => {
    async function loadData() {
      try {
        await StorageService.init();
        const [loadedExercises, loadedPlans, loadedLogs, loadedSessions] = await Promise.all([
          StorageService.getExercises(),
          StorageService.getPlans(),
          StorageService.getLogs(),
          StorageService.getCompletedSessions(),
        ]);

        if (loadedExercises && loadedExercises.length > 0) setExercises(loadedExercises);
        if (loadedPlans && loadedPlans.length > 0) {
          setPlans(loadedPlans);
          setActivePlanId(loadedPlans[0].id);
        }
        if (loadedLogs && loadedLogs.length > 0) setLogs(loadedLogs);
        if (loadedSessions) setSessions(loadedSessions);
      } catch (err) {
        console.error('Error loading data from database', err);
      } finally {
        setIsLoading(false);
      }
    }

    loadData();
  }, []);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  // Handlers for plans
  const handleSavePlan = async (plan: WorkoutPlan) => {
    const existingIndex = plans.findIndex((p) => p.id === plan.id);
    let updatedPlans: WorkoutPlan[];
    if (existingIndex >= 0) {
      updatedPlans = [...plans];
      updatedPlans[existingIndex] = plan;
    } else {
      updatedPlans = [...plans, plan];
    }
    setPlans(updatedPlans);
    await StorageService.savePlan(plan);
    showToast(`Træningsplanen "${plan.title}" blev gemt!`);
  };

  const handleDeletePlan = async (planId: string) => {
    const updated = plans.filter((p) => p.id !== planId);
    setPlans(updated);
    if (activePlanId === planId && updated.length > 0) {
      setActivePlanId(updated[0].id);
    }
    await StorageService.deletePlan(planId);
    showToast('Træningsplan slettet');
  };

  // Handlers for exercises
  const handleSaveExercise = async (exercise: Exercise) => {
    const existingIndex = exercises.findIndex((e) => e.id === exercise.id);
    let updatedExercises: Exercise[];
    if (existingIndex >= 0) {
      updatedExercises = [...exercises];
      updatedExercises[existingIndex] = exercise;
    } else {
      updatedExercises = [exercise, ...exercises];
    }
    setExercises(updatedExercises);
    await StorageService.saveExercise(exercise);
    showToast(`Øvelsen "${exercise.name}" blev gemt i databasen!`);
  };

  const handleDeleteExercise = async (id: string) => {
    setExercises(exercises.filter((e) => e.id !== id));
    await StorageService.deleteExercise(id);
    showToast('Øvelse slettet fra biblioteket');
  };

  // Handler when a workout is completed and saved
  const handleCompleteWorkout = async (session: CompletedSession) => {
    setSessions((prev) => [session, ...prev]);
    setLogs((prev) => [...session.entries, ...prev]);
    await StorageService.addCompletedSession(session);
    showToast(
      `Flot klaret! Dagens pas blev gemt med ${session.exercisesCompletedCount} øvelser i databasen.`
    );
    setActiveTab('history');
  };

  const handleResetToDefaults = async () => {
    await StorageService.resetToDefaults();
    setExercises(INITIAL_EXERCISES);
    setPlans(INITIAL_PLANS);
    setLogs(INITIAL_LOGS);
    setSessions([]);
    setActivePlanId('plan-kneerehab');
    showToast('Databasen blev gendannet med standardøvelserne');
  };

  const navItems = [
    {
      id: 'active' as TabType,
      label: 'Dagens Pas',
      sublabel: 'Aktiv træning & timer',
      icon: Activity,
    },
    {
      id: 'plans' as TabType,
      label: 'Programmer',
      sublabel: 'Planer & øvelsesvalg',
      icon: Layers,
    },
    {
      id: 'library' as TabType,
      label: 'Øvelsesbibliotek',
      sublabel: `${exercises.length} øvelser & billeder`,
      icon: Dumbbell,
    },
    {
      id: 'history' as TabType,
      label: 'Historik & Grafer',
      sublabel: 'Gemte resultater',
      icon: Calendar,
    },
  ];

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#f8fafc] flex items-center justify-center text-slate-600">
        <div className="flex flex-col items-center gap-3 p-8 bg-white rounded-2xl border border-slate-200 shadow-sm">
          <div className="w-10 h-10 border-3 border-blue-600 border-t-transparent rounded-full animate-spin" />
          <span className="text-sm font-semibold text-slate-800">
            Forbinder til database & synkroniserer...
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8fafc] flex text-slate-900 font-sans selection:bg-blue-600 selection:text-white">
      {/* LEFT DARK SIDEBAR - Exactly matching screenshot styling in Royal Blue & Charcoal */}
      <aside
        id="app-sidebar"
        className={`fixed inset-y-0 left-0 z-40 w-64 bg-[#0f1117] text-white flex flex-col justify-between transition-transform duration-300 ease-in-out lg:translate-x-0 ${
          isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Top brand header */}
        <div className="p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              {/* Royal Blue square icon matching screenshot */}
              <div className="w-9 h-9 rounded-xl bg-blue-600 flex items-center justify-center text-white shadow-md shadow-blue-600/30 font-black text-base">
                F
              </div>
              <div>
                <h1 className="text-sm font-bold tracking-tight text-white leading-tight">
                  FysioDanmark
                </h1>
                <p className="text-[11px] font-medium text-slate-400">Træningssystem</p>
              </div>
            </div>

            {/* Mobile close */}
            <button
              onClick={() => setIsMobileMenuOpen(false)}
              className="p-1 rounded-lg text-slate-400 hover:text-white lg:hidden"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Database indicator tag */}
          <div className="mt-5 px-3 py-2 rounded-xl bg-slate-900/90 border border-slate-800/80 flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs text-slate-300">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              <span className="font-semibold text-[11px]">Database aktiv</span>
            </div>
            <span className="text-[10px] font-mono text-slate-400">Cloud API</span>
          </div>

          {/* Navigation Links */}
          <nav className="mt-6 space-y-1.5">
            {navItems.map((item) => {
              const isActive = activeTab === item.id;
              const Icon = item.icon;

              return (
                <button
                  key={item.id}
                  id={`nav-item-${item.id}`}
                  onClick={() => {
                    setActiveTab(item.id);
                    setIsMobileMenuOpen(false);
                  }}
                  className={`w-full px-4 py-3 rounded-xl flex items-center justify-between text-left transition-all ${
                    isActive
                      ? 'bg-blue-600 text-white font-semibold shadow-md shadow-blue-600/30'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/50 font-medium'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <Icon className={`w-4 h-4 ${isActive ? 'text-white' : 'text-slate-400'}`} />
                    <div>
                      <div className="text-xs font-semibold leading-tight">{item.label}</div>
                      <div
                        className={`text-[10px] ${
                          isActive ? 'text-blue-100' : 'text-slate-500'
                        } leading-tight`}
                      >
                        {item.sublabel}
                      </div>
                    </div>
                  </div>
                  {isActive && <ChevronRight className="w-4 h-4 text-white" />}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Sidebar bottom section */}
        <div className="p-6 border-t border-slate-800/80 space-y-4">
          <div className="flex items-center gap-3 px-1">
            <div className="w-9 h-9 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-bold text-slate-200">
              LP
            </div>
            <div className="overflow-hidden">
              <div className="text-xs font-semibold text-white truncate">Laura P.</div>
              <div className="text-[10px] text-blue-400 font-medium">Aktiv bruger • Fysioterapi</div>
            </div>
          </div>

          <div className="text-[10px] text-slate-500 text-center">
            Knægenoptræning & Belastningssporing
          </div>
        </div>
      </aside>

      {/* Mobile backdrop */}
      {isMobileMenuOpen && (
        <div
          onClick={() => setIsMobileMenuOpen(false)}
          className="fixed inset-0 z-30 bg-slate-950/60 backdrop-blur-xs lg:hidden"
        />
      )}

      {/* RIGHT MAIN APPLICATION WRAPPER */}
      <div className="flex-1 flex flex-col min-w-0 lg:pl-64">
        {/* TOP NAVBAR - Matching screenshot with Search, "+ Opret øvelse", Bell & User Pill */}
        <header
          id="app-top-header"
          className="h-16 bg-white border-b border-slate-200 sticky top-0 z-20 flex items-center justify-between px-4 sm:px-8 shadow-xs"
        >
          {/* Left: Mobile hamburger & Search input */}
          <div className="flex items-center gap-3 flex-1 max-w-lg">
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="p-2 rounded-xl text-slate-600 hover:bg-slate-100 lg:hidden"
              title="Åbn menu"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Top Search bar styled identically to screenshot */}
            <div className="relative w-full hidden sm:block">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={globalSearch}
                onChange={(e) => {
                  setGlobalSearch(e.target.value);
                  if (e.target.value && activeTab !== 'library') {
                    setActiveTab('library');
                  }
                }}
                placeholder="Søg i øvelser eller dokumentation..."
                className="w-full pl-9 pr-4 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
              />
            </div>
          </div>

          {/* Right actions: Blue Button, Notification Bell, User profile pill */}
          <div className="flex items-center gap-3 shrink-0">
            {/* Blue outlined "+ Opret øvelse" button (matching screenshot's "SKIFT TIL ADMIN" style in blue) */}
            <button
              id="topbar-btn-add-exercise"
              onClick={() => setIsAddExerciseModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl border border-blue-600 text-blue-700 bg-blue-50/50 hover:bg-blue-600 hover:text-white text-xs font-semibold transition-all shadow-xs cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Ny øvelse</span>
              <span className="sm:hidden">Ny</span>
            </button>

            {/* Notification Bell */}
            <div className="relative">
              <button
                type="button"
                className="p-2 rounded-xl text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors"
                title="Notifikationer"
              >
                <Bell className="w-4 h-4" />
                <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-blue-600 ring-2 ring-white" />
              </button>
            </div>

            {/* User Profile Pill matching screenshot */}
            <div className="hidden md:flex items-center gap-2.5 pl-2 border-l border-slate-200">
              <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center text-xs font-bold shadow-xs">
                LP
              </div>
              <div className="text-left">
                <span className="text-xs font-bold text-slate-800 block leading-tight">Laura P.</span>
                <span className="text-[10px] text-blue-600 font-semibold uppercase tracking-wider block leading-tight">
                  Patient / Bruger
                </span>
              </div>
            </div>
          </div>
        </header>

        {/* MAIN BODY CONTENT */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">
          {/* Toast Notification */}
          {toastMessage && (
            <div className="fixed bottom-6 right-6 z-50 bg-blue-600 text-white px-4 py-3 rounded-2xl shadow-xl flex items-center gap-2.5 text-xs font-semibold animate-in fade-in slide-in-from-bottom-3 duration-300">
              <Check className="w-4 h-4 stroke-[3]" />
              <span>{toastMessage}</span>
            </div>
          )}

          {/* TAB 1: Dagens Pas (Active Workout) */}
          {activeTab === 'active' && (
            <ActiveWorkout
              plans={plans}
              activePlanId={activePlanId}
              onChangePlan={(id) => setActivePlanId(id)}
              onCompleteWorkout={handleCompleteWorkout}
              allExercises={exercises}
              allLogs={logs}
              onUpdateExercise={handleSaveExercise}
            />
          )}

          {/* TAB 2: Programmer & Planer (Plan Manager) */}
          {activeTab === 'plans' && (
            <PlanManager
              plans={plans}
              exercises={exercises}
              activePlanId={activePlanId}
              onSelectPlanToWorkOut={(planId) => {
                setActivePlanId(planId);
                setActiveTab('active');
              }}
              onSavePlan={handleSavePlan}
              onDeletePlan={handleDeletePlan}
            />
          )}

          {/* TAB 3: Øvelsesbibliotek (Exercise Library) */}
          {activeTab === 'library' && (
            <ExerciseLibrary
              exercises={exercises}
              logs={logs}
              onSaveExercise={handleSaveExercise}
              onDeleteExercise={handleDeleteExercise}
            />
          )}

          {/* TAB 4: Historik & Resultater (History Log View) */}
          {activeTab === 'history' && (
            <HistoryLogView
              sessions={sessions}
              exercises={exercises}
              logs={logs}
              onResetToDefaults={handleResetToDefaults}
            />
          )}
        </main>
      </div>

      {/* Global Add Exercise Modal */}
      {isAddExerciseModalOpen && (
        <AddExerciseModal
          exercises={exercises}
          onClose={() => setIsAddExerciseModalOpen(false)}
          onSave={(newEx) => {
            handleSaveExercise(newEx);
            setIsAddExerciseModalOpen(false);
          }}
        />
      )}
    </div>
  );
}
