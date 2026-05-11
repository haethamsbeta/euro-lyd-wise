import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { PageHeader, RoleGate } from "@/components/app/app-shell";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { ArrowLeft, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { adminCreateConsumer, adminListHolders } from "@/server/admin.functions";
import { useAuth } from "@/lib/auth";
import { DATA_BACKEND } from "@/lib/runtimeConfig";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

const isLambda = DATA_BACKEND === "lambda";
const LAMBDA_PENDING_MSG =
  "Creating DAHAB Family users requires Lambda user management endpoint (POST /users). This form is disabled until the backend exposes that endpoint.";

export const Route = createFileRoute("/app/users/new-consumer")({
  component: () => (
    <RoleGate allow={["admin"]}>
      <NewConsumerPage />
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

function NewConsumerPage() {
  const nav = useNavigate();
  const { user } = useAuth();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState(() => genPassword());
  const [search, setSearch] = useState("");
  const [picked, setPicked] = useState<Set<number>>(new Set());

  const listHolders = useServerFn(adminListHolders);
  const create = useServerFn(adminCreateConsumer);

  const { data: holders } = useQuery({
    queryKey: ["admin.holders"],
    enabled: !!user,
    queryFn: () => listHolders().catch(() => [] as Array<{ id: number; canonical_name: string; dahab_account_number: string | null; owner_user_id: string | null }>),
  });

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const list = holders ?? [];
    if (!term) return list.slice(0, 50);
    return list
      .filter(
        (h) =>
          h.canonical_name.toLowerCase().includes(term) ||
          (h.dahab_account_number ?? "").toLowerCase().includes(term),
      )
      .slice(0, 50);
  }, [holders, search]);

  const submit = useMutation({
    mutationFn: () => {
      if (isLambda) {
        throw new Error(LAMBDA_PENDING_MSG);
      }
      return create({
        data: {
          full_name: fullName.trim(),
          email: email.trim(),
          password,
          holder_ids: Array.from(picked),
        },
      });
    },
    onSuccess: () => {
      toast.success("Consumer account created");
      nav({ to: "/app/users" });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed to create consumer"),
  });

  const ready = fullName.trim().length >= 2 && /.+@.+\..+/.test(email) && password.length >= 8;

  return (
    <div>
      <PageHeader
        title="Add consumer account"
        description="Create a portal login for a customer and link their holder account(s)"
        actions={
          <Button asChild variant="outline" size="sm">
            <Link to="/app/users">
              <ArrowLeft className="me-1 h-4 w-4" /> Back
            </Link>
          </Button>
        }
      />
      <div className="mx-auto max-w-2xl space-y-4 p-4 sm:p-6">
        {isLambda ? (
          <Alert variant="destructive">
            <AlertTitle>Backend endpoint pending</AlertTitle>
            <AlertDescription>{LAMBDA_PENDING_MSG}</AlertDescription>
          </Alert>
        ) : null}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Account details</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Full name</Label>
              <Input value={fullName} onChange={(e) => setFullName(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Temporary password</Label>
              <div className="flex gap-2">
                <Input value={password} onChange={(e) => setPassword(e.target.value)} className="font-mono" />
                <Button type="button" variant="outline" onClick={() => setPassword(genPassword())}>
                  <Sparkles className="me-1 h-4 w-4" /> Generate
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                The user will be required to change this on first login.
              </p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Link holder accounts</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Input
              placeholder="Search by name or DAHAB #…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="max-h-72 overflow-auto rounded-md border">
              <ul className="divide-y">
                {filtered.map((h) => {
                  const checked = picked.has(h.id);
                  const linkedToOther = !!h.owner_user_id;
                  return (
                    <li key={h.id} className="flex items-center gap-3 px-3 py-2 text-sm">
                      <Checkbox
                        checked={checked}
                        onCheckedChange={(v) => {
                          const next = new Set(picked);
                          if (v) next.add(h.id);
                          else next.delete(h.id);
                          setPicked(next);
                        }}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{h.canonical_name}</div>
                        <div className="font-mono text-xs text-muted-foreground">{h.dahab_account_number}</div>
                      </div>
                      {linkedToOther ? (
                        <Badge variant="outline" className="text-amber-600">
                          Linked
                        </Badge>
                      ) : null}
                    </li>
                  );
                })}
                {filtered.length === 0 ? (
                  <li className="p-3 text-sm text-muted-foreground">No matches.</li>
                ) : null}
              </ul>
            </div>
            <p className="text-xs text-muted-foreground">
              Linking a holder already owned by another user will reassign it.
            </p>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button variant="outline" asChild>
            <Link to="/app/users">Cancel</Link>
          </Button>
          <Button
            disabled={!ready || submit.isPending || isLambda}
            title={isLambda ? LAMBDA_PENDING_MSG : undefined}
            onClick={() => {
              if (isLambda) {
                toast.error(LAMBDA_PENDING_MSG);
                return;
              }
              submit.mutate();
            }}
          >
            {submit.isPending ? <Loader2 className="me-1 h-4 w-4 animate-spin" /> : null}
            Create consumer account
          </Button>
        </div>
      </div>
    </div>
  );
}