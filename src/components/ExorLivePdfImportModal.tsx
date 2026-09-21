import React, { useState } from 'react';
import { FileUp, Loader2, X, CheckCircle2, AlertCircle, Dumbbell } from 'lucide-react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { Exercise, PlanExercise, WorkoutPlan } from '../types';
import { StorageService } from '../db/storage';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorker;

type ParsedExercise = {
  number: number;
  name: string;
  description: string;
  sets: number;
  reps: string;
  weightKg?: number;
  videoUrl?: string;
  imageDataUrl?: string;
};
import { splitLegacyTargetArea } from '../utils/exerciseTags';

interface Props {
  exercises: Exercise[];
  onSaveExercise: (exercise: Exercise) => Promise<void> | void;
  onSavePlan: (plan: WorkoutPlan) => Promise<void> | void;
  onClose: () => void;
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function inferTargetArea(name: string): string {
  const n = name.toLowerCase();
  if (n.includes('leg curl') || n.includes('sædeløft')) return 'Baglår & Balder';
  if (n.includes('copenhagen') || n.includes('adduktion')) return 'Lysk & Inderlår';
  if (n.includes('planke') || n.includes('bentræk')) return 'Core & Hofte';
  if (n.includes('hofteabduk')) return 'Hofte & Balde';
  if (n.includes('hælløft')) return 'Læg & Ankel';
  if (n.includes('lunge') || n.includes('benpres') || n.includes('extension')) return 'Knæ & Lår';
  return 'Genoptræning';
}

async function cropExerciseImage(
  page: any,
  viewport: any,
  headerY: number,
  nextHeaderY: number | null,
): Promise<string | undefined> {
  const scale = viewport.scale || 1;
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext('2d');
  if (!ctx) return undefined;
  await page.render({ canvasContext: ctx, viewport }).promise;

  const screenHeaderY = viewport.height - headerY * scale;
  const screenNextY = nextHeaderY == null ? Math.min(viewport.height - 60, screenHeaderY + 230 * scale) : viewport.height - nextHeaderY * scale;
  const top = Math.max(0, Math.floor(screenHeaderY - 28 * scale));
  const bottom = Math.min(canvas.height, Math.ceil(screenNextY - 10 * scale));
  const left = Math.floor(22 * scale);
  const width = Math.min(canvas.width - left, Math.floor(viewport.width * 0.37));
  const height = Math.max(80, bottom - top);

  const crop = document.createElement('canvas');
  crop.width = width;
  crop.height = height;
  const cropCtx = crop.getContext('2d');
  if (!cropCtx) return undefined;
  cropCtx.fillStyle = '#ffffff';
  cropCtx.fillRect(0, 0, width, height);
  cropCtx.drawImage(canvas, left, top, width, height, 0, 0, width, height);
  return crop.toDataURL('image/jpeg', 0.84);
}

async function parseExorLivePdf(file: File): Promise<ParsedExercise[]> {
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjsLib.getDocument({ data }).promise;
  const parsed: ParsedExercise[] = [];
  const allVideoUrls: string[] = [];

  for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
    const page = await pdf.getPage(pageNo);
    const content = await page.getTextContent();
    const items = (content.items as any[])
      .filter((item) => typeof item.str === 'string' && item.str.trim())
      .map((item) => ({ str: item.str.trim(), x: item.transform?.[4] || 0, y: item.transform?.[5] || 0 }));

    items.forEach((item) => {
      const urls = item.str.match(/https?:\/\/[^\s]+/g) || [];
      urls.filter((u) => /exorlive\.com\/video/i.test(u)).forEach((u) => allVideoUrls.push(u.replace(/\s+/g, '')));
    });

    const headers = items
      .filter((item) => /^\d+\.\s+/.test(item.str))
      .sort((a, b) => b.y - a.y);

    const viewport = page.getViewport({ scale: 1.55 });

    for (let i = 0; i < headers.length; i++) {
      const header = headers[i];
      const next = headers[i + 1];
      const minY = next ? next.y + 2 : header.y - 145;
      const rowItems = items
        .filter((it) => it.y <= header.y + 5 && it.y > minY)
        .sort((a, b) => Math.abs(b.y - a.y) > 2 ? b.y - a.y : a.x - b.x);

      const rowText = normalizeWhitespace(rowItems.map((x) => x.str).join(' '));
      const headerMatch = header.str.match(/^(\d+)\.\s+(.+)$/);
      if (!headerMatch) continue;
      const number = Number(headerMatch[1]);
      const name = normalizeWhitespace(headerMatch[2]);
      const sets = Number(rowText.match(/Sæt\s*:\s*(\d+)/i)?.[1] || 3);
      const reps = rowText.match(/Gentagelser\s*:\s*([0-9]+(?:\s*-\s*[0-9]+)?)/i)?.[1]?.replace(/\s/g, '') || '10-15';
      const rawWeight = rowText.match(/Vægt\s*:\s*([0-9]+(?:[.,][0-9]+)?)\s*kg/i)?.[1];
      const weightKg = rawWeight ? Number(rawWeight.replace(',', '.')) : undefined;

      let description = rowText.replace(header.str, '').trim();
      description = description.replace(/Vægt\s*:.*$/i, '').replace(/Sæt\s*:.*$/i, '').trim();
      if (!description) description = 'Importeret fra ExorLive PDF.';

      let imageDataUrl: string | undefined;
      try {
        imageDataUrl = await cropExerciseImage(page, viewport, header.y, next?.y ?? null);
      } catch (err) {
        console.warn('Kunne ikke udtrække øvelsesbillede fra PDF', err);
      }

      parsed.push({ number, name, description, sets, reps, weightKg, imageDataUrl });
    }
  }

