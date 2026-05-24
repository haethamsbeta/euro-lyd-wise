import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { authService } from "@/lib/authService";
import { DahabMark } from "@/components/brand/dahab-mark";
import { api } from "@/lib/api";
import { DATA_BACKEND } from "@/lib/runtimeConfig";

export const Route = createFileRoute("/forgot-password")({
  component: ForgotPasswordPage,
  head: () => ({ meta: [{ title: "Forgot password — Dahab" }] }),
});

const schema = z.object({ email: z.string().trim().email().max(255) });

function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = schema.safeParse({ email });
    if (!parsed.success) { toast.error(parsed.error.issues[0].message); return; }
    setBusy(true);
    try {
      if (DATA_BACKEND === "lambda") {
        await api.auth.forgotPassword(parsed.data.email);
      } else {
        await authService.sendPasswordResetEmail(parsed.data.email);
      }
    } catch {
      // Swallow to avoid email enumeration.
    } finally {
      setBusy(false);
      setSent(true);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md space-y-5">
        <div className="flex flex-col items-center text-center">
          <DahabMark size="lg" showIcon />
        </div>
        <Card className="card-luxe rounded-xl">
          <CardHeader className="text-center">
            <CardTitle className="font-serif text-2xl gold-text">Reset your password</CardTitle>
            <CardDescription>Enter your email and we'll send you a reset link.</CardDescription>
          </CardHeader>
          <CardContent>
            {sent ? (
              <div className="space-y-4 text-center text-sm">
                <p>If an account exists for that email, a reset link has been sent. Check your inbox.</p>
                <Button asChild className="w-full bg-gradient-gold text-primary-foreground shadow-gold hover:opacity-95">
                  <Link to="/login" search={{ portal: "staff" } as any}>Back to sign in</Link>
                </Button>
              </div>
            ) : (
              <form onSubmit={onSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="email">Email</Label>
                  <Input id="email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
                </div>
                <Button type="submit" disabled={busy} className="w-full bg-gradient-gold text-primary-foreground shadow-gold hover:opacity-95">
                  {busy ? "Sending…" : "Send reset link"}
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  <Link to="/login" search={{ portal: "staff" } as any} className="hover:text-gold hover:underline underline-offset-4">
                    Back to sign in
                  </Link>
                </p>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}