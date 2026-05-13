import { createFileRoute, Link } from "@tanstack/react-router";
import { PhoneShell, DahamLogo } from "@/components/mobile/phone-shell";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/m/")({
  component: MobileWelcome,
  head: () => ({ meta: [{ title: "DAHAB — Banking with the strength of gold" }] }),
});

function MobileWelcome() {
  return (
    <PhoneShell>
      <div className="flex flex-1 flex-col items-center px-8 pt-16 pb-10 relative z-10">
        <DahamLogo size={132} />
        <div className="mt-6 text-center">
          <div className="font-serif text-4xl tracking-[0.35em] text-foreground">دهــــم</div>
          <div className="mt-2 text-2xl font-semibold tracking-[0.4em] gold-text">DAHAB</div>
          <div className="mt-3 text-sm text-foreground/80">شركة دهــم للخدمات الماليـة</div>
          <div className="text-xs text-muted-foreground">Dahab Financial Services Company</div>
        </div>

        <div className="mt-8 h-px w-16 bg-gold/60" />

        <div className="mt-8 text-center space-y-1">
          <div className="text-base text-foreground/85" dir="rtl">مصرفية بقوة الذهب</div>
          <div className="text-base text-muted-foreground italic">Banking with the strength of gold.</div>
        </div>

        <div className="mt-auto w-full space-y-3">
          <Button asChild className="w-full h-14 text-base rounded-2xl bg-gradient-gold text-primary-foreground shadow-gold hover:opacity-95">
            <Link to="/m/login">Get Started</Link>
          </Button>
          <Button asChild variant="outline" className="w-full h-14 text-base rounded-2xl border-gold text-gold-deep hover:bg-accent/40">
            <Link to="/m/login">Sign In</Link>
          </Button>

          <div className="flex items-center justify-center gap-4 pt-3 text-sm text-muted-foreground">
            <button className="hover:text-foreground" dir="rtl">عربي</button>
            <span className="text-border">|</span>
            <button className="text-foreground">English</button>
          </div>
        </div>
      </div>
    </PhoneShell>
  );
}