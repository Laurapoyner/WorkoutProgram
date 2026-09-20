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
  RefreshCw,
  AlertCircle,
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
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [globalSearch, setGlobalSearch] = useState('');
  const [isAddExerciseModalOpen, setIsAddExerciseModalOpen] = useState(false);

  // Core database state
  const [exercises, setExercises] = useState<Exercise[]>(INITIAL_EXERCISES);
  const [plans, setPlans] = useState<WorkoutPlan[]>(INITIAL_PLANS);
  const [logs, setLogs] = useState<ExerciseLogEntry[]>(INITIAL_LOGS);
  const [sessions, setSessions] = useState<CompletedSession[]>([]);
  const [sessionToResume, setSessionToResume] = useState<CompletedSession | null>(null);
  const [activePlanId, setActivePlanId] = useState<string>('plan-kneerehab');
  const [dbStatus, setDbStatus] = useState<{
    type: string;
    connected: boolean;
    databaseName: string;
    hasMongoUri: boolean;
    error?: string | null;
  } | null>(null);
  const [isReconnectingDb, setIsReconnectingDb] = useState(false);
  const [showDbInfoModal, setShowDbInfoModal] = useState(false);

  // Success toast message
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Synchronize data function: fetches latest state from backend/MongoDB Atlas
  const syncWithDatabase = async (silent = false) => {
    if (!silent) setIsSyncing(true);
    try {
      // 1. Refresh DB connection status
      try {
        const statusRes = await fetch('/api/db-status');
        if (statusRes.ok) {
          const st = await statusRes.json();
          setDbStatus(st);
        }
      } catch {}

      // 2. Load all latest data from backend / MongoDB Atlas
      const [loadedExercises, loadedPlans, loadedLogs, loadedSessions] = await Promise.all([
        StorageService.getExercises(),
        StorageService.getPlans(),
        StorageService.getLogs(),
        StorageService.getCompletedSessions(),
      ]);

      if (loadedExercises && loadedExercises.length > 0) {
        setExercises(loadedExercises);
      }
      if (loadedPlans && loadedPlans.length > 0) {
        setPlans(loadedPlans);
        setActivePlanId((curr) => {
          if (curr && loadedPlans.some((p) => p.id === curr)) return curr;
          return loadedPlans[0].id;
        });
      }
      if (loadedLogs) setLogs(loadedLogs);
      if (loadedSessions) setSessions(loadedSessions);

      setLastSyncedAt(new Date());
    } catch (err) {
      console.error('Error synchronizing database', err);
      if (!silent) {
        showToast('Kunne ikke hente de nyeste ændringer');
      }
    } finally {
      if (!silent) setIsSyncing(false);
      setIsLoading(false);
    }
  };

  // 1. Initial load on mount - fetch DB status immediately in parallel
  useEffect(() => {
    async function init() {
      try {
        // Fetch status immediately to avoid false "local database" flash
        fetch('/api/db-status')
          .then((res) => (res.ok ? res.json() : null))
          .then((st) => {
            if (st) setDbStatus(st);
          })
          .catch(() => {});

        await StorageService.init();
        await syncWithDatabase(false);
      } catch (err) {
        console.error('Error during init', err);
        setIsLoading(false);
      }
    }
    init();
  }, []);

  // 2. Cross-Device Synchronization:
  // - Polls every 12 seconds so phone & computer remain constantly synchronized
  // - Also immediately syncs whenever user switches back to this browser tab (document.visibilitychange)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        syncWithDatabase(true);
      }
    };

    const handleFocus = () => {
      syncWithDatabase(true);
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleFocus);

    // Periodic polling every 12s
    const pollInterval = setInterval(() => {
      syncWithDatabase(true);
    }, 12000);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleFocus);
      clearInterval(pollInterval);
    };
  }, []);

  const handleRetryDb = async () => {
    setIsReconnectingDb(true);
    try {
      const res = await fetch('/api/db-retry', { method: 'POST' });
      const data = await res.json();
      if (data.connected) {
        setDbStatus({
          type: 'mongodb',
          connected: true,
          databaseName: data.databaseName || 'fysiodanmark',
          hasMongoUri: true,
          error: null,
        });
        showToast('MongoDB Atlas tilsluttet succesfuldt!');
        // Refresh data
        await StorageService.init();
        const [loadedExercises, loadedPlans, loadedLogs, loadedSessions] = await Promise.all([
          StorageService.getExercises(),
          StorageService.getPlans(),
          StorageService.getLogs(),
          StorageService.getCompletedSessions(),
        ]);
        if (loadedExercises?.length) setExercises(loadedExercises);
        if (loadedPlans?.length) setPlans(loadedPlans);
        if (loadedLogs?.length) setLogs(loadedLogs);
        if (loadedSessions) setSessions(loadedSessions);
      } else {
        setDbStatus((prev) => ({
          type: 'mongodb',
          databaseName: prev?.databaseName || 'workout_program',
          hasMongoUri: prev?.hasMongoUri ?? true,
          connected: false,
          error: data.error,
        }));
        showToast('Kunne ikke forbinde til MongoDB Atlas endnu. Tjek Network Access.');
      }
    } catch {
      showToast('Netværksfejl under genopretning');
    } finally {
      setIsReconnectingDb(false);
    }
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 4000);
  };

  // Handlers for plans
  const handleSavePlan = async (plan: WorkoutPlan) => {
    try {
      await StorageService.savePlan(plan);
      const existingIndex = plans.findIndex((p) => p.id === plan.id);
      const updatedPlans = [...plans];
      if (existingIndex >= 0) updatedPlans[existingIndex] = plan;
      else updatedPlans.push(plan);
      setPlans(updatedPlans);
      showToast(`Træningsplanen "${plan.title}" blev gemt i MongoDB!`);
    } catch (err: any) {
      showToast(`Planen blev ikke gemt: ${err.message || 'databasefejl'}`);
      throw err;
    }
  };

  const handleDeletePlan = async (planId: string) => {
    try {
      await StorageService.deletePlan(planId);
      const updated = plans.filter((p) => p.id !== planId);
      setPlans(updated);
      if (activePlanId === planId && updated.length > 0) setActivePlanId(updated[0].id);
      showToast('Træningsplan slettet fra MongoDB');
    } catch (err: any) {
      showToast(`Planen blev ikke slettet: ${err.message || 'databasefejl'}`);
    }
  };

  // Handlers for exercises
  const handleSaveExercise = async (exercise: Exercise) => {
    try {
      const res = await StorageService.saveExercise(exercise);
      const savedEx = res?.exercise || exercise;
      const existingIndex = exercises.findIndex((e) => e.id === savedEx.id);
      let updatedExercises: Exercise[];
      if (existingIndex >= 0) {
        updatedExercises = [...exercises];
        updatedExercises[existingIndex] = savedEx;
      } else {
        updatedExercises = [savedEx, ...exercises];
      }
      setExercises(updatedExercises);
      showToast(`Øvelsen "${savedEx.name}" blev gemt i MongoDB Atlas!`);
    } catch (err: any) {
      console.error('Fejl ved gemning af øvelse:', err);
      showToast(`Fejl ved gemning i databasen: ${err.message || 'Ukendt fejl'}`);
      throw err;
    }
  };

  const handleDeleteExercise = async (id: string) => {
    try {
      await StorageService.deleteExercise(id);
      setExercises((prev) => prev.filter((e) => e.id !== id));
      showToast('Øvelsen blev slettet fra MongoDB Atlas');
    } catch (err: any) {
      showToast(`Fejl ved sletning: ${err.message}`);
    }
  };

  // Handler when a workout is completed and saved
  const handleCompleteWorkout = async (session: CompletedSession) => {
    try {
      await StorageService.addCompletedSession(session);
      setSessions((prev) => [session, ...prev]);
      setLogs((prev) => [...session.entries, ...prev]);
      showToast(
        session.isPartial
          ? `Delvist pas gemt (${session.exercisesCompletedCount} øvelser). Du kan genoptage det når som helst fra tabellen!`
          : `Flot klaret! Dagens pas blev gemt med ${session.exercisesCompletedCount} øvelser i databasen.`
      );
      setActiveTab('history');
    } catch (err: any) {
      showToast(`Træningspasset blev ikke gemt: ${err.message || 'databasefejl'}`);
      throw err;
    }
  };

  const handleResumeSession = (session: CompletedSession) => {
    setSessionToResume(session);
    if (session.planId) {
      setActivePlanId(session.planId);
    }
    setActiveTab('active');
    showToast(`Genoptager træningspas: "${session.planTitle}"`);
  };

  const handleDeleteSession = async (sessionId: string) => {
    try {
      await StorageService.deleteCompletedSession(sessionId);
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      showToast('Træningspasset blev slettet fra MongoDB');
    } catch (err: any) {
      showToast(`Træningspasset blev ikke slettet: ${err.message || 'databasefejl'}`);
    }
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
      label: 'Tidligere Pas',
      sublabel: 'Tabel & resultater',
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
          {!dbStatus ? (
            <div className="mt-5 px-3 py-2.5 rounded-xl bg-slate-900/90 border border-slate-800/80 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-slate-300">
                <RefreshCw className="w-3.5 h-3.5 animate-spin text-emerald-400" />
                <span className="font-semibold text-[11px] text-slate-200">Forbinder til online database...</span>
              </div>
            </div>
          ) : dbStatus.connected && dbStatus.type === 'mongodb' ? (
            <div className="mt-5 px-3 py-2.5 rounded-xl bg-emerald-950/40 border border-emerald-800/60 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-emerald-300">
                <span className="relative flex h-2 w-2">
                  <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${isSyncing ? 'bg-blue-400' : 'bg-emerald-400'} opacity-75`} />
                  <span className={`relative inline-flex rounded-full h-2 w-2 ${isSyncing ? 'bg-blue-500' : 'bg-emerald-500'}`} />
                </span>
                <div>
                  <div className="font-bold text-[11px] text-emerald-200 flex items-center gap-1.5">
                    MongoDB Atlas
                    {isSyncing && <span className="text-[9px] font-normal text-blue-300">(syncer...)</span>}
                  </div>
                  <div className="text-[10px] text-emerald-400 font-mono">
                    {lastSyncedAt ? `Synkroniseret kl. ${lastSyncedAt.toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' })}` : 'Online • Synkron'}
                  </div>
                </div>
              </div>
              <button
                onClick={() => syncWithDatabase(false)}
                disabled={isSyncing}
                title="Manuel synkronisering"
                className="p-1 rounded-lg hover:bg-emerald-900/60 text-emerald-400 transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              </button>
            </div>
          ) : dbStatus.hasMongoUri ? (
            <div className="mt-5 p-3 rounded-xl bg-amber-950/50 border border-amber-600/40 text-left">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-500" />
                  </span>
                  <span className="font-bold text-[11px] text-amber-200">MongoDB Forbindelse</span>
                </div>
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-900/60 text-amber-300 font-semibold uppercase tracking-wider">
                  Afventer
                </span>
              </div>
              <p className="text-[11px] text-amber-200/80 mt-1.5 leading-relaxed">
                Atlas IP-filter blokerer adgangen. Giv adgang i MongoDB Atlas.
              </p>
              <div className="mt-2.5 flex items-center gap-2">
                <button
                  onClick={handleRetryDb}
                  disabled={isReconnectingDb}
                  className="flex-1 px-2.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 active:scale-95 text-slate-950 font-bold text-[11px] flex items-center justify-center gap-1.5 transition-all shadow-sm disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isReconnectingDb ? 'animate-spin' : ''}`} />
                  {isReconnectingDb ? 'Forbinder...' : 'Genopret forbindelse'}
                </button>
                <button
                  onClick={() => setShowDbInfoModal(true)}
                  className="px-2 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[11px] font-medium"
                >
                  Hjælp
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-5 px-3 py-2 rounded-xl bg-slate-900/90 border border-slate-800/80 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs text-slate-300">
                <span className="relative flex h-2 w-2">
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-slate-500" />
                </span>
                <span className="font-semibold text-[11px]">Lokal Database</span>
              </div>
              <span className="text-[10px] font-mono text-slate-400">Offline</span>
            </div>
          )}

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
            {/* Live Cross-Device Sync Indicator & Manual Refresh Button */}
            <button
              id="topbar-btn-sync"
              onClick={() => {
                syncWithDatabase(false);
                showToast('Synkroniserer med databasen...');
              }}
              disabled={isSyncing}
              title="Synkroniser på tværs af enheder (mobil & PC)"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-semibold transition-all shadow-xs cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-blue-600 ${isSyncing ? 'animate-spin' : ''}`} />
              <span className="hidden md:inline">
                {isSyncing ? 'Synkroniserer...' : 'Synkroniser'}
              </span>
            </button>

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
              resumeSession={sessionToResume}
              onClearResumeSession={() => setSessionToResume(null)}
              onToast={(msg) => showToast(msg)}
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
              onSaveExercise={handleSaveExercise}
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
              onResumeSession={handleResumeSession}
              onDeleteSession={handleDeleteSession}
            />
          )}
        </main>
      </div>

      {/* Global Add Exercise Modal */}
      {isAddExerciseModalOpen && (
        <AddExerciseModal
          exercises={exercises}
          onClose={() => setIsAddExerciseModalOpen(false)}
          onSave={async (newEx) => {
            await handleSaveExercise(newEx);
          }}
        />
      )}

      {/* MongoDB Setup Info Modal */}
      {showDbInfoModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-md w-full p-6 shadow-2xl relative text-left">
            <button
              onClick={() => setShowDbInfoModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white p-1 rounded-lg"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
                <AlertCircle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-white">Tillad adgang i MongoDB Atlas</h3>
                <p className="text-xs text-slate-400">Sådan åbner du for forbindelsen (1 min)</p>
              </div>
            </div>

            <div className="space-y-3 text-xs text-slate-300">
              <p>
                MongoDB Atlas blokerer som standard alle nye servere og apps, medmindre du tilføjer en IP-regel.
              </p>

              <ol className="space-y-2 list-decimal list-inside bg-slate-950/60 p-3 rounded-xl border border-slate-800 text-slate-300">
                <li>Log ind på <strong className="text-white">MongoDB Atlas</strong>.</li>
                <li>I venstre menu under <em>Security</em>, klik på <strong className="text-emerald-400">Network Access</strong>.</li>
                <li>Klik på den grønne knap <strong className="text-white">"Add IP Address"</strong>.</li>
                <li>Vælg <strong className="text-amber-300">"ALLOW ACCESS FROM ANYWHERE"</strong> (sætter IP til <code className="bg-slate-800 px-1 py-0.5 rounded text-amber-300">0.0.0.0/0</code>).</li>
                <li>Klik <strong className="text-white">"Confirm"</strong>.</li>
              </ol>

              <p className="text-slate-400 text-[11px]">
                Når det er gjort, tager det ca. 15-30 sekunder for Atlas at opdatere. Tryk derefter på <strong>"Genopret forbindelse"</strong> knappen.
              </p>
            </div>

            <div className="mt-5 flex gap-2.5">
              <button
                onClick={() => {
                  setShowDbInfoModal(false);
                  handleRetryDb();
                }}
                className="flex-1 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 shadow-md transition-all"
              >
                <RefreshCw className="w-4 h-4" />
                Prøv at forbinde nu
              </button>
              <button
                onClick={() => setShowDbInfoModal(false)}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
              >
                Luk
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
