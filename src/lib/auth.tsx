import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { clearDahabAuthStorage, getAccessToken } from "@/lib/dahabAuthToken";
import { DATA_BACKEND } from "@/lib/runtimeConfig";
import { api } from "@/lib/api";
import { normalizeLambdaUser, roleFromLambdaUser, type LambdaStoredUser } from "@/lib/lambdaUser";

export type AppRole = "admin" | "teller" | "auditor" | "consumer";

const APP_ROLES: AppRole[] = ["admin", "teller", "auditor", "consumer"];

export type DahabUser = User & { is_master_admin?: boolean };

type AuthState = {
  session: Session | null;
  user: DahabUser | null;
  roles: AppRole[];
  loading: boolean;
  rolesLoading: boolean;
  signOut: () => Promise<void>;
  refreshRoles: () => Promise<void>;
};

const AuthCtx = createContext<AuthState | null>(null);

// Inject the current Supabase access token into every server-function fetch
// so middlewares using `requireSupabaseAuth` see a Bearer token.
if (typeof window !== "undefined" && !(window as any).__dahabFetchPatched) {
  (window as any).__dahabFetchPatched = true;
  const origFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    try {
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : (input as Request).url;
      if (url && url.includes("/_serverFn/")) {
        const { data } = await supabase.auth.getSession();
        const token = data.session?.access_token;
        if (token) {
          const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
          if (!headers.has("authorization")) headers.set("authorization", `Bearer ${token}`);
          return origFetch(input, { ...(init ?? {}), headers });
        }
      }
    } catch {
      // fall through to original fetch
    }
    return origFetch(input, init);
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);
  const [rolesLoading, setRolesLoading] = useState(true);

  function readLambdaUser(): LambdaStoredUser | null {
    if (typeof localStorage === "undefined") return null;
    try {
      return normalizeLambdaUser(JSON.parse(localStorage.getItem("dahab.user") || "null"));
    } catch {
      return null;
    }
  }

  function applyLambdaAuthState() {
    const lambdaUser = readLambdaUser();
    const token = getAccessToken();
    if (!token || !lambdaUser?.id) return false;
    setSession({
      user: {
        id: lambdaUser.id,
        email: lambdaUser.email ?? "",
        is_master_admin: lambdaUser.is_master_admin === true,
      },
    } as unknown as Session);
    const role = roleFromLambdaUser(lambdaUser, APP_ROLES);
    setRoles(role ? [role] : []);
    setLoading(false);
    setRolesLoading(false);
    return true;
  }

  async function refreshLambdaUser() {
    const existing = readLambdaUser();
    if (!getAccessToken() || !existing?.id) return;
    try {
      const fresh = normalizeLambdaUser(await api.auth.me(), existing);
      localStorage.setItem("dahab.user", JSON.stringify(fresh));
      window.dispatchEvent(new Event("dahab.auth.changed"));
    } catch (error) {
      if (import.meta.env.DEV) console.warn("[auth] Failed to refresh Lambda user", error);
    }
  }

  async function loadRoles(uid: string | undefined) {
    if (!uid) {
      setRoles([]);
      setRolesLoading(false);
      return;
    }
    setRolesLoading(true);
    const { data } = await supabase.from("user_roles").select("role").eq("user_id", uid);
    setRoles((data ?? []).map((r) => r.role as AppRole));
    setRolesLoading(false);
  }

  useEffect(() => {
    if (DATA_BACKEND === "lambda") {
      if (!applyLambdaAuthState()) {
        setSession(null);
        setRoles([]);
        setLoading(false);
        setRolesLoading(false);
      } else {
        void refreshLambdaUser();
      }
      window.addEventListener("dahab.auth.changed", applyLambdaAuthState);
      return () => window.removeEventListener("dahab.auth.changed", applyLambdaAuthState);
    }
    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      setSession(s);
      if (event === "SIGNED_OUT") clearDahabAuthStorage();
      // defer to avoid deadlocks
      setTimeout(() => loadRoles(s?.user.id), 0);
    });
    supabase.auth.getSession().then(async ({ data }) => {
      // If a Supabase session exists but the Lambda backend access token is
      // missing (e.g. the user signed in before token storage was wired up,
      // or the token was cleared), force a re-login so apiFetch can attach
      // a Bearer token. Without this, every backend call returns 401.
      if (data.session && !getAccessToken()) {
        if (import.meta.env.DEV) {
          console.warn("[auth] Supabase session present but no Lambda access_token — signing out to force re-login");
        }
        await supabase.auth.signOut();
        setSession(null);
        setLoading(false);
        setRolesLoading(false);
        return;
      }
      setSession(data.session);
      // Unblock the UI as soon as we know the session — load roles in the
      // background. Routes that require a specific role gate on `roles`
      // separately, so the landing/login pages can paint immediately.
      setLoading(false);
      loadRoles(data.session?.user.id);
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  const value: AuthState = {
    session,
    user: (session?.user as DahabUser | undefined) ?? null,
    roles,
    loading,
    rolesLoading,
    signOut: async () => {
      clearDahabAuthStorage();
      setSession(null);
      setRoles([]);
      setLoading(false);
      setRolesLoading(false);
      await supabase.auth.signOut();
    },
    refreshRoles: async () => loadRoles(session?.user.id),
  };

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const c = useContext(AuthCtx);
  if (!c) throw new Error("useAuth must be used inside AuthProvider");
  return c;
}

export function hasAnyRole(roles: AppRole[], allowed: AppRole[]) {
  return roles.some((r) => allowed.includes(r));
}