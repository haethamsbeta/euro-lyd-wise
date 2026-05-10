// Shared hook for the /dashboard/staff summary counts. Pages must read true
// DB totals from here rather than computing them from limited list endpoints.
import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { DATA_BACKEND, REALTIME_MODE, POLL_INTERVALS } from "@/lib/runtimeConfig";

export interface DashboardSummary {
  holderCount: number | null;
  holderAccountCount: number | null;
  transactionCount: number | null;
  vaultCount: number | null;
  pendingApprovals: number | null;
  txnsToday: number | null;
}

const EMPTY: DashboardSummary = {
  holderCount: null,
  holderAccountCount: null,
  transactionCount: null,
  vaultCount: null,
  pendingApprovals: null,
  txnsToday: null,
};

export function useDashboardSummary() {
  return useQuery<DashboardSummary>({
    queryKey: ["dashboard.summary"],
    enabled: DATA_BACKEND === "lambda",
    queryFn: async () => {
      const r: any = await api.dashboard.admin().catch(() => null);
      if (!r) return EMPTY;
      return {
        holderCount: r.holder_count ?? r.active_holders ?? null,
        holderAccountCount: r.holder_account_count ?? null,
        transactionCount: r.transaction_count ?? null,
        vaultCount: r.vault_count ?? null,
        pendingApprovals: r.pending_approvals ?? null,
        txnsToday: r.txns_today ?? null,
      };
    },
    refetchInterval: REALTIME_MODE === "polling" ? POLL_INTERVALS.dashboard : false,
  });
}

export function fmtTotal(n: number | null | undefined): string {
  if (n == null) return "—";
  return n.toLocaleString();
}
