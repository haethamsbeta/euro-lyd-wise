import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, hasAnyRole } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronDown, ChevronUp, LogOut, Download, Calendar as CalendarIcon, X } from "lucide-react";
import { DahabMark, DahabCoin } from "@/components/brand/dahab-mark";
import { LanguageToggle } from "@/components/ui/language-toggle";
import { useT } from "@/lib/i18n";
import { cn } from "@/lib/utils";
import { SessionTimeoutProvider } from "@/lib/session-timeout";
import { IdleWarningDialog } from "@/components/app/idle-warning-dialog";

export const Route = createFileRoute("/portal")({
  component: PortalRoute,
  head: () => ({ meta: [{ title: "Customer portal — Dahab" }] }),
});

function PortalRoute() {
  return (
    <SessionTimeoutProvider>
      <Portal />
      <IdleWarningDialog />
    </SessionTimeoutProvider>
  );
}

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
    if (!rolesLoading && hasAnyRole(roles, ["admin", "teller", "auditor"])) {
      nav({ to: "/app" });
    }
  }, [session, loading, rolesLoading, roles, nav]);

  // Resolve the holder linked to this customer
  const { data: holder, isLoading } = useQuery({
    queryKey: ["portal.holder", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("account_holders")
        .select("id,dahab_account_number,canonical_name,status,phone,email,holder_accounts(id,account_number,currency_code,account_nature,account_display_name,account_alias_name,current_balance,status)")
        .eq("owner_user_id", user!.id)
        .eq("status", "ACTIVE")
        .maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  const { data: totals } = useQuery({
    queryKey: ["portal.totals", holder?.id],
    enabled: !!holder?.id,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_holder_currency_totals", { p_holder_id: holder!.id });
      if (error) throw error;
      return (data ?? []) as Array<{ currency: string; total_balance: number; account_count: number; total_debits: number; total_credits: number }>;
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
        {isLoading ? (
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : !holder ? (
          <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
            No DAHAB account is linked to your profile yet. Please contact a Dahab Family member.
          </CardContent></Card>
        ) : (
          <>
            {/* Profile card */}
            <Card className="card-luxe">
              <CardContent className="flex flex-wrap items-center gap-4 p-5">
                <div className="min-w-0">
                  <div className="text-[10px] uppercase tracking-[0.32em] text-gold/80">DAHAB account</div>
                  <div className="font-mono text-lg text-gold">{holder.dahab_account_number}</div>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-serif text-2xl" dir="auto">{holder.canonical_name}</div>
                  <div className="mt-1 flex flex-wrap gap-2 text-xs text-muted-foreground">
                    <Badge variant="secondary">{holder.status}</Badge>
                    {holder.phone ? <span>· {holder.phone}</span> : null}
                    {holder.email ? <span>· {holder.email}</span> : null}
                  </div>
                </div>
              </CardContent>
              {totals && totals.length > 0 ? (
                <div className="grid gap-3 border-t border-[oklch(0.82_0.14_85/0.15)] p-5 sm:grid-cols-2 md:grid-cols-3">
                  {totals.map((t) => (
                    <div key={t.currency} className="rounded-md border border-[oklch(0.82_0.14_85/0.18)] bg-card/40 p-3">
                      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Total {t.currency}</div>
                      <div className="font-mono text-xl font-semibold">{Number(t.total_balance ?? 0).toLocaleString()} {t.currency}</div>
                      <div className="mt-0.5 text-[11px] text-muted-foreground">{t.account_count} account(s)</div>
                    </div>
                  ))}
                </div>
              ) : null}
            </Card>

            {/* Linked accounts */}
            <div>
              <h2 className="font-serif text-lg gold-text">Linked accounts</h2>
              <p className="text-xs text-muted-foreground">Click any account to view its full statement.</p>
            </div>
            <div className="space-y-3">
              {(holder.holder_accounts ?? []).map((a: any) => (
                <PortalAccountCard key={a.id} account={a} />
              ))}
              {(holder.holder_accounts ?? []).length === 0 ? (
                <Card><CardContent className="p-6 text-center text-sm text-muted-foreground">No linked accounts yet.</CardContent></Card>
              ) : null}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

type DatePreset = "all" | "today" | "week" | "month" | "custom";

function presetRange(p: DatePreset): { from: Date | null; to: Date | null } {
  const now = new Date();
  if (p === "today") { const f = new Date(now); f.setHours(0,0,0,0); return { from: f, to: now }; }
  if (p === "week") { const f = new Date(now); f.setDate(now.getDate() - 7); return { from: f, to: now }; }
  if (p === "month") { const f = new Date(now); f.setMonth(now.getMonth() - 1); return { from: f, to: now }; }
  return { from: null, to: null };
}

function PortalAccountCard({ account }: { account: any }) {
  const [open, setOpen] = useState(false);
  const [preset, setPreset] = useState<DatePreset>("all");
  const [customFrom, setCustomFrom] = useState<Date | undefined>();
  const [customTo, setCustomTo] = useState<Date | undefined>();

  const { data: rows, isLoading } = useQuery({
    queryKey: ["portal.ledger", account.id],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("holder_ledger_entries")
        .select("id,tx_number,posted_at,description,debit_amount,credit_amount,balance_after,currency_code")
        .eq("account_id", account.id)
        .order("posted_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = useMemo(() => {
    let list = rows ?? [];
    let from: Date | null = null; let to: Date | null = null;
    if (preset === "custom") {
      from = customFrom ?? null; to = customTo ?? null;
      if (to) { const x = new Date(to); x.setHours(23,59,59,999); to = x; }
    } else if (preset !== "all") {
      const r = presetRange(preset); from = r.from; to = r.to;
    }
    if (from || to) {
      list = list.filter((r: any) => {
        const d = new Date(r.posted_at).getTime();
        if (from && d < from.getTime()) return false;
        if (to && d > to.getTime()) return false;
        return true;
      });
    }
    return list;
  }, [rows, preset, customFrom, customTo]);

  function exportCsv() {
    const csv = [
      ["Date","TX #","Description","Debit","Credit","Balance"],
      ...filtered.map((e: any) => [new Date(e.posted_at).toISOString(), e.tx_number, e.description ?? "", e.debit_amount, e.credit_amount, e.balance_after]),
    ].map(r => r.map(c => `"${String(c ?? "").replace(/"/g,'""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `ledger-${account.account_number}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Card className="card-luxe overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="flex w-full items-center gap-4 p-5 text-start transition hover:bg-[oklch(0.82_0.14_85/0.05)]"
        aria-expanded={open}
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <Badge>{account.currency_code}</Badge>
            <span className="font-mono text-sm">{account.account_number}</span>
            <Badge variant="outline" className="text-xs">{account.account_nature}</Badge>
          </div>
          <div className="mt-1.5 truncate font-serif text-base" dir="auto">{account.account_display_name}</div>
          {account.account_alias_name ? <div className="text-xs text-muted-foreground">{account.account_alias_name}</div> : null}
        </div>
        <div className="text-end">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Current balance</div>
          <div className="font-mono text-2xl font-semibold tracking-tight">
            {Number(account.current_balance ?? 0).toLocaleString()} {account.currency_code}
          </div>
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
                    <X className="ml-1.5 h-3.5 w-3.5 opacity-70"
                      onClick={(e) => { e.stopPropagation(); setPreset("all"); setCustomFrom(undefined); setCustomTo(undefined); }} />
                  ) : null}
                </Button>
              </PopoverTrigger>
              <PopoverContent align="start" className="w-64 p-3">
                <div className="space-y-3">
                  <div>
                    <Label className="text-xs text-muted-foreground">From</Label>
                    <Input type="date"
                      value={customFrom ? customFrom.toISOString().slice(0,10) : ""}
                      onChange={(e) => { setCustomFrom(e.target.value ? new Date(e.target.value) : undefined); setPreset("custom"); }} />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">To</Label>
                    <Input type="date"
                      value={customTo ? customTo.toISOString().slice(0,10) : ""}
                      onChange={(e) => { setCustomTo(e.target.value ? new Date(e.target.value) : undefined); setPreset("custom"); }} />
                  </div>
                </div>
              </PopoverContent>
            </Popover>
            <div className="ms-auto">
              <Button variant="outline" size="sm" onClick={exportCsv} disabled={filtered.length === 0}>
                <Download className="h-3.5 w-3.5" /> CSV
              </Button>
            </div>
          </div>

          {isLoading ? (
            <div className="p-6 text-center text-sm text-muted-foreground">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted-foreground">No entries for the selected range.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase text-muted-foreground">
                    <th className="p-2">Date</th>
                    <th className="p-2">TX #</th>
                    <th className="p-2">Description</th>
                    <th className="p-2 text-right">Debit</th>
                    <th className="p-2 text-right">Credit</th>
                    <th className="p-2 text-right">Balance ({account.currency_code})</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((e: any) => (
                    <tr key={e.id} className="border-t border-[oklch(0.82_0.14_85/0.08)]">
                      <td className="p-2 text-xs">{new Date(e.posted_at).toLocaleString()}</td>
                      <td className="p-2 font-mono text-xs">{e.tx_number}</td>
                      <td className="p-2">{e.description}</td>
                      <td className="p-2 text-right">{Number(e.debit_amount).toLocaleString()}</td>
                      <td className="p-2 text-right">{Number(e.credit_amount).toLocaleString()}</td>
                      <td className="p-2 text-right font-medium">{Number(e.balance_after).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}
    </Card>
  );
}

function DateChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className={cn(
        "rounded-md border px-2.5 py-1 text-xs transition",
        active
          ? "border-[oklch(0.82_0.14_85/0.5)] bg-gradient-gold text-primary-foreground shadow-gold"
          : "border-[oklch(0.82_0.14_85/0.2)] bg-card text-muted-foreground hover:text-foreground",
      )}
    >{label}</button>
  );
}
