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
import { Sparkles, Copy, Loader2, Fingerprint } from "lucide-react";
import { toast } from "sonner";
import { DahabMark } from "@/components/brand/dahab-mark";
import { LanguageToggle } from "@/components/ui/language-toggle";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { useT } from "@/lib/i18n";
import { passkeysSupported, signInWithPasskey } from "@/lib/passkey";
import { authService } from "@/lib/authService";
import { api } from "@/lib/api";
import { DATA_BACKEND } from "@/lib/runtimeConfig";
import { useQueryClient } from "@tanstack/react-query";

type PortalKind = "staff" | "consumer";

export const Route = createFileRoute("/login")({
  validateSearch: (s: Record<string, unknown>) => ({
    portal: (s.portal === "consumer" ? "consumer" : "staff") as PortalKind,
    lock: s.lock === 1 || s.lock === "1" || s.lock === true ? 1 : undefined,
  }),
  component: LoginPage,
  head: () => ({ meta: [{ title: "Sign in — Dahab" }] }),
});

const credSchema = z.object({
  email: z.string().trim().email("Enter a valid email").max(255),
  password: z.string().min(8, "Min 8 characters").max(72),
});
const signupSchema = credSchema.extend({
  fullName: z.string().trim().min(2, "Enter your name").max(100),
});

const DEMO_LOGINS: { role: string; email: string; password: string; tone: string }[] = [
  { role: "Admin",    email: "admin@demo.test",    password: "Admin#12345",   tone: "bg-[oklch(0.82_0.14_85/0.15)] text-gold border-[oklch(0.82_0.14_85/0.3)]" },
  { role: "Teller",   email: "teller@demo.test",   password: "Teller#12345",  tone: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30" },
  { role: "Auditor",  email: "auditor@demo.test",  password: "Auditor#12345", tone: "bg-amber-500/10 text-amber-300 border-amber-500/30" },
  { role: "Customer", email: "consumer@demo.test", password: "Customer#1234", tone: "bg-sky-500/10 text-sky-300 border-sky-500/30" },
];

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
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      {/* Atmosphere */}
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[60vh]" style={{ backgroundImage: "var(--gradient-vault)" }} />
      <div className="pointer-events-none absolute -top-32 left-1/2 -z-10 h-[36rem] w-[36rem] -translate-x-1/2 rounded-full bg-[oklch(0.82_0.14_85/0.07)] blur-3xl" />

      <div className="flex w-full max-w-md flex-col gap-5">
        <div className="flex flex-col items-center text-center">
          <DahabMark size="lg" showIcon />
          <p className="mt-4 text-xs uppercase tracking-[0.32em] text-muted-foreground">
            {t("login.privateBankingLedger")}
          </p>
        </div>

        {/* Portal switcher removed — portal is always selected on the landing page. */}

        <Card className="card-luxe rounded-xl">
          <CardHeader className="text-center">
            <p className="text-[10px] font-medium uppercase tracking-[0.4em] text-gold/80">
              {t("login.privateBadge")}
            </p>
            <CardTitle className="mt-2 font-serif text-3xl font-semibold gold-text">
              {isStaff ? t("login.staffTitle") : t("login.consumerTitle")}
            </CardTitle>
            <CardDescription className="mt-2 text-foreground/70">
              {isStaff ? t("login.staffSubtitle") : t("login.consumerSubtitle")}
            </CardDescription>
          </CardHeader>
          <CardContent>
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
            <p className="mt-6 text-center text-xs text-muted-foreground">
              <Link to="/" className="hover:text-gold hover:underline underline-offset-4">
                {t("login.backHome")}
              </Link>
            </p>
          </CardContent>
        </Card>

        {/* Demo Fill / Prepare buttons are dev-only; never shipped to production
            (no password retrieval ever happens — only static dev credentials). */}
        {import.meta.env.DEV && <DemoCredentials portal={portal} lock={true} />}

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
    if (DATA_BACKEND === "lambda") {
      try {
        const loginResult = await api.auth.login(parsed.data);
        console.log("[DAHAB Lambda login raw]", loginResult);
        const payload = loginResult?.data?.access_token ? loginResult.data : loginResult;
        const accessToken = payload?.access_token ?? payload?.token;
        const refreshToken = payload?.refresh_token;
        const user = payload?.user;

        if (!accessToken) {
          console.error("[DAHAB login] Missing Lambda access token", loginResult);
          throw new Error("Lambda login did not return access_token.");
        }

        localStorage.setItem("dahab.access_token", accessToken);
        if (refreshToken) {
          localStorage.setItem("dahab.refresh_token", refreshToken);
        }
        if (user) {
          localStorage.setItem("dahab.user", JSON.stringify(user));
        }
        localStorage.setItem("dahab.signed_in_at", String(Date.now()));

        console.log("[DAHAB login stored]", {
          hasAccessToken: !!localStorage.getItem("dahab.access_token"),
          hasRefreshToken: !!localStorage.getItem("dahab.refresh_token"),
          userRole: JSON.parse(localStorage.getItem("dahab.user") || "{}")?.role,
          keys: Object.keys(localStorage).filter(k => k.toLowerCase().includes("dahab")),
        });

        window.dispatchEvent(new Event("dahab.auth.changed"));
        await Promise.all(
          ["dashboard", "holders", "vaults", "transactions", "users", "notifications"].map(
            (key) => queryClient.invalidateQueries({ queryKey: [key] }),
          ),
        );
        setBusy(false);
        toast.success(t("login.welcomeToast"));
        nav({ to: portal === "staff" ? "/app" : "/portal" });
      } catch (e: any) {
        setBusy(false);
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
    </form>
  );
}

function SignUpForm() {
  const t = useT();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
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
        disabled={busy}
      >
        {busy ? t("login.creating") : t("login.createAccount")}
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        {t("login.newAccountNote")}
      </p>
    </form>
  );
}

