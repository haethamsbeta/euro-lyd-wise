import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Sparkles, Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { DahabMark } from "@/components/brand/dahab-mark";

export const Route = createFileRoute("/login")({
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
  useEffect(() => {
    if (!loading && session) nav({ to: "/app" });
  }, [session, loading, nav]);

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      {/* Atmosphere */}
      <div className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[60vh]" style={{ backgroundImage: "var(--gradient-vault)" }} />
      <div className="pointer-events-none absolute -top-32 left-1/2 -z-10 h-[36rem] w-[36rem] -translate-x-1/2 rounded-full bg-[oklch(0.82_0.14_85/0.07)] blur-3xl" />

      <div className="flex w-full max-w-md flex-col gap-5">
        <div className="flex flex-col items-center text-center">
          <DahabMark size="lg" />
          <p className="mt-4 text-xs uppercase tracking-[0.32em] text-muted-foreground">Private Banking Ledger</p>
        </div>

        <Card className="card-luxe rounded-xl">
          <CardHeader className="text-center">
            <p className="text-[10px] font-medium uppercase tracking-[0.4em] text-gold/80">
              Private Banking · ذهب
            </p>
            <CardTitle className="mt-2 font-serif text-3xl font-semibold gold-text">
              Welcome back
            </CardTitle>
            <CardDescription className="mt-2 text-foreground/70">
              Sign in to the back-office, or create a new account to request access.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="signin">
              <TabsList className="grid h-11 w-full grid-cols-2 gap-1 rounded-lg border border-[oklch(0.82_0.14_85/0.25)] bg-[oklch(0.82_0.14_85/0.06)] p-1">
                <TabsTrigger
                  value="signin"
                  className="rounded-md text-sm font-semibold text-foreground/70 transition-all hover:text-foreground data-[state=active]:bg-gradient-gold data-[state=active]:font-bold data-[state=active]:!text-[oklch(0.18_0.03_60)] data-[state=active]:shadow-[inset_0_0_0_1px_oklch(0.55_0.12_72/0.5)]"
                >
                  Sign in
                </TabsTrigger>
                <TabsTrigger
                  value="signup"
                  className="rounded-md text-sm font-semibold text-foreground/70 transition-all hover:text-foreground data-[state=active]:bg-gradient-gold data-[state=active]:font-bold data-[state=active]:!text-[oklch(0.18_0.03_60)] data-[state=active]:shadow-[inset_0_0_0_1px_oklch(0.55_0.12_72/0.5)]"
                >
                  Create account
                </TabsTrigger>
              </TabsList>
              <TabsContent value="signin" className="pt-5">
                <SignInForm />
              </TabsContent>
              <TabsContent value="signup" className="pt-5">
                <SignUpForm />
              </TabsContent>
            </Tabs>
            <p className="mt-6 text-center text-xs text-muted-foreground">
              <Link to="/" className="hover:text-gold hover:underline underline-offset-4">
                ← Back to home
              </Link>
            </p>
          </CardContent>
        </Card>

        <DemoCredentials />
      </div>
    </div>
  );
}

function SignInForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

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
    const { error } = await supabase.auth.signInWithPassword(parsed.data);
    setBusy(false);
    if (error) toast.error(error.message);
    else toast.success("Welcome back");
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">Password</Label>
        <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </div>
      <Button
        type="submit"
        className="w-full bg-gradient-gold text-primary-foreground shadow-gold hover:opacity-95"
        disabled={busy}
      >
        {busy ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}

function SignUpForm() {
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
    else toast.success("Account created. You can sign in now.");
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="full_name">Full name</Label>
        <Input id="full_name" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="su_email">Email</Label>
        <Input id="su_email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="su_password">Password</Label>
        <Input id="su_password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </div>
      <Button
        type="submit"
        className="w-full bg-gradient-gold text-primary-foreground shadow-gold hover:opacity-95"
        disabled={busy}
      >
        {busy ? "Creating…" : "Create account"}
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        New accounts have no role until an admin assigns one.
      </p>
    </form>
  );
}

function DemoCredentials() {
  const [seeding, setSeeding] = useState(false);
  const [seeded, setSeeded] = useState(false);

  async function runSeed() {
    setSeeding(true);
    try {
      const res = await fetch("/api/public/admin/seed-demo", { method: "POST" });
      const json = await res.json();
      if (!res.ok || json.ok === false) throw new Error(json.error || "Seed failed");
      setSeeded(true);
      toast.success("Demo vault prepared — sign in to explore.");
    } catch (e: any) {
      toast.error(e.message ?? "Seed failed");
    } finally {
      setSeeding(false);
    }
  }

  function fill(email: string, password: string) {
    if (__fillSignIn) {
      __fillSignIn(email, password);
      toast.success(`Filled ${email}`);
    } else {
      toast.message("Switch to the Sign in tab first.");
    }
  }

  function copy(text: string, label: string) {
    navigator.clipboard.writeText(text).then(
      () => toast.success(`${label} copied`),
      () => toast.error("Copy failed"),
    );
  }

  return (
    <Card className="card-luxe rounded-xl">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 font-serif text-base font-medium">
          <Sparkles className="h-4 w-4 text-gold" />
          Demo credentials
        </CardTitle>
        <CardDescription className="text-xs">
          Tap <span className="font-medium text-foreground">Prepare demo vault</span> once, then choose a role to explore.
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
            <><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />Preparing…</>
          ) : seeded ? (
            "Vault prepared ✓ — re-run if needed"
          ) : (
            "Prepare demo vault"
          )}
        </Button>

        <ul className="divide-y divide-[oklch(0.82_0.14_85/0.12)] overflow-hidden rounded-md border border-[oklch(0.82_0.14_85/0.18)] text-xs">
          {DEMO_LOGINS.map((u) => (
            <li key={u.email} className="flex items-center gap-2 p-2.5">
              <span className={`inline-flex w-16 shrink-0 justify-center rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider ${u.tone}`}>
                {u.role}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-mono text-[11px]">{u.email}</div>
                <div className="truncate font-mono text-[11px] text-muted-foreground">{u.password}</div>
              </div>
              <Button size="sm" variant="ghost" className="h-7 px-2 text-gold hover:bg-[oklch(0.82_0.14_85/0.1)] hover:text-gold" onClick={() => fill(u.email, u.password)}>
                Fill
              </Button>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 hover:bg-[oklch(0.82_0.14_85/0.1)]" onClick={() => copy(`${u.email} / ${u.password}`, u.role)} aria-label={`Copy ${u.role} credentials`}>
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </li>
          ))}
        </ul>

        <p className="text-[11px] leading-relaxed text-muted-foreground">
          The seed installs 7 vaults, 5 customer accounts, posted transactions, and 2 pending approvals. Safe to re-run.
        </p>
      </CardContent>
    </Card>
  );
}
