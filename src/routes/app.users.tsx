import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader, RoleGate } from "@/components/app/app-shell";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { useT } from "@/lib/i18n";
import { useAuth } from "@/lib/auth";
import { KeyRound, Mail, UserPlus, BellRing, BellOff, Send, UserCheck, UserX } from "lucide-react";
import { adminListUserEmails, adminChangeUserEmail } from "@/server/admin.functions";
import { sendTestPushToUser } from "@/server/push.functions";
import { formatDistanceToNow } from "date-fns";
import { api } from "@/lib/api";
import { DATA_BACKEND } from "@/lib/runtimeConfig";

export const Route = createFileRoute("/app/users")({
  component: () => <RoleGate allow={["admin"]}><UsersRoute /></RoleGate>,
});

const ROLES = ["admin", "teller", "auditor", "consumer"] as const;

function UsersRoute() {
  const location = useLocation();
  return location.pathname === "/app/users" ? <UsersPage /> : <Outlet />;
}

function UsersPage() {
  const t = useT();
  const qc = useQueryClient();
  const { user } = useAuth();
  const [search, setSearch] = useState("");
  const [resettingId, setResettingId] = useState<string | null>(null);
  const [emailEdit, setEmailEdit] = useState<{ id: string; current: string | null } | null>(null);
  const [newEmail, setNewEmail] = useState("");
  const [testingId, setTestingId] = useState<string | null>(null);

  const listEmails = useServerFn(adminListUserEmails);
  const changeEmail = useServerFn(adminChangeUserEmail);
  const isLambda = DATA_BACKEND === "lambda";
  const PENDING_MSG = "User management write endpoint pending.";

  const { data } = useQuery({
    queryKey: ["users.profiles"],
    enabled: !!user,
    retry: false,
    queryFn: async () => {
      if (DATA_BACKEND === "lambda") {
        // Lambda mode: GET /users?limit=&offset= → { items, total, limit, offset, next_offset }
        const res: any = await api.users.list({ limit: 100, offset: 0 });
        const rows: any[] = Array.isArray(res?.items) ? res.items : Array.isArray(res) ? res : [];
        const rolesFor = (u: any): string[] => {
          if (Array.isArray(u.roles) && u.roles.length) return u.roles;
          if (u.role) return [u.role];
          return [];
        };
        return {
          profiles: rows.map((u: any) => ({
            id: u.id,
            full_name: u.display_name ?? u.full_name ?? u.username ?? u.email ?? "—",
            created_at: u.created_at,
            status: u.status ?? (u.is_active === false ? "disabled" : "active"),
            last_login_at: u.last_login_at ?? null,
          })),
          roles: rows.flatMap((u: any) =>
            rolesFor(u).map((role: string) => ({
              user_id: u.id,
              role,
              id: `${u.id}:${role}`,
            })),
          ),
          emailMap: new Map(rows.map((u: any) => [u.id, u.email ?? null])),
          pushMap: new Map<string, any>(),
          total: typeof res?.total === "number" ? res.total : rows.length,
          nextOffset: res?.next_offset ?? null,
        };
      }
      const [{ data: profiles, error: e1 }, { data: roles, error: e2 }, emails, pushRes] = await Promise.all([
        supabase.from("profiles").select("id, full_name, created_at"),
        supabase.from("user_roles").select("user_id, role, id"),
        listEmails().catch(() => [] as Array<{ id: string; email: string | null }>),
        supabase.rpc("admin_list_push_status"),
      ]);
      if (e1) throw e1;
      if (e2) throw e2;
      const emailMap = new Map((emails ?? []).map((e) => [e.id, e.email]));
      const pushMap = new Map(
        ((pushRes?.data as Array<{
          user_id: string;
          browser_push_enabled: boolean;
          subscription_count: number;
          last_seen_at: string | null;
          last_success_at: string | null;
        }> | null) ?? []).map(
          (r) => [r.user_id, r],
        ),
      );
      return { profiles: profiles ?? [], roles: roles ?? [], emailMap, pushMap };
    },
  });

  const changeEmailMut = useMutation({
    mutationFn: ({ user_id, new_email }: { user_id: string; new_email: string }) => {
      if (isLambda) throw new Error(PENDING_MSG);
      return changeEmail({ data: { user_id, new_email } });
    },
    onSuccess: (_res, vars) => {
      toast.success("Email updated successfully", {
        description: `Confirmation sent to ${vars.new_email}.`,
      });
      setEmailEdit(null);
      setNewEmail("");
      qc.invalidateQueries({ queryKey: ["users.profiles"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const grant = useMutation({
    mutationFn: async ({ user_id, role }: { user_id: string; role: typeof ROLES[number] }) => {
      if (isLambda) {
        if (role === "consumer") throw new Error("Consumer accounts are created from the Consumer Portal Accounts page.");
        const res: any = await api.users.setRole(user_id, role as any);
        return res;
      }
      const { error } = await supabase.from("user_roles").insert({ user_id, role });
      if (error) throw error;
    },
    onSuccess: (res: any) => {
      toast.success(res?.message ?? "User role updated.");
      qc.invalidateQueries({ queryKey: ["users.profiles"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const revoke = useMutation({
    mutationFn: async (id: string) => {
      if (isLambda) throw new Error(PENDING_MSG);
      const { error } = await supabase.from("user_roles").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => { toast.success(t("users.revoked")); qc.invalidateQueries({ queryKey: ["users.profiles"] }); },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  const statusMut = useMutation({
    mutationFn: async ({ user_id, status }: { user_id: string; status: "active" | "disabled" }) => {
      if (!isLambda) throw new Error("Supported in lambda mode only.");
      return await api.users.setStatus(user_id, status) as any;
    },
    onSuccess: (res: any) => {
      toast.success(res?.message ?? "User status updated.");
      qc.invalidateQueries({ queryKey: ["users.profiles"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Failed"),
  });

  async function onResetPassword(targetId: string, name: string) {
    if (isLambda) {
      if (!confirm(`Reset password for ${name}?`)) return;
      setResettingId(targetId);
      try {
        const res: any = await api.users.passwordReset(targetId);
        toast.success(res?.message ?? "User password reset.");
        qc.invalidateQueries({ queryKey: ["users.profiles"] });
      } catch (e: any) {
        toast.error(e?.message ?? "Reset failed");
      } finally {
        setResettingId(null);
      }
      return;
    }
    if (!confirm(`Reset password for ${name}? They will be signed out and emailed a reset link.`)) return;
    setResettingId(targetId);
    try {
      const { data: rpc, error } = await supabase.rpc("admin_reset_password", {
        p_target_user: targetId,
      });
      if (error) throw error;
      const email = (rpc as any)?.email as string | undefined;
      if (!email) throw new Error("Could not resolve user email");
      const redirectTo = `${window.location.origin}/reset-password`;
      const { error: mailErr } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
      if (mailErr) throw mailErr;
      toast.success("Reset link sent. The user must set a new password before signing in.");
    } catch (e: any) {
      toast.error(e?.message ?? "Reset failed");
    } finally {
      setResettingId(null);
    }
  }

  async function onSendTest(targetId: string, name: string) {
    if (isLambda) { toast.message(PENDING_MSG); return; }
    setTestingId(targetId);
    try {
      const r = await sendTestPushToUser({ data: { user_id: targetId } });
      if (r.sent > 0) {
        toast.success(`Test sent to ${name}`, {
          description: `Delivered to ${r.sent} of ${r.total} device(s) — they'll see a system popup.`,
        });
      } else if (r.total === 0) {
        toast.message(`In-app test sent to ${name}`, {
          description: "They have no push-enabled devices yet — only the in-app inbox will show it.",
        });
      } else {
        toast.warning(`Push delivery failed for ${name}`, {
          description: `0 of ${r.total} device(s) received the push. The in-app inbox still got the test.`,
        });
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setTestingId(null);
    }
  }

  const profiles = (data?.profiles ?? []).filter((p) =>
    !search || p.full_name.toLowerCase().includes(search.toLowerCase()) || p.id.includes(search),
  );

  return (
    <div>
      <PageHeader title={t("users.title")} description={t("users.subtitle")} />
      <div className="space-y-4 p-4 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-3">
            <Input placeholder={t("users.search")} value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-sm" />
            {typeof (data as any)?.total === "number" ? (
              <span className="text-xs text-muted-foreground">
                Showing {(data?.profiles ?? []).length} of {(data as any).total}
              </span>
            ) : null}
          </div>
          <Button asChild size="sm">
            <Link to="/app/users/new">
              <UserPlus className="me-1 h-4 w-4" /> {t("users.addMember")}
            </Link>
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          DAHAB Family portal users (admin, teller, auditor) are created here.
          Consumer accounts are created from the Consumer Portal Accounts page.
        </p>
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-muted/40 text-xs uppercase tracking-wide text-muted-foreground">
                <tr>
                  <th className="px-4 py-2 text-start">{t("users.col.user")}</th>
                  <th className="px-4 py-2 text-start">Email</th>
                  <th className="px-4 py-2 text-start">{t("users.col.roles")}</th>
                  <th className="px-4 py-2 text-start">Status</th>
                  <th className="px-4 py-2 text-start">Last login</th>
                  <th className="px-4 py-2 text-start">Push</th>
                  <th className="px-4 py-2 text-start">Test push</th>
                  <th className="px-4 py-2 text-start">{t("users.col.grant")}</th>
                  <th className="px-4 py-2 text-start">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {profiles.map((p) => {
                  const userRoles = (data?.roles ?? []).filter((r) => r.user_id === p.id);
                  const email = data?.emailMap?.get(p.id) ?? null;
                  const push = data?.pushMap?.get(p.id);
                  const pushOn = !!push?.browser_push_enabled && (push?.subscription_count ?? 0) > 0;
                  const pushPartial = !!push?.browser_push_enabled && (push?.subscription_count ?? 0) === 0;
                  return (
                    <tr key={p.id}>
                      <td className="px-4 py-2">
                        <div className="font-medium">{p.full_name || t("users.noName")}</div>
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          <span className="text-xs">{email ?? <span className="text-muted-foreground">—</span>}</span>
                          <TooltipProvider delayDuration={150}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 px-2"
                                    aria-label="Change email"
                                    disabled={isLambda}
                                    onClick={() => { setEmailEdit({ id: p.id, current: email }); setNewEmail(email ?? ""); }}
                                  >
                                    <Mail className="h-3.5 w-3.5" />
                                  </Button>
                                </span>
                              </TooltipTrigger>
                              <TooltipContent>{isLambda ? PENDING_MSG : "Change email"}</TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex flex-wrap gap-1">
                          {userRoles.length === 0 ? <span className="text-xs text-muted-foreground">{t("users.none")}</span> : null}
                          {userRoles.map((r) => (
                            <Badge key={r.id} variant="secondary" className="gap-1">
                              {r.role}
                              <button
                                className="ml-1 text-xs opacity-60 hover:opacity-100 disabled:cursor-not-allowed disabled:opacity-40"
                                title={isLambda ? "Use Change role to reassign." : "Revoke role"}
                                disabled={isLambda}
                                onClick={() => revoke.mutate(r.id)}
                              >×</button>
                            </Badge>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        {(() => {
                          const status = (p as any).status as string | undefined;
                          if (!status) return <span className="text-xs text-muted-foreground">—</span>;
                          const active = /^active$/i.test(status);
                          return (
                            <Badge variant={active ? "default" : "outline"} className="capitalize">
                              {status}
                            </Badge>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-2">
                        {(p as any).last_login_at ? (
                          <span className="text-xs">
                            {formatDistanceToNow(new Date((p as any).last_login_at), { addSuffix: true })}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">Never</span>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        {isLambda ? (
                          <span className="text-xs text-muted-foreground">—</span>
                        ) : (
                        <TooltipProvider delayDuration={150}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <Badge
                                variant={pushOn ? "default" : pushPartial ? "secondary" : "outline"}
                                className="gap-1"
                              >
                                {pushOn ? <BellRing className="h-3 w-3" /> : <BellOff className="h-3 w-3" />}
                                {pushOn ? "Push on" : pushPartial ? "In-app only" : "Off"}
                              </Badge>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-xs">
                              {pushOn ? (
                                <div className="space-y-0.5">
                                  <div>{push?.subscription_count} device(s) subscribed.</div>
                                  {push?.last_seen_at && (
                                    <div className="text-xs opacity-70">
                                      Last seen {formatDistanceToNow(new Date(push.last_seen_at), { addSuffix: true })}
                                    </div>
                                  )}
                                  {push?.last_success_at && (
                                    <div className="text-xs opacity-70">
                                      Last delivery {formatDistanceToNow(new Date(push.last_success_at), { addSuffix: true })}
                                    </div>
                                  )}
                                </div>
                              ) : pushPartial
                                ? "User has push toggled on but no device is subscribed yet."
                                : "Push is off — notifications still appear in the in-app inbox."}
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                        )}
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex flex-col items-start gap-1">
                          <TooltipProvider delayDuration={150}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <span>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="gap-1.5"
                                    disabled={isLambda || testingId === p.id}
                                    onClick={() => onSendTest(p.id, p.full_name || "this user")}
                                  >
                                    <Send className="h-3.5 w-3.5" />
                                    {testingId === p.id ? "Sending…" : "Send test"}
                                  </Button>
                                </span>
                              </TooltipTrigger>
                              {isLambda ? <TooltipContent>{PENDING_MSG}</TooltipContent> : null}
                            </Tooltip>
                          </TooltipProvider>
                          <span className="text-[11px] text-muted-foreground">
                            {isLambda
                              ? "Push status pending"
                              : pushOn
                              ? `Ready — ${push?.subscription_count} device(s)`
                              : pushPartial
                                ? "In-app only (no devices)"
                                : "Off — in-app only"}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-2">
                        <GrantRole
                          userId={p.id}
                          existing={userRoles.map((r) => r.role)}
                          lambdaMode={isLambda}
                          pending={grant.isPending}
                          onGrant={(role) => grant.mutate({ user_id: p.id, role })}
                        />
                      </td>
                      <td className="px-4 py-2">
                        <div className="flex items-center gap-2">
                          {(() => {
                          const isStaff = userRoles.some((r) => ["admin","teller","auditor"].includes(r.role));
                          const isSelf = user?.id === p.id;
                          if (!isStaff || isSelf) return null;
                          const statusStr = ((p as any).status ?? "").toString().toLowerCase();
                          const active = statusStr !== "disabled" && statusStr !== "inactive";
                          return (
                            <>
                              {isLambda ? (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="gap-1.5"
                                  disabled={statusMut.isPending}
                                  onClick={() => {
                                    const next = active ? "disabled" : "active";
                                    if (!confirm(`${active ? "Disable" : "Enable"} ${p.full_name || "this user"}?`)) return;
                                    statusMut.mutate({ user_id: p.id, status: next });
                                  }}
                                >
                                  {active ? <UserX className="h-3.5 w-3.5" /> : <UserCheck className="h-3.5 w-3.5" />}
                                  {active ? "Disable" : "Enable"}
                                </Button>
                              ) : null}
                            <TooltipProvider delayDuration={150}>
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <span>
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
                                  </span>
                                </TooltipTrigger>
                              </Tooltip>
                            </TooltipProvider>
                            </>
                          );
                          })()}
                        </div>
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

      <Dialog open={!!emailEdit} onOpenChange={(o) => { if (!o) { setEmailEdit(null); setNewEmail(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change user email</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="text-xs text-muted-foreground">Current: <span className="font-mono">{emailEdit?.current ?? "—"}</span></div>
            <div className="space-y-1.5">
              <Label>New email</Label>
              <Input type="email" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setEmailEdit(null); setNewEmail(""); }}>Cancel</Button>
            <Button
              disabled={!/.+@.+\..+/.test(newEmail) || changeEmailMut.isPending}
              onClick={() => emailEdit && changeEmailMut.mutate({ user_id: emailEdit.id, new_email: newEmail.trim() })}
            >Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function GrantRole({ existing, onGrant, lambdaMode, pending }: { userId: string; existing: string[]; onGrant: (role: typeof ROLES[number]) => void; lambdaMode?: boolean; pending?: boolean }) {
  const t = useT();
  const [val, setVal] = useState<string>("");
  // Lambda backend uses a single-role model: any staff role replaces the current role via PATCH /users/:id/role.
  // In Supabase legacy mode, roles are additive — exclude already-granted roles.
  const available = lambdaMode
    ? (["admin", "teller", "auditor"] as typeof ROLES[number][]).filter((r) => !existing.includes(r))
    : ROLES.filter((r) => !existing.includes(r));
  if (available.length === 0) return <span className="text-xs text-muted-foreground">{t("users.allGranted")}</span>;
  return (
    <div className="flex items-center gap-2">
      <Select value={val} onValueChange={setVal} disabled={pending}>
        <SelectTrigger className="h-8 w-32"><SelectValue placeholder={t("users.role")} /></SelectTrigger>
        <SelectContent>
          {available.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
        </SelectContent>
      </Select>
      <Button
        size="sm"
        disabled={!val || pending}
        onClick={() => { onGrant(val as any); setVal(""); }}
      >
        {lambdaMode ? "Change role" : t("users.grant")}
      </Button>
    </div>
  );
}