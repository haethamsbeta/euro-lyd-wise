// Server-only WebAuthn helpers. Never import from the browser.
import { getRequestHost, getRequestHeader } from "@tanstack/react-start/server";

export function getRpInfo() {
  const host = getRequestHost(); // e.g. "app.example.com" or "localhost:3000"
  const proto =
    getRequestHeader("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  // rpID must be a registrable domain (no port, no scheme).
  // Strip a leading "www." so credentials registered on either
  // apex (example.com) or www subdomain are usable on both.
  const bareHost = host.split(":")[0];
  const rpID = bareHost.replace(/^www\./i, "");
  const rpName = "Dahab";
  const origin = `${proto}://${host}`;
  return { rpID, rpName, origin };
}