import { apiFetch } from "./_shared";

export type SandboxMultiEntryAccount = {
  id: string;
  accountCode: string;
  accountName: string;
  accountType: string;
  displayName?: string | null;
  dahabNumber?: string | null;
  holderType?: string | null;
  currencyCode: string;
  currentBalance: string;
  openingBalance?: string;
  allowNegativeBalance?: boolean;
};

export type SandboxMultiEntryLineInput = {
  accountId: string;
  currencyCode: string;
  amount: string;
  memo?: string;
};

export type SandboxMultiEntryRequest = {
  transactionDate: string;
  branchId?: string | null;
  narration?: string;
  inflows: SandboxMultiEntryLineInput[];
  outflows: SandboxMultiEntryLineInput[];
  idempotencyKey?: string;
};

export type SandboxCurrencySummary = {
  currencyCode: string;
  totalInflow: string;
  totalOutflow: string;
  difference: string;
  balanced: boolean;
  status: string;
};

export type SandboxLedgerPreviewRow = {
  id?: string;
  transactionNumber?: string;
  tx_number?: string;
  lineNumber?: number;
  ledger_line_number?: number;
  side?: "INFLOW" | "OUTFLOW" | string;
  accountId?: string;
  account_id?: string;
  accountCode?: string | null;
  account_code?: string | null;
  accountName?: string | null;
  account_name?: string | null;
  accountType?: string | null;
  account_type?: string | null;
  displayName?: string | null;
  display_name?: string | null;
  dahabNumber?: string | null;
  dahab_number?: string | null;
  holderType?: string | null;
  holder_type?: string | null;
  currencyCode?: string;
  currency_code?: string;
  debit?: string;
  debit_amount?: string | number;
  credit?: string;
  credit_amount?: string | number;
  amount: string | number;
  memo?: string | null;
  entryDirection?: string;
  entry_direction?: string;
  balanceAfter?: string;
  balance_after?: string | number;
  created_at?: string;
};

export type SandboxValidationResponse = {
  valid: boolean;
  balanced: boolean;
  errors: string[];
  currencySummary: SandboxCurrencySummary[];
  ledgerPreview: SandboxLedgerPreviewRow[];
};

export type SandboxOptionsResponse = {
  currencies: string[];
  accounts: SandboxMultiEntryAccount[];
  branches: Array<{ id: string; code?: string; name: string; city?: string; status?: string }>;
  currentUser?: { username?: string; email?: string; display_name?: string; role?: string } | null;
};

export type SandboxPostedResponse = {
  transaction: {
    id: string;
    tx_number: string;
    status: string;
    transaction_date: string;
    narration?: string | null;
    posted_at?: string | null;
    created_at?: string | null;
  };
  lines: unknown[];
  ledgerEntries: SandboxLedgerPreviewRow[];
};

export const sandboxMultiEntryApi = {
  options: () => apiFetch<SandboxOptionsResponse>("/sandbox/multi-entry/options"),
  validate: (body: SandboxMultiEntryRequest) =>
    apiFetch<SandboxValidationResponse>("/sandbox/multi-entry/validate", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  post: (body: SandboxMultiEntryRequest) =>
    apiFetch<SandboxPostedResponse>("/sandbox/multi-entry/post", {
      method: "POST",
      body: JSON.stringify(body),
    }),
  get: (txNumber: string) =>
    apiFetch<SandboxPostedResponse>(
      `/sandbox/multi-entry/transactions/${encodeURIComponent(txNumber)}`,
    ),
};
