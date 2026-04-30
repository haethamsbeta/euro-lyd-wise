import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type ThemeChoice = "sand" | "night" | "system";

const STORAGE_KEY = "dahab.theme";

type Ctx = {
  theme: ThemeChoice;
  resolved: "sand" | "night";
  setTheme: (t: ThemeChoice) => void;
};

const ThemeCtx = createContext<Ctx | null>(null);

function readStored(): ThemeChoice {
  if (typeof window === "undefined") return "sand";
  const v = window.localStorage.getItem(STORAGE_KEY);
  return v === "night" || v === "sand" || v === "system" ? v : "sand";
}

function systemPrefersDark(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function applyTheme(resolved: "sand" | "night") {
  if (typeof document === "undefined") return;
  const html = document.documentElement;
  if (resolved === "night") html.classList.add("theme-night");
  else html.classList.remove("theme-night");
  // Update the browser theme-color meta so the address bar matches.
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", resolved === "night" ? "#0c0a08" : "#16120c");
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<ThemeChoice>(() => readStored());
  const [systemDark, setSystemDark] = useState<boolean>(() => systemPrefersDark());

  // Listen for OS theme changes only when the user picked "system"
  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = (e: MediaQueryListEvent) => setSystemDark(e.matches);
    mq.addEventListener?.("change", handler);
    return () => mq.removeEventListener?.("change", handler);
  }, []);

  const resolved: "sand" | "night" =
    theme === "system" ? (systemDark ? "night" : "sand") : theme;

  // Apply on every change
  useEffect(() => {
    applyTheme(resolved);
  }, [resolved]);

  const value = useMemo<Ctx>(
    () => ({
      theme,
      resolved,
      setTheme: (t) => {
        setThemeState(t);
        try {
          window.localStorage.setItem(STORAGE_KEY, t);
        } catch {
          /* ignore quota / private mode */
        }
      },
    }),
    [theme, resolved],
  );

  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

export function useTheme() {
  const c = useContext(ThemeCtx);
  if (!c) throw new Error("useTheme must be used inside ThemeProvider");
  return c;
}
