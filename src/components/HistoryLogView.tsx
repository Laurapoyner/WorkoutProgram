import React, { useState } from 'react';
import {
  Calendar,
  Clock,
  CheckCircle2,
  TrendingUp,
  Dumbbell,
  Layers,
  ChevronRight,
  Download,
  RotateCcw,
  Check,
} from 'lucide-react';
import { CompletedSession, Exercise, ExerciseLogEntry } from '../types';
import { ExerciseProgressModal } from './ExerciseProgressModal';

interface HistoryLogViewProps {
  sessions: CompletedSession[];
  exercises: Exercise[];
  logs: ExerciseLogEntry[];
  onResetToDefaults?: () => void;
}

export const HistoryLogView: React.FC<HistoryLogViewProps> = ({
  sessions,
  exercises,
  logs,
  onResetToDefaults,
}) => {
  const [selectedExerciseForModal, setSelectedExerciseForModal] = useState<Exercise | null>(null);
  const [expandedSessionId, setExpandedSessionId] = useState<string | null>(
    sessions.length > 0 ? sessions[0]?.id || null : null
  );

  const sortedSessions = [...sessions].sort(
    (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()
  );

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
    a.download = `traeningssystem-backup-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Header Card */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs relative overflow-hidden flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="absolute top-0 left-0 w-24 h-1 bg-blue-600 rounded-br-full" />

        <div className="pt-1">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">
              Træningshistorik & Resultater
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
              {sessions.length} pas gemt
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Alle dine afsluttede træningspas, tidsforbrug, belastningsudvikling for hvert ben og historiske noter.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleExportJson}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition-colors border border-slate-200 shadow-xs"
            title="Eksporter alle data som JSON backup"
          >
            <Download className="w-3.5 h-3.5 text-blue-600" />
            <span>Eksportér backup</span>
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
              <span>Gendan standard</span>
            </button>
          )}
        </div>
      </div>

      {sortedSessions.length > 0 ? (
        <div className="space-y-4">
          {sortedSessions.map((session) => {
            const isExpanded = expandedSessionId === session.id;

            return (
              <div
                key={session.id}
                className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-xs hover:border-blue-300 transition-all"
              >
                {/* Session Header Clickable Card */}
                <div
                  onClick={() => setExpandedSessionId(isExpanded ? null : session.id)}
                  className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 cursor-pointer hover:bg-slate-50/70 transition-colors"
                >
                  <div className="flex items-start sm:items-center gap-3.5">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center shrink-0">
                      <Check className="w-5 h-5 stroke-[2.5]" />
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
                      </div>
                      <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                        <span className="flex items-center gap-1">
                          <Dumbbell className="w-3.5 h-3.5 text-slate-400" />
                          {session.exercisesCompletedCount} af {session.totalExercisesCount} øvelser udført
                        </span>
                        {session.durationSeconds > 0 && (
                          <span className="flex items-center gap-1 text-slate-700 font-medium">
                            <Clock className="w-3.5 h-3.5 text-blue-600" />
                            {Math.floor(session.durationSeconds / 60)} min {session.durationSeconds % 60} sek
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 font-medium">
                      {isExpanded ? 'Skjul øvelser' : 'Vis detaljer'}
                    </span>
                    <ChevronRight
                      className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${
                        isExpanded ? 'rotate-90 text-blue-600' : ''
                      }`}
                    />
                  </div>
                </div>

                {/* Expanded exercise entries */}
                {isExpanded && (
                  <div className="p-5 pt-0 border-t border-slate-100 bg-slate-50/50 space-y-3">
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
                                {entry.separateLegs ? (
                                  <div className="flex items-center gap-2">
                                    <span className="font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                                      V: {entry.leftLegWeightKg ?? 0} kg ({entry.leftLegReps || entry.reps} reps)
                                    </span>
                                    <span>•</span>
                                    <span className="font-semibold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">
                                      H: {entry.rightLegWeightKg ?? 0} kg ({entry.rightLegReps || entry.reps} reps)
                                    </span>
                                  </div>
                                ) : (
                                  <span>
                                    {entry.sets} sæt × {entry.reps} gentagelser
                                    {entry.weightKg !== undefined && entry.weightKg > 0
                                      ? ` @ ${entry.weightKg} kg`
                                      : ' (kropsvægt)'}
                                  </span>
                                )}

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
      ) : (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center space-y-3 shadow-xs">
          <Calendar className="w-10 h-10 text-slate-400 mx-auto" />
          <h3 className="text-base font-bold text-slate-900">Ingen gennemførte pas endnu</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto">
            Gå til "Dagens Træning", udfør øvelserne og klik på "Gem træningspas". Dine resultater gemmes automatisk i databasen og vises her.
          </p>
        </div>
      )}

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
