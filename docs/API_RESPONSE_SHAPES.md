# DAHAB — API Response Shapes (TypeScript)

Every response is wrapped in:
```ts
export interface ApiEnvelope<T> {
  success: boolean;
  data: T;
  message: string;
  timestamp: string; // ISO
}
```

Shared primitives:
```ts
export type Currency = 'USD' | 'EUR' | 'LYD';
export type AppRole = 'admin' | 'teller' | 'auditor' | 'consumer';
export type TxDirection = 'deposit' | 'withdraw';
export type TxStatus = 'posted' | 'pending' | 'rejected' | 'reversed';
export type VaultChannel = 'cash' | 'bank';
export type AccountKind = 'customer' | 'vault';
export type AccountNature = 'Debit' | 'Credit';
```

## Auth / users
```ts
export interface AuthMe {
  user_id: string;
  email: string | null;
  full_name: string;
  roles: AppRole[];
  must_change_password: boolean;
  branch: { id: number; name: string } | null;
}
export interface UserRow {
  id: string;
  email: string | null;
  full_name: string;
  roles: AppRole[];
  created_at: string;
}
```

## Holders & accounts
```ts
export interface Holder {
  id: number;
  dahab_account_number: string;
  canonical_name: string;
  holder_type: 'INDIVIDUAL' | 'BUSINESS' | 'TRUST';
  status: string;
  phone: string | null;
  email: string | null;
  owner_user_id: string | null;
  linked_account_count?: number;
  totals_by_currency?: { currency: Currency; total_minor: number }[];
  created_at: string;
}
export interface HolderAccount {
  id: number;
  account_holder_id: number;
  account_number: string;
  account_display_name: string;
  account_alias_name: string | null;
  currency_code: Currency;
  account_nature: AccountNature;
  current_balance_minor: number;
  status: string;
  withdraw_limit_amount_minor: number;
  withdraw_limit_enabled: boolean;
  is_primary_account: boolean;
}
export interface LedgerEntry {
  id: number;
  tx_number: string;
  posted_at: string;
  description: string | null;
  debit_amount_minor: number;
  credit_amount_minor: number;
  balance_after_minor: number;
  currency_code: Currency;
}
```

## Transactions
```ts
export interface Transaction {
  id: string;                       // uuid
  tx_number: string;
  customer_account_id: string;
  vault_account_id: string | null;
  direction: TxDirection;
  channel: VaultChannel;
  currency: Currency;
  amount_minor: number;
  requested_amount_minor: number | null;
  status: TxStatus;
  comment: string;
  review_reason: string | null;
  reject_reason: string | null;
  correction_reason: string | null;
  reverses_tx_id: string | null;
  corrected_by_tx_id: string | null;
  created_by_user_id: string;
  approved_by_user_id: string | null;
  branch_id: number | null;
  partial_approved: boolean;
  posted_at: string | null;
  created_at: string;
}
```

## Vaults
```ts
export interface VaultAccount {
  id: string;
  name: string;
  vault_channel: VaultChannel;
  status: string;
  balances: { currency: Currency; balance_minor: number }[];
}
export interface ConsolidatedUsd {
  total_usd_minor: number;
  breakdown: { currency: Currency; usd_rate: number | null; rate_date: string | null }[];
  missing_rates: Currency[];
  computed_at: string;
}
export interface FxRate {
  id: number;
  currency: Currency;
  usd_rate: number;
  as_of_date: string;
  note: string | null;
  created_by: string | null;
  created_at: string;
}
export interface Branch {
  id: number;
  code: string;
  name: string;
  city: string | null;
  status: 'active' | 'inactive';
  created_at: string;
}
```

## Groups
```ts
export interface AccountGroup {
  id: number; name: string; description: string | null;
  group_type: string; is_pinned: boolean; member_count: number;
  totals_by_currency: { currency: Currency; total_minor: number }[];
}
```

## Imports
```ts
export interface ImportBatch { id: number; file_name: string; status: string;
  total_rows: number; successful_rows: number; review_rows: number; failed_rows: number;
  imported_by: string | null; imported_at: string; }
export interface ReviewRow { id: number; raw_name: string; suggested_account_holder_id: number | null;
  confidence_score: number | null; review_status: string; }
```

## Dashboard
```ts
export interface DashboardStaff {
  totals_by_currency: {
    cash:     { currency: Currency; balance_minor: number }[];
    bank:     { currency: Currency; balance_minor: number }[];
    customer: { currency: Currency; balance_minor: number }[];
  };
  pending_count: number;
  holder_count: number;
  recent_transactions: Transaction[];
}
```

## Reports
```ts
export interface BusinessOverview {
  totals: { total: number; posted: number; rejected: number; rejection_rate: number };
  active_holders: number;
  volume_by_currency: { currency: Currency; volume_minor: number; posted_count: number }[];
  daily_volume_7d:    { day: string; currency: Currency; volume_minor: number; tx_count: number }[];
  currency_distribution: { currency: Currency; balance_minor: number }[];
  customer_growth_7m: { month: string; new_holders: number }[];
  top_accounts: { account_id: string; name: string; currency: Currency; balance_minor: number }[];
}
export interface CashFlowDaily { rows: { day: string; currency: Currency; direction: TxDirection; volume_minor: number; tx_count: number }[] }
export interface ApprovalSpeed { rows: { day: string; median_seconds: number; approved_count: number }[] }
export interface TellersToday  { rows: { teller_user_id: string; full_name: string; branch: string | null; currency: Currency; txns_count: number; volume_minor: number; accuracy_pct: number; avg_processing_seconds: number }[] }
export interface LiquidityHealth { rows: { account_id: string; currency: Currency; balance_minor: number; target_minor: number | null; min_minor: number | null; days_of_cover: number | null }[] }
export interface ComplianceOverview {
  flagged_today: number; pending_reviews: number; resolved_today: number; high_risk_holders: number;
  typology: { alert_type: string; count: number }[];
  alert_volume_daily: { day: string; generated: number; resolved: number }[];
}
```

## Audit
```ts
export interface AuditRow {
  id: string; actor_user_id: string | null; actor_full_name: string | null;
  action: string; target: string | null; details: Record<string, unknown> | null;
  created_at: string;
}
```

## Notifications
```ts
export interface NotificationRow {
  id: string; user_id: string;
  event_type: string; severity: 'info'|'warning'|'critical';
  title: string; body: string; data: Record<string, unknown>;
  transaction_id: string | null; read_at: string | null; created_at: string;
}
export interface NotificationPreferences {
  enabled: Record<string, boolean>;
  large_tx_threshold:  Record<Currency, number>;
  low_vault_threshold: Record<Currency, number>;
  pending_reminder_minutes: number;
  quiet_hours_start: string | null;
  quiet_hours_end:   string | null;
  daily_summary_enabled: boolean;
  daily_summary_time: string;
  browser_push_enabled: boolean;
}
```
