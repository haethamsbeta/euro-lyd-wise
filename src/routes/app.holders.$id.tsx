import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft, ChevronRight, Wallet, TrendingUp, TrendingDown, Layers,
  Phone, Mail, Calendar, Copy,
} from "lucide-react";
import { AddLinkedAccountDialog } from "@/components/app/add-linked-account-dialog";
import { useAuth, hasAnyRole } from "@/lib/auth";
import { CurrencyBadge } from "@/components/ui/currency-badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const CURRENCY_TINT: Record<string, { ring: string; text: string; gradient: string }> = {
  LYD: { ring: "border-[oklch(0.82_0.14_85/0.4)]", text: "text-gold", gradient: "from-[oklch(0.82_0.14_85/0.18)] via-transparent to-transparent" },
  USD: { ring: "border-[oklch(0.7_0.18_150/0.35)]", text: "text-[var(--success)]", gradient: "from-[oklch(0.7_0.18_150/0.16)] via-transparent to-transparent" },
  EUR: { ring: "border-[#7AA8E8]/35", text: "text-[#7AA8E8]", gradient: "from-[#7AA8E8]/18 via-transparent to-transparent" },
  GBP: { ring: "border-[#C394E0]/35", text: "text-[#C394E0]", gradient: "from-[#C394E0]/18 via-transparent to-transparent" },
};
function tint(c?: string) { return CURRENCY_TINT[(c ?? "").toUpperCase()] ?? CURRENCY_TINT.LYD; }
function fmt(n: number) { return Number(n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 }); }

export const Route = createFileRoute("/app/holders/$id")({ component: HolderDetail });

