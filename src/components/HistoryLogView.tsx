import React, { useState, useMemo, useEffect } from 'react';
import {
  Calendar,
  Clock,
  CheckCircle2,
  TrendingUp,
  Dumbbell,
  ChevronDown,
  ChevronUp,
  Download,
  RotateCcw,
  Check,
  Table as TableIcon,
  LayoutGrid,
  Search,
  Filter,
  Play,
  Trash2,
  AlertCircle,
  Sparkles,
} from 'lucide-react';
import { CompletedSession, Exercise, ExerciseLogEntry } from '../types';
import { ExerciseProgressModal } from './ExerciseProgressModal';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ReferenceLine } from 'recharts';

interface HistoryLogViewProps {
  sessions: CompletedSession[];
  exercises: Exercise[];
  logs: ExerciseLogEntry[];
  onResetToDefaults?: () => void;
  onResumeSession?: (session: CompletedSession) => void;
  onDeleteSession?: (sessionId: string) => void;
}

export const HistoryLogView: React.FC<HistoryLogViewProps> = ({
  sessions,
  exercises,
  logs,
  onResetToDefaults,
  onResumeSession,
  onDeleteSession,
}) => {
  const [viewMode, setViewMode] = useState<'table' | 'cards'>('table');

  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setViewMode('cards');
    }
  }, []);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPlanFilter, setSelectedPlanFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'completed' | 'partial'>('all');
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);
  const [selectedExerciseForModal, setSelectedExerciseForModal] = useState<Exercise | null>(null);

  const isScoreEntry = (entry: ExerciseLogEntry) =>
    entry.trackingMode === 'timed_score' || (entry.scoreResults?.length ?? 0) > 0;

  const formatNumber = (value: number) => Number.isInteger(value) ? String(value) : value.toLocaleString('da-DK', { maximumFractionDigits: 1 });

  const formatScoreSide = (entry: ExerciseLogEntry, side: 'left' | 'right') => {
    const values = (entry.scoreResults || [])
      .map((round) => side === 'left' ? round.leftScore : round.rightScore)
      .filter((value): value is number => typeof value === 'number');
    if (!values.length) return '—';
    const unit = entry.scoreUnit || 'point';
    if (values.length === 1) return `${formatNumber(values[0])} ${unit}`;
    return `${values.map(formatNumber).join(' · ')} ${unit}`;
  };

  const renderEntryResults = (entry: ExerciseLogEntry) => {
    if (isScoreEntry(entry)) {
      return (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-lg">
            V: {formatScoreSide(entry, 'left')}
          </span>
          <span className="font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-lg">
            H: {formatScoreSide(entry, 'right')}
          </span>
          {typeof entry.lsiPercent === 'number' && (
            <span className="font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-lg">
              LSI {formatNumber(entry.lsiPercent)}%
            </span>
          )}
        </div>
      );
    }

    if (entry.separateLegs) {
      return (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-lg">
            V: {entry.leftLegWeightKg ?? 0} kg ({entry.leftLegReps || entry.reps})
          </span>
          <span className="font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-lg">
            H: {entry.rightLegWeightKg ?? 0} kg ({entry.rightLegReps || entry.reps})
          </span>
        </div>
      );
    }

    return (
      <span>
        {entry.sets} sæt × {entry.reps} gentagelser
        {entry.weightKg !== undefined && entry.weightKg > 0 ? ` @ ${entry.weightKg} kg` : ' (kropsvægt)'}
      </span>
    );
  };

  const lsiSessions = useMemo(() => sessions
    .filter((session) => session.entries.some((entry) => typeof entry.lsiPercent === 'number'))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()), [sessions]);

  const lsiExercises = useMemo(() => {
    const seen = new Map<string, string>();
    lsiSessions.forEach((session) => session.entries.forEach((entry) => {
      if (typeof entry.lsiPercent === 'number') seen.set(entry.exerciseId, entry.exerciseName);
    }));
    return Array.from(seen, ([id, name]) => ({ id, name }));
  }, [lsiSessions]);

  const lsiChartData = useMemo(() => lsiSessions.map((session) => {
    const row: Record<string, string | number> = {
      date: session.date,
      label: new Date(session.date).toLocaleDateString('da-DK', { day: '2-digit', month: 'short', year: '2-digit' }),
    };
    session.entries.forEach((entry) => {
      if (typeof entry.lsiPercent === 'number') row[entry.exerciseId] = entry.lsiPercent;
    });
    return row;
  }), [lsiSessions]);

  // Extract unique plan titles for the filter dropdown
  const uniquePlans = useMemo(() => {
    const set = new Set<string>();
    sessions.forEach((s) => {
      if (s.planTitle) set.add(s.planTitle);
    });
    return Array.from(set);
  }, [sessions]);

  // Filter and sort sessions (newest first)
  const filteredSessions = useMemo(() => {
    return [...sessions]
      .filter((session) => {
        // Plan filter
        if (selectedPlanFilter !== 'all' && session.planTitle !== selectedPlanFilter) {
          return false;
        }

        // Status filter
        const isPartial =
          session.isPartial ||
          session.status === 'partial' ||
          session.exercisesCompletedCount < session.totalExercisesCount;
        if (statusFilter === 'completed' && isPartial) return false;
        if (statusFilter === 'partial' && !isPartial) return false;

        // Search query
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          const matchDate = session.date.toLowerCase().includes(q);
          const matchPlan = session.planTitle.toLowerCase().includes(q);
          const matchExercises = session.entries.some((e) =>
            e.exerciseName.toLowerCase().includes(q)
          );
          return matchDate || matchPlan || matchExercises;
        }

        return true;
      })
      .sort((a, b) => {
        const timeA = a.completedAt ? new Date(a.completedAt).getTime() : new Date(a.date).getTime();
        const timeB = b.completedAt ? new Date(b.completedAt).getTime() : new Date(b.date).getTime();
        return timeB - timeA;
      });
  }, [sessions, selectedPlanFilter, statusFilter, searchQuery]);

  const handleExportJson = () => {
    const data = {
      sessions,
      logs,
      exercises,
      exportedAt: new Date().toISOString(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `traeningspas-historik-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatSessionTime = (isoString?: string) => {
    if (!isoString) return '';
    try {
      const d = new Date(isoString);
      return d.toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  const formatDuration = (totalSec: number) => {
    if (!totalSec || totalSec <= 0) return '-';
    const mins = Math.floor(totalSec / 60);
    const secs = totalSec % 60;
    if (mins === 0) return `${secs} sek`;
    return secs > 0 ? `${mins} m ${secs} s` : `${mins} min`;
  };

  // Extract highlights (highest weight or separate legs)
  const getSessionWeightHighlights = (session: CompletedSession) => {
    const scoreEntries = session.entries.filter(isScoreEntry);
    if (scoreEntries.length > 0) {
      const lsiValues = scoreEntries
        .map((entry) => entry.lsiPercent)
        .filter((value): value is number => typeof value === 'number');
      if (lsiValues.length) {
        const average = lsiValues.reduce((sum, value) => sum + value, 0) / lsiValues.length;
        return `${formatNumber(average)}% LSI i snit`;
      }
      return `${scoreEntries.length} testresultater`;
    }

    let maxKg = 0;
    let unilateralCount = 0;
    session.entries.forEach((e) => {
      if (e.weightKg && e.weightKg > maxKg) maxKg = e.weightKg;
      if (e.leftLegWeightKg && e.leftLegWeightKg > maxKg) maxKg = e.leftLegWeightKg;
      if (e.rightLegWeightKg && e.rightLegWeightKg > maxKg) maxKg = e.rightLegWeightKg;
      if (e.separateLegs) unilateralCount++;
    });

    if (maxKg > 0) {
      return `${maxKg} kg max${unilateralCount > 0 ? ' (V/H fordelt)' : ''}`;
    }
    return 'Kropsvægt';
  };

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="absolute top-0 left-0 w-24 h-1 bg-blue-600 rounded-br-full" />

        <div className="pt-1">
          <div className="flex items-center gap-2.5">
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">
              Tidligere Træningspas
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
              {sessions.length} pas gemt
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl">
            Komplet oversigtstabel over dine gennemførte og delvist gennemførte træningspas. Du kan folde hvert pas ud for detaljer, eller genoptage et uafsluttet pas.
          </p>
        </div>

        {/* Top Controls: View Toggle & Export */}
        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {/* View Mode Toggle */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-semibold">
            <button
              onClick={() => setViewMode('table')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
                viewMode === 'table'
                  ? 'bg-white text-blue-700 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <TableIcon className="w-3.5 h-3.5" />
              <span>Tabelvisning</span>
            </button>
            <button
              onClick={() => setViewMode('cards')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-all ${
                viewMode === 'cards'
                  ? 'bg-white text-blue-700 shadow-xs font-bold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              <span>Kortvisning</span>
            </button>
          </div>

          <button
            onClick={handleExportJson}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors border border-slate-200 shadow-xs"
            title="Eksporter alle data som JSON backup"
          >
            <Download className="w-3.5 h-3.5 text-blue-600" />
            <span className="hidden sm:inline">Eksportér</span>
          </button>

          {onResetToDefaults && (
            <button
              onClick={() => {
                if (confirm('Vil du nulstille til standardøvelserne fra FysioDanmark knæprogrammet?')) {
                  onResetToDefaults();
                }
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-500 hover:text-slate-800 text-xs font-medium transition-colors border border-slate-200"
              title="Genindlæs standarddata"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {lsiChartData.length > 1 && lsiExercises.length > 0 && (
        <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2 mb-4">
            <div>
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-blue-600" />
                <h3 className="font-bold text-slate-900 text-sm sm:text-base">LSI-udvikling samlet</h3>
              </div>
              <p className="text-[11px] sm:text-xs text-slate-500 mt-1">Alle LSI-tests i samme graf, så udviklingen mellem testdatoerne kan sammenlignes.</p>
            </div>
            <span className="text-[10px] font-bold text-slate-500 bg-slate-100 rounded-full px-2.5 py-1 self-start sm:self-auto">90% reference</span>
          </div>
          <div className="h-[260px] sm:h-[330px] -ml-3 sm:ml-0">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={lsiChartData} margin={{ top: 8, right: 10, left: -15, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} minTickGap={14} />
                <YAxis domain={[0, 110]} tick={{ fontSize: 10 }} width={34} unit="%" />
                <Tooltip formatter={(value: any, name: any) => [`${value}%`, lsiExercises.find((e) => e.id === name)?.name || name]} labelFormatter={(label) => `Test: ${label}`} />
                <Legend formatter={(value) => <span className="text-[10px] sm:text-xs">{lsiExercises.find((e) => e.id === value)?.name || value}</span>} />
                <ReferenceLine y={90} strokeDasharray="5 5" />
                {lsiExercises.map((exercise, index) => (
                  <Line key={exercise.id} type="monotone" dataKey={exercise.id} name={exercise.id} stroke={`hsl(${210 + index * 45} 70% 45%)`} strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} connectNulls />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Filter & Search Bar */}
      <div className="bg-white p-3 sm:p-4 rounded-2xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-2.5">
        {/* Search input */}
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Søg i dato, program eller øvelsesnavn..."
            className="w-full pl-9 pr-4 py-2 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600"
            >
              Ryd
            </button>
          )}
        </div>

        {/* Dropdown filters */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Plan filter */}
          {uniquePlans.length > 1 && (
            <div className="flex items-center gap-1.5">
              <select
                value={selectedPlanFilter}
                onChange={(e) => setSelectedPlanFilter(e.target.value)}
                className="text-xs font-medium bg-slate-50 text-slate-700 border border-slate-200 rounded-xl px-3 py-2 hover:bg-slate-100 transition-colors focus:outline-none focus:border-blue-500"
              >
                <option value="all">Alle programmer ({sessions.length})</option>
                {uniquePlans.map((title) => (
                  <option key={title} value={title}>
                    {title}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Status filter */}
          <div className="flex items-center gap-1.5">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value as any)}
              className="text-xs font-medium bg-slate-50 text-slate-700 border border-slate-200 rounded-xl px-3 py-2 hover:bg-slate-100 transition-colors focus:outline-none focus:border-blue-500"
            >
              <option value="all">Alle statusser</option>
              <option value="completed">Kun fuldførte</option>
              <option value="partial">Kun delvist gennemførte</option>
            </select>
          </div>
        </div>
      </div>

      {/* Main Content: Table View vs. Card View */}
      {filteredSessions.length > 0 ? (
        viewMode === 'table' ? (
          /* ========================================================== */
          /* TABLE VIEW                                                 */
          /* ========================================================== */
          <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[10px]">
                    <th className="py-3.5 px-4">Dato & Tid</th>
                    <th className="py-3.5 px-4">Træningsprogram</th>
                    <th className="py-3.5 px-3">Status</th>
                    <th className="py-3.5 px-4">Udførte øvelser</th>
                    <th className="py-3.5 px-3">Varighed</th>
                    <th className="py-3.5 px-4">Resultat / Belastning</th>
                    <th className="py-3.5 px-4 text-right">Handling</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredSessions.map((session) => {
                    const isExpanded = expandedSessionId === session.id;
                    const isPartial =
                      session.isPartial ||
                      session.status === 'partial' ||
                      session.exercisesCompletedCount < session.totalExercisesCount;
                    const timeStr = formatSessionTime(session.completedAt || session.startedAt);

                    return (
                      <React.Fragment key={session.id}>
                        <tr
                          className={`hover:bg-slate-50/80 transition-colors cursor-pointer ${
                            isExpanded ? 'bg-blue-50/30' : ''
                          }`}
                          onClick={() => setExpandedSessionId(isExpanded ? null : session.id)}
                        >
                          {/* Dato & Tid */}
                          <td className="py-3.5 px-4 whitespace-nowrap font-medium text-slate-900">
                            <div className="flex items-center gap-2">
                              <Calendar className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                              <div>
                                <div className="font-bold text-slate-900">
                                  {new Date(session.date).toLocaleDateString('da-DK', {
                                    weekday: 'short',
                                    day: 'numeric',
                                    month: 'short',
                                    year: 'numeric',
                                  })}
                                </div>
                                {timeStr && (
                                  <div className="text-[10px] text-slate-400 font-mono">
                                    Kl. {timeStr}
                                  </div>
                                )}
                              </div>
                            </div>
                          </td>

                          {/* Træningsprogram */}
                          <td className="py-3.5 px-4 font-semibold text-slate-800">
                            <span className="text-blue-700 bg-blue-50/70 border border-blue-100 px-2.5 py-1 rounded-lg inline-block">
                              {session.planTitle}
                            </span>
                          </td>

                          {/* Status */}
                          <td className="py-3.5 px-3 whitespace-nowrap">
                            {isPartial ? (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                                <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                                Delvis ({session.exercisesCompletedCount}/{session.totalExercisesCount})
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-200">
                                <Check className="w-3 h-3 text-emerald-600 stroke-[3]" />
                                Fuldført ({session.exercisesCompletedCount}/{session.totalExercisesCount})
                              </span>
                            )}
                          </td>

                          {/* Udførte øvelser Preview */}
                          <td className="py-3.5 px-4">
                            <div className="flex flex-wrap gap-1 max-w-xs sm:max-w-sm">
                              {session.entries.slice(0, 3).map((entry) => (
                                <span
                                  key={entry.id}
                                  className="text-[10px] px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-medium truncate"
                                  title={entry.exerciseName}
                                >
                                  {entry.exerciseName}
                                </span>
                              ))}
                              {session.entries.length > 3 && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-200 text-slate-600 font-bold">
                                  +{session.entries.length - 3} flere
                                </span>
                              )}
                            </div>
                          </td>

                          {/* Varighed */}
                          <td className="py-3.5 px-3 whitespace-nowrap font-mono text-slate-700">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3 h-3 text-slate-400" />
                              {formatDuration(session.durationSeconds)}
                            </span>
                          </td>

                          {/* Belastning Højdepunkt */}
                          <td className="py-3.5 px-4 whitespace-nowrap font-medium text-slate-600">
                            <span className="flex items-center gap-1.5">
                              <Dumbbell className="w-3 h-3 text-slate-400" />
                              {getSessionWeightHighlights(session)}
                            </span>
                          </td>

                          {/* Handling Buttons */}
                          <td
                            className="py-3.5 px-4 text-right whitespace-nowrap"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Resume / Genoptag knap hvis passet er delvist eller man vil fortsætte */}
                              {onResumeSession && (
                                <button
                                  type="button"
                                  onClick={() => onResumeSession(session)}
                                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                                    isPartial
                                      ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-xs'
                                      : 'bg-blue-50 hover:bg-blue-100 text-blue-700'
                                  }`}
                                  title={
                                    isPartial
                                      ? 'Genoptag og gør de resterende øvelser færdige'
                                      : 'Gå i gang med dette træningspas igen'
                                  }
                                >
                                  <Play className="w-3 h-3 fill-current" />
                                  <span>{isPartial ? 'Gør færdig' : 'Genoptag'}</span>
                                </button>
                              )}

                              {/* Toggle expand button */}
                              <button
                                type="button"
                                onClick={() => setExpandedSessionId(isExpanded ? null : session.id)}
                                className="p-1.5 rounded-lg text-slate-500 hover:text-blue-600 hover:bg-slate-100 transition-colors"
                                title={isExpanded ? 'Skjul detaljer' : 'Vis detaljer'}
                              >
                                {isExpanded ? (
                                  <ChevronUp className="w-4 h-4 text-blue-600" />
                                ) : (
                                  <ChevronDown className="w-4 h-4" />
                                )}
                              </button>

                              {/* Delete button */}
                              {onDeleteSession && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (confirm('Vil du slette dette træningspas fra historikken?')) {
                                      onDeleteSession(session.id);
                                    }
                                  }}
                                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                                  title="Slet træningspas"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>

                        {/* Expandable detailed drawer row */}
                        {isExpanded && (
                          <tr className="bg-slate-50/70">
                            <td colSpan={7} className="p-4 sm:p-5 border-t border-b border-slate-200">
                              <div className="space-y-3 max-w-5xl">
                                <div className="flex items-center justify-between">
                                  <div className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                                    <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                                    Registrerede øvelser i dette træningspas:
                                  </div>

                                  {onResumeSession && (
                                    <button
                                      type="button"
                                      onClick={() => onResumeSession(session)}
                                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold transition-all shadow-xs"
                                    >
                                      <Play className="w-3.5 h-3.5 fill-current" />
                                      <span>Gå i gang med træningen igen</span>
                                    </button>
                                  )}
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                                  {session.entries.map((entry) => {
                                    const originalEx = exercises.find((e) => e.id === entry.exerciseId);

                                    return (
                                      <div
                                        key={entry.id}
                                        className="p-3 rounded-xl bg-white border border-slate-200 shadow-2xs flex flex-col justify-between gap-2 text-xs"
                                      >
                                        <div>
                                          <div className="flex items-center justify-between gap-2">
                                            <h5 className="font-bold text-slate-900 text-xs">
                                              {entry.exerciseName}
                                            </h5>
                                            {originalEx && (
                                              <button
                                                type="button"
                                                onClick={() => setSelectedExerciseForModal(originalEx)}
                                                className="text-[11px] text-blue-600 hover:text-blue-800 font-semibold flex items-center gap-1"
                                              >
                                                <TrendingUp className="w-3 h-3" />
                                                Fremgang
                                              </button>
                                            )}
                                          </div>

                                          <div className="flex flex-wrap items-center gap-2 text-slate-600 mt-1.5">
{renderEntryResults(entry)}

                                            {entry.durationSeconds ? (
                                              <span className="text-slate-400 font-mono text-[11px]">
                                                • {Math.floor(entry.durationSeconds / 60)}m {entry.durationSeconds % 60}s
                                              </span>
                                            ) : null}
                                          </div>

                                          {entry.notes && (
                                            <p className="text-slate-500 italic mt-1.5 text-[11px] bg-slate-50 p-1.5 rounded-lg border border-slate-100">
                                              "{entry.notes}"
                                            </p>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          /* ========================================================== */
          /* CARD VIEW                                                  */
          /* ========================================================== */
          <div className="space-y-4">
            {filteredSessions.map((session) => {
              const isExpanded = expandedSessionId === session.id;
              const isPartial =
                session.isPartial ||
                session.status === 'partial' ||
                session.exercisesCompletedCount < session.totalExercisesCount;

              return (
                <div
                  key={session.id}
                  className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs hover:border-blue-300 transition-all"
                >
                  <div
                    onClick={() => setExpandedSessionId(isExpanded ? null : session.id)}
                    className="p-3.5 sm:p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 cursor-pointer hover:bg-slate-50/70 transition-colors"
                  >
                    <div className="flex items-start sm:items-center gap-3.5">
                      <div
                        className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
                          isPartial
                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                        }`}
                      >
                        {isPartial ? (
                          <Clock className="w-5 h-5 stroke-[2.5]" />
                        ) : (
                          <Check className="w-5 h-5 stroke-[2.5]" />
                        )}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-900">
                            {new Date(session.date).toLocaleDateString('da-DK', {
                              weekday: 'long',
                              day: 'numeric',
                              month: 'long',
                              year: 'numeric',
                            })}
                          </span>
                          <span className="text-slate-300">•</span>
                          <span className="text-xs text-blue-600 font-semibold">
                            {session.planTitle}
                          </span>
                          {isPartial && (
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                              Delvist gennemført
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                          <span className="flex items-center gap-1">
                            <Dumbbell className="w-3.5 h-3.5 text-slate-400" />
                            {session.exercisesCompletedCount} af {session.totalExercisesCount} øvelser udført
                          </span>
                          {session.durationSeconds > 0 && (
                            <span className="flex items-center gap-1 text-slate-700 font-medium">
                              <Clock className="w-3.5 h-3.5 text-blue-600" />
                              {formatDuration(session.durationSeconds)}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5">
                      {onResumeSession && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onResumeSession(session);
                          }}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-bold transition-colors"
                        >
                          <Play className="w-3 h-3 fill-current" />
                          <span>Gå i gang igen</span>
                        </button>
                      )}

                      <span className="text-xs text-slate-500 font-medium">
                        {isExpanded ? 'Skjul' : 'Detaljer'}
                      </span>
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-blue-600" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-slate-400" />
                      )}
                    </div>
                  </div>

                  {/* Expanded exercise entries */}
                  {isExpanded && (
                    <div className="p-3.5 sm:p-5 pt-0 border-t border-slate-100 bg-slate-50/50 space-y-3">
                      <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider pt-3 pb-1">
                        Registrerede øvelser i dette pas:
                      </div>

                      <div className="grid grid-cols-1 gap-2.5">
                        {session.entries.map((entry) => {
                          const originalEx = exercises.find((e) => e.id === entry.exerciseId);

                          return (
                            <div
                              key={entry.id}
                              className="p-3.5 rounded-xl bg-white border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                            >
                              <div>
                                <h5 className="font-bold text-slate-900 text-sm">{entry.exerciseName}</h5>
                                <div className="flex flex-wrap items-center gap-2 text-slate-600 mt-1">
{renderEntryResults(entry)}

                                  {entry.durationSeconds ? (
                                    <span className="text-slate-500">
                                      • Tid: {Math.floor(entry.durationSeconds / 60)}m {entry.durationSeconds % 60}s
                                    </span>
                                  ) : null}
                                </div>

                                {entry.notes && (
                                  <p className="text-slate-500 italic mt-1 text-[11px]">
                                    "{entry.notes}"
                                  </p>
                                )}
                              </div>

                              {originalEx && (
                                <button
                                  type="button"
                                  onClick={() => setSelectedExerciseForModal(originalEx)}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold self-start sm:self-center transition-colors"
                                >
                                  <TrendingUp className="w-3.5 h-3.5 text-blue-600" />
                                  <span>Se fremgang</span>
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center space-y-3 shadow-xs">
          <Calendar className="w-10 h-10 text-slate-400 mx-auto" />
          <h3 className="text-base font-bold text-slate-900">
            {searchQuery || selectedPlanFilter !== 'all' || statusFilter !== 'all'
              ? 'Ingen træningspas matcher dine filtre'
              : 'Ingen gennemførte pas endnu'}
          </h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            {searchQuery || selectedPlanFilter !== 'all' || statusFilter !== 'all'
              ? 'Prøv at nulstille søgningen eller vælge et andet filter foroven.'
              : 'Gå til "Dagens Pas", udfør øvelserne og klik på "Gem træningspas". Dine resultater gemmes automatisk i tabellen her.'}
          </p>
        </div>
      )}

      {/* Exercise progress graph modal */}
      {selectedExerciseForModal && (
        <ExerciseProgressModal
          exercise={selectedExerciseForModal}
          logs={logs}
          onClose={() => setSelectedExerciseForModal(null)}
        />
      )}
    </div>
  );
};
