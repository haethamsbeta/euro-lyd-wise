import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type ThemeChoice = "sand" | "night" | "system";

const STORAGE_KEY = "dahab.theme";

type Ctx = {
  theme: ThemeChoice;
  resolved: "sand" | "night";
  mounted: boolean;
  setTheme: (t: ThemeChoice) => void;
};

const ThemeCtx = createContext<Ctx | null>(null);

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
  // SSR-safe defaults so the server and first client render match.
  // We hydrate the real values from localStorage / matchMedia after mount.
  const [theme, setThemeState] = useState<ThemeChoice>("sand");
  const [systemDark, setSystemDark] = useState<boolean>(false);
  const [mounted, setMounted] = useState(false);

  // Read persisted preference once on the client after hydration.
  useEffect(() => {
    try {
      const v = window.localStorage.getItem(STORAGE_KEY);
      if (v === "night" || v === "sand" || v === "system") {
        setThemeState(v);
      }
    } catch {
      /* ignore */
    }
    try {
      setSystemDark(window.matchMedia("(prefers-color-scheme: dark)").matches);
    } catch {
      /* ignore */
    }
    setMounted(true);
  }, []);

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
      mounted,
      setTheme: (t) => {
        setThemeState(t);
        try {
          window.localStorage.setItem(STORAGE_KEY, t);
        } catch {
          /* ignore quota / private mode */
        }
      },
    }),
    [theme, resolved, mounted],
  );

  return <ThemeCtx.Provider value={value}>{children}</ThemeCtx.Provider>;
}

export function useTheme() {
  const c = useContext(ThemeCtx);
  if (!c) throw new Error("useTheme must be used inside ThemeProvider");
  return c;
}
