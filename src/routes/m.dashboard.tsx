import { createFileRoute } from "@tanstack/react-router";
import { PhoneShell, DahamLogo } from "@/components/mobile/phone-shell";
import { Menu, Bell, Eye, ArrowLeftRight, Receipt, Smartphone, CreditCard, Wallet, PiggyBank, ChevronRight, ScanLine, Home, LayoutGrid, MoreHorizontal, ShoppingBag, ArrowDownToLine } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/m/dashboard")({
  component: MobileDashboard,
  head: () => ({ meta: [{ title: "DAHAM — Dashboard" }] }),
});

function MobileDashboard() {
  const [hidden, setHidden] = useState(false);
  const fmt = (n: number) => `SAR ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const mask = "SAR ••••••";

  return (
    <PhoneShell footer={<BottomNav />}>
      <div className="flex-1 px-6 pt-3 pb-28 relative z-10 space-y-5">
        {/* header */}
        <div className="flex items-center justify-between">
          <button className="text-foreground/80"><Menu className="h-6 w-6" /></button>
          <button className="relative text-foreground/80">
            <Bell className="h-6 w-6" />
            <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-gold text-[10px] font-bold text-primary-foreground grid place-items-center">2</span>
          </button>
        </div>

        <div>
          <div className="text-foreground/80">Good morning,</div>
          <h1 className="font-serif text-3xl text-gold-deep">Ahmed</h1>
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
            <div className="mt-2 font-serif text-3xl font-semibold tracking-tight">{hidden ? mask : fmt(87392)}</div>

            <div className="mt-5 text-sm opacity-90">Available Balance</div>
            <div className="text-lg font-semibold">{hidden ? mask : fmt(63820.45)}</div>

            <div className="mt-4 flex items-center gap-1.5">
              <span className="h-1.5 w-4 rounded-full bg-white/90" />
              <span className="h-1.5 w-1.5 rounded-full bg-white/50" />
              <span className="h-1.5 w-1.5 rounded-full bg-white/50" />
              <span className="h-1.5 w-1.5 rounded-full bg-white/50" />
            </div>
          </div>
        </div>

        {/* accounts */}
        <div className="grid grid-cols-2 gap-3">
          <AccountCard icon={<Wallet className="h-5 w-5" />} label="Current Account" mask="•• 7022" amount={fmt(54321.75)} />
          <AccountCard icon={<PiggyBank className="h-5 w-5" />} label="Savings Account" mask="•• 6268" amount={fmt(33070.25)} />
        </div>

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
            <button className="text-sm text-gold-deep font-medium flex items-center">View All <ChevronRight className="h-4 w-4" /></button>
          </div>
          <div className="divide-y divide-border">
            <Tx icon={<ArrowLeftRight className="h-4 w-4" />} title="Transfer to Ali Mohammed" sub="Transfer" amount="- SAR 150.00" time="Today, 09:30 AM" />
            <Tx icon={<ShoppingBag className="h-4 w-4" />} title="Amazon Marketplace" sub="Shopping" amount="- SAR 249.99" time="Today, 08:15 AM" />
            <Tx icon={<ArrowDownToLine className="h-4 w-4" />} title="Salary Credit" sub="Income" amount="+ SAR 7,500.00" time="Yesterday, 09:00 AM" positive />
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