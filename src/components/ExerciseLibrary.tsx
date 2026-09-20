import React, { useState, useMemo } from 'react';
import {
  Plus,
  Search,
  Dumbbell,
  TrendingUp,
  ExternalLink,
  Filter,
  Trash2,
  Camera,
  Image as ImageIcon,
  Pencil,
} from 'lucide-react';
import { Exercise, ExerciseLogEntry } from '../types';
import { AddExerciseModal } from './AddExerciseModal';
import { ExerciseProgressModal } from './ExerciseProgressModal';
import { ImageUploadModal } from './ImageUploadModal';
import { getExerciseImageStyle } from '../utils/imageStyle';

interface ExerciseLibraryProps {
  exercises: Exercise[];
  logs: ExerciseLogEntry[];
  onSaveExercise: (exercise: Exercise) => Promise<void> | void;
  onDeleteExercise: (id: string) => Promise<void> | void;
}

export const ExerciseLibrary: React.FC<ExerciseLibraryProps> = ({
  exercises,
  logs,
  onSaveExercise,
  onDeleteExercise,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedArea, setSelectedArea] = useState<string>('alle');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [selectedExerciseForModal, setSelectedExerciseForModal] = useState<Exercise | null>(null);
  const [selectedExerciseForImage, setSelectedExerciseForImage] = useState<Exercise | null>(null);
  const [selectedExerciseForEdit, setSelectedExerciseForEdit] = useState<Exercise | null>(null);

  // Derive unique target areas for filtering
  const targetAreas = useMemo(() => {
    const areas = new Set<string>();
    exercises.forEach((ex) => {
      if (ex.targetArea) areas.add(ex.targetArea);
    });
    return Array.from(areas);
  }, [exercises]);

  const filteredExercises = useMemo(() => {
    return exercises.filter((ex) => {
      const matchesSearch =
        ex.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        ex.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (ex.targetArea && ex.targetArea.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesArea =
        selectedArea === 'alle' || ex.targetArea?.toLowerCase() === selectedArea.toLowerCase();

      return matchesSearch && matchesArea;
    });
  }, [exercises, searchQuery, selectedArea]);

  return (
    <div className="space-y-6">
      {/* Top Banner & Header Card */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs relative overflow-hidden flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        {/* Blue accent strip */}
        <div className="absolute top-0 left-0 w-24 h-1 bg-blue-600 rounded-br-full" />

        <div className="pt-1">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">
              Øvelsesbibliotek
            </h2>
            <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
              {exercises.length} øvelser
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Gennemse kliniske genoptræningsøvelser, tilføj dine egne billeder og følg belastningskurver over tid.
          </p>
        </div>

        <button
          id="btn-add-new-exercise"
          onClick={() => setIsAddModalOpen(true)}
          className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-all shadow-sm shadow-blue-600/30 shrink-0 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          <span>Opret ny øvelse</span>
        </button>
      </div>

      {/* Filter and Search controls */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            id="search-exercise-input"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Søg i øvelser, muskelgrupper eller teknik..."
            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-900 placeholder-slate-400 text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition-all shadow-xs"
          />
        </div>

        {targetAreas.length > 0 && (
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 md:pb-0">
            <span className="text-xs text-slate-500 flex items-center gap-1 shrink-0 pl-1">
              <Filter className="w-3.5 h-3.5" />
              Område:
            </span>
            <button
              onClick={() => setSelectedArea('alle')}
              className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                selectedArea === 'alle'
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              Alle ({exercises.length})
            </button>
            {targetAreas.map((area) => (
              <button
                key={area}
                onClick={() => setSelectedArea(area)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap transition-all ${
                  selectedArea.toLowerCase() === area.toLowerCase()
                    ? 'bg-blue-600 text-white shadow-xs'
                    : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {area}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Exercises Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filteredExercises.map((exercise) => {
          const exerciseLogsCount = logs.filter((l) => l.exerciseId === exercise.id).length;

          return (
            <div
              key={exercise.id}
              className="bg-white rounded-2xl border border-slate-200 shadow-xs hover:border-blue-300 hover:shadow-md transition-all flex flex-col overflow-hidden group"
            >
              {/* Exercise Image Thumbnail & Quick Photo Edit Button */}
              <div className="relative h-44 bg-slate-100 overflow-hidden border-b border-slate-100 group/img">
                {exercise.imageUrl ? (
                  <img
                    src={exercise.imageUrl}
                    alt={exercise.name}
                    className="w-full h-full transition-transform duration-300 group-hover:scale-105"
                    style={getExerciseImageStyle(exercise.imagePosition)}
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center bg-slate-100 text-slate-400">
                    <Dumbbell className="w-10 h-10 opacity-30 text-slate-400" />
                  </div>
                )}

                {/* Badge for focus area */}
                <div className="absolute top-3 left-3 flex flex-wrap gap-1">
                  <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-white/95 text-slate-800 shadow-xs backdrop-blur-xs">
                    {exercise.targetArea || 'Knæ & Ben'}
                  </span>
                  {exercise.isUnilateralByDefault && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500 text-white shadow-xs">
                      Etbens
                    </span>
                  )}
                </div>

                {/* Direct "Tilføj / Skift Billede" Button */}
                <button
                  type="button"
                  onClick={() => setSelectedExerciseForImage(exercise)}
                  className="absolute bottom-2.5 right-2.5 px-2.5 py-1.5 rounded-lg bg-white/95 hover:bg-white text-blue-700 shadow-sm text-xs font-semibold flex items-center gap-1.5 transition-all opacity-95 group-hover/img:opacity-100"
                  title="Upload eller skift billede"
                >
                  <Camera className="w-3.5 h-3.5" />
                  <span>{exercise.imageUrl ? 'Skift billede' : 'Tilføj billede'}</span>
                </button>
              </div>

              {/* Card Body */}
              <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-900 tracking-tight line-clamp-1 group-hover:text-blue-600 transition-colors">
                    {exercise.name}
                  </h3>
                  <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                    {exercise.description}
                  </p>
                </div>

                {/* Exercise parameters and links */}
                <div className="space-y-3 pt-2 border-t border-slate-100">
                  <div className="flex items-center justify-between text-xs text-slate-600">
                    <span className="font-medium text-slate-500">Standard:</span>
                    <span className="font-semibold text-slate-800">
                      {exercise.defaultSets} sæt × {exercise.defaultReps}
                      {exercise.defaultWeightKg ? ` (${exercise.defaultWeightKg} kg)` : ''}
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2 pt-1">
                    {exercise.videoUrl ? (
                      <a
                        href={exercise.videoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 text-xs text-blue-600 hover:text-blue-700 font-semibold"
                      >
                        <span>Se video</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    ) : (
                      <span className="text-[11px] text-slate-400">Ingen video tilknyttet</span>
                    )}

                    <div className="flex items-center gap-1.5">
                      {/* Delete button if custom */}
                      {exercise.id.startsWith('ex-custom') && (
                        <button
                          onClick={() => {
                            if (confirm(`Er du sikker på du vil slette "${exercise.name}"?`)) {
                              onDeleteExercise(exercise.id);
                            }
                          }}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                          title="Slet øvelse"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}

                      <button
                        onClick={() => setSelectedExerciseForEdit(exercise)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors"
                        title="Rediger øvelse"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                        <span>Rediger</span>
                      </button>

                      {/* Progress button */}
                      <button
                        onClick={() => setSelectedExerciseForModal(exercise)}
                        className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold transition-colors"
                      >
                        <TrendingUp className="w-3.5 h-3.5" />
                        <span>Fremgang ({exerciseLogsCount})</span>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {filteredExercises.length === 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-500">
          <Dumbbell className="w-10 h-10 mx-auto mb-2 opacity-30 text-slate-400" />
          <h3 className="text-base font-bold text-slate-900">Ingen øvelser fundet</h3>
          <p className="text-xs text-slate-500 mt-1">
            Ingen øvelser matchede søgningen "{searchQuery}".
          </p>
        </div>
      )}

      {/* Modal: Add New Exercise */}
      {isAddModalOpen && (
        <AddExerciseModal
          exercises={exercises}
          onClose={() => setIsAddModalOpen(false)}
          onSave={onSaveExercise}
        />
      )}

      {/* Modal: Exercise Progress Graph */}
      {selectedExerciseForModal && (
        <ExerciseProgressModal
          exercise={selectedExerciseForModal}
          logs={logs}
          onClose={() => setSelectedExerciseForModal(null)}
        />
      )}

      {/* Modal: Edit exercise */}
      {selectedExerciseForEdit && (
        <AddExerciseModal
          exercises={exercises}
          exerciseToEdit={selectedExerciseForEdit}
          onClose={() => setSelectedExerciseForEdit(null)}
          onSave={async (updated) => {
            await onSaveExercise(updated);
            setSelectedExerciseForEdit(null);
          }}
        />
      )}

      {/* Modal: Upload / Change Image for Exercise */}
      {selectedExerciseForImage && (
        <ImageUploadModal
          exercise={selectedExerciseForImage}
          onClose={() => setSelectedExerciseForImage(null)}
          onSaveImage={async (updated) => {
            await onSaveExercise(updated);
            setSelectedExerciseForImage(null);
          }}
        />
      )}
    </div>
  );
};
