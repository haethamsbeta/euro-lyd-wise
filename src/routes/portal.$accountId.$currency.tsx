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
import { BackendPending } from "@/components/app/backend-pending";
import { DATA_BACKEND } from "@/lib/runtimeConfig";
import { displayTxNumber } from "@/lib/txDisplay";
import { ExportPdfButton } from "@/components/app/export-pdf";

export const Route = createFileRoute("/portal/$accountId/$currency")({
  component: AccountLedger,
});

function AccountLedger() {
  const { accountId, currency } = Route.useParams();
  const { session, loading, user, signOut } = useAuth();
  const nav = useNavigate();
  const t = useT();
  const isLambda = DATA_BACKEND === "lambda";

  useEffect(() => {
    if (!loading && !session) nav({ to: "/login", search: { portal: "consumer" } as any });
  }, [session, loading, nav]);

  const { data, isLoading } = useQuery({
    queryKey: ["portal.account", accountId, currency, user?.id],
    enabled: !!user?.id && !isLambda,
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
        displayTxNumber(t), t.created_at, t.direction, t.channel, t.currency,
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

  if (isLambda) {
    return (
      <div className="min-h-screen bg-muted/30">
        <header className="border-b bg-background">
          <div className="container mx-auto flex h-14 items-center justify-between px-6">
            <Link to="/portal" className="flex items-center gap-3"><DahabCoin /><DahabMark size="sm" showArabic={false} /></Link>
            <div className="flex items-center gap-3 text-sm">
              <LanguageToggle />
              <Button variant="ghost" size="sm" onClick={() => signOut()}><LogOut className="h-4 w-4" /></Button>
            </div>
          </div>
        </header>
        <main className="container mx-auto space-y-6 px-6 py-8">
          <Button asChild variant="outline" size="sm"><Link to="/portal"><ArrowLeft className="h-4 w-4" /> {t("portal.allAccounts")}</Link></Button>
          <BackendPending
            endpoint="GET /portal/accounts/:id/ledger (proposed)"
            note="The customer-facing portal API is not yet exposed by the backend. No fallback balances or ledger entries are shown."
          />
        </main>
      </div>
    );
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
            <div className="flex items-center gap-2">
              <ExportPdfButton
                title={`DAHAB Account Statement — ${data?.acc?.name ?? ""} (${currency})`}
                filenamePrefix={`dahab-statement-${currency}`}
                columns={[
                  { header: "TX #", width: 90 },
                  { header: "Date", width: 120 },
                  { header: "Type", width: 70 },
                  { header: "Channel", width: 80 },
                  { header: "Currency", width: 60 },
                  { header: "Amount", width: 90 },
                  { header: "Status", width: 70 },
                  { header: "Comment" },
                ]}
                buildRows={(fromD, toD) => {
                  const rows = (data?.tx ?? []).filter((t: any) => {
                    const d = new Date(t.created_at).getTime();
                    return d >= fromD.getTime() && d <= toD.getTime();
                  });
                  return rows.map((t: any) => [
                    displayTxNumber(t),
                    new Date(t.created_at).toLocaleString(),
                    String(t.direction ?? ""),
                    String(t.channel ?? ""),
                    String(t.currency ?? ""),
                    (Number(t.amount_minor ?? 0) / 100).toFixed(2),
                    String(t.status ?? ""),
                    String(t.comment ?? ""),
                  ]);
                }}
                buildSummary={(rows) => {
                  let credit = 0, debit = 0;
                  for (const r of rows) {
                    const amt = Number(r[5]) || 0;
                    if (String(r[2]).toLowerCase() === "deposit") credit += amt;
                    else debit += amt;
                  }
                  const net = credit - debit;
                  return `${rows.length} record${rows.length === 1 ? "" : "s"}  ·  Credits ${credit.toFixed(2)} ${currency}  ·  Debits ${debit.toFixed(2)} ${currency}  ·  Net ${net.toFixed(2)} ${currency}`;
                }}
              />
              <Button variant="outline" size="sm" onClick={exportCSV}>
                <Download className="me-1.5 h-4 w-4" /> {t("portal.exportCsv")}
              </Button>
            </div>
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