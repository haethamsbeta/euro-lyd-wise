import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
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
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  ArrowLeft, ArrowUp, ArrowDown, Star, Pencil, Trash2, Search, Users, Wallet,
  Activity, ShieldAlert, Sparkles, Plus, X, Pin, Layers,
} from "lucide-react";
import { useAuth, hasAnyRole } from "@/lib/auth";
import { useDebounced } from "@/hooks/use-debounced";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { TYPE_META, metaFor, initials, type GroupType } from "./app.groups.index";

export const Route = createFileRoute("/app/groups/$id")({
  component: GroupDetailPage,
  head: () => ({ meta: [{ title: "Group" }] }),
});

const TYPE_ORDER: GroupType[] = ["general", "family", "business", "investment", "savings", "corporate", "vip"];

type GroupRow = {
  id: number; name: string; description: string | null;
  group_type: string; is_pinned: boolean;
  created_at: string; updated_at: string;
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
  status: string;
  account_display_name: string | null;
};

type CurrencyAgg = {
  currency: string;
  balance: number;
  credits30d: number;
  debits30d: number;
  tx30d: number;
  accountCount: number;
};

function GroupDetailPage() {
  const { id } = Route.useParams();
  const groupId = Number(id);
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { roles } = useAuth();
  const isAdmin = hasAnyRole(roles, ["admin"]);
  const canMutate = isAdmin;
  const canViewBalances = isAdmin;

  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const groupQ = useQuery({
    queryKey: ["group.detail", groupId],
    enabled: Number.isFinite(groupId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("account_groups")
        .select("id,name,description,group_type,is_pinned,created_at,updated_at")
        .eq("id", groupId)
        .maybeSingle();
      if (error) throw error;
      return data as GroupRow | null;
    },
  });

  const membersQ = useQuery({
    queryKey: ["group.detail.members", groupId],
    enabled: Number.isFinite(groupId),
    queryFn: async () => {
      const { data, error } = await supabase
        .from("account_group_members")
        .select("holder_account_id, added_at, holder_accounts!inner(id,account_number,currency_code,current_balance,account_holder_id,dahab_account_number,status,account_display_name,account_holders!inner(id,canonical_name,dahab_account_number))")
        .eq("group_id", groupId);
      if (error) throw error;
      return (data ?? []).map((m: any): MemberRow => {
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
          status: a?.status ?? "ACTIVE",
          account_display_name: a?.account_display_name ?? null,
        };
      });
    },
  });

  const accountIds = useMemo(() => (membersQ.data ?? []).map((m) => m.holder_account_id), [membersQ.data]);

  const activityQ = useQuery({
    queryKey: ["group.detail.activity30d", groupId, accountIds.length],
    enabled: accountIds.length > 0,
    queryFn: async () => {
      const since = new Date(Date.now() - 30 * 86400_000).toISOString();
      const { data, error } = await supabase
        .from("holder_ledger_entries")
        .select("account_id,currency_code,debit_amount,credit_amount,posted_at")
        .in("account_id", accountIds)
        .gte("posted_at", since)
        .limit(10000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const recentQ = useQuery({
    queryKey: ["group.detail.recent", groupId, accountIds.length],
    enabled: accountIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("holder_ledger_entries")
        .select("id,account_id,currency_code,debit_amount,credit_amount,description,posted_at,tx_number")
        .in("account_id", accountIds)
        .order("posted_at", { ascending: false })
        .limit(15);
      if (error) throw error;
      return data ?? [];
    },
  });

  const togglePin = useMutation({
    mutationFn: async () => {
      if (!groupQ.data) return;
      const { error } = await supabase.from("account_groups").update({ is_pinned: !groupQ.data.is_pinned }).eq("id", groupId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["group.detail", groupId] });
      qc.invalidateQueries({ queryKey: ["groups.list.v2"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const deleteMut = useMutation({
    mutationFn: async () => {
      await supabase.from("account_group_members").delete().eq("group_id", groupId);
      const { error } = await supabase.from("account_groups").delete().eq("id", groupId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Group deleted");
      qc.invalidateQueries({ queryKey: ["groups.list.v2"] });
      navigate({ to: "/app/groups" });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const removeMember = useMutation({
    mutationFn: async (holderAccountId: number) => {
      const { error } = await supabase.from("account_group_members").delete()
        .eq("group_id", groupId).eq("holder_account_id", holderAccountId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["group.detail.members", groupId] });
      qc.invalidateQueries({ queryKey: ["groups.all-members"] });
      toast.success("Member removed");
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  // Aggregate balances + 30d activity per currency
  const aggs: CurrencyAgg[] = useMemo(() => {
    const byCur = new Map<string, CurrencyAgg>();
    for (const m of membersQ.data ?? []) {
      const cur = byCur.get(m.currency_code) ?? {
        currency: m.currency_code, balance: 0, credits30d: 0, debits30d: 0, tx30d: 0, accountCount: 0,
      };
      cur.balance += m.current_balance;
      cur.accountCount += 1;
      byCur.set(m.currency_code, cur);
    }
    for (const e of activityQ.data ?? []) {
      const cur = byCur.get(e.currency_code);
      if (!cur) continue;
      cur.credits30d += Number(e.credit_amount ?? 0);
      cur.debits30d += Number(e.debit_amount ?? 0);
      cur.tx30d += 1;
    }
    return Array.from(byCur.values()).sort((a, b) => b.balance - a.balance);
  }, [membersQ.data, activityQ.data]);

  const totals = useMemo(() => {
    let credits = 0, debits = 0;
    const byCurC: Record<string, number> = {};
    const byCurD: Record<string, number> = {};
    for (const a of aggs) {
      credits += a.credits30d;
      debits += a.debits30d;
      byCurC[a.currency] = a.credits30d;
      byCurD[a.currency] = a.debits30d;
    }
    return { credits, debits, byCurC, byCurD };
  }, [aggs]);

  if (groupQ.isLoading) {
    return <div className="mx-auto max-w-7xl px-4 py-12 text-sm text-muted-foreground md:px-8">Loading group…</div>;
  }
  if (!groupQ.data) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-12 md:px-8">
        <div className="mx-auto max-w-md rounded-2xl border border-destructive/30 bg-destructive/5 p-8 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <h2 className="font-playfair text-xl font-semibold text-foreground">Group not found</h2>
          <p className="mt-2 text-sm text-muted-foreground">This group may have been deleted or the link is invalid.</p>
          <Button asChild variant="gold" className="mt-5">
            <Link to="/app/groups"><ArrowLeft className="h-4 w-4" /> Back to Groups</Link>
          </Button>
        </div>
      </div>
    );
  }

  const group = groupQ.data;
  const meta = metaFor(group.group_type);
  const members = membersQ.data ?? [];

  return (
    <div className="min-h-[calc(100vh-7rem)]">
      <div className="mx-auto max-w-7xl space-y-6 px-4 pt-6 md:px-8 md:pt-8">
        {/* Back */}
        <Button asChild variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
          <Link to="/app/groups"><ArrowLeft className="h-4 w-4" /> Back to Groups</Link>
        </Button>

        {/* Hero */}
        <div className={cn(
          "relative overflow-hidden rounded-3xl border bg-card/80 p-6 md:p-8",
          group.is_pinned ? cn(meta.border, meta.glow) : "border-gold/15",
        )}>
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div className="flex items-start gap-4">
              <div className={cn("flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl border", meta.bg, meta.border, meta.tone)}>
                <meta.Icon className="h-7 w-7" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={cn("inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider", meta.pillBg, meta.pillBorder, meta.pillText)}>
                    <meta.Icon className="h-3 w-3" />
                    {meta.label}
                  </span>
                  {group.is_pinned && (
                    <span className="inline-flex items-center gap-1 rounded-full border border-gold/30 bg-gold/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-gold">
                      <Pin className="h-3 w-3" /> Pinned
                    </span>
                  )}
                </div>
                <h1 className="mt-2 font-playfair text-3xl font-semibold text-foreground md:text-4xl">{group.name}</h1>
                {group.description && (
                  <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{group.description}</p>
                )}
                <p className="mt-2 text-[11px] text-muted-foreground">
                  Created {new Date(group.created_at).toLocaleDateString()} · Updated {new Date(group.updated_at).toLocaleDateString()}
                </p>
              </div>
            </div>
            {canMutate && (
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="outline" className="border-gold/20" onClick={() => togglePin.mutate()}>
                  <Star className={cn("h-3.5 w-3.5", group.is_pinned && "fill-gold text-gold")} />
                  {group.is_pinned ? "Unpin" : "Pin"}
                </Button>
                <Button size="sm" variant="outline" className="border-gold/20" onClick={() => setEditing(true)}>
                  <Pencil className="h-3.5 w-3.5" /> Edit
                </Button>
                <Button size="sm" variant="ghost" className="text-destructive hover:text-destructive" onClick={() => setDeleting(true)}>
                  <Trash2 className="h-3.5 w-3.5" /> Delete
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* 4 KPIs */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Kpi label="Members" value={members.length} icon={<Users className="h-4 w-4" />} />
          <Kpi label="Accounts" value={members.length} icon={<Wallet className="h-4 w-4" />} />
          <Kpi
            label="Credits 30d"
            value={canViewBalances ? compactNum(totals.credits) : "—"}
            tone="emerald"
            icon={<ArrowUp className="h-4 w-4" />}
            hint={canViewBalances ? sumByCur(totals.byCurC) : undefined}
          />
          <Kpi
            label="Debits 30d"
            value={canViewBalances ? compactNum(totals.debits) : "—"}
            tone="rose"
            icon={<ArrowDown className="h-4 w-4" />}
            hint={canViewBalances ? sumByCur(totals.byCurD) : undefined}
          />
        </div>

        {/* Balances by Currency */}
        {canViewBalances && (
          <section>
            <SectionTitle icon={<Layers className="h-4 w-4" />} title="Balances by Currency" />
            {aggs.length === 0 ? (
              <EmptyTile text="No balances yet — add members to start tracking." />
            ) : (
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {aggs.map((a) => {
                  const net = a.credits30d - a.debits30d;
                  return (
                    <div key={a.currency} className="rounded-2xl border border-gold/15 bg-card/70 p-5">
                      <div className="flex items-center justify-between">
                        <span className={cn("inline-flex items-center rounded-md border px-2 py-0.5 font-mono text-xs font-bold", meta.pillBg, meta.pillBorder, meta.pillText)}>
                          {a.currency}
                        </span>
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{a.accountCount} acct</span>
                      </div>
                      <div className="mt-3 font-playfair text-2xl font-semibold tabular-nums text-foreground">
                        {a.balance.toLocaleString()}
                      </div>
                      <div className="mt-3 grid grid-cols-2 gap-2">
                        <div className="rounded-lg border border-emerald-400/15 bg-emerald-400/5 p-2">
                          <div className="text-[9px] uppercase tracking-wider text-emerald-400/80">Credits 30d</div>
                          <div className="mt-0.5 font-mono text-sm tabular-nums text-emerald-300">+{a.credits30d.toLocaleString()}</div>
                        </div>
                        <div className="rounded-lg border border-rose-400/15 bg-rose-400/5 p-2">
                          <div className="text-[9px] uppercase tracking-wider text-rose-400/80">Debits 30d</div>
                          <div className="mt-0.5 font-mono text-sm tabular-nums text-rose-300">-{a.debits30d.toLocaleString()}</div>
                        </div>
                      </div>
                      <div className="mt-3 flex items-center justify-between border-t border-gold/10 pt-3 text-xs">
                        <span className="text-muted-foreground">Net flow · {a.tx30d} tx</span>
                        <span className={cn(
                          "font-mono tabular-nums",
                          net > 0 && "text-emerald-300",
                          net < 0 && "text-rose-300",
                          net === 0 && "text-muted-foreground",
                        )}>
                          {net > 0 ? "+" : ""}{net.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {/* All Accounts */}
        <section>
          <SectionTitle icon={<Wallet className="h-4 w-4" />} title="All Accounts" />
          <AccountsTable
            members={members}
            canViewBalances={canViewBalances}
            canMutate={canMutate}
            onRemove={(id) => removeMember.mutate(id)}
          />
        </section>

        {/* Members + Activity grid */}
        <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-1">
            <SectionTitle icon={<Users className="h-4 w-4" />} title="Members" />
            {canMutate && (
              <div className="mb-3">
                <AddMemberAutocomplete
                  groupId={groupId}
                  existing={new Set(members.map((m) => m.holder_account_id))}
                  onAdded={() => {
                    qc.invalidateQueries({ queryKey: ["group.detail.members", groupId] });
                    qc.invalidateQueries({ queryKey: ["groups.all-members"] });
                  }}
                />
              </div>
            )}
            {members.length === 0 ? (
              <EmptyTile text="No members yet." />
            ) : (
              <ul className="space-y-2">
                {members.slice(0, 10).map((m) => (
                  <li key={m.holder_account_id} className="flex items-center gap-3 rounded-xl border border-gold/10 bg-card/60 p-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-gold/30 to-gold/10 text-xs font-semibold text-gold">
                      {initials(m.holder_name)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <Link
                        to="/app/holders/$id"
                        params={{ id: String(m.account_holder_id) }}
                        hash={`account-${m.holder_account_id}`}
                        className="block truncate text-sm font-medium text-foreground hover:text-gold"
                      >
                        {m.holder_name}
                      </Link>
                      <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-muted-foreground">
                        {m.dahab_account_number && <span className="font-mono text-gold">{m.dahab_account_number}</span>}
                        <span>{m.currency_code}</span>
                      </div>
                    </div>
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
                {members.length > 10 && (
                  <li className="text-center text-[11px] text-muted-foreground">+ {members.length - 10} more — see Accounts table above</li>
                )}
              </ul>
            )}
          </div>

          <div className="lg:col-span-2">
            <SectionTitle icon={<Activity className="h-4 w-4" />} title="Recent Activity" />
            <RecentActivity entries={recentQ.data ?? []} createdAt={group.created_at} loading={recentQ.isLoading} />
          </div>
        </section>
      </div>

      {/* Edit modal */}
      {editing && <EditModal group={group} onClose={() => setEditing(false)} />}

      {/* Delete confirm */}
      <AlertDialog open={deleting} onOpenChange={setDeleting}>
        <AlertDialogContent className="border-gold/20">
          <AlertDialogHeader>
            <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-full bg-destructive/10 text-destructive">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <AlertDialogTitle>Delete this group?</AlertDialogTitle>
            <AlertDialogDescription>
              <span className="font-medium text-foreground">"{group.name}"</span> will be removed along with its membership links.
              The underlying customers and accounts will not be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => { e.preventDefault(); deleteMut.mutate(); }}
            >
              Delete group
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Bits
// ────────────────────────────────────────────────────────────────────────────

function compactNum(n: number) {
  if (!n) return "0";
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return Math.round(n).toString();
}

function sumByCur(by: Record<string, number>) {
  const entries = Object.entries(by).filter(([, v]) => v > 0);
  if (!entries.length) return undefined;
  return entries.slice(0, 3).map(([c, v]) => `${compactNum(v)} ${c}`).join(" · ");
}

function SectionTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-gold/10 text-gold">{icon}</span>
      <h2 className="font-playfair text-lg font-semibold text-foreground">{title}</h2>
    </div>
  );
}

function EmptyTile({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-gold/15 bg-card/30 p-8 text-center text-sm text-muted-foreground">
      {text}
    </div>
  );
}

function Kpi({ label, value, icon, tone, hint }: { label: string; value: React.ReactNode; icon: React.ReactNode; tone?: "emerald" | "rose"; hint?: string }) {
  const toneCls =
    tone === "emerald" ? "border-emerald-400/20 bg-emerald-400/5 text-emerald-300" :
    tone === "rose" ? "border-rose-400/20 bg-rose-400/5 text-rose-300" :
    "border-gold/15 bg-card/70 text-gold";
  return (
    <div className={cn("rounded-2xl border p-4", toneCls.split(" ").slice(0, 2).join(" "))}>
      <div className="flex items-center gap-2">
        <span className={cn("flex h-8 w-8 items-center justify-center rounded-lg", tone === "emerald" ? "bg-emerald-400/10 text-emerald-300" : tone === "rose" ? "bg-rose-400/10 text-rose-300" : "bg-gold/10 text-gold")}>
          {icon}
        </span>
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      </div>
      <div className={cn("mt-2 font-playfair text-2xl font-semibold tabular-nums",
        tone === "emerald" ? "text-emerald-300" : tone === "rose" ? "text-rose-300" : "text-foreground")}>
        {value}
      </div>
      {hint && <div className="mt-0.5 truncate text-[11px] text-muted-foreground">{hint}</div>}
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Accounts table
// ────────────────────────────────────────────────────────────────────────────

type AccSort = "balance-desc" | "balance-asc" | "name" | "currency";

function AccountsTable({
  members, canViewBalances, canMutate, onRemove,
}: {
  members: MemberRow[]; canViewBalances: boolean; canMutate: boolean;
  onRemove: (id: number) => void;
}) {
  const [search, setSearch] = useState("");
  const dq = useDebounced(search, 200).trim().toLowerCase();
  const [currency, setCurrency] = useState<string>("all");
  const [sort, setSort] = useState<AccSort>("balance-desc");

  const currencies = useMemo(() => Array.from(new Set(members.map((m) => m.currency_code))).sort(), [members]);

  const rows = useMemo(() => {
    let xs = members.slice();
    if (currency !== "all") xs = xs.filter((m) => m.currency_code === currency);
    if (dq) {
      xs = xs.filter((m) =>
        m.holder_name.toLowerCase().includes(dq) ||
        m.account_number.toLowerCase().includes(dq) ||
        (m.dahab_account_number ?? "").toLowerCase().includes(dq) ||
        (m.account_display_name ?? "").toLowerCase().includes(dq),
      );
    }
    xs.sort((a, b) => {
      if (sort === "balance-desc") return b.current_balance - a.current_balance;
      if (sort === "balance-asc") return a.current_balance - b.current_balance;
      if (sort === "name") return a.holder_name.localeCompare(b.holder_name);
      if (sort === "currency") return a.currency_code.localeCompare(b.currency_code);
      return 0;
    });
    return xs;
  }, [members, dq, currency, sort]);

  if (members.length === 0) {
    return <EmptyTile text="This group has no accounts yet." />;
  }

  return (
    <div className="rounded-2xl border border-gold/15 bg-card/60">
      <div className="flex flex-col gap-3 border-b border-gold/10 p-3 md:flex-row md:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by holder, account #, or DAHAB #…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 rounded-xl border-gold/20 bg-card/60 pl-10 focus-visible:ring-gold/40"
          />
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setCurrency("all")}
            className={cn(
              "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-all",
              currency === "all" ? "border-gold/30 bg-gold/10 text-gold" : "border-gold/15 bg-card/60 text-muted-foreground hover:text-foreground",
            )}
          >
            All
          </button>
          {currencies.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCurrency(c)}
              className={cn(
                "inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 font-mono text-xs font-bold transition-all",
                currency === c ? "border-gold/40 bg-gold/15 text-gold" : "border-gold/15 bg-card/60 text-muted-foreground hover:text-foreground",
              )}
            >
              {c}
            </button>
          ))}
        </div>
        <Select value={sort} onValueChange={(v) => setSort(v as AccSort)}>
          <SelectTrigger className="h-10 w-full rounded-xl border-gold/20 bg-card/60 md:w-[180px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="balance-desc">Balance (high to low)</SelectItem>
            <SelectItem value="balance-asc">Balance (low to high)</SelectItem>
            <SelectItem value="name">Holder name</SelectItem>
            <SelectItem value="currency">Currency</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-gold/10 hover:bg-transparent">
              <TableHead>Holder</TableHead>
              <TableHead>Account</TableHead>
              <TableHead>Currency</TableHead>
              <TableHead>Status</TableHead>
              {canViewBalances && <TableHead className="text-right">Balance</TableHead>}
              {canMutate && <TableHead />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                  No matching accounts.
                </TableCell>
              </TableRow>
            ) : rows.map((m) => (
              <TableRow key={m.holder_account_id} className="cursor-pointer border-gold/10 hover:bg-gold/5">
                <TableCell>
                  <Link
                    to="/app/holders/$id"
                    params={{ id: String(m.account_holder_id) }}
                    hash={`account-${m.holder_account_id}`}
                    className="flex items-center gap-2 hover:text-gold"
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-gold/30 to-gold/10 text-[10px] font-semibold text-gold">
                      {initials(m.holder_name)}
                    </span>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{m.holder_name}</div>
                      {m.dahab_account_number && (
                        <div className="font-mono text-[10px] text-gold/80">{m.dahab_account_number}</div>
                      )}
                    </div>
                  </Link>
                </TableCell>
                <TableCell>
                  <div className="font-mono text-xs">{m.account_number}</div>
                  {m.account_display_name && (
                    <div className="truncate text-[10px] text-muted-foreground">{m.account_display_name}</div>
                  )}
                </TableCell>
                <TableCell>
                  <span className="inline-flex items-center rounded-md border border-gold/20 bg-gold/10 px-2 py-0.5 font-mono text-[10px] font-bold text-gold">
                    {m.currency_code}
                  </span>
                </TableCell>
                <TableCell>
                  <span className={cn(
                    "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider",
                    m.status === "ACTIVE" ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" :
                    m.status === "SUSPENDED" ? "border-amber-400/30 bg-amber-400/10 text-amber-300" :
                    "border-rose-400/30 bg-rose-400/10 text-rose-300",
                  )}>
                    {m.status}
                  </span>
                </TableCell>
                {canViewBalances && (
                  <TableCell className="text-right font-mono tabular-nums text-gold">
                    {m.current_balance.toLocaleString()}
                  </TableCell>
                )}
                {canMutate && (
                  <TableCell>
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); onRemove(m.holder_account_id); }}
                      className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                      aria-label="Remove from group"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Activity feed
// ────────────────────────────────────────────────────────────────────────────

function RecentActivity({
  entries, createdAt, loading,
}: {
  entries: any[]; createdAt: string; loading: boolean;
}) {
  if (loading) {
    return <EmptyTile text="Loading activity…" />;
  }
  if (!entries.length) {
    return (
      <ol className="space-y-2">
        <li className="flex items-start gap-3 rounded-xl border border-gold/10 bg-card/60 p-3">
          <span className="mt-0.5 flex h-7 w-7 items-center justify-center rounded-full border border-gold/15 bg-surface-2">
            <Sparkles className="h-3.5 w-3.5 text-gold" />
          </span>
          <div>
            <div className="text-sm text-foreground">Group created</div>
            <div className="mt-0.5 text-[11px] text-muted-foreground">{new Date(createdAt).toLocaleString()}</div>
          </div>
        </li>
      </ol>
    );
  }
  return (
    <ol className="space-y-2">
      {entries.map((e) => {
        const isCredit = Number(e.credit_amount ?? 0) > 0;
        const amt = Number(e.credit_amount ?? 0) + Number(e.debit_amount ?? 0);
        return (
          <li key={e.id} className="flex items-start gap-3 rounded-xl border border-gold/10 bg-card/60 p-3">
            <span className={cn(
              "mt-0.5 flex h-7 w-7 items-center justify-center rounded-full border",
              isCredit ? "border-emerald-400/30 bg-emerald-400/10 text-emerald-300" : "border-rose-400/30 bg-rose-400/10 text-rose-300",
            )}>
              {isCredit ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2 text-sm text-foreground">
                <span className="truncate">{e.description || (isCredit ? "Credit" : "Debit")}</span>
                <span className={cn("font-mono tabular-nums", isCredit ? "text-emerald-300" : "text-rose-300")}>
                  {isCredit ? "+" : "-"}{amt.toLocaleString()} {e.currency_code}
                </span>
              </div>
              <div className="mt-0.5 flex items-center gap-2 text-[11px] text-muted-foreground">
                <span className="font-mono">{e.tx_number}</span>
                <span>·</span>
                <span>{new Date(e.posted_at).toLocaleString()}</span>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Add member autocomplete
// ────────────────────────────────────────────────────────────────────────────

function AddMemberAutocomplete({
  groupId, existing, onAdded,
}: { groupId: number; existing: Set<number>; onAdded: () => void }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const dq = useDebounced(q, 200);
  const search = useQuery({
    queryKey: ["group.detail.add-search", groupId, dq, existing.size],
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
      const { error } = await supabase.from("account_group_members").upsert(
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
          placeholder="Add by account # or DAHAB #…"
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
// Edit modal
// ────────────────────────────────────────────────────────────────────────────

function EditModal({ group, onClose }: { group: GroupRow; onClose: () => void }) {
  const qc = useQueryClient();
  const [name, setName] = useState(group.name);
  const [description, setDescription] = useState(group.description ?? "");
  const [type, setType] = useState<GroupType>((group.group_type as GroupType) || "general");

  const save = useMutation({
    mutationFn: async () => {
      const trimmed = name.trim();
      if (!trimmed) throw new Error("Name is required");
      const { error } = await supabase
        .from("account_groups")
        .update({ name: trimmed, description: description.trim() || null, group_type: type })
        .eq("id", group.id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Group updated");
      qc.invalidateQueries({ queryKey: ["group.detail", group.id] });
      qc.invalidateQueries({ queryKey: ["groups.list.v2"] });
      onClose();
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl border-gold/20">
        <DialogHeader>
          <DialogTitle className="font-playfair text-2xl">Edit Group</DialogTitle>
          <DialogDescription>Update the group name, description, or type.</DialogDescription>
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
            <Label htmlFor="g-name">Name</Label>
            <Input
              id="g-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 h-10 rounded-xl border-gold/20 bg-card/60 focus-visible:ring-gold/40"
              autoFocus
            />
          </div>
          <div>
            <Label htmlFor="g-desc">Description (optional)</Label>
            <Textarea
              id="g-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="mt-1 rounded-xl border-gold/20 bg-card/60 focus-visible:ring-gold/40"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" className="border-gold/20" onClick={onClose}>Cancel</Button>
          <Button variant="gold" disabled={save.isPending || !name.trim()} onClick={() => save.mutate()}>
            {save.isPending ? "Saving…" : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
