import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, type AppRole } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Loader2, Fingerprint } from "lucide-react";
import { toast } from "sonner";
import { DahabMark } from "@/components/brand/dahab-mark";
import { LanguageToggle } from "@/components/ui/language-toggle";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { useT } from "@/lib/i18n";
import { passkeysSupported, signInWithPasskey } from "@/lib/passkey";
import { authService } from "@/lib/authService";
import { DATA_BACKEND, API_BASE_URL } from "@/lib/runtimeConfig";
import { useQueryClient } from "@tanstack/react-query";
import { normalizeLambdaUser } from "@/lib/lambdaUser";

type PortalKind = "staff" | "consumer";

export const Route = createFileRoute("/login")({
  validateSearch: (s: Record<string, unknown>) => ({
    portal: (s.portal === "consumer" ? "consumer" : "staff") as PortalKind,
    lock: s.lock === 1 || s.lock === "1" || s.lock === true ? 1 : undefined,
  }),
  component: LoginPage,
  head: () => ({
    meta: [
      { title: "Sign in — Dahab" },
      { name: "description", content: "Sign in to Dahab — access your customer portal or the staff back-office for our private banking ledger." },
      { property: "og:title", content: "Sign in — Dahab" },
      { property: "og:description", content: "Sign in to your Dahab customer portal or staff back-office." },
      { property: "og:url", content: "https://dahablibya.com/login" },
    ],
  }),
});

const credSchema = z.object({
  email: z.string().trim().email("Enter a valid email").max(255),
  password: z.string().min(8, "Min 8 characters").max(72),
});
const signupSchema = credSchema.extend({
  fullName: z.string().trim().min(2, "Enter your name").max(100),
});

type Filler = (email: string, password: string) => void;
let __fillSignIn: Filler | null = null;

function LoginPage() {
  const { session, loading } = useAuth();
  const nav = useNavigate();
  const t = useT();
  const { portal, lock } = Route.useSearch();
  const isStaff = portal === "staff";
  useEffect(() => {
    if (!loading && session) nav({ to: isStaff ? "/app" : "/portal" });
  }, [session, loading, nav, isStaff]);

  return (
    <div
      className="relative flex min-h-[100svh] md:min-h-screen items-center justify-center overflow-hidden
                 pt-[max(1.5rem,env(safe-area-inset-top))]
                 pb-[max(1.5rem,env(safe-area-inset-bottom))]
                 pl-[max(1rem,env(safe-area-inset-left))]
                 pr-[max(1rem,env(safe-area-inset-right))]
                 sm:py-10"
    >
      {/* Atmosphere */}
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[60vh]" style={{ backgroundImage: "var(--gradient-vault)" }} />
      <div className="pointer-events-none absolute -top-32 left-1/2 -z-10 h-[36rem] w-[36rem] -translate-x-1/2 rounded-full bg-[oklch(0.82_0.14_85/0.07)] blur-3xl" />

      <div className="flex w-full max-w-md flex-col gap-4 sm:gap-5">
        <div className="flex flex-col items-center text-center">
          <DahabMark size="lg" showIcon />
          <p className="mt-4 text-[10px] sm:text-xs uppercase tracking-[0.28em] sm:tracking-[0.32em] text-muted-foreground">
            {t("login.privateBankingLedger")}
          </p>
        </div>

        {/* Portal switcher removed — portal is always selected on the landing page. */}

        <Card className="card-luxe rounded-xl">
          <CardHeader className="text-center px-5 sm:px-6 pt-5 sm:pt-6">
            <p className="text-[10px] font-medium uppercase tracking-[0.4em] text-gold/80">
              {t("login.privateBadge")}
            </p>
            <CardTitle className="mt-2 font-serif text-2xl sm:text-3xl font-semibold gold-text">
              {isStaff ? t("login.staffTitle") : t("login.consumerTitle")}
            </CardTitle>
            <CardDescription className="mt-2 text-sm text-foreground/70">
              {isStaff ? t("login.staffSubtitle") : t("login.consumerSubtitle")}
            </CardDescription>
          </CardHeader>
          <CardContent className="px-5 sm:px-6 pb-5 sm:pb-6">
            {isStaff ? (
              <>
                <SignInForm portal={portal} />
                <p className="mt-5 rounded-md border border-border/60 bg-muted/30 p-3 text-center text-xs text-muted-foreground">
                  DAHAB Family accounts (admin, teller, auditor) are created by
                  an administrator. Ask an admin to provision your account.
                </p>
              </>
            ) : (
            <Tabs defaultValue="signin">
              <TabsList className="grid h-11 w-full grid-cols-2 gap-1 rounded-lg border border-[oklch(0.82_0.14_85/0.25)] bg-[oklch(0.82_0.14_85/0.06)] p-1">
                <TabsTrigger
                  value="signin"
                  className="rounded-md text-sm font-semibold text-foreground/70 transition-all hover:text-foreground data-[state=active]:bg-gradient-gold data-[state=active]:font-bold data-[state=active]:!text-[oklch(0.18_0.03_60)] data-[state=active]:shadow-[inset_0_0_0_1px_oklch(0.55_0.12_72/0.5)]"
                >
                  {t("login.tabSignIn")}
                </TabsTrigger>
                <TabsTrigger
                  value="signup"
                  className="rounded-md text-sm font-semibold text-foreground/70 transition-all hover:text-foreground data-[state=active]:bg-gradient-gold data-[state=active]:font-bold data-[state=active]:!text-[oklch(0.18_0.03_60)] data-[state=active]:shadow-[inset_0_0_0_1px_oklch(0.55_0.12_72/0.5)]"
                >
                  {t("login.tabCreate")}
                </TabsTrigger>
              </TabsList>
              <TabsContent value="signin" className="pt-5">
                <SignInForm portal={portal} />
              </TabsContent>
              <TabsContent value="signup" className="pt-5">
                <SignUpForm />
              </TabsContent>
            </Tabs>
            )}
            <p className="mt-6 text-center text-xs text-muted-foreground">
              <Link to="/" className="hover:text-gold hover:underline underline-offset-4">
                {t("login.backHome")}
              </Link>
            </p>
          </CardContent>
        </Card>

        <div className="flex items-center justify-center gap-3 pt-1">
          <LanguageToggle variant="subtle" />
          <ThemeToggle />
        </div>
      </div>
    </div>
  );
}

