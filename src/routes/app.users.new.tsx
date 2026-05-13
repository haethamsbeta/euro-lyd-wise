import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { PageHeader, RoleGate } from "@/components/app/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { ArrowLeft, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { DATA_BACKEND } from "@/lib/runtimeConfig";
import { ApiError } from "@/lib/dahabApi";
import { useT } from "@/lib/i18n";

const isLambda = DATA_BACKEND === "lambda";
const SUPABASE_DISABLED_MSG =
  "Use the backend (Lambda) to create staff members. Supabase mode does not write users.";

export const Route = createFileRoute("/app/users/new")({
  head: () => ({ meta: [{ title: "New staff user — Dahab" }, { name: "description", content: "Invite a new Dahab staff member and assign their role." }] }), component: () => (
    <RoleGate allow={["admin"]}>
      <NewMemberPage />
    </RoleGate>
  ),
});

function genPassword() {
  const chars = "ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$%";
  let p = "";
  const arr = new Uint32Array(14);
  crypto.getRandomValues(arr);
  for (let i = 0; i < arr.length; i++) p += chars[arr[i] % chars.length];
  return p;
}

type StaffRole = "admin" | "teller" | "auditor";

export function NewMemberPage() {
  const nav = useNavigate();
  const t = useT();
  const qc = useQueryClient();
  const [username, setUsername] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState(() => genPassword());
  const [role, setRole] = useState<StaffRole>("teller");
  const [status, setStatus] = useState<"active" | "disabled">("active");
  const [mustChange, setMustChange] = useState(true);

  const submit = useMutation({
    mutationFn: () => {
      const payload = {
        username: username.trim().toLowerCase(),
        email: email.trim(),
        display_name: displayName.trim(),
        password,
        role,
        status,
        must_change_password: mustChange,
      };
      // eslint-disable-next-line no-console
      console.log("[create dahab member]", {
        payload: { ...payload, password: "***" },
        endpoint: "/users",
        mode: DATA_BACKEND,
      });
      return api.users.create(payload);
    },
    onSuccess: async (res: any) => {
      // eslint-disable-next-line no-console
      console.log("[create dahab member] success", res);
      toast.success(res?.message ?? t("usersNew.created"));
      await qc.invalidateQueries({ queryKey: ["users.profiles"] });
      nav({ to: "/app/users" });
    },
    onError: (e: any) => {
      const httpStatus = e instanceof ApiError ? e.status : undefined;
      // eslint-disable-next-line no-console
      console.error("[create dahab member] failed", { httpStatus, message: e?.message, details: e?.details, error: e });
      toast.error(e?.message ?? t("usersNew.createFailed"));
    },
  });

  const ready =
    username.trim().length >= 3 &&
    displayName.trim().length >= 2 &&
    /.+@.+\..+/.test(email) &&
    password.length >= 8;

  const disableSubmit = !ready || submit.isPending || !isLambda;

  return (
    <div>
      <PageHeader
        title={t("usersNew.title")}
        description={t("usersNew.subtitle")}
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to="/app/users">
              <ArrowLeft className="me-1 h-4 w-4" /> {t("common.back")}
            </Link>
          </Button>
        }
      />
      <div className="mx-auto max-w-2xl space-y-4 p-4 sm:p-6">
        {!isLambda ? (
          <Alert variant="destructive">
            <AlertTitle>Disabled in Supabase mode</AlertTitle>
            <AlertDescription>{SUPABASE_DISABLED_MSG}</AlertDescription>
          </Alert>
        ) : null}
        {submit.isError ? (
          <Alert variant="destructive">
            <AlertTitle>{t("usersNew.createFailed")}</AlertTitle>
            <AlertDescription>
              {(submit.error as any)?.message ?? t("common.unknownError")}
              {submit.error instanceof ApiError ? (
                <span className="ms-1 opacity-70">(HTTP {submit.error.status})</span>
              ) : null}
            </AlertDescription>
          </Alert>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("usersNew.memberDetails")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>{t("common.username")}</Label>
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. ahmed.a"
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">{t("usersNew.usernameHint")}</p>
            </div>
            <div className="space-y-1.5">
              <Label>{t("usersNew.displayName")}</Label>
              <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>{t("common.email")}</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>{t("common.role")}</Label>
                <Select value={role} onValueChange={(v) => setRole(v as StaffRole)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">{t("usersNew.role.admin")}</SelectItem>
                    <SelectItem value="teller">{t("usersNew.role.teller")}</SelectItem>
                    <SelectItem value="auditor">{t("usersNew.role.auditor")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>{t("common.status")}</Label>
                <Select value={status} onValueChange={(v) => setStatus(v as "active" | "disabled")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">{t("usersNew.status.active")}</SelectItem>
                    <SelectItem value="disabled">{t("usersNew.status.disabled")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{t("usersNew.tempPassword")}</Label>
              <div className="flex gap-2">
                <Input value={password} onChange={(e) => setPassword(e.target.value)} className="font-mono" />
                <Button type="button" variant="outline" onClick={() => setPassword(genPassword())}>
                  <Sparkles className="me-1 h-4 w-4" /> {t("usersNew.generate")}
                </Button>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={mustChange}
                onCheckedChange={(v) => setMustChange(v === true)}
              />
              <span>{t("usersNew.mustChange")}</span>
            </label>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button variant="outline" asChild>
            <Link to="/app/users">{t("common.cancel")}</Link>
          </Button>
          <Button
            disabled={disableSubmit}
            title={!isLambda ? SUPABASE_DISABLED_MSG : undefined}
            onClick={() => {
              if (!isLambda) {
                toast.error(SUPABASE_DISABLED_MSG);
                return;
              }
              submit.mutate();
            }}
          >
            {submit.isPending ? <Loader2 className="me-1 h-4 w-4 animate-spin" /> : null}
            {t("usersNew.create")}
          </Button>
        </div>
      </div>
    </div>
  );
}