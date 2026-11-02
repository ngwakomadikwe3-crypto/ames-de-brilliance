import { createHmac } from "node:crypto";
import { SIGNING_LABELS, selectSigningSecret } from "./signing-labels.ts";
import type { SigningPurpose } from "./signing-labels.ts";

/**
 * Node-runtime HMAC helpers over the domain-separated labels
 * (owner instruction 2026-11-01).
 *
 * Key bytes = HMAC-SHA256(baseSecret, label); signatures are computed with
 * that derived key. The derivation matches session-keys.ts (Web Crypto)
 * byte-for-byte, so edge middleware and node routes verify the same tokens.
 *
 * Every helper returns null when the purpose has no usable secret — callers
 * must treat null as "refuse" (no token minted, verification fails).
 */

export function hmacKeyBytesFor(
  purpose: SigningPurpose,
  env: NodeJS.ProcessEnv = process.env,
): Buffer | null {
  const secret = selectSigningSecret(purpose, env);
  if (!secret) return null;
  return createHmac("sha256", secret).update(SIGNING_LABELS[purpose]).digest();
}

/** HMAC-SHA256 signature (base64url) under the purpose's derived key. */
export function hmacSignFor(
  purpose: SigningPurpose,
  value: string,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const key = hmacKeyBytesFor(purpose, env);
  if (!key) return null;
  return createHmac("sha256", key).update(value).digest("base64url");
}

/** Same as hmacSignFor but hex-encoded (OTP code hashes). */
export function hmacSignHexFor(
  purpose: SigningPurpose,
  value: string,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  const key = hmacKeyBytesFor(purpose, env);
  if (!key) return null;
  return createHmac("sha256", key).update(value).digest("hex");
}
