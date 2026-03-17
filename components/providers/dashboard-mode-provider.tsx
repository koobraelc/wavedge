"use client";

import { createContext, useContext, useEffect, useState, useCallback } from "react";

export const dashboardModes = ["beginner", "trader"] as const;
export type DashboardMode = (typeof dashboardModes)[number];

interface DashboardModeContextValue {
  mode: DashboardMode;
  setMode: (mode: DashboardMode) => void;
}

const DashboardModeContext = createContext<DashboardModeContextValue>({
  mode: "beginner",
  setMode: () => {},
});

export function DashboardModeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = useState<DashboardMode>("beginner");

  useEffect(() => {
    const stored = localStorage.getItem("wavedge_dashboard_mode") as DashboardMode | null;
    if (stored && dashboardModes.includes(stored)) {
      setModeState(stored);
      document.documentElement.dataset.dashboardMode = stored;
    }
  }, []);

  const setMode = useCallback((newMode: DashboardMode) => {
    setModeState(newMode);
    localStorage.setItem("wavedge_dashboard_mode", newMode);
    document.documentElement.dataset.dashboardMode = newMode;
  }, []);

  return (
    <DashboardModeContext.Provider value={{ mode, setMode }}>
      {children}
    </DashboardModeContext.Provider>
  );
}

export function useDashboardMode() {
  return useContext(DashboardModeContext);
}
