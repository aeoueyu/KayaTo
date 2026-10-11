import { createContext, useContext, useEffect, useMemo, useState } from 'react';

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [themePreference, setThemePreference] = useState(() => {
    try {
      const saved = window.localStorage.getItem('kayato-theme');
      if (saved === 'light' || saved === 'dark' || saved === 'system') return saved;
      return 'system';
    } catch {
      return 'system';
    }
  });
  const [systemTheme, setSystemTheme] = useState(() => window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  const theme = themePreference === 'system' ? systemTheme : themePreference;

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!media) return undefined;
    const syncTheme = (event) => setSystemTheme(event.matches ? 'dark' : 'light');
    media.addEventListener('change', syncTheme);
    return () => media.removeEventListener('change', syncTheme);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      window.localStorage.setItem('kayato-theme', themePreference);
    } catch {
      // Some embedded preview browsers block storage. The theme still works in-memory.
    }
  }, [theme, themePreference]);

  const value = useMemo(
    () => ({ theme, themePreference, setThemePreference, toggleTheme: () => setThemePreference(theme === 'dark' ? 'light' : 'dark') }),
    [theme, themePreference],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  return useContext(ThemeContext);
}
