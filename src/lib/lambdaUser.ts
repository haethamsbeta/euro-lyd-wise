import type { AppRole } from "@/lib/auth";

const TRUE_VALUES = new Set(["true", "1", "yes"]);

function truthyFlag(value: unknown): boolean {
  if (value === true || value === 1) return true;
  if (typeof value === "string") return TRUE_VALUES.has(value.trim().toLowerCase());
  return false;
}

function readMasterFlag(source: any): boolean {
  return truthyFlag(source?.is_master_admin) || truthyFlag(source?.isMasterAdmin);
}

export type LambdaStoredUser = {
  id?: string;
  userId?: string;
  email?: string | null;
  username?: string | null;
  display_name?: string | null;
  fullName?: string | null;
  role?: string | null;
  roles?: string[];
  is_master_admin?: boolean;
};

export function normalizeLambdaUser(payload: any, fallback?: LambdaStoredUser | null): LambdaStoredUser {
  const user = payload?.user ?? payload ?? {};
  const roles = Array.isArray(user.roles) ? user.roles : Array.isArray(payload?.roles) ? payload.roles : fallback?.roles;
  const role = user.role ?? payload?.role ?? fallback?.role ?? roles?.[0] ?? null;
  const isMaster = readMasterFlag(user) || readMasterFlag(payload);

  return {
    ...(fallback ?? {}),
    ...user,
    id: user.id ?? user.userId ?? payload?.id ?? payload?.userId ?? fallback?.id ?? fallback?.userId,
    userId: user.userId ?? payload?.userId ?? fallback?.userId,
    email: user.email ?? payload?.email ?? fallback?.email ?? user.username ?? payload?.username ?? null,
    username: user.username ?? payload?.username ?? fallback?.username ?? null,
    display_name: user.display_name ?? payload?.display_name ?? fallback?.display_name ?? user.fullName ?? payload?.fullName ?? null,
    fullName: user.fullName ?? payload?.fullName ?? fallback?.fullName ?? null,
    role,
    roles,
    is_master_admin: isMaster || fallback?.is_master_admin === true,
  };
}

export function roleFromLambdaUser(user: LambdaStoredUser | null | undefined, validRoles: AppRole[]): AppRole | null {
  const role = user?.role ?? user?.roles?.[0];
  return role && validRoles.includes(role as AppRole) ? (role as AppRole) : null;
}