import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Layers, Plus, Search, X, Star, Pin, MoreVertical, Pencil, Trash2, Users,
  Briefcase, Home, TrendingUp, PiggyBank, Building2, Crown, Sparkles, ArrowRight,
  FolderOpen, FilterX, ShieldAlert, FolderTree, Activity, Filter, ArrowUpDown,
  TrendingDown, StarOff,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { Card } from "@/components/ui/card";
import { CurrencyBadge } from "@/components/ui/currency-badge";
import { hasAnyRole } from "@/lib/auth";
import { useEffectiveRoles } from "@/lib/role-view";
import { useT } from "@/lib/i18n";
import { useDebounced } from "@/hooks/use-debounced";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import type { AccountGroup } from "@/lib/api/groups";
import { BackendPending, isPendingError } from "@/components/app/backend-pending";
import { DATA_BACKEND } from "@/lib/runtimeConfig";

export const Route = createFileRoute("/app/groups/")({
  head: () => ({ meta: [{ title: "Customer groups — Dahab" }, { name: "description", content: "Browse customer groups and their linked account holders." }] }), component: GroupsPage,
});

const isLambda = DATA_BACKEND === "lambda";

// ────────────────────────────────────────────────────────────────────────────
// TYPE_META (re-exported for detail page)
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

export function initials(name: string) {
  const parts = (name ?? "").trim().split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase() || "?";
}

type SortKey = "pinned" | "newest" | "name" | "members";
type GroupSort = "name" | "members" | "balance" | "newest";

