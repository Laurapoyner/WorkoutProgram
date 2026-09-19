import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  Move,
  RotateCcw,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Crosshair,
  Grid,
} from 'lucide-react';
import { ImagePosition } from '../types';
import { getExerciseImageStyle } from '../utils/imageStyle';

interface ImageFocalAdjusterProps {
  imageUrl: string;
  position: ImagePosition;
  onChangePosition: (newPos: ImagePosition) => void;
  aspectRatioLabel?: string;
}

export const ImageFocalAdjuster: React.FC<ImageFocalAdjusterProps> = ({
  imageUrl,
  position,
  onChangePosition,
  aspectRatioLabel = 'Kort-visning (16:9)',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number; posX: number; posY: number } | null>(
    null
  );
  const [showGrid, setShowGrid] = useState(true);

  const currentX = typeof position.x === 'number' ? position.x : 50;
  const currentY = typeof position.y === 'number' ? position.y : 50;
  const currentScale = typeof position.scale === 'number' ? position.scale : 1;

  // Pointer Down (Mouse or Touch)
  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (!containerRef.current) return;

    // Set pointer capture to receive drag events even outside the box
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // Ignored if not supported
    }

    setIsDragging(true);
    setDragStart({
      x: e.clientX,
      y: e.clientY,
      posX: currentX,
      posY: currentY,
    });
  };

  // Pointer Move
  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
      if (!isDragging || !dragStart || !containerRef.current) return;

      const rect = containerRef.current.getBoundingClientRect();
      const deltaX = e.clientX - dragStart.x;
      const deltaY = e.clientY - dragStart.y;

      // Sensitivity calculation: dragging moves the image opposite to pointer (panning viewport)
      // Dividing by scale so zoomed images pan naturally with the finger/cursor
      const sensitivity = 0.9 / (currentScale || 1);
      const percentDeltaX = (deltaX / rect.width) * 100 * sensitivity;
      const percentDeltaY = (deltaY / rect.height) * 100 * sensitivity;

      // When dragging right, we want to see the left of the image (decrease X).
      // When dragging left, we want to see the right of the image (increase X).
      const newX = Math.max(0, Math.min(100, Math.round(dragStart.posX - percentDeltaX)));
      const newY = Math.max(0, Math.min(100, Math.round(dragStart.posY - percentDeltaY)));

      onChangePosition({
        x: newX,
        y: newY,
        scale: currentScale,
      });
    },
    [isDragging, dragStart, currentScale, onChangePosition]
  );

  // Pointer Up / Cancel
  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDragging) {
      setIsDragging(false);
      setDragStart(null);
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        // Ignored
      }
    }
  };

  // Update zoom
  const handleScaleChange = (newScale: number) => {
    const clampedScale = Math.max(1, Math.min(2.5, Number(newScale.toFixed(2))));
    onChangePosition({
      x: currentX,
      y: currentY,
      scale: clampedScale,
    });
  };

  // Quick preset positions
  const handlePreset = (presetX: number, presetY: number) => {
    onChangePosition({
      x: presetX,
      y: presetY,
      scale: currentScale,
    });
  };

  // Reset to default
  const handleReset = () => {
    onChangePosition({
      x: 50,
      y: 50,
      scale: 1,
    });
  };

  return (
    <div className="space-y-3 select-none">
      {/* Interactive Drag & Preview Stage */}
      <div className="relative group">
        <div
          ref={containerRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className={`w-full h-52 sm:h-56 bg-slate-900 rounded-2xl overflow-hidden relative border-2 transition-all cursor-grab active:cursor-grabbing touch-none ${
            isDragging
              ? 'border-blue-500 shadow-lg shadow-blue-500/20 ring-2 ring-blue-400/40'
              : 'border-slate-200 hover:border-blue-400'
          }`}
          title="Klik og træk her for at justere billedets udsnit"
        >
          {/* Main Image with dynamic object position and scale */}
          <img
            src={imageUrl}
            alt="Justering af øvelsesbillede"
            className="w-full h-full pointer-events-none transition-transform duration-75 select-none"
            style={getExerciseImageStyle({
              x: currentX,
              y: currentY,
              scale: currentScale,
            })}
            referrerPolicy="no-referrer"
          />

          {/* Alignment Grid Overlay (3x3 rule of thirds) */}
          {showGrid && (
            <div
              className={`absolute inset-0 pointer-events-none transition-opacity duration-200 grid grid-cols-3 grid-rows-3 ${
                isDragging ? 'opacity-80' : 'opacity-30 group-hover:opacity-60'
              }`}
            >
              <div className="border-r border-b border-white/60" />
              <div className="border-r border-b border-white/60" />
              <div className="border-b border-white/60" />
              <div className="border-r border-b border-white/60" />
              <div className="border-r border-b border-white/60" />
              <div className="border-b border-white/60" />
              <div className="border-r border-white/60" />
              <div className="border-r border-white/60" />
              <div />
            </div>
          )}

          {/* Focal Point Indicator Crosshair while dragging or hovering */}
          <div
            className={`absolute pointer-events-none transition-opacity duration-150 transform -translate-x-1/2 -translate-y-1/2 ${
              isDragging ? 'opacity-90 scale-110' : 'opacity-40 group-hover:opacity-80 scale-100'
            }`}
            style={{
              left: `${currentX}%`,
              top: `${currentY}%`,
            }}
          >
            <div className="w-7 h-7 rounded-full border-2 border-white bg-blue-600/60 shadow-md flex items-center justify-center text-white backdrop-blur-xs">
              <Crosshair className="w-4 h-4 text-white animate-pulse" />
            </div>
          </div>

          {/* Top Floating Helper Badge */}
          <div className="absolute top-2.5 left-2.5 pointer-events-none flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-black/70 text-white text-[11px] font-medium backdrop-blur-md shadow-xs">
            <Move className="w-3.5 h-3.5 text-blue-400" />
            <span>Træk i billedet for at flytte</span>
          </div>

          {/* Top Right Aspect ratio tag */}
          <div className="absolute top-2.5 right-2.5 pointer-events-none px-2 py-0.5 rounded-md bg-black/60 text-slate-200 text-[10px] font-semibold backdrop-blur-xs">
            {aspectRatioLabel}
          </div>

          {/* Bottom Live Coordinates info */}
          <div className="absolute bottom-2.5 left-2.5 right-2.5 flex items-center justify-between pointer-events-none">
            <span className="px-2 py-0.5 rounded-md bg-black/60 text-white/90 text-[10px] font-mono backdrop-blur-xs">
              Udsnit: X: {currentX}% • Y: {currentY}% {currentScale > 1 ? `• Zoom: ${currentScale.toFixed(1)}x` : ''}
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShowGrid(!showGrid);
              }}
              className="pointer-events-auto px-2 py-0.5 rounded-md bg-black/60 hover:bg-black/80 text-white text-[10px] flex items-center gap-1 transition-colors backdrop-blur-xs"
              title="Slå gitter til/fra"
            >
              <Grid className="w-3 h-3 text-blue-400" />
              <span>{showGrid ? 'Skjul gitter' : 'Vis gitter'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Controls Bar: Presets, Zoom & Reset */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2.5 text-xs">
        {/* Row 1: Quick Focus Presets */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
            Hurtig-fokus:
          </span>
          <div className="flex flex-wrap items-center gap-1">
            <button
              type="button"
              onClick={() => handlePreset(50, 15)}
              className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                currentY <= 25
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
              title="Fokusér på øverste del (hoved/skuldre/overkrop)"
            >
              Top (Overkrop)
            </button>
            <button
              type="button"
              onClick={() => handlePreset(50, 50)}
              className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                currentY > 25 && currentY < 75 && currentX === 50
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
              title="Fokusér på midten"
            >
              Centreret
            </button>
            <button
              type="button"
              onClick={() => handlePreset(50, 85)}
              className={`px-2.5 py-1 rounded-lg font-medium transition-all ${
                currentY >= 75
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-100'
              }`}
              title="Fokusér på nederste del (knæ/ben/fødder)"
            >
              Bund (Knæ & Ben)
            </button>
          </div>
        </div>

        {/* Row 2: Zoom Slider & Reset */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-2 border-t border-slate-200/70">
          {/* Zoom Slider */}
          <div className="flex items-center gap-2.5 w-full sm:w-auto">
            <span className="text-[11px] font-semibold text-slate-600 shrink-0 flex items-center gap-1">
              <ZoomIn className="w-3.5 h-3.5 text-slate-400" />
              Zoom:
            </span>
            <button
              type="button"
              onClick={() => handleScaleChange(currentScale - 0.1)}
              disabled={currentScale <= 1}
              className="p-1 rounded-md bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-40"
              title="Zoom ud"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <input
              type="range"
              min="1"
              max="2.2"
              step="0.05"
              value={currentScale}
              onChange={(e) => handleScaleChange(parseFloat(e.target.value))}
              className="w-24 sm:w-32 accent-blue-600 h-1.5 bg-slate-200 rounded-lg cursor-pointer"
            />
            <button
              type="button"
              onClick={() => handleScaleChange(currentScale + 0.1)}
              disabled={currentScale >= 2.2}
              className="p-1 rounded-md bg-white border border-slate-200 text-slate-600 hover:bg-slate-100 disabled:opacity-40"
              title="Zoom ind"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <span className="text-[11px] font-mono text-slate-500 w-8">
              {currentScale.toFixed(1)}x
            </span>
          </div>

          {/* Reset button */}
          <button
            type="button"
            onClick={handleReset}
            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 text-slate-600 text-[11px] font-medium transition-colors shrink-0 self-end sm:self-auto"
            title="Nulstil udsnit og zoom til standard"
          >
            <RotateCcw className="w-3 h-3 text-slate-400" />
            Nulstil udsnit
          </button>
        </div>
      </div>
    </div>
  );
};
