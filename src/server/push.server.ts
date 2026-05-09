import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

function vapidEnv() {
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const sub = process.env.VAPID_SUBJECT || "mailto:admin@dahablibya.com";
  if (!pub || !priv) throw new Error("VAPID keys not configured");
  return { pub, priv, sub };
}

function b64urlToBytes(s: string): Uint8Array {
  const pad = "=".repeat((4 - (s.length % 4)) % 4);
  const b = (s + pad).replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function bytesToB64Url(b: Uint8Array): string {
  let s = "";
  for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function concat(...arrs: Uint8Array[]): Uint8Array {
  const total = arrs.reduce((n, a) => n + a.length, 0);
  const out = new Uint8Array(total);
  let off = 0;
  for (const a of arrs) { out.set(a, off); off += a.length; }
  return out;
}

async function hmacSha256(key: Uint8Array, data: Uint8Array): Promise<Uint8Array> {
  const k = await crypto.subtle.importKey(
    "raw",
    key as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", k, data as BufferSource));
}
const hkdfExtract = (salt: Uint8Array, ikm: Uint8Array) => hmacSha256(salt, ikm);
async function hkdfExpand(prk: Uint8Array, info: Uint8Array, length: number): Promise<Uint8Array> {
  // length <= 32 => single round T(1)
  const t = await hmacSha256(prk, concat(info, new Uint8Array([1])));
  return t.slice(0, length);
}

function p256RawToJwk(raw: Uint8Array, d?: Uint8Array): JsonWebKey {
  if (raw.length !== 65 || raw[0] !== 0x04) throw new Error("invalid uncompressed P-256 key");
  const x = raw.slice(1, 33);
  const y = raw.slice(33, 65);
  const jwk: JsonWebKey = { kty: "EC", crv: "P-256", x: bytesToB64Url(x), y: bytesToB64Url(y), ext: true };
  if (d) (jwk as JsonWebKey & { d: string }).d = bytesToB64Url(d);
  return jwk;
}

async function vapidJwt(audience: string): Promise<{ jwt: string; pubB64: string }> {
  const { pub, priv, sub } = vapidEnv();
  const header = { typ: "JWT", alg: "ES256" };
  const claims = {
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 12 * 3600,
    sub,
  };
  const enc = new TextEncoder();
  const h = bytesToB64Url(enc.encode(JSON.stringify(header)));
  const c = bytesToB64Url(enc.encode(JSON.stringify(claims)));
  const signingInput = `${h}.${c}`;
  const jwk = p256RawToJwk(b64urlToBytes(pub), b64urlToBytes(priv));
  const key = await crypto.subtle.importKey(
    "jwk",
    jwk,
    { name: "ECDSA", namedCurve: "P-256" },
    false,
    ["sign"],
  );
  const sig = new Uint8Array(
    await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, enc.encode(signingInput)),
  );
  return { jwt: `${signingInput}.${bytesToB64Url(sig)}`, pubB64: pub };
}

async function encryptPayload(payload: Uint8Array, uaPublic: Uint8Array, authSecret: Uint8Array) {
  const ephKp = await crypto.subtle.generateKey(
    { name: "ECDH", namedCurve: "P-256" },
    true,
    ["deriveBits"],
  );
  const ephPubJwk = await crypto.subtle.exportKey("jwk", ephKp.publicKey);
  const asPublic = concat(
    new Uint8Array([0x04]),
    b64urlToBytes(ephPubJwk.x as string),
    b64urlToBytes(ephPubJwk.y as string),
  );
  const uaKey = await crypto.subtle.importKey(
    "jwk",
    p256RawToJwk(uaPublic),
    { name: "ECDH", namedCurve: "P-256" },
    false,
    [],
  );
  const ecdh = new Uint8Array(
    await crypto.subtle.deriveBits({ name: "ECDH", public: uaKey }, ephKp.privateKey, 256),
  );

  const prkKey = await hkdfExtract(authSecret, ecdh);
  const keyInfo = concat(new TextEncoder().encode("WebPush: info\0"), uaPublic, asPublic);
  const ikm2 = await hkdfExpand(prkKey, keyInfo, 32);

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const prk = await hkdfExtract(salt, ikm2);
  const cek = await hkdfExpand(prk, new TextEncoder().encode("Content-Encoding: aes128gcm\0"), 16);
  const nonce = await hkdfExpand(prk, new TextEncoder().encode("Content-Encoding: nonce\0"), 12);

  const padded = concat(payload, new Uint8Array([0x02]));
  const aesKey = await crypto.subtle.importKey(
    "raw",
    cek as BufferSource,
    { name: "AES-GCM" },
    false,
    ["encrypt"],
  );
  const ct = new Uint8Array(
    await crypto.subtle.encrypt({ name: "AES-GCM", iv: nonce as BufferSource }, aesKey, padded as BufferSource),
  );

  const rs = new Uint8Array(4);
  new DataView(rs.buffer).setUint32(0, 4096, false);
  const header = concat(salt, rs, new Uint8Array([asPublic.length]), asPublic);
  return concat(header, ct);
}

type Sub = { id: string; endpoint: string; p256dh: string; auth: string };

async function deliverOne(sub: Sub, payload: PushPayload) {
  try {
    const url = new URL(sub.endpoint);
    const audience = `${url.protocol}//${url.host}`;
    const { jwt, pubB64 } = await vapidJwt(audience);
    const body = await encryptPayload(
      new TextEncoder().encode(JSON.stringify(payload)),
      b64urlToBytes(sub.p256dh),
      b64urlToBytes(sub.auth),
    );
    const res = await fetch(sub.endpoint, {
      method: "POST",
      headers: {
        Authorization: `vapid t=${jwt}, k=${pubB64}`,
        "Content-Encoding": "aes128gcm",
        "Content-Type": "application/octet-stream",
        TTL: "60",
      },
      body: body as BodyInit,
    });
    return {
      ok: res.ok,
      status: res.status,
      gone: res.status === 404 || res.status === 410,
      error: res.ok ? null : `HTTP ${res.status}`,
    };
  } catch (e) {
    return { ok: false, status: 0, gone: false, error: (e as Error).message };
  }
}

export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
): Promise<{ sent: number; failed: number; total: number }> {
  const { data: subs } = await supabaseAdmin
    .from("push_subscriptions")
    .select("id, endpoint, p256dh, auth")
    .eq("user_id", userId)
    .eq("granted", true)
    .not("endpoint", "is", null);
  const list = (subs ?? []).filter(
    (s): s is Sub => !!s.endpoint && !!s.p256dh && !!s.auth,
  );
  let sent = 0;
  let failed = 0;
  await Promise.all(
    list.map(async (s) => {
      const r = await deliverOne(s, payload);
      if (r.ok) {
        sent++;
        await supabaseAdmin
          .from("push_subscriptions")
          .update({ last_success_at: new Date().toISOString(), last_error: null })
          .eq("id", s.id);
      } else {
        failed++;
        if (r.gone) {
          await supabaseAdmin.from("push_subscriptions").delete().eq("id", s.id);
        } else {
          await supabaseAdmin
            .from("push_subscriptions")
            .update({ last_error: r.error ?? "unknown" })
            .eq("id", s.id);
        }
      }
    }),
  );
  return { sent, failed, total: list.length };
}