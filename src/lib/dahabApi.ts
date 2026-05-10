/**
 * DAHAB AWS API client (scaffold).
 *
 * NOTE: This module is intentionally NOT imported by any page yet.
 * It is a typed wrapper around the AWS backend at VITE_API_BASE_URL,
 * ready to be wired up once the endpoints are confirmed live.
 * Until then, all pages continue to use the existing Supabase client.
 */

export const API_BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";

export type ApiEnvelope<T> = {
  success: boolean;
  data: T;
  message: string;
  timestamp: string;
};

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
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
export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  if (!API_BASE_URL) {
    throw new ApiError("VITE_API_BASE_URL is not configured", 0);
  }
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type") && init.body) {
    headers.set("Content-Type", "application/json");
  }
  const token = await tokenProvider();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const url = `${API_BASE_URL}${path.startsWith("/") ? "" : "/"}${path}`;
  const res = await fetch(url, { ...init, headers });

  let envelope: ApiEnvelope<T> | null = null;
  try {
    envelope = (await res.json()) as ApiEnvelope<T>;
  } catch {
    if (!res.ok) throw new ApiError(res.statusText || "Request failed", res.status);
    throw new ApiError("Invalid JSON response", res.status);
  }

  if (!res.ok || !envelope?.success) {
    throw new ApiError(envelope?.message ?? res.statusText, res.status);
  }
  return envelope.data;
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
    list: () => apiFetch<Holder[]>("/api/holders"),
    get: (holderId: number | string) =>
      apiFetch<Holder>(`/api/holders/${holderId}`),
    create: (body: Partial<Holder>) =>
      apiFetch<Holder>("/api/holders", {
        method: "POST",
        body: JSON.stringify(body),
      }),
    accounts: (holderId: number | string) =>
      apiFetch<HolderAccount[]>(`/api/holders/${holderId}/accounts`),
  },
  holderAccounts: {
    create: (holderId: number | string, body: Partial<HolderAccount>) =>
      apiFetch<HolderAccount>(`/api/holders/${holderId}/accounts`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    ledger: (
      holderAccountId: number | string,
      range: { from?: string; to?: string } = {},
    ) =>
      apiFetch<LedgerEntry[]>(
        `/api/holder-accounts/${holderAccountId}/ledger${qs(range)}`,
      ),
  },
  transactions: {
    list: (params: {
      q?: string;
      from?: string;
      to?: string;
      category?: TransactionCategory;
      limit?: number;
      offset?: number;
    } = {}) => apiFetch<Transaction[]>(`/api/transactions${qs(params)}`),
  },
  internalAccounts: {
    list: () => apiFetch<InternalAccount[]>("/api/internal-accounts"),
  },
  vaults: {
    list: () => apiFetch<InternalAccount[]>("/api/vaults"),
  },
};