function SignInForm({ portal }: { portal: PortalKind }) {
  const t = useT();
  const nav = useNavigate();
  const queryClient = useQueryClient();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [debug, setDebug] = useState<{
    called: boolean;
    returned: boolean;
    stored: boolean;
  } | null>(null);
  const [bioBusy, setBioBusy] = useState(false);
  const [bioOk, setBioOk] = useState(false);
  useEffect(() => { passkeysSupported().then(setBioOk); }, []);

  useEffect(() => {
    __fillSignIn = (e, p) => { setEmail(e); setPassword(p); };
    return () => { __fillSignIn = null; };
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = credSchema.safeParse({ email, password });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setBusy(true);
    setDebug(null);
    if (DATA_BACKEND === "lambda") {
      let called = false;
      let returned = false;
      let stored = false;
      try {
        called = true;
        const base = API_BASE_URL.replace(/\/+$/, "");
        const res = await fetch(`${base}/auth/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(parsed.data),
        });
        const envelope = await res.json();
        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.log("[LOGIN RAW]", envelope);
        }
        const payload = envelope?.data ?? envelope;
        const accessToken = payload?.access_token;
        const refreshToken = payload?.refresh_token;
        const user = normalizeLambdaUser(payload);
        returned = !!accessToken;

        if (!res.ok || !accessToken) {
          setDebug({ called, returned, stored: false });
          throw new Error(envelope?.message || "Lambda login did not return access_token");
        }

        localStorage.setItem("dahab.access_token", accessToken);
        localStorage.setItem("dahab.refresh_token", refreshToken || "");
        localStorage.setItem("dahab.user", JSON.stringify(user || {}));
        localStorage.setItem("dahab.signed_in_at", String(Date.now()));

        stored = !!localStorage.getItem("dahab.access_token");
        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.log("[LOGIN STORED]", {
            hasToken: stored,
            keys: Object.keys(localStorage).filter(k => k.toLowerCase().includes("dahab")),
            role: user?.role,
            is_master_admin: user?.is_master_admin,
          });
        }
        setDebug({ called, returned, stored });
        if (!stored) throw new Error("Lambda token storage failed");

        window.dispatchEvent(new Event("dahab.auth.changed"));
        await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        void Promise.all(
          ["dashboard", "dashboard.v3", "holders", "vaults", "transactions", "users", "notifications"].map(
            (key) => queryClient.invalidateQueries({ queryKey: [key] }),
          ),
        );
        setBusy(false);
        toast.success(t("login.welcomeToast"));
        nav({ to: portal === "staff" ? "/app" : "/portal", replace: true });
      } catch (e: any) {
        setBusy(false);
        setDebug({ called, returned, stored });
        toast.error(e?.message ?? "Lambda login failed.");
      }
      return;
    }
    const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
    if (error) {
      setBusy(false);
      toast.error(error.message);
      return;
    }
    // Enforce portal/credential separation by checking roles.
    const uid = data.user?.id;
    let roles: AppRole[] = [];
    if (uid) {
      const { data: rrows } = await supabase.from("user_roles").select("role").eq("user_id", uid);
      roles = (rrows ?? []).map((r) => r.role as AppRole);
    }
    const STAFF: AppRole[] = ["admin", "teller", "auditor"];
    const isStaffUser = roles.some((r) => STAFF.includes(r));
    if (portal === "staff" && !isStaffUser) {
      await supabase.auth.signOut();
      setBusy(false);
      toast.error(t("login.wrongPortalStaff"));
      return;
    }
    if (portal === "consumer" && isStaffUser) {
      await supabase.auth.signOut();
      setBusy(false);
      toast.error(t("login.wrongPortalConsumer"));
      return;
    }
    // Forced password change check (staff only).
    if (portal === "staff" && uid) {
      try {
        const must = await authService.getMustChangePassword(uid);
        if (must) {
          setBusy(false);
          toast.message("Please set a new password to continue.");
          nav({ to: "/change-password" });
          return;
        }
      } catch { /* non-blocking */ }
    }
    setBusy(false);
    toast.success(t("login.welcomeToast"));
    nav({ to: portal === "staff" ? "/app" : "/portal" });
  }

  async function onPasskey() {
    setBioBusy(true);
    try {
      await signInWithPasskey(email || undefined);
      toast.success(t("login.welcomeToast"));
      nav({ to: portal === "staff" ? "/app" : "/portal" });
    } catch (e: any) {
      toast.error(e?.message ?? "Face ID sign-in failed");
    } finally {
      setBioBusy(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="email">{t("common.email")}</Label>
        <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">{t("common.password")}</Label>
        <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </div>
      <Button
        type="submit"
        className="w-full bg-gradient-gold text-primary-foreground shadow-gold hover:opacity-95"
        disabled={busy}
      >
        {busy ? t("login.signingIn") : t("common.signIn")}
      </Button>
      {portal === "staff" ? (
        <div className="text-center">
          <Link
            to="/forgot-password"
            className="text-xs text-muted-foreground hover:text-gold hover:underline underline-offset-4"
          >
            Forgot password?
          </Link>
        </div>
      ) : null}
      {bioOk ? (
        <Button
          type="button"
          variant="outline"
          className="w-full gap-2 border-gold text-gold-deep"
          disabled={bioBusy}
          onClick={onPasskey}
        >
          {bioBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Fingerprint className="h-4 w-4" />}
          Sign in with Face ID
        </Button>
      ) : null}
      {debug ? (
        <div className="rounded-md border border-[oklch(0.82_0.14_85/0.25)] bg-[oklch(0.82_0.14_85/0.05)] p-2 text-center text-[11px] font-mono text-foreground/80 space-y-0.5">
          <div>Lambda login called: {String(debug.called)}</div>
          <div>Lambda token returned: {String(debug.returned)}</div>
          <div>Lambda token stored: {String(debug.stored)}</div>
          <div>DATA_BACKEND value: {DATA_BACKEND}</div>
        </div>
      ) : null}
    </form>
  );
}

function SignUpForm() {
  const t = useT();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const lambda = DATA_BACKEND === "lambda";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (lambda) {
      toast.error("Consumer account creation is pending the customer portal backend.");
      return;
    }
    const parsed = signupSchema.safeParse({ fullName, email, password });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        data: { full_name: parsed.data.fullName },
        emailRedirectTo: `${window.location.origin}/app`,
      },
    });
    setBusy(false);
    if (error) toast.error(error.message);
    else toast.success(t("login.accountCreated"));
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="full_name">{t("common.fullName")}</Label>
        <Input id="full_name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="su_email">{t("common.email")}</Label>
        <Input id="su_email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="su_password">{t("common.password")}</Label>
        <Input id="su_password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </div>
      <Button
        type="submit"
        className="w-full bg-gradient-gold text-primary-foreground shadow-gold hover:opacity-95"
        disabled={busy || lambda}
        title={lambda ? "Consumer account creation pending backend." : undefined}
      >
        {busy ? t("login.creating") : t("login.createAccount")}
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        {lambda
          ? "Consumer self-registration is pending the customer portal backend. Please contact support to open an account."
          : t("login.newAccountNote")}
      </p>
    </form>
  );
}

function DemoCredentials({ portal, lock }: { portal: PortalKind; lock: boolean }) {
  return null;
}
