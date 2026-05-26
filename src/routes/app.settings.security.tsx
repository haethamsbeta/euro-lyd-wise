import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PageHeader } from "@/components/app/app-shell";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Fingerprint, Trash2, ShieldCheck, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  listMyPasskeys,
  deleteMyPasskey,
} from "@/server-functions/webauthn.functions";
import { passkeysSupported, registerPasskey } from "@/lib/passkey";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/app/settings/security")({
  component: SecurityPage,
  head: () => ({ meta: [{ title: "Security — Dahab" }] }),
});

function SecurityPage() {
  const t = useT();
  const qc = useQueryClient();
  const [supported, setSupported] = useState<boolean | null>(null);

  useEffect(() => {
    passkeysSupported().then(setSupported);
  }, []);

  const { data: passkeys, isLoading } = useQuery({
    queryKey: ["my-passkeys"],
    queryFn: () => listMyPasskeys(),
  });

  const enroll = useMutation({
    mutationFn: async () => {
      const label =
        typeof navigator !== "undefined" && /iPhone|iPad/i.test(navigator.userAgent)
          ? "iPhone / iPad (Face ID)"
          : /Mac/i.test(navigator.userAgent ?? "")
            ? "Mac (Touch ID)"
            : /Android/i.test(navigator.userAgent ?? "")
              ? "Android device"
              : "This device";
      await registerPasskey(label);
    },
    onSuccess: () => {
      toast.success("Face ID / passkey enabled on this device");
      qc.invalidateQueries({ queryKey: ["my-passkeys"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not enable Face ID"),
  });

  const remove = useMutation({
    mutationFn: (id: string) => deleteMyPasskey({ data: { id } }),
    onSuccess: () => {
      toast.success("Passkey removed");
      qc.invalidateQueries({ queryKey: ["my-passkeys"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Could not remove"),
  });

  return (
    <div>
      <PageHeader
        title={t("settings.security.title")}
        description={t("settings.security.subtitle")}
      />
      <div className="space-y-4 p-4 sm:p-6">
        <Card className="card-luxe">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Fingerprint className="h-4 w-4 text-gold" /> Face ID & Touch ID
            </CardTitle>
            <CardDescription>
              Use your device's biometrics to sign in instead of typing a password.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {supported === false ? (
              <p className="text-sm text-muted-foreground">
                This browser or device does not support platform biometrics.
              </p>
            ) : (
              <Button
                onClick={() => enroll.mutate()}
                disabled={enroll.isPending || supported === null}
                className="bg-gradient-gold text-primary-foreground shadow-gold hover:opacity-95"
              >
                {enroll.isPending ? (
                  <><Loader2 className="me-2 h-4 w-4 animate-spin" />Setting up…</>
                ) : (
                  <><ShieldCheck className="me-2 h-4 w-4" />Enable Face ID on this device</>
                )}
              </Button>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Registered devices</CardTitle>
            <CardDescription>Remove any device you no longer use.</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <p className="p-4 text-sm text-muted-foreground">Loading…</p>
            ) : !passkeys || passkeys.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">
                No passkeys yet. Enable Face ID above to add this device.
              </p>
            ) : (
              <ul className="divide-y">
                {passkeys.map((p: any) => (
                  <li key={p.id} className="flex items-center justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <div className="font-medium">{p.device_label}</div>
                      <div className="text-xs text-muted-foreground">
                        Added {new Date(p.created_at).toLocaleDateString()}
                        {p.last_used_at
                          ? ` · Last used ${new Date(p.last_used_at).toLocaleDateString()}`
                          : " · Never used"}
                      </div>
                    </div>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => remove.mutate(p.id)}
                      disabled={remove.isPending}
                    >
                      <Trash2 className="me-1 h-3.5 w-3.5" /> Remove
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}