import { CSSProperties } from 'react';
import { ImagePosition } from '../types';

/**
 * Helper to compute consistent CSS styling for exercise images
 * based on the user's custom focal point (x, y) and zoom (scale).
 */
export function getExerciseImageStyle(position?: ImagePosition): CSSProperties {
  const x = typeof position?.x === 'number' ? Math.max(0, Math.min(100, position.x)) : 50;
  const y = typeof position?.y === 'number' ? Math.max(0, Math.min(100, position.y)) : 50;
  const scale = typeof position?.scale === 'number' ? Math.max(1, Math.min(3, position.scale)) : 1;

  const style: CSSProperties = {
    objectFit: 'cover',
    objectPosition: `${x}% ${y}%`,
  };

  if (scale > 1) {
    style.transform = `scale(${scale})`;
    style.transformOrigin = `${x}% ${y}%`;
  }

  return style;
}
