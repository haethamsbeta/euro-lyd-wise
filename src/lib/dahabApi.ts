/**
 * DAHAB AWS API client (scaffold).
 *
 * NOTE: This module is intentionally NOT imported by any page yet.
 * It is a typed wrapper around the AWS backend at VITE_API_BASE_URL,
 * ready to be wired up once the endpoints are confirmed live.
 * Until then, all pages continue to use the existing Supabase client.
 */

import { API_BASE_URL as RUNTIME_API_BASE_URL } from "@/lib/runtimeConfig";

export const API_BASE_URL = RUNTIME_API_BASE_URL;

export type ApiEnvelope<T> = {
  success: boolean;
  data: T;
  message: string;
  timestamp: string;
};

export class ApiError extends Error {
  status: number;
  details?: unknown;
  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.details = details;
  }
}

// --- Auth token plumbing --------------------------------------------------
// User login is separate from DB credentials. Whatever auth scheme we end up
// with (Cognito, custom JWT, signed session cookie, etc.) plugs in here
// without touching call sites.
type TokenProvider = () => Promise<string | null> | string | null;
let tokenProvider: TokenProvider = () => null;
export function setAuthTokenProvider(provider: TokenProvider) {
  tokenProvider = provider;
}

// --- Core fetch -----------------------------------------------------------
function normalizeApiPath(path: string): string {
  let p = path || "/";
  if (!p.startsWith("/")) p = "/" + p;
  if (p.startsWith("/api/")) p = p.slice(4); // "/api/health" -> "/health"
  if (p === "/api") p = "/";
  return p;
}

function clearExpiredBrowserSession() {
  if (typeof window === "undefined") return;
  for (const storage of [window.sessionStorage, window.localStorage]) {
    storage.removeItem("dahab.access_token");
    storage.removeItem("dahab.refresh_token");
    storage.removeItem("dahab.user");
    storage.removeItem("dahab.signed_in_at");
  }
  window.dispatchEvent(new Event("dahab.auth.expired"));
}

function shouldRedirectAfterUnauthorized(path: string) {
  if (typeof window === "undefined") return false;
  if (path === "/auth/login" || path === "/auth/forgot-password" || path === "/auth/reset-password")
    return false;
  const current = window.location.pathname;
  return !["/login", "/forgot-password", "/reset-password"].includes(current);
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const envelope = await apiFetchEnvelope<T>(path, init);
  return envelope.data;
}

export async function apiFetchEnvelope<T>(
  path: string,
  init: RequestInit = {},
): Promise<ApiEnvelope<T>> {
  if (!API_BASE_URL) {
    throw new ApiError("VITE_API_BASE_URL is not configured", 0);
  }
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }
  const providerToken = await tokenProvider();
  if (providerToken) headers.set("Authorization", `Bearer ${providerToken}`);

  const normalizedPath = normalizeApiPath(path);
  const base = API_BASE_URL.replace(/\/+$/, "");
  const url = `${base}${normalizedPath.startsWith("/") ? normalizedPath : "/" + normalizedPath}`;
  const res = await fetch(url, { ...init, headers });

  let envelope: ApiEnvelope<T> | null = null;
  try {
    envelope = (await res.json()) as ApiEnvelope<T>;
  } catch {
    if (!res.ok) throw new ApiError(res.statusText || "Request failed", res.status);
    throw new ApiError("Invalid JSON response", res.status);
  }

  if (!res.ok || !envelope?.success) {
    if (res.status === 401) {
      clearExpiredBrowserSession();
      if (shouldRedirectAfterUnauthorized(normalizedPath)) {
        window.location.assign("/login?portal=staff");
      }
    }
    throw new ApiError(envelope?.message ?? res.statusText, res.status, envelope);
  }
  return envelope;
}

function qs(params: Record<string, string | number | undefined | null>): string {
  const usp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") usp.set(k, String(v));
  }
  const s = usp.toString();
  return s ? `?${s}` : "";
}

// --- Domain types ---------------------------------------------------------
export type Currency = "LYD" | "USD" | "EUR" | "GBP";
export type AccountNature = "Debit" | "Credit";
export type HolderStatus = "active" | "inactive" | "frozen" | string;
export type TransactionCategory = "cash" | "discount" | "general";
export type InternalAccountKind = "vault" | "discount";

/** Paged envelope inside `data` for list endpoints. */
export interface PagedResult<T> {
  items: T[];
  total?: number;
  limit?: number;
  offset?: number;
  next_cursor?: string | null;
}

export interface Holder {
  id: number | string;
  dahab_account_number: string;
  holder_name: string;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  notes?: string | null;
  status: HolderStatus;
  linked_account_count?: number;
  total_balance_summary?: Array<{ currency: Currency; total: number }>;
}

export interface HolderAccount {
  id: number | string;
  account_holder_id: number | string;
  account_number: string;
  account_display_name: string;
  currency_code: Currency;
  account_nature: AccountNature;
  current_balance: number;
  status: string;
  source_account_id?: string | null;
  source_account_code?: string | null;
  alias_name?: string | null;
  phone?: string | null;
}

export interface LedgerEntry {
  id: number | string;
  tx_number: string;
  posted_at: string;
  description: string | null;
  debit_amount: number;
  credit_amount: number;
  balance_after: number;
  currency_code: Currency;
}

export interface Transaction {
  id: number | string;
  tx_number: string;
  posted_at: string;
  holder_account_id?: number | string | null;
  internal_account_id?: number | string | null;
  transaction_category: TransactionCategory;
  debit_amount: number;
  credit_amount: number;
  amount: number;
  currency_code: Currency;
  description?: string | null;
  status: string;
}

export interface InternalAccount {
  id: number | string;
  name: string;
  kind: InternalAccountKind;
  currency_code: Currency;
  internal_role?: string | null;
  source_entry_type_id?: string | null;
  current_balance?: number | null;
  is_active: boolean;
}

// --- Endpoint helpers -----------------------------------------------------
export const dahabApi = {
  holders: {
    list: () => apiFetch<Holder[]>("/holders"),
    get: (holderId: number | string) => apiFetch<Holder>(`/holders/${holderId}`),
    create: (body: Partial<Holder>) =>
      apiFetch<Holder>("/holders", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    accounts: (holderId: number | string) =>
      apiFetch<HolderAccount[]>(`/holders/${holderId}/accounts`),
  },
  holderAccounts: {
    create: (holderId: number | string, body: Partial<HolderAccount>) =>
      apiFetch<HolderAccount>(`/holders/${holderId}/accounts`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    ledger: (holderAccountId: number | string, range: { from?: string; to?: string } = {}) =>
      apiFetch<LedgerEntry[]>(`/holder-accounts/${holderAccountId}/ledger${qs(range)}`),
  },
  transactions: {
    list: (
      params: {
        q?: string;
        from?: string;
        to?: string;
        category?: TransactionCategory;
        limit?: number;
        offset?: number;
      } = {},
    ) => apiFetch<Transaction[]>(`/transactions${qs(params)}`),
  },
  internalAccounts: {
    list: () => apiFetch<InternalAccount[]>("/internal-accounts"),
  },
  vaults: {
    list: () => apiFetch<InternalAccount[]>("/vaults"),
  },
};
