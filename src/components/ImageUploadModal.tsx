import React, { useState, useRef } from 'react';
import {
  X,
  Upload,
  Image as ImageIcon,
  Check,
  Link,
  Sparkles,
  Camera,
  Trash2,
} from 'lucide-react';
import { StorageService } from '../db/storage';
import { Exercise } from '../types';

interface ImageUploadModalProps {
  exercise: Exercise;
  onClose: () => void;
  onSaveImage: (updatedExercise: Exercise) => void;
}

// Preset exercise illustrations that look crisp, modern, and clinical
const PRESET_ILLUSTRATIONS = [
  {
    name: 'Benpres / Squat',
    url: 'https://images.unsplash.com/photo-1574680096145-d05b474e2155?w=600&auto=format&fit=crop&q=80',
  },
  {
    name: 'Knæstræk & Bøj',
    url: 'https://images.unsplash.com/photo-1581009146145-b5ef050c2e1e?w=600&auto=format&fit=crop&q=80',
  },
  {
    name: 'Udstrækning & Fleksibilitet',
    url: 'https://images.unsplash.com/photo-1518611012118-696072aa579a?w=600&auto=format&fit=crop&q=80',
  },
  {
    name: 'Balance & Stabilitet',
    url: 'https://images.unsplash.com/photo-1517838277536-f5f99be501cd?w=600&auto=format&fit=crop&q=80',
  },
  {
    name: 'Læg & Ankelløft',
    url: 'https://images.unsplash.com/photo-1534438327276-14e5300c3a48?w=600&auto=format&fit=crop&q=80',
  },
  {
    name: 'Fysioterapi & Måtte',
    url: 'https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=600&auto=format&fit=crop&q=80',
  },
];

