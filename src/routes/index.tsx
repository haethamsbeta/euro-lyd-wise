import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Building2,
  User,
  Smartphone,
  ArrowRight,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { PremiumCard } from "@/components/ui/premium-card";
import { DahabMark, DahabCoin } from "@/components/brand/dahab-mark";
import { LanguageToggle } from "@/components/ui/language-toggle";

export const Route = createFileRoute("/")({
  component: Index,
  head: () => ({
    meta: [
      { title: "Dahab — Private Banking Ledger" },
      {
        name: "description",
        content:
          "Welcome to Dahab — choose the customer portal for account holders or the staff back-office for Dahab's multi-currency private banking team.",
      },
      { property: "og:title", content: "Dahab — Private Banking Ledger" },
      { property: "og:description", content: "Multi-currency private banking for families and businesses in Libya, with double-entry precision and full audit trails." },
      { property: "og:url", content: "https://dahablibya.com/" },
      { property: "og:type", content: "website" },
    ],
    links: [
      { rel: "canonical", href: "https://dahablibya.com/" },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "Organization",
              name: "Dahab",
              alternateName: "ذهب",
              url: "https://dahablibya.com/",
              description: "Private banking ledger for families and businesses in Libya.",
            },
            {
              "@type": "FinancialService",
              name: "Dahab — Private Banking",
              url: "https://dahablibya.com/",
              areaServed: "LY",
              currenciesAccepted: "LYD, USD, EUR, GBP",
              description: "Multi-currency accounts, vault custody, and audited transaction posting.",
            },
            {
              "@type": "WebSite",
              name: "Dahab",
              url: "https://dahablibya.com/",
            },
          ],
        }),
      },
    ],
  }),
});

// Lightweight CSS-driven stagger so the landing page doesn't ship framer-motion.
const fadeUp = "animate-in fade-in slide-in-from-bottom-4 fill-mode-both duration-500";
const stagger = (i: number) => ({ animationDelay: `${50 + i * 100}ms` });

