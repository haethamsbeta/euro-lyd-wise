import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Notifications tick — invoked by pg_cron / external scheduler.
 *
 * SQL Server cutover: when INTERNAL_API_BASE_URL + INTERNAL_WEBHOOK_SECRET
 * are set, this hook forwards a signed HMAC POST to the Lambda backend at
 * `${INTERNAL_API_BASE_URL}/api/internal/notifications/tick`. The Lambda is
 * the new system of record for reminder fan-out and reads from SQL Server
 * DAHABDB.
 *
 * Local/dev fallback: if only INTERNAL_API_BASE_URL is missing, we still call
 * the existing Postgres RPC so dev environments keep working until cutover.
 * INTERNAL_WEBHOOK_SECRET is always required.
 */

function verifySignature(secret: string, ts: string | null, body: string, signature: string | null) {
  if (!ts || !signature) return false;
  const ageMs = Math.abs(Date.now() - Number(ts));
  if (!Number.isFinite(ageMs) || ageMs > 5 * 60_000) return false;
  const expected = createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex");
  const a = Buffer.from(signature, "hex");
  const b = Buffer.from(expected, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}

export const Route = createFileRoute("/api/public/hooks/notifications-tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const base = process.env.INTERNAL_API_BASE_URL;
        const secret = process.env.INTERNAL_WEBHOOK_SECRET;
        if (!secret) {
          return Response.json(
            { ok: false, error: "Notification tick is not configured." },
            { status: 503 },
          );
        }
        const inboundBody = await request.text();
        const inboundTs = request.headers.get("x-timestamp");
        const inboundSig = request.headers.get("x-signature");
        if (!verifySignature(secret, inboundTs, inboundBody, inboundSig)) {
          return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
        }

        if (base && secret) {
          const ts = Date.now().toString();
          const body = JSON.stringify({ ts });
          const sig = createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex");
          const res = await fetch(`${base.replace(/\/$/, "")}/api/internal/notifications/tick`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "X-Signature": sig,
              "X-Timestamp": ts,
            },
            body,
          });
          if (!res.ok) {
            const text = await res.text().catch(() => "");
            return Response.json(
              { ok: false, error: `Lambda tick failed: ${res.status} ${text}` },
              { status: 502 },
            );
          }
          return Response.json({ ok: true, result: await res.json().catch(() => null) });
        }
        // Dev fallback while the Lambda is not yet live.
        const { data, error } = await supabaseAdmin.rpc("run_notification_reminders");
        if (error) {
          return new Response(JSON.stringify({ ok: false, error: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
        return Response.json({ ok: true, result: data });
      },
    },
  },
});