export const ImageUploadModal: React.FC<ImageUploadModalProps> = ({
  exercise,
  onClose,
  onSaveImage,
}) => {
  const [activeTab, setActiveTab] = useState<'upload' | 'url' | 'presets'>('upload');
  const [currentImage, setCurrentImage] = useState(exercise.imageUrl || '');
  const [urlInput, setUrlInput] = useState('');
  const [isUploading, setIsUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      alert('Vælg venligst en gyldig billedfil (PNG, JPG, WebP el.lign.)');
      return;
    }
    setIsUploading(true);
    const reader = new FileReader();
    reader.onload = async (e) => {
      const base64 = e.target?.result as string;
      try {
        const savedUrl = await StorageService.uploadImage(base64, file.name);
        setCurrentImage(savedUrl);
      } catch {
        setCurrentImage(base64);
      } finally {
        setIsUploading(false);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      processFile(file);
    }
  };

  const handleApplyUrl = () => {
    if (urlInput.trim()) {
      setCurrentImage(urlInput.trim());
      setUrlInput('');
    }
  };

  const handleSave = () => {
    const updated: Exercise = {
      ...exercise,
      imageUrl: currentImage,
    };
    onSaveImage(updated);
    onClose();
  };

  return (
    <div
      id="image-upload-modal-backdrop"
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 overflow-y-auto"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        id="image-upload-modal-card"
        className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-lg overflow-hidden text-slate-900 my-8 flex flex-col relative"
      >
        {/* Top accent line matching screenshot style in Royal Blue */}
        <div className="h-1 bg-blue-600 w-full" />

        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 border border-blue-100 flex items-center justify-center">
              <Camera className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">Tilføj billede til øvelse</h2>
              <p className="text-xs text-slate-500 line-clamp-1">{exercise.name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Current Image Preview */}
        <div className="px-6 pt-5">
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-500">
              Forhåndsvisning
            </label>
            {currentImage && (
              <button
                type="button"
                onClick={() => setCurrentImage('')}
                className="text-xs text-rose-500 hover:text-rose-600 flex items-center gap-1 font-medium"
              >
                <Trash2 className="w-3.5 h-3.5" />
                Fjern billede
              </button>
            )}
          </div>
          <div className="w-full h-44 bg-slate-50 border border-slate-200 rounded-xl overflow-hidden flex items-center justify-center relative">
            {currentImage ? (
              <img
                src={currentImage}
                alt="Øvelsesbillede"
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="text-center p-4 text-slate-400">
                <ImageIcon className="w-10 h-10 mx-auto mb-2 opacity-40 text-slate-400" />
                <p className="text-xs font-medium text-slate-500">Intet billede valgt endnu</p>
                <p className="text-[11px] text-slate-400">Vælg en fil, indsæt link eller vælg fra galleriet nedenfor</p>
              </div>
            )}
            {isUploading && (
              <div className="absolute inset-0 bg-white/80 backdrop-blur-xs flex items-center justify-center">
                <div className="flex items-center gap-2 text-xs font-semibold text-blue-600">
                  <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
                  Uploader billede...
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Tab Controls */}
        <div className="px-6 pt-4">
          <div className="flex bg-slate-100 p-1 rounded-xl gap-1">
            <button
              type="button"
              onClick={() => setActiveTab('upload')}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                activeTab === 'upload'
                  ? 'bg-white text-blue-600 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Upload className="w-3.5 h-3.5" />
              Upload fra enhed
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('url')}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                activeTab === 'url'
                  ? 'bg-white text-blue-600 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Link className="w-3.5 h-3.5" />
              Billedlink (URL)
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('presets')}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg flex items-center justify-center gap-1.5 transition-all ${
                activeTab === 'presets'
                  ? 'bg-white text-blue-600 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" />
              Eksempler
            </button>
          </div>
        </div>

        {/* Tab Contents */}
        <div className="p-6">
          {activeTab === 'upload' && (
            <div>
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${
                  isDragging
                    ? 'border-blue-500 bg-blue-50/50'
                    : 'border-slate-300 hover:border-blue-400 bg-slate-50/60 hover:bg-blue-50/20'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <div className="w-10 h-10 mx-auto rounded-full bg-blue-100 text-blue-600 flex items-center justify-center mb-2">
                  <Upload className="w-5 h-5" />
                </div>
                <p className="text-sm font-semibold text-slate-800">
                  Klik for at vælge billede, eller træk & slip her
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Tag et foto med mobilen, upload PDF-screenshot eller JPG/PNG
                </p>
              </div>
            </div>
          )}

          {activeTab === 'url' && (
            <div className="space-y-3">
              <label className="block text-xs font-semibold text-slate-600">
                Indsæt direkte webadresse til billedet
              </label>
              <div className="flex gap-2">
                <input
                  type="url"
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  placeholder="https://eksempel.dk/billede.jpg"
                  className="flex-1 px-3.5 py-2 rounded-xl bg-white border border-slate-300 text-slate-900 placeholder-slate-400 text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                />
                <button
                  type="button"
                  onClick={handleApplyUrl}
                  className="px-4 py-2 bg-blue-600 text-white rounded-xl text-xs font-semibold hover:bg-blue-700 transition-colors shadow-xs"
                >
                  Brug link
                </button>
              </div>
              <p className="text-[11px] text-slate-400">
                Tip: Du kan kopiere et billedlink fra ExorLive, Google Billeder eller din foretrukne træningsside.
              </p>
            </div>
          )}

          {activeTab === 'presets' && (
            <div>
              <p className="text-xs text-slate-500 mb-3 font-medium">
                Vælg et passende klinisk illustration-billede:
              </p>
              <div className="grid grid-cols-3 gap-2.5 max-h-48 overflow-y-auto pr-1">
                {PRESET_ILLUSTRATIONS.map((preset, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setCurrentImage(preset.url)}
                    className={`relative rounded-xl overflow-hidden border group transition-all text-left ${
                      currentImage === preset.url
                        ? 'border-blue-600 ring-2 ring-blue-500'
                        : 'border-slate-200 hover:border-blue-300'
                    }`}
                  >
                    <img
                      src={preset.url}
                      alt={preset.name}
                      className="w-full h-16 object-cover group-hover:scale-105 transition-transform duration-300"
                      referrerPolicy="no-referrer"
                    />
                    <div className="p-1.5 bg-white text-[10px] font-semibold text-slate-800 truncate">
                      {preset.name}
                    </div>
                    {currentImage === preset.url && (
                      <div className="absolute top-1 right-1 w-5 h-5 bg-blue-600 text-white rounded-full flex items-center justify-center">
                        <Check className="w-3 h-3 stroke-[3]" />
                      </div>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 bg-slate-50 border-t border-slate-100">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-600 hover:bg-slate-200/70 transition-colors"
          >
            Annuller
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold transition-all shadow-sm shadow-blue-600/30 flex items-center gap-1.5"
          >
            <Check className="w-4 h-4" />
            Gem billede til øvelse
          </button>
        </div>
      </div>
    </div>
  );
};
