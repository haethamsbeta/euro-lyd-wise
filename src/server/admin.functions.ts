import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function assertAdmin(supabase: any, userId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .eq("role", "admin")
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Admin only");
}

export const adminCreateConsumer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z
      .object({
        full_name: z.string().min(2).max(120),
        email: z.string().email(),
        password: z.string().min(8).max(120),
        holder_ids: z.array(z.number().int().positive()).default([]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { full_name: data.full_name },
    });
    if (error) throw new Error(error.message);
    const newId = created.user!.id;

    await supabaseAdmin
      .from("profiles")
      .upsert({ id: newId, full_name: data.full_name, must_change_password: true });
    await supabaseAdmin.from("user_roles").insert({ user_id: newId, role: "consumer" });

    if (data.holder_ids.length > 0) {
      const { error: linkErr } = await supabaseAdmin
        .from("account_holders")
        .update({ owner_user_id: newId })
        .in("id", data.holder_ids);
      if (linkErr) throw new Error(linkErr.message);
    }

    await supabaseAdmin.from("audit_log").insert({
      actor_user_id: userId,
      action: "consumer.create",
      target: newId,
      details: { email: data.email, holder_ids: data.holder_ids },
    });

    return { ok: true, user_id: newId };
  });

export const adminChangeUserEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) =>
    z.object({ user_id: z.string().uuid(), new_email: z.string().email() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);

    // Use admin API to update email + auto-confirm
    const { error } = await supabaseAdmin.auth.admin.updateUserById(data.user_id, {
      email: data.new_email,
      email_confirm: true,
    });
    if (error) throw new Error(error.message);

    await supabaseAdmin.from("audit_log").insert({
      actor_user_id: userId,
      action: "user.email_change",
      target: data.user_id,
      details: { new_email: data.new_email },
    });
    return { ok: true };
  });

export const adminListUserEmails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({
      page: 1,
      perPage: 1000,
    });
    if (error) throw new Error(error.message);
    return data.users.map((u) => ({ id: u.id, email: u.email ?? null }));
  });

export const adminListHolders = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await assertAdmin(supabase, userId);
    const { data, error } = await supabase
      .from("account_holders")
      .select("id, dahab_account_number, canonical_name, owner_user_id")
      .order("canonical_name");
    if (error) throw new Error(error.message);
    return data ?? [];
  });