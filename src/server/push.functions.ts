import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendPushToUser, type PushPayload } from "./push.server";

export const getVapidPublicKey = createServerFn({ method: "GET" }).handler(async () => {
  return process.env.VAPID_PUBLIC_KEY ?? null;
});

export const subscribeThisDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        endpoint: z.string().url(),
        p256dh: z.string().min(1),
        auth: z.string().min(1),
        label: z.string().nullable().optional(),
        user_agent: z.string().nullable().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { data: existing } = await supabaseAdmin
      .from("push_subscriptions")
      .select("id")
      .eq("endpoint", data.endpoint)
      .maybeSingle();
    const now = new Date().toISOString();
    if (existing) {
      await supabaseAdmin
        .from("push_subscriptions")
        .update({
          user_id: userId,
          p256dh: data.p256dh,
          auth: data.auth,
          label: data.label ?? null,
          user_agent: data.user_agent ?? null,
          granted: true,
          last_seen_at: now,
          last_error: null,
        })
        .eq("id", existing.id);
    } else {
      await supabaseAdmin.from("push_subscriptions").insert({
        user_id: userId,
        endpoint: data.endpoint,
        p256dh: data.p256dh,
        auth: data.auth,
        label: data.label ?? null,
        user_agent: data.user_agent ?? null,
        granted: true,
        last_seen_at: now,
      });
    }
    return { ok: true };
  });

export const unsubscribeThisDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ endpoint: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    await supabaseAdmin
      .from("push_subscriptions")
      .update({ granted: false })
      .eq("endpoint", data.endpoint)
      .eq("user_id", context.userId);
    return { ok: true };
  });

export const revokeDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await supabaseAdmin
      .from("push_subscriptions")
      .update({ granted: false })
      .eq("id", data.id)
      .eq("user_id", context.userId);
    return { ok: true };
  });

export const removeDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await supabaseAdmin
      .from("push_subscriptions")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    return { ok: true };
  });

export const pingThisDevice = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ endpoint: z.string().min(1) }).parse(d))
  .handler(async ({ data, context }) => {
    await supabaseAdmin
      .from("push_subscriptions")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("endpoint", data.endpoint)
      .eq("user_id", context.userId);
    return { ok: true };
  });

const TEST_PAYLOAD: PushPayload = {
  title: "🔔 Dahab test notification",
  body: "Push delivery is working end-to-end.",
  url: "/app/settings/notifications",
  tag: "dahab-test",
};

export const sendTestPushToSelf = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Best-effort in-app notification via existing RPC (uses caller's auth).
    await context.supabase.rpc("notif_self_test").then(() => null).catch(() => null);
    const result = await sendPushToUser(context.userId, TEST_PAYLOAD);
    return result;
  });

export const sendTestPushToUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ user_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: isAdmin, error } = await supabaseAdmin.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (error || !isAdmin) throw new Response("Forbidden", { status: 403 });
    // Write the in-app notification row through admin RPC (bypasses enabled gate for tests).
    await context.supabase
      .rpc("admin_send_test_notification", { p_user_id: data.user_id })
      .then(() => null)
      .catch(() => null);
    const result = await sendPushToUser(data.user_id, TEST_PAYLOAD);
    return result;
  });