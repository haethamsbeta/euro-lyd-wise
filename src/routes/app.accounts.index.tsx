import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, RoleGate } from "@/components/app/app-shell";
import { useAuth, hasAnyRole } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search } from "lucide-react";
import { formatMinor } from "@/lib/format";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { useDebounced } from "@/hooks/use-debounced";

export const Route = createFileRoute("/app/accounts/")({ component: AccountsList });

function AccountsList() {
  const t = useT();
  const { roles } = useAuth();
  const isAdmin = hasAnyRole(roles, ["admin"]);
  const [q, setQ] = useState("");
  const debouncedQ = useDebounced(q, 250);

  const { data, isLoading } = useQuery({
    queryKey: ["accounts.list", debouncedQ],
    queryFn: async () => {
      let query = supabase
        .from("accounts")
        .select("id, name, account_number, phone, national_id, nature, status, account_balances(currency, balance_minor)")
        .eq("kind", "customer")
        .order("created_at", { ascending: false });
      if (debouncedQ.trim()) {
        const term = debouncedQ.trim();
        query = query.or(`name.ilike.%${term}%,account_number.ilike.%${term}%,phone.ilike.%${term}%,national_id.ilike.%${term}%`);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <div>
      <PageHeader title={t("accounts.title")} description={t("accounts.subtitle")} actions={isAdmin ? <NewAccountDialog /> : null} />
      <div className="space-y-4 p-4 sm:p-6">
        <div className="relative max-w-sm">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input className="ps-9" placeholder={t("accounts.search")} value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 text-start">{t("accounts.col.number")}</th>
                    <th className="px-4 py-2 text-start">{t("accounts.col.name")}</th>
                    <th className="px-4 py-2 text-start">{t("accounts.col.nature")}</th>
                    <th className="px-4 py-2 text-end">USD</th>
                    <th className="px-4 py-2 text-end">EUR</th>
                    <th className="px-4 py-2 text-end">LYD</th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {isLoading ? (
                    <tr><td colSpan={7} className="p-4 text-center text-muted-foreground">{t("common.loading")}</td></tr>
                  ) : data && data.length === 0 ? (
                    <tr><td colSpan={7} className="p-4 text-center text-muted-foreground">{t("accounts.empty")}</td></tr>
                  ) : data!.map((a: any) => {
                    const bals = new Map(a.account_balances?.map((b: any) => [b.currency, b.balance_minor]) ?? []);
                    return (
                      <tr key={a.id} className="group transition-colors hover:bg-[oklch(0.78_0.13_82/0.05)]">
                        <td className="p-0"><Link to="/app/accounts/$id" params={{ id: a.id }} className="block px-4 py-3 font-mono">{a.account_number}</Link></td>
                        <td className="p-0"><Link to="/app/accounts/$id" params={{ id: a.id }} className="block px-4 py-3 font-medium">{a.name}</Link></td>
                        <td className="p-0"><Link to="/app/accounts/$id" params={{ id: a.id }} className="block px-4 py-3"><Badge variant="outline">{a.nature}</Badge></Link></td>
                        <td className="p-0"><Link to="/app/accounts/$id" params={{ id: a.id }} className="block px-4 py-3 text-end font-mono">{formatMinor((bals.get("USD") as number) ?? 0, "USD")}</Link></td>
                        <td className="p-0"><Link to="/app/accounts/$id" params={{ id: a.id }} className="block px-4 py-3 text-end font-mono">{formatMinor((bals.get("EUR") as number) ?? 0, "EUR")}</Link></td>
                        <td className="p-0"><Link to="/app/accounts/$id" params={{ id: a.id }} className="block px-4 py-3 text-end font-mono">{formatMinor((bals.get("LYD") as number) ?? 0, "LYD")}</Link></td>
                        <td className="px-4 py-2 text-end">
                          <Button asChild variant="ghost" size="sm"><Link to="/app/accounts/$id" params={{ id: a.id }}>{t("accounts.view")}</Link></Button>
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

const newSchema = z.object({
  name: z.string().trim().min(2).max(120),
  phone: z.string().trim().max(40).optional().or(z.literal("")),
  national_id: z.string().trim().max(40).optional().or(z.literal("")),
  nature: z.enum(["credit", "debit"]),
});

function NewAccountDialog() {
  const t = useT();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [nid, setNid] = useState("");
  const [nature, setNature] = useState<"credit" | "debit">("credit");

  const create = useMutation({
    mutationFn: async () => {
      const v = newSchema.parse({ name, phone, national_id: nid, nature });
      const { data: acc, error } = await supabase.from("accounts").insert({
        kind: "customer", nature: v.nature, name: v.name,
        phone: v.phone || null, national_id: v.national_id || null,
      }).select("id").single();
      if (error) throw error;
      // create three balance rows
      const rows = (["USD", "EUR", "LYD"] as const).map((c) => ({
        account_id: acc.id, currency: c, balance_minor: 0, debit_limit_minor: 0,
      }));
      const { error: bErr } = await supabase.from("account_balances").insert(rows);
      if (bErr) throw bErr;
    },
    onSuccess: () => {
      toast.success(t("accounts.created"));
      qc.invalidateQueries({ queryKey: ["accounts.list"] });
      setOpen(false);
      setName(""); setPhone(""); setNid(""); setNature("credit");
    },
    onError: (e: any) => toast.error(e.message ?? "Failed"),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button><Plus className="h-4 w-4" /> {t("accounts.new")}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader><DialogTitle>{t("accounts.newCustomer")}</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div><Label>{t("accounts.fName")}</Label><Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1" /></div>
          <div><Label>{t("accounts.fPhone")}</Label><Input value={phone} onChange={(e) => setPhone(e.target.value)} className="mt-1" /></div>
          <div><Label>{t("accounts.fNationalId")}</Label><Input value={nid} onChange={(e) => setNid(e.target.value)} className="mt-1" /></div>
          <div>
            <Label>{t("accounts.fNature")}</Label>
            <Select value={nature} onValueChange={(v) => setNature(v as any)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="credit">{t("accounts.natureCredit")}</SelectItem>
                <SelectItem value="debit">{t("accounts.natureDebit")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>{t("accounts.cancel")}</Button>
          <Button onClick={() => create.mutate()} disabled={create.isPending}>{t("accounts.create")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}