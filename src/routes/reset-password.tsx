import { createFileRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { authService } from "@/lib/authService";
import { supabase } from "@/integrations/supabase/client";
import { DahabMark } from "@/components/brand/dahab-mark";
import { api } from "@/lib/api";
import { ApiError } from "@/lib/dahabApi";
import { DATA_BACKEND } from "@/lib/runtimeConfig";
import { clearDahabAuthStorage } from "@/lib/dahabAuthToken";

export const Route = createFileRoute("/reset-password")({
  validateSearch: (s: Record<string, unknown>) => ({
    token: typeof s.token === "string" ? s.token : undefined,
  }),
  component: ResetPasswordPage,
  head: () => ({ meta: [{ title: "Set new password — Dahab" }] }),
});

const schema = z
  .object({
    password: z.string().min(10, "Min 10 characters").max(72),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { message: "Passwords do not match", path: ["confirm"] });

function ResetPasswordPage() {
  const nav = useNavigate();
  const { token } = useSearch({ from: "/reset-password" });
  const isLambda = DATA_BACKEND === "lambda";
  const [ready, setReady] = useState(isLambda ? !!token : false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isLambda) {
      setReady(!!token);
      return;
    }
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) setReady(true);
    });
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, [isLambda, token]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = schema.safeParse({ password, confirm });
    if (!parsed.success) { toast.error(parsed.error.issues[0].message); return; }
    setBusy(true);
    try {
      if (isLambda) {
        if (!token) {
          toast.error("This reset link is missing or invalid. Request a new link.");
          return;
        }
        await api.auth.resetPassword(token, parsed.data.password);
        clearDahabAuthStorage();
      } else {
        await authService.updateOwnPassword(parsed.data.password);
        try { await authService.clearMustChangePassword(); } catch { /* ignore */ }
        await authService.signOut();
      }
      toast.success("Password updated. Please sign in.");
      nav({ to: "/login", search: { portal: "staff" } as any });
    } catch (err: any) {
      if (err instanceof ApiError && err.status === 400) {
        toast.error("This reset link is invalid or expired. Request a new link.");
      } else {
        toast.error(err?.message ?? "Could not update password");
      }
    } finally {
      setBusy(false);
    }
  }

  const missingToken = isLambda && !token;

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md space-y-5">
        <div className="flex flex-col items-center text-center"><DahabMark size="lg" showIcon /></div>
        <Card className="card-luxe rounded-xl">
          <CardHeader className="text-center">
            <CardTitle className="font-serif text-2xl gold-text">Set a new password</CardTitle>
            <CardDescription>
              {missingToken
                ? "This reset link is missing or invalid. Request a new link."
                : ready
                  ? "Choose a strong password you haven't used before."
                  : "Validating reset link…"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {missingToken ? null : (
              <form onSubmit={onSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="pw">New password</Label>
                  <Input id="pw" type="password" autoComplete="new-password" required minLength={10} value={password} onChange={(e) => setPassword(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="pw2">Confirm new password</Label>
                  <Input id="pw2" type="password" autoComplete="new-password" required minLength={10} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
                </div>
                <Button type="submit" disabled={busy || !ready} className="w-full bg-gradient-gold text-primary-foreground shadow-gold hover:opacity-95">
                  {busy ? "Updating…" : "Update password"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}