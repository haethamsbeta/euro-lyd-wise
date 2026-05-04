import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ArrowRight, Sparkles } from "lucide-react";
import { DahabMark, DahabCoin } from "@/components/brand/dahab-mark";
import { LanguageToggle } from "@/components/ui/language-toggle";
import { useT } from "@/lib/i18n";

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
  const t = useT();
  return (
    <div className="relative min-h-screen overflow-hidden bg-background">
      {/* Decorative gold glow */}
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[60vh]" style={{ backgroundImage: "var(--gradient-vault)" }} />
      <div className="pointer-events-none absolute -top-40 left-1/2 -z-10 h-[40rem] w-[40rem] -translate-x-1/2 rounded-full bg-[oklch(0.82_0.14_85/0.08)] blur-3xl" />

      <header className="relative z-10 border-b border-[oklch(0.82_0.14_85/0.12)]">
        <div className="container mx-auto flex h-16 items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-3">
            <DahabCoin />
            <div className="hidden sm:block"><DahabMark size="sm" showArabic={false} /></div>
          </div>
          <nav className="flex items-center gap-1.5">
            <LanguageToggle className="me-1" />
            <Button asChild variant="ghost" size="sm" className="hidden text-muted-foreground hover:text-foreground sm:inline-flex">
              <Link to="/m">{t("landing.mobileApp")}</Link>
            </Button>
            <Button
              asChild
              size="sm"
              className="bg-gradient-gold text-primary-foreground shadow-gold hover:opacity-95"
            >
              <Link to="/login" search={{ portal: "staff" } as any}>
                {t("common.signIn")} <ArrowRight className="ms-1 h-3.5 w-3.5 rtl:rotate-180" />
              </Link>
            </Button>
          </nav>
        </div>
      </header>

      <main className="container relative z-10 mx-auto px-4 pt-16 pb-24 sm:px-6 sm:pt-24 sm:pb-32">
        <div className="mx-auto max-w-3xl text-center">
          <div className="mx-auto inline-flex items-center gap-2 rounded-full border border-[oklch(0.82_0.14_85/0.25)] bg-[oklch(0.82_0.14_85/0.05)] px-4 py-1.5 text-xs uppercase tracking-[0.32em] text-gold">
            <Sparkles className="h-3 w-3" />
            <span>{t("landing.tagline")}</span>
          </div>

          <h1 className="mt-8 font-serif text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl md:text-7xl">
            <span className="gold-text">{t("landing.heroLine1")}</span>
            <span className="block text-foreground">{t("landing.heroLine2")}</span>
            <span className="block italic text-muted-foreground">{t("landing.heroLine3")}</span>
          </h1>

          <p className="mx-auto mt-6 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            {t("landing.subtitle")}
          </p>
        </div>
      </main>
    </div>
  );
}
