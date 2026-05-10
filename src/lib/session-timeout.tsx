import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { DATA_BACKEND } from "@/lib/runtimeConfig";

/**
 * Security: layer client-side session timeouts on top of Supabase's built-in
 * refresh-token rotation.
 *
 * - IDLE_MS: time without user input before we show a warning dialog.
 * - WARN_MS: countdown shown in the warning before automatic sign-out.
 * - HARD_CAP_MS: maximum lifetime of a single signed-in session, regardless
 *                of activity. A forgotten browser tab will not stay signed in
 *                all day.
 *
 * All three are intentionally exported so a future per-portal override (e.g.
 * stricter limits for staff) is a one-line change.
 */
export const IDLE_MS = 15 * 60_000;        // 15 minutes
export const WARN_MS = 60_000;             //  1 minute warning
export const HARD_CAP_MS = 8 * 60 * 60_000; // 8 hours

const SIGNIN_AT_KEY = "dahab.signed_in_at";
const CHANNEL_NAME = "dahab.auth";

type Ctx = {
  /** True while the warning dialog should be shown. */
  warning: boolean;
  /** Seconds remaining in the warning countdown. */
  secondsLeft: number;
  /** Reset the idle timer, e.g. when user clicks "Stay signed in". */
  stayActive: () => void;
};

const SessionTimeoutCtx = createContext<Ctx | null>(null);

const ACTIVITY_EVENTS = [
  "mousedown",
  "keydown",
  "scroll",
  "touchstart",
  "wheel",
] as const;

function readSignInAt(): number | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(SIGNIN_AT_KEY);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export function SessionTimeoutProvider({ children }: { children: ReactNode }) {
  const { session, signOut } = useAuth();
  const [warning, setWarning] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(WARN_MS / 1000);

  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warnTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tickTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const hardCapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const channelRef = useRef<BroadcastChannel | null>(null);

  // Stamp signin_at when a new session arrives, clear it on sign out.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (session) {
      const existing = readSignInAt();
      if (!existing) {
        try {
          window.localStorage.setItem(SIGNIN_AT_KEY, String(Date.now()));
        } catch {
          /* ignore */
        }
      }
    } else if (DATA_BACKEND !== "lambda") {
      try {
        window.localStorage.removeItem(SIGNIN_AT_KEY);
      } catch {
        /* ignore */
      }
    }
  }, [session]);

  // Cross-tab broadcast: when one tab signs out, every other tab does too.
  useEffect(() => {
    if (typeof window === "undefined" || typeof BroadcastChannel === "undefined") return;
    const ch = new BroadcastChannel(CHANNEL_NAME);
    channelRef.current = ch;
    ch.onmessage = (e) => {
      if (e.data?.type === "signout") {
        // Use Supabase directly so we don't rebroadcast and loop.
        supabase.auth.signOut();
      }
    };
    return () => {
      ch.close();
      channelRef.current = null;
    };
  }, []);

  const clearAll = () => {
    if (idleTimer.current) clearTimeout(idleTimer.current);
    if (warnTimer.current) clearTimeout(warnTimer.current);
    if (tickTimer.current) clearInterval(tickTimer.current);
    idleTimer.current = null;
    warnTimer.current = null;
    tickTimer.current = null;
  };

  const performSignOut = async () => {
    setWarning(false);
    clearAll();
    try {
      channelRef.current?.postMessage({ type: "signout" });
    } catch {
      /* ignore */
    }
    await signOut();
  };

  const beginWarning = () => {
    setWarning(true);
    setSecondsLeft(Math.round(WARN_MS / 1000));
    if (tickTimer.current) clearInterval(tickTimer.current);
    tickTimer.current = setInterval(() => {
      setSecondsLeft((s) => Math.max(0, s - 1));
    }, 1000);
    if (warnTimer.current) clearTimeout(warnTimer.current);
    warnTimer.current = setTimeout(() => {
      void performSignOut();
    }, WARN_MS);
  };

  const resetIdle = () => {
    if (warning) return; // don't reset while warning is up — user must click
    if (idleTimer.current) clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(beginWarning, IDLE_MS);
  };

  const stayActive = () => {
    setWarning(false);
    clearAll();
    resetIdle();
  };

  // Activity listeners + initial idle timer + hard-cap timer.
  useEffect(() => {
    if (!session || typeof window === "undefined") {
      clearAll();
      if (hardCapTimer.current) clearTimeout(hardCapTimer.current);
      hardCapTimer.current = null;
      setWarning(false);
      return;
    }

    // Activity listeners (passive to keep scrolling smooth).
    const onActivity = () => resetIdle();
    ACTIVITY_EVENTS.forEach((ev) =>
      window.addEventListener(ev, onActivity, { passive: true }),
    );

    // When the tab becomes visible again, treat it as activity.
    const onVisibility = () => {
      if (document.visibilityState === "visible") resetIdle();
    };
    document.addEventListener("visibilitychange", onVisibility);

    // Hard cap: schedule a forced sign-out at signin_at + HARD_CAP_MS.
    const signinAt = readSignInAt() ?? Date.now();
    const remaining = Math.max(0, signinAt + HARD_CAP_MS - Date.now());
    hardCapTimer.current = setTimeout(() => {
      void performSignOut();
    }, remaining);

    resetIdle();

    return () => {
      ACTIVITY_EVENTS.forEach((ev) =>
        window.removeEventListener(ev, onActivity),
      );
      document.removeEventListener("visibilitychange", onVisibility);
      if (hardCapTimer.current) clearTimeout(hardCapTimer.current);
      hardCapTimer.current = null;
      clearAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  return (
    <SessionTimeoutCtx.Provider
      value={{ warning, secondsLeft, stayActive }}
    >
      {children}
    </SessionTimeoutCtx.Provider>
  );
}

export function useSessionTimeout() {
  const c = useContext(SessionTimeoutCtx);
  if (!c) throw new Error("useSessionTimeout must be used inside SessionTimeoutProvider");
  return c;
}
