import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app/app-shell";
import { useAuth, hasAnyRole } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ArrowLeft, ChevronDown, ChevronUp, Calendar as CalendarIcon, Download, X } from "lucide-react";
import { formatMinor, parseAmountToMinor } from "@/lib/format";
import { toast } from "sonner";
import { StatementLedger } from "@/components/app/statement-ledger";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/accounts/$id")({ component: AccountDetail });

function AccountDetail() {
  const { id } = Route.useParams();
  const { roles } = useAuth();
  const isAdmin = hasAnyRole(roles, ["admin"]);
  const qc = useQueryClient();

  const { data: acc } = useQuery({
    queryKey: ["account.detail", id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("accounts")
        .select("id, name, account_number, phone, national_id, nature, status")
        .eq("id", id).single();
      if (error) throw error;
      return data;
    },
  });
  const { data: bals } = useQuery({
    queryKey: ["account.balances.full", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("account_balances").select("*").eq("account_id", id);
      if (error) throw error;
      return data;
    },
  });
  const { data: tx } = useQuery({
    queryKey: ["account.tx", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("transactions")
        .select("id, tx_number, direction, channel, currency, amount_minor, status, comment, created_at")
        .eq("customer_account_id", id).order("created_at", { ascending: false }).limit(500);
      if (error) throw error;
      return data;
    },
  });

  return (
    <div>
      <PageHeader
        title={acc ? acc.name : "Account"}
        description={acc ? `#${acc.account_number} · ${acc.phone ?? "no phone"} · ${acc.national_id ?? "no ID"}` : ""}
        actions={
          <Button asChild variant="outline" size="sm"><Link to="/app/accounts"><ArrowLeft className="h-4 w-4" /> Back</Link></Button>
        }
      />
      <div className="space-y-6 p-6">
        <div className="space-y-3">
          {(["USD", "EUR", "LYD"] as const).map((c) => {
            const b = bals?.find((x) => x.currency === c);
            return (
              <CurrencyAccountCard
                key={c}
                currency={c}
                accountNumber={acc?.account_number ?? ""}
                balance={b?.balance_minor ?? 0}
                limit={b?.debit_limit_minor ?? 0}
                isAdmin={isAdmin}
                transactions={(tx ?? []).filter((t) => t.currency === c) as any}
                onSaveLimit={async (newLimitMinor) => {
                  const { error } = await supabase.from("account_balances")
                    .update({ debit_limit_minor: newLimitMinor })
                    .eq("account_id", id).eq("currency", c);
                  if (error) { toast.error(error.message); return; }
                  toast.success("Limit updated");
                  qc.invalidateQueries({ queryKey: ["account.balances.full", id] });
                }}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

type DatePreset = "all" | "today" | "week" | "month" | "custom";

function presetRange(p: DatePreset): { from: Date | null; to: Date | null } {
  const now = new Date();
  if (p === "today") {
    const f = new Date(now); f.setHours(0, 0, 0, 0);
    return { from: f, to: now };
  }
  if (p === "week") {
    const f = new Date(now); f.setDate(now.getDate() - 7);
    return { from: f, to: now };
  }
  if (p === "month") {
    const f = new Date(now); f.setMonth(now.getMonth() - 1);
    return { from: f, to: now };
  }
  return { from: null, to: null };
}

function CurrencyAccountCard({
  currency, accountNumber, balance, limit, isAdmin, transactions, onSaveLimit,
}: {
  currency: "USD" | "EUR" | "LYD";
  accountNumber: string;
  balance: number; limit: number; isAdmin: boolean;
  transactions: any[];
  onSaveLimit: (minor: number) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [val, setVal] = useState((limit / 100).toString());
  const [preset, setPreset] = useState<DatePreset>("all");
  const [customFrom, setCustomFrom] = useState<Date | undefined>(undefined);
  const [customTo, setCustomTo] = useState<Date | undefined>(undefined);

  const filtered = useMemo(() => {
    let rows = transactions ?? [];
    let from: Date | null = null;
    let to: Date | null = null;
    if (preset === "custom") {
      from = customFrom ?? null;
      to = customTo ?? null;
      if (to) { const x = new Date(to); x.setHours(23, 59, 59, 999); to = x; }
    } else if (preset !== "all") {
      const r = presetRange(preset);
      from = r.from; to = r.to;
    }
    if (from || to) {
      rows = rows.filter((r: any) => {
        const d = new Date(r.created_at).getTime();
        if (from && d < from.getTime()) return false;
        if (to && d > to.getTime()) return false;
        return true;
      });
    }
    return rows;
  }, [transactions, preset, customFrom, customTo]);

  function exportCSV() {
    const rows = [
      ["TX #", "Date", "Type", "Channel", "Currency", "Amount", "Status", "Comment"],
      ...filtered.map((t: any) => [
        t.tx_number, t.created_at, t.direction, t.channel, t.currency,
        (t.amount_minor / 100).toFixed(2), t.status, t.comment,
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `ledger-${currency}-${accountNumber || "account"}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Card className="overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-4 p-5 text-start transition hover:bg-muted/40"
        aria-expanded={open}
      >
        <div className="flex-1 min-w-0">
          <div className="font-serif text-2xl tracking-wide">{currency}</div>
          <div className="mt-1 text-xs text-muted-foreground">
            Single-debit limit:{" "}
            <span className="font-mono">{limit > 0 ? formatMinor(limit, currency) : "no limit"}</span>
          </div>
        </div>
        <div className="text-end">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Current balance</div>
          <div className="font-mono text-2xl font-semibold tracking-tight">{formatMinor(balance, currency)}</div>
        </div>
        <div className="ms-2 inline-flex h-8 w-8 items-center justify-center rounded-full border">
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </button>

      {open ? (
        <div className="border-t">
          {isAdmin ? (
            <div className="flex items-center gap-2 border-b bg-muted/20 px-4 py-2 text-xs">
              <span className="text-muted-foreground">Single-debit limit</span>
              {!editing ? (
                <>
                  <span className="font-mono">{limit > 0 ? formatMinor(limit, currency) : "no limit"}</span>
                  <Button size="sm" variant="ghost" className="h-7" onClick={() => setEditing(true)}>Edit</Button>
                </>
              ) : (
                <>
                  <Input value={val} onChange={(e) => setVal(e.target.value)} className="h-7 w-32" />
                  <Button size="sm" className="h-7" onClick={async () => {
                    const minor = val === "" || val === "0" ? 0 : parseAmountToMinor(val);
                    if (minor === null) return toast.error("Invalid amount");
                    await onSaveLimit(minor); setEditing(false);
                  }}>Save</Button>
                  <Button size="sm" variant="ghost" className="h-7" onClick={() => setEditing(false)}>×</Button>
                </>
              )}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2 p-3">
            <DateChip label="Any time" active={preset === "all"} onClick={() => setPreset("all")} />
            <DateChip label="Today" active={preset === "today"} onClick={() => setPreset("today")} />
            <DateChip label="7d" active={preset === "week"} onClick={() => setPreset("week")} />
            <DateChip label="30d" active={preset === "month"} onClick={() => setPreset("month")} />
            <Popover>
              <PopoverTrigger asChild>
                <Button variant={preset === "custom" ? "default" : "outline"} size="sm" className="h-8">
                  <CalendarIcon className="mr-1.5 h-3.5 w-3.5" />
                  {preset === "custom" && (customFrom || customTo)
                    ? `${customFrom ? customFrom.toLocaleDateString() : "…"} – ${customTo ? customTo.toLocaleDateString() : "…"}`
                    : "Custom"}
                  {preset === "custom" ? (
                    <X
                      className="ml-1.5 h-3.5 w-3.5 opacity-70"
                      onClick={(e) => { e.stopPropagation(); setPreset("all"); setCustomFrom(undefined); setCustomTo(undefined); }}
                    />
                  ) : null}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-64 p-3">
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">From</Label>
                    <Input
                      type="date"
                      value={customFrom ? customFrom.toISOString().slice(0, 10) : ""}
                      onChange={(e) => { setCustomFrom(e.target.value ? new Date(e.target.value) : undefined); setPreset("custom"); }}
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">To</Label>
                    <Input
                      type="date"
                      value={customTo ? customTo.toISOString().slice(0, 10) : ""}
                      onChange={(e) => { setCustomTo(e.target.value ? new Date(e.target.value) : undefined); setPreset("custom"); }}
                    />
                  </div>
                </div>
              </PopoverContent>
            </Popover>

            <div className="ms-auto">
              <Button variant="outline" size="sm" onClick={exportCSV} disabled={filtered.length === 0}>
                <Download className="h-3.5 w-3.5" /> CSV
              </Button>
            </div>
          </div>

          <StatementLedger
            transactions={filtered as any}
            currency={currency}
            emptyText={`No ${currency} transactions in this range.`}
          />
        </div>
      ) : null}
    </Card>
  );
}

function DateChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md border px-2.5 py-1 text-xs transition",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}