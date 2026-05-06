/**
 * Centralized query key factory for the AWS DAHAB backend.
 * Not consumed by any page yet — defined so the future migration
 * is purely mechanical (swap useQuery body, swap key).
 */
export const dahabKeys = {
  holders: {
    all: ["dahab", "holders"] as const,
    list: () => [...dahabKeys.holders.all, "list"] as const,
    detail: (id: number | string) => [...dahabKeys.holders.all, "detail", String(id)] as const,
    accounts: (id: number | string) => [...dahabKeys.holders.all, "accounts", String(id)] as const,
  },
  holderAccounts: {
    all: ["dahab", "holder-accounts"] as const,
    ledger: (id: number | string, range: { from?: string; to?: string } = {}) =>
      [...dahabKeys.holderAccounts.all, "ledger", String(id), range] as const,
  },
  transactions: {
    all: ["dahab", "transactions"] as const,
    list: (params: Record<string, unknown> = {}) =>
      [...dahabKeys.transactions.all, "list", params] as const,
  },
  internalAccounts: {
    all: ["dahab", "internal-accounts"] as const,
    list: () => [...dahabKeys.internalAccounts.all, "list"] as const,
  },
};