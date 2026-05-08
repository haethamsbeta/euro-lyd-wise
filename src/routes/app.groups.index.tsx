import { createFileRoute } from "@tanstack/react-router";
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
  Sheet, SheetContent,
} from "@/components/ui/sheet";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import {
  Layers, Plus, Search, X, Star, Pin, MoreVertical, Pencil, Trash2, Users, Activity,
  Briefcase, Home, TrendingUp, PiggyBank, Building2, Crown, Sparkles, ArrowRight,
  ChevronDown, FolderOpen, FilterX, ShieldAlert,
} from "lucide-react";
import { useAuth, hasAnyRole } from "@/lib/auth";
import { useDebounced } from "@/hooks/use-debounced";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/groups/")({
  component: GroupsPage,
  head: () => ({ meta: [{ title: "Groups" }] }),
});

// ────────────────────────────────────────────────────────────────────────────
// TYPE_META — themed visual identity per group type
// ────────────────────────────────────────────────────────────────────────────

type GroupType = "general" | "family" | "business" | "investment" | "savings" | "corporate" | "vip";

const TYPE_META: Record<GroupType, {
  label: string;
  Icon: React.ComponentType<{ className?: string }>;
  tone: string;       // text color util
  bg: string;         // bg fill util
  border: string;     // border util
  glow: string;       // shadow util applied when pinned
  pillBg: string;
  pillBorder: string;
  pillText: string;
}> = {
  general: {
    label: "General",
    Icon: FolderOpen,
    tone: "text-gold",
    bg: "bg-gold/10",
    border: "border-gold/30",
    glow: "shadow-[0_0_0_3px_oklch(from_var(--gold)_l_c_h/0.10),0_18px_48px_-22px_var(--gold)]",
    pillBg: "bg-gold/10", pillBorder: "border-gold/30", pillText: "text-gold",
  },
  family: {
    label: "Family",
    Icon: Home,
    tone: "text-rose-300",
    bg: "bg-rose-400/10",
    border: "border-rose-400/30",
    glow: "shadow-[0_0_0_3px_rgba(251,113,133,0.10),0_18px_48px_-22px_rgba(251,113,133,0.55)]",
    pillBg: "bg-rose-400/10", pillBorder: "border-rose-400/30", pillText: "text-rose-300",
  },
  business: {
    label: "Business",
    Icon: Briefcase,
    tone: "text-sky-300",
    bg: "bg-sky-400/10",
    border: "border-sky-400/30",
    glow: "shadow-[0_0_0_3px_rgba(56,189,248,0.10),0_18px_48px_-22px_rgba(56,189,248,0.55)]",
    pillBg: "bg-sky-400/10", pillBorder: "border-sky-400/30", pillText: "text-sky-300",
  },
  investment: {
    label: "Investment",
    Icon: TrendingUp,
    tone: "text-emerald-300",
    bg: "bg-emerald-400/10",
    border: "border-emerald-400/30",
    glow: "shadow-[0_0_0_3px_rgba(52,211,153,0.10),0_18px_48px_-22px_rgba(52,211,153,0.55)]",
    pillBg: "bg-emerald-400/10", pillBorder: "border-emerald-400/30", pillText: "text-emerald-300",
  },
  savings: {
    label: "Savings",
    Icon: PiggyBank,
    tone: "text-amber-300",
    bg: "bg-amber-400/10",
    border: "border-amber-400/30",
    glow: "shadow-[0_0_0_3px_rgba(251,191,36,0.10),0_18px_48px_-22px_rgba(251,191,36,0.55)]",
    pillBg: "bg-amber-400/10", pillBorder: "border-amber-400/30", pillText: "text-amber-300",
  },
  corporate: {
    label: "Corporate",
    Icon: Building2,
    tone: "text-indigo-300",
    bg: "bg-indigo-400/10",
    border: "border-indigo-400/30",
    glow: "shadow-[0_0_0_3px_rgba(129,140,248,0.10),0_18px_48px_-22px_rgba(129,140,248,0.55)]",
    pillBg: "bg-indigo-400/10", pillBorder: "border-indigo-400/30", pillText: "text-indigo-300",
  },
  vip: {
    label: "VIP",
    Icon: Crown,
    tone: "text-fuchsia-300",
    bg: "bg-fuchsia-400/10",
    border: "border-fuchsia-400/30",
    glow: "shadow-[0_0_0_3px_rgba(232,121,249,0.10),0_18px_48px_-22px_rgba(232,121,249,0.55)]",
    pillBg: "bg-fuchsia-400/10", pillBorder: "border-fuchsia-400/30", pillText: "text-fuchsia-300",
  },
};

