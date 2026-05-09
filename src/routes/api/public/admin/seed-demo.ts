import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// SQL Server cutover note: this endpoint is Postgres-only and depends on the
// Supabase auth admin API + the seed_demo_ledger() pgSQL function. It MUST
// NOT run against the SQL Server DAHABDB backend. We hard-disable it unless
// NODE_ENV === "development" to keep production builds safe.
const SEED_DEMO_ENABLED = process.env.NODE_ENV === "development";

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
      POST: async ({ request }) => {
        if (!SEED_DEMO_ENABLED) {
          return Response.json(
            { ok: false, error: "Disabled outside development." },
            { status: 404 },
          );
        }
        // Require a shared secret to prevent unauthenticated admin takeover.
        const expected = process.env.SEED_SECRET;
        if (!expected) {
          return Response.json(
            { ok: false, error: "Seeding disabled: SEED_SECRET is not configured." },
            { status: 503 },
          );
        }
        const provided = request.headers.get("x-seed-secret");
        if (!provided || provided !== expected) {
          return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
        }
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
        !SEED_DEMO_ENABLED
          ? Response.json({ ok: false, error: "Not found" }, { status: 404 }) :
        Response.json(
          {
            ok: false,
            hint: "POST to this endpoint with header 'x-seed-secret: <SEED_SECRET>' to (re)seed demo data. Credentials are not exposed via GET.",
          },
          { status: 405 },
        ),
    },
  },
});