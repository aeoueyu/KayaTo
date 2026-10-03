import { Moon, Sun } from 'lucide-react';
import { useTheme } from '../theme/ThemeProvider';

export default function ThemeToggle({ label = true }) {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === 'dark';
  return (
    <button className="icon-button theme-toggle" data-tooltip={isDark ? 'Light mode' : 'Dark mode'} onClick={toggleTheme} aria-label={`Switch to ${isDark ? 'light' : 'dark'} mode`}>
      {isDark ? <Sun size={18} /> : <Moon size={18} />}
      {label && <span>{isDark ? 'Light mode' : 'Dark mode'}</span>}
    </button>
  );
}
