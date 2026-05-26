import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} from "@simplewebauthn/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getRpInfo } from "./webauthn.server";

function b64uToBuffer(b64u: string) {
  return Buffer.from(b64u.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}
function bufferToB64u(buf: Uint8Array | Buffer) {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

/* ---------- Registration ---------- */

export const beginPasskeyRegistration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { rpID, rpName } = getRpInfo();
    const userId = context.userId;
    const email = (context.claims.email as string | undefined) ?? userId;

    const { data: existing } = await supabaseAdmin
      .from("webauthn_credentials")
      .select("credential_id, transports")
      .eq("user_id", userId);

    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      userID: new TextEncoder().encode(userId),
      userName: email,
      userDisplayName: email,
      attestationType: "none",
      authenticatorSelection: {
        userVerification: "preferred",
        residentKey: "required",
        requireResidentKey: true,
      },
      excludeCredentials: (existing ?? []).map((c) => ({
        id: c.credential_id,
        transports: (c.transports ?? []) as any,
      })),
    });

    await supabaseAdmin.from("webauthn_challenges").insert({
      challenge: options.challenge,
      purpose: "register",
      user_id: userId,
    });

    return options;
  });

const registrationResponseSchema = z.object({
  response: z.any(),
  device_label: z.string().trim().min(1).max(80).optional(),
});

export const finishPasskeyRegistration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => registrationResponseSchema.parse(d))
  .handler(async ({ context, data }) => {
    const { rpID, origin } = getRpInfo();
    const userId = context.userId;
    const expectedChallenge = (data.response?.response?.clientDataJSON
      ? JSON.parse(Buffer.from(b64uToBuffer(data.response.response.clientDataJSON)).toString("utf8"))
          .challenge
      : null) as string | null;
    if (!expectedChallenge) throw new Error("Malformed registration response");

    const { data: chal } = await supabaseAdmin
      .from("webauthn_challenges")
      .select("*")
      .eq("challenge", expectedChallenge)
      .eq("purpose", "register")
      .eq("user_id", userId)
      .gte("expires_at", new Date().toISOString())
      .maybeSingle();
    if (!chal) throw new Error("Challenge expired or not found");

    const verification = await verifyRegistrationResponse({
      response: data.response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
    });
    if (!verification.verified || !verification.registrationInfo) {
      throw new Error("Could not verify passkey");
    }
    const { credential } = verification.registrationInfo;

    await supabaseAdmin.from("webauthn_credentials").insert({
      user_id: userId,
      credential_id: credential.id,
      public_key: bufferToB64u(credential.publicKey),
      counter: credential.counter,
      transports: credential.transports ?? [],
      device_label:
        data.device_label ??
        (typeof navigator !== "undefined" ? "This device" : "This device"),
    });
    await supabaseAdmin.from("webauthn_challenges").delete().eq("id", chal.id);

    return { ok: true };
  });

/* ---------- Authentication ---------- */

const beginAuthSchema = z.object({
  email: z.string().trim().email().max(255).optional(),
});

export const beginPasskeyAuthentication = createServerFn({ method: "POST" })
  .inputValidator((d) => beginAuthSchema.parse(d))
  .handler(async ({ data }) => {
    const { rpID } = getRpInfo();
    console.log("[passkey] beginAuth", { rpID, email: data.email ?? null });

    let allowCredentials: { id: string; transports?: AuthenticatorTransport[] }[] | undefined;
    let userId: string | null = null;

    if (data.email) {
      // Look up the user by email then list their credentials.
      const { data: list } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 200 });
      const u = list?.users?.find(
        (x) => (x.email ?? "").toLowerCase() === data.email!.toLowerCase(),
      );
      if (u) {
        userId = u.id;
        const { data: creds } = await supabaseAdmin
          .from("webauthn_credentials")
          .select("credential_id, transports")
          .eq("user_id", u.id);
        allowCredentials = (creds ?? []).map((c) => ({
          id: c.credential_id,
          transports: (c.transports ?? []) as AuthenticatorTransport[],
        }));
      }
    }

    const options = await generateAuthenticationOptions({
      rpID,
      userVerification: "preferred",
      allowCredentials,
    });

    await supabaseAdmin.from("webauthn_challenges").insert({
      challenge: options.challenge,
      purpose: "authenticate",
      user_id: userId,
      email: data.email ?? null,
    });

    return options;
  });

const finishAuthSchema = z.object({
  response: z.any(),
});

export const finishPasskeyAuthentication = createServerFn({ method: "POST" })
  .inputValidator((d) => finishAuthSchema.parse(d))
  .handler(async ({ data }) => {
    const { rpID, origin } = getRpInfo();
    console.log("[passkey] finishAuth", { rpID, origin });

    const expectedChallenge = (() => {
      try {
        const cdj = JSON.parse(
          Buffer.from(b64uToBuffer(data.response.response.clientDataJSON)).toString("utf8"),
        );
        return cdj.challenge as string;
      } catch {
        return null;
      }
    })();
    if (!expectedChallenge) throw new Error("Malformed authentication response");

    const { data: chal } = await supabaseAdmin
      .from("webauthn_challenges")
      .select("*")
      .eq("challenge", expectedChallenge)
      .eq("purpose", "authenticate")
      .gte("expires_at", new Date().toISOString())
      .maybeSingle();
    if (!chal) throw new Error("Challenge expired or not found");

    const credentialId: string = data.response.id;

    const { data: cred } = await supabaseAdmin
      .from("webauthn_credentials")
      .select("*")
      .eq("credential_id", credentialId)
      .maybeSingle();
    if (!cred) throw new Error("Unknown passkey");

    const { data: userInfo } = await supabaseAdmin.rpc(
      "lookup_user_email_for_credential",
      { p_credential_id: credentialId },
    );
    const row = Array.isArray(userInfo) ? userInfo[0] : userInfo;
    if (!row?.email) throw new Error("User not found for passkey");

    const verification = await verifyAuthenticationResponse({
      response: data.response,
      expectedChallenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      credential: {
        id: cred.credential_id,
        publicKey: b64uToBuffer(cred.public_key),
        counter: Number(cred.counter ?? 0),
        transports: (cred.transports ?? []) as AuthenticatorTransport[],
      },
    });
    if (!verification.verified) throw new Error("Passkey verification failed");

    await supabaseAdmin
      .from("webauthn_credentials")
      .update({
        counter: verification.authenticationInfo.newCounter,
        last_used_at: new Date().toISOString(),
      })
      .eq("id", cred.id);
    await supabaseAdmin.from("webauthn_challenges").delete().eq("id", chal.id);

    // Mint a one-time magic link the client exchanges for a real session.
    const { data: link, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
      type: "magiclink",
      email: row.email,
    });
    if (linkErr || !link?.properties?.hashed_token) {
      throw new Error(linkErr?.message ?? "Could not start session");
    }

    return {
      email: row.email as string,
      token_hash: link.properties.hashed_token,
    };
  });

/* ---------- Listing & deletion (settings UI) ---------- */

export const listMyPasskeys = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data } = await supabaseAdmin
      .from("webauthn_credentials")
      .select("id, device_label, created_at, last_used_at")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false });
    return data ?? [];
  });

export const deleteMyPasskey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ context, data }) => {
    await supabaseAdmin
      .from("webauthn_credentials")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);
    return { ok: true };
  });