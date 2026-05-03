import { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { formatMinor, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

export type StatementTx = {
  id: string;
  tx_number: string;
  direction: "deposit" | "withdraw";
  channel: string;
  currency: string;
  amount_minor: number;
  status: "posted" | "pending" | "rejected" | "reversed";
  comment: string;
  created_at: string;
};

/**
 * Bank-statement style ledger with running balance.
 * Customer accounts are credit-nature: deposits = credit (+), withdrawals = debit (−).
 * Only `posted` rows contribute to the running balance. `reversed` rows are shown
 * but the offsetting reversal entry already neutralises them in the ledger.
 */
export function StatementLedger({
  transactions,
  currency,
  emptyText = "No transactions yet.",
}: {
  transactions: StatementTx[];
  currency: string;
  emptyText?: string;
}) {
  // Compute running balance oldest -> newest, then display newest -> oldest.
  const rows = useMemo(() => {
    const sorted = [...transactions].sort(
      (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
    );
    let bal = 0;
    const enriched = sorted.map((t) => {
      const counts = t.status === "posted";
      const signed = t.direction === "deposit" ? t.amount_minor : -t.amount_minor;
      if (counts) bal += signed;
      return { ...t, balance_after: bal, counted: counts };
    });
    return enriched.reverse();
  }, [transactions]);

  if (rows.length === 0) {
    return <div className="p-6 text-center text-sm text-muted-foreground">{emptyText}</div>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-sm">
        <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-start">Date &amp; time</th>
            <th className="px-3 py-2 text-start">TX #</th>
            <th className="px-3 py-2 text-start">Description</th>
            <th className="px-3 py-2 text-end">Debit</th>
            <th className="px-3 py-2 text-end">Credit</th>
            <th className="px-3 py-2 text-start">Status</th>
            <th className="px-3 py-2 text-end">Balance after</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((t) => {
            const isDeposit = t.direction === "deposit";
            const muted = !t.counted;
            return (
              <tr key={t.id} className={cn(muted && "opacity-60")}>
                <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                  {formatDateTime(t.created_at)}
                </td>
                <td className="px-3 py-2 font-mono text-[13px]">{t.tx_number}</td>
                <td className="max-w-[20rem] px-3 py-2">
                  <div className="capitalize">{t.direction} · {t.channel}</div>
                  {t.comment ? (
                    <div className="truncate text-xs text-muted-foreground">{t.comment}</div>
                  ) : null}
                </td>
                <td className="px-3 py-2 text-end font-mono text-destructive">
                  {!isDeposit ? formatMinor(t.amount_minor, t.currency) : ""}
                </td>
                <td className="px-3 py-2 text-end font-mono text-success">
                  {isDeposit ? formatMinor(t.amount_minor, t.currency) : ""}
                </td>
                <td className="px-3 py-2">
                  <Badge
                    variant={
                      t.status === "posted" ? "secondary" :
                      t.status === "pending" ? "outline" :
                      "destructive"
                    }
                  >
                    {t.status}
                  </Badge>
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-end font-mono font-semibold">
                  {t.counted ? formatMinor(t.balance_after, currency) : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}