  parsed.sort((a, b) => a.number - b.number);
  parsed.forEach((item, index) => {
    item.videoUrl = allVideoUrls[index];
  });
  return parsed;
}

export const ExorLivePdfImportModal: React.FC<Props> = ({ exercises, onSaveExercise, onSavePlan, onClose }) => {
  const [items, setItems] = useState<ParsedExercise[]>([]);
  const [fileName, setFileName] = useState('');
  const [planTitle, setPlanTitle] = useState('Importeret ExorLive program');
  const [frequency, setFrequency] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const handleFile = async (file: File) => {
    setIsParsing(true);
    setError(null);
    setDone(false);
    setFileName(file.name);
    setPlanTitle(file.name.replace(/\.pdf$/i, '') || 'Importeret ExorLive program');
    try {
      const parsed = await parseExorLivePdf(file);
      if (!parsed.length) throw new Error('Jeg kunne ikke finde nummererede ExorLive-øvelser i PDF-filen.');
      setItems(parsed);
    } catch (err: any) {
      console.error(err);
      setError(err?.message || 'PDF-filen kunne ikke læses.');
    } finally {
      setIsParsing(false);
    }
  };

  const importAll = async () => {
    if (!items.length) return;
    setIsImporting(true);
    setError(null);
    try {
      const importedExercises: Exercise[] = [];
      const stamp = Date.now();
      for (const item of items) {
        const normalizedName = item.name.replace(/^\d+\.\s*/, '').trim().toLowerCase();
        const existing = exercises.find((ex) => ex.name.replace(/^\d+\.\s*/, '').trim().toLowerCase() === normalizedName);
        let imageUrl = existing?.imageUrl;
        if (item.imageDataUrl) {
          imageUrl = await StorageService.uploadImage(item.imageDataUrl, `exorlive-${item.number}.jpg`);
        }
        const exercise: Exercise = {
          id: existing?.id || `ex-import-${stamp}-${item.number}`,
          name: `${item.number}. ${item.name.replace(/^\d+\.\s*/, '')}`,
          description: item.description,
          imageUrl,
          imagePosition: imageUrl ? { x: 50, y: 50, scale: 1 } : undefined,
          videoUrl: item.videoUrl || existing?.videoUrl,
          targetArea: existing?.targetArea || inferTargetArea(item.name),
          categories: existing?.categories || splitLegacyTargetArea(existing?.targetArea || inferTargetArea(item.name)),
          defaultSets: item.sets,
          defaultReps: item.reps,
          defaultWeightKg: item.weightKg ?? existing?.defaultWeightKg,
          isUnilateralByDefault: existing?.isUnilateralByDefault ?? /etbens|lunge|hofteabduk|copenhagen/i.test(item.name),
          trackingMode: 'sets_reps_weight',
          createdAt: existing?.createdAt || new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        await onSaveExercise(exercise);
        importedExercises.push(exercise);
      }

      const planExercises: PlanExercise[] = importedExercises.map((ex, index) => ({
        id: `pe-import-${stamp}-${index + 1}`,
        exerciseId: ex.id,
        name: ex.name,
        description: ex.description,
        imageUrl: ex.imageUrl,
        imagePosition: ex.imagePosition,
        videoUrl: ex.videoUrl,
        targetArea: ex.targetArea,
        categories: ex.categories,
        sets: ex.defaultSets,
        reps: ex.defaultReps,
        weightKg: ex.defaultWeightKg,
        separateLegs: !!ex.isUnilateralByDefault,
        leftLegWeightKg: ex.defaultWeightKg,
        leftLegReps: ex.defaultReps,
        rightLegWeightKg: ex.defaultWeightKg,
        rightLegReps: ex.defaultReps,
        trackingMode: ex.trackingMode,
      }));

      await onSavePlan({
        id: `plan-exorlive-${stamp}`,
        title: planTitle.trim() || 'Importeret ExorLive program',
        description: `Automatisk importeret fra ${fileName}.`,
        frequency: frequency.trim() || undefined,
        scheduledDates: [],
        exercises: planExercises,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      setDone(true);
    } catch (err: any) {
      setError(err?.message || 'Importen fejlede.');
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/65 backdrop-blur-sm p-4 overflow-y-auto" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="w-full max-w-3xl bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden my-8">
        <div className="h-1 bg-blue-600" />
        <div className="p-5 border-b border-slate-100 flex items-start justify-between gap-4">
          <div>
            <h3 className="font-bold text-slate-900">Importer ExorLive PDF</h3>
            <p className="text-xs text-slate-500 mt-1">Finder øvelser, tekst, sæt/reps og beskærer illustrationerne fra ExorLive-layoutet. Du kan bagefter redigere alt normalt.</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100"><X className="w-5 h-5" /></button>
        </div>

        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          {!items.length && !done && (
            <label className="block border-2 border-dashed border-slate-300 hover:border-blue-400 rounded-2xl p-10 text-center cursor-pointer bg-slate-50/60">
              <input type="file" accept="application/pdf,.pdf" className="hidden" onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])} />
              {isParsing ? <Loader2 className="w-8 h-8 mx-auto animate-spin text-blue-600" /> : <FileUp className="w-8 h-8 mx-auto text-blue-600" />}
              <div className="mt-3 text-sm font-bold text-slate-800">{isParsing ? 'Læser PDF…' : 'Vælg ExorLive PDF'}</div>
              <div className="text-xs text-slate-500 mt-1">Filen behandles i din browser; de udtrukne øvelsesbilleder gemmes derefter i din fælles database.</div>
            </label>
          )}

          {error && <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex gap-2"><AlertCircle className="w-4 h-4 shrink-0" />{error}</div>}

          {items.length > 0 && !done && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div><label className="text-[10px] uppercase font-semibold text-slate-500">Programnavn</label><input value={planTitle} onChange={(e) => setPlanTitle(e.target.value)} className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm" /></div>
                <div><label className="text-[10px] uppercase font-semibold text-slate-500">Hyppighed (valgfri)</label><input value={frequency} onChange={(e) => setFrequency(e.target.value)} placeholder="fx Max 2 gange om ugen" className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm" /></div>
              </div>
              <div className="text-xs font-semibold text-slate-700">Fundet {items.length} øvelser i {fileName}</div>
              <div className="space-y-2">
                {items.map((item) => (
                  <div key={item.number} className="flex gap-3 p-3 rounded-xl border border-slate-200 bg-slate-50/50">
                    <div className="w-24 h-20 rounded-lg bg-white border border-slate-200 overflow-hidden flex items-center justify-center shrink-0">
                      {item.imageDataUrl ? <img src={item.imageDataUrl} className="w-full h-full object-contain" /> : <Dumbbell className="w-7 h-7 text-slate-300" />}
                    </div>
                    <div className="min-w-0"><div className="text-xs font-bold text-slate-900">{item.number}. {item.name}</div><div className="text-[11px] text-slate-500 line-clamp-2 mt-1">{item.description}</div><div className="text-[11px] font-semibold text-blue-700 mt-1">{item.sets} sæt × {item.reps}{item.weightKg ? ` · ${item.weightKg} kg` : ''}</div></div>
                  </div>
                ))}
              </div>
              <div className="flex justify-end gap-2 pt-2"><button onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100">Annuller</button><button onClick={importAll} disabled={isImporting} className="px-5 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-bold disabled:opacity-50 flex items-center gap-2">{isImporting && <Loader2 className="w-4 h-4 animate-spin" />}{isImporting ? 'Importerer…' : 'Opret program + øvelser'}</button></div>
            </>
          )}

          {done && <div className="py-10 text-center"><CheckCircle2 className="w-10 h-10 mx-auto text-emerald-600" /><h4 className="font-bold text-slate-900 mt-3">Programmet er importeret</h4><p className="text-xs text-slate-500 mt-1">Øvelserne ligger nu i biblioteket og programmet er gemt i MongoDB.</p><button onClick={onClose} className="mt-4 px-5 py-2.5 rounded-xl bg-blue-600 text-white text-xs font-bold">Luk</button></div>}
        </div>
      </div>
    </div>
  );
};
