import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { authService } from "@/lib/authService";
import { useAuth } from "@/lib/auth";
import { DahabMark } from "@/components/brand/dahab-mark";
import { DATA_BACKEND } from "@/lib/runtimeConfig";

export const Route = createFileRoute("/change-password")({
  component: ChangePasswordPage,
  head: () => ({ meta: [{ title: "Change password — Dahab" }] }),
});

const schema = z
  .object({
    currentPassword: z.string().optional(),
    password: z.string().min(10, "Min 10 characters").max(72),
    confirm: z.string(),
  })
  .refine((v) => DATA_BACKEND !== "lambda" || Boolean(v.currentPassword?.trim()), {
    message: "Current password is required",
    path: ["currentPassword"],
  })
  .refine((v) => v.password === v.confirm, {
    message: "Passwords do not match",
    path: ["confirm"],
  });

function ChangePasswordPage() {
  const nav = useNavigate();
  const { session, loading } = useAuth();
  const isLambda = DATA_BACKEND === "lambda";
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && !session) nav({ to: "/login", search: { portal: "staff", lock: undefined } });
  }, [loading, session, nav]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = schema.safeParse({ currentPassword, password, confirm });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setBusy(true);
    try {
      await authService.updateOwnPassword(parsed.data.password, parsed.data.currentPassword);
      await authService.clearMustChangePassword();
      toast.success("Password updated.");
      nav({ to: "/app" });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Could not update password");
    } finally {
      setBusy(false);
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
            <CardTitle className="font-serif text-2xl gold-text">Change your password</CardTitle>
            <CardDescription>
              An admin requires you to set a new password before continuing.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={onSubmit} className="space-y-4">
              {isLambda ? (
                <div className="space-y-1.5">
                  <Label htmlFor="current-pw">Current password</Label>
                  <Input
                    id="current-pw"
                    type="password"
                    autoComplete="current-password"
                    required
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                  />
                </div>
              ) : null}
              <div className="space-y-1.5">
                <Label htmlFor="pw">New password</Label>
                <Input
                  id="pw"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={10}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="pw2">Confirm new password</Label>
                <Input
                  id="pw2"
                  type="password"
                  autoComplete="new-password"
                  required
                  minLength={10}
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                />
              </div>
              <Button
                type="submit"
                disabled={busy}
                className="w-full bg-gradient-gold text-primary-foreground shadow-gold hover:opacity-95"
              >
                {busy ? "Updating…" : "Update password"}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