function Index() {
  return (
    <div className="relative min-h-[100svh] md:min-h-screen overflow-hidden bg-background text-foreground">
      {/* Background flourish */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 left-1/2 h-[1000px] w-[1000px] -translate-x-1/2 rounded-full bg-[oklch(0.82_0.14_85/0.05)] blur-3xl" />
        <div className="absolute bottom-0 left-0 h-[600px] w-[600px] rounded-full bg-[oklch(0.82_0.14_85/0.03)] blur-3xl" />
        <div className="absolute bottom-0 right-0 h-[500px] w-[500px] rounded-full bg-[oklch(0.82_0.14_85/0.025)] blur-3xl" />
        <svg className="absolute inset-0 h-full w-full opacity-[0.03]" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <pattern id="land-grid" width="60" height="60" patternUnits="userSpaceOnUse">
              <path d="M 60 0 L 0 0 0 60" fill="none" stroke="currentColor" className="text-gold" strokeWidth="1" />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#land-grid)" />
        </svg>
      </div>

      <div
        className="relative z-10 flex min-h-[100svh] md:min-h-screen flex-col px-4 sm:px-6 sm:py-10"
        style={{
          paddingTop: "max(1.25rem, env(safe-area-inset-top))",
          paddingBottom: "max(1rem, env(safe-area-inset-bottom))",
          paddingLeft: "max(1rem, env(safe-area-inset-left))",
          paddingRight: "max(1rem, env(safe-area-inset-right))",
        }}
      >
        {/* Header */}
        <header
          className={`mx-auto flex w-full max-w-7xl items-center justify-between ${fadeUp}`}
          style={stagger(0)}
        >
          <Link to="/" aria-label="Dahab — Home" className="flex items-center gap-3">
            <DahabCoin />
            <div className="hidden sm:block">
              <DahabMark size="sm" showArabic={false} />
            </div>
          </Link>
          <div className="flex items-center gap-3">
            <div className="hidden items-center gap-2 text-xs text-muted-foreground sm:flex">
              <ShieldCheck className="h-3.5 w-3.5 text-gold" />
              Protected by 256-bit encryption
            </div>
            <LanguageToggle />
          </div>
        </header>

        {/* Hero */}
        <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col items-center justify-center py-6 sm:py-16">
          <div className={`mb-6 sm:mb-14 text-center ${fadeUp}`} style={stagger(1)}>
            <span className="mb-4 inline-flex items-center gap-2 rounded-full border border-[oklch(0.82_0.14_85/0.25)] bg-[oklch(0.82_0.14_85/0.08)] px-3 py-1.5 text-[10px] font-medium uppercase tracking-[0.3em] text-gold">
              <Sparkles className="h-3 w-3" /> Welcome to Dahab
            </span>
            <h1 className="font-serif text-[clamp(1.75rem,8vw,2.25rem)] sm:text-4xl font-semibold leading-tight tracking-tight text-foreground md:text-6xl">
              How would you like
              <br />
              to <span className="italic text-gold-soft">continue?</span>
            </h1>
            <p className="mx-auto mt-4 sm:mt-5 max-w-xl text-sm sm:text-base leading-relaxed text-muted-foreground md:text-lg">
              Choose the experience that fits you — for our families and
              businesses, or for our staff who serve them.
            </p>
          </div>

          {/* Choice cards */}
          <div
            className={`grid w-full max-w-4xl gap-4 sm:gap-5 md:grid-cols-2 ${fadeUp}`}
            style={stagger(2)}
          >
            {/* Customer Portal */}
            <Link
              to="/login"
              search={{ portal: "consumer", lock: 1 } as any}
              className="group block"
            >
              <PremiumCard
                variant="premium"
                className="h-full p-6 sm:p-8 transition-all group-hover:-translate-y-1 group-hover:border-[oklch(0.82_0.14_85/0.5)] group-hover:shadow-[0_12px_48px_oklch(0_0_0/0.5),0_0_80px_oklch(0.82_0.14_85/0.12)]"
              >
                <div className="absolute right-0 top-0 h-64 w-64 rounded-full bg-[oklch(0.82_0.14_85/0.04)] blur-3xl transition-colors group-hover:bg-[oklch(0.82_0.14_85/0.08)]" />
                <div className="relative z-10 flex h-full flex-col">
                  <div className="mb-4 sm:mb-6 flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-2xl border border-[oklch(0.82_0.14_85/0.3)] bg-gradient-to-br from-[oklch(0.82_0.14_85/0.3)] via-[oklch(0.55_0.13_72/0.4)] to-card shadow-[0_0_30px_oklch(0.82_0.14_85/0.2)] transition-transform group-hover:scale-105">
                    <User className="h-6 w-6 text-gold-soft" />
                  </div>
                  <span className="mb-2 text-[10px] font-medium uppercase tracking-[0.25em] text-gold">
                    For account holders
                  </span>
                  <h2 className="mb-2 sm:mb-3 font-serif text-xl sm:text-2xl font-semibold text-foreground">
                    Customer Portal
                  </h2>
                  <p className="mb-6 sm:mb-8 flex-1 text-sm leading-relaxed text-muted-foreground">
                    View your accounts, balances, and statements. Send money
                    across currencies and manage your Dahab profile from one
                    place.
                  </p>
                  <div className="flex items-center justify-between border-t border-border/60 pt-4">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      4 currencies · 24/7
                    </span>
                    <span className="flex items-center gap-2 text-sm font-medium text-gold group-hover:text-gold-soft">
                      Continue
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1 rtl:rotate-180 rtl:group-hover:-translate-x-1" />
                    </span>
                  </div>
                </div>
              </PremiumCard>
            </Link>

            {/* Dahab Family (Staff) */}
            <Link
              to="/login"
              search={{ portal: "staff", lock: 1 } as any}
              className="group block"
            >
              <PremiumCard
                variant="premium"
                className="h-full p-6 sm:p-8 transition-all group-hover:-translate-y-1 group-hover:border-[oklch(0.82_0.14_85/0.5)] group-hover:shadow-[0_12px_48px_oklch(0_0_0/0.5),0_0_80px_oklch(0.82_0.14_85/0.12)]"
              >
                <div className="absolute right-0 top-0 h-64 w-64 rounded-full bg-[oklch(0.82_0.14_85/0.04)] blur-3xl transition-colors group-hover:bg-[oklch(0.82_0.14_85/0.08)]" />
                <div className="relative z-10 flex h-full flex-col">
                  <div className="mb-4 sm:mb-6 flex h-12 w-12 sm:h-14 sm:w-14 items-center justify-center rounded-2xl border border-[oklch(0.82_0.14_85/0.3)] bg-gradient-to-br from-[oklch(0.82_0.14_85/0.3)] via-[oklch(0.55_0.13_72/0.4)] to-card shadow-[0_0_30px_oklch(0.82_0.14_85/0.2)] transition-transform group-hover:scale-105">
                    <Building2 className="h-6 w-6 text-gold-soft" />
                  </div>
                  <span className="mb-2 text-[10px] font-medium uppercase tracking-[0.25em] text-gold">
                    For Dahab staff
                  </span>
                  <h2 className="mb-2 sm:mb-3 font-serif text-xl sm:text-2xl font-semibold text-foreground">
                    Dahab Family
                  </h2>
                  <p className="mb-6 sm:mb-8 flex-1 text-sm leading-relaxed text-muted-foreground">
                    Back-office mission control. Manage holders, approve
                    transactions, oversee vaults, and audit every movement
                    across the network.
                  </p>
                  <div className="flex items-center justify-between border-t border-border/60 pt-4">
                    <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                      Admin · Teller · Auditor
                    </span>
                    <span className="flex items-center gap-2 text-sm font-medium text-gold group-hover:text-gold-soft">
                      Sign in
                      <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1 rtl:rotate-180 rtl:group-hover:-translate-x-1" />
                    </span>
                  </div>
                </div>
              </PremiumCard>
            </Link>
          </div>

          {/* Mobile Teller subtle link */}
          <div
            className={`mt-6 sm:mt-10 flex items-center justify-center ${fadeUp}`}
            style={stagger(3)}
          >
            <Link
              to="/m"
              className="group flex items-center gap-2 rounded-full border border-border/60 bg-card/40 px-4 py-2 text-xs backdrop-blur-sm transition-colors hover:border-[oklch(0.82_0.14_85/0.3)] hover:bg-card/70"
            >
              <Smartphone className="h-3.5 w-3.5 text-gold" />
              <span className="text-muted-foreground transition-colors group-hover:text-foreground">
                Mobile Teller?
                <span className="ms-1 text-gold">Open the field app →</span>
              </span>
            </Link>
          </div>
        </main>

        {/* Footer */}
        <footer
          className={`mx-auto mt-auto w-full max-w-7xl border-t border-border/40 pt-6 sm:pt-8 ${fadeUp}`}
          style={stagger(4)}
        >
          <div className="flex flex-col items-center justify-between gap-3 text-xs text-muted-foreground sm:flex-row">
            <p>© 2026 Dahab Bank · Member of the Libyan Banking Association</p>
            <div className="flex items-center gap-4">
              <a href="#" className="transition-colors hover:text-gold">Privacy</a>
              <a href="#" className="transition-colors hover:text-gold">Terms</a>
              <a href="#" className="transition-colors hover:text-gold">Support</a>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}