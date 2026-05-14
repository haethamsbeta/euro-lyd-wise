import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { RoleGate } from "@/components/app/app-shell";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Building2 } from "lucide-react";

export const Route = createFileRoute("/app/admin/branches")({
  head: () => ({ meta: [{ title: "Branches — Dahab admin" }, { name: "description", content: "Manage Dahab branches, locations, and operational settings." }] }), component: () => <RoleGate allow={["admin"]}><BranchesPage /></RoleGate>,
});

function BranchesPage() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [status, setStatus] = useState("active");

  const { data: branches = [], isLoading } = useQuery({
    queryKey: ["branches.list"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("branches")
        .select("id, code, name, city, status, created_at")
        .order("code");
      if (error) throw error;
      return data ?? [];
    },
  });

  const reset = () => { setEditing(null); setCode(""); setName(""); setCity(""); setStatus("active"); };
  const openNew = () => { reset(); setOpen(true); };
  const openEdit = (b: any) => { setEditing(b); setCode(b.code); setName(b.name); setCity(b.city ?? ""); setStatus(b.status); setOpen(true); };

  const save = useMutation({
    mutationFn: async () => {
      if (!code.trim() || !name.trim()) throw new Error("Code and name are required");
      const payload = { code: code.trim(), name: name.trim(), city: city.trim() || null, status };
      if (editing) {
        const { error } = await supabase.from("branches").update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("branches").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      toast.success(editing ? "Branch updated" : "Branch created");
      qc.invalidateQueries({ queryKey: ["branches.list"] });
      setOpen(false);
      reset();
    },
    onError: (e: any) => toast.error(e.message ?? "Failed to save"),
  });

  return (
    <div className="space-y-8 p-4 pb-12 sm:p-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="font-serif text-2xl font-semibold text-foreground md:text-3xl">Branches</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Define branches and assign tellers to them. Branch is auto-tagged on every transaction.
          </p>
        </div>
        <Button onClick={openNew} className="gap-2"><Plus className="h-4 w-4" /> Add branch</Button>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full whitespace-nowrap text-left text-sm">
            <thead className="border-b border-border bg-muted/40 text-[10px] uppercase tracking-wider text-muted-foreground">
              <tr>
                <th className="px-5 py-3 font-medium">Code</th>
                <th className="px-5 py-3 font-medium">Name</th>
                <th className="px-5 py-3 font-medium">City</th>
                <th className="px-5 py-3 font-medium">Status</th>
                <th className="px-5 py-3 text-right font-medium">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {isLoading ? (
                <tr><td colSpan={5} className="px-5 py-8 text-center text-muted-foreground">Loading…</td></tr>
              ) : branches.length === 0 ? (
                <tr><td colSpan={5} className="px-5 py-8 text-center text-muted-foreground">No branches yet.</td></tr>
              ) : (
                branches.map((b: any) => (
                  <tr key={b.id} className="transition-colors hover:bg-muted/40">
                    <td className="px-5 py-3 font-mono text-xs">{b.code}</td>
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-gold" />
                        <span className="text-sm font-medium">{b.name}</span>
                      </div>
                    </td>
                    <td className="px-5 py-3 text-sm text-muted-foreground">{b.city ?? "—"}</td>
                    <td className="px-5 py-3">
                      <Badge variant={b.status === "active" ? "secondary" : "outline"}>{b.status}</Badge>
                    </td>
                    <td className="px-5 py-3 text-right">
                      <Button size="sm" variant="outline" onClick={() => openEdit(b)}>Edit</Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Edit branch" : "Add branch"}</DialogTitle>
            <DialogDescription className="sr-only">
              {editing ? "Update branch details." : "Create a new branch."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Code</Label>
              <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="e.g. TRP-01" />
            </div>
            <div>
              <Label>Name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Tripoli Main" />
            </div>
            <div>
              <Label>City</Label>
              <Input value={city} onChange={(e) => setCity(e.target.value)} placeholder="e.g. Tripoli" />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
