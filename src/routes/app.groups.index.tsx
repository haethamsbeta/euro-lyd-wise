import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Layers, Plus, Search, X, Star, Pin, MoreVertical, Pencil, Trash2, Users,
  Briefcase, Home, TrendingUp, PiggyBank, Building2, Crown, Sparkles, ArrowRight,
  FolderOpen, FilterX, ShieldAlert, ArrowUp, ArrowDown,
} from "lucide-react";
import { useAuth, hasAnyRole } from "@/lib/auth";
import { useEffectiveRoles } from "@/lib/role-view";
import { useDebounced } from "@/hooks/use-debounced";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/groups/")({
  component: GroupsPage,
  head: () => ({ meta: [{ title: "Groups" }] }),
});

// ────────────────────────────────────────────────────────────────────────────
// TYPE_META
// ────────────────────────────────────────────────────────────────────────────

export type GroupType = "general" | "family" | "business" | "investment" | "savings" | "corporate" | "vip";

export const TYPE_META: Record<GroupType, {
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  tone: string; bg: string; border: string; glow: string;
  pillBg: string; pillBorder: string; pillText: string;
}> = {
  general:    { label: "General",    Icon: FolderOpen,  tone: "text-gold",            bg: "bg-gold/10",            border: "border-gold/30",            glow: "shadow-[0_0_0_3px_oklch(from_var(--gold)_l_c_h/0.10),0_18px_48px_-22px_var(--gold)]", pillBg: "bg-gold/10", pillBorder: "border-gold/30", pillText: "text-gold" },
  family:     { label: "Family",     Icon: Home,        tone: "text-rose-300",        bg: "bg-rose-400/10",        border: "border-rose-400/30",        glow: "shadow-[0_0_0_3px_rgba(251,113,133,0.10),0_18px_48px_-22px_rgba(251,113,133,0.55)]", pillBg: "bg-rose-400/10", pillBorder: "border-rose-400/30", pillText: "text-rose-300" },
  business:   { label: "Business",   Icon: Briefcase,   tone: "text-sky-300",         bg: "bg-sky-400/10",         border: "border-sky-400/30",         glow: "shadow-[0_0_0_3px_rgba(56,189,248,0.10),0_18px_48px_-22px_rgba(56,189,248,0.55)]",  pillBg: "bg-sky-400/10", pillBorder: "border-sky-400/30", pillText: "text-sky-300" },
  investment: { label: "Investment", Icon: TrendingUp,  tone: "text-emerald-300",     bg: "bg-emerald-400/10",     border: "border-emerald-400/30",     glow: "shadow-[0_0_0_3px_rgba(52,211,153,0.10),0_18px_48px_-22px_rgba(52,211,153,0.55)]",  pillBg: "bg-emerald-400/10", pillBorder: "border-emerald-400/30", pillText: "text-emerald-300" },
  savings:    { label: "Savings",    Icon: PiggyBank,   tone: "text-amber-300",       bg: "bg-amber-400/10",       border: "border-amber-400/30",       glow: "shadow-[0_0_0_3px_rgba(251,191,36,0.10),0_18px_48px_-22px_rgba(251,191,36,0.55)]",  pillBg: "bg-amber-400/10", pillBorder: "border-amber-400/30", pillText: "text-amber-300" },
  corporate:  { label: "Corporate",  Icon: Building2,   tone: "text-indigo-300",      bg: "bg-indigo-400/10",      border: "border-indigo-400/30",      glow: "shadow-[0_0_0_3px_rgba(129,140,248,0.10),0_18px_48px_-22px_rgba(129,140,248,0.55)]", pillBg: "bg-indigo-400/10", pillBorder: "border-indigo-400/30", pillText: "text-indigo-300" },
  vip:        { label: "VIP",        Icon: Crown,       tone: "text-fuchsia-300",     bg: "bg-fuchsia-400/10",     border: "border-fuchsia-400/30",     glow: "shadow-[0_0_0_3px_rgba(232,121,249,0.10),0_18px_48px_-22px_rgba(232,121,249,0.55)]", pillBg: "bg-fuchsia-400/10", pillBorder: "border-fuchsia-400/30", pillText: "text-fuchsia-300" },
};

