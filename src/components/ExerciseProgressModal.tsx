import React, { useMemo } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from 'recharts';
import { X, Calendar, Dumbbell, ExternalLink, Activity, Clock } from 'lucide-react';
import { Exercise, ExerciseLogEntry } from '../types';
import { getExerciseImageStyle } from '../utils/imageStyle';

interface ExerciseProgressModalProps {
  exercise: Exercise | null;
  logs: ExerciseLogEntry[];
  onClose: () => void;
}

export const ExerciseProgressModal: React.FC<ExerciseProgressModalProps> = ({
  exercise,
  logs,
  onClose,
}) => {
  if (!exercise) return null;

  // Filter logs for this exercise and sort by date ascending
  const exerciseLogs = useMemo(() => {
    return logs
      .filter((l) => l.exerciseId === exercise.id)
      .sort((a, b) => a.timestamp - b.timestamp);
  }, [logs, exercise.id]);

  const isScoreMode = exercise.trackingMode === 'timed_score' || exerciseLogs.some((l) => l.trackingMode === 'timed_score');

  // Transform logs for Recharts
  const chartData = useMemo(() => {
    return exerciseLogs.map((log) => {
      const repNum = parseInt(log.reps?.replace(/[^0-9]/g, '') || '0', 10);
      const leftScores = (log.scoreResults || []).map((r) => r.leftScore).filter((v): v is number => typeof v === 'number');
      const rightScores = (log.scoreResults || []).map((r) => r.rightScore).filter((v): v is number => typeof v === 'number');
      const pick = (values: number[]) => log.lowerScoreIsBetter ? Math.min(...values) : Math.max(...values);
      const leftScore = leftScores.length ? pick(leftScores) : null;
      const rightScore = rightScores.length ? pick(rightScores) : null;
      let symmetry = log.lsiPercent ?? null;
      if (symmetry == null && leftScore != null && rightScore != null) {
        if (leftScore === 0 && rightScore === 0) symmetry = 100;
        else {
          const max = Math.max(Math.abs(leftScore), Math.abs(rightScore));
          symmetry = max ? Math.round((Math.min(Math.abs(leftScore), Math.abs(rightScore)) / max) * 1000) / 10 : null;
        }
      }
      return {
        date: log.date,
        formattedDate: new Date(log.date).toLocaleDateString('da-DK', { day: 'numeric', month: 'short' }),
        weight: log.weightKg !== undefined ? log.weightKg : null,
        leftLegWeight: log.leftLegWeightKg !== undefined ? log.leftLegWeightKg : null,
        rightLegWeight: log.rightLegWeightKg !== undefined ? log.rightLegWeightKg : null,
        reps: repNum > 0 ? repNum : null,
        durationMin: log.durationSeconds ? Math.round((log.durationSeconds / 60) * 10) / 10 : null,
        lsi: symmetry,
        leftScore,
        rightScore,
      };
    });
  }, [exerciseLogs]);

  const hasSeparateLegData = exerciseLogs.some(
    (l) => l.separateLegs && (l.leftLegWeightKg !== undefined || l.rightLegWeightKg !== undefined)
  );

  return (
    <div
      id="exercise-progress-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        id="exercise-progress-modal-card"
        className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-3xl overflow-hidden text-slate-900 my-8 flex flex-col max-h-[90vh]"
      >
        {/* Royal Blue Top Accent */}
        <div className="h-1 bg-blue-600 w-full" />

        {/* Modal Header */}
        <div className="flex items-start justify-between p-6 border-b border-slate-100 bg-white">
          <div className="flex-1 pr-4">
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-100">
                {exercise.targetArea || 'Knæ & Ben'}
              </span>
              {exercise.isUnilateralByDefault && (
                <span className="px-2.5 py-0.5 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200">
                  Etbens øvelse
                </span>
              )}
            </div>
            <h2 className="text-lg font-bold text-slate-900 tracking-tight">{exercise.name}</h2>
          </div>
          <button
            id="close-progress-modal-btn"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
            title="Luk"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 bg-slate-50/40">
          {/* Top details preview */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
            {exercise.imageUrl && (
              <div className="rounded-lg overflow-hidden border border-slate-100 bg-slate-50 flex items-center justify-center">
                <img
                  src={exercise.imageUrl}
                  alt={exercise.name}
                  className="w-full h-32"
                  style={getExerciseImageStyle(exercise.imagePosition)}
                  referrerPolicy="no-referrer"
                />
              </div>
            )}

            <div className={`${exercise.imageUrl ? 'md:col-span-2' : 'md:col-span-3'} space-y-2`}>
              <p className="text-xs text-slate-600 leading-relaxed">{exercise.description}</p>

              <div className="flex flex-wrap gap-2 pt-2 text-xs">
                <div className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 text-slate-700 font-medium">
                  <Dumbbell className="w-3.5 h-3.5 text-blue-600" />
                  <span>
                    {isScoreMode ? `Standard: ${exercise.defaultRounds || exercise.defaultSets || 1} runder/forsøg${exercise.defaultDurationSeconds ? ` × ${exercise.defaultDurationSeconds} sek.` : ''}` : `Standard: ${exercise.defaultSets} sæt × ${exercise.defaultReps} gentagelser`}
                  </span>
                </div>

                {exercise.videoUrl && (
                  <a
                    href={exercise.videoUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-blue-50 text-blue-700 hover:bg-blue-100 transition-colors font-semibold"
                  >
                    <span>Se instruktionsvideo</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                )}
              </div>
            </div>
          </div>

          {/* Progress Chart */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                  <Activity className="w-4 h-4" />
                </div>
                <h3 className="text-sm font-bold text-slate-900">
                  {isScoreMode ? 'Fremgang i LSI / symmetri over tid' : 'Fremgang & Vægtbelastning over tid'}
                </h3>
              </div>
              <span className="text-xs text-slate-500">
                {exerciseLogs.length} registreringer i alt
              </span>
            </div>

            {chartData.length > 0 ? (
              <div className="w-full h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData} margin={{ top: 10, right: 15, left: -20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                    <XAxis
                      dataKey="formattedDate"
                      stroke="#94a3b8"
                      fontSize={11}
                      tickLine={false}
                      axisLine={{ stroke: '#e2e8f0' }}
                    />
                    <YAxis
                      stroke="#94a3b8"
                      fontSize={11}
                      tickLine={false}
                      axisLine={{ stroke: '#e2e8f0' }}
                      label={{
                        value: isScoreMode ? 'LSI / symmetri (%)' : 'Belastning (kg)',
                        angle: -90,
                        position: 'insideLeft',
                        offset: 25,
                        fill: '#64748b',
                        fontSize: 10,
                      }}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: '#ffffff',
                        borderColor: '#e2e8f0',
                        borderRadius: '12px',
                        fontSize: '12px',
                        color: '#0f172a',
                        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />

                    {isScoreMode ? (
                      <Line type="monotone" dataKey="lsi" name="LSI / symmetri (%)" stroke="#2563eb" strokeWidth={2.5} dot={{ r: 4, fill: '#2563eb' }} activeDot={{ r: 6 }} />
                    ) : (
                      <>
                        {hasSeparateLegData ? (
                          <>
                            <Line type="monotone" dataKey="leftLegWeight" name="Venstre ben (kg)" stroke="#2563eb" strokeWidth={2.5} dot={{ r: 4, fill: '#2563eb' }} activeDot={{ r: 6 }} />
                            <Line type="monotone" dataKey="rightLegWeight" name="Højre ben (kg)" stroke="#0284c7" strokeWidth={2.5} dot={{ r: 4, fill: '#0284c7' }} activeDot={{ r: 6 }} />
                          </>
                        ) : (
                          <Line type="monotone" dataKey="weight" name="Samlet vægt (kg)" stroke="#2563eb" strokeWidth={2.5} dot={{ r: 4, fill: '#2563eb' }} activeDot={{ r: 6 }} />
                        )}
                        <Line type="monotone" dataKey="reps" name="Gentagelser" stroke="#10b981" strokeWidth={1.5} strokeDasharray="4 4" dot={{ r: 3, fill: '#10b981' }} />
                      </>
                    )}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            ) : (
              <div className="py-10 text-center text-slate-400">
                <Calendar className="w-8 h-8 mx-auto mb-2 opacity-40 text-slate-400" />
                <p className="text-xs font-medium text-slate-500">
                  Der er endnu ikke logget udførte pas for denne øvelse.
                </p>
                <p className="text-[11px] text-slate-400">
                  Når du gennemfører dagens pas med denne øvelse, vises fremgangskurven her automatisk.
                </p>
              </div>
            )}
          </div>

          {/* Historical Log Entries Table */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-xs">
            <h4 className="text-xs font-bold text-slate-900 uppercase tracking-wider mb-3">
              Historiske registreringer
            </h4>
            {exerciseLogs.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-100 text-slate-500 font-semibold">
                      <th className="pb-2.5">Dato</th>
                      {isScoreMode ? (<>
                        <th className="pb-2.5">Resultater</th>
                        <th className="pb-2.5">LSI / symmetri</th>
                      </>) : (<>
                        <th className="pb-2.5">Sæt × Reps</th>
                        <th className="pb-2.5">Belastning</th>
                      </>)}
                      <th className="pb-2.5">Noter</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {exerciseLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-slate-50/80 transition-colors align-top">
                        <td className="py-2.5 font-medium text-slate-800 whitespace-nowrap">{new Date(log.date).toLocaleDateString('da-DK', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                        {isScoreMode ? (<>
                          <td className="py-2.5 text-slate-600 min-w-52">
                            {(log.scoreResults || []).map((r) => <div key={r.round} className="whitespace-nowrap">R{r.round}: {r.leftScore !== undefined ? `V ${r.leftScore}` : ''}{r.leftScore !== undefined && r.rightScore !== undefined ? ' · ' : ''}{r.rightScore !== undefined ? `H ${r.rightScore}` : ''}{r.score !== undefined ? r.score : ''} {log.scoreUnit || ''}{r.notes ? ` — ${r.notes}` : ''}</div>)}
                          </td>
                          <td className="py-2.5 font-bold text-blue-700">{log.lsiPercent !== undefined ? `${log.lsiPercent}%` : chartData.find((d) => d.date === log.date)?.lsi != null ? `${chartData.find((d) => d.date === log.date)?.lsi}%` : '—'}</td>
                        </>) : (<>
                          <td className="py-2.5 text-slate-600">{log.sets} sæt × {log.reps} reps</td>
                          <td className="py-2.5 font-semibold text-blue-700">{log.separateLegs ? <span>V: {log.leftLegWeightKg ?? 0} kg | H: {log.rightLegWeightKg ?? 0} kg</span> : <span>{log.weightKg ? `${log.weightKg} kg` : 'Kropsvægt'}</span>}</td>
                        </>)}
                        <td className="py-2.5 text-slate-500 italic max-w-xs">{log.notes || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-xs text-slate-400">Ingen historik fundet.</p>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-end px-6 py-4 bg-slate-50 border-t border-slate-100">
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-colors"
          >
            Luk vindue
          </button>
        </div>
      </div>
    </div>
  );
};
