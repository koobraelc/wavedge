"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";

export const fontSizes = ["small", "medium", "large"] as const;
export type FontSize = (typeof fontSizes)[number];

const fontSizeLabels: Record<FontSize, string> = {
  small: "14px",
  medium: "16px",
  large: "18px",
};

interface FontSizeContextValue {
  fontSize: FontSize;
  setFontSize: (size: FontSize) => void;
  fontSizeLabels: Record<FontSize, string>;
}

const FontSizeContext = createContext<FontSizeContextValue>({
  fontSize: "medium",
  setFontSize: () => {},
  fontSizeLabels,
});

export function FontSizeProvider({ children }: { children: React.ReactNode }) {
  const [fontSize, setFontSizeState] = useState<FontSize>("medium");

  useEffect(() => {
    const stored = localStorage.getItem("wavedge_font_size") as FontSize | null;
    if (stored && fontSizes.includes(stored)) {
      setFontSizeState(stored);
      document.documentElement.dataset.fontSize = stored;
    }
  }, []);

  const setFontSize = useCallback((size: FontSize) => {
    setFontSizeState(size);
    localStorage.setItem("wavedge_font_size", size);
    document.documentElement.dataset.fontSize = size;
  }, []);

  return (
    <FontSizeContext.Provider value={{ fontSize, setFontSize, fontSizeLabels }}>
      {children}
    </FontSizeContext.Provider>
  );
}

export function useFontSize() {
  return useContext(FontSizeContext);
}
