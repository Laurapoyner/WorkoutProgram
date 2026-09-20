import React, { useState, useRef, useMemo } from 'react';
import { X, Upload, Dumbbell, Image as ImageIcon, Video, Layers, Check, Plus, Trash2, Loader2, Database } from 'lucide-react';
import { Exercise, ImagePosition } from '../types';
import { createExerciseSvg } from '../db/defaultData';
import { StorageService } from '../db/storage';
import { ImageFocalAdjuster } from './ImageFocalAdjuster';
import { compressImageFile } from '../utils/imageCompressor';

interface AddExerciseModalProps {
  onClose: () => void;
  onSave: (exercise: Exercise) => Promise<void> | void;
  exercises?: Exercise[];
  existingCategories?: string[];
}

const DEFAULT_CATEGORIES = [
  'Knæ & Lår',
  'Hofte & Bækken',
  'Læg & Ankel',
  'Core & Ryg',
  'Overkrop & Skulder',
  'Balance & Stabilitet',
  'Kondition & Opvarmning',
];

export const AddExerciseModal: React.FC<AddExerciseModalProps> = ({
  onClose,
  onSave,
  exercises = [],
  existingCategories = [],
}) => {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  // Extract unique categories from defaults, exercises and existingCategories
  const allCategories = useMemo(() => {
    const set = new Set<string>(DEFAULT_CATEGORIES);
    existingCategories.forEach((cat) => {
      if (cat && cat.trim()) set.add(cat.trim());
    });
    exercises.forEach((ex) => {
      if (ex.targetArea && ex.targetArea.trim()) set.add(ex.targetArea.trim());
    });
    return Array.from(set);
  }, [exercises, existingCategories]);

  const [selectedCategory, setSelectedCategory] = useState<string>('Knæ & Lår');
  const [isCustomCategory, setIsCustomCategory] = useState(false);
  const [customCategoryText, setCustomCategoryText] = useState('');

  const [defaultSets, setDefaultSets] = useState(3);
  const [defaultReps, setDefaultReps] = useState('10-15');
  const [defaultWeightKg, setDefaultWeightKg] = useState<number | ''>('');
  const [isUnilateralByDefault, setIsUnilateralByDefault] = useState(false);
  const [videoUrl, setVideoUrl] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [imagePreview, setImagePreview] = useState<string | null>(null);
  const [imagePosition, setImagePosition] = useState<ImagePosition>({ x: 50, y: 50, scale: 1 });
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      alert('Vælg venligst en gyldig billedfil (PNG, JPG, WebP el.lign.)');
      return;
    }
    setIsUploading(true);
    setSaveError(null);
    try {
      // 1. Optimize/compress locally
      const compressedDataUrl = await compressImageFile(file, 1400, 1400, 0.86);
      setImagePreview(compressedDataUrl);

      // 2. Upload directly to MongoDB Atlas
      const savedUrl = await StorageService.uploadImage(compressedDataUrl, file.name);
      setImageUrl(savedUrl);
    } catch (err: any) {
      console.error('Billedupload fejl:', err);
      // Fallback
      const reader = new FileReader();
      reader.onload = (e) => {
        const result = e.target?.result as string;
        setImagePreview(result);
        setImageUrl(result);
      };
      reader.readAsDataURL(file);
    } finally {
      setIsUploading(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileUpload(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFileUpload(file);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const finalTargetArea =
      (isCustomCategory ? customCategoryText.trim() : selectedCategory.trim()) || 'Knæ & Lår';

    const newExercise: Exercise = {
      id: `ex-custom-${Date.now()}`,
      name: name.trim(),
      description: description.trim(),
      targetArea: finalTargetArea,
      defaultSets: Number(defaultSets) || 3,
      defaultReps: defaultReps.trim() || '10-15',
      defaultWeightKg: defaultWeightKg === '' ? undefined : Number(defaultWeightKg),
      isUnilateralByDefault,
      videoUrl: videoUrl.trim() || undefined,
      imageUrl: imageUrl || createExerciseSvg(name.trim(), 'custom'),
      imagePosition: imageUrl ? imagePosition : undefined,
      createdAt: new Date().toISOString(),
    };

    setIsSaving(true);
    setSaveError(null);
    try {
      await onSave(newExercise);
      onClose();
    } catch (err: any) {
      console.error('Fejl ved oprettelse af øvelse:', err);
      setSaveError(err.message || 'Kunne ikke gemme øvelsen i MongoDB Atlas.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      id="add-exercise-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        id="add-exercise-modal-card"
        className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-xl overflow-hidden text-slate-900 my-8 flex flex-col max-h-[90vh]"
      >
        {/* Top Royal Blue Accent Strip */}
        <div className="h-1 bg-blue-600 w-full" />

        {/* Modal Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-100 bg-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center">
              <Dumbbell className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Tilføj ny øvelse</h2>
              <p className="text-xs text-slate-500">Upload billede, beskrivelse og standardopsætning</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-5 flex-1">
          {/* Image upload area */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  Øvelsesbillede / Foto
                </label>
                {imagePreview && (
                  <span className="text-[10px] font-medium text-blue-600 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100">
                    Træk for at tilpasse frame
                  </span>
                )}
              </div>
              {imagePreview && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="text-xs text-blue-600 hover:text-blue-700 font-medium"
                  >
                    Skift foto
                  </button>
                  <span className="text-slate-300">•</span>
                  <button
                    type="button"
                    onClick={() => {
                      setImagePreview(null);
                      setImageUrl('');
                      setImagePosition({ x: 50, y: 50, scale: 1 });
                    }}
                    className="text-xs text-rose-500 hover:text-rose-600 flex items-center gap-1 font-medium"
                  >
                    <Trash2 className="w-3 h-3" />
                    Fjern
                  </button>
                </div>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              className="hidden"
            />

            {imagePreview ? (
              <div className="relative">
                <ImageFocalAdjuster
                  imageUrl={imagePreview}
                  position={imagePosition}
                  onChangePosition={setImagePosition}
                />
                {isUploading && (
                  <div className="absolute inset-0 bg-white/80 backdrop-blur-xs flex items-center justify-center rounded-2xl z-10">
                    <div className="flex items-center gap-2 text-xs font-semibold text-blue-600">
                      <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                      Uploader billede...
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-5 text-center cursor-pointer transition-all ${
                  isDragging
                    ? 'border-blue-500 bg-blue-50/50'
                    : 'border-slate-300 hover:border-blue-400 bg-slate-50/60 hover:bg-blue-50/20'
                }`}
              >
                <div className="space-y-2 py-2">
                  <div className="w-10 h-10 mx-auto rounded-full bg-blue-100 text-blue-600 flex items-center justify-center">
                    <Upload className="w-5 h-5" />
                  </div>
                  <p className="text-sm font-semibold text-slate-800">
                    Træk og slip billede her, eller klik for at uploade
                  </p>
                  <p className="text-xs text-slate-500">
                    Understøtter JPG, PNG, WebP (fx fotos fra mobil eller screenshots)
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Title */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Øvelsens navn *
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="fx 13. Squat til boks"
              className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 text-sm"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
              Instruktion & Vejledning *
            </label>
            <textarea
              required
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Beskriv udgangsposition, bevægelse, tempo og teknik..."
              className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-900 placeholder-slate-400 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 text-sm resize-none"
            />
          </div>

          {/* Target area & video url */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-blue-600" />
                  Fokusområde / Muskelgruppe
                </span>
                <span className="text-[10px] text-blue-600 font-semibold normal-case">
                  Vælg fra liste
                </span>
              </label>

              {/* Category Dropdown with existing categories */}
              <select
                id="exercise-target-area-select"
                value={isCustomCategory ? '__custom__' : selectedCategory}
                onChange={(e) => {
                  if (e.target.value === '__custom__') {
                    setIsCustomCategory(true);
                  } else {
                    setIsCustomCategory(false);
                    setSelectedCategory(e.target.value);
                  }
                }}
                className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-900 text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 font-medium"
              >
                <optgroup label="Eksisterende kategorier">
                  {allCategories.map((cat) => (
                    <option key={cat} value={cat}>
                      {cat}
                    </option>
                  ))}
                </optgroup>
                <option value="__custom__">➕ Opret ny kategori (skriv selv)...</option>
              </select>

              {/* Custom category input if selected */}
              {isCustomCategory && (
                <div className="mt-2 animate-in fade-in duration-200">
                  <input
                    type="text"
                    autoFocus
                    value={customCategoryText}
                    onChange={(e) => setCustomCategoryText(e.target.value)}
                    placeholder="Indtast navnet på den nye kategori..."
                    className="w-full px-3 py-2 rounded-xl bg-blue-50/50 border border-blue-400 text-slate-900 text-xs focus:outline-none focus:ring-2 focus:ring-blue-100 placeholder-slate-400"
                  />
                  <div className="flex items-center justify-between mt-1 px-1">
                    <span className="text-[10px] text-slate-500">
                      Denne nye kategori bliver også tilgængelig i fremtidige programmer.
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsCustomCategory(false)}
                      className="text-[10px] text-blue-600 hover:underline font-medium"
                    >
                      Brug liste igen
                    </button>
                  </div>
                </div>
              )}

              {/* Quick suggestion chips */}
              <div className="mt-2 flex flex-wrap gap-1">
                {allCategories.slice(0, 5).map((cat) => (
                  <button
                    type="button"
                    key={cat}
                    onClick={() => {
                      setIsCustomCategory(false);
                      setSelectedCategory(cat);
                    }}
                    className={`px-2 py-0.5 rounded-md text-[10px] font-medium transition-colors ${
                      !isCustomCategory && selectedCategory === cat
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5 flex items-center gap-1.5">
                <Video className="w-3.5 h-3.5 text-blue-600" />
                Videolink (valgfri)
              </label>
              <input
                type="url"
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                placeholder="https://exorlive.com/... el. YouTube"
                className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 text-slate-900 text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>
          </div>

          {/* Default sets, reps, weight */}
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Sæt
              </label>
              <input
                type="number"
                min="1"
                max="20"
                value={defaultSets}
                onChange={(e) => setDefaultSets(parseInt(e.target.value, 10) || 1)}
                className="w-full px-3.5 py-2 rounded-xl bg-white border border-slate-300 text-slate-900 text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Gentagelser
              </label>
              <input
                type="text"
                value={defaultReps}
                onChange={(e) => setDefaultReps(e.target.value)}
                placeholder="10-15"
                className="w-full px-3.5 py-2 rounded-xl bg-white border border-slate-300 text-slate-900 text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1.5">
                Vægt (kg)
              </label>
              <input
                type="number"
                step="0.5"
                min="0"
                value={defaultWeightKg}
                onChange={(e) => setDefaultWeightKg(e.target.value === '' ? '' : parseFloat(e.target.value))}
                placeholder="0 = krop"
                className="w-full px-3.5 py-2 rounded-xl bg-white border border-slate-300 text-slate-900 text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
              />
            </div>
          </div>

          {/* Unilateral toggle */}
          <div>
            <label className="flex items-center gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer hover:bg-blue-50/30 transition-colors">
              <input
                type="checkbox"
                checked={isUnilateralByDefault}
                onChange={(e) => setIsUnilateralByDefault(e.target.checked)}
                className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500 focus:ring-offset-white accent-blue-600 cursor-pointer"
              />
              <div className="text-xs">
                <span className="font-semibold text-slate-800 block">
                  Etbens-øvelse (udføres normalt på ét ben ad gangen)
                </span>
                <span className="text-slate-500">
                  Aktiverer automatisk individuel registrering for venstre og højre ben
                </span>
              </div>
            </label>
          </div>

          {saveError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 flex items-center gap-2">
              <span className="font-semibold">Fejl:</span> {saveError}
            </div>
          )}

          <div className="flex items-center justify-between gap-3 pt-4 border-t border-slate-100">
            <div className="flex items-center gap-1.5 text-xs text-emerald-700 font-medium">
              <Database className="w-3.5 h-3.5 text-emerald-600" />
              <span>Gemmes i MongoDB Atlas</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={isSaving}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-100 transition-colors disabled:opacity-50"
              >
                Annuller
              </button>
              <button
                type="submit"
                disabled={isSaving || isUploading}
                className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-all shadow-sm shadow-blue-600/30 flex items-center gap-1.5 disabled:opacity-50"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Gemmer i MongoDB...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Gem øvelse i biblioteket</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
