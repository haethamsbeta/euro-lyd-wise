import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ArrowRight, ShieldCheck, Scale, Eye, Sparkles } from "lucide-react";
import { DahabMark, DahabCoin } from "@/components/brand/dahab-mark";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "Dahab — Private Banking Ledger" },
      { name: "description", content: "Dahab (ذهب) — a private banking ledger built on double-entry precision and gold-standard auditability." },
    ],
  }),
});

function Index() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      {/* Decorative gold glow */}
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[60vh]" style={{ backgroundImage: "var(--gradient-vault)" }} />
      <div className="pointer-events-none absolute -top-40 left-1/2 -z-10 h-[40rem] w-[40rem] -translate-x-1/2 rounded-full bg-[oklch(0.82_0.14_85/0.08)] blur-3xl" />

      <header className="relative z-10 border-b border-[oklch(0.82_0.14_85/0.12)]">
        <div className="container mx-auto flex h-16 items-center justify-between px-6">
          <div className="flex items-center gap-3">
            <DahabCoin />
            <DahabMark size="sm" showArabic={false} />
          </div>
          <nav className="flex items-center gap-2">
            <Button asChild variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
              <Link to="/portal">Customer portal</Link>
            </Button>
            <Button asChild variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
              <Link to="/m">Mobile app</Link>
            </Button>
            <Button
              asChild
              size="sm"
              className="bg-gradient-gold text-primary-foreground shadow-gold hover:opacity-95"
            >
              <Link to="/login">
                Sign in <ArrowRight className="ml-1 h-3.5 w-3.5" />
              </Link>
            </Button>
          </nav>
        </div>
      </header>

      <main className="container relative z-10 mx-auto px-6 pt-24 pb-32">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-[oklch(0.82_0.14_85/0.25)] bg-[oklch(0.82_0.14_85/0.05)] px-4 py-1.5 text-xs uppercase tracking-[0.32em] text-gold">
            <Sparkles className="h-3 w-3" />
            <span>Private banking, weighed in gold</span>
          </div>

          <h1 className="mt-8 font-serif text-6xl font-semibold leading-[1.05] tracking-tight md:text-7xl">
            <span className="gold-text">Dahab.</span>
            <span className="block text-foreground">Where every entry is</span>
            <span className="block italic text-muted-foreground">precision-balanced.</span>
          </h1>

          <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-muted-foreground">
            A double-entry ledger purpose-built for trusted financial institutions —
            with dedicated cash, bank, and wire vaults for every currency, role-aware approvals,
            and a calm, glass-clear customer view.
          </p>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
            <Button asChild size="lg" className="bg-gradient-gold px-8 text-primary-foreground shadow-gold hover:opacity-95">
              <Link to="/login">
                Enter the vault <ArrowRight className="ml-1.5 h-4 w-4" />
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="border-[oklch(0.82_0.14_85/0.3)] bg-transparent text-foreground hover:bg-[oklch(0.82_0.14_85/0.06)]">
              <Link to="/portal">Customer portal</Link>
            </Button>
          </div>

          <div className="mx-auto mt-16 hr-gold max-w-xs" />

          <p className="mt-4 font-serif italic text-sm text-muted-foreground">
            ذهب · the Arabic word for gold
          </p>
        </div>

        {/* Pillars */}
        <div className="mx-auto mt-24 grid max-w-5xl gap-px overflow-hidden rounded-2xl border border-[oklch(0.82_0.14_85/0.18)] bg-[oklch(0.82_0.14_85/0.18)] md:grid-cols-3">
          {[
            { icon: Scale, title: "Double-entry, always", body: "Every credit meets its debit. Cash deposits flow from the vault; withdrawals reverse it. The books cannot lie." },
            { icon: ShieldCheck, title: "Role-aware approvals", body: "Tellers post; admins approve over-balance withdrawals; auditors observe everything in read-only." },
            { icon: Eye, title: "Customer transparency", body: "A glass-clear portal gives customers their balances and history — never the back-office controls." },
          ].map(({ icon: Icon, title, body }) => (
            <div key={title} className="bg-card p-8">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-[oklch(0.82_0.14_85/0.3)] bg-[oklch(0.82_0.14_85/0.08)] text-gold">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 font-serif text-lg font-semibold">{title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
      </main>

      <footer className="relative z-10 border-t border-[oklch(0.82_0.14_85/0.12)] py-8 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} Dahab Financial · ذهب · A private banking ledger
      </footer>
    </div>
  );
}
