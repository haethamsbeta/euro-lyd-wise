import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, hasAnyRole } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronDown, ChevronUp, LogOut, Download, Calendar as CalendarIcon, X } from "lucide-react";
import { DahabMark, DahabCoin } from "@/components/brand/dahab-mark";
import { formatMinor } from "@/lib/format";
import { LanguageToggle } from "@/components/ui/language-toggle";
import { StatementLedger } from "@/components/app/statement-ledger";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/portal")({
  component: Portal,
  head: () => ({ meta: [{ title: "Customer portal — Dahab" }] }),
});

function Portal() {
  const { session, loading, rolesLoading, signOut, user, roles } = useAuth();
  const nav = useNavigate();
  const t = useT();
  useEffect(() => {
    if (loading) return;
    if (!session) {
      nav({ to: "/login", search: { portal: "consumer" } as any });
      return;
    }
    // Staff users belong in the back-office, not the customer portal.
    if (!rolesLoading && hasAnyRole(roles, ["admin", "teller", "auditor"])) {
      nav({ to: "/app" });
    }
  }, [session, loading, rolesLoading, roles, nav]);

  const { data } = useQuery({
    queryKey: ["portal", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data: accs, error: e1 } = await supabase
        .from("accounts")
        .select("id, name, account_number, account_balances(currency, balance_minor)")
        .eq("owner_user_id", user!.id);
      if (e1) throw e1;
      return { accounts: accs ?? [] };
    },
  });

  if (loading || !session) return <div className="p-10 text-center text-muted-foreground">{t("common.loading")}</div>;

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="container mx-auto flex h-14 items-center justify-between px-6">
          <Link to="/" className="flex items-center gap-3"><DahabCoin /><DahabMark size="sm" showArabic={false} /></Link>
          <div className="flex items-center gap-3 text-sm">
            <LanguageToggle />
            <span className="text-muted-foreground">{user?.email}</span>
            <Button variant="ghost" size="sm" onClick={() => signOut()}><LogOut className="h-4 w-4" /></Button>
          </div>
        </div>
      </header>
      <main className="container mx-auto space-y-6 px-6 py-8">
        <div>
          <h1 className="font-serif text-3xl font-semibold gold-text">{t("portal.myAccounts")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("portal.myAccountsHint")}</p>
        </div>
        {(!data || data.accounts.length === 0) ? (
          <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
            {t("portal.noAccounts")}
          </CardContent></Card>
        ) : (
          <div className="space-y-4">
            {data.accounts.flatMap((a: any) =>
              (a.account_balances ?? []).map((b: any) => (
                <AccountCard
                  key={`${a.id}-${b.currency}`}
                  accountId={a.id}
                  accountName={a.name}
                  accountNumber={a.account_number}
                  currency={b.currency}
                  balance={b.balance_minor}
                />
              )),
            )}
          </div>
        )}
      </main>
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

function AccountCard({
  accountId, accountName, accountNumber, currency, balance,
}: {
  accountId: string; accountName: string; accountNumber: string;
  currency: string; balance: number;
}) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [preset, setPreset] = useState<DatePreset>("all");
  const [customFrom, setCustomFrom] = useState<Date | undefined>(undefined);
  const [customTo, setCustomTo] = useState<Date | undefined>(undefined);

  const { data: tx, isLoading } = useQuery({
    queryKey: ["portal.ledger", accountId, currency],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("transactions")
        .select("id, tx_number, direction, channel, currency, amount_minor, status, comment, created_at")
        .eq("customer_account_id", accountId)
        .eq("currency", currency as any)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = useMemo(() => {
    let rows = tx ?? [];
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
  }, [tx, preset, customFrom, customTo]);

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
    a.href = url; a.download = `ledger-${currency}-${accountNumber}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Card className="card-luxe overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-4 p-5 text-start transition hover:bg-[oklch(0.82_0.14_85/0.05)]"
        aria-expanded={open}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <span className="font-serif text-2xl tracking-wide text-gold">{currency}</span>
            <span className="text-sm text-muted-foreground truncate">{accountName}</span>
          </div>
          <div className="mt-1 text-xs text-muted-foreground">#{accountNumber}</div>
        </div>
        <div className="text-end">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{t("portal.currentBalance")}</div>
          <div className="font-mono text-2xl font-semibold tracking-tight">{formatMinor(balance, currency)}</div>
        </div>
        <div className="ms-2 inline-flex h-8 w-8 items-center justify-center rounded-full border border-[oklch(0.82_0.14_85/0.25)] text-gold">
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </button>

      {open ? (
        <div className="border-t border-[oklch(0.82_0.14_85/0.15)]">
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

          {isLoading ? (
            <div className="p-6 text-center text-sm text-muted-foreground">{t("common.loading")}</div>
          ) : (
            <StatementLedger transactions={filtered as any} currency={currency} emptyText={t("portal.noTx")} />
          )}
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
          ? "border-[oklch(0.82_0.14_85/0.5)] bg-gradient-gold text-primary-foreground shadow-gold"
          : "border-[oklch(0.82_0.14_85/0.2)] bg-card text-muted-foreground hover:text-foreground",
      )}
    >
      {label}
    </button>
  );
}