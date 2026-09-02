/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect } from 'react';

// ─────────────────────────────────────────
// Predefined colour palettes
// ─────────────────────────────────────────
export const COLOR_PALETTES = [
  { id: 'indigo-cyan',    label: 'Indigo × Cyan',    primary: '#6366f1', secondary: '#06b6d4' },
  { id: 'violet-pink',   label: 'Violet × Pink',    primary: '#8b5cf6', secondary: '#ec4899' },
  { id: 'rose-orange',   label: 'Rose × Orange',    primary: '#f43f5e', secondary: '#f97316' },
  { id: 'emerald-teal',  label: 'Emerald × Teal',   primary: '#10b981', secondary: '#14b8a6' },
  { id: 'amber-yellow',  label: 'Amber × Yellow',   primary: '#f59e0b', secondary: '#eab308' },
  { id: 'sky-blue',      label: 'Sky × Blue',       primary: '#0ea5e9', secondary: '#3b82f6' },
  { id: 'fuchsia-purple',label: 'Fuchsia × Purple', primary: '#d946ef', secondary: '#a855f7' },
  { id: 'lime-green',    label: 'Lime × Green',     primary: '#84cc16', secondary: '#22c55e' },
  { id: 'custom',        label: 'Custom',            primary: '#6366f1', secondary: '#06b6d4' },
];

// Derive glow/shadow colours from a hex value
const hexToRgb = (hex) => {
  if (!hex || typeof hex !== 'string') return '0, 0, 0';
  let cleanHex = hex.replace('#', '');
  if (cleanHex.length === 3) {
    cleanHex = cleanHex.split('').map(c => c + c).join('');
  }
  if (cleanHex.length !== 6) return '0, 0, 0';
  
  const r = parseInt(cleanHex.slice(0, 2), 16);
  const g = parseInt(cleanHex.slice(2, 4), 16);
  const b = parseInt(cleanHex.slice(4, 6), 16);
  return `${r}, ${g}, ${b}`;
};

// ─────────────────────────────────────────
// Apply CSS variables to :root
// ─────────────────────────────────────────
const applyTheme = (mode, primary, secondary) => {
  const root = document.documentElement;
  const isDark = mode === 'dark';

  // Primary / secondary colours
  root.style.setProperty('--primary', primary);
  root.style.setProperty('--primary-glow', `rgba(${hexToRgb(primary)}, 0.3)`);
  root.style.setProperty('--secondary', secondary);
  root.style.setProperty('--secondary-glow', `rgba(${hexToRgb(secondary)}, 0.25)`);
  root.style.setProperty('--border-glass-focus', `rgba(${hexToRgb(primary)}, 0.4)`);
  root.style.setProperty('--shadow-neon', `0 0 15px rgba(${hexToRgb(primary)}, 0.2)`);
  root.style.setProperty('--shadow-cyan', `0 0 15px rgba(${hexToRgb(secondary)}, 0.25)`);

  if (isDark) {
    root.style.setProperty('--bg-main', '#0b0f19');
    root.style.setProperty('--bg-card', 'rgba(17, 24, 39, 0.6)');
    root.style.setProperty('--bg-card-hover', 'rgba(26, 36, 57, 0.75)');
    root.style.setProperty('--border-glass', 'rgba(255, 255, 255, 0.08)');
    root.style.setProperty('--text-primary', '#f3f4f6');
    root.style.setProperty('--text-secondary', '#9ca3af');
    root.style.setProperty('--text-muted', '#6b7280');
    root.style.setProperty('--shadow-glass', '0 8px 32px 0 rgba(0, 0, 0, 0.37)');
    root.style.setProperty('--sidebar-bg', 'rgba(10, 15, 25, 0.85)');
    root.style.setProperty('--input-bg', 'rgba(255, 255, 255, 0.03)');
    root.style.setProperty('--input-bg-focus', 'rgba(255, 255, 255, 0.06)');
    root.style.setProperty('--scrollbar-thumb', 'rgba(255, 255, 255, 0.1)');
    root.style.setProperty('--body-gradient-1', `rgba(${hexToRgb(primary)}, 0.08)`);
    root.style.setProperty('--body-gradient-2', `rgba(${hexToRgb(secondary)}, 0.08)`);
  } else {
    root.style.setProperty('--bg-main', '#f0f4f8');
    root.style.setProperty('--bg-card', 'rgba(255, 255, 255, 0.75)');
    root.style.setProperty('--bg-card-hover', 'rgba(255, 255, 255, 0.92)');
    root.style.setProperty('--border-glass', 'rgba(0, 0, 0, 0.08)');
    root.style.setProperty('--text-primary', '#111827');
    root.style.setProperty('--text-secondary', '#374151');
    root.style.setProperty('--text-muted', '#6b7280');
    root.style.setProperty('--shadow-glass', '0 8px 32px 0 rgba(0, 0, 0, 0.10)');
    root.style.setProperty('--sidebar-bg', 'rgba(255, 255, 255, 0.90)');
    root.style.setProperty('--input-bg', 'rgba(0, 0, 0, 0.03)');
    root.style.setProperty('--input-bg-focus', 'rgba(0, 0, 0, 0.06)');
    root.style.setProperty('--scrollbar-thumb', 'rgba(0, 0, 0, 0.15)');
    root.style.setProperty('--body-gradient-1', `rgba(${hexToRgb(primary)}, 0.06)`);
    root.style.setProperty('--body-gradient-2', `rgba(${hexToRgb(secondary)}, 0.06)`);
  }

  // data-theme attribute for additional CSS selectors if needed
  root.setAttribute('data-theme', mode);
};

// ─────────────────────────────────────────
// Context
// ─────────────────────────────────────────
const ThemeContext = createContext(null);

export const ThemeProvider = ({ children }) => {
  const [mode, setMode] = useState(() => localStorage.getItem('theme-mode') || 'dark');
  const [paletteId, setPaletteId] = useState(() => localStorage.getItem('theme-palette') || 'indigo-cyan');
  const [customPrimary, setCustomPrimary] = useState(() => localStorage.getItem('theme-custom-primary') || '#6366f1');
  const [customSecondary, setCustomSecondary] = useState(() => localStorage.getItem('theme-custom-secondary') || '#06b6d4');

  const activePalette = COLOR_PALETTES.find(p => p.id === paletteId) || COLOR_PALETTES[0];
  const primary = paletteId === 'custom' ? customPrimary : activePalette.primary;
  const secondary = paletteId === 'custom' ? customSecondary : activePalette.secondary;

  // Apply theme whenever any setting changes
  useEffect(() => {
    applyTheme(mode, primary, secondary);
    localStorage.setItem('theme-mode', mode);
    localStorage.setItem('theme-palette', paletteId);
    localStorage.setItem('theme-custom-primary', customPrimary);
    localStorage.setItem('theme-custom-secondary', customSecondary);
  }, [mode, primary, secondary, paletteId, customPrimary, customSecondary]);

  const toggleMode = () => setMode(prev => prev === 'dark' ? 'light' : 'dark');

  const selectPalette = (id) => setPaletteId(id);

  return (
    <ThemeContext.Provider value={{
      mode,
      toggleMode,
      paletteId,
      selectPalette,
      customPrimary,
      setCustomPrimary,
      customSecondary,
      setCustomSecondary,
      primary,
      secondary,
      palettes: COLOR_PALETTES,
    }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
};
