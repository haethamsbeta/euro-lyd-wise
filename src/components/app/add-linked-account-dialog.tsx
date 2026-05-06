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
import { Plus, Sparkles } from "lucide-react";
import { toast } from "sonner";

export function AddLinkedAccountDialog({ holderId }: { holderId: number }) {
  const [open, setOpen] = useState(false);
  const [currency, setCurrency] = useState("USD");
  const [nature, setNature] = useState("Debit");
  const [displayName, setDisplayName] = useState("");
  const [alias, setAlias] = useState("");
  const qc = useQueryClient();

  const m = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.rpc("add_account_to_holder", {
        p_holder_id: holderId,
        p_account: {
          currency_code: currency,
          account_nature: nature,
          account_display_name: displayName.trim() || undefined,
          account_alias_name: alias.trim() || undefined,
          is_primary_account: false,
        } as any,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Linked account added");
      qc.invalidateQueries({ queryKey: ["holder", holderId] });
      setDisplayName(""); setAlias("");
      setOpen(false);
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to add account"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm"><Plus className="h-4 w-4 me-1" /> Add account</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>Add linked account</DialogTitle></DialogHeader>
        <div className="grid gap-3">
          <div className="flex items-start gap-2 rounded-md border border-[oklch(0.82_0.14_85/0.25)] bg-[oklch(0.82_0.14_85/0.05)] p-3 text-xs">
            <Sparkles className="h-4 w-4 shrink-0 text-gold" />
            <span>
              Account number is generated automatically (e.g. <span className="font-mono text-gold">DAHAB-000409-USD-001</span>).
            </span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <Label>Currency</Label>
              <Select value={currency} onValueChange={setCurrency}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="USD">USD</SelectItem>
                  <SelectItem value="EUR">EUR</SelectItem>
                  <SelectItem value="LYD">LYD</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Nature</Label>
              <Select value={nature} onValueChange={setNature}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Debit">Debit</SelectItem>
                  <SelectItem value="Credit">Credit</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label>Display name (optional)</Label>
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
          </div>
          <div>
            <Label>Alias (optional)</Label>
            <Input value={alias} onChange={(e) => setAlias(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button disabled={m.isPending} onClick={() => m.mutate()} className="bg-gradient-gold text-primary-foreground">
            {m.isPending ? "Adding…" : "Add account"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}