function DemoCredentials({ portal, lock }: { portal: PortalKind; lock: boolean }) {
  const t = useT();
  const [seeding, setSeeding] = useState(false);
  const [seeded, setSeeded] = useState(false);

  const visible = lock
    ? DEMO_LOGINS.filter((u) =>
        portal === "staff" ? u.role !== "Customer" : u.role === "Customer",
      )
    : DEMO_LOGINS;

  async function runSeed() {
    setSeeding(true);
    try {
      const res = await fetch("/api/public/admin/seed-demo", { method: "POST" });
      const json = await res.json();
      if (!res.ok || json.ok === false) throw new Error(json.error || "Seed failed");
      setSeeded(true);
      toast.success(t("demo.ready"));
    } catch (e: any) {
      toast.error(e.message ?? t("demo.failed"));
    } finally {
      setSeeding(false);
    }
  }

  function fill(email: string, password: string) {
    if (__fillSignIn) {
      __fillSignIn(email, password);
      toast.success(`${t("demo.filledToast")} ${email}`);
    } else {
      toast.message(t("demo.switchTab"));
    }
  }

  function copy(text: string, label: string) {
    navigator.clipboard.writeText(text).then(
      () => toast.success(`${label} ${t("demo.copied")}`),
      () => toast.error(t("demo.copyFailed")),
    );
  }

  return (
    <Card className="card-luxe rounded-xl">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 font-serif text-base font-medium">
          <Sparkles className="h-4 w-4 text-gold" />
          {t("demo.title")}
        </CardTitle>
        <CardDescription className="text-xs">
          {t("demo.intro")} <span className="font-medium text-foreground">{t("demo.introCta")}</span> {t("demo.introTail")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button
          onClick={runSeed}
          disabled={seeding}
          size="sm"
          className={
            seeded
              ? "w-full border border-[oklch(0.82_0.14_85/0.3)] bg-transparent text-gold hover:bg-[oklch(0.82_0.14_85/0.08)]"
              : "w-full bg-gradient-gold text-primary-foreground shadow-gold hover:opacity-95"
          }
          variant={seeded ? "outline" : "default"}
        >
          {seeding ? (
            <><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />{t("demo.preparing")}</>
          ) : seeded ? (
            t("demo.prepared")
          ) : (
            t("demo.prepare")
          )}
        </Button>

        <ul className="divide-y divide-[oklch(0.82_0.14_85/0.12)] overflow-hidden rounded-md border border-[oklch(0.82_0.14_85/0.18)] text-xs">
          {visible.map((u) => (
            <li key={u.email} className="flex items-center gap-2 p-2.5">
              <span className={`inline-flex w-16 shrink-0 justify-center rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${u.tone}`}>
                {u.role}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-mono text-[11px]">{u.email}</div>
                <div className="truncate font-mono text-[11px] text-muted-foreground">{u.password}</div>
              </div>
              <Button size="sm" variant="ghost" className="h-7 px-2 text-gold hover:bg-[oklch(0.82_0.14_85/0.1)] hover:text-gold" onClick={() => fill(u.email, u.password)}>
                {t("demo.fill")}
              </Button>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 hover:bg-[oklch(0.82_0.14_85/0.1)]" onClick={() => copy(`${u.email} / ${u.password}`, u.role)} aria-label={`Copy ${u.role} credentials`}>
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </li>
          ))}
        </ul>

        <p className="text-[11px] leading-relaxed text-muted-foreground">
          {t("demo.note")}
        </p>
      </CardContent>
    </Card>
  );
}
