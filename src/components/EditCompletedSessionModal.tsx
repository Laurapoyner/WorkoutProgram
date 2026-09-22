import React, { useEffect, useMemo, useState } from 'react';
import { Save, X, Clock, CalendarDays } from 'lucide-react';
import { CompletedSession, ExerciseLogEntry, ScoreRoundResult } from '../types';

interface EditCompletedSessionModalProps {
  session: CompletedSession;
  onClose: () => void;
  onSave: (session: CompletedSession) => Promise<void> | void;
}

const dateOnly = (isoOrDate: string) => {
  if (!isoOrDate) return '';
  return isoOrDate.slice(0, 10);
};

const moveIsoToDate = (iso: string, date: string) => {
  const current = iso ? new Date(iso) : new Date();
  const [y, m, d] = date.split('-').map(Number);
  if (!y || !m || !d) return iso;
  current.setFullYear(y, m - 1, d);
  return current.toISOString();
};

const scoreSymmetry = (entry: ExerciseLogEntry): number | undefined => {
  const left = (entry.scoreResults || []).map((r) => r.leftScore).filter((v): v is number => typeof v === 'number');
  const right = (entry.scoreResults || []).map((r) => r.rightScore).filter((v): v is number => typeof v === 'number');
  if (!left.length || !right.length) return undefined;
  const pick = (values: number[]) => entry.lowerScoreIsBetter ? Math.min(...values) : Math.max(...values);
  const a = pick(left);
  const b = pick(right);
  if (a === 0 && b === 0) return 100;
  const max = Math.max(Math.abs(a), Math.abs(b));
  if (max === 0) return undefined;
  return Math.round((Math.min(Math.abs(a), Math.abs(b)) / max) * 1000) / 10;
};

const cloneSession = (session: CompletedSession): CompletedSession => JSON.parse(JSON.stringify(session));

