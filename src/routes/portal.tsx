import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, hasAnyRole } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { LogOut } from "lucide-react";
import { DahabMark, DahabCoin } from "@/components/brand/dahab-mark";
import { formatMinor, formatDateTime } from "@/lib/format";
import { LanguageToggle } from "@/components/ui/language-toggle";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/portal")({
  component: Portal,
  head: () => ({ meta: [{ title: "Customer portal — Dahab" }] }),
});

function Portal() {
  const { session, loading, rolesLoading, signOut, user, roles } = useAuth();
  const nav = useNavigate();
  const t = useT();
  useEffect(() => {
    if (loading) return;
    if (!session) {
      nav({ to: "/login", search: { portal: "consumer" } as any });
      return;
    }
    // Staff users belong in the back-office, not the customer portal.
    if (!rolesLoading && hasAnyRole(roles, ["admin", "teller", "auditor"])) {
      nav({ to: "/app" });
    }
  }, [session, loading, rolesLoading, roles, nav]);

  const { data } = useQuery({
    queryKey: ["portal", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data: accs, error: e1 } = await supabase
        .from("accounts")
        .select("id, name, account_number, account_balances(currency, balance_minor)")
        .eq("owner_user_id", user!.id);
      if (e1) throw e1;
      const accountIds = (accs ?? []).map((a) => a.id);
      const { data: tx, error: e2 } = accountIds.length
        ? await supabase.from("transactions")
            .select("id, tx_number, direction, channel, currency, amount_minor, status, comment, created_at, customer_account_id")
            .in("customer_account_id", accountIds)
            .order("created_at", { ascending: false }).limit(200)
        : { data: [], error: null as any };
      if (e2) throw e2;
      return { accounts: accs ?? [], tx: tx ?? [] };
    },
  });

  function exportCSV() {
    if (!data) return;
    const rows = [
      ["TX #", "Date", "Type", "Channel", "Currency", "Amount", "Status", "Comment"],
      ...data.tx.map((t) => [
        t.tx_number, t.created_at, t.direction, t.channel, t.currency,
        (t.amount_minor / 100).toFixed(2), t.status, t.comment,
      ]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "ledger.csv"; a.click();
    URL.revokeObjectURL(url);
  }

  if (loading || !session) return <div className="p-10 text-center text-muted-foreground">{t("common.loading")}</div>;

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="container mx-auto flex h-14 items-center justify-between px-6">
          <Link to="/" className="flex items-center gap-3"><DahabCoin /><DahabMark size="sm" showArabic={false} /></Link>
          <div className="flex items-center gap-3 text-sm">
            <LanguageToggle />
            <span className="text-muted-foreground">{user?.email}</span>
            <Button variant="ghost" size="sm" onClick={() => signOut()}><LogOut className="h-4 w-4" /></Button>
          </div>
        </div>
      </header>
      <main className="container mx-auto space-y-6 px-6 py-8">
        {(!data || data.accounts.length === 0) ? (
          <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
            {t("portal.noAccounts")}
          </CardContent></Card>
        ) : (
          <>
            <div className="grid gap-3 md:grid-cols-3">
              {data.accounts.flatMap((a: any) =>
                (a.account_balances ?? []).map((b: any) => (
                  <Card key={`${a.id}-${b.currency}`}>
                    <CardHeader className="pb-2"><CardTitle className="text-base">{a.name} · {b.currency}</CardTitle></CardHeader>
                    <CardContent>
                      <div className="font-mono text-2xl">{formatMinor(b.balance_minor, b.currency)}</div>
                      <div className="mt-1 text-xs text-muted-foreground">#{a.account_number}</div>
                    </CardContent>
                  </Card>
                )),
              )}
            </div>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">{t("portal.ledger")}</CardTitle>
                <Button variant="outline" size="sm" onClick={exportCSV}>{t("portal.exportCsv")}</Button>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                      <tr>
                        <th className="px-4 py-2 text-start">{t("portal.col.tx")}</th>
                        <th className="px-4 py-2 text-start">{t("portal.col.date")}</th>
                        <th className="px-4 py-2 text-start">{t("portal.col.type")}</th>
                        <th className="px-4 py-2 text-start">{t("portal.col.channel")}</th>
                        <th className="px-4 py-2 text-end">{t("portal.col.amount")}</th>
                        <th className="px-4 py-2 text-start">{t("portal.col.status")}</th>
                        <th className="px-4 py-2 text-start">{t("portal.col.comment")}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {data.tx.map((t) => (
                        <tr key={t.id}>
                          <td className="px-4 py-2 font-mono">{t.tx_number}</td>
                          <td className="px-4 py-2 text-muted-foreground">{formatDateTime(t.created_at)}</td>
                          <td className="px-4 py-2 capitalize">{t.direction}</td>
                          <td className="px-4 py-2 capitalize">{t.channel}</td>
                          <td className={`px-4 py-2 text-end font-mono ${t.direction === "deposit" ? "text-success" : "text-destructive"}`}>
                            {t.direction === "deposit" ? "+" : "−"}{formatMinor(t.amount_minor, t.currency)}
                          </td>
                          <td className="px-4 py-2"><Badge variant={t.status === "posted" ? "secondary" : "outline"}>{t.status}</Badge></td>
                          <td className="max-w-md truncate px-4 py-2 text-muted-foreground">{t.comment}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </>
        )}
      </main>
    </div>
  );
}