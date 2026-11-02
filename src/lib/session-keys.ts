import { SIGNING_LABELS, selectSigningSecret } from "./signing-labels.ts";
import type { SigningPurpose } from "./signing-labels.ts";

/**
 * Edge-safe (Web Crypto only) HMAC key derivation over the domain-separated
 * labels (owner instruction 2026-11-01). Used by middleware and any other
 * edge-runtime code; node-runtime code uses hmac-domain.ts instead.
 *
 * Key bytes = HMAC-SHA256(baseSecret, label) — identical to hmac-domain.ts,
 * so a token minted in a node route verifies in edge middleware.
 *
 * Returns null when the purpose has no usable secret (fail closed).
 */
export async function hmacKeyFor(
  purpose: SigningPurpose,
  env: NodeJS.ProcessEnv = process.env,
): Promise<CryptoKey | null> {
  const secret = selectSigningSecret(purpose, env);
  if (!secret) return null;
  const encoder = new TextEncoder();
  const master = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const derived = await crypto.subtle.sign("HMAC", master, encoder.encode(SIGNING_LABELS[purpose]));
  return crypto.subtle.importKey(
    "raw",
    derived,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}