export const EditCompletedSessionModal: React.FC<EditCompletedSessionModalProps> = ({ session, onClose, onSave }) => {
  const [draft, setDraft] = useState<CompletedSession>(() => cloneSession(session));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => setDraft(cloneSession(session)), [session]);

  const durationMinutes = useMemo(() => Math.floor((draft.durationSeconds || 0) / 60), [draft.durationSeconds]);

  const updateEntry = (id: string, patch: Partial<ExerciseLogEntry>) => {
    setDraft((prev) => ({
      ...prev,
      entries: prev.entries.map((entry) => entry.id === id ? { ...entry, ...patch } : entry),
    }));
  };

  const updateScoreRound = (entryId: string, roundIndex: number, patch: Partial<ScoreRoundResult>) => {
    setDraft((prev) => ({
      ...prev,
      entries: prev.entries.map((entry) => {
        if (entry.id !== entryId) return entry;
        const rounds = [...(entry.scoreResults || [])];
        rounds[roundIndex] = { ...(rounds[roundIndex] || { round: roundIndex + 1 }), ...patch };
        const updated = { ...entry, scoreResults: rounds };
        return { ...updated, lsiPercent: scoreSymmetry(updated) };
      }),
    }));
  };

  const handleDateChange = (newDate: string) => {
    setDraft((prev) => ({
      ...prev,
      date: newDate,
      startedAt: moveIsoToDate(prev.startedAt, newDate),
      completedAt: moveIsoToDate(prev.completedAt, newDate),
      entries: prev.entries.map((entry) => ({
        ...entry,
        date: newDate,
        timestamp: new Date(moveIsoToDate(new Date(entry.timestamp || Date.now()).toISOString(), newDate)).getTime(),
      })),
    }));
  };

  const handleSave = async () => {
    setError('');
    if (!draft.date) {
      setError('Vælg en dato for træningspasset.');
      return;
    }
    try {
      setSaving(true);
      const normalizedEntries = draft.entries.map((entry) => ({
        ...entry,
        lsiPercent: entry.trackingMode === 'timed_score' ? scoreSymmetry(entry) : entry.lsiPercent,
      }));
      await onSave({ ...draft, entries: normalizedEntries });
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Træningspasset kunne ikke gemmes.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-slate-950/40 flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true" aria-label="Rediger træningspas">
      <div className="bg-white w-full sm:max-w-3xl max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-3xl shadow-2xl">
        <div className="sticky top-0 z-10 bg-white border-b border-slate-200 px-4 sm:px-6 py-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg sm:text-xl font-bold text-slate-900">Rediger træningspas</h2>
            <p className="text-xs text-slate-500 mt-0.5">Ændringer gemmes i det eksisterende pas og opdaterer historik og grafer.</p>
          </div>
          <button type="button" onClick={onClose} className="w-10 h-10 rounded-xl border border-slate-200 flex items-center justify-center text-slate-500" aria-label="Luk">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 sm:p-6 space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block">
              <span className="text-xs font-bold text-slate-600 flex items-center gap-1.5 mb-1.5"><CalendarDays className="w-3.5 h-3.5" /> Dato</span>
              <input type="date" value={dateOnly(draft.date)} onChange={(e) => handleDateChange(e.target.value)} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
            </label>
            <label className="block">
              <span className="text-xs font-bold text-slate-600 flex items-center gap-1.5 mb-1.5"><Clock className="w-3.5 h-3.5" /> Varighed (min)</span>
              <input type="number" min="0" step="1" value={durationMinutes} onChange={(e) => setDraft((prev) => ({ ...prev, durationSeconds: Math.max(0, Number(e.target.value) || 0) * 60 }))} className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
            </label>
            <label className="block">
              <span className="text-xs font-bold text-slate-600 mb-1.5 block">Opvarmning</span>
              <input value={draft.warmupType || ''} onChange={(e) => setDraft((prev) => ({ ...prev, warmupType: e.target.value }))} placeholder="Fx cykel, løbebånd..." className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
            </label>
            <label className="block">
              <span className="text-xs font-bold text-slate-600 mb-1.5 block">Opvarmningstid (min)</span>
              <input type="number" min="0" step="1" value={draft.warmupMinutes || ''} onChange={(e) => setDraft((prev) => ({ ...prev, warmupMinutes: Math.max(0, Number(e.target.value) || 0) || undefined }))} placeholder="0" className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm" />
            </label>
            <label className="block sm:col-span-2">
              <span className="text-xs font-bold text-slate-600 mb-1.5 block">Note til hele passet</span>
              <textarea rows={2} value={draft.notes || ''} onChange={(e) => setDraft((prev) => ({ ...prev, notes: e.target.value }))} placeholder="Fx træt i dag, øm i knæet, god energi..." className="w-full rounded-xl border border-slate-200 px-3 py-2.5 text-sm resize-y" />
            </label>
          </div>

          <div>
            <h3 className="font-bold text-slate-900 mb-2">Udførte øvelser</h3>
            <div className="space-y-3">
              {draft.entries.map((entry) => (
                <div key={entry.id} className="rounded-2xl border border-slate-200 p-3.5 sm:p-4">
                  <div className="font-bold text-slate-900 text-sm mb-3">{entry.exerciseName}</div>

                  {entry.trackingMode === 'timed_score' ? (
                    <div className="space-y-2.5">
                      {(entry.scoreResults || []).map((round, index) => {
                        const sideScores = typeof round.leftScore === 'number' || typeof round.rightScore === 'number';
                        return (
                          <div key={index} className="grid grid-cols-1 sm:grid-cols-[80px_1fr_1fr] gap-2 items-end bg-slate-50 rounded-xl p-3">
                            <div className="text-xs font-bold text-slate-500">Forsøg {round.round || index + 1}</div>
                            {sideScores ? (
                              <>
                                <label className="text-xs text-slate-600">Venstre ({entry.scoreUnit || 'score'})<input type="number" step="any" value={round.leftScore ?? ''} onChange={(e) => updateScoreRound(entry.id, index, { leftScore: e.target.value === '' ? undefined : Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm bg-white" /></label>
                                <label className="text-xs text-slate-600">Højre ({entry.scoreUnit || 'score'})<input type="number" step="any" value={round.rightScore ?? ''} onChange={(e) => updateScoreRound(entry.id, index, { rightScore: e.target.value === '' ? undefined : Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm bg-white" /></label>
                              </>
                            ) : (
                              <label className="text-xs text-slate-600 sm:col-span-2">Resultat ({entry.scoreUnit || 'score'})<input type="number" step="any" value={round.score ?? ''} onChange={(e) => updateScoreRound(entry.id, index, { score: e.target.value === '' ? undefined : Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm bg-white" /></label>
                            )}
                          </div>
                        );
                      })}
                      {typeof entry.lsiPercent === 'number' && <div className="text-xs font-semibold text-slate-600">LSI: {entry.lsiPercent}%</div>}
                    </div>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                        <label className="text-xs text-slate-600">Sæt<input type="number" min="0" value={entry.sets} onChange={(e) => updateEntry(entry.id, { sets: Math.max(0, Number(e.target.value) || 0) })} className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm" /></label>
                        <label className="text-xs text-slate-600">Gentagelser<input value={entry.reps} onChange={(e) => updateEntry(entry.id, { reps: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm" /></label>
                        {!entry.separateLegs && <label className="text-xs text-slate-600 col-span-2 sm:col-span-1">Belastning (kg)<input type="number" step="0.5" min="0" value={entry.weightKg ?? 0} onChange={(e) => updateEntry(entry.id, { weightKg: Math.max(0, Number(e.target.value) || 0) })} className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm" /></label>}
                      </div>
                      {entry.separateLegs && (
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 mt-2.5 bg-slate-50 rounded-xl p-3">
                          <label className="text-xs text-slate-600">V kg<input type="number" step="0.5" min="0" value={entry.leftLegWeightKg ?? 0} onChange={(e) => updateEntry(entry.id, { leftLegWeightKg: Math.max(0, Number(e.target.value) || 0) })} className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm bg-white" /></label>
                          <label className="text-xs text-slate-600">V reps<input value={entry.leftLegReps || ''} onChange={(e) => updateEntry(entry.id, { leftLegReps: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm bg-white" /></label>
                          <label className="text-xs text-slate-600">H kg<input type="number" step="0.5" min="0" value={entry.rightLegWeightKg ?? 0} onChange={(e) => updateEntry(entry.id, { rightLegWeightKg: Math.max(0, Number(e.target.value) || 0) })} className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm bg-white" /></label>
                          <label className="text-xs text-slate-600">H reps<input value={entry.rightLegReps || ''} onChange={(e) => updateEntry(entry.id, { rightLegReps: e.target.value })} className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm bg-white" /></label>
                        </div>
                      )}
                    </>
                  )}

                  <label className="block mt-3 text-xs text-slate-600">Note<input value={entry.notes || ''} onChange={(e) => updateEntry(entry.id, { notes: e.target.value })} placeholder="Valgfri note" className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm" /></label>
                </div>
              ))}
            </div>
          </div>

          {(draft.skippedExercises?.length || 0) > 0 && (
            <div>
              <h3 className="font-bold text-slate-900 mb-2">Ikke udførte øvelser</h3>
              <div className="space-y-2.5">
                {(draft.skippedExercises || []).map((skipped, index) => (
                  <div key={`${skipped.exerciseId}-${index}`} className="rounded-2xl border border-amber-200 bg-amber-50/50 p-3.5">
                    <div className="font-bold text-slate-900 text-sm">{skipped.exerciseName}</div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 mt-2.5">
                      <label className="text-xs text-slate-600">Begrundelse
                        <select value={skipped.reason} onChange={(e) => setDraft((prev) => ({ ...prev, skippedExercises: (prev.skippedExercises || []).map((item, i) => i === index ? { ...item, reason: e.target.value as 'time' | 'other', reasonText: e.target.value === 'time' ? undefined : item.reasonText } : item) }))} className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm bg-white">
                          <option value="time">Tid</option><option value="other">Andet</option>
                        </select>
                      </label>
                      {skipped.reason === 'other' && <label className="text-xs text-slate-600">Forklaring<input value={skipped.reasonText || ''} onChange={(e) => setDraft((prev) => ({ ...prev, skippedExercises: (prev.skippedExercises || []).map((item, i) => i === index ? { ...item, reasonText: e.target.value } : item) }))} className="mt-1 w-full rounded-lg border border-slate-200 px-2.5 py-2 text-sm bg-white" /></label>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && <div className="rounded-xl border border-rose-200 bg-rose-50 text-rose-700 text-sm px-3 py-2.5">{error}</div>}
        </div>

        <div className="sticky bottom-0 bg-white border-t border-slate-200 p-4 sm:px-6 flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-700 font-semibold text-sm">Annuller</button>
          <button type="button" disabled={saving} onClick={handleSave} className="px-4 py-2.5 rounded-xl bg-blue-600 text-white font-bold text-sm inline-flex items-center gap-2 disabled:opacity-60">
            <Save className="w-4 h-4" /> {saving ? 'Gemmer…' : 'Gem ændringer'}
          </button>
        </div>
      </div>
    </div>
  );
};
