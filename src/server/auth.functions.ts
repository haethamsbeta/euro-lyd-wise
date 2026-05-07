import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getRequestHost } from "@tanstack/react-start/server";

export const adminResetPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ userId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    // 1. Mark must_change_password (RPC enforces admin + audit log).
    const { data: rpc, error } = await supabase.rpc("admin_reset_password", {
      p_target_user: data.userId,
    });
    if (error) throw new Error(error.message);
    const email = (rpc as any)?.email as string | undefined;
    if (!email) throw new Error("Could not resolve user email");

    // 2. Revoke all active sessions for the target user.
    await supabaseAdmin.auth.admin.signOut(data.userId, "global");

    // 3. Generate + send recovery email via built-in template.
    const host = getRequestHost();
    const redirectTo = `https://${host}/reset-password`;
    const { error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: { redirectTo },
    });
    if (linkErr) throw new Error(linkErr.message);

    return { ok: true, email };
  });