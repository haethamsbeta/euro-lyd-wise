import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, RoleGate } from "@/components/app/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Plus, Trash2, CheckCircle2, Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/app/holders/new")({
  component: () => (
    <RoleGate allow={["admin"]}>
      <NewHolderPage />
    </RoleGate>
  ),
});

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

function NewHolderPage() {
  const nav = useNavigate();
  const qc = useQueryClient();
  const [name, setName] = useState("");
  const [holderType, setHolderType] = useState("INDIVIDUAL");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [staged, setStaged] = useState<Staged[]>([]);
  const [draft, setDraft] = useState<Staged>(empty());

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
      if (data?.holder_id) {
        nav({ to: "/app/holders/$id", params: { id: String(data.holder_id) } });
      } else {
        nav({ to: "/app/holders" });
      }
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to create holder"),
  });

  return (
    <div>
      <PageHeader
        title="Create customer account"
        description="Register a new DAHAB holder and their linked currency accounts."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to="/app/holders">
              <ArrowLeft className="me-1 h-4 w-4" /> Back
            </Link>
          </Button>
        }
      />
      <div className="mx-auto max-w-3xl space-y-4 p-4 sm:p-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Holder details</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label>Canonical name</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Layla Hassan" />
            </div>
            <div className="space-y-1.5">
              <Label>Holder type</Label>
              <Select value={holderType} onValueChange={setHolderType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="INDIVIDUAL">Individual</SelectItem>
                  <SelectItem value="BUSINESS">Business</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Phone (optional)</Label>
              <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+218 …" />
            </div>
            <div className="space-y-1.5">
              <Label>Email (optional)</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="customer@example.com" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Sparkles className="h-4 w-4 text-gold" /> Linked currency accounts
              <Badge variant={staged.length > 0 ? "default" : "secondary"} className={staged.length > 0 ? "ms-auto bg-gradient-gold text-primary-foreground" : "ms-auto"}>
                {staged.length} staged
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Add at least one account. Account numbers are generated automatically (e.g. <span className="font-mono text-gold">DAHAB-000409-USD-001</span>).
            </p>

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
              <ul className="space-y-1.5">
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
            )}
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button variant="outline" asChild>
            <Link to="/app/holders">Cancel</Link>
          </Button>
          <Button
            disabled={m.isPending || staged.length === 0 || !name.trim()}
            onClick={() => m.mutate()}
            className="bg-gradient-gold text-primary-foreground"
          >
            {m.isPending ? <Loader2 className="me-1 h-4 w-4 animate-spin" /> : null}
            Create holder
          </Button>
        </div>
      </div>
    </div>
  );
}
