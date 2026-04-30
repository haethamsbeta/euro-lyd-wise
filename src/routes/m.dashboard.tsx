import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { PhoneShell, DahamLogo } from "@/components/mobile/phone-shell";
import { Menu, Bell, Eye, ArrowLeftRight, Receipt, Smartphone, CreditCard, Wallet, PiggyBank, ChevronRight, ScanLine, Home, MoreHorizontal, ArrowDownToLine, ArrowUpFromLine } from "lucide-react";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { formatMinor, formatDateTime } from "@/lib/format";

export const Route = createFileRoute("/m/dashboard")({
  component: MobileDashboard,
  head: () => ({ meta: [{ title: "DAHAM — Dashboard" }] }),
});

function MobileDashboard() {
  const [hidden, setHidden] = useState(false);
  const { user, session, loading } = useAuth();
  const nav = useNavigate();
  useEffect(() => { if (!loading && !session) nav({ to: "/m/login" }); }, [loading, session, nav]);

  const { data, isLoading } = useQuery({
    queryKey: ["m.dashboard", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data: accs, error: e1 } = await supabase
        .from("accounts")
        .select("id, name, account_number, account_balances(currency, balance_minor)")
        .eq("owner_user_id", user!.id);
      if (e1) throw e1;
      const ids = (accs ?? []).map((a) => a.id);
      const { data: tx, error: e2 } = ids.length
        ? await supabase.from("transactions")
            .select("id, tx_number, direction, channel, currency, amount_minor, status, comment, created_at")
            .in("customer_account_id", ids)
            .order("created_at", { ascending: false }).limit(6)
        : { data: [], error: null as any };
      if (e2) throw e2;
      return { accounts: accs ?? [], tx: tx ?? [] };
    },
  });

  const firstName = (user?.user_metadata?.full_name || user?.email?.split("@")[0] || "Guest").toString().split(" ")[0];

  // aggregate balances by currency
  const balByCur = new Map<string, number>();
  for (const a of data?.accounts ?? []) {
    for (const b of (a as any).account_balances ?? []) {
      balByCur.set(b.currency, (balByCur.get(b.currency) ?? 0) + b.balance_minor);
    }
  }
  const primaryCur = balByCur.size ? [...balByCur.keys()][0] : "USD";
  const totalMinor = balByCur.get(primaryCur) ?? 0;
  const mask = `${primaryCur} ••••••`;
  const accountCards = (data?.accounts ?? []).slice(0, 2);

  return (
    <PhoneShell footer={<BottomNav />}>
      <div className="flex-1 px-6 pt-3 pb-28 relative z-10 space-y-5">
        {/* header */}
        <div className="flex items-center justify-between">
          <button className="text-foreground/80"><Menu className="h-6 w-6" /></button>
          <button className="relative text-foreground/80">
            <Bell className="h-6 w-6" />
          </button>
        </div>

        <div>
          <div className="text-foreground/80">Good morning,</div>
          <h1 className="font-serif text-3xl text-gold-deep capitalize">{firstName}</h1>
          <p className="text-sm text-muted-foreground mt-1">Welcome back to your DAHAM account</p>
        </div>

        {/* balance card */}
        <div className="relative overflow-hidden rounded-3xl p-5 text-primary-foreground shadow-gold" style={{ backgroundImage: "var(--gradient-gold)" }}>
          <div className="absolute -right-4 -bottom-4 opacity-30"><DahamLogo size={140} /></div>
          <div className="relative">
            <div className="flex items-center gap-2 text-sm/none opacity-90">
              Total Balance
              <button onClick={() => setHidden((h) => !h)}><Eye className="h-4 w-4" /></button>
            </div>
            <div className="mt-2 font-serif text-3xl font-semibold tracking-tight">
              {hidden ? mask : formatMinor(totalMinor, primaryCur)}
            </div>

            <div className="mt-4 flex flex-wrap items-center gap-1.5">
              {[...balByCur.keys()].map((c, i) => (
                <span key={c} className={`text-[11px] px-2 py-0.5 rounded-full ${i === 0 ? "bg-white/90 text-gold-deep" : "bg-white/20 text-white"}`}>
                  {c}
                </span>
              ))}
              {balByCur.size === 0 && !isLoading ? (
                <span className="text-[11px] opacity-80">No accounts yet</span>
              ) : null}
            </div>
          </div>
        </div>

        {/* accounts */}
        {accountCards.length > 0 ? (
          <div className="grid grid-cols-2 gap-3">
            {accountCards.map((a: any, idx: number) => {
              const b = (a.account_balances ?? [])[0];
              const last4 = (a.account_number ?? "").toString().slice(-4) || "----";
              return (
                <AccountCard
                  key={a.id}
                  icon={idx === 0 ? <Wallet className="h-5 w-5" /> : <PiggyBank className="h-5 w-5" />}
                  label={a.name}
                  mask={`•• ${last4}`}
                  amount={b ? formatMinor(b.balance_minor, b.currency) : "—"}
                />
              );
            })}
          </div>
        ) : null}

        {/* quick actions */}
        <div className="rounded-2xl bg-card border border-border p-4 grid grid-cols-4 gap-2">
          <Action icon={<ArrowLeftRight className="h-5 w-5" />} label="Transfer" />
          <Action icon={<Receipt className="h-5 w-5" />} label="Pay Bills" />
          <Action icon={<Smartphone className="h-5 w-5" />} label="Top Up" />
          <Action icon={<CreditCard className="h-5 w-5" />} label="Cards" />
        </div>

        {/* transactions */}
        <div className="rounded-2xl bg-card border border-border p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-serif text-lg">Recent Transactions</h2>
            <Link to="/portal" className="text-sm text-gold-deep font-medium flex items-center">View All <ChevronRight className="h-4 w-4" /></Link>
          </div>
          <div className="divide-y divide-border">
            {isLoading ? (
              <div className="py-6 text-center text-sm text-muted-foreground">Loading…</div>
            ) : (data?.tx ?? []).length === 0 ? (
              <div className="py-6 text-center text-sm text-muted-foreground">No transactions yet</div>
            ) : (
              data!.tx.map((t) => {
                const positive = t.direction === "deposit";
                return (
                  <Tx
                    key={t.id}
                    icon={positive ? <ArrowDownToLine className="h-4 w-4" /> : <ArrowUpFromLine className="h-4 w-4" />}
                    title={t.comment || t.tx_number}
                    sub={`${t.direction} · ${t.channel}`}
                    amount={`${positive ? "+ " : "- "}${formatMinor(t.amount_minor, t.currency)}`}
                    time={formatDateTime(t.created_at)}
                    positive={positive}
                  />
                );
              })
            )}
          </div>
        </div>
      </div>
    </PhoneShell>
  );
}

