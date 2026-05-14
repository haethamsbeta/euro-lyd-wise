import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  ArrowLeft, ArrowRight, Plus, Edit, Shield, Building, User as UserIcon,
  Mail, Phone, MapPin, AlertTriangle, Search, StickyNote, CheckCircle2,
  Clock, Eye, Copy,
} from "lucide-react";
import { AddLinkedAccountDialog } from "@/components/app/add-linked-account-dialog";
import { useAuth, hasAnyRole } from "@/lib/auth";
import { useEffectiveRoles } from "@/lib/role-view";
import { CurrencyBadge } from "@/components/ui/currency-badge";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { DATA_BACKEND } from "@/lib/runtimeConfig";
import { displayTxNumber, sourceEntryCode } from "@/lib/txDisplay";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (v: unknown): v is string => typeof v === "string" && UUID_RE.test(v);

const CURRENCY_TINT: Record<string, { ring: string; text: string; gradient: string }> = {
  LYD: { ring: "border-[oklch(0.82_0.14_85/0.4)]", text: "text-gold", gradient: "from-[oklch(0.82_0.14_85/0.18)] via-transparent to-transparent" },
  USD: { ring: "border-[oklch(0.7_0.18_150/0.35)]", text: "text-[var(--success)]", gradient: "from-[oklch(0.7_0.18_150/0.16)] via-transparent to-transparent" },
  EUR: { ring: "border-[#7AA8E8]/35", text: "text-[#7AA8E8]", gradient: "from-[#7AA8E8]/18 via-transparent to-transparent" },
  GBP: { ring: "border-[#C394E0]/35", text: "text-[#C394E0]", gradient: "from-[#C394E0]/18 via-transparent to-transparent" },
};
function tint(c?: string) { return CURRENCY_TINT[(c ?? "").toUpperCase()] ?? CURRENCY_TINT.LYD; }
function fmt(n: number) { return Number(n ?? 0).toLocaleString(undefined, { maximumFractionDigits: 2 }); }

export const Route = createFileRoute("/app/holders/$id")({ head: () => ({ meta: [{ title: "Holder profile — Dahab" }, { name: "description", content: "View an account holder's accounts, activity, and KYC details." }] }), component: HolderDetail });

type Tab = "Overview" | "Linked Accounts" | "Transactions" | "Activity" | "Notes";
const TABS: Tab[] = ["Overview", "Linked Accounts", "Transactions", "Activity", "Notes"];

