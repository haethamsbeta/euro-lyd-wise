import { useMemo } from "react";
import { formatMinor, formatDateTime, tStatus, tDirection, tChannel } from "@/lib/format";
import { useT } from "@/lib/i18n";
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
  const t = useT();
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
    return (
      <div className="p-6 text-center text-sm text-muted-foreground">
        {emptyText && emptyText !== "No transactions yet." ? emptyText : t("ledger.empty")}
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[760px] text-sm">
        <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
          <tr>
            <th className="px-3 py-2 text-start">{t("ledger.col.dateTime")}</th>
            <th className="px-3 py-2 text-start">{t("ledger.col.tx")}</th>
            <th className="px-3 py-2 text-start">{t("ledger.col.description")}</th>
            <th className="px-3 py-2 text-end">{t("ledger.col.debit")}</th>
            <th className="px-3 py-2 text-end">{t("ledger.col.credit")}</th>
            <th className="px-3 py-2 text-start">{t("ledger.col.status")}</th>
            <th className="px-3 py-2 text-end">{t("ledger.col.balanceAfter")}</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((row) => {
            const isDeposit = row.direction === "deposit";
            const muted = !row.counted;
            return (
              <tr key={row.id} className={cn(muted && "opacity-60")}>
                <td className="whitespace-nowrap px-3 py-2 text-muted-foreground">
                  {formatDateTime(row.created_at)}
                </td>
                <td className="px-3 py-2 font-mono text-[13px]">{row.tx_number}</td>
                <td className="max-w-[20rem] px-3 py-2">
                  <div>{tDirection(t, row.direction)} · {tChannel(t, row.channel)}</div>
                  {row.comment ? (
                    <div className="truncate text-xs text-muted-foreground">{row.comment}</div>
                  ) : null}
                </td>
                <td className="px-3 py-2 text-end num text-destructive">
                  {!isDeposit ? formatMinor(row.amount_minor, row.currency) : ""}
                </td>
                <td className="px-3 py-2 text-end num text-success">
                  {isDeposit ? formatMinor(row.amount_minor, row.currency) : ""}
                </td>
                <td className="px-3 py-2">
                  <span
                    className={cn(
                      "chip",
                      row.status === "posted" && "chip-gold",
                      row.status === "rejected" && "!border-destructive/40 !text-destructive",
                      row.status === "reversed" && "!border-warning/40 !text-warning",
                    )}
                  >
                    {tStatus(t, row.status)}
                  </span>
                </td>
                <td className="whitespace-nowrap px-3 py-2 text-end num font-semibold">
                  {row.counted ? formatMinor(row.balance_after, currency) : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}