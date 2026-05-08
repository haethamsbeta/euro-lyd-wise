import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, RoleGate } from "@/components/app/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Loader2, UserPlus, Link2 } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { adminListUserEmails, adminListHolders } from "@/server/admin.functions";

export const Route = createFileRoute("/app/portal-accounts")({
  component: () => (
    <RoleGate allow={["admin"]}>
      <PortalAccountsPage />
    </RoleGate>
  ),
});

type Holder = {
  id: number;
  canonical_name: string;
  dahab_account_number: string | null;
  owner_user_id: string | null;
};

function PortalAccountsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [managing, setManaging] = useState<{ id: string; name: string } | null>(null);

  const listEmails = useServerFn(adminListUserEmails);
  const listHolders = useServerFn(adminListHolders);

  const { data, isLoading } = useQuery({
    queryKey: ["portal-accounts.consumers"],
    enabled: !!user,
    queryFn: async () => {
      const [{ data: roles, error: rErr }, { data: profiles, error: pErr }, emails, holders] =
        await Promise.all([
          supabase.from("user_roles").select("user_id").eq("role", "consumer"),
          supabase.from("profiles").select("id, full_name"),
          listEmails().catch(() => [] as Array<{ id: string; email: string | null }>),
          listHolders().catch(() => [] as Holder[]),
        ]);
      if (rErr) throw rErr;
      if (pErr) throw pErr;
      const consumerIds = new Set((roles ?? []).map((r) => r.user_id));
      const emailMap = new Map((emails ?? []).map((e) => [e.id, e.email]));
      const profileMap = new Map((profiles ?? []).map((p) => [p.id, p.full_name]));
      const holdersByOwner = new Map<string, Holder[]>();
      for (const h of holders) {
        if (!h.owner_user_id) continue;
        const arr = holdersByOwner.get(h.owner_user_id) ?? [];
        arr.push(h);
        holdersByOwner.set(h.owner_user_id, arr);
      }
      const consumers = Array.from(consumerIds).map((id) => ({
        id,
        full_name: profileMap.get(id) ?? "(no name)",
        email: emailMap.get(id) ?? null,
        holders: holdersByOwner.get(id) ?? [],
      }));
      consumers.sort((a, b) => a.full_name.localeCompare(b.full_name));
      return { consumers, allHolders: holders };
    },
  });

  const filtered = useMemo(() => {
    const list = data?.consumers ?? [];
    const term = search.trim().toLowerCase();
    if (!term) return list;
    return list.filter(
      (c) =>
        c.full_name.toLowerCase().includes(term) ||
        (c.email ?? "").toLowerCase().includes(term),
    );
  }, [data, search]);

  return (
    <div>
      <PageHeader
        title="Customer Portal Accounts"
        description="Create consumer logins and link holder accounts to them."
        actions={
          <Button asChild size="sm" className="bg-gradient-gold text-primary-foreground shadow-gold hover:opacity-95">
            <Link to="/app/users/new-consumer">
              <UserPlus className="me-1 h-4 w-4" /> Add consumer account
            </Link>
          </Button>
        }
      />
      <div className="space-y-4 p-4 sm:p-6">
        <Input
          placeholder="Search by name or email…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="max-w-sm"
        />
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 text-start">Consumer</th>
                    <th className="px-4 py-2 text-start">Email</th>
                    <th className="px-4 py-2 text-start">Linked accounts</th>
                    <th className="px-4 py-2 text-end">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {isLoading ? (
                    <tr><td colSpan={4} className="p-6 text-center text-muted-foreground"><Loader2 className="inline h-4 w-4 animate-spin" /></td></tr>
                  ) : filtered.length === 0 ? (
                    <tr><td colSpan={4} className="p-6 text-center text-muted-foreground">No consumer accounts yet.</td></tr>
                  ) : (
                    filtered.map((c) => (
                      <tr key={c.id}>
                        <td className="px-4 py-2">
                          <div className="font-medium">{c.full_name}</div>
                        </td>
                        <td className="px-4 py-2 text-xs">{c.email ?? <span className="text-muted-foreground">—</span>}</td>
                        <td className="px-4 py-2">
                          {c.holders.length === 0 ? (
                            <span className="text-xs text-muted-foreground">none</span>
                          ) : (
                            <div className="flex flex-wrap gap-1">
                              {c.holders.map((h) => (
                                <Badge key={h.id} variant="secondary" className="font-mono text-[10px]">
                                  {h.dahab_account_number ?? h.canonical_name}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </td>
                        <td className="px-4 py-2 text-end">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setManaging({ id: c.id, name: c.full_name })}
                          >
                            <Link2 className="me-1 h-3.5 w-3.5" /> Manage links
                          </Button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      {managing ? (
        <ManageLinksDialog
          consumer={managing}
          allHolders={data?.allHolders ?? []}
          onClose={() => setManaging(null)}
          onSaved={() => qc.invalidateQueries({ queryKey: ["portal-accounts.consumers"] })}
        />
      ) : null}
    </div>
  );
}

function ManageLinksDialog({
  consumer,
  allHolders,
  onClose,
  onSaved,
}: {
  consumer: { id: string; name: string };
  allHolders: Holder[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [search, setSearch] = useState("");
  const initial = useMemo(
    () => new Set(allHolders.filter((h) => h.owner_user_id === consumer.id).map((h) => h.id)),
    [allHolders, consumer.id],
  );
  const [picked, setPicked] = useState<Set<number>>(initial);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = allHolders;
    if (!term) return list.slice(0, 100);
    return list
      .filter(
        (h) =>
          h.canonical_name.toLowerCase().includes(term) ||
          (h.dahab_account_number ?? "").toLowerCase().includes(term),
      )
      .slice(0, 100);
  }, [allHolders, search]);

  const save = useMutation({
    mutationFn: async () => {
      const before = initial;
      const after = picked;
      const toAdd: number[] = [];
      const toRemove: number[] = [];
      after.forEach((id) => { if (!before.has(id)) toAdd.push(id); });
      before.forEach((id) => { if (!after.has(id)) toRemove.push(id); });
      if (toAdd.length > 0) {
        const { error } = await supabase
          .from("account_holders")
          .update({ owner_user_id: consumer.id })
          .in("id", toAdd);
        if (error) throw error;
      }
      if (toRemove.length > 0) {
        const { error } = await supabase
          .from("account_holders")
          .update({ owner_user_id: null })
          .in("id", toRemove);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success("Linked accounts updated");
      onSaved();
      onClose();
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to update links"),
  });

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Manage linked accounts — {consumer.name}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <Input
            placeholder="Search by name or DAHAB #…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="max-h-72 overflow-auto rounded-md border">
            <ul className="divide-y">
              {filtered.map((h) => {
                const checked = picked.has(h.id);
                const linkedToOther = !!h.owner_user_id && h.owner_user_id !== consumer.id;
                return (
                  <li key={h.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(v) => {
                        const next = new Set(picked);
                        if (v) next.add(h.id);
                        else next.delete(h.id);
                        setPicked(next);
                      }}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{h.canonical_name}</div>
                      <div className="font-mono text-xs text-muted-foreground">
                        {h.dahab_account_number}
                      </div>
                    </div>
                    {linkedToOther ? (
                      <Badge variant="outline" className="text-amber-600">Linked elsewhere</Badge>
                    ) : null}
                  </li>
                );
              })}
              {filtered.length === 0 ? (
                <li className="p-3 text-sm text-muted-foreground">No matches.</li>
              ) : null}
            </ul>
          </div>
          <p className="text-xs text-muted-foreground">
            Checking a holder linked to another consumer will reassign it to {consumer.name}.
          </p>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={save.isPending} onClick={() => save.mutate()}>
            {save.isPending ? <Loader2 className="me-1 h-4 w-4 animate-spin" /> : null}
            Save links
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}