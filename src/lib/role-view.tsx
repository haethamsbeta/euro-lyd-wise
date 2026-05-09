import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { useAuth, hasAnyRole, type AppRole } from "@/lib/auth";

const STORAGE_KEY = "dahab.viewAs";
const VALID: AppRole[] = ["admin", "teller", "auditor", "consumer"];

type RoleViewState = {
  /** Real roles from the DB (unchanged). */
  realRoles: AppRole[];
  /** Current preview role (null = no override). Only meaningful for real admins. */
  viewAs: AppRole | null;
  /** Roles the UI should react to. */
  effectiveRoles: AppRole[];
  /** True when an admin is previewing as a non-admin role. */
  isPreviewing: boolean;
  /** True when the real user is an admin (controls visibility of the switcher). */
  canSwitch: boolean;
  setViewAs: (role: AppRole | null) => void;
};

const Ctx = createContext<RoleViewState | null>(null);

function readStored(): AppRole | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return VALID.includes(raw as AppRole) ? (raw as AppRole) : null;
  } catch {
    return null;
  }
}

export function RoleViewProvider({ children }: { children: ReactNode }) {
  const { roles: realRoles } = useAuth();
  const canSwitch = hasAnyRole(realRoles, ["admin"]);
  const [viewAs, setViewAsState] = useState<AppRole | null>(() => readStored());

  // Auto-clear if the real user is no longer admin.
  useEffect(() => {
    if (!canSwitch && viewAs !== null) {
      setViewAsState(null);
      try { window.localStorage.removeItem(STORAGE_KEY); } catch {}
    }
  }, [canSwitch, viewAs]);

  const setViewAs = useCallback((role: AppRole | null) => {
    setViewAsState(role);
    try {
      if (role) window.localStorage.setItem(STORAGE_KEY, role);
      else window.localStorage.removeItem(STORAGE_KEY);
    } catch {}
  }, []);

  const value = useMemo<RoleViewState>(() => {
    const effective: AppRole[] = canSwitch && viewAs ? [viewAs] : realRoles;
    return {
      realRoles,
      viewAs: canSwitch ? viewAs : null,
      effectiveRoles: effective,
      isPreviewing: !!(canSwitch && viewAs && viewAs !== "admin"),
      canSwitch,
      setViewAs,
    };
  }, [realRoles, viewAs, canSwitch, setViewAs]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useRoleView(): RoleViewState {
  const c = useContext(Ctx);
  const { roles } = useAuth();
  if (c) return c;
  return {
    realRoles: roles,
    viewAs: null,
    effectiveRoles: roles,
    isPreviewing: false,
    canSwitch: false,
    setViewAs: () => {},
  };
}

export function useEffectiveRoles(): AppRole[] {
  return useRoleView().effectiveRoles;
}