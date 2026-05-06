import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/app/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { FolderPlus, Layers } from "lucide-react";
import { useAuth, hasAnyRole } from "@/lib/auth";
import { toast } from "sonner";

export const Route = createFileRoute("/app/groups/")({ component: GroupsList });

type Totals = { currency: string; total_debits: number; total_credits: number; total_balance: number; account_count: number };

function GroupCard({ id, name, description }: { id: number; name: string; description: string | null }) {
  const { data: totals } = useQuery({
    queryKey: ["group-totals", id],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_group_totals", { p_group_id: id });
      if (error) throw error;
      return (data ?? []) as unknown as Totals[];
    },
  });
  const { data: memberCount = 0 } = useQuery({
    queryKey: ["group-members-count", id],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("account_group_members")
        .select("holder_account_id", { count: "exact", head: true })
        .eq("group_id", id);
      if (error) throw error;
      return count ?? 0;
    },
  });
  return (
    <Link to="/app/groups/$id" params={{ id: String(id) }}>
      <Card className="card-luxe transition hover:border-[oklch(0.82_0.14_85/0.5)]">
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Layers className="h-4 w-4 text-gold" />
                <div className="font-serif text-lg truncate">{name}</div>
              </div>
              {description && <div className="mt-1 text-xs text-muted-foreground line-clamp-2">{description}</div>}
            </div>
            <Badge variant="secondary">{memberCount} member{memberCount === 1 ? "" : "s"}</Badge>
          </div>
          <div className="mt-3 space-y-1.5">
            {(totals ?? []).length === 0 ? (
              <div className="text-xs text-muted-foreground">No member accounts yet.</div>
            ) : (
              (totals ?? []).map((t) => (
                <div key={t.currency} className="rounded border border-[oklch(0.82_0.14_85/0.12)] px-2.5 py-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <Badge>{t.currency}</Badge>
                    <span className="font-mono text-gold">Bal: {Number(t.total_balance).toLocaleString()}</span>
                  </div>
                  <div className="mt-1 grid grid-cols-2 gap-2 text-muted-foreground">
                    <div>Debits: <span className="text-foreground">{Number(t.total_debits).toLocaleString()}</span></div>
                    <div>Credits: <span className="text-foreground">{Number(t.total_credits).toLocaleString()}</span></div>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function NewGroupDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: async () => {
      const { data: u } = await supabase.auth.getUser();
      const { error } = await supabase.from("account_groups").insert({
        name: name.trim(),
        description: description.trim() || null,
        created_by: u.user?.id ?? null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Group created");
      qc.invalidateQueries({ queryKey: ["groups.list"] });
      setName(""); setDescription(""); setOpen(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-gradient-gold text-primary-foreground shadow-gold hover:opacity-95">
          <FolderPlus className="h-4 w-4 me-1" /> New group
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>New account group</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
          <div><Label>Description (optional)</Label><Textarea value={description} onChange={(e) => setDescription(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={m.isPending || !name.trim()} onClick={() => m.mutate()} className="bg-gradient-gold text-primary-foreground">
            {m.isPending ? "Creating…" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GroupsList() {
  const { roles } = useAuth();
  const isAdmin = hasAnyRole(roles, ["admin"]);
  const { data, isLoading } = useQuery({
    queryKey: ["groups.list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("account_groups")
        .select("id,name,description,created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });
  return (
    <div>
      <PageHeader
        title="Account Groups"
        description="Viewing-only groupings of accounts to monitor closely. No financial linkage between members."
        actions={isAdmin ? <NewGroupDialog /> : undefined}
      />
      <div className="space-y-4 p-4 sm:p-6">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">No groups yet. {isAdmin ? "Create one to start monitoring a set of accounts together." : ""}</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {data!.map((g) => (
              <GroupCard key={g.id} id={g.id} name={g.name} description={g.description} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}