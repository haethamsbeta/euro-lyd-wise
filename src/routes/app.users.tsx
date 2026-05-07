import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, RoleGate } from "@/components/app/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { adminResetPassword } from "@/server/auth.functions";
import { useAuth } from "@/lib/auth";
import { KeyRound } from "lucide-react";

export const Route = createFileRoute("/app/users")({
  component: () => <RoleGate allow={["admin"]}><UsersPage /></RoleGate>,
});

const ROLES = ["admin", "teller", "auditor", "consumer"] as const;

function UsersPage() {
  const t = useT();
  const qc = useQueryClient();
  const { user } = useAuth();
  const resetFn = useServerFn(adminResetPassword);
  const [search, setSearch] = useState("");
  const [resettingId, setResettingId] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ["users.profiles"],
    queryFn: async () => {
      const [{ data: profiles, error: e1 }, { data: roles, error: e2 }] = await Promise.all([
        supabase.from("profiles").select("id, full_name, created_at"),
        supabase.from("user_roles").select("user_id, role, id"),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      return { profiles: profiles ?? [], roles: roles ?? [] };
    },
  });

  const grant = useMutation({
    mutationFn: async ({ user_id, role }: { user_id: string; role: typeof ROLES[number] }) => {
      const { error } = await supabase.from("user_roles").insert({ user_id, role });
      if (error) throw error;
    },
    onSuccess: () => { toast.success(t("users.granted")); qc.invalidateQueries({ queryKey: ["users.profiles"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  const revoke = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("user_roles").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success(t("users.revoked")); qc.invalidateQueries({ queryKey: ["users.profiles"] }); },
    onError: (e: any) => toast.error(e.message),
  });

  async function onResetPassword(targetId: string, name: string) {
    if (!confirm(`Reset password for ${name}? They will be signed out and emailed a reset link.`)) return;
    setResettingId(targetId);
    try {
      await resetFn({ data: { userId: targetId } });
      toast.success("Reset link sent. The user must set a new password before signing in.");
    } catch (e: any) {
      toast.error(e?.message ?? "Reset failed");
    } finally {
      setResettingId(null);
    }
  }

  const profiles = (data?.profiles ?? []).filter((p) =>
    !search || p.full_name.toLowerCase().includes(search.toLowerCase()) || p.id.includes(search),
  );

  return (
    <div>
      <PageHeader title={t("users.title")} description={t("users.subtitle")} />
      <div className="space-y-4 p-4 sm:p-6">
        <Input placeholder={t("users.search")} value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-start">{t("users.col.user")}</th>
                  <th className="px-4 py-2 text-start">{t("users.col.roles")}</th>
                  <th className="px-4 py-2 text-start">{t("users.col.grant")}</th>
                  <th className="px-4 py-2 text-start">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {profiles.map((p) => {
                  const userRoles = (data?.roles ?? []).filter((r) => r.user_id === p.id);
                  return (
                    <tr key={p.id}>
                      <td className="px-4 py-2">
                        <div className="font-medium">{p.full_name || t("users.noName")}</div>
                        <div className="font-mono text-xs text-muted-foreground">{p.id}</div>
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex flex-wrap gap-1">
                          {userRoles.length === 0 ? <span className="text-xs text-muted-foreground">{t("users.none")}</span> : null}
                          {userRoles.map((r) => (
                            <Badge key={r.id} variant="secondary" className="gap-1">
                              {r.role}
                              <button className="ml-1 text-xs opacity-60 hover:opacity-100" onClick={() => revoke.mutate(r.id)}>×</button>
                            </Badge>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        <GrantRole userId={p.id} existing={userRoles.map((r) => r.role)} onGrant={(role) => grant.mutate({ user_id: p.id, role })} />
                      </td>
                      <td className="px-4 py-2">
                        {(() => {
                          const isStaff = userRoles.some((r) => ["admin","teller","auditor"].includes(r.role));
                          const isSelf = user?.id === p.id;
                          if (!isStaff || isSelf) return <span className="text-xs text-muted-foreground">—</span>;
                          return (
                            <Button
                              size="sm"
                              variant="outline"
                              className="gap-1.5"
                              disabled={resettingId === p.id}
                              onClick={() => onResetPassword(p.id, p.full_name || "this user")}
                            >
                              <KeyRound className="h-3.5 w-3.5" />
                              {resettingId === p.id ? "Sending…" : "Reset password"}
                            </Button>
                          );
                        })()}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function GrantRole({ userId, existing, onGrant }: { userId: string; existing: string[]; onGrant: (role: typeof ROLES[number]) => void }) {
  const t = useT();
  const [val, setVal] = useState<string>("");
  const available = ROLES.filter((r) => !existing.includes(r));
  if (available.length === 0) return <span className="text-xs text-muted-foreground">{t("users.allGranted")}</span>;
  return (
    <div className="flex items-center gap-2">
      <Select value={val} onValueChange={setVal}>
        <SelectTrigger className="h-8 w-32"><SelectValue placeholder={t("users.role")} /></SelectTrigger>
        <SelectContent>
          {available.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
        </SelectContent>
      </Select>
      <Button size="sm" disabled={!val} onClick={() => { onGrant(val as any); setVal(""); }}>{t("users.grant")}</Button>
      <span className="hidden text-xs text-muted-foreground md:inline">{userId.slice(0, 8)}…</span>
    </div>
  );
}