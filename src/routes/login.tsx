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
import { Landmark, Sparkles, Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  component: LoginPage,
  head: () => ({ meta: [{ title: "Sign in — Vault Ledger" }] }),
});

const credSchema = z.object({
  email: z.string().trim().email("Enter a valid email").max(255),
  password: z.string().min(8, "Min 8 characters").max(72),
});
const signupSchema = credSchema.extend({
  fullName: z.string().trim().min(2, "Enter your name").max(100),
});

const DEMO_LOGINS: { role: string; email: string; password: string; tone: string }[] = [
  { role: "Admin",    email: "admin@demo.test",    password: "Admin#12345",   tone: "bg-primary/10 text-primary" },
  { role: "Teller",   email: "teller@demo.test",   password: "Teller#12345",  tone: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" },
  { role: "Auditor",  email: "auditor@demo.test",  password: "Auditor#12345", tone: "bg-amber-500/10 text-amber-600 dark:text-amber-400" },
  { role: "Customer", email: "consumer@demo.test", password: "Customer#1234", tone: "bg-sky-500/10 text-sky-600 dark:text-sky-400" },
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
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4">
      <div className="flex w-full max-w-md flex-col gap-4">
      <Card className="w-full">
        <CardHeader className="text-center">
          <div className="mx-auto mb-2 flex h-10 w-10 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Landmark className="h-5 w-5" />
          </div>
          <CardTitle>Vault Ledger</CardTitle>
          <CardDescription>Sign in to your back-office or customer portal.</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="signin">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="signin">Sign in</TabsTrigger>
              <TabsTrigger value="signup">Create account</TabsTrigger>
            </TabsList>
            <TabsContent value="signin" className="pt-4">
              <SignInForm />
            </TabsContent>
            <TabsContent value="signup" className="pt-4">
              <SignUpForm />
            </TabsContent>
          </Tabs>
          <p className="mt-6 text-center text-xs text-muted-foreground">
            <Link to="/" className="hover:underline">
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
    else toast.success("Signed in");
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="password">Password</Label>
        <Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </div>
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? "Signing in…" : "Sign in"}
      </Button>
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
      toast.success("Demo data ready — you can sign in now.");
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
    <Card className="w-full border-dashed">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Sparkles className="h-4 w-4 text-primary" />
          Demo credentials
        </CardTitle>
        <CardDescription className="text-xs">
          Click <span className="font-medium">Set up demo data</span> once, then use any login below to explore.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button onClick={runSeed} disabled={seeding} variant={seeded ? "secondary" : "default"} size="sm" className="w-full">
          {seeding ? <><Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />Setting up…</> : seeded ? "Demo data ready ✓ — re-run if needed" : "Set up demo data"}
        </Button>
        <ul className="divide-y rounded-md border text-xs">
          {DEMO_LOGINS.map((u) => (
            <li key={u.email} className="flex items-center gap-2 p-2">
              <span className={`inline-flex w-16 shrink-0 justify-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${u.tone}`}>
                {u.role}
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-mono">{u.email}</div>
                <div className="truncate font-mono text-muted-foreground">{u.password}</div>
              </div>
              <Button size="sm" variant="ghost" className="h-7 px-2" onClick={() => fill(u.email, u.password)}>
                Fill
              </Button>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0" onClick={() => copy(`${u.email} / ${u.password}`, u.role)} aria-label={`Copy ${u.role} credentials`}>
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </li>
          ))}
        </ul>
        <p className="text-[11px] text-muted-foreground">
          Demo seed creates 7 vaults, 5 customer accounts, posted transactions, and 2 pending approvals. Safe to re-run.
        </p>
      </CardContent>
    </Card>
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
    <form onSubmit={onSubmit} className="space-y-3">
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
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? "Creating…" : "Create account"}
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        New accounts have no role until an admin assigns one.
      </p>
    </form>
  );
}