function HolderDetail() {
  const { id } = Route.useParams();
  const holderId = Number(id);
  const nav = useNavigate();
  const roles = useEffectiveRoles();
  const isAdmin = hasAnyRole(roles, ["admin"]);
  const isReadOnly = hasAnyRole(roles, ["auditor"]) && !isAdmin;
  const isTeller = hasAnyRole(roles, ["teller"]) && !isAdmin && !isReadOnly;

  const [activeTab, setActiveTab] = useState<Tab>("Overview");
  const [highlightedAccountId, setHighlightedAccountId] = useState<number | null>(null);

  const { data: holder, isLoading } = useQuery({
    queryKey: ["holder", holderId],
    queryFn: async () => {
      if (DATA_BACKEND === "lambda") {
        const r: any = await api.holders.get(id);
        const accts = (r.holder_accounts ?? r.accounts ?? []).map((a: any) => ({
          id: a.id,
          account_number: a.account_number,
          dahab_account_number: a.dahab_account_number ?? null,
          currency_code: a.currency_code ?? a.currency,
          account_nature: a.account_nature ?? null,
          account_display_name: a.account_display_name ?? a.alias_name ?? "",
          account_alias_name: a.account_alias_name ?? null,
          current_balance: Number(a.current_balance ?? 0),
          status: a.status ?? "ACTIVE",
          credit_limit: Number(a.credit_limit ?? 0),
          debit_limit: Number(a.debit_limit ?? 0),
          withdraw_limit_enabled: !!a.withdraw_limit_enabled,
          withdraw_limit_amount: Number(a.withdraw_limit_amount ?? 0),
        }));
        return {
          id: r.id,
          dahab_account_number: r.dahab_account_number,
          canonical_name: r.holder_name ?? r.canonical_name,
          status: r.status ?? "active",
          holder_type: r.holder_type ?? null,
          phone: r.phone ?? null,
          email: r.email ?? null,
          created_at: r.created_at ?? null,
          holder_accounts: accts,
          linked_account_count:
            typeof r.linked_account_count === "number" ? r.linked_account_count : null,
        } as any;
      }
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
    enabled: !!id,
    queryFn: async () => {
      if (DATA_BACKEND === "lambda") {
        const t: any = await api.holders.totals(id).catch(() => []);
        const rows = Array.isArray(t) ? t : [];
        return rows.map((row: any) => ({
          currency: row.currency ?? row.currency_code,
          total_balance: row.total_minor != null ? Number(row.total_minor) / 100 : Number(row.total_balance ?? 0),
          account_count: Number(row.account_count ?? 0),
          total_debits: Number(row.total_debits ?? 0),
          total_credits: Number(row.total_credits ?? 0),
        }));
      }
      const { data, error } = await supabase.rpc("get_holder_currency_totals", { p_holder_id: holderId });
      if (error) throw error;
      return (data ?? []) as Array<{ currency: string; total_balance: number; account_count: number; total_debits: number; total_credits: number }>;
    },
  });

  // Deep-link: #account-N → switch to Linked Accounts tab and highlight
  useEffect(() => {
    if (typeof window === "undefined") return;
    const m = window.location.hash.match(/^#account-(\d+)$/);
    if (!m) return;
    const targetId = Number(m[1]);
    if (!Number.isFinite(targetId)) return;
    setHighlightedAccountId(targetId);
    setActiveTab("Linked Accounts");
    const t = window.setTimeout(() => {
      const el = document.getElementById(`account-${targetId}`);
      if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 200);
    return () => window.clearTimeout(t);
  }, [nav]);

  const accountIds = useMemo(
    () => (holder?.holder_accounts ?? []).map((a: any) => a.id),
    [holder],
  );

  const holderUuid = isUuid(holder?.id) ? (holder!.id as string) : null;

  useEffect(() => {
    if (holderUuid && import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.log("[holder-accounts]", `/holders/${holderUuid}/accounts`);
    }
  }, [holderUuid]);

  const linkedAccountsQuery = useQuery({
    queryKey: ["holder-accounts.byHolder", holderUuid],
    enabled: !!holderUuid && activeTab === "Linked Accounts",
    queryFn: () => api.holders.accounts(holderUuid!),
  });

  const [ledgerOffset, setLedgerOffset] = useState(0);
  const [ledgerAcc, setLedgerAcc] = useState<any[]>([]);
  // Reset accumulator when holder changes
  useEffect(() => {
    setLedgerAcc([]);
    setLedgerOffset(0);
  }, [holderId]);

  const LEDGER_PAGE = 50;
  const { data: ledgerPage, isFetching: ledgerLoading } = useQuery({
    queryKey: ["holder-ledger", holderId, ledgerOffset],
    enabled: !!holderId && (DATA_BACKEND === "lambda" || accountIds.length > 0),
    queryFn: async () => {
      if (DATA_BACKEND === "lambda") {
        const r = await api.holders.transactions(id, { limit: LEDGER_PAGE, offset: ledgerOffset });
        const items = (r.items ?? []).map((e: any) => ({
          id: e.id,
          account_id: e.account_id ?? e.holder_account_id ?? null,
          currency_code: e.currency_code ?? e.currency,
          credit_amount: e.credit_amount != null ? Number(e.credit_amount) : Number(e.credit_minor ?? 0) / 100,
          debit_amount: e.debit_amount != null ? Number(e.debit_amount) : Number(e.debit_minor ?? 0) / 100,
          description: e.description ?? "",
          posted_at: e.posted_at ?? e.created_at,
          tx_number: e.tx_number,
          source_entry_code: sourceEntryCode(e),
          source_cash_entry_code: sourceCashEntryCode(e),
          display_tx_number: displayTxNumber(e),
          balance_after: e.balance_after != null ? Number(e.balance_after) : Number(e.balance_after_minor ?? 0) / 100,
        }));
        return { items, next_offset: r.next_offset, total: r.total };
      }
      const { data, error } = await supabase
        .from("holder_ledger_entries")
        .select("id,account_id,currency_code,credit_amount,debit_amount,description,posted_at,tx_number,balance_after")
        .in("account_id", accountIds)
        .order("posted_at", { ascending: false })
        .range(ledgerOffset, ledgerOffset + LEDGER_PAGE - 1);
      if (error) throw error;
      const items = (data ?? []).map((e: any) => ({
        ...e,
        source_entry_code: sourceEntryCode(e),
        source_cash_entry_code: sourceCashEntryCode(e),
        display_tx_number: displayTxNumber(e),
      }));
      return { items, next_offset: (items.length) === LEDGER_PAGE ? ledgerOffset + LEDGER_PAGE : null, total: null };
    },
  });
  // Append page items to accumulator when new page arrives.
  useEffect(() => {
    if (!ledgerPage) return;
    setLedgerAcc((prev) => {
      const seen = new Set(prev.map((e) => String(e.id)));
      const additions = ledgerPage.items.filter((e: any) => !seen.has(String(e.id)));
      return [...prev, ...additions];
    });
  }, [ledgerPage]);
  const ledger = ledgerAcc;
  const ledgerNextOffset = ledgerPage?.next_offset ?? null;
  const loadMoreLedger = () => {
    if (ledgerNextOffset != null) setLedgerOffset(ledgerNextOffset);
  };

  function copy(value?: string | null) {
    if (!value) return;
    navigator.clipboard?.writeText(value).then(() => toast.success("Copied", { duration: 1500 })).catch(() => {});
  }

  if (isLoading) {
    return <div className="p-6 text-sm text-muted-foreground">Loading…</div>;
  }
  if (!holder) {
    return <div className="p-6 text-sm text-muted-foreground">Holder not found.</div>;
  }

  const accounts = holder.holder_accounts ?? [];
  const totalLyd = (totals ?? []).reduce((sum, t) => sum + Number(t.total_balance ?? 0), 0);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="space-y-6 p-4 pb-12 sm:p-6"
    >
      {/* Breadcrumb */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-text-secondary">
          <Link to="/app/holders" className="flex items-center gap-1 transition-colors hover:text-gold">
            <ArrowLeft className="h-3.5 w-3.5" /> Holders
          </Link>
          <span>/</span>
          <span className="font-medium text-foreground">{holder.canonical_name}</span>
        </div>
        {isReadOnly && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-500/30 bg-sky-500/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-sky-400">
            <Eye className="h-3 w-3" /> Read-Only
          </span>
        )}
      </div>

      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="flex flex-col justify-between gap-4 md:flex-row md:items-start"
      >
        <div className="flex items-start gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl border border-gold/30 bg-gradient-to-br from-gold/25 via-gold-deep/30 to-surface-2 text-gold-soft shadow-[0_0_30px_rgba(212,168,87,0.15)]">
            {holderTypeIcon(holder.holder_type)}
          </div>
          <div className="min-w-0">
            <h1 className="flex flex-wrap items-center gap-3 font-serif text-2xl font-semibold" dir="auto">
              {holder.canonical_name}
              <StatusBadge status={holder.status} />
            </h1>
            <div className="mt-2 flex flex-wrap items-center gap-3 text-sm text-text-secondary">
              <button
                onClick={() => copy(holder.dahab_account_number)}
                className="group inline-flex items-center gap-1 rounded-md border border-border bg-surface-2 px-2 py-1 font-mono text-xs text-gold hover:border-gold/40"
                title="Copy DAHAB number"
              >
                {holder.dahab_account_number}
                <Copy className="h-3 w-3 opacity-0 transition group-hover:opacity-100" />
              </button>
              <span className="inline-flex items-center gap-1.5 text-xs">
                {holderTypeIcon(holder.holder_type, "h-3.5 w-3.5")} {holder.holder_type}
              </span>
              {holder.created_at && (
                <span className="text-xs">Joined {new Date(holder.created_at).toLocaleDateString()}</span>
              )}
            </div>
          </div>
        </div>
        {!isReadOnly && (
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-gold/25 bg-card/70 p-2 shadow-[0_8px_30px_-12px_rgba(0,0,0,0.5)] backdrop-blur">
            {isAdmin && <AddLinkedAccountDialog holderId={holder.id} />}
            <Button
              variant="outline"
              size="sm"
              className="gap-2 border-gold/40 bg-gold/5 font-medium text-foreground hover:border-gold/70 hover:bg-gold/15 hover:text-gold"
            >
              <Edit className="h-4 w-4" /> Edit Profile
            </Button>
            {isAdmin && (
              holder.status === "SUSPENDED" ? (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 border-emerald-500/60 bg-emerald-500/10 font-medium text-emerald-400 hover:bg-emerald-500/20"
                >
                  Reactivate
                </Button>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 border-red-500/60 bg-red-500/10 font-medium text-red-400 hover:bg-red-500/20"
                >
                  <AlertTriangle className="h-4 w-4" /> Suspend
                </Button>
              )
            )}
          </div>
        )}
      </motion.div>

      {/* Tabs */}
      <div className="scrollbar-none relative flex gap-1 overflow-x-auto rounded-xl border border-border bg-card/60 p-1.5 backdrop-blur">
        {TABS.map((tab) => {
          const isActive = activeTab === tab;
          return (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "relative whitespace-nowrap rounded-lg px-4 py-2 text-sm font-semibold transition-all",
                isActive
                  ? "border border-gold/50 bg-gold/15 text-gold shadow-[0_0_18px_-6px_oklch(0.74_0.135_82/0.45)]"
                  : "border border-transparent text-foreground/70 hover:bg-muted/40 hover:text-foreground",
              )}
            >
              {tab}
            </button>
          );
        })}
      </div>

      {/* Tab content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
        >
          {activeTab === "Overview" && (
            <OverviewTab
              holder={holder}
              accounts={accounts}
              totals={totals ?? []}
              totalLyd={totalLyd}
              isReadOnly={isReadOnly}
              isTeller={isTeller}
              highlightedAccountId={highlightedAccountId}
            />
          )}
          {activeTab === "Linked Accounts" && (
            isLoading || !holder ? (
              <p className="text-sm text-muted-foreground">Loading holder…</p>
            ) : !holderUuid ? (
              <p className="text-sm text-muted-foreground">
                Holder identifier is not yet resolved.
              </p>
            ) : linkedAccountsQuery.isLoading ? (
              <p className="text-sm text-muted-foreground">Loading linked accounts…</p>
            ) : linkedAccountsQuery.isError ? (
              <Card className="border-destructive/30 bg-destructive/5">
                <CardContent className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">
                      Unable to load linked accounts right now. Please refresh.
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {((linkedAccountsQuery.error as any)?.message ?? "unknown error")
                        .toString()
                        .slice(0, 200)}
                    </p>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => linkedAccountsQuery.refetch()}
                    disabled={linkedAccountsQuery.isFetching}
                  >
                    Retry
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <AccountListBlock
                accounts={linkedAccountsQuery.data ?? []}
                isReadOnly={isReadOnly}
                isAdmin={isAdmin}
                isTeller={isTeller}
                holderId={holder.id}
                highlightedAccountId={highlightedAccountId}
              />
            )
          )}
          {activeTab === "Transactions" && (
            <TransactionsTab
              entries={ledger ?? []}
              accounts={accounts}
              hasMore={ledgerNextOffset != null}
              loading={ledgerLoading}
              onLoadMore={loadMoreLedger}
            />
          )}
          {activeTab === "Activity" && <ActivityTab entries={ledger ?? []} />}
          {activeTab === "Notes" && <NotesTab isReadOnly={isReadOnly} />}
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
}

function holderTypeIcon(type?: string | null, cls = "h-6 w-6") {
  const t = (type ?? "").toLowerCase();
  if (t.includes("corp") || t.includes("company") || t.includes("business")) return <Building className={cls} />;
  if (t.includes("trust")) return <Shield className={cls} />;
  return <UserIcon className={cls} />;
}

function OverviewTab({ holder, accounts, totals, totalLyd, isReadOnly, isTeller, highlightedAccountId }: any) {
  const accountsByCurrency: Record<string, number> = {};
  for (const t of totals) accountsByCurrency[t.currency] = Number(t.total_balance ?? 0);
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      {/* Left column */}
      <div className="space-y-6">
        <Card className="p-5">
          <h3 className="mb-4 text-[10px] font-semibold uppercase tracking-[0.15em] text-text-secondary">
            Profile Information
          </h3>
          <div className="space-y-4 text-sm">
            <div>
              <div className="mb-1 text-[11px] uppercase tracking-wider text-text-secondary">Canonical Name</div>
              <div className="font-medium" dir="auto">{holder.canonical_name}</div>
            </div>
            <div className="space-y-3 border-t border-border pt-4">
              {holder.email && (
                <ProfileRow icon={Mail} label="Primary Email" value={holder.email} />
              )}
              {holder.phone && (
                <ProfileRow icon={Phone} label="Primary Phone" value={holder.phone} />
              )}
              <ProfileRow icon={MapPin} label="Holder Type" value={holder.holder_type ?? "—"} />
            </div>
          </div>
        </Card>

        <Card className="p-5">
          <h3 className="mb-4 text-[10px] font-semibold uppercase tracking-[0.15em] text-text-secondary">
            Account Summary
          </h3>
          <div className="space-y-3">
            <SummaryRow
              label="Linked Accounts"
              value={
                typeof (holder as any).linked_account_count === "number"
                  ? String((holder as any).linked_account_count)
                  : "—"
              }
            />
            <SummaryRow label="Currencies" value={String(totals.length || 0)} />
            <SummaryRow
              label="Status"
              value={<StatusBadge status={holder.status} />}
            />
          </div>
        </Card>
      </div>

      {/* Right column */}
      <div className="space-y-6 lg:col-span-2">
        {!isTeller && <Card className="relative overflow-hidden p-6">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-gold/15 via-card to-card opacity-80" />
          <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.04]" xmlns="http://www.w3.org/2000/svg">
            <defs>
              <pattern id="hero-grid" width="40" height="40" patternUnits="userSpaceOnUse">
                <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#D4A857" strokeWidth="1" />
              </pattern>
            </defs>
            <rect width="100%" height="100%" fill="url(#hero-grid)" />
          </svg>
          <div className="relative z-10">
            <div className="mb-2 flex items-center gap-2">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gold opacity-75" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-gold" />
              </span>
              <span className="text-[10px] font-medium uppercase tracking-[0.2em] text-gold">
                Consolidated Balance
              </span>
            </div>
            <div className="mb-5 font-serif text-4xl font-semibold tabular-nums">
              {fmt(totalLyd)}
              <span className="ml-2 font-sans text-lg font-normal opacity-60">LYD eq.</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {totals.map((t: any) => (
                <div
                  key={t.currency}
                  className="flex items-center gap-2 rounded-lg border border-border/50 bg-surface-2/60 px-3 py-1.5 backdrop-blur-sm"
                >
                  <span className="text-[10px] font-bold tracking-wider text-gold">{t.currency}</span>
                  <span className="text-sm font-medium tabular-nums">{fmt(Number(t.total_balance ?? 0))}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>}

        <AccountListBlock
          accounts={accounts}
          isReadOnly={isReadOnly}
          isAdmin={false}
          isTeller={isTeller}
          holderId={holder.id}
          highlightedAccountId={highlightedAccountId}
          compact
        />
      </div>
    </div>
  );
}

function ProfileRow({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="flex items-start gap-3">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-gold" />
      <div className="min-w-0">
        <div className="text-sm">{value}</div>
        <div className="mt-0.5 text-[10px] uppercase tracking-wider text-text-secondary">{label}</div>
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-[11px] uppercase tracking-wider text-text-secondary">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </div>
  );
}

function AccountListBlock({
  accounts,
  isReadOnly,
  isAdmin,
  isTeller = false,
  holderId,
  highlightedAccountId,
  compact = false,
}: {
  accounts: any[];
  isReadOnly: boolean;
  isAdmin: boolean;
  isTeller?: boolean;
  holderId: string | number;
  highlightedAccountId: number | null;
  compact?: boolean;
}) {
  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="font-serif text-lg font-semibold">
          Linked Accounts <span className="text-xs text-muted-foreground">({accounts.length} loaded)</span>
        </h2>
        {!isReadOnly && isAdmin && <AddLinkedAccountDialog holderId={holderId} />}
      </div>
      <div className="space-y-3">
        {accounts.length === 0 ? (
          <Card>
            <CardContent className="p-8 text-center text-sm text-muted-foreground">
              No linked accounts yet.
            </CardContent>
          </Card>
        ) : (
          accounts.map((acc) => {
            const isHighlighted = acc.id === highlightedAccountId;
            const tt = tint(acc.currency_code);
            const cardInner = (
              <Card
                className={cn(
                  "group relative overflow-hidden border-gold/20 bg-card/80 p-5 shadow-[0_4px_18px_-6px_rgba(0,0,0,0.5)] transition-all",
                  !isTeller && "cursor-pointer",
                  isHighlighted
                    ? "border-gold ring-2 ring-gold/40 shadow-[0_0_30px_rgba(212,168,87,0.25)]"
                    : !isTeller && "hover:-translate-y-0.5 hover:border-gold/50 hover:shadow-[0_10px_30px_-10px_oklch(0.74_0.135_82/0.35)]",
                )}
              >
                <div
                  className={cn(
                    "pointer-events-none absolute inset-y-0 left-0 w-1",
                    tt.text.replace("text-", "bg-"),
                  )}
                />
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                  <div className="flex items-start gap-4">
                    <CurrencyBadge currency={acc.currency_code} className="mt-1" />
                    <div className="min-w-0">
                      <div className="font-serif text-base font-semibold tracking-tight text-foreground transition-colors group-hover:text-gold" dir="auto">
                        {acc.account_display_name}
                      </div>
                      {acc.account_alias_name && (
                        <div className="mt-0.5 text-[11px] text-muted-foreground">{acc.account_alias_name}</div>
                      )}
                      <div className="mt-2 inline-flex items-center rounded-md border border-gold/30 bg-gold/5 px-2 py-0.5 font-mono text-xs font-semibold tracking-wide text-gold">
                        {acc.account_number}
                      </div>
                      {!compact && (
                        <div className="mt-2 flex items-center gap-1.5">
                          <Badge
                            variant="outline"
                            className="border-border/80 bg-muted/40 text-[10px] font-semibold uppercase tracking-wider"
                          >
                            {acc.account_nature}
                          </Badge>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4 sm:justify-end">
                    {!isTeller ? (
                      <div className="text-right">
                        <div className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                          Current balance
                        </div>
                        <div className={cn("mt-0.5 font-serif text-2xl font-semibold tabular-nums leading-none", tt.text)}>
                          {fmt(Number(acc.current_balance ?? 0))}
                          <span className="ml-1 align-baseline text-sm font-normal opacity-70">{acc.currency_code}</span>
                        </div>
                        <div className="mt-2 flex justify-end">
                          <StatusBadge status={acc.status} />
                        </div>
                      </div>
                    ) : (
                      <div className="text-right">
                        <StatusBadge status={acc.status} />
                      </div>
                    )}
                    {!isTeller && (
                      <ArrowRight className="h-5 w-5 text-muted-foreground transition-all group-hover:translate-x-1 group-hover:text-gold" />
                    )}
                  </div>
                </div>
              </Card>
            );
            if (isTeller) {
              return (
                <div key={acc.id} id={`account-${acc.id}`} className="block scroll-mt-24">
                  {cardInner}
                </div>
              );
            }
            return (
              <Link
                key={acc.id}
                to="/app/accounts/$id"
                params={{ id: String(acc.id) }}
                id={`account-${acc.id}`}
                className="block scroll-mt-24"
                onClick={() => {
                  if (import.meta.env.DEV) {
                    console.log("[account click]", {
                      holderAccountId: acc.id,
                      parentHolderId: acc.account_holder_id,
                      route: `/app/accounts/${acc.id}`,
                    });
                  }
                }}
              >
                {cardInner}
              </Link>
            );
          })
        )}
      </div>
    </div>
  );
}

function TransactionsTab({ entries, accounts, hasMore, loading, onLoadMore }: { entries: any[]; accounts: any[]; hasMore?: boolean; loading?: boolean; onLoadMore?: () => void }) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"All" | "Credit" | "Debit">("All");
  const accountMap = useMemo(() => {
    const m: Record<number, any> = {};
    for (const a of accounts) m[a.id] = a;
    return m;
  }, [accounts]);
  const filtered = entries.filter((e) => {
    if (search) {
      const s = search.toLowerCase();
      const matches =
        (e.description ?? "").toLowerCase().includes(s) ||
        (e.tx_number ?? "").toLowerCase().includes(s) ||
        (e.source_entry_code ?? "").toLowerCase().includes(s) ||
        (e.display_tx_number ?? "").toLowerCase().includes(s);
      if (!matches) return false;
    }
    const isCredit = Number(e.credit_amount ?? 0) > 0;
    if (filter === "Credit" && !isCredit) return false;
    if (filter === "Debit" && isCredit) return false;
    return true;
  });
  return (
    <Card className="p-5">
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <h2 className="mr-auto font-serif text-lg font-semibold">All Transactions</h2>
        <div className="relative min-w-[200px] max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-tertiary" />
          <Input
            placeholder="Search description or txn id…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>
        <div className="flex gap-1 rounded-lg border border-border bg-surface-2 p-1">
          {(["All", "Credit", "Debit"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setFilter(t)}
              className={cn(
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
                filter === t
                  ? "border border-gold/30 bg-gold/15 text-gold"
                  : "text-text-secondary hover:text-foreground",
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="py-16 text-center">
          <Search className="mx-auto mb-3 h-10 w-10 text-text-tertiary" />
          <p className="text-sm text-text-secondary">No transactions match your filters.</p>
        </div>
      ) : (
        <div className="-mx-5 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {["Date", "Description", "Account", "Reference", "Amount"].map((h, i) => (
                  <th
                    key={h}
                    className={cn(
                      "py-3 text-[10px] font-semibold uppercase tracking-wider text-text-secondary",
                      i === 0 ? "px-5 text-left" : i === 4 ? "px-5 text-right" : "px-3 text-left",
                    )}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((e) => {
                const isCredit = Number(e.credit_amount ?? 0) > 0;
                const amount = isCredit ? Number(e.credit_amount) : Number(e.debit_amount);
                const acc = accountMap[e.account_id];
                return (
                  <tr key={e.id} className="group border-b border-border/50 transition-colors hover:bg-surface-2/50">
                    <td className="px-5 py-3 text-xs text-text-secondary">
                      {new Date(e.posted_at).toLocaleDateString()}
                    </td>
                    <td className="px-3 py-3">{e.description ?? "—"}</td>
                    <td className="px-3 py-3">
                      {acc ? (
                        <Link to="/app/accounts/$id" params={{ id: String(acc.id) }} className="text-xs text-text-secondary transition-colors hover:text-gold">
                          {acc.account_display_name}
                        </Link>
                      ) : (
                        <span className="text-xs text-text-secondary">#{e.account_id}</span>
                      )}
                    </td>
                    <td className="px-3 py-3 font-mono text-xs text-gold-soft">{e.display_tx_number ?? e.tx_number}</td>
                    <td
                      className={cn(
                        "px-5 py-3 text-right font-medium tabular-nums",
                        isCredit ? "text-emerald-400" : "text-red-400",
                      )}
                    >
                      {isCredit ? "+" : "-"}
                      {fmt(amount)} {e.currency_code}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {hasMore && (
        <div className="mt-4 flex justify-center">
          <Button variant="outline" size="sm" disabled={loading} onClick={onLoadMore}>
            {loading ? "Loading…" : "Load more"}
          </Button>
        </div>
      )}
    </Card>
  );
}

function ActivityTab({ entries }: { entries: any[] }) {
  const events = entries.slice(0, 10).map((e) => {
    const isCredit = Number(e.credit_amount ?? 0) > 0;
    const amount = isCredit ? Number(e.credit_amount) : Number(e.debit_amount);
    return {
      id: e.id,
      title: isCredit ? "Credit Posted" : "Debit Posted",
      desc: `${e.description ?? "Ledger entry"} — ${fmt(amount)} ${e.currency_code}`,
      time: new Date(e.posted_at).toLocaleString(),
      tone: isCredit ? "emerald" : ("amber" as const),
      icon: isCredit ? CheckCircle2 : Clock,
    };
  });
  const toneMap: Record<string, string> = {
    gold: "bg-gold/15 text-gold border-gold/30",
    sky: "bg-sky-500/10 text-sky-400 border-sky-500/30",
    amber: "bg-amber-500/10 text-amber-400 border-amber-500/30",
    emerald: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30",
    neutral: "bg-surface-2 text-text-secondary border-border",
  };
  return (
    <Card className="p-5">
      <h2 className="mb-5 font-serif text-lg font-semibold">Activity Timeline</h2>
      {events.length === 0 ? (
        <p className="py-8 text-center text-sm text-text-secondary">No activity yet.</p>
      ) : (
        <div className="relative ml-3 space-y-6 border-l border-border pl-12">
          {events.map((e) => {
            const Icon = e.icon;
            return (
              <div key={e.id} className="relative">
                <div className={cn("absolute -left-[37px] top-0 flex h-9 w-9 items-center justify-center rounded-full border ring-4 ring-background", toneMap[e.tone])}>
                  <Icon className="h-4 w-4" />
                </div>
                <div>
                  <div className="text-sm font-medium">{e.title}</div>
                  <div className="mt-0.5 text-xs text-text-secondary">{e.desc}</div>
                  <div className="mt-1 text-[10px] uppercase tracking-wider text-text-tertiary">{e.time}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}

function NotesTab({ isReadOnly }: { isReadOnly: boolean }) {
  const [draft, setDraft] = useState("");
  const [notes, setNotes] = useState<{ id: string; author: string; time: string; body: string }[]>([]);
  const save = () => {
    if (!draft.trim()) return;
    setNotes((prev) => [{ id: `n${Date.now()}`, author: "You", time: "just now", body: draft.trim() }, ...prev]);
    setDraft("");
  };
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {!isReadOnly && (
        <Card className="h-fit p-5 lg:col-span-1">
          <h3 className="mb-3 text-[10px] font-semibold uppercase tracking-[0.15em] text-text-secondary">Add Note</h3>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="Add a private note about this holder…"
            className="h-32 w-full resize-none rounded-lg border border-border bg-surface-2 p-3 text-sm placeholder:text-text-tertiary focus:border-gold/40 focus:outline-none focus:ring-1 focus:ring-gold/30"
          />
          <Button className="mt-3 w-full gap-2" onClick={save}>
            <StickyNote className="h-4 w-4" /> Save Note
          </Button>
          <p className="mt-2 text-[10px] text-text-tertiary">Visible only to back-office staff.</p>
        </Card>
      )}
      <Card className={cn("p-5", isReadOnly ? "lg:col-span-3" : "lg:col-span-2")}>
        <h3 className="mb-4 text-[10px] font-semibold uppercase tracking-[0.15em] text-text-secondary">Notes ({notes.length})</h3>
        {notes.length === 0 ? (
          <p className="py-8 text-center text-sm text-text-secondary">No notes yet.</p>
        ) : (
          <div className="space-y-3">
            {notes.map((n) => (
              <div key={n.id} className="rounded-xl border border-border bg-surface-2 p-4">
                <p className="text-sm">{n.body}</p>
                <div className="mt-2 text-[10px] uppercase tracking-wider text-text-tertiary">
                  <span className="text-gold-soft">{n.author}</span> · {n.time}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
