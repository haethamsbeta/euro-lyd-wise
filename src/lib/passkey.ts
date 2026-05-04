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
  let response;
  try {
    response = await startAuthentication({ optionsJSON: options as any });
  } catch (err: any) {
    const name = err?.name ?? "";
    if (name === "NotAllowedError") {
      throw new Error(
        "No Face ID passkey is available for this site on this device. " +
          "Sign in with your password, then enable Face ID in Settings → Security.",
      );
    }
    if (name === "SecurityError") {
      throw new Error(
        "Face ID is unavailable on this domain. Make sure you're on the same site where you registered the passkey.",
      );
    }
    if (name === "InvalidStateError") {
      throw new Error("This device's passkey is not recognized. Re-enable Face ID in Settings → Security.");
    }
    throw new Error(err?.message ?? "Face ID sign-in failed");
  }
  const { token_hash } = await finishPasskeyAuthentication({
    data: { response },
  });
  const { error } = await supabase.auth.verifyOtp({
    type: "magiclink",
    token_hash,
  });
  if (error) throw error;
}