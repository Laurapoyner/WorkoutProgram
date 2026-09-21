import React, { useMemo, useState } from 'react';
import {
  Calendar,
  Clock,
  TrendingUp,
  Dumbbell,
  ChevronDown,
  ChevronUp,
  Download,
  RotateCcw,
  Check,
  Search,
  Play,
  Trash2,
  ArrowLeft,
  List,
  Activity,
} from 'lucide-react';
import { CompletedSession, Exercise, ExerciseLogEntry } from '../types';
import { ExerciseProgressModal } from './ExerciseProgressModal';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
} from 'recharts';

interface HistoryLogViewProps {
  sessions: CompletedSession[];
  exercises: Exercise[];
  logs: ExerciseLogEntry[];
  onResetToDefaults?: () => void;
  onResumeSession?: (session: CompletedSession) => void;
  onDeleteSession?: (sessionId: string) => void;
}

type HistoryMode = 'programs' | 'program' | 'all';

type ProgramGroup = {
  key: string;
  planId: string;
  title: string;
  sessions: CompletedSession[];
  latestAt: number;
};

const chartColors = ['#2563eb', '#7c3aed', '#db2777', '#059669', '#ea580c', '#0891b2', '#4f46e5'];

export const HistoryLogView: React.FC<HistoryLogViewProps> = ({
  sessions,
  exercises,
  logs,
  onResetToDefaults,
  onResumeSession,
  onDeleteSession,
}) => {
  const [mode, setMode] = useState<HistoryMode>('programs');
  const [selectedProgramKey, setSelectedProgramKey] = useState<string | null>(null);
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(null);
  const [selectedExerciseForModal, setSelectedExerciseForModal] = useState<Exercise | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const isScoreEntry = (entry: ExerciseLogEntry) =>
    entry.trackingMode === 'timed_score' || (entry.scoreResults?.length ?? 0) > 0;

  const formatNumber = (value: number) =>
    Number.isInteger(value)
      ? String(value)
      : value.toLocaleString('da-DK', { maximumFractionDigits: 1 });

  const sessionTimestamp = (session: CompletedSession) => {
    const value = session.completedAt || session.startedAt || session.date;
    const time = new Date(value).getTime();
    return Number.isFinite(time) ? time : new Date(session.date).getTime();
  };

  const formatDate = (value: string, long = false) =>
    new Date(value).toLocaleDateString('da-DK', long
      ? { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }
      : { day: '2-digit', month: 'short', year: '2-digit' });

  const formatSessionTime = (isoString?: string) => {
    if (!isoString) return '';
    try {
      return new Date(isoString).toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' });
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

  const programGroups = useMemo<ProgramGroup[]>(() => {
    const map = new Map<string, ProgramGroup>();
    sessions.forEach((session) => {
      const key = session.planId || session.planTitle;
      const existing = map.get(key);
      if (existing) {
        existing.sessions.push(session);
        existing.latestAt = Math.max(existing.latestAt, sessionTimestamp(session));
      } else {
        map.set(key, {
          key,
          planId: session.planId,
          title: session.planTitle,
          sessions: [session],
          latestAt: sessionTimestamp(session),
        });
      }
    });

    return Array.from(map.values())
      .map((group) => ({
        ...group,
        sessions: [...group.sessions].sort((a, b) => sessionTimestamp(b) - sessionTimestamp(a)),
      }))
      .sort((a, b) => b.latestAt - a.latestAt);
  }, [sessions]);

  const selectedProgram = useMemo(
    () => programGroups.find((group) => group.key === selectedProgramKey) || null,
    [programGroups, selectedProgramKey]
  );

  const allSessions = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return [...sessions]
      .filter((session) => {
        if (!q) return true;
        return (
          session.planTitle.toLowerCase().includes(q) ||
          session.date.toLowerCase().includes(q) ||
          session.entries.some((entry) => entry.exerciseName.toLowerCase().includes(q))
        );
      })
      .sort((a, b) => sessionTimestamp(b) - sessionTimestamp(a));
  }, [sessions, searchQuery]);

  const formatScoreSide = (entry: ExerciseLogEntry, side: 'left' | 'right') => {
    const values = (entry.scoreResults || [])
      .map((round) => (side === 'left' ? round.leftScore : round.rightScore))
      .filter((value): value is number => typeof value === 'number');
    if (!values.length) return '—';
    const unit = entry.scoreUnit || 'point';
    if (values.length === 1) return `${formatNumber(values[0])} ${unit}`;
    return `${values.map(formatNumber).join(' · ')} ${unit}`;
  };

  const renderEntryResults = (entry: ExerciseLogEntry) => {
    if (isScoreEntry(entry)) {
      const singleScores = (entry.scoreResults || [])
        .map((round) => round.score)
        .filter((value): value is number => typeof value === 'number');

      return (
        <div className="flex flex-wrap items-center gap-1.5">
          {entry.scoreResults?.some((round) => typeof round.leftScore === 'number' || typeof round.rightScore === 'number') ? (
            <>
              <span className="font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-lg">V: {formatScoreSide(entry, 'left')}</span>
              <span className="font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-lg">H: {formatScoreSide(entry, 'right')}</span>
            </>
          ) : singleScores.length > 0 ? (
            <span className="font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-lg">
              {singleScores.map(formatNumber).join(' · ')} {entry.scoreUnit || 'point'}
            </span>
          ) : null}
          {typeof entry.lsiPercent === 'number' && (
            <span className="font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-lg">LSI {formatNumber(entry.lsiPercent)}%</span>
          )}
        </div>
      );
    }

    if (entry.separateLegs) {
      return (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-lg">V: {entry.leftLegWeightKg ?? 0} kg ({entry.leftLegReps || entry.reps})</span>
          <span className="font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-lg">H: {entry.rightLegWeightKg ?? 0} kg ({entry.rightLegReps || entry.reps})</span>
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

  const buildProgramChart = (programSessions: CompletedSession[]) => {
    const chronological = [...programSessions].sort((a, b) => sessionTimestamp(a) - sessionTimestamp(b));
    const hasLsi = chronological.some((session) => session.entries.some((entry) => typeof entry.lsiPercent === 'number'));

    if (hasLsi) {
      const series = new Map<string, string>();
      chronological.forEach((session) => session.entries.forEach((entry) => {
        if (typeof entry.lsiPercent === 'number') series.set(entry.exerciseId, entry.exerciseName);
      }));
      const data = chronological.map((session) => {
        const row: Record<string, string | number> = { label: formatDate(session.date) };
        session.entries.forEach((entry) => {
          if (typeof entry.lsiPercent === 'number') row[entry.exerciseId] = entry.lsiPercent;
        });
        return row;
      });
      return { type: 'lsi' as const, data, series: Array.from(series, ([id, name]) => ({ id, name })), unit: '%' };
    }

    const weightedSeries = new Map<string, string>();
    chronological.forEach((session) => session.entries.forEach((entry) => {
      const maxWeight = Math.max(entry.weightKg || 0, entry.leftLegWeightKg || 0, entry.rightLegWeightKg || 0);
      if (maxWeight > 0) weightedSeries.set(entry.exerciseId, entry.exerciseName);
    }));

    if (weightedSeries.size > 0) {
      const data = chronological.map((session) => {
        const row: Record<string, string | number> = { label: formatDate(session.date) };
        session.entries.forEach((entry) => {
          const maxWeight = Math.max(entry.weightKg || 0, entry.leftLegWeightKg || 0, entry.rightLegWeightKg || 0);
          if (maxWeight > 0) row[entry.exerciseId] = maxWeight;
        });
        return row;
      });
      return { type: 'weight' as const, data, series: Array.from(weightedSeries, ([id, name]) => ({ id, name })), unit: 'kg' };
    }

    const scoreSeries = new Map<string, { name: string; unit: string }>();
    chronological.forEach((session) => session.entries.forEach((entry) => {
      const values = (entry.scoreResults || [])
        .flatMap((round) => [round.score, round.leftScore, round.rightScore])
        .filter((value): value is number => typeof value === 'number');
      if (values.length) scoreSeries.set(entry.exerciseId, { name: entry.exerciseName, unit: entry.scoreUnit || 'point' });
    }));

    if (scoreSeries.size > 0) {
      const firstUnit = Array.from(scoreSeries.values())[0]?.unit || 'point';
      const comparable = Array.from(scoreSeries.entries()).filter(([, info]) => info.unit === firstUnit);
      const allowedIds = new Set(comparable.map(([id]) => id));
      const data = chronological.map((session) => {
        const row: Record<string, string | number> = { label: formatDate(session.date) };
        session.entries.forEach((entry) => {
          if (!allowedIds.has(entry.exerciseId)) return;
          const values = (entry.scoreResults || [])
            .flatMap((round) => [round.score, round.leftScore, round.rightScore])
            .filter((value): value is number => typeof value === 'number');
          if (values.length) row[entry.exerciseId] = values.reduce((a, b) => a + b, 0) / values.length;
        });
        return row;
      });
      return { type: 'score' as const, data, series: comparable.map(([id, info]) => ({ id, name: info.name })), unit: firstUnit };
    }

    const data = chronological.map((session) => ({
      label: formatDate(session.date),
      completion: session.totalExercisesCount > 0
        ? Math.round((session.exercisesCompletedCount / session.totalExercisesCount) * 100)
        : 0,
    }));
    return { type: 'completion' as const, data, series: [{ id: 'completion', name: 'Gennemført' }], unit: '%' };
  };

  const handleExportJson = () => {
    const blob = new Blob([JSON.stringify({ sessions, logs, exercises, exportedAt: new Date().toISOString() }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `traeningspas-historik-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const openProgram = (key: string) => {
    setSelectedProgramKey(key);
    setExpandedSessionId(null);
    setMode('program');
  };

  const renderSessionCard = (session: CompletedSession) => {
    const isExpanded = expandedSessionId === session.id;
    const isPartial = session.isPartial || session.status === 'partial' || (session.exercisesCompletedCount + (session.exercisesSkippedCount || 0)) < session.totalExercisesCount;
    const time = formatSessionTime(session.completedAt || session.startedAt);

    return (
      <div key={session.id} className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs">
        <button
          type="button"
          onClick={() => setExpandedSessionId(isExpanded ? null : session.id)}
          className="w-full p-3.5 sm:p-4 text-left flex items-start justify-between gap-3 hover:bg-slate-50 transition-colors"
        >
          <div className="min-w-0 flex gap-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border ${isPartial ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200'}`}>
              {isPartial ? <Clock className="w-4.5 h-4.5" /> : <Check className="w-4.5 h-4.5" />}
            </div>
            <div className="min-w-0">
              <div className="font-bold text-slate-900 text-sm capitalize">{formatDate(session.date, true)}</div>
              <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500">
                {time && <span>Kl. {time}</span>}
                <span>{session.exercisesCompletedCount} udført{session.exercisesSkippedCount ? ` · ${session.exercisesSkippedCount} ikke udført` : ''} · ${session.totalExercisesCount} i alt</span>
                {session.durationSeconds > 0 && <span>{formatDuration(session.durationSeconds)}</span>}
                {isPartial && <span className="font-semibold text-amber-700">Delvist gennemført</span>}
              </div>
            </div>
          </div>
          {isExpanded ? <ChevronUp className="w-4 h-4 text-blue-600 shrink-0 mt-1" /> : <ChevronDown className="w-4 h-4 text-slate-400 shrink-0 mt-1" />}
        </button>

        {isExpanded && (
          <div className="border-t border-slate-100 bg-slate-50/60 p-3.5 sm:p-4 space-y-3">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5">
              {session.entries.map((entry) => {
                const originalEx = exercises.find((e) => e.id === entry.exerciseId);
                return (
                  <div key={entry.id} className="rounded-xl bg-white border border-slate-200 p-3 text-xs">
                    <div className="flex items-start justify-between gap-2">
                      <h5 className="font-bold text-slate-900">{entry.exerciseName}</h5>
                      {originalEx && (
                        <button type="button" onClick={() => setSelectedExerciseForModal(originalEx)} className="text-[10px] text-blue-600 font-semibold whitespace-nowrap">
                          Se øvelse
                        </button>
                      )}
                    </div>
                    <div className="mt-1.5 text-slate-600">{renderEntryResults(entry)}</div>
                    {entry.notes && <p className="text-slate-500 italic mt-2 text-[11px]">“{entry.notes}”</p>}
                  </div>
                );
              })}
              {(session.skippedExercises || []).map((entry) => (
                <div key={`skipped-${entry.exerciseId}`} className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-xs">
                  <div className="font-bold text-slate-900">{entry.exerciseName}</div>
                  <div className="mt-1 text-amber-800 font-semibold">Ikke udført</div>
                  <div className="mt-1 text-slate-600">Begrundelse: {entry.reason === 'time' ? 'Tid' : (entry.reasonText || 'Andet')}</div>
                </div>
              ))}
            </div>
            <div className="flex flex-wrap justify-end gap-2 pt-1">
              {onResumeSession && (
                <button type="button" onClick={() => onResumeSession(session)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold">
                  <Play className="w-3.5 h-3.5 fill-current" /> {isPartial ? 'Gør færdig' : 'Start igen'}
                </button>
              )}
              {onDeleteSession && (
                <button type="button" onClick={() => confirm('Vil du slette dette træningspas fra historikken?') && onDeleteSession(session.id)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-slate-200 text-rose-600 text-xs font-semibold">
                  <Trash2 className="w-3.5 h-3.5" /> Slet
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    );
  };

  const selectedChart = selectedProgram ? buildProgramChart(selectedProgram.sessions) : null;

  return (
    <div className="space-y-4 sm:space-y-5">
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-xs relative overflow-hidden">
        <div className="absolute top-0 left-0 w-24 h-1 bg-blue-600 rounded-br-full" />
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
          <div>
            <div className="flex flex-wrap items-center gap-2.5">
              <h2 className="text-xl font-bold text-slate-900 tracking-tight">Træningshistorik</h2>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">{sessions.length} pas gemt</span>
            </div>
            <p className="text-xs text-slate-500 mt-1 max-w-2xl">
              {mode === 'programs' && 'Vælg et træningsprogram for at se alle gange, du har udført det, og følge udviklingen.'}
              {mode === 'program' && selectedProgram && `${selectedProgram.title} · ${selectedProgram.sessions.length} registrerede pas`}
              {mode === 'all' && 'Alle registrerede træningspas sorteret med det seneste først.'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {mode !== 'programs' && (
              <button type="button" onClick={() => { setMode('programs'); setSelectedProgramKey(null); }} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 text-xs font-semibold">
                <ArrowLeft className="w-3.5 h-3.5" /> Programmer
              </button>
            )}
            {mode !== 'all' && (
              <button type="button" onClick={() => setMode('all')} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-blue-50 border border-blue-100 text-blue-700 text-xs font-bold">
                <List className="w-3.5 h-3.5" /> Se alle træningspas
              </button>
            )}
            <button type="button" onClick={handleExportJson} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white border border-slate-200 text-slate-700 text-xs font-semibold" title="Eksportér backup">
              <Download className="w-3.5 h-3.5 text-blue-600" /> <span className="hidden sm:inline">Eksportér</span>
            </button>
            {onResetToDefaults && (
              <button type="button" onClick={() => confirm('Vil du nulstille til standarddata?') && onResetToDefaults()} className="p-2 rounded-xl bg-white border border-slate-200 text-slate-500" title="Genindlæs standarddata">
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {mode === 'programs' && (
        programGroups.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 sm:gap-4">
            {programGroups.map((group) => {
              const latest = group.sessions[0];
              const completed = group.sessions.filter((session) => !(session.isPartial || session.status === 'partial' || (session.exercisesCompletedCount + (session.exercisesSkippedCount || 0)) < session.totalExercisesCount)).length;
              return (
                <button key={group.key} type="button" onClick={() => openProgram(group.key)} className="bg-white border border-slate-200 rounded-2xl p-4 text-left hover:border-blue-300 hover:bg-blue-50/20 transition-all shadow-xs group">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-bold text-slate-900 text-base leading-snug group-hover:text-blue-700 transition-colors">{group.title}</h3>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <span className="text-[11px] font-semibold bg-slate-100 text-slate-700 rounded-full px-2 py-1">{group.sessions.length} {group.sessions.length === 1 ? 'gang' : 'gange'}</span>
                        <span className="text-[11px] font-semibold bg-emerald-50 text-emerald-700 rounded-full px-2 py-1">{completed} fuldført</span>
                      </div>
                    </div>
                    <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                      <TrendingUp className="w-4.5 h-4.5" />
                    </div>
                  </div>
                  <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-3 text-xs">
                    <div>
                      <div className="text-slate-400 text-[10px] uppercase font-bold tracking-wide">Senest udført</div>
                      <div className="font-semibold text-slate-700 mt-0.5 capitalize">{formatDate(latest.date, true)}</div>
                    </div>
                    <ChevronDown className="w-4 h-4 text-slate-400 -rotate-90" />
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="bg-white border border-slate-200 rounded-2xl p-10 text-center">
            <Calendar className="w-9 h-9 text-slate-300 mx-auto" />
            <h3 className="font-bold text-slate-900 mt-3">Ingen træningshistorik endnu</h3>
          </div>
        )
      )}

      {mode === 'program' && selectedProgram && selectedChart && (
        <>
          <div className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5 shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 mb-4">
              <div>
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-blue-600" />
                  <h3 className="font-bold text-slate-900">Udvikling for {selectedProgram.title}</h3>
                </div>
                <p className="text-[11px] sm:text-xs text-slate-500 mt-1">
                  {selectedChart.type === 'lsi' && 'LSI-resultater for testene på tværs af alle testdatoer.'}
                  {selectedChart.type === 'weight' && 'Højeste registrerede belastning pr. øvelse for hver træning.'}
                  {selectedChart.type === 'score' && `Gennemsnitligt resultat pr. øvelse (${selectedChart.unit}) for hver træning.`}
                  {selectedChart.type === 'completion' && 'Hvor stor en del af programmet der blev gennemført hver gang.'}
                </p>
              </div>
              <span className="text-xs font-semibold bg-slate-100 text-slate-600 rounded-full px-2.5 py-1 self-start">{selectedProgram.sessions.length} pas</span>
            </div>

            {selectedProgram.sessions.length > 1 ? (
              <div className="h-[250px] sm:h-[330px] -ml-3 sm:ml-0">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={selectedChart.data} margin={{ top: 8, right: 10, left: -10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 10 }} minTickGap={12} />
                    <YAxis tick={{ fontSize: 10 }} width={42} unit={selectedChart.unit} domain={selectedChart.type === 'lsi' ? [0, 110] : ['auto', 'auto']} />
                    <Tooltip formatter={(value: any, name: any) => [`${formatNumber(Number(value))} ${selectedChart.unit}`, selectedChart.series.find((item) => item.id === name)?.name || name]} />
                    <Legend formatter={(value) => <span className="text-[10px] sm:text-xs">{selectedChart.series.find((item) => item.id === value)?.name || value}</span>} />
                    {selectedChart.type === 'lsi' && <ReferenceLine y={90} strokeDasharray="5 5" label={{ value: '90%', fontSize: 10 }} />}
                    {selectedChart.series.map((series, index) => (
                      <Line key={series.id} type="monotone" dataKey={series.id} name={series.id} stroke={chartColors[index % chartColors.length]} strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} connectNulls />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 text-xs text-slate-500">Grafen kommer frem, når programmet er registreret mindst to gange.</div>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-2 px-1">
              <h3 className="font-bold text-slate-900 text-sm">Alle gange programmet er udført</h3>
              <span className="text-xs text-slate-500">Seneste først</span>
            </div>
            <div className="space-y-2.5">{selectedProgram.sessions.map(renderSessionCard)}</div>
          </div>
        </>
      )}

      {mode === 'all' && (
        <>
          <div className="bg-white border border-slate-200 rounded-2xl p-3 sm:p-4 shadow-xs">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="Søg i dato, program eller øvelse..." className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-sm focus:outline-none focus:border-blue-500" />
            </div>
          </div>
          <div className="space-y-2.5">
            {allSessions.map((session) => (
              <div key={session.id}>
                <div className="text-[11px] font-bold text-blue-700 mb-1.5 px-1">{session.planTitle}</div>
                {renderSessionCard(session)}
              </div>
            ))}
            {allSessions.length === 0 && <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-sm text-slate-500">Ingen træningspas matcher din søgning.</div>}
          </div>
        </>
      )}

      {selectedExerciseForModal && (
        <ExerciseProgressModal exercise={selectedExerciseForModal} logs={logs} onClose={() => setSelectedExerciseForModal(null)} />
      )}
    </div>
  );
};
