/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export interface ClassTheme {
  primary: string;       // Primary background or accent color hex
  gradientStart: string; // Gradient starting hex
  gradientEnd: string;   // Gradient ending hex
  text: string;          // Primary text color hex
  badgeBg: string;       // Sub-badge or box background hex
  border: string;        // Border accent color hex
  titleText: string;     // Text color on header ribbons (white or dark slate)
  isDark: boolean;       // Header uses white text or dark text
}

export const DEFAULT_CLASS_THEMES: Record<string, ClassTheme> = {
  'S.1': {
    primary: '#15803d', // Green
    gradientStart: '#166534',
    gradientEnd: '#22c55e',
    text: '#166534',
    badgeBg: '#f0fdf4',
    border: '#15803d',
    titleText: '#ffffff',
    isDark: true
  },
  'S.2': {
    primary: '#0369a1', // Light Blue
    gradientStart: '#075985',
    gradientEnd: '#38bdf8',
    text: '#075985',
    badgeBg: '#f0f9ff',
    border: '#0369a1',
    titleText: '#ffffff',
    isDark: true
  },
  'S.3': {
    primary: '#1d4ed8', // Blue
    gradientStart: '#1e40af',
    gradientEnd: '#3b82f6',
    text: '#1e40af',
    badgeBg: '#eff6ff',
    border: '#1d4ed8',
    titleText: '#ffffff',
    isDark: true
  },
  'S.4': {
    primary: '#a16207', // Yellow/Gold
    gradientStart: '#854d0e',
    gradientEnd: '#eab308',
    text: '#854d0e',
    badgeBg: '#fefbeb',
    border: '#a16207',
    titleText: '#ffffff',
    isDark: true
  },
  'S.5': {
    primary: '#ffffff', // Clean White
    gradientStart: '#f8fafc',
    gradientEnd: '#ffffff',
    text: '#1e293b',
    badgeBg: '#f1f5f9',
    border: '#cbd5e1',
    titleText: '#1e293b',
    isDark: false
  },
  'S.6': {
    primary: '#ffffff',
    gradientStart: '#f8fafc',
    gradientEnd: '#ffffff',
    text: '#1e293b',
    badgeBg: '#f1f5f9',
    border: '#cbd5e1',
    titleText: '#1e293b',
    isDark: false
  }
};

const LOCAL_STORAGE_COLORS_KEY = 'clearance_class_colors_v1';

export function getCustomClassThemes(): Record<string, ClassTheme> {
  try {
    let raw = null;
    if (typeof window !== 'undefined' && (window as any).electron?.readDataSync) {
      raw = (window as any).electron.readDataSync('class_colors');
    }
    if (!raw) {
      raw = localStorage.getItem(LOCAL_STORAGE_COLORS_KEY);
    }
    if (raw) {
      const parsed = JSON.parse(raw);
      // Merge with defaults to ensure all keys exist
      return { ...DEFAULT_CLASS_THEMES, ...parsed };
    }
  } catch (e) {
    console.error('Failed to read custom class colors:', e);
  }
  return { ...DEFAULT_CLASS_THEMES };
}

export function saveCustomClassThemes(themes: Record<string, ClassTheme>): void {
  const payload = JSON.stringify(themes);
  try {
    if (typeof window !== 'undefined' && (window as any).electron?.writeDataSync) {
      (window as any).electron.writeDataSync('class_colors', payload);
    }
  } catch (e) {
    console.warn('Failed to save custom class colors to Electron:', e);
  }
  try {
    localStorage.setItem(LOCAL_STORAGE_COLORS_KEY, payload);
  } catch (e) {
    console.error('Failed to save custom class colors to localStorage:', e);
  }
}

export function getClassPrefix(gradeClass: string): string {
  const clean = (gradeClass || '').toUpperCase().trim();
  if (clean.startsWith('S.1')) return 'S.1';
  if (clean.startsWith('S.2')) return 'S.2';
  if (clean.startsWith('S.3')) return 'S.3';
  if (clean.startsWith('S.4')) return 'S.4';
  if (clean.startsWith('S.5')) return 'S.5';
  if (clean.startsWith('S.6')) return 'S.6';
  return 'S.1'; // rollback
}

export function getClassTheme(gradeClass: string): ClassTheme {
  const prefix = getClassPrefix(gradeClass);
  const themes = getCustomClassThemes();
  return themes[prefix] || DEFAULT_CLASS_THEMES['S.1'];
}
