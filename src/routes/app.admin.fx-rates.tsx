import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { RoleGate } from "@/components/app/app-shell";
import { BackendPending, isPendingError } from "@/components/app/backend-pending";
import { api } from "@/lib/api";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { formatDateTime } from "@/lib/format";
import { Plus, TrendingUp } from "lucide-react";

export const Route = createFileRoute("/app/admin/fx-rates")({
  component: () => <RoleGate allow={["admin"]}><FxRatesPage /></RoleGate>,
});

const CURRENCIES = ["USD", "EUR", "LYD"] as const;
type Ccy = (typeof CURRENCIES)[number];

function FxRatesPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [currency, setCurrency] = useState<Ccy>("EUR");
  const [usdRate, setUsdRate] = useState("");
  const [asOf, setAsOf] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState("");

  const { data: history = [], isLoading, error: historyError } = useQuery({
    queryKey: ["fx_rates.history"],
    queryFn: async () => {
      const rows = await api.fxRates.list();
      // Newest first by as_of_date.
      return [...rows].sort((a, b) =>
        String(b.as_of_date ?? "").localeCompare(String(a.as_of_date ?? "")),
      );
    },
    retry: false,
  });
  const pending = isPendingError(historyError);

  const current = CURRENCIES.map((c) => {
    const latest = history.find((r: any) => r.currency_code === c);
    return { currency: c, latest };
  });

  const addRate = useMutation({
    mutationFn: async () => {
      const rate = Number(usdRate);
      if (!rate || rate <= 0) throw new Error("Enter a positive USD rate");
      await api.fxRates.create({
        currency_code: currency,
        usd_rate: rate,
        as_of_date: asOf,
        note: note ? note : null,
      });
    },
    onSuccess: () => {
      toast.success("FX rate saved");
      qc.invalidateQueries({ queryKey: ["fx_rates.history"] });
      qc.invalidateQueries({ queryKey: ["vaults.consolidatedUsd"] });
      qc.invalidateQueries({ queryKey: ["reports", "liquidity-health"] });
      setOpen(false);
      setUsdRate("");
      setNote("");
    },
    onError: (e: any) => {
      if (isPendingError(e)) toast.error("Backend endpoint pending: POST /admin/fx-rates");
      else toast.error(e.message ?? "Failed to save rate");
    },
  });

  return (
    <div className="space-y-8 p-4 pb-12 sm:p-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="font-serif text-2xl font-semibold text-foreground md:text-3xl">FX rates</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Manual rates used to calculate consolidated USD reserves. New entries replace older ones automatically.
          </p>
        </div>
        <Button
          onClick={() => setOpen(true)}
          className="gap-2"
          disabled={pending}
          title={pending ? "Backend write endpoint pending: POST /admin/fx-rates" : undefined}
        >
          <Plus className="h-4 w-4" /> Add rate
        </Button>
      </div>

      {pending ? (
        <BackendPending endpoint="GET /admin/fx-rates" note="FX rates are admin-entered. The backend list endpoint is not yet available." />
      ) : (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {current.map(({ currency: c, latest }) => (
          <Card key={c} className="p-5">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {c} → USD
              </span>
              <TrendingUp className="h-4 w-4 text-gold" />
            </div>
            {latest ? (
              <>
                <div className="font-mono text-2xl font-semibold tabular-nums text-foreground">
                  {Number(latest.usd_rate).toFixed(8).replace(/0+$/, "0")}
                </div>
                <div className="mt-1 text-xs text-muted-foreground">
                  As of {latest.as_of_date}
                </div>
              </>
            ) : (
              <>
                <div className="font-mono text-2xl font-semibold tabular-nums text-warning">—</div>
                <div className="mt-1 text-xs text-warning">No rate set</div>
              </>
            )}
          </Card>
        ))}
      </div>
      )}

      {!pending && (
      <Card className="overflow-hidden p-0">
        <div className="border-b border-border bg-muted/30 px-5 py-3 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          History
        </div>
        <div className="overflow-x-auto">
          <table className="w-full whitespace-nowrap text-left text-sm">
            <thead className="border-b border-border bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-5 py-3 font-medium">As of</th>
                <th className="px-5 py-3 font-medium">Currency</th>
                <th className="px-5 py-3 text-right font-medium">USD rate</th>
                <th className="px-5 py-3 font-medium">Note</th>
                <th className="px-5 py-3 font-medium">Entered</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr><td colSpan={5} className="px-5 py-8 text-center text-muted-foreground">Loading…</td></tr>
              ) : history.length === 0 ? (
                <tr><td colSpan={5} className="px-5 py-8 text-center text-muted-foreground">No rates entered yet.</td></tr>
              ) : (
                history.map((r: any) => (
                  <tr key={r.id} className="transition-colors hover:bg-muted/40">
                    <td className="px-5 py-3 text-xs">{r.as_of_date}</td>
                    <td className="px-5 py-3"><Badge variant="outline">{r.currency_code}</Badge></td>
                    <td className="px-5 py-3 text-right font-mono tabular-nums">{Number(r.usd_rate).toFixed(8)}</td>
                    <td className="px-5 py-3 text-xs text-muted-foreground">{r.note ?? "—"}</td>
                    <td className="px-5 py-3 text-xs text-muted-foreground">{formatDateTime(r.created_at)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add FX rate</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Currency</Label>
              <Select value={currency} onValueChange={(v) => setCurrency(v as Ccy)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((c) => (
                    <SelectItem key={c} value={c}>{c}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>USD rate (1 {currency} = ? USD)</Label>
              <Input
                type="number"
                step="0.00000001"
                value={usdRate}
                onChange={(e) => setUsdRate(e.target.value)}
                placeholder="e.g. 1.08000000"
              />
            </div>
            <div>
              <Label>As of date</Label>
              <Input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} />
            </div>
            <div>
              <Label>Note (optional)</Label>
              <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. CBL official rate" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => addRate.mutate()} disabled={addRate.isPending}>
              {addRate.isPending ? "Saving…" : "Save rate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
