import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Eye,
  EyeOff,
  ArrowUpRight,
  ArrowDownLeft,
  ArrowRightLeft,
  FileText,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  TrendingUp,
  TrendingDown,
  Clock,
  Sparkles,
  Bell,
  LogOut,
  Settings,
  User as UserIcon,
  Download,
  Calendar as CalendarIcon,
  X,
  ShieldCheck,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, hasAnyRole } from "@/lib/auth";
import { PremiumCard } from "@/components/ui/premium-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
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

function fmt(n: number, currency: string) {
  try {
    return `${Number(n).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${currency}`;
  } catch {
    return `${n} ${currency}`;
  }
}

function Portal() {
  const { session, loading, rolesLoading, signOut, user, roles } = useAuth();
  const nav = useNavigate();
  const t = useT();
  const [hideBalance, setHideBalance] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

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

  const { data: holder, isLoading } = useQuery({
    queryKey: ["portal.holder", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("account_holders")
        .select(
          "id,dahab_account_number,canonical_name,status,phone,email,holder_accounts(id,account_number,currency_code,account_nature,account_display_name,account_alias_name,current_balance,status)",
        )
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
      const { data, error } = await supabase.rpc("get_holder_currency_totals", {
        p_holder_id: holder!.id,
      });
      if (error) throw error;
      return (data ?? []) as Array<{
        currency: string;
        total_balance: number;
        account_count: number;
        total_debits: number;
        total_credits: number;
      }>;
    },
  });

  const accounts = (holder?.holder_accounts ?? []) as any[];

  // LYD-equivalent total approximation: sum totals if we have them, else sum LYD balances.
  const totalLyd = useMemo(() => {
    if (totals && totals.length) {
      return totals.reduce((s, t) => s + Number(t.total_balance ?? 0), 0);
    }
    return accounts.reduce((s, a) => s + Number(a.current_balance ?? 0), 0);
  }, [totals, accounts]);

  const masked = (v: string) => (hideBalance ? "•••••••" : v);
  const firstName = (holder?.canonical_name ?? user?.email ?? "")
    .toString()
    .split(" ")[0];

  if (loading || !session)
    return (
      <div className="p-10 text-center text-muted-foreground">{t("common.loading")}</div>
    );

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Top Bar */}
      <header className="sticky top-0 z-30 border-b border-border/60 bg-background/95 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-6 px-4 sm:px-6 lg:px-8">
          <Link to="/portal" className="flex shrink-0 items-center gap-3">
            <DahabCoin />
            <div className="hidden sm:block">
              <DahabMark size="sm" showArabic={false} />
            </div>
          </Link>

          <div className="flex-1" />

          <LanguageToggle />

          <button
            aria-label="Notifications"
            className="relative hidden h-10 w-10 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground transition-colors hover:border-[oklch(0.82_0.14_85/0.3)] hover:text-gold sm:flex"
          >
            <Bell className="h-4 w-4" />
            <span className="absolute right-1.5 top-1.5 h-1.5 w-1.5 animate-pulse rounded-full bg-gold" />
          </button>

          {/* Profile dropdown */}
          <div className="relative">
            <button
              onClick={() => setProfileOpen((v) => !v)}
              className="flex items-center gap-2 rounded-full border border-border bg-card py-1 pl-1 pr-2 transition-colors hover:border-[oklch(0.82_0.14_85/0.3)]"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full border border-[oklch(0.82_0.14_85/0.3)] bg-gradient-to-br from-[oklch(0.82_0.14_85/0.3)] via-[oklch(0.55_0.13_72/0.4)] to-card text-xs font-semibold text-gold-soft">
                {firstName.charAt(0).toUpperCase() || "D"}
              </div>
              <span className="hidden text-xs font-medium text-foreground sm:block">
                {firstName || "Customer"}
              </span>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            </button>
            <AnimatePresence>
              {profileOpen ? (
                <>
                  <div
                    className="fixed inset-0 z-30"
                    onClick={() => setProfileOpen(false)}
                  />
                  <motion.div
                    initial={{ opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -8 }}
                    className="absolute right-0 top-12 z-40 w-64 overflow-hidden rounded-xl border border-border bg-card shadow-2xl shadow-black/50"
                  >
                    <div className="border-b border-border p-4">
                      <div className="text-sm font-medium text-foreground">
                        {holder?.canonical_name ?? user?.email}
                      </div>
                      {holder?.dahab_account_number ? (
                        <div className="mt-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
                          DAHAB · {holder.dahab_account_number}
                        </div>
                      ) : null}
                    </div>
                    <button className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-muted">
                      <UserIcon className="h-4 w-4 text-gold" /> Profile
                    </button>
                    <button className="flex w-full items-center gap-3 px-4 py-2.5 text-sm text-foreground hover:bg-muted">
                      <Settings className="h-4 w-4 text-gold" /> Settings
                    </button>
                    <button
                      onClick={() => {
                        setProfileOpen(false);
                        signOut();
                      }}
                      className="flex w-full items-center gap-3 border-t border-border px-4 py-2.5 text-sm text-destructive hover:bg-destructive/10"
                    >
                      <LogOut className="h-4 w-4" /> {t("common.signOut")}
                    </button>
                  </motion.div>
                </>
              ) : null}
            </AnimatePresence>
          </div>
        </div>
        <div className="h-px bg-gradient-to-r from-transparent via-[oklch(0.82_0.14_85/0.3)] to-transparent" />
      </header>

      {/* Main */}
      <main className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">{t("common.loading")}</p>
        ) : !holder ? (
          <PremiumCard variant="premium" className="p-10 text-center">
            <Sparkles className="mx-auto mb-3 h-8 w-8 text-gold" />
            <h2 className="font-serif text-xl font-semibold">No Dahab account linked</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              No Dahab account is linked to your profile yet. Please contact a
              Dahab Family member to get set up.
            </p>
          </PremiumCard>
        ) : (
          <>
            {/* Greeting */}
            <div>
              <p className="mb-1 text-[10px] font-medium uppercase tracking-[0.25em] text-gold">
                {new Date().toLocaleDateString(undefined, {
                  weekday: "long",
                  month: "long",
                  day: "numeric",
                })}
              </p>
              <h1 className="font-serif text-3xl font-semibold text-foreground">
                Welcome back,{" "}
                <span className="text-gold-soft">{firstName}</span>
              </h1>
            </div>

            {/* Total balance hero */}
            <PremiumCard variant="premium" className="relative overflow-hidden p-8">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_oklch(0.82_0.14_85/0.15),_transparent_60%)]" />
              <svg
                className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.04]"
                xmlns="http://www.w3.org/2000/svg"
              >
                <defs>
                  <pattern id="cd-grid" width="40" height="40" patternUnits="userSpaceOnUse">
                    <path d="M 40 0 L 0 0 0 40" fill="none" stroke="currentColor" className="text-gold" strokeWidth="1" />
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#cd-grid)" />
              </svg>

              <div className="relative z-10 flex flex-col justify-between gap-6 md:flex-row md:items-end">
                <div>
                  <div className="mb-3 flex items-center gap-2">
                    <span className="relative flex h-2 w-2">
                      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gold opacity-75" />
                      <span className="relative inline-flex h-2 w-2 rounded-full bg-gold" />
                    </span>
                    <span className="text-[10px] font-medium uppercase tracking-[0.25em] text-gold">
                      Total Balance
                    </span>
                    <button
                      onClick={() => setHideBalance((v) => !v)}
                      className="ms-2 flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-gold"
                      aria-label="Toggle balance visibility"
                    >
                      {hideBalance ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                    </button>
                  </div>
                  <div className="mb-2 font-serif text-5xl font-semibold tabular-nums text-foreground md:text-6xl">
                    {masked(fmt(totalLyd, "LYD"))}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    LYD equivalent across {accounts.length} account{accounts.length === 1 ? "" : "s"}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2">
                  <Button variant="gold" className="gap-2">
                    <ArrowRightLeft className="h-4 w-4" /> Send Money
                  </Button>
                  <Button variant="outline" className="gap-2">
                    <ArrowDownLeft className="h-4 w-4" /> Request
                  </Button>
                </div>
              </div>

              {/* Currency strip */}
              {totals && totals.length > 0 ? (
                <div className="relative z-10 mt-8 flex flex-wrap gap-2">
                  {totals.map((row) => (
                    <div
                      key={row.currency}
                      className="flex items-center gap-2 rounded-lg border border-border/60 bg-card/60 px-3 py-2 backdrop-blur-sm"
                    >
                      <Badge variant="outline" className="border-[oklch(0.82_0.14_85/0.3)] text-[9px] tracking-wider text-gold">
                        {row.currency}
                      </Badge>
                      <span className="text-sm font-medium tabular-nums text-foreground">
                        {masked(fmt(Number(row.total_balance ?? 0), row.currency))}
                      </span>
                    </div>
                  ))}
                </div>
              ) : null}
            </PremiumCard>

            {/* Quick actions */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              {[
                { icon: ArrowUpRight, label: "Send", desc: "Transfer funds" },
                { icon: ArrowDownLeft, label: "Receive", desc: "Request money" },
                { icon: FileText, label: "Statements", desc: "Export PDF" },
                { icon: ShieldCheck, label: "Security", desc: "Manage 2FA" },
              ].map((a) => (
                <button
                  key={a.label}
                  className="group rounded-2xl border border-border bg-card p-4 text-left transition-all hover:border-[oklch(0.82_0.14_85/0.3)] hover:bg-muted/40"
                >
                  <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl border border-[oklch(0.82_0.14_85/0.2)] bg-[oklch(0.82_0.14_85/0.1)] transition-colors group-hover:bg-[oklch(0.82_0.14_85/0.2)]">
                    <a.icon className="h-4 w-4 text-gold" />
                  </div>
                  <div className="text-sm font-medium text-foreground transition-colors group-hover:text-gold">
                    {a.label}
                  </div>
                  <div className="mt-0.5 text-[10px] text-muted-foreground">{a.desc}</div>
                </button>
              ))}
            </div>

            {/* Accounts */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-serif text-xl font-semibold text-foreground">
                  Your Accounts
                </h2>
                <span className="text-xs text-muted-foreground">
                  {accounts.length} account{accounts.length === 1 ? "" : "s"}
                </span>
              </div>
              <div className="space-y-3">
                {accounts.map((a) => (
                  <PortalAccountCard key={a.id} account={a} hideBalance={hideBalance} />
                ))}
                {accounts.length === 0 ? (
                  <PremiumCard className="p-6 text-center text-sm text-muted-foreground">
                    No linked accounts yet.
                  </PremiumCard>
                ) : null}
              </div>
            </div>
          </>
        )}
      </main>

      <footer className="mx-auto max-w-7xl px-4 py-8 text-center text-xs text-muted-foreground sm:px-6 lg:px-8">
        <p>© 2026 Dahab Bank · Member of the Libyan Banking Association</p>
      </footer>
    </div>
  );
}

