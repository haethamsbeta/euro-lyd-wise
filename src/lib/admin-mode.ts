import { useEffect, useSyncExternalStore } from "react";
import { useAuth, hasAnyRole } from "@/lib/auth";

const STORAGE_KEY = "dahab.masterPreviewAsRegular";
const EVENT = "dahab.masterPreview.changed";

function read(): boolean {
  if (typeof window === "undefined") return false;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    return window.sessionStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function subscribe(cb: () => void) {
  if (typeof window === "undefined") return () => {};
  const handler = () => cb();
  window.addEventListener(EVENT, handler);
  window.addEventListener("storage", handler);
  return () => {
    window.removeEventListener(EVENT, handler);
    window.removeEventListener("storage", handler);
  };
}

export function useMasterPreviewAsRegular(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => read(),
    () => false,
  );
}

export function setMasterPreviewAsRegular(value: boolean) {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
    if (value) window.sessionStorage.setItem(STORAGE_KEY, "1");
    else window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {}
  window.dispatchEvent(new Event(EVENT));
}

/** Real master admin (ignores preview mode). */
export function useIsRealMasterAdmin(): boolean {
  const { user, roles } = useAuth();
  return hasAnyRole(roles, ["admin"]) && (user as any)?.is_master_admin === true;
}

/** Show master tools — true only when real master AND not previewing as regular. */
export function useShowMasterTools(): boolean {
  const real = useIsRealMasterAdmin();
  const preview = useMasterPreviewAsRegular();
  return real && !preview;
}

/** Convenience: regular admin (real role admin but not master, OR master previewing as regular). */
export function useIsRegularAdminView(): boolean {
  const { roles } = useAuth();
  const isAdmin = hasAnyRole(roles, ["admin"]);
  const showMaster = useShowMasterTools();
  return isAdmin && !showMaster;
}

// Auto-clear preview if user is no longer real master.
export function useMasterPreviewGuard() {
  const real = useIsRealMasterAdmin();
  const preview = useMasterPreviewAsRegular();
  useEffect(() => {
    if (!real && preview) setMasterPreviewAsRegular(false);
  }, [real, preview]);
}