function HolderDetail() {
  const { id } = Route.useParams();
  const holderId = Number(id);
  const nav = useNavigate();
  const { roles } = useAuth();
  const isAdmin = hasAnyRole(roles, ["admin"]);

  const { data: holder, isLoading } = useQuery({
    queryKey: ["holder", holderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("account_holders")
        .select("id,dahab_account_number,canonical_name,status,holder_type,phone,email,created_at,holder_accounts(id,account_number,dahab_account_number,currency_code,account_nature,account_display_name,account_alias_name,current_balance,status,credit_limit,debit_limit,withdraw_limit_enabled,withdraw_limit_amount)")
        .eq("id", holderId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: totals } = useQuery({
    queryKey: ["holder-totals", holderId],
    enabled: !!holderId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_holder_currency_totals", { p_holder_id: holderId });
      if (error) throw error;
      return (data ?? []) as Array<{ currency: string; total_balance: number; account_count: number; total_debits: number; total_credits: number }>;
    },
  });

  // Deep-link redirect: #account-N → /app/accounts/N
  useEffect(() => {
    if (typeof window === "undefined") return;
    const m = window.location.hash.match(/^#account-(\d+)$/);
    if (!m) return;
    const targetId = Number(m[1]);
    if (!Number.isFinite(targetId)) return;
    nav({ to: "/app/accounts/$id", params: { id: String(targetId) } });
  }, [nav]);

  return (
    <div>
      <PageHeader
        title={holder?.canonical_name ?? "Holder"}
        description={holder?.dahab_account_number}
        actions={
          <>
            {isAdmin && holder ? <AddLinkedAccountDialog holderId={holder.id} /> : null}
            <Button asChild variant="outline" size="sm">
              <Link to="/app/holders"><ArrowLeft className="h-4 w-4 me-1" /> Back</Link>
            </Button>
          </>
        }
      />
      <div className="space-y-4 p-4 sm:p-6">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : !holder ? (
          <p className="text-sm text-muted-foreground">Holder not found.</p>
        ) : (
          <>
            <HolderHero holder={holder} accountsCount={(holder.holder_accounts ?? []).length} />

            <KpiStrip totals={totals ?? []} accountsCount={(holder.holder_accounts ?? []).length} />

            {totals && totals.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
                {totals.map((t) => {
                  const tt = tint(t.currency);
                  return (
                    <Card key={t.currency} className={cn("card-luxe overflow-hidden border", tt.ring)}>
                      <div className={cn("bg-gradient-to-br p-4", tt.gradient)}>
                        <div className="flex items-center justify-between">
                          <CurrencyBadge currency={t.currency} />
                          <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{t.account_count} acct</span>
                        </div>
                        <div className={cn("mt-3 font-serif text-2xl tabular-nums", tt.text)}>
                          {fmt(Number(t.total_balance ?? 0))} <span className="text-xs uppercase tracking-wider opacity-70">{t.currency}</span>
                        </div>
                        <div className="mt-2 grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
                          <span className="flex items-center gap-1"><TrendingUp className="h-3 w-3 text-[var(--success)]" /> C {fmt(Number(t.total_credits ?? 0))}</span>
                          <span className="flex items-center gap-1"><TrendingDown className="h-3 w-3 text-destructive" /> D {fmt(Number(t.total_debits ?? 0))}</span>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            ) : null}

            <div className="flex items-center justify-between pt-2">
              <h2 className="font-serif text-lg">Linked accounts</h2>
              <span className="text-xs text-muted-foreground">{(holder.holder_accounts ?? []).length} total</span>
            </div>

            <div className="grid gap-3 md:grid-cols-2">
              {(holder.holder_accounts ?? []).map((a: any) => {
                const tt = tint(a.currency_code);
                return (
                  <Card key={a.id} id={`account-${a.id}`} className={cn("card-luxe overflow-hidden border transition hover:translate-y-[-1px] hover:shadow-lg", tt.ring)}>
                    <Link
                      to="/app/accounts/$id"
                      params={{ id: String(a.id) }}
                      className="block w-full text-left"
                    >
                      <div className={cn("bg-gradient-to-br p-4", tt.gradient)}>
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <CurrencyBadge currency={a.currency_code} />
                            <span className="font-mono text-sm">{a.account_number}</span>
                            {a.dahab_account_number && (
                              <Badge variant="outline" className="font-mono text-[10px] text-gold">{a.dahab_account_number}</Badge>
                            )}
                          </div>
                          <Badge variant={a.status === "ACTIVE" ? "secondary" : "outline"} className="text-[10px]">{a.status}</Badge>
                        </div>

                        <div className="mt-3 flex items-end justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-base text-foreground/85" dir="rtl">{a.account_display_name}</div>
                            {a.account_alias_name ? (
                              <div className="mt-0.5 truncate text-xs text-muted-foreground">{a.account_alias_name}</div>
                            ) : null}
                            <div className="mt-1">
                              <Badge variant="outline" className="text-[10px]">{a.account_nature}</Badge>
                            </div>
                          </div>
                          <div className="text-end">
                            <div className={cn("font-serif text-2xl tabular-nums", tt.text)}>
                              {fmt(Number(a.current_balance ?? 0))}
                            </div>
                            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{a.currency_code}</div>
                          </div>
                        </div>

                        <div className="mt-3 flex items-center justify-between border-t border-white/5 pt-2 text-[11px] text-muted-foreground">
                          <span>Credit <span className="font-mono text-foreground/70">{fmt(Number(a.credit_limit ?? 0))}</span></span>
                          <span>Debit <span className="font-mono text-foreground/70">{fmt(Number(a.debit_limit ?? 0))}</span></span>
                          <span className="flex items-center gap-1 text-gold">Open <ChevronRight className="h-3 w-3" /></span>
                        </div>
                      </div>
                    </Link>
                  </Card>
                );
              })}
              {(holder.holder_accounts ?? []).length === 0 ? (
                <Card className="card-luxe md:col-span-2">
                  <CardContent className="p-8 text-center text-sm text-muted-foreground">
                    No linked accounts yet.{isAdmin ? " Use \u201cAdd Linked Account\u201d above to create one." : ""}
                  </CardContent>
                </Card>
              ) : null}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function HolderHero({ holder, accountsCount }: { holder: any; accountsCount: number }) {
  function copy(value?: string | null) {
    if (!value) return;
    navigator.clipboard?.writeText(value).then(() => toast.success("Copied", { duration: 1500 })).catch(() => {});
  }
  return (
    <Card className="card-luxe overflow-hidden border border-[oklch(0.82_0.14_85/0.4)]">
      <div className="bg-gradient-to-br from-[oklch(0.82_0.14_85/0.18)] via-transparent to-transparent p-5">
        <div className="flex flex-wrap items-start gap-3">
          <button
            onClick={() => copy(holder.dahab_account_number)}
            className="group inline-flex items-center gap-1 rounded-md border border-gold/30 bg-card/60 px-2 py-1 font-mono text-sm text-gold hover:border-gold/60"
            title="Copy DAHAB number"
          >
            {holder.dahab_account_number}
            <Copy className="h-3 w-3 opacity-0 transition group-hover:opacity-100" />
          </button>
          <Badge variant="secondary">{holder.status}</Badge>
          <Badge variant="outline">{holder.holder_type}</Badge>
          <span className="ms-auto text-[11px] text-muted-foreground">
            {accountsCount} linked account(s)
          </span>
        </div>

        <div className="mt-4 flex flex-wrap items-end justify-between gap-4">
          <div className="min-w-0">
            <div className="font-serif text-2xl md:text-3xl" dir="auto">{holder.canonical_name}</div>
            <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {holder.phone ? (
                <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" /> {holder.phone}</span>
              ) : null}
              {holder.email ? (
                <span className="inline-flex items-center gap-1"><Mail className="h-3 w-3" /> {holder.email}</span>
              ) : null}
              {holder.created_at ? (
                <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" /> Created {new Date(holder.created_at).toLocaleDateString()}</span>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

function KpiStrip({ totals, accountsCount }: { totals: Array<{ currency: string; total_balance: number; account_count: number; total_debits: number; total_credits: number }>; accountsCount: number }) {
  const agg = useMemo(() => {
    let credits = 0, debits = 0;
    for (const t of totals) { credits += Number(t.total_credits ?? 0); debits += Number(t.total_debits ?? 0); }
    return { credits, debits, currencies: totals.length };
  }, [totals]);
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <KpiTile icon={<Layers className="h-4 w-4" />} label="Linked accounts" value={String(accountsCount)} tone="default" />
      <KpiTile icon={<Wallet className="h-4 w-4" />} label="Currencies" value={String(agg.currencies)} tone="default" hint={totals.map(t => t.currency).join(" · ") || "—"} />
      <KpiTile icon={<TrendingUp className="h-4 w-4" />} label="Total credits" value={fmt(agg.credits)} tone="success" />
      <KpiTile icon={<TrendingDown className="h-4 w-4" />} label="Total debits" value={fmt(agg.debits)} tone="danger" />
    </div>
  );
}

function KpiTile({ icon, label, value, hint, tone }: { icon: React.ReactNode; label: string; value: string; hint?: string; tone: "default" | "success" | "danger" }) {
  const toneCls = tone === "success" ? "text-[var(--success)]" : tone === "danger" ? "text-destructive" : "text-foreground";
  return (
    <Card className="card-luxe">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
          <span className={toneCls}>{icon}</span>{label}
        </div>
        <div className={cn("mt-1 font-serif text-xl tabular-nums", toneCls)}>{value}</div>
        {hint ? <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{hint}</div> : null}
      </CardContent>
    </Card>
  );
}