type DatePreset = "all" | "today" | "week" | "month" | "custom";

function presetRange(p: DatePreset): { from: Date | null; to: Date | null } {
  const now = new Date();
  if (p === "today") {
    const f = new Date(now);
    f.setHours(0, 0, 0, 0);
    return { from: f, to: now };
  }
  if (p === "week") {
    const f = new Date(now);
    f.setDate(now.getDate() - 7);
    return { from: f, to: now };
  }
  if (p === "month") {
    const f = new Date(now);
    f.setMonth(now.getMonth() - 1);
    return { from: f, to: now };
  }
  return { from: null, to: null };
}

function PortalAccountCard({
  account,
  hideBalance,
}: {
  account: any;
  hideBalance: boolean;
}) {
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
        .select(
          "id,tx_number,posted_at,description,debit_amount,credit_amount,balance_after,currency_code",
        )
        .eq("account_id", account.id)
        .order("posted_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  const filtered = useMemo(() => {
    let list = rows ?? [];
    let from: Date | null = null;
    let to: Date | null = null;
    if (preset === "custom") {
      from = customFrom ?? null;
      to = customTo ?? null;
      if (to) {
        const x = new Date(to);
        x.setHours(23, 59, 59, 999);
        to = x;
      }
    } else if (preset !== "all") {
      const r = presetRange(preset);
      from = r.from;
      to = r.to;
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

  // 30d net for the trend chip
  const net30 = useMemo(() => {
    const cutoff = Date.now() - 30 * 86400000;
    return (rows ?? []).reduce((s: number, r: any) => {
      if (new Date(r.posted_at).getTime() < cutoff) return s;
      return s + Number(r.credit_amount ?? 0) - Number(r.debit_amount ?? 0);
    }, 0);
  }, [rows]);

  function exportCsv() {
    const csv = [
      ["Date", "TX #", "Description", "Debit", "Credit", "Balance"],
      ...filtered.map((e: any) => [
        new Date(e.posted_at).toISOString(),
        e.tx_number,
        e.description ?? "",
        e.debit_amount,
        e.credit_amount,
        e.balance_after,
      ]),
    ]
      .map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ledger-${account.account_number}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const masked = (v: string) => (hideBalance ? "•••••••" : v);

  return (
    <PremiumCard className="overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="group flex w-full items-center gap-4 p-5 text-start transition hover:bg-[oklch(0.82_0.14_85/0.04)]"
        aria-expanded={open}
      >
        <div className="flex shrink-0 items-center gap-3">
          <Badge className="border border-[oklch(0.82_0.14_85/0.3)] bg-[oklch(0.82_0.14_85/0.1)] text-gold">
            {account.currency_code}
          </Badge>
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate font-serif text-base font-medium text-foreground transition-colors group-hover:text-gold" dir="auto">
            {account.account_display_name}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[11px] text-gold/90">
              {account.account_number}
            </span>
            <Badge variant="outline" className="text-[10px]">{account.account_nature}</Badge>
            {account.account_alias_name ? <span>· {account.account_alias_name}</span> : null}
          </div>
        </div>
        <div className="text-end">
          <div className="font-mono text-xl font-semibold tabular-nums text-foreground">
            {masked(fmt(Number(account.current_balance ?? 0), account.currency_code))}
          </div>
          <div className="mt-1 flex items-center justify-end gap-1 text-[10px]">
            {net30 >= 0 ? (
              <span className="flex items-center gap-1 text-emerald-500">
                <TrendingUp className="h-3 w-3" /> +{Math.abs(net30).toLocaleString()} 30d
              </span>
            ) : (
              <span className="flex items-center gap-1 text-destructive">
                <TrendingDown className="h-3 w-3" /> -{Math.abs(net30).toLocaleString()} 30d
              </span>
            )}
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
                  <CalendarIcon className="me-1.5 h-3.5 w-3.5" />
                  {preset === "custom" && (customFrom || customTo)
                    ? `${customFrom ? customFrom.toLocaleDateString() : "…"} – ${customTo ? customTo.toLocaleDateString() : "…"}`
                    : "Custom"}
                  {preset === "custom" ? (
                    <X
                      className="ms-1.5 h-3.5 w-3.5 opacity-70"
                      onClick={(e) => {
                        e.stopPropagation();
                        setPreset("all");
                        setCustomFrom(undefined);
                        setCustomTo(undefined);
                      }}
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
                      onChange={(e) => {
                        setCustomFrom(e.target.value ? new Date(e.target.value) : undefined);
                        setPreset("custom");
                      }}
                    />
                  </div>
                  <div>
                    <Label className="text-xs text-muted-foreground">To</Label>
                    <Input
                      type="date"
                      value={customTo ? customTo.toISOString().slice(0, 10) : ""}
                      onChange={(e) => {
                        setCustomTo(e.target.value ? new Date(e.target.value) : undefined);
                        setPreset("custom");
                      }}
                    />
                  </div>
                </div>
              </PopoverContent>
            </Popover>
            <div className="ms-auto">
              <Button variant="outline" size="sm" onClick={exportCsv} disabled={filtered.length === 0}>
                <Download className="me-1.5 h-3.5 w-3.5" /> CSV
              </Button>
            </div>
          </div>

          {isLoading ? (
            <div className="p-6 text-center text-sm text-muted-foreground">Loading…</div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center gap-2 p-8 text-sm text-muted-foreground">
              <Clock className="h-5 w-5 text-gold/70" />
              No entries for the selected range.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-start text-xs uppercase text-muted-foreground">
                    <th className="p-2 text-start">Date</th>
                    <th className="p-2 text-start">TX #</th>
                    <th className="p-2 text-start">Description</th>
                    <th className="p-2 text-end">Debit</th>
                    <th className="p-2 text-end">Credit</th>
                    <th className="p-2 text-end">Balance ({account.currency_code})</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((e: any) => (
                    <tr key={e.id} className="border-t border-[oklch(0.82_0.14_85/0.08)]">
                      <td className="p-2 text-xs">{new Date(e.posted_at).toLocaleString()}</td>
                      <td className="p-2 font-mono text-xs">{e.tx_number}</td>
                      <td className="p-2">{e.description}</td>
                      <td className="p-2 text-end tabular-nums">{Number(e.debit_amount).toLocaleString()}</td>
                      <td className="p-2 text-end tabular-nums text-emerald-500">{Number(e.credit_amount).toLocaleString()}</td>
                      <td className="p-2 text-end font-medium tabular-nums">{Number(e.balance_after).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : null}
    </PremiumCard>
  );
}

function DateChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
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