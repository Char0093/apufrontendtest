import React, { createContext, useContext, useEffect, useState } from 'react';

export type ThemeMode = 'light' | 'dark' | 'system';

interface ThemeContextType {
  theme: ThemeMode;
  setTheme: (theme: ThemeMode) => void;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [theme, setThemeState] = useState<ThemeMode>(() => {
    const saved = localStorage.getItem('cb_theme') as ThemeMode;
    return saved || 'light';
  });

  const [isDark, setIsDark] = useState<boolean>(false);

  useEffect(() => {
    localStorage.setItem('cb_theme', theme);
    const root = document.documentElement;
    const body = document.body;

    const applyDark = () => {
      root.classList.add('dark');
      if (body) body.classList.add('dark');
      setIsDark(true);
    };

    const removeDark = () => {
      root.classList.remove('dark');
      if (body) body.classList.remove('dark');
      setIsDark(false);
    };

    if (theme === 'dark') {
      applyDark();
    } else if (theme === 'light') {
      removeDark();
    } else {
      // System default
      const systemDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      if (systemDark) {
        applyDark();
      } else {
        removeDark();
      }
    }
  }, [theme]);

  const setTheme = (newTheme: ThemeMode) => {
    setThemeState(newTheme);
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme, isDark }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
