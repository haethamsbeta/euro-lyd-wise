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

const isLambda = DATA_BACKEND === "lambda";
const SUPABASE_DISABLED_MSG =
  "Use the backend (Lambda) to create staff members. Supabase mode does not write users.";

export const Route = createFileRoute("/app/users/new")({
  component: () => (
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
      toast.success(res?.message ?? "User created.");
      await qc.invalidateQueries({ queryKey: ["users.profiles"] });
      nav({ to: "/app/users" });
    },
    onError: (e: any) => {
      const httpStatus = e instanceof ApiError ? e.status : undefined;
      // eslint-disable-next-line no-console
      console.error("[create dahab member] failed", { httpStatus, message: e?.message, details: e?.details, error: e });
      toast.error(e?.message ?? "Failed to create member");
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
        title="Add DAHAB member"
        description="Create a DAHAB Family portal staff account (admin, teller, or auditor). Admin only."
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to="/app/users">
              <ArrowLeft className="me-1 h-4 w-4" /> Back
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
            <AlertTitle>Create failed</AlertTitle>
            <AlertDescription>
              {(submit.error as any)?.message ?? "Unknown error from backend."}
              {submit.error instanceof ApiError ? (
                <span className="ms-1 opacity-70">(HTTP {submit.error.status})</span>
              ) : null}
            </AlertDescription>
          </Alert>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Member details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Username</Label>
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="e.g. ahmed.a"
                autoComplete="off"
              />
              <p className="text-xs text-muted-foreground">Unique. Lowercased automatically.</p>
            </div>
            <div className="space-y-1.5">
              <Label>Display name</Label>
              <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label>Role</Label>
                <Select value={role} onValueChange={(v) => setRole(v as StaffRole)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="admin">Admin</SelectItem>
                    <SelectItem value="teller">Teller</SelectItem>
                    <SelectItem value="auditor">Auditor</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={status} onValueChange={(v) => setStatus(v as "active" | "disabled")}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="disabled">Disabled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Temporary password</Label>
              <div className="flex gap-2">
                <Input value={password} onChange={(e) => setPassword(e.target.value)} className="font-mono" />
                <Button type="button" variant="outline" onClick={() => setPassword(genPassword())}>
                  <Sparkles className="me-1 h-4 w-4" /> Generate
                </Button>
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={mustChange}
                onCheckedChange={(v) => setMustChange(v === true)}
              />
              <span>Require password change on first sign-in</span>
            </label>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button variant="outline" asChild>
            <Link to="/app/users">Cancel</Link>
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
            Create DAHAB member
          </Button>
        </div>
      </div>
    </div>
  );
}