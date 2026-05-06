import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { ArrowLeft, Plus, Search, Trash2 } from "lucide-react";
import { useAuth, hasAnyRole } from "@/lib/auth";
import { useDebounced } from "@/hooks/use-debounced";
import { toast } from "sonner";
import { CurrencyTotalsStrip } from "@/components/app/currency-totals-strip";

export const Route = createFileRoute("/app/groups/$id")({ component: GroupDetail });

type Totals = { currency: string; total_debits: number; total_credits: number; total_balance: number; account_count: number };

function AddMembersDialog({ groupId, existing }: { groupId: number; existing: Set<number> }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [addedIds, setAddedIds] = useState<Set<number>>(() => new Set());
  const dq = useDebounced(q, 250);
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["group.member-search", groupId, dq, existing.size, addedIds.size],
    queryFn: async () => {
      const term = dq.trim();
      let qb = supabase
        .from("holder_accounts")
        .select("id,account_number,currency_code,account_display_name,dahab_account_number,account_holders!inner(canonical_name,dahab_account_number)")
        .limit(50);
      if (term) qb = qb.or(`account_number.ilike.%${term}%,account_display_name.ilike.%${term}%,dahab_account_number.ilike.%${term}%`);
      const excluded = Array.from(new Set([...existing, ...addedIds]));
      if (excluded.length) qb = qb.not("id", "in", `(${excluded.join(",")})`);
      const { data, error } = await qb;
      if (error) throw error;
      return data ?? [];
    },
    enabled: open,
  });

  const m = useMutation({
    mutationFn: async (holderAccountId: number) => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase
        .from("account_group_members")
        .upsert({
          group_id: groupId,
          holder_account_id: holderAccountId,
          added_by: u.user?.id ?? null,
        }, { onConflict: "group_id,holder_account_id", ignoreDuplicates: true });
      if (error) throw error;
      return holderAccountId;
    },
    onSuccess: (holderAccountId) => {
      setAddedIds((prev) => new Set(prev).add(holderAccountId));
      toast.success("Member added");
      qc.invalidateQueries({ queryKey: ["group", groupId, "members"] });
      qc.invalidateQueries({ queryKey: ["group", groupId] });
      qc.invalidateQueries({ queryKey: ["group-totals", groupId] });
      qc.invalidateQueries({ queryKey: ["group.member-search", groupId] });
      qc.invalidateQueries({ queryKey: ["group-members-count", groupId] });
      qc.invalidateQueries({ queryKey: ["groups.list"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm"><Plus className="h-4 w-4 me-1" /> Add members</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>Add accounts to group</DialogTitle></DialogHeader>
        <div className="relative">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="ps-9" placeholder="Search by account #, DAHAB #, or name" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <div className="max-h-96 space-y-1 overflow-y-auto">
          {isLoading ? <p className="text-sm text-muted-foreground">Loading…</p> :
            (data ?? []).map((a: any) => {
              const already = existing.has(a.id) || addedIds.has(a.id);
              return (
                <div key={a.id} className="flex items-center justify-between gap-2 rounded border border-[oklch(0.82_0.14_85/0.12)] px-3 py-2 text-sm">
                  <div className="flex flex-wrap items-center gap-2 min-w-0">
                    <Badge>{a.currency_code}</Badge>
                    <span className="font-mono text-xs">{a.account_number}</span>
                    <span className="truncate text-xs text-muted-foreground">{a.account_holders?.canonical_name}</span>
                    {a.dahab_account_number && <Badge variant="outline" className="font-mono text-xs text-gold">{a.dahab_account_number}</Badge>}
                  </div>
                  <Button size="sm" variant={already ? "secondary" : "outline"} disabled={already || m.isPending} onClick={() => m.mutate(a.id)}>
                    {already ? "Added" : "Add"}
                  </Button>
                </div>
              );
            })}
        </div>
        <DialogFooter>
          <Button onClick={() => setOpen(false)}>Done</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GroupDetail() {
  const { id } = Route.useParams();
  const groupId = Number(id);
  const { roles } = useAuth();
  const isAdmin = hasAnyRole(roles, ["admin"]);
  const qc = useQueryClient();

  const { data: group } = useQuery({
    queryKey: ["group", groupId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("account_groups")
        .select("id,name,description")
        .eq("id", groupId).single();
      if (error) throw error;
      return data;
    },
  });

  const { data: members } = useQuery({
    queryKey: ["group", groupId, "members"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("account_group_members")
        .select("holder_account_id,added_at,holder_accounts!inner(id,account_number,currency_code,account_display_name,current_balance,dahab_account_number,account_holder_id,account_holders!inner(id,canonical_name,dahab_account_number))")
        .eq("group_id", groupId);
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: totals } = useQuery({
    queryKey: ["group-totals", groupId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_group_totals", { p_group_id: groupId });
      if (error) throw error;
      return (data ?? []) as unknown as Totals[];
    },
  });

  const removeMember = useMutation({
    mutationFn: async (holderAccountId: number) => {
      const { error } = await supabase.from("account_group_members").delete()
        .eq("group_id", groupId).eq("holder_account_id", holderAccountId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["group", groupId, "members"] });
      qc.invalidateQueries({ queryKey: ["group-totals", groupId] });
      qc.invalidateQueries({ queryKey: ["group-members-count", groupId] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const deleteGroup = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("account_groups").delete().eq("id", groupId);
      if (error) throw error;
    },
    onSuccess: () => { toast.success("Group deleted"); window.location.href = "/app/groups"; },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const existing = new Set((members ?? []).map((m: any) => m.holder_account_id));

  return (
    <div>
      <PageHeader
        title={group?.name ?? "Group"}
        description={group?.description ?? undefined}
        actions={
          <>
            {isAdmin && <AddMembersDialog groupId={groupId} existing={existing} />}
            {isAdmin && (
              <Button size="sm" variant="outline" onClick={() => { if (confirm("Delete this group?")) deleteGroup.mutate(); }}>
                <Trash2 className="h-4 w-4 me-1" /> Delete
              </Button>
            )}
            <Button asChild variant="outline" size="sm">
              <Link to="/app/groups"><ArrowLeft className="h-4 w-4 me-1" /> Back</Link>
            </Button>
          </>
        }
      />
      <div className="space-y-4 p-4 sm:p-6">
        <Card className="card-luxe border-[oklch(0.82_0.14_85/0.4)]">
          <CardContent className="p-4">
            <div className="mb-2 flex items-baseline justify-between">
              <h2 className="font-serif text-lg text-gold">Group balance totals</h2>
              <span className="text-xs text-muted-foreground">
                across {(totals ?? []).reduce((s, t) => s + Number(t.account_count ?? 0), 0)} account(s)
              </span>
            </div>
            <CurrencyTotalsStrip totals={totals} label="Total balances by currency" size="lg" />
          </CardContent>
        </Card>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {(totals ?? []).map((t) => (
            <Card key={t.currency} className="card-luxe">
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <Badge>{t.currency}</Badge>
                  <span className="text-xs text-muted-foreground">{t.account_count} acct</span>
                </div>
                <div className="mt-3 font-serif text-2xl text-gold">{Number(t.total_balance).toLocaleString()}</div>
                <div className="text-xs text-muted-foreground">total balance</div>
                <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded border border-[oklch(0.82_0.14_85/0.12)] p-2">
                    <div className="text-muted-foreground">Total debits</div>
                    <div className="font-mono">{Number(t.total_debits).toLocaleString()}</div>
                  </div>
                  <div className="rounded border border-[oklch(0.82_0.14_85/0.12)] p-2">
                    <div className="text-muted-foreground">Total credits</div>
                    <div className="font-mono">{Number(t.total_credits).toLocaleString()}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          {(totals ?? []).length === 0 && (
            <p className="text-sm text-muted-foreground sm:col-span-2 lg:col-span-3">No accounts in this group yet.</p>
          )}
        </div>

        <Card className="card-luxe">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase text-muted-foreground">
                    <th className="p-3">DAHAB #</th>
                    <th className="p-3">Holder</th>
                    <th className="p-3">Account #</th>
                    <th className="p-3">Currency</th>
                    <th className="p-3 text-right">Balance</th>
                    <th className="p-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {(members ?? []).length === 0 ? (
                    <tr><td colSpan={6} className="p-6 text-center text-muted-foreground">No members.</td></tr>
                  ) : (members ?? []).map((m: any) => {
                    const a = m.holder_accounts;
                    const h = a?.account_holders;
                    return (
                      <tr key={m.holder_account_id} className="border-t border-[oklch(0.82_0.14_85/0.08)]">
                        <td className="p-3 font-mono text-xs text-gold">{h?.dahab_account_number}</td>
                        <td className="p-3">
                          <Link to="/app/holders/$id" params={{ id: String(h?.id) }} className="hover:text-gold">
                            {h?.canonical_name}
                          </Link>
                        </td>
                        <td className="p-3 font-mono text-xs">{a?.account_number}</td>
                        <td className="p-3"><Badge variant="outline">{a?.currency_code}</Badge></td>
                        <td className="p-3 text-right font-mono">{Number(a?.current_balance ?? 0).toLocaleString()}</td>
                        <td className="p-3 text-right">
                          <div className="flex justify-end gap-1">
                            <Button asChild size="sm" variant="outline">
                              <Link to="/app/holders/$id" params={{ id: String(h?.id) }}>View</Link>
                            </Button>
                            {isAdmin && (
                              <Button size="sm" variant="ghost" onClick={() => removeMember.mutate(m.holder_account_id)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}