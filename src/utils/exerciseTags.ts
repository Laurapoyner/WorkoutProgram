import { Exercise, PlanExercise } from '../types';

export const STANDARD_EXERCISE_TAGS = [
  'Knæ', 'Læg', 'Ankel', 'Forlår', 'Baglår', 'Balder', 'Hofte', 'Lysk', 'Inderlår',
  'Core', 'Ryg', 'Skulder', 'Bryst', 'Arme', 'Balance', 'Stabilitet', 'Kondition',
  'Opvarmning', 'Test', 'ACL'
];

const canonicalize = (raw: string): string => {
  const value = raw.trim();
  const lower = value.toLowerCase();
  if (!value) return '';
  if (lower.includes('quadriceps') || lower === 'forlår') return 'Forlår';
  if (lower.includes('hamstring') || lower === 'baglår') return 'Baglår';
  if (lower === 'balde' || lower === 'balder') return 'Balder';
  if (lower.includes('hofteabduktor') || lower.includes('hoftebøjer') || lower === 'hofte') return 'Hofte';
  if (lower === 'side core' || lower === 'core') return 'Core';
  if (lower.includes('knæstabilitet') || lower === 'knæ') return 'Knæ';
  if (lower === 'acl lsi test') return 'ACL';
  return value.charAt(0).toUpperCase() + value.slice(1);
};

export function splitLegacyTargetArea(value?: string): string[] {
  if (!value?.trim()) return [];
  if (value.trim().toLowerCase() === 'acl lsi test') return ['Knæ', 'ACL', 'Test'];
  const pieces = value
    .replace(/\(([^)]+)\)/g, ', $1')
    .split(/\s*(?:&|,|\/|\+|\||·)\s*/g)
    .map(canonicalize)
    .filter(Boolean);
  const result = Array.from(new Set(pieces));
  return result.length ? result : [canonicalize(value)];
}

export function getExerciseTags(exercise: Pick<Exercise | PlanExercise, 'categories' | 'targetArea'>): string[] {
  const explicit = Array.isArray(exercise.categories) ? exercise.categories.map(canonicalize).filter(Boolean) : [];
  return Array.from(new Set(explicit.length ? explicit : splitLegacyTargetArea(exercise.targetArea)));
}

export function normalizeTags(tags: string[]): string[] {
  return Array.from(new Set(tags.map(canonicalize).filter(Boolean)));
}
