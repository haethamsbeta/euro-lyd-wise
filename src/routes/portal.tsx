import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, hasAnyRole } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight, LogOut } from "lucide-react";
import { DahabMark, DahabCoin } from "@/components/brand/dahab-mark";
import { formatMinor } from "@/lib/format";
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
      return { accounts: accs ?? [] };
    },
  });

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
        <div>
          <h1 className="font-serif text-3xl font-semibold gold-text">{t("portal.myAccounts")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{t("portal.myAccountsHint")}</p>
        </div>
        {(!data || data.accounts.length === 0) ? (
          <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">
            {t("portal.noAccounts")}
          </CardContent></Card>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {data.accounts.flatMap((a: any) =>
              (a.account_balances ?? []).map((b: any) => (
                <Link
                  key={`${a.id}-${b.currency}`}
                  to="/portal/$accountId/$currency"
                  params={{ accountId: a.id, currency: b.currency }}
                  className="group block"
                >
                  <Card className="card-luxe h-full transition-all hover:border-[oklch(0.82_0.14_85/0.45)] hover:shadow-gold">
                    <CardHeader className="pb-2">
                      <div className="flex items-center justify-between">
                        <span className="font-serif text-2xl tracking-wide text-gold">{b.currency}</span>
                        <ArrowRight className="h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1 group-hover:text-gold rtl:rotate-180 rtl:group-hover:-translate-x-1" />
                      </div>
                      <CardTitle className="text-sm font-medium text-muted-foreground">{a.name}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="font-mono text-3xl font-semibold tracking-tight text-foreground">
                        {formatMinor(b.balance_minor, b.currency)}
                      </div>
                      <div className="mt-2 flex items-center justify-between text-xs">
                        <span className="text-muted-foreground">#{a.account_number}</span>
                        <span className="text-gold/80 group-hover:text-gold">{t("portal.viewLedger")}</span>
                      </div>
                    </CardContent>
                  </Card>
                </Link>
              )),
            )}
          </div>
        )}
      </main>
    </div>
  );
}