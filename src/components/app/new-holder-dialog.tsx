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
import { Plus, Trash2, UserPlus, CheckCircle2, Sparkles } from "lucide-react";
import { toast } from "sonner";

type Staged = {
  currency_code: string;
  account_nature: string;
  account_display_name: string;
  account_alias_name: string;
  is_primary_account: boolean;
};

const empty = (): Staged => ({
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
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [staged, setStaged] = useState<Staged[]>([]);
  const [draft, setDraft] = useState<Staged>(empty());
  const qc = useQueryClient();

  const reset = () => {
    setName(""); setHolderType("INDIVIDUAL"); setPhone(""); setEmail(""); setStaged([]); setDraft(empty());
  };

  const addRow = () => {
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
        p_phone: phone.trim() || null,
        p_email: email.trim() || null,
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
            <div>
              <Label>Phone (optional)</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+218 …" />
            </div>
            <div>
              <Label>Email (optional)</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="customer@example.com" />
            </div>
          </div>

          <div className="rounded-lg border border-[oklch(0.82_0.14_85/0.3)] bg-[linear-gradient(135deg,oklch(0.82_0.14_85/0.06),transparent)] p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-gold" />
                  <h3 className="font-serif text-base">Linked currency accounts</h3>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  Add at least one account. Account numbers are generated automatically (e.g. <span className="font-mono text-gold">DAHAB-000409-USD-001</span>).
                </p>
              </div>
              <Badge variant={staged.length > 0 ? "default" : "secondary"} className={staged.length > 0 ? "bg-gradient-gold text-primary-foreground" : ""}>
                {staged.length} staged
              </Badge>
            </div>

            <div className="grid gap-2 sm:grid-cols-6">
              <div className="sm:col-span-2">
                <Label className="text-xs">Currency</Label>
                <Select value={draft.currency_code} onValueChange={(v) => setDraft({ ...draft, currency_code: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="USD">USD — US Dollar</SelectItem>
                    <SelectItem value="EUR">EUR — Euro</SelectItem>
                    <SelectItem value="LYD">LYD — Libyan Dinar</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2">
                <Label className="text-xs">Nature</Label>
                <Select value={draft.account_nature} onValueChange={(v) => setDraft({ ...draft, account_nature: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Debit">Debit</SelectItem>
                    <SelectItem value="Credit">Credit</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="sm:col-span-2">
                <Label className="text-xs">Display name (optional)</Label>
                <Input placeholder="e.g. Main USD wallet" value={draft.account_display_name} onChange={(e) => setDraft({ ...draft, account_display_name: e.target.value })} />
              </div>
              <div className="sm:col-span-5">
                <Label className="text-xs">Alias (optional)</Label>
                <Input placeholder="Internal nickname" value={draft.account_alias_name} onChange={(e) => setDraft({ ...draft, account_alias_name: e.target.value })} />
              </div>
              <div className="flex items-end">
                <Button type="button" variant="outline" className="w-full border-[oklch(0.82_0.14_85/0.5)] text-gold hover:bg-[oklch(0.82_0.14_85/0.1)]" onClick={addRow}>
                  <Plus className="h-4 w-4 me-1" /> Add
                </Button>
              </div>
            </div>

            {staged.length > 0 && (
              <>
                <div className="mt-3 flex items-center gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-2 text-xs text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>
                    {staged.length} linked account{staged.length === 1 ? "" : "s"} ready — add more or create the holder.
                  </span>
                </div>
                <ul className="mt-3 space-y-1.5">
                  {staged.map((s, i) => (
                    <li key={i} className="flex items-center justify-between gap-2 rounded-md border border-[oklch(0.82_0.14_85/0.2)] bg-card/60 px-3 py-2 text-sm">
                      <div className="flex flex-wrap items-center gap-2">
                        <CheckCircle2 className="h-4 w-4 text-gold" />
                        <Badge>{s.currency_code}</Badge>
                        <Badge variant="outline" className="text-xs">{s.account_nature}</Badge>
                        {s.account_display_name && <span className="text-xs text-muted-foreground">· {s.account_display_name}</span>}
                        <span className="text-[10px] text-muted-foreground">(account # auto-generated)</span>
                      </div>
                      <button type="button" onClick={() => setStaged((arr) => arr.filter((_, idx) => idx !== i))} className="text-muted-foreground hover:text-destructive">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              </>
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