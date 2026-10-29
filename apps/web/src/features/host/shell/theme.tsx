'use client';

import { createContext, use, useEffect, useState, type ReactNode } from 'react';
import { THEME_COOKIE, type Theme } from './theme-cookie';

const ThemeContext = createContext<{ theme: Theme; toggle: () => void } | null>(null);

/**
 * The host dashboard's light or dark theme. It is set on the page root as well as on this
 * wrapper, so dialogs and popovers, which render outside it, follow it too.
 */
export function ThemeRoot({ initial, children }: { initial: Theme; children: ReactNode }) {
  const [theme, setTheme] = useState(initial);

  useEffect(() => {
    const root = document.documentElement;
    root.dataset.theme = theme;
    return () => {
      delete root.dataset.theme;
    };
  }, [theme]);

  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    document.cookie = `${THEME_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`;
    setTheme(next);
  };

  return (
    <ThemeContext value={{ theme, toggle }}>
      <div data-theme={theme} className="min-h-dvh bg-ground text-ink">
        {children}
      </div>
    </ThemeContext>
  );
}

export function useTheme() {
  const context = use(ThemeContext);
  if (!context) throw new Error('useTheme needs a ThemeRoot above it');
  return context;
}
