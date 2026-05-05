import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter,
} from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";

type Staged = {
  account_number: string;
  currency_code: string;
  account_nature: string;
  account_display_name: string;
  account_alias_name: string;
  is_primary_account: boolean;
};

const empty = (): Staged => ({
  account_number: "",
  currency_code: "USD",
  account_nature: "Debit",
  account_display_name: "",
  account_alias_name: "",
  is_primary_account: false,
});

export function NewHolderDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [holderType, setHolderType] = useState("INDIVIDUAL");
  const [staged, setStaged] = useState<Staged[]>([]);
  const [draft, setDraft] = useState<Staged>(empty());
  const qc = useQueryClient();

  const reset = () => {
    setName(""); setHolderType("INDIVIDUAL"); setStaged([]); setDraft(empty());
  };

  const addRow = () => {
    if (!draft.account_number.trim()) return toast.error("Account number is required");
    if (!draft.currency_code.trim()) return toast.error("Currency is required");
    setStaged((s) => [...s, draft]);
    setDraft(empty());
  };

  const m = useMutation({
    mutationFn: async () => {
      if (!name.trim()) throw new Error("Holder name is required");
      if (staged.length === 0) throw new Error("Add at least one linked account");
      const { data, error } = await supabase.rpc("create_holder_with_accounts", {
        p_canonical_name: name.trim(),
        p_holder_type: holderType,
        p_accounts: staged as any,
      });
      if (error) throw error;
      return data as any;
    },
    onSuccess: (data) => {
      toast.success(`Holder ${data.dahab_account_number} created with ${data.accounts_created} account(s)`);
      qc.invalidateQueries({ queryKey: ["holders.list"] });
      qc.invalidateQueries({ queryKey: ["holders.summary"] });
      reset();
      setOpen(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to create holder"),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) reset(); }}>
      <DialogTrigger asChild>
        <Button className="bg-gradient-gold text-primary-foreground shadow-gold hover:opacity-95">
          <UserPlus className="h-4 w-4 me-1" /> New holder
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create new DAHAB holder</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <Label>Canonical name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Layla Hassan" />
            </div>
            <div>
              <Label>Holder type</Label>
              <Select value={holderType} onValueChange={setHolderType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="INDIVIDUAL">Individual</SelectItem>
                  <SelectItem value="BUSINESS">Business</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="rounded-md border border-[oklch(0.82_0.14_85/0.18)] p-3">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-sm font-medium">Linked accounts <span className="text-xs text-muted-foreground">(at least one required — same currency may repeat)</span></div>
              <Badge variant="secondary">{staged.length} staged</Badge>
            </div>
            <div className="grid gap-2 sm:grid-cols-6">
              <Input className="sm:col-span-2" placeholder="Account #" value={draft.account_number} onChange={(e) => setDraft({ ...draft, account_number: e.target.value })} />
              <Select value={draft.currency_code} onValueChange={(v) => setDraft({ ...draft, currency_code: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                  <SelectItem value="LYD">LYD</SelectItem>
                </SelectContent>
              </Select>
              <Select value={draft.account_nature} onValueChange={(v) => setDraft({ ...draft, account_nature: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Debit">Debit</SelectItem>
                  <SelectItem value="Credit">Credit</SelectItem>
                </SelectContent>
              </Select>
              <Input className="sm:col-span-2" placeholder="Display name (optional)" value={draft.account_display_name} onChange={(e) => setDraft({ ...draft, account_display_name: e.target.value })} />
              <Input className="sm:col-span-5" placeholder="Alias (optional)" value={draft.account_alias_name} onChange={(e) => setDraft({ ...draft, account_alias_name: e.target.value })} />
              <Button type="button" variant="outline" onClick={addRow}><Plus className="h-4 w-4 me-1" /> Add</Button>
            </div>

            {staged.length > 0 && (
              <ul className="mt-3 space-y-1.5">
                {staged.map((s, i) => (
                  <li key={i} className="flex items-center justify-between gap-2 rounded border border-[oklch(0.82_0.14_85/0.12)] px-3 py-1.5 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge>{s.currency_code}</Badge>
                      <span className="font-mono text-xs">{s.account_number}</span>
                      <Badge variant="outline" className="text-xs">{s.account_nature}</Badge>
                      {s.account_display_name && <span className="text-xs text-muted-foreground">· {s.account_display_name}</span>}
                    </div>
                    <button type="button" onClick={() => setStaged((arr) => arr.filter((_, idx) => idx !== i))} className="text-muted-foreground hover:text-destructive">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            disabled={m.isPending || staged.length === 0 || !name.trim()}
            onClick={() => m.mutate()}
            className="bg-gradient-gold text-primary-foreground"
          >
            {m.isPending ? "Creating…" : "Create holder"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}