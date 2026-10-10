// Fork addition (see FORK.md): theme toggle.
import { themeText, useTheme } from './theme';

type Lang = keyof typeof themeText;

export function ThemeToggle({ language }: { language: Lang }) {
  const [theme, setTheme] = useTheme();
  const t = themeText[language];
  const label = theme === 'dark' ? t.toLight : t.toDark;
  return <button type="button" className="icon-button theme-toggle" aria-label={label} title={label} onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
    {theme === 'dark'
      ? <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
      : <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" /></svg>}
  </button>;
}