const TYPE_ORDER: GroupType[] = ["general", "family", "business", "investment", "savings", "corporate", "vip"];

export function metaFor(t: string | null | undefined) {
  return TYPE_META[(t as GroupType) in TYPE_META ? (t as GroupType) : "general"];
}

// ────────────────────────────────────────────────────────────────────────────
// Types
// ────────────────────────────────────────────────────────────────────────────

type GroupRow = {
  id: number;
  name: string;
  description: string | null;
  group_type: string;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
};

type CurrencyAgg = { currency: string; balance: number; credits30d: number; debits30d: number; tx30d: number; accountCount: number };

type SortKey = "pinned" | "newest" | "name" | "members";

// ────────────────────────────────────────────────────────────────────────────
// Page
// ────────────────────────────────────────────────────────────────────────────

function GroupsPage() {
  const roles = useEffectiveRoles();
  const isAdmin = hasAnyRole(roles, ["admin"]);
  const isAuditor = hasAnyRole(roles, ["auditor"]) && !isAdmin;
  const canMutate = isAdmin;
  const canViewBalances = isAdmin;
  const qc = useQueryClient();
  const navigate = useNavigate();

  const [search, setSearch] = useState("");
  const dq = useDebounced(search, 200).trim().toLowerCase();
  const [typeFilter, setTypeFilter] = useState<"all" | GroupType>("all");
  const [sortKey, setSortKey] = useState<SortKey>("pinned");

  const [editing, setEditing] = useState<GroupRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<GroupRow | null>(null);

  const groupsQ = useQuery({
    queryKey: ["groups.list.v2"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("account_groups")
        .select("id,name,description,group_type,is_pinned,created_at,updated_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as GroupRow[];
    },
  });

  const membersQ = useQuery({
    queryKey: ["groups.all-members"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("account_group_members")
        .select("group_id,holder_account_id");
      if (error) throw error;
      const map = new Map<number, number[]>();
      for (const r of (data ?? []) as { group_id: number; holder_account_id: number }[]) {
        const arr = map.get(r.group_id);
        if (arr) arr.push(r.holder_account_id);
        else map.set(r.group_id, [r.holder_account_id]);
      }
      return map;
    },
  });

  const allAccountIds = useMemo(() => {
    const set = new Set<number>();
    membersQ.data?.forEach((arr) => arr.forEach((id) => set.add(id)));
    return Array.from(set);
  }, [membersQ.data]);

  const balancesQ = useQuery({
    queryKey: ["groups.account-balances", allAccountIds.length],
    enabled: allAccountIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("holder_accounts")
        .select("id,currency_code,current_balance")
        .in("id", allAccountIds);
      if (error) throw error;
      const m = new Map<number, { currency: string; balance: number }>();
      for (const r of data ?? []) m.set(r.id, { currency: r.currency_code, balance: Number(r.current_balance ?? 0) });
      return m;
    },
  });

  const activityQ = useQuery({
    queryKey: ["groups.activity30d", allAccountIds.length],
    enabled: allAccountIds.length > 0,
    queryFn: async () => {
      const since = new Date(Date.now() - 30 * 86400_000).toISOString();
      const { data, error } = await supabase
        .from("holder_ledger_entries")
        .select("account_id,currency_code,debit_amount,credit_amount,posted_at")
        .in("account_id", allAccountIds)
        .gte("posted_at", since)
        .limit(10000);
      if (error) throw error;
      const m = new Map<number, { credits: number; debits: number; tx: number }>();
      for (const r of data ?? []) {
        const cur = m.get(r.account_id) ?? { credits: 0, debits: 0, tx: 0 };
        cur.credits += Number(r.credit_amount ?? 0);
        cur.debits += Number(r.debit_amount ?? 0);
        cur.tx += 1;
        m.set(r.account_id, cur);
      }
      return m;
    },
  });

  const togglePin = useMutation({
    mutationFn: async (g: GroupRow) => {
      const { error } = await supabase.from("account_groups").update({ is_pinned: !g.is_pinned }).eq("id", g.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["groups.list.v2"] }),
    onError: (e: any) => toast.error(e?.message ?? "Could not pin group"),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: number) => {
      await supabase.from("account_group_members").delete().eq("group_id", id);
      const { error } = await supabase.from("account_groups").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Group deleted");
      qc.invalidateQueries({ queryKey: ["groups.list.v2"] });
      qc.invalidateQueries({ queryKey: ["groups.all-members"] });
      setDeleting(null);
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to delete"),
  });

  const groups = groupsQ.data ?? [];
  const members = membersQ.data ?? new Map<number, number[]>();
  const balances = balancesQ.data ?? new Map();
  const activity = activityQ.data ?? new Map();

  function aggregateGroup(groupId: number): CurrencyAgg[] {
    const ids = members.get(groupId) ?? [];
    const byCur = new Map<string, CurrencyAgg>();
    for (const id of ids) {
      const b = balances.get(id);
      if (!b) continue;
      const cur = byCur.get(b.currency) ?? { currency: b.currency, balance: 0, credits30d: 0, debits30d: 0, tx30d: 0, accountCount: 0 };
      cur.balance += b.balance;
      cur.accountCount += 1;
      const a = activity.get(id);
      if (a) {
        cur.credits30d += a.credits;
        cur.debits30d += a.debits;
        cur.tx30d += a.tx;
      }
      byCur.set(b.currency, cur);
    }
    return Array.from(byCur.values()).sort((x, y) => y.balance - x.balance);
  }

  const filtered = useMemo(() => {
    let xs = groups.slice();
    if (typeFilter !== "all") xs = xs.filter((g) => (g.group_type || "general") === typeFilter);
    if (dq) {
      xs = xs.filter((g) =>
        g.name.toLowerCase().includes(dq) ||
        (g.description ?? "").toLowerCase().includes(dq) ||
        (g.group_type ?? "").toLowerCase().includes(dq),
      );
    }
    xs.sort((a, b) => {
      if (sortKey === "pinned") {
        if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
      if (sortKey === "newest") return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      if (sortKey === "name") return a.name.localeCompare(b.name);
      if (sortKey === "members") return (members.get(b.id)?.length ?? 0) - (members.get(a.id)?.length ?? 0);
      return 0;
    });
    return xs;
  }, [groups, typeFilter, dq, sortKey, members]);

  const totalMembers = useMemo(() => Array.from(members.values()).reduce((s, arr) => s + arr.length, 0), [members]);
  const pinnedCount = groups.filter((g) => g.is_pinned).length;

  // Aggregate managed balance — top currency across all groups
  const managedTotals = useMemo(() => {
    const m = new Map<string, number>();
    for (const arr of members.values()) {
      for (const id of arr) {
        const b = balances.get(id);
        if (!b) continue;
        m.set(b.currency, (m.get(b.currency) ?? 0) + b.balance);
      }
    }
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [members, balances]);

  return (
    <div className="min-h-[calc(100vh-7rem)]">
      <div className="mx-auto max-w-7xl px-4 pt-6 md:px-8 md:pt-8">
        {/* Header */}
        <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="mb-1 inline-flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-gold" />
              <span className="text-[10px] font-semibold uppercase tracking-[0.3em] text-gold">Customer organisation</span>
            </div>
            <h1 className="font-playfair text-3xl font-semibold text-foreground md:text-4xl">Groups</h1>
            <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
              Organise related customers and accounts into curated groups for monitoring and reporting. No financial linkage between members.
            </p>
          </div>
          {canMutate && (
            <Button variant="gold" className="self-start md:self-auto" onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" /> New Group
            </Button>
          )}
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiCard label="Total Groups" value={groups.length} icon={<Layers className="h-4 w-4" />} />
          <KpiCard label="Total Members" value={totalMembers} icon={<Users className="h-4 w-4" />} />
          <KpiCard label="Pinned" value={pinnedCount} icon={<Pin className="h-4 w-4" />} />
          {canViewBalances ? (
            <ManagedBalanceKpi totals={managedTotals} />
          ) : (
            <KpiCard label="Active Groups" value={groups.length} icon={<FolderOpen className="h-4 w-4" />} />
          )}
        </div>

        {/* Filter bar */}
        <div className="mt-6 space-y-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search groups by name, description, or type…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-11 rounded-xl border-gold/20 bg-card/60 pl-11 pr-10 placeholder:text-muted-foreground/70 focus-visible:ring-gold/40 focus-visible:border-gold/60"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  aria-label="Clear search"
                  className="absolute right-3 top-1/2 inline-flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-gold/10 hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
              <SelectTrigger className="h-11 w-full rounded-xl border-gold/20 bg-card/60 md:w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pinned">Pinned first</SelectItem>
                <SelectItem value="newest">Newest</SelectItem>
                <SelectItem value="name">Name</SelectItem>
                <SelectItem value="members">Member count</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 md:mx-0 md:flex-wrap md:overflow-visible md:px-0">
            <TypePill
              active={typeFilter === "all"}
              onClick={() => setTypeFilter("all")}
              label="All"
              count={groups.length}
              tone="bg-gold/10 border-gold/30 text-gold"
            />
            {TYPE_ORDER.map((t) => {
              const m = TYPE_META[t];
              const c = groups.filter((g) => (g.group_type || "general") === t).length;
              if (c === 0 && typeFilter !== t) return null;
              return (
                <TypePill
                  key={t}
                  active={typeFilter === t}
                  onClick={() => setTypeFilter(t)}
                  label={m.label}
                  count={c}
                  tone={cn(m.pillBg, m.pillBorder, m.pillText)}
                  Icon={m.Icon}
                />
              );
            })}
          </div>
        </div>

        {/* Cards grid / empty states */}
        <div className="mt-6 pb-12">
          {groupsQ.isLoading ? (
            <div className="rounded-2xl border border-gold/15 bg-card/40 p-10 text-center text-sm text-muted-foreground">
              Loading groups…
            </div>
          ) : groups.length === 0 ? (
            <EmptyZeroState canCreate={canMutate} onCreate={() => setCreating(true)} />
          ) : filtered.length === 0 ? (
            <EmptyFilteredState onClear={() => { setSearch(""); setTypeFilter("all"); }} />
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filtered.map((g) => (
                <GroupCard
                  key={g.id}
                  g={g}
                  memberCount={members.get(g.id)?.length ?? 0}
                  aggs={aggregateGroup(g.id)}
                  canMutate={canMutate}
                  canViewBalances={canViewBalances}
                  onOpen={() => navigate({ to: "/app/groups/$id", params: { id: String(g.id) } })}
                  onEdit={() => setEditing(g)}
                  onDelete={() => setDeleting(g)}
                  onTogglePin={() => togglePin.mutate(g)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Create / Edit modal */}
      {(creating || editing) && (
        <GroupModal
          mode={editing ? "edit" : "create"}
          group={editing}
          onClose={() => { setCreating(false); setEditing(null); }}
        />
      )}

      {/* Delete confirm */}
      <AlertDialog open={!!deleting} onOpenChange={(v) => !v && setDeleting(null)}>
        <AlertDialogContent className="border-gold/20">
          <AlertDialogHeader>
            <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <AlertDialogTitle>Delete group?</AlertDialogTitle>
            <AlertDialogDescription>
              The group <span className="font-medium text-foreground">"{deleting?.name}"</span> will be removed along with its
              membership links. The underlying customers and accounts will not be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => { e.preventDefault(); if (deleting) deleteMut.mutate(deleting.id); }}
            >
              Delete group
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {isAuditor && (
        <div className="pointer-events-none fixed inset-x-0 bottom-24 z-10 mx-auto w-fit rounded-full border border-gold/20 bg-card/90 px-3 py-1 text-[11px] text-muted-foreground shadow-lg backdrop-blur">
          Read-only · Auditor view
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// KPI cards
// ────────────────────────────────────────────────────────────────────────────

function KpiCard({ label, value, icon, hint }: { label: string; value: React.ReactNode; icon: React.ReactNode; hint?: string }) {
  return (
    <div className="rounded-2xl border border-gold/15 bg-card/70 p-4">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gold/10 text-gold">{icon}</span>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      </div>
      <div className="mt-2 font-playfair text-2xl font-semibold tabular-nums text-foreground">{value}</div>
      {hint && <div className="mt-0.5 text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

function ManagedBalanceKpi({ totals }: { totals: [string, number][] }) {
  const top = totals[0];
  return (
    <div className="rounded-2xl border border-gold/30 bg-gradient-to-br from-card via-card to-gold/5 p-4">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-gold text-[var(--surface)]">
          <Sparkles className="h-4 w-4" />
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-gold/90">Managed Balance</span>
      </div>
      <div className="mt-2 font-playfair text-2xl font-semibold tabular-nums text-foreground">
        {top ? `${top[1].toLocaleString()} ${top[0]}` : "—"}
      </div>
      {totals.length > 1 && (
        <div className="mt-1 truncate text-xs text-muted-foreground">
          + {totals.slice(1, 4).map(([c, v]) => `${v.toLocaleString()} ${c}`).join(" · ")}
        </div>
      )}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Type pill
// ────────────────────────────────────────────────────────────────────────────

function TypePill({
  active, onClick, label, count, tone, Icon,
}: { active: boolean; onClick: () => void; label: string; count: number; tone: string; Icon?: React.ComponentType<{ className?: string }> }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all",
        tone,
        active
          ? "ring-2 ring-offset-0 shadow-[0_0_0_3px_oklch(from_var(--gold)_l_c_h/0.10)] ring-gold/40"
          : "opacity-80 hover:opacity-100 hover:scale-[1.02]",
      )}
    >
      {Icon && <Icon className="h-3.5 w-3.5" />}
      <span>{label}</span>
      <span className="rounded-full bg-black/30 px-1.5 py-px text-[10px] tabular-nums">{count}</span>
    </button>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Group card
// ────────────────────────────────────────────────────────────────────────────

function GroupCard({
  g, memberCount, aggs, canMutate, canViewBalances, onOpen, onEdit, onDelete, onTogglePin,
}: {
  g: GroupRow; memberCount: number; aggs: CurrencyAgg[];
  canMutate: boolean; canViewBalances: boolean;
  onOpen: () => void; onEdit: () => void; onDelete: () => void; onTogglePin: () => void;
}) {
  const meta = metaFor(g.group_type);
  const accountCount = aggs.reduce((s, a) => s + a.accountCount, 0);
  const primary = aggs[0];
  const secondary = aggs.slice(1, 3);
  const overflow = Math.max(0, aggs.length - 3);
  const totalCredits30d = aggs.reduce((s, a) => s + a.credits30d, 0);
  const totalDebits30d = aggs.reduce((s, a) => s + a.debits30d, 0);
  const totalTx30d = aggs.reduce((s, a) => s + a.tx30d, 0);
  const hasNegative = aggs.some((a) => a.balance < 0);
  const isStale = canViewBalances && aggs.length > 0 && totalTx30d === 0;

  return (
    <div
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}
      className={cn(
        "group relative flex cursor-pointer flex-col gap-4 rounded-2xl border bg-card/70 p-5 text-left outline-none transition-all hover:bg-card hover:border-gold/40 focus-visible:ring-2 focus-visible:ring-gold/40 animate-fade-in",
        g.is_pinned ? cn(meta.border, meta.glow) : "border-gold/15 hover:shadow-[0_10px_30px_-18px_var(--gold)]",
      )}
    >
      {/* Header row */}
      <div className="flex items-start justify-between gap-2">
        <div className={cn("flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border", meta.bg, meta.border, meta.tone)}>
          <meta.Icon className="h-5 w-5" />
        </div>
        <div className="flex items-center gap-1">
          {canMutate && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onTogglePin(); }}
              aria-label={g.is_pinned ? "Unpin group" : "Pin group"}
              className={cn(
                "flex h-8 w-8 items-center justify-center rounded-lg transition-colors",
                g.is_pinned ? "text-gold hover:bg-gold/10" : "text-muted-foreground hover:bg-gold/10 hover:text-gold",
              )}
            >
              <Star className={cn("h-4 w-4", g.is_pinned && "fill-current")} />
            </button>
          )}
          {canMutate && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  onClick={(e) => e.stopPropagation()}
                  className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground opacity-0 transition-opacity hover:bg-gold/10 hover:text-gold focus:opacity-100 group-hover:opacity-100 md:opacity-0"
                  aria-label="Group actions"
                >
                  <MoreVertical className="h-4 w-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="border-gold/20" onClick={(e) => e.stopPropagation()}>
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onOpen(); }}>
                  <FolderOpen className="h-4 w-4" /> View details
                </DropdownMenuItem>
                <DropdownMenuItem onClick={(e) => { e.stopPropagation(); onEdit(); }}>
                  <Pencil className="h-4 w-4" /> Edit group
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={(e) => { e.stopPropagation(); onDelete(); }}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="h-4 w-4" /> Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </div>

      {/* Title + type pill */}
      <div>
        <div className="flex items-center gap-2">
          <h3 className="line-clamp-1 font-playfair text-lg font-semibold text-foreground">{g.name}</h3>
          {g.is_pinned && <Pin className="h-3.5 w-3.5 text-gold" />}
        </div>
        <span className={cn("mt-1.5 inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider", meta.pillBg, meta.pillBorder, meta.pillText)}>
          <meta.Icon className="h-3 w-3" />
          {meta.label}
        </span>
      </div>

      {/* Description */}
      <p className="line-clamp-2 min-h-[2.5rem] text-xs text-muted-foreground">
        {g.description || "No description provided."}
      </p>

      {/* Status chips */}
      {(accountCount > 0 || hasNegative || isStale) && (
        <div className="flex flex-wrap items-center gap-1.5">
          {accountCount > 0 && (
            <span className="inline-flex items-center gap-1 rounded-md border border-gold/20 bg-gold/5 px-2 py-0.5 text-[10px] font-medium text-gold">
              {accountCount} acct{accountCount === 1 ? "" : "s"}
            </span>
          )}
          {hasNegative && (
            <span className="inline-flex items-center gap-1 rounded-md border border-rose-400/30 bg-rose-400/10 px-2 py-0.5 text-[10px] font-medium text-rose-300">
              <ShieldAlert className="h-3 w-3" /> Negative balance
            </span>
          )}
          {isStale && (
            <span className="inline-flex items-center gap-1 rounded-md border border-amber-400/30 bg-amber-400/10 px-2 py-0.5 text-[10px] font-medium text-amber-300">
              No activity · 30d
            </span>
          )}
        </div>
      )}

      {/* Hero balances */}
      {canViewBalances ? (
        aggs.length === 0 ? (
          <div className="rounded-xl border border-gold/10 bg-surface-2/50 px-3 py-3 text-center text-xs text-muted-foreground">
            No balances yet
          </div>
        ) : (
          <div className="rounded-xl border border-gold/15 bg-surface-2/40 p-4">
            <div className="mb-1 flex items-center justify-between">
              <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-muted-foreground">Total balance</span>
              <span className={cn("inline-flex items-center rounded-md border px-2 py-0.5 font-mono text-[10px] font-bold", meta.pillBg, meta.pillBorder, meta.pillText)}>
                {primary.currency}
              </span>
            </div>
            <div className={cn(
              "font-playfair font-semibold tabular-nums leading-tight",
              "text-2xl md:text-3xl",
              primary.balance < 0 ? "text-rose-300" : "text-foreground",
            )}>
              {primary.balance.toLocaleString(undefined, { maximumFractionDigits: 2 })}
            </div>

            {secondary.length > 0 && (
              <div className="mt-3 space-y-1.5 border-t border-gold/10 pt-2.5">
                {secondary.map((a) => (
                  <div key={a.currency} className="flex items-center justify-between gap-2">
                    <span className={cn("inline-flex items-center rounded-md border px-1.5 py-0.5 font-mono text-[10px] font-bold", meta.pillBg, meta.pillBorder, meta.pillText)}>
                      {a.currency}
                    </span>
                    <span className={cn(
                      "font-mono text-base tabular-nums",
                      a.balance < 0 ? "text-rose-300" : "text-foreground",
                    )}>
                      {a.balance.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </span>
                  </div>
                ))}
                {overflow > 0 && (
                  <div className="text-right text-xs text-muted-foreground">+ {overflow} more currenc{overflow === 1 ? "y" : "ies"}</div>
                )}
              </div>
            )}

            {/* 30d activity strip */}
            <div className="mt-3 grid grid-cols-3 gap-2 border-t border-gold/10 pt-3">
              <div>
                <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Credits 30d</div>
                <div className="mt-0.5 inline-flex items-center gap-1 font-mono text-sm tabular-nums text-emerald-400">
                  <ArrowUp className="h-3 w-3" />{compactNum(totalCredits30d)}
                </div>
              </div>
              <div>
                <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Debits 30d</div>
                <div className="mt-0.5 inline-flex items-center gap-1 font-mono text-sm tabular-nums text-rose-400">
                  <ArrowDown className="h-3 w-3" />{compactNum(totalDebits30d)}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">Txns</div>
                <div className="mt-0.5 font-mono text-sm tabular-nums text-foreground">{compactNum(totalTx30d)}</div>
              </div>
            </div>
          </div>
        )
      ) : (
        <div className="rounded-lg border border-gold/10 bg-surface-2/50 px-3 py-2 text-[11px] text-muted-foreground">
          {memberCount} member{memberCount === 1 ? "" : "s"}
        </div>
      )}

      {/* Members footer */}
      <div className="flex items-center justify-between border-t border-gold/10 pt-3">
        <MemberAvatars groupId={g.id} count={memberCount} />
        <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-gold" />
      </div>
    </div>
  );
}

function compactNum(n: number) {
  if (!n) return "0";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return Math.round(n).toString();
}

function MemberAvatars({ groupId, count }: { groupId: number; count: number }) {
  const q = useQuery({
    queryKey: ["group.preview-members", groupId],
    enabled: count > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("account_group_members")
        .select("holder_account_id, holder_accounts!inner(account_holders!inner(canonical_name))")
        .eq("group_id", groupId)
        .limit(4);
      if (error) throw error;
      return (data ?? []).map((m: any) => m.holder_accounts?.account_holders?.canonical_name as string).filter(Boolean);
    },
  });
  const names = q.data ?? [];
  const overflow = Math.max(0, count - names.length);
  if (count === 0) {
    return <span className="text-[11px] text-muted-foreground">No members yet</span>;
  }
  return (
    <div className="flex items-center gap-2">
      <div className="flex -space-x-2">
        {names.slice(0, 4).map((n, i) => (
          <span
            key={i}
            title={n}
            className="flex h-7 w-7 items-center justify-center rounded-full border border-card bg-gradient-to-br from-gold/30 to-gold/10 text-[10px] font-semibold text-gold"
          >
            {initials(n)}
          </span>
        ))}
        {overflow > 0 && (
          <span className="flex h-7 w-7 items-center justify-center rounded-full border border-card bg-surface-2 text-[10px] font-semibold text-muted-foreground">
            +{overflow}
          </span>
        )}
      </div>
      <span className="text-[11px] text-muted-foreground">{count} member{count === 1 ? "" : "s"}</span>
    </div>
  );
}

export function initials(name: string) {
  const parts = (name ?? "").trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

// ────────────────────────────────────────────────────────────────────────────
// Empty states
// ────────────────────────────────────────────────────────────────────────────

function EmptyZeroState({ canCreate, onCreate }: { canCreate: boolean; onCreate: () => void }) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-3xl border border-dashed border-gold/25 bg-card/40 px-6 py-16 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-gold/30 bg-gold/10 text-gold">
        <Layers className="h-6 w-6" />
      </div>
      <div className="max-w-md">
        <h3 className="font-playfair text-xl font-semibold text-foreground">No groups yet</h3>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Groups let you cluster related customers and accounts—like family circles, business units, or VIP holdings—for monitoring and reporting.
        </p>
      </div>
      {canCreate && (
        <Button variant="gold" onClick={onCreate}>
          <Plus className="h-4 w-4" /> Create First Group
        </Button>
      )}
    </div>
  );
}

function EmptyFilteredState({ onClear }: { onClear: () => void }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-gold/20 bg-card/30 px-6 py-12 text-center">
      <div className="flex h-11 w-11 items-center justify-center rounded-full border border-gold/15 bg-surface-2 text-muted-foreground">
        <Search className="h-5 w-5" />
      </div>
      <div>
        <div className="text-sm font-medium text-foreground">No matching groups</div>
        <p className="mt-1 text-xs text-muted-foreground">Try a different search term or change the type filter.</p>
      </div>
      <Button variant="outline" size="sm" onClick={onClear} className="border-gold/20">
        <FilterX className="h-3.5 w-3.5" /> Clear filters
      </Button>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Create / Edit modal
// ────────────────────────────────────────────────────────────────────────────

function GroupModal({
  mode, group, onClose,
}: { mode: "create" | "edit"; group: GroupRow | null; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(group?.name ?? "");
  const [description, setDescription] = useState(group?.description ?? "");
  const [type, setType] = useState<GroupType>((group?.group_type as GroupType) || "general");

  const save = useMutation({
    mutationFn: async () => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error("Name is required");
      if (mode === "create") {
        const { data: u } = await supabase.auth.getUser();
        const { error } = await supabase.from("account_groups").insert({
          name: trimmed,
          description: description.trim() || null,
          group_type: type,
          is_pinned: false,
          created_by: u.user?.id ?? null,
        });
        if (error) throw error;
      } else if (group) {
        const { error } = await supabase
          .from("account_groups")
          .update({
            name: trimmed,
            description: description.trim() || null,
            group_type: type,
          })
          .eq("id", group.id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(mode === "create" ? "Group created" : "Group updated");
      qc.invalidateQueries({ queryKey: ["groups.list.v2"] });
      qc.invalidateQueries({ queryKey: ["group.detail"] });
      onClose();
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl border-gold/20">
        <DialogHeader>
          <DialogTitle className="font-playfair text-2xl">
            {mode === "create" ? "New Group" : "Edit Group"}
          </DialogTitle>
          <DialogDescription>
            Choose a type and add a clear name. You can manage members from the group's detail page.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div>
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Group type</Label>
            <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {TYPE_ORDER.map((t) => {
                const m = TYPE_META[t];
                const active = type === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    className={cn(
                      "flex flex-col items-center gap-1.5 rounded-xl border p-3 text-xs transition-all",
                      active
                        ? cn(m.border, m.bg, m.tone, "shadow-[0_0_0_3px_oklch(from_var(--gold)_l_c_h/0.10)]")
                        : "border-gold/15 bg-card/60 text-muted-foreground hover:border-gold/30",
                    )}
                  >
                    <m.Icon className="h-5 w-5" />
                    <span className="font-medium">{m.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <Label htmlFor="group-name">Name</Label>
            <Input
              id="group-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Al-Mansouri Family"
              className="mt-1 h-10 rounded-xl border-gold/20 bg-card/60 focus-visible:ring-gold/40"
              autoFocus
            />
          </div>

          <div>
            <Label htmlFor="group-desc">Description (optional)</Label>
            <Textarea
              id="group-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="What does this group represent?"
              className="mt-1 rounded-xl border-gold/20 bg-card/60 focus-visible:ring-gold/40"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" className="border-gold/20" onClick={onClose}>Cancel</Button>
          <Button
            variant="gold"
            disabled={save.isPending || !name.trim()}
            onClick={() => save.mutate()}
          >
            {save.isPending ? "Saving…" : mode === "create" ? "Create Group" : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
