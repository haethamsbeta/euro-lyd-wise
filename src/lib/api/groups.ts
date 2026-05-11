// Account groups (Lambda) adapter.
// Backend contract: docs/API_CONTRACT.md (`/api/groups*`)
//                   docs/API_RESPONSE_SHAPES.md (`AccountGroup`)
import { apiFetch, qs } from "./_shared";

export interface AccountGroupTotal {
  currency: string;
  total_minor: number;
}

export interface AccountGroup {
  id: number | string;
  name: string;
  description: string | null;
  group_type: string;
  is_pinned: boolean;
  member_count: number;
  totals_by_currency: AccountGroupTotal[];
  created_at: string;
  updated_at: string;
}

export interface GroupMember {
  holder_account_id: number | string;
  account_holder_id: number | string;
  account_number: string;
  dahab_account_number: string | null;
  holder_name: string;
  account_display_name: string | null;
  currency_code: string;
  current_balance_minor: number;
  status: string;
  added_at: string;
}

export interface GroupActivity30d {
  by_currency: Array<{
    currency: string;
    credits_minor: number;
    debits_minor: number;
    tx_count: number;
  }>;
  recent: Array<{
    id: string | number;
    account_id: string | number;
    currency_code: string;
    debit_amount_minor: number;
    credit_amount_minor: number;
    description: string | null;
    posted_at: string;
    tx_number: string;
  }>;
}

export interface CreateGroupBody {
  name: string;
  description?: string | null;
  group_type: string;
  is_pinned?: boolean;
}

export type UpdateGroupBody = Partial<CreateGroupBody>;

export const groupsApi = {
  list: (params: { q?: string; pinned?: boolean } = {}) =>
    apiFetch<AccountGroup[]>(`/groups${qs(params)}`),
  get: (id: string | number) => apiFetch<AccountGroup>(`/groups/${id}`),
  create: (body: CreateGroupBody) =>
    apiFetch<AccountGroup>(`/groups`, {
      method: "POST",
      body: JSON.stringify(body),
    }),
  update: (id: string | number, body: UpdateGroupBody) =>
    apiFetch<AccountGroup>(`/groups/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  remove: (id: string | number) =>
    apiFetch<{ ok: true }>(`/groups/${id}`, { method: "DELETE" }),
  togglePin: (id: string | number, is_pinned: boolean) =>
    apiFetch<AccountGroup>(`/groups/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ is_pinned }),
    }),
  members: (id: string | number) =>
    apiFetch<GroupMember[]>(`/groups/${id}/members`),
  addMember: (id: string | number, holder_account_id: string | number) =>
    apiFetch<{ ok: true }>(`/groups/${id}/members`, {
      method: "POST",
      body: JSON.stringify({ holder_account_id }),
    }),
  removeMember: (
    id: string | number,
    holder_account_id: string | number,
  ) =>
    apiFetch<{ ok: true }>(`/groups/${id}/members/${holder_account_id}`, {
      method: "DELETE",
    }),
  /** Optional — backend may not implement this yet. */
  activity30d: (id: string | number) =>
    apiFetch<GroupActivity30d>(`/groups/${id}/activity30d`),
};