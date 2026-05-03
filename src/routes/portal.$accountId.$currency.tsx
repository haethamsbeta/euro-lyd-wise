import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, LogOut, Download } from "lucide-react";
import { DahabMark, DahabCoin } from "@/components/brand/dahab-mark";
import { LanguageToggle } from "@/components/ui/language-toggle";
import { formatMinor } from "@/lib/format";
import { StatementLedger } from "@/components/app/statement-ledger";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/portal/$accountId/$currency")({
  component: AccountLedger,
});

function AccountLedger() {
  const { accountId, currency } = Route.useParams();
  const { session, loading, user, signOut } = useAuth();
  const nav = useNavigate();
  const t = useT();

  useEffect(() => {
    if (!loading && !session) nav({ to: "/login", search: { portal: "consumer" } as any });
  }, [session, loading, nav]);

  const { data, isLoading } = useQuery({
    queryKey: ["portal.account", accountId, currency, user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data: acc, error: e1 } = await supabase
        .from("accounts")
        .select("id, name, account_number, owner_user_id, account_balances(currency, balance_minor)")
        .eq("id", accountId)
        .maybeSingle();
      if (e1) throw e1;
      const { data: tx, error: e2 } = await supabase
        .from("transactions")
        .select("id, tx_number, direction, channel, currency, amount_minor, status, comment, created_at")
        .eq("customer_account_id", accountId)
        .eq("currency", currency as any)
        .order("created_at", { ascending: false })
        .limit(500);
      if (e2) throw e2;
      return { acc, tx: tx ?? [] };
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
    a.href = url; a.download = `ledger-${currency}.csv`; a.click();
    URL.revokeObjectURL(url);
  }

  const balance = data?.acc?.account_balances?.find((b: any) => b.currency === currency)?.balance_minor ?? 0;

  if (loading || !session) {
    return <div className="p-10 text-center text-muted-foreground">{t("common.loading")}</div>;
  }

  return (
    <div className="min-h-screen bg-muted/30">
      <header className="border-b bg-background">
        <div className="container mx-auto flex h-14 items-center justify-between px-6">
          <Link to="/portal" className="flex items-center gap-3"><DahabCoin /><DahabMark size="sm" showArabic={false} /></Link>
          <div className="flex items-center gap-3 text-sm">
            <LanguageToggle />
            <span className="text-muted-foreground">{user?.email}</span>
            <Button variant="ghost" size="sm" onClick={() => signOut()}><LogOut className="h-4 w-4" /></Button>
          </div>
        </div>
      </header>
      <main className="container mx-auto space-y-6 px-6 py-8">
        <div className="flex items-center justify-between gap-3">
          <Button asChild variant="outline" size="sm"><Link to="/portal"><ArrowLeft className="h-4 w-4" /> {t("portal.allAccounts")}</Link></Button>
        </div>

        <Card className="card-luxe">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <span className="font-serif text-3xl text-gold">{currency}</span>
              <span className="text-xs text-muted-foreground">#{data?.acc?.account_number}</span>
            </div>
            <CardTitle className="text-base font-medium text-muted-foreground">{data?.acc?.name}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-xs uppercase tracking-wide text-muted-foreground">{t("portal.currentBalance")}</div>
            <div className="font-mono text-4xl font-semibold tracking-tight">{formatMinor(balance, currency)}</div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="text-base">{t("portal.ledger")}</CardTitle>
            <Button variant="outline" size="sm" onClick={exportCSV}>
              <Download className="h-4 w-4" /> {t("portal.exportCsv")}
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-6 text-sm text-muted-foreground">{t("common.loading")}</div>
            ) : (
              <StatementLedger transactions={data?.tx ?? []} currency={currency} emptyText={t("portal.noTx")} />
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}