/**
 * Phase 3a feature flags. Server-only env vars; both fail CLOSED on any
 * value other than the explicit opt-in.
 */

/**
 * Public bidding gate. Default OFF: only staff sessions can bid (Phase 2b
 * behaviour). When '1', verified bidders who accepted the current terms may
 * bid. Registration and login stay open either way.
 */
export function publicBiddingEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.AUCTION_PUBLIC_BIDDING === '1';
}

/** Terms version bidders must have accepted before bidding. */
export function currentTermsVersion(env: NodeJS.ProcessEnv = process.env): string {
  const v = env.AUCTION_TERMS_VERSION?.trim();
  return v && v.length > 0 ? v : 'v0-placeholder';
}
