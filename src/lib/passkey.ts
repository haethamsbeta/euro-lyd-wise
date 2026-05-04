import {
  startAuthentication,
  startRegistration,
  browserSupportsWebAuthn,
  platformAuthenticatorIsAvailable,
} from "@simplewebauthn/browser";
import { supabase } from "@/integrations/supabase/client";
import {
  beginPasskeyRegistration,
  finishPasskeyRegistration,
  beginPasskeyAuthentication,
  finishPasskeyAuthentication,
} from "@/server/webauthn.functions";

export async function passkeysSupported() {
  if (!browserSupportsWebAuthn()) return false;
  try {
    return await platformAuthenticatorIsAvailable();
  } catch {
    return false;
  }
}

export async function registerPasskey(deviceLabel?: string) {
  const options = await beginPasskeyRegistration();
  const response = await startRegistration({ optionsJSON: options as any });
  await finishPasskeyRegistration({
    data: { response, device_label: deviceLabel },
  });
}

/** Sign in with Face ID / Touch ID / platform biometrics. */
export async function signInWithPasskey(email?: string) {
  const options = await beginPasskeyAuthentication({
    data: { email: email?.trim() || undefined },
  });
  const response = await startAuthentication({ optionsJSON: options as any });
  const { token_hash } = await finishPasskeyAuthentication({
    data: { response },
  });
  const { error } = await supabase.auth.verifyOtp({
    type: "magiclink",
    token_hash,
  });
  if (error) throw error;
}