function AccountCard({ icon, label, mask, amount }: { icon: React.ReactNode; label: string; mask: string; amount: string }) {
  return (
    <div className="rounded-2xl bg-card border border-border p-4 flex items-start gap-3">
      <div className="h-10 w-10 rounded-xl grid place-items-center bg-accent/60 text-gold-deep">{icon}</div>
      <div className="flex-1 min-w-0">
        <div className="text-xs text-muted-foreground">{label}</div>
        <div className="text-[11px] text-muted-foreground">{mask}</div>
        <div className="text-sm font-semibold text-foreground mt-1">{amount}</div>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </div>
  );
}

function Action({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <button className="flex flex-col items-center gap-2 py-1">
      <span className="h-12 w-12 rounded-2xl grid place-items-center bg-accent/60 text-gold-deep">{icon}</span>
      <span className="text-xs text-foreground/85">{label}</span>
    </button>
  );
}

function Tx({ icon, title, sub, amount, time, positive }: { icon: React.ReactNode; title: string; sub: string; amount: string; time: string; positive?: boolean }) {
  return (
    <div className="flex items-center gap-3 py-3">
      <span className="h-9 w-9 rounded-full grid place-items-center bg-secondary text-gold-deep">{icon}</span>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-foreground truncate">{title}</div>
        <div className="text-[11px] text-muted-foreground">{sub}</div>
      </div>
      <div className="text-right">
        <div className={`text-sm font-semibold ${positive ? "text-success" : "text-foreground"}`}>{amount}</div>
        <div className="text-[11px] text-muted-foreground">{time}</div>
      </div>
    </div>
  );
}

function BottomNav() {
  return (
    <div className="relative px-6 py-3 grid grid-cols-5 items-end">
      <NavItem icon={<Home className="h-5 w-5" />} label="Home" active />
      <NavItem icon={<Wallet className="h-5 w-5" />} label="Accounts" />
      <div className="flex justify-center">
        <button className="-mt-8 h-14 w-14 rounded-full grid place-items-center text-primary-foreground shadow-gold" style={{ backgroundImage: "var(--gradient-gold)" }}>
          <ScanLine className="h-6 w-6" />
        </button>
      </div>
      <NavItem icon={<CreditCard className="h-5 w-5" />} label="Cards" />
      <NavItem icon={<MoreHorizontal className="h-5 w-5" />} label="More" />
    </div>
  );
}

function NavItem({ icon, label, active }: { icon: React.ReactNode; label: string; active?: boolean }) {
  return (
    <button className={`flex flex-col items-center gap-1 ${active ? "text-gold-deep" : "text-muted-foreground"}`}>
      {icon}
      <span className="text-[10px] font-medium">{label}</span>
    </button>
  );
}