"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";

export const themes = ["default", "apple", "glass", "light", "terminal"] as const;
export type Theme = (typeof themes)[number];

const themeLabels: Record<Theme, string> = {
  default: "Default",
  terminal: "8-Bit",
  apple: "Apple Glass",
  glass: "Glass",
  light: "Light",
};

interface ThemeContextValue {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  themeLabels: Record<Theme, string>;
}

const ThemeContext = createContext<ThemeContextValue>({
  theme: "default",
  setTheme: () => {},
  themeLabels,
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("default");

  useEffect(() => {
    const stored = localStorage.getItem("wavedge_theme") as Theme | null;
    if (stored && themes.includes(stored)) {
      setThemeState(stored);
      applyTheme(stored);
    }
  }, []);

  const setTheme = useCallback((newTheme: Theme) => {
    setThemeState(newTheme);
    localStorage.setItem("wavedge_theme", newTheme);
    applyTheme(newTheme);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, themeLabels }}>
      {children}
    </ThemeContext.Provider>
  );
}

function applyTheme(theme: Theme) {
  const el = document.documentElement;
  if (theme === "default") {
    delete el.dataset.theme;
  } else {
    el.dataset.theme = theme;
  }
}

export function useTheme() {
  return useContext(ThemeContext);
}
