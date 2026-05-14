import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { PhoneShell, DahamLogo } from "@/components/mobile/phone-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, User, Lock, Eye, EyeOff, Fingerprint, Loader2 } from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { passkeysSupported, signInWithPasskey } from "@/lib/passkey";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { DATA_BACKEND } from "@/lib/runtimeConfig";
import { useQueryClient } from "@tanstack/react-query";
import { normalizeLambdaUser } from "@/lib/lambdaUser";

export const Route = createFileRoute("/m/login")({
  component: MobileLogin,
  head: () => ({ meta: [{ title: "DAHAB — Sign in" }] }),
});

function MobileLogin() {
  const [show, setShow] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [tokenStoredMessage, setTokenStoredMessage] = useState<string | null>(null);
  const [bioBusy, setBioBusy] = useState(false);
  const [bioOk, setBioOk] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  useEffect(() => { passkeysSupported().then(setBioOk); }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setTokenStoredMessage(null);
    if (DATA_BACKEND === "lambda") {
      try {
        const raw = await api.auth.login({ email: email.trim(), password });
        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.log("[LOGIN RAW]", raw);
        }
        const payload = raw?.data?.access_token ? raw.data : raw;
        const accessToken = payload?.access_token;
        const refreshToken = payload?.refresh_token;
        const user = normalizeLambdaUser(payload);

        if (!accessToken) {
          console.error("[LOGIN ERROR] Missing access_token", raw);
          setTokenStoredMessage("Lambda token stored: false");
          throw new Error("Lambda login did not return access_token");
        }

        localStorage.setItem("dahab.access_token", accessToken);
        localStorage.setItem("dahab.refresh_token", refreshToken || "");
        localStorage.setItem("dahab.user", JSON.stringify(user || {}));
        localStorage.setItem("dahab.signed_in_at", String(Date.now()));

        const hasToken = !!localStorage.getItem("dahab.access_token");
        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.log("[LOGIN STORED]", {
            hasToken,
            keys: Object.keys(localStorage).filter(k => k.toLowerCase().includes("dahab")),
            role: JSON.parse(localStorage.getItem("dahab.user") || "{}")?.role,
            is_master_admin: JSON.parse(localStorage.getItem("dahab.user") || "{}")?.is_master_admin,
          });
        }
        setTokenStoredMessage(`Lambda token stored: ${hasToken}`);
        if (!hasToken) throw new Error("Lambda token storage failed");

        window.dispatchEvent(new Event("dahab.auth.changed"));
        await Promise.all(
          ["dashboard", "holders", "vaults", "transactions", "users", "notifications"].map(
            (key) => queryClient.invalidateQueries({ queryKey: [key] }),
          ),
        );
        setBusy(false);
        navigate({ to: "/m/dashboard" });
      } catch (e: any) {
        setBusy(false);
        setTokenStoredMessage("Lambda token stored: false");
        toast.error(e?.message ?? "Lambda login failed.");
      }
      return;
    }
    const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    navigate({ to: "/m/dashboard" });
  }
  async function onPasskey() {
    setBioBusy(true);
    try {
      await signInWithPasskey(email || undefined);
      navigate({ to: "/m/dashboard" });
    } catch (e: any) {
      toast.error(e?.message ?? "Face ID sign-in failed");
    } finally { setBioBusy(false); }
  }

  return (
    <PhoneShell>
      <div className="flex flex-1 flex-col px-7 pt-3 pb-8 relative z-10">
        <div className="flex items-center justify-between">
          <Link to="/m" className="text-foreground/80 hover:text-foreground"><ArrowLeft className="h-5 w-5" /></Link>
          <button className="text-sm font-medium text-gold-deep">Help</button>
        </div>

        <div className="mt-4 flex flex-col items-center">
          <DahamLogo size={96} />
          <div className="mt-3 font-serif text-2xl tracking-[0.35em] text-foreground">دهــــم</div>
          <div className="mt-1 text-lg font-semibold tracking-[0.4em] gold-text">DAHAB</div>
          <div className="mt-2 text-xs text-foreground/80" dir="rtl">شركة دهــم للخدمات الماليـة</div>
          <div className="text-[11px] text-muted-foreground">Dahab Financial Services Company</div>
        </div>

        <div className="mt-8 text-center">
          <h1 className="font-serif text-3xl text-foreground">Welcome Back</h1>
          <p className="mt-1 text-sm text-muted-foreground">Sign in to access your account</p>
        </div>

        <form className="mt-6 space-y-3" onSubmit={onSubmit}>
          <div className="relative">
            <User className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gold-deep" />
            <Input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              className="h-14 rounded-2xl pl-11 bg-secondary/60 border-border"
            />
          </div>
          <div className="relative">
            <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-gold-deep" />
            <Input
              type={show ? "text" : "password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              placeholder="Password"
              className="h-14 rounded-2xl pl-11 pr-11 bg-secondary/60 border-border"
            />
            <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-4 top-1/2 -translate-y-1/2 text-muted-foreground">
              {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>

          <div className="flex items-center justify-between text-sm">
            <label className="flex items-center gap-2 text-foreground/80">
              <Checkbox className="border-gold data-[state=checked]:bg-gold data-[state=checked]:text-primary-foreground" defaultChecked />
              Remember me
            </label>
            <button type="button" className="text-gold-deep font-medium">Forgot password?</button>
          </div>

          <Button
            type="submit"
            disabled={busy}
            className="w-full h-14 rounded-2xl bg-gradient-gold text-primary-foreground text-base shadow-gold hover:opacity-95 mt-2"
          >
            {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : "Sign In"}
          </Button>
          {tokenStoredMessage ? (
            <p className="text-center text-xs font-medium text-gold-deep">{tokenStoredMessage}</p>
          ) : null}
        </form>

        <div className="my-5 flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs text-muted-foreground">or</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        {bioOk ? (
          <Button
            type="button"
            onClick={onPasskey}
            disabled={bioBusy}
            variant="outline"
            className="w-full h-14 rounded-2xl border-gold text-gold-deep gap-2"
          >
            {bioBusy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Fingerprint className="h-5 w-5" />}
            Sign In with Face ID
          </Button>
        ) : null}

        <div className="mt-auto pt-6 text-center text-sm text-muted-foreground">
          Don't have an account? <button className="font-semibold text-gold-deep">Register Now</button>
        </div>
      </div>
    </PhoneShell>
  );
}