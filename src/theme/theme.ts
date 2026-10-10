// Fork addition (see FORK.md): dark and light theme for the editor and the Live page.
// The stream view (stream.html) never loads this, so OBS keeps its transparent background.
import { useEffect, useState } from 'react';
import { readPreference, savePreference } from '../editor/preferences';
import './theme.css';

export type Theme = 'dark' | 'light';
export const THEME_KEY = 'mesh-avatar-theme';

export function readTheme(): Theme {
  const saved = readPreference(THEME_KEY);
  return saved === 'light' || saved === 'dark' ? saved : 'dark';
}
export function applyTheme(theme: Theme) {
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
}
// before the first render, so the page never flashes in the other theme
applyTheme(readTheme());

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(readTheme);
  useEffect(() => { applyTheme(theme); savePreference(THEME_KEY, theme); }, [theme]);
  return [theme, setTheme] as const;
}

type Lang = 'es' | 'en' | 'ja' | 'zh';
export const themeText: Record<Lang, { toLight: string; toDark: string }> = {
  es: { toLight: 'Tema claro', toDark: 'Tema oscuro' },
  en: { toLight: 'Light theme', toDark: 'Dark theme' },
  ja: { toLight: 'ライトテーマ', toDark: 'ダークテーマ' },
  zh: { toLight: '浅色主题', toDark: '深色主题' },
};
