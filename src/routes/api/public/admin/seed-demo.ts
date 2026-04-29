import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const DEMO_USERS = [
  { email: "admin@demo.test",    password: "Admin#12345",    full_name: "Demo Admin",    role: "admin"    as const },
  { email: "teller@demo.test",   password: "Teller#12345",   full_name: "Demo Teller",   role: "teller"   as const },
  { email: "auditor@demo.test",  password: "Auditor#12345",  full_name: "Demo Auditor",  role: "auditor"  as const },
  { email: "consumer@demo.test", password: "Customer#1234",  full_name: "Demo Customer", role: "consumer" as const },
];

async function ensureUser(email: string, password: string, full_name: string): Promise<string> {
  // Try create — succeeds when user is new.
  const created = await supabaseAdmin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { full_name },
  });
  if (created.data.user) return created.data.user.id;
  // Already exists — look it up by listing (limited to 1000, plenty for demo).
  const list = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
  const found = list.data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
  if (!found) throw new Error(`Could not create or find ${email}: ${created.error?.message ?? "unknown"}`);
  // Reset password so it always matches what's documented on the login page.
  await supabaseAdmin.auth.admin.updateUserById(found.id, { password, email_confirm: true });
  return found.id;
}

export const Route = createFileRoute("/api/public/admin/seed-demo")({
  server: {
    handlers: {
      POST: async () => {
        try {
          // 1. Ensure demo auth users exist with documented passwords.
          const ids: Record<string, string> = {};
          for (const u of DEMO_USERS) {
            ids[u.role] = await ensureUser(u.email, u.password, u.full_name);
          }

          // 2. Assign roles (idempotent — unique on (user_id, role)).
          for (const u of DEMO_USERS) {
            await supabaseAdmin
              .from("user_roles")
              .upsert({ user_id: ids[u.role], role: u.role }, { onConflict: "user_id,role" });
          }

          // 3. Seed vaults, customers, balances, transactions.
          const { data: ledger, error: ledgerErr } = await supabaseAdmin.rpc("seed_demo_ledger", {
            p_admin_id: ids.admin,
            p_teller_id: ids.teller,
            p_consumer_id: ids.consumer,
          });
          if (ledgerErr) throw ledgerErr;

          return Response.json({
            ok: true,
            users: DEMO_USERS.map((u) => ({ email: u.email, role: u.role, id: ids[u.role] })),
            ledger,
          });
        } catch (err: any) {
          console.error("[seed-demo] failed", err);
          return Response.json({ ok: false, error: err?.message ?? String(err) }, { status: 500 });
        }
      },
      GET: async () =>
        Response.json({
          ok: true,
          hint: "POST to this endpoint to (re)seed demo users + ledger data.",
          demo_logins: DEMO_USERS.map(({ email, password, role }) => ({ email, password, role })),
        }),
    },
  },
});