function formatCompactCurrency(value: number, _currency?: string) {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

// ────────────────────────────────────────────────────────────────────────────
// Page
// ────────────────────────────────────────────────────────────────────────────

function GroupsPage() {
  const t = useT();
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
  const [sortKey, setSortKey] = useState<GroupSort>("newest");

  const [editing, setEditing] = useState<AccountGroup | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<AccountGroup | null>(null);

  const groupsQ = useQuery({
    queryKey: ["groups.list.v3"],
    queryFn: () => api.groups.list(),
    retry: false,
  });

  const listPending = isLambda && isPendingError(groupsQ.error);
  // Once the GET endpoint is missing, write endpoints almost certainly are too.
  const writesDisabled = listPending;

  const togglePin = useMutation({
    mutationFn: (g: AccountGroup) => api.groups.togglePin(g.id, !g.is_pinned),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["groups.list.v3"] }),
    onError: (e: any) => {
      if (isPendingError(e)) {
        toast.error("Backend endpoint pending: PATCH /api/groups/:id");
      } else {
        toast.error(e?.message ?? "Could not pin group");
      }
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string | number) => api.groups.remove(id),
    onSuccess: () => {
      toast.success("Group deleted");
      qc.invalidateQueries({ queryKey: ["groups.list.v3"] });
      setDeleting(null);
    },
    onError: (e: any) => {
      if (isPendingError(e)) {
        toast.error("Backend endpoint pending: DELETE /api/groups/:id");
      } else {
        toast.error(e?.message ?? "Failed to delete");
      }
    },
  });

  const groupsEnvelope = groupsQ.data;
  const groups: AccountGroup[] = Array.isArray(groupsEnvelope)
    ? groupsEnvelope
    : Array.isArray((groupsEnvelope as any)?.items)
      ? ((groupsEnvelope as any).items as AccountGroup[])
      : [];

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
    const sumBalance = (g: AccountGroup) =>
      (g.totals_by_currency ?? []).reduce((s, t) => s + Number(t.total_minor ?? 0), 0);
    xs.sort((a, b) => {
      // Pinned cards always float to top
      if (a.is_pinned !== b.is_pinned) return a.is_pinned ? -1 : 1;
      if (sortKey === "newest") return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      if (sortKey === "name") return a.name.localeCompare(b.name);
      if (sortKey === "members") return (b.member_count ?? 0) - (a.member_count ?? 0);
      if (sortKey === "balance") return sumBalance(b) - sumBalance(a);
      return 0;
    });
    return xs;
  }, [groups, typeFilter, dq, sortKey]);

  const totalMembers = useMemo(() => groups.reduce((s, g) => s + (g.member_count ?? 0), 0), [groups]);
  const createdLast14d = useMemo(() => {
    const cutoff = Date.now() - 14 * 24 * 60 * 60 * 1000;
    return groups.filter((g) => new Date(g.created_at).getTime() >= cutoff).length;
  }, [groups]);

  // Aggregate managed balance — top currency across all groups
  const managedTotals = useMemo(() => {
    const m = new Map<string, number>();
    for (const g of groups) {
      for (const t of g.totals_by_currency ?? []) {
        m.set(t.currency, (m.get(t.currency) ?? 0) + Number(t.total_minor ?? 0));
      }
    }
    return Array.from(m.entries()).sort((a, b) => b[1] - a[1]);
  }, [groups]);

  return (
    <TooltipProvider delayDuration={150}>
    <div className="min-h-[calc(100vh-7rem)]">
      <div className="mx-auto max-w-7xl space-y-6 px-4 pt-6 pb-12 md:px-8 md:pt-8">
        {/* Header */}
        <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="mb-1 inline-flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5 text-gold" />
              <span className="text-[10px] font-medium uppercase tracking-[0.25em] text-gold">Organization</span>
            </div>
            <h1 className="font-playfair text-2xl font-semibold text-foreground">{t("groups.title")}</h1>
            <p className="mt-1.5 max-w-2xl text-sm text-muted-foreground">
              Organize holders into families, corporate groups, trusts, branches, and VIP tiers.
            </p>
          </div>
          {canMutate && (
            writesDisabled ? (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="self-start md:self-auto">
                    <Button variant="gold" disabled className="gap-2">
                      <Plus className="h-4 w-4" /> {t("groups.new")}
                    </Button>
                  </span>
                </TooltipTrigger>
                <TooltipContent>Backend endpoint pending</TooltipContent>
              </Tooltip>
            ) : (
              <Button variant="gold" className="gap-2 self-start md:self-auto" onClick={() => setCreating(true)}>
                <Plus className="h-4 w-4" /> New Group
              </Button>
            )
          )}
        </div>

        {/* KPI strip */}
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[
            { label: "Total Groups", value: groups.length.toString(), Icon: FolderTree },
            { label: "Unique Members", value: totalMembers.toLocaleString(), Icon: Users },
            canViewBalances && managedTotals[0]
              ? { label: "Combined Balance", value: `${formatCompactCurrency(managedTotals[0][1])} ${managedTotals[0][0]}`, Icon: TrendingUp }
              : { label: "Active Groups", value: groups.length.toString(), Icon: FolderOpen },
            { label: "Created (14d)", value: createdLast14d.toString(), Icon: Activity },
          ].map((k, i) => (
            <motion.div
              key={k.label}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.05 }}
            >
              <KpiCard label={k.label} value={k.value} icon={<k.Icon className="h-4 w-4" />} />
            </motion.div>
          ))}
        </div>

        {/* Filter bar */}
        <Card className="border-border bg-card/70 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
            {/* Search */}
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search groups by name or description..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-10 rounded-lg border-border bg-surface-2 pl-10 pr-9 text-sm focus-visible:border-gold focus-visible:ring-1 focus-visible:ring-gold/30"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch("")}
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-full text-muted-foreground hover:bg-gold/10 hover:text-foreground"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Type chips */}
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-none lg:flex-wrap lg:overflow-visible">
              <Filter className="h-4 w-4 shrink-0 text-muted-foreground" />
              <TypeChip active={typeFilter === "all"} onClick={() => setTypeFilter("all")} label="All" />
              {TYPE_ORDER.map((tk) => {
                const m = TYPE_META[tk];
                const c = groups.filter((g) => (g.group_type || "general") === tk).length;
                if (c === 0 && typeFilter !== tk) return null;
                return (
                  <TypeChip
                    key={tk}
                    active={typeFilter === tk}
                    onClick={() => setTypeFilter(tk)}
                    label={m.label}
                  />
                );
              })}
            </div>

            {/* Sort */}
            <div className="flex items-center gap-2">
              <ArrowUpDown className="h-4 w-4 shrink-0 text-muted-foreground" />
              <select
                value={sortKey}
                onChange={(e) => setSortKey(e.target.value as GroupSort)}
                className="rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-xs text-foreground focus:border-gold focus:outline-none focus:ring-1 focus:ring-gold/30"
              >
                <option value="name">Name (A→Z)</option>
                <option value="members">Most Members</option>
                <option value="balance">Highest Balance</option>
                <option value="newest">Recently Created</option>
              </select>
            </div>
          </div>
        </Card>

        {/* Cards grid / empty / pending states */}
        <div>
          {listPending ? (
            <BackendPending
              endpoint="GET /api/groups"
              note="Group list, create, update, delete and member endpoints are not enabled on the Lambda backend yet. The page will populate as soon as they ship."
            />
          ) : groupsQ.isLoading ? (
            <div className="rounded-2xl border border-gold/15 bg-card/40 p-10 text-center text-sm text-muted-foreground">
              Loading groups…
            </div>
          ) : groupsQ.error ? (
            <div className="rounded-2xl border border-destructive/30 bg-destructive/5 p-6 text-center text-sm text-destructive">
              {(groupsQ.error as any)?.message ?? "Failed to load groups"}
            </div>
          ) : groups.length === 0 ? (
            <EmptyZeroState canCreate={canMutate && !writesDisabled} onCreate={() => setCreating(true)} />
          ) : filtered.length === 0 ? (
            <EmptyFilteredState
              searchTerm={search}
              canCreate={canMutate && !writesDisabled && !search}
              onCreate={() => setCreating(true)}
              onClear={() => { setSearch(""); setTypeFilter("all"); }}
            />
          ) : (
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
              {filtered.map((g, i) => (
                <motion.div
                  key={String(g.id)}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                >
                  <GroupCard
                    g={g}
                    canMutate={canMutate}
                    canViewBalances={canViewBalances}
                    writesDisabled={writesDisabled}
                    onOpen={() => navigate({ to: "/app/groups/$id", params: { id: String(g.id) } })}
                    onEdit={() => setEditing(g)}
                    onDelete={() => setDeleting(g)}
                    onTogglePin={() => togglePin.mutate(g)}
                  />
                </motion.div>
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
          onCreated={(g) => {
            setCreating(false);
            setEditing(null);
            navigate({ to: "/app/groups/$id", params: { id: String(g.id) } });
          }}
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
    </TooltipProvider>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// KPI cards
// ────────────────────────────────────────────────────────────────────────────

function KpiCard({ label, value, icon }: { label: string; value: React.ReactNode; icon: React.ReactNode }) {
  return (
    <Card className="p-5">
      <div className="mb-3 flex items-start justify-between">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg border border-gold/20 bg-gold/10 text-gold">
          {icon}
        </div>
      </div>
      <p className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.15em] text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold tabular-nums text-foreground">{value}</p>
    </Card>
  );
}

function TypeChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "whitespace-nowrap rounded-lg border px-3 py-1.5 text-xs font-medium transition-all",
        active
          ? "border-gold/40 bg-gold/10 text-gold"
          : "border-border bg-surface-2 text-muted-foreground hover:border-gold/30 hover:text-foreground",
      )}
    >
      {label}
    </button>
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
  g, canMutate, canViewBalances, writesDisabled, onOpen, onEdit, onDelete, onTogglePin,
}: {
  g: AccountGroup;
  canMutate: boolean; canViewBalances: boolean; writesDisabled: boolean;
  onOpen: () => void; onEdit: () => void; onDelete: () => void; onTogglePin: () => void;
}) {
  const meta = metaFor(g.group_type);
  const totals = (g.totals_by_currency ?? [])
    .map((t) => ({ currency: t.currency, balance: Number(t.total_minor ?? 0) }))
    .sort((a, b) => b.balance - a.balance);
  const visibleTotals = totals.slice(0, 3);
  const overflow = Math.max(0, totals.length - 3);
  const accountCount = g.member_count ?? 0;
  const lydEntry = totals.find((b) => b.currency === "LYD");
  const lydTotal = lydEntry?.balance ?? 0;

  // Avatars derived from member_count (no member objects on AccountGroup type)
  const avatarSlots = Math.min(accountCount, 4);
  const avatarOverflow = Math.max(0, accountCount - 4);

  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } }}
      className={cn(
        "group relative flex cursor-pointer flex-col rounded-xl border bg-card/70 p-5 outline-none transition-all duration-300 focus-visible:ring-2 focus-visible:ring-gold/40",
        g.is_pinned
          ? cn("border-gold/40", meta.glow)
          : "border-border hover:border-gold/30 hover:shadow-[0_0_20px_rgba(212,168,87,0.08)]",
      )}
    >
      {/* Top row */}
      <div className="mb-4 flex items-start justify-between">
        <div className={cn("flex h-11 w-11 items-center justify-center rounded-xl border", meta.bg, meta.border)}>
          <meta.Icon className={cn("h-5 w-5", meta.tone)} />
        </div>
        <div className="relative flex items-center gap-1">
          {canMutate && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  disabled={writesDisabled}
                  onClick={(e) => { e.stopPropagation(); if (!writesDisabled) onTogglePin(); }}
                  aria-label={g.is_pinned ? "Unpin group" : "Pin group"}
                  className={cn(
                    "rounded-lg p-1.5 transition-all disabled:cursor-not-allowed disabled:opacity-40",
                    g.is_pinned
                      ? "text-gold"
                      : "text-muted-foreground opacity-0 hover:text-gold group-hover:opacity-100",
                  )}
                >
                  {g.is_pinned ? <Star className="h-4 w-4 fill-current" /> : <StarOff className="h-4 w-4" />}
                </button>
              </TooltipTrigger>
              <TooltipContent>{writesDisabled ? "Backend endpoint pending" : g.is_pinned ? "Unpin" : "Pin"}</TooltipContent>
            </Tooltip>
          )}
          {canMutate && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); setMenuOpen((o) => !o); }}
              className="rounded-lg p-1.5 text-muted-foreground opacity-0 transition-opacity hover:bg-gold/10 hover:text-gold focus:opacity-100 group-hover:opacity-100"
              aria-label="Group actions"
            >
              <MoreVertical className="h-4 w-4" />
            </button>
          )}

          <AnimatePresence>
            {menuOpen && (
              <>
                <div
                  className="fixed inset-0 z-30"
                  onClick={(e) => { e.stopPropagation(); setMenuOpen(false); }}
                />
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className="absolute right-0 top-full z-40 mt-1 w-40 overflow-hidden rounded-lg border border-border bg-surface-2 shadow-2xl"
                  onClick={(e) => e.stopPropagation()}
                >
                  <button
                    type="button"
                    disabled={writesDisabled}
                    onClick={(e) => { e.stopPropagation(); setMenuOpen(false); if (!writesDisabled) onEdit(); }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-foreground hover:bg-gold/10 hover:text-gold disabled:opacity-40"
                  >
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </button>
                  <button
                    type="button"
                    disabled={writesDisabled}
                    onClick={(e) => { e.stopPropagation(); setMenuOpen(false); if (!writesDisabled) onDelete(); }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-rose-400 hover:bg-rose-500/10 disabled:opacity-40"
                  >
                    <Trash2 className="h-3.5 w-3.5" /> Delete
                  </button>
                </motion.div>
              </>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Name + type pill + description */}
      <h3 className="truncate text-lg font-semibold text-foreground">{g.name}</h3>
      <div className="mb-3 mt-1">
        <span className={cn(
          "inline-flex items-center rounded px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider border",
          meta.pillBg, meta.pillBorder, meta.pillText,
        )}>
          {meta.label}
        </span>
      </div>
      <p className="mb-4 line-clamp-2 min-h-[32px] text-xs leading-relaxed text-muted-foreground">
        {g.description || "No description provided."}
      </p>

      {/* Member avatars row */}
      <div className="mb-4 flex items-center justify-between">
        {avatarSlots === 0 ? (
          <span className="text-xs italic text-muted-foreground/70">No members yet</span>
        ) : (
          <div className="flex -space-x-2">
            {Array.from({ length: avatarSlots }).map((_, i) => (
              <div
                key={i}
                style={{ zIndex: 10 - i }}
                className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-card bg-surface-2 text-[10px] font-semibold text-gold"
              >
                {String.fromCharCode(65 + i)}
              </div>
            ))}
            {avatarOverflow > 0 && (
              <div className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-card bg-surface-2 text-[10px] font-semibold text-muted-foreground">
                +{avatarOverflow}
              </div>
            )}
          </div>
        )}
        <span className="text-xs text-muted-foreground">
          {accountCount} member{accountCount === 1 ? "" : "s"}
        </span>
      </div>

      {/* Currency breakdown strip */}
      {canViewBalances && (totals.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border bg-surface-2/50 p-3 text-center text-[10px] italic text-muted-foreground/70">
          No accounts in this group yet
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-surface-2/50">
          <div className="flex items-center justify-between border-b border-border bg-surface-2/40 px-3 py-2">
            <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Balances · 30d Activity
            </span>
            <span className="text-[10px] tabular-nums text-muted-foreground">
              {accountCount} acct{accountCount === 1 ? "" : "s"}
            </span>
          </div>
          <div className="divide-y divide-border/60">
            {visibleTotals.map((b) => (
              <div key={b.currency} className="flex items-center gap-3 px-3 py-2">
                <CurrencyBadge currency={b.currency} />
                <span className="flex-1 truncate text-sm font-semibold tabular-nums text-foreground">
                  {formatCompactCurrency(b.balance, b.currency)}
                </span>
              </div>
            ))}
          </div>
          {overflow > 0 && (
            <div className="px-3 py-1.5 text-center text-[10px] text-muted-foreground">
              + {overflow} more currenc{overflow === 1 ? "y" : "ies"}
            </div>
          )}
        </div>
      ))}

      {/* Footer */}
      <div className="mt-4 flex items-end justify-between border-t border-border pt-3">
        <div>
          <div className="mb-0.5 text-[10px] uppercase tracking-wider text-muted-foreground">
            LYD Equivalent
          </div>
          <div className="text-sm font-semibold tabular-nums text-foreground">
            {lydTotal.toLocaleString(undefined, { maximumFractionDigits: 2 })} LYD
          </div>
        </div>
        <span className="flex items-center gap-1 text-xs font-medium text-gold">
          View accounts
          <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Empty states
// ────────────────────────────────────────────────────────────────────────────

function EmptyZeroState({ canCreate, onCreate }: { canCreate: boolean; onCreate: () => void }) {
  return (
    <Card className="p-12">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-gold/30 bg-gold/10 text-gold">
          <Layers className="h-6 w-6" />
        </div>
        <div className="max-w-md">
          <h3 className="font-playfair text-xl font-semibold text-foreground">No groups found</h3>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Get started by creating your first group.
          </p>
        </div>
        {canCreate && (
          <Button variant="gold" onClick={onCreate} className="gap-2">
            <Plus className="h-4 w-4" /> Create Group
          </Button>
        )}
      </div>
    </Card>
  );
}

function EmptyFilteredState({
  searchTerm, canCreate, onCreate, onClear,
}: { searchTerm: string; canCreate: boolean; onCreate: () => void; onClear: () => void }) {
  return (
    <Card className="p-12">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="flex h-11 w-11 items-center justify-center rounded-full border border-border bg-surface-2 text-muted-foreground">
          <Search className="h-5 w-5" />
        </div>
        <div>
          <div className="text-base font-medium text-foreground">No groups found</div>
          <p className="mt-1 text-sm text-muted-foreground">
            {searchTerm
              ? `No groups match "${searchTerm}". Try a different search.`
              : "Get started by creating your first group."}
          </p>
        </div>
        {canCreate ? (
          <Button variant="gold" onClick={onCreate} className="gap-2">
            <Plus className="h-4 w-4" /> Create Group
          </Button>
        ) : (
          <Button variant="outline" size="sm" onClick={onClear} className="gap-2 border-gold/20">
            <FilterX className="h-3.5 w-3.5" /> Clear filters
          </Button>
        )}
      </div>
    </Card>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Create / Edit modal
// ────────────────────────────────────────────────────────────────────────────

function GroupModal({
  mode, group, onClose, onCreated,
}: { mode: "create" | "edit"; group: AccountGroup | null; onClose: () => void; onCreated?: (g: AccountGroup) => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(group?.name ?? "");
  const [description, setDescription] = useState(group?.description ?? "");
  const [type, setType] = useState<GroupType>((group?.group_type as GroupType) || "general");
  const [pendingNotice, setPendingNotice] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error("Name is required");
      if (mode === "create") {
        return api.groups.create({
          name: trimmed,
          description: description.trim() || null,
          group_type: type,
          is_pinned: false,
        });
      } else if (group) {
        return api.groups.update(group.id, {
          name: trimmed,
          description: description.trim() || null,
          group_type: type,
        });
      }
      return null;
    },
    onSuccess: (result) => {
      toast.success(mode === "create" ? "Group created" : "Group updated");
      qc.invalidateQueries({ queryKey: ["groups.list.v3"] });
      qc.invalidateQueries({ queryKey: ["group.detail"] });
      if (mode === "create" && result && onCreated) {
        onCreated(result as AccountGroup);
      } else {
        onClose();
      }
    },
    onError: (e: any) => {
      if (isPendingError(e)) {
        const ep = mode === "create" ? "POST /api/groups" : "PATCH /api/groups/:id";
        setPendingNotice(ep);
        toast.error(`Backend endpoint pending: ${ep}`);
      } else {
        toast.error(e?.message ?? "Failed");
      }
    },
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

        {pendingNotice && (
          <BackendPending
            endpoint={pendingNotice}
            note="The backend has not enabled this write endpoint yet. Your input was not saved."
          />
        )}

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
            onClick={() => { setPendingNotice(null); save.mutate(); }}
          >
            {save.isPending ? "Saving…" : mode === "create" ? "Create Group" : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