const TYPE_ORDER: GroupType[] = ["general", "family", "business", "investment", "savings", "corporate", "vip"];

function metaFor(t: string | null | undefined) {
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

type MemberRow = {
  holder_account_id: number;
  added_at: string;
  account_number: string;
  currency_code: string;
  current_balance: number;
  account_holder_id: number;
  holder_name: string;
  dahab_account_number: string | null;
};

type Totals = {
  currency: string;
  total_debits: number;
  total_credits: number;
  total_balance: number;
  account_count: number;
};

type SortKey = "pinned" | "newest" | "name" | "members";

// ────────────────────────────────────────────────────────────────────────────
// Page
// ────────────────────────────────────────────────────────────────────────────

function GroupsPage() {
  const { roles } = useAuth();
  const isAdmin = hasAnyRole(roles, ["admin"]);
  const isAuditor = hasAnyRole(roles, ["auditor"]) && !isAdmin;
  const canMutate = isAdmin; // Auditor is read-only
  const canViewBalances = isAdmin;
  const qc = useQueryClient();

  const [search, setSearch] = useState("");
  const dq = useDebounced(search, 200).trim().toLowerCase();
  const [typeFilter, setTypeFilter] = useState<"all" | GroupType>("all");
  const [sortKey, setSortKey] = useState<SortKey>("pinned");

  const [openId, setOpenId] = useState<number | null>(null);
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

  const memberCountsQ = useQuery({
    queryKey: ["groups.member-counts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("account_group_members")
        .select("group_id");
      if (error) throw error;
      const map = new Map<number, number>();
      for (const r of (data ?? []) as { group_id: number }[]) {
        map.set(r.group_id, (map.get(r.group_id) ?? 0) + 1);
      }
      return map;
    },
  });

  const togglePin = useMutation({
    mutationFn: async (g: GroupRow) => {
      const { error } = await supabase
        .from("account_groups")
        .update({ is_pinned: !g.is_pinned })
        .eq("id", g.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["groups.list.v2"] }),
    onError: (e: any) => toast.error(e?.message ?? "Could not pin group"),
  });

  const deleteMut = useMutation({
    mutationFn: async (id: number) => {
      // Members FK: account_group_members.group_id has no cascade; clean first.
      await supabase.from("account_group_members").delete().eq("group_id", id);
      const { error } = await supabase.from("account_groups").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Group deleted");
      qc.invalidateQueries({ queryKey: ["groups.list.v2"] });
      qc.invalidateQueries({ queryKey: ["groups.member-counts"] });
      setDeleting(null);
      if (openId && deleting?.id === openId) setOpenId(null);
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to delete"),
  });

  const groups = groupsQ.data ?? [];
  const counts = memberCountsQ.data ?? new Map<number, number>();

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
      if (sortKey === "members") return (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0);
      return 0;
    });
    return xs;
  }, [groups, typeFilter, dq, sortKey, counts]);

  const totalMembers = useMemo(() => Array.from(counts.values()).reduce((s, n) => s + n, 0), [counts]);
  const pinnedCount = groups.filter((g) => g.is_pinned).length;
  const filtersActive = !!dq || typeFilter !== "all";

  const opened = openId ? groups.find((g) => g.id === openId) ?? null : null;

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
            <BalanceKpi groupIds={groups.map((g) => g.id)} />
          ) : (
            <KpiCard
              label="Active Groups"
              value={groups.length}
              icon={<FolderOpen className="h-4 w-4" />}
            />
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
                  memberCount={counts.get(g.id) ?? 0}
                  canMutate={canMutate}
                  canViewBalances={canViewBalances}
                  onOpen={() => setOpenId(g.id)}
                  onEdit={() => setEditing(g)}
                  onDelete={() => setDeleting(g)}
                  onTogglePin={() => togglePin.mutate(g)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Drawer */}
      <Sheet open={!!opened} onOpenChange={(v) => !v && setOpenId(null)}>
        <SheetContent side="right" className="w-full overflow-y-auto border-gold/20 bg-card p-0 sm:max-w-xl">
          {opened && (
            <GroupDrawer
              group={opened}
              canMutate={canMutate}
              canViewBalances={canViewBalances}
              onEdit={() => setEditing(opened)}
              onDelete={() => setDeleting(opened)}
              onTogglePin={() => togglePin.mutate(opened)}
            />
          )}
        </SheetContent>
      </Sheet>

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

      {/* Read-only hint */}
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

function BalanceKpi({ groupIds }: { groupIds: number[] }) {
  const q = useQuery({
    queryKey: ["groups.balance-kpi", groupIds.join(",")],
    enabled: groupIds.length > 0,
    queryFn: async () => {
      const out: Record<string, number> = {};
      const results = await Promise.all(
        groupIds.map((id) => supabase.rpc("get_group_totals", { p_group_id: id })),
      );
      for (const { data } of results) {
        for (const t of (data ?? []) as Totals[]) {
          out[t.currency] = (out[t.currency] ?? 0) + Number(t.total_balance ?? 0);
        }
      }
      return out;
    },
  });
  const totals = q.data ?? {};
  const entries = Object.entries(totals).filter(([, v]) => v !== 0);
  const top = entries[0];
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
      {entries.length > 1 && (
        <div className="mt-1 truncate text-[11px] text-muted-foreground">
          + {entries.slice(1).map(([c, v]) => `${v.toLocaleString()} ${c}`).join(" · ")}
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
  g, memberCount, canMutate, canViewBalances, onOpen, onEdit, onDelete, onTogglePin,
}: {
  g: GroupRow; memberCount: number; canMutate: boolean; canViewBalances: boolean;
  onOpen: () => void; onEdit: () => void; onDelete: () => void; onTogglePin: () => void;
}) {
  const meta = metaFor(g.group_type);
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
              <DropdownMenuContent align="end" className="border-gold/20">
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

      {/* Members */}
      <div className="flex items-center justify-between border-t border-gold/10 pt-3">
        <MemberAvatars groupId={g.id} count={memberCount} />
        <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-gold" />
      </div>

      {/* Balance footer (admin only) or safe metadata */}
      {canViewBalances ? (
        <GroupBalanceFooter groupId={g.id} />
      ) : (
        <div className="rounded-lg border border-gold/10 bg-surface-2/50 px-3 py-2 text-[11px] text-muted-foreground">
          {memberCount} member{memberCount === 1 ? "" : "s"}
        </div>
      )}
    </div>
  );
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

function GroupBalanceFooter({ groupId }: { groupId: number }) {
  const q = useQuery({
    queryKey: ["group-totals", groupId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_group_totals", { p_group_id: groupId });
      if (error) throw error;
      return (data ?? []) as Totals[];
    },
  });
  const totals = q.data ?? [];
  if (totals.length === 0) {
    return <div className="rounded-lg border border-gold/10 bg-surface-2/50 px-3 py-2 text-[11px] text-muted-foreground">No balances</div>;
  }
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {totals.slice(0, 3).map((t) => (
        <div key={t.currency} className="rounded-lg border border-gold/15 bg-surface-2/60 px-2 py-1.5 text-center">
          <div className="text-[9px] uppercase tracking-wider text-gold/80">{t.currency}</div>
          <div className="mt-0.5 font-mono text-[11px] font-semibold tabular-nums text-foreground">
            {Number(t.total_balance ?? 0).toLocaleString()}
          </div>
        </div>
      ))}
    </div>
  );
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
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
// Detail drawer
// ────────────────────────────────────────────────────────────────────────────

function GroupDrawer({
  group, canMutate, canViewBalances, onEdit, onDelete, onTogglePin,
}: {
  group: GroupRow; canMutate: boolean; canViewBalances: boolean;
  onEdit: () => void; onDelete: () => void; onTogglePin: () => void;
}) {
  const meta = metaFor(group.group_type);
  const qc = useQueryClient();

  const membersQ = useQuery({
    queryKey: ["group", group.id, "members.v2"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("account_group_members")
        .select("holder_account_id, added_at, holder_accounts!inner(id,account_number,currency_code,current_balance,account_holder_id,dahab_account_number,account_holders!inner(id,canonical_name,dahab_account_number))")
        .eq("group_id", group.id);
      if (error) throw error;
      return (data ?? []).map((m: any) => {
        const a = m.holder_accounts;
        const h = a?.account_holders;
        return {
          holder_account_id: m.holder_account_id,
          added_at: m.added_at,
          account_number: a?.account_number ?? "",
          currency_code: a?.currency_code ?? "",
          current_balance: Number(a?.current_balance ?? 0),
          account_holder_id: a?.account_holder_id,
          holder_name: h?.canonical_name ?? "",
          dahab_account_number: h?.dahab_account_number ?? a?.dahab_account_number ?? null,
        } as MemberRow;
      });
    },
  });

  const totalsQ = useQuery({
    queryKey: ["group-totals", group.id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_group_totals", { p_group_id: group.id });
      if (error) throw error;
      return (data ?? []) as Totals[];
    },
  });

  const removeMember = useMutation({
    mutationFn: async (holderAccountId: number) => {
      const { error } = await supabase
        .from("account_group_members")
        .delete()
        .eq("group_id", group.id)
        .eq("holder_account_id", holderAccountId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["group", group.id, "members.v2"] });
      qc.invalidateQueries({ queryKey: ["group-totals", group.id] });
      qc.invalidateQueries({ queryKey: ["groups.member-counts"] });
      qc.invalidateQueries({ queryKey: ["group.preview-members", group.id] });
      toast.success("Member removed");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const members = membersQ.data ?? [];
  const totals = totalsQ.data ?? [];

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="border-b border-gold/15 p-6">
        <div className="flex items-start gap-4">
          <div className={cn("flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border", meta.bg, meta.border, meta.tone)}>
            <meta.Icon className="h-6 w-6" />
          </div>
          <div className="min-w-0 flex-1">
            <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider", meta.pillBg, meta.pillBorder, meta.pillText)}>
              <meta.Icon className="h-3 w-3" />
              {meta.label}
            </span>
            <h2 className="mt-1.5 font-playfair text-2xl font-semibold text-foreground">{group.name}</h2>
            {group.description && (
              <p className="mt-1 text-sm text-muted-foreground">{group.description}</p>
            )}
          </div>
        </div>
        {canMutate && (
          <div className="mt-4 flex flex-wrap gap-2">
            <Button size="sm" variant="outline" className="border-gold/20" onClick={onTogglePin}>
              <Star className={cn("h-3.5 w-3.5", group.is_pinned && "fill-gold text-gold")} />
              {group.is_pinned ? "Pinned" : "Pin"}
            </Button>
            <Button size="sm" variant="outline" className="border-gold/20" onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5" /> Edit
            </Button>
            <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={onDelete}>
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </Button>
          </div>
        )}
      </div>

      {/* Mini KPIs */}
      <div className="grid grid-cols-3 gap-2 border-b border-gold/10 p-4">
        <MiniKpi label="Members" value={members.length} icon={<Users className="h-3.5 w-3.5" />} />
        <MiniKpi label="Currencies" value={totals.length} icon={<Layers className="h-3.5 w-3.5" />} />
        {canViewBalances ? (
          <MiniKpi
            label="Balance"
            value={
              totals.length === 0
                ? "—"
                : `${Number(totals[0].total_balance).toLocaleString()} ${totals[0].currency}${totals.length > 1 ? "+" : ""}`
            }
            icon={<Sparkles className="h-3.5 w-3.5" />}
          />
        ) : (
          <MiniKpi label="Created" value={new Date(group.created_at).toLocaleDateString()} icon={<Activity className="h-3.5 w-3.5" />} />
        )}
      </div>

      {/* Tabs */}
      <Tabs defaultValue="members" className="flex flex-1 flex-col overflow-hidden">
        <TabsList className="mx-4 mt-4 grid w-auto grid-cols-2 bg-surface-2">
          <TabsTrigger value="members" className="data-[state=active]:bg-gold/10 data-[state=active]:text-gold">
            <Users className="h-3.5 w-3.5" /> Members
          </TabsTrigger>
          <TabsTrigger value="activity" className="data-[state=active]:bg-gold/10 data-[state=active]:text-gold">
            <Activity className="h-3.5 w-3.5" /> Activity
          </TabsTrigger>
        </TabsList>

        <TabsContent value="members" className="flex-1 overflow-y-auto p-4">
          {canMutate && (
            <div className="mb-3">
              <AddMemberAutocomplete
                groupId={group.id}
                existing={new Set(members.map((m) => m.holder_account_id))}
                onAdded={() => {
                  qc.invalidateQueries({ queryKey: ["group", group.id, "members.v2"] });
                  qc.invalidateQueries({ queryKey: ["group-totals", group.id] });
                  qc.invalidateQueries({ queryKey: ["groups.member-counts"] });
                  qc.invalidateQueries({ queryKey: ["group.preview-members", group.id] });
                }}
              />
            </div>
          )}
          {members.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gold/15 bg-card/30 p-8 text-center text-sm text-muted-foreground">
              No members yet.
            </div>
          ) : (
            <ul className="space-y-2">
              {members.map((m) => (
                <li key={m.holder_account_id} className="flex items-center gap-3 rounded-xl border border-gold/10 bg-card/60 p-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-gold/30 to-gold/10 text-xs font-semibold text-gold">
                    {initials(m.holder_name)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-foreground">{m.holder_name}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
                      {m.dahab_account_number && <span className="font-mono text-gold">{m.dahab_account_number}</span>}
                      <span className="font-mono">#{m.account_number}</span>
                      <span>{m.currency_code}</span>
                    </div>
                  </div>
                  {canViewBalances && (
                    <span className="font-mono text-xs tabular-nums text-foreground">
                      {m.current_balance.toLocaleString()}
                    </span>
                  )}
                  {canMutate && (
                    <button
                      type="button"
                      onClick={() => removeMember.mutate(m.holder_account_id)}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      aria-label="Remove member"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </TabsContent>

        <TabsContent value="activity" className="flex-1 overflow-y-auto p-4">
          <ActivityList groupId={group.id} createdAt={group.created_at} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function MiniKpi({ label, value, icon }: { label: string; value: React.ReactNode; icon: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-gold/10 bg-card/60 p-3">
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
        <span className="text-gold">{icon}</span>
        {label}
      </div>
      <div className="mt-1 font-mono text-sm font-semibold tabular-nums text-foreground">{value}</div>
    </div>
  );
}

function ActivityList({ groupId, createdAt }: { groupId: number; createdAt: string }) {
  // Pull recent member additions as the only real activity available without
  // a dedicated audit table for groups. Avoid inventing fake history.
  const q = useQuery({
    queryKey: ["group.activity", groupId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("account_group_members")
        .select("added_at, holder_accounts!inner(account_holders!inner(canonical_name))")
        .eq("group_id", groupId)
        .order("added_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        at: r.added_at as string,
        name: r.holder_accounts?.account_holders?.canonical_name ?? "Unknown",
      }));
    },
  });
  const events = q.data ?? [];
  const all = [
    { at: createdAt, label: "Group created", icon: <Sparkles className="h-3.5 w-3.5 text-gold" /> },
    ...events.map((e) => ({ at: e.at, label: `${e.name} added to group`, icon: <Plus className="h-3.5 w-3.5 text-emerald-400" /> })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  if (all.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gold/15 bg-card/30 p-8 text-center text-sm text-muted-foreground">
        No activity recorded for this group.
      </div>
    );
  }
  return (
    <ol className="space-y-2">
      {all.map((e, i) => (
        <li key={i} className="flex items-start gap-3 rounded-xl border border-gold/10 bg-card/60 p-3">
          <span className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-full border border-gold/15 bg-surface-2">
            {e.icon}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-sm text-foreground">{e.label}</div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">{new Date(e.at).toLocaleString()}</div>
          </div>
        </li>
      ))}
    </ol>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Add member autocomplete
// ────────────────────────────────────────────────────────────────────────────

function AddMemberAutocomplete({
  groupId, existing, onAdded,
}: {
  groupId: number; existing: Set<number>; onAdded: () => void;
}) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const dq = useDebounced(q, 200);
  const search = useQuery({
    queryKey: ["group.add-search", groupId, dq, existing.size],
    enabled: dq.trim().length >= 1,
    queryFn: async () => {
      const term = dq.trim();
      let qb = supabase
        .from("holder_accounts")
        .select("id,account_number,currency_code,dahab_account_number,account_holders!inner(canonical_name,dahab_account_number)")
        .limit(8);
      if (term) qb = qb.or(`account_number.ilike.%${term}%,dahab_account_number.ilike.%${term}%`);
      const { data, error } = await qb;
      if (error) throw error;
      return (data ?? []).filter((r: any) => !existing.has(r.id));
    },
  });

  const add = useMutation({
    mutationFn: async (holderAccountId: number) => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("account_group_members")
        .upsert(
          { group_id: groupId, holder_account_id: holderAccountId, added_by: u.user?.id ?? null },
          { onConflict: "group_id,holder_account_id", ignoreDuplicates: true },
        );
      if (error) throw error;
    },
    onSuccess: () => { setQ(""); setOpen(false); onAdded(); toast.success("Member added"); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const results = (search.data ?? []) as any[];

  return (
    <div className="relative">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Add member by account # or DAHAB #…"
          value={q}
          onChange={(e) => { setQ(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          className="h-10 rounded-xl border-gold/20 bg-card/60 pl-10 focus-visible:ring-gold/40"
        />
      </div>
      {open && q.trim().length >= 1 && (
        <div className="absolute z-30 mt-1 w-full overflow-hidden rounded-xl border border-gold/20 bg-card shadow-xl">
          {search.isFetching ? (
            <div className="px-3 py-3 text-xs text-muted-foreground">Searching…</div>
          ) : results.length === 0 ? (
            <div className="px-3 py-3 text-xs text-muted-foreground">No matching accounts.</div>
          ) : (
            <ul className="max-h-64 overflow-y-auto">
              {results.map((r: any) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => add.mutate(r.id)}
                    className="flex w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-gold/5"
                  >
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-gold/30 to-gold/10 text-[10px] font-semibold text-gold">
                      {initials(r.account_holders?.canonical_name ?? "?")}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-foreground">{r.account_holders?.canonical_name}</span>
                      <span className="block font-mono text-[11px] text-muted-foreground">
                        {r.account_holders?.dahab_account_number ?? r.dahab_account_number ?? "—"} · #{r.account_number} · {r.currency_code}
                      </span>
                    </span>
                    <Plus className="h-4 w-4 text-gold" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
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
            Choose a type and add a clear name. You can manage members from the group's detail drawer.
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

          {mode === "edit" && group && (
            <div className="rounded-xl border border-gold/10 bg-surface-2/50 px-3 py-2 text-[11px] text-muted-foreground">
              To add or remove members, save and use the group's detail drawer.
            </div>
          )}
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
