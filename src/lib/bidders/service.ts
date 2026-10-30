import { z } from 'zod';
import { generateOtpCode, hashOtpCode, otpCodeMatches, OTP_REQUEST_LIMIT_PER_HOUR, OTP_TTL_MS, OTP_VERIFY_LIMIT_PER_WINDOW, OTP_VERIFY_WINDOW_SECONDS } from './passwordless.ts';
import { normalizeEmail } from './directory.ts';
import type { BidderDirectory, NewBidderInput } from './directory.ts';
import type { RateLimiter } from './rate-limit.ts';
import type { BidderRecord } from './types.ts';
import { currentTermsVersion } from '../auction/flags.ts';
import type { AuditAction } from '../auction/types.ts';

/**
 * Bidder account flows (Phase 3a): registration, passwordless login, terms,
 * staff decisions, export and anonymise. Everything here is framework-free and
 * runs against the BidderDirectory + RateLimiter interfaces, so the unit
 * suite exercises exactly what the routes call.
 */

export type AuditFn = (entry: {
  entity: 'bidder';
  entityId: string;
  action: AuditAction;
  actor: string;
  detail: unknown;
  now: Date;
}) => Promise<void>;

const noAudit: AuditFn = async () => {};

/* ── Registration ── */

export const RegistrationSchema = z.object({
  name: z.string().trim().min(2).max(255),
  email: z.string().trim().max(255).pipe(z.email()),
  phone: z.string().trim().min(5).max(100),
  country: z.string().trim().min(2).max(100),
  entityType: z.enum(['individual', 'company']),
  licenceNumber: z.string().trim().max(255).optional().default(''),
});
export type RegistrationInput = z.infer<typeof RegistrationSchema>;

export const REGISTER_LIMIT_PER_HOUR = 10;

export type RegisterResult =
  | { ok: true }
  | { ok: false; reason: 'invalid_body' | 'rate_limited' };

export async function registerBidder(
  directory: BidderDirectory,
  limiter: RateLimiter,
  rawInput: unknown,
  now: Date,
  audit: AuditFn = noAudit,
): Promise<RegisterResult> {
  const parsed = RegistrationSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: 'invalid_body' };
  const input: NewBidderInput = {
    ...parsed.data,
    email: normalizeEmail(parsed.data.email),
  };

  const allowed = await limiter.hit(`bidder:register:${input.email}`, 3600, REGISTER_LIMIT_PER_HOUR, now);
  if (!allowed) return { ok: false, reason: 'rate_limited' };

  const { created, bidder } = await directory.createBidder(input, now);
  if (created) {
    await audit({
      entity: 'bidder',
      entityId: bidder.id,
      action: 'bidder.registered',
      actor: bidder.id,
      detail: { entityType: bidder.entityType, country: bidder.country },
      now,
    });
  }
  // Identical response whether the email was new or already registered:
  // registration must not become an account-enumeration oracle.
  return { ok: true };
}

/* ── Passwordless login ── */

export interface Mailer {
  sendMail(msg: { to: string; subject: string; text: string }): Promise<boolean>;
}

export type OtpRequestResult = { ok: true } | { ok: false; reason: 'rate_limited' | 'email_unavailable' };

export async function requestLoginCode(
  directory: BidderDirectory,
  limiter: RateLimiter,
  mailer: Mailer,
  rawEmail: unknown,
  now: Date,
): Promise<OtpRequestResult> {
  const parsed = z.email().max(255).safeParse(rawEmail);
  if (!parsed.success) return { ok: true }; // invalid input gets the same generic ok
  const email = normalizeEmail(parsed.data);

  const allowed = await limiter.hit(`bidder:otp:req:${email}`, 3600, OTP_REQUEST_LIMIT_PER_HOUR, now);
  if (!allowed) return { ok: false, reason: 'rate_limited' };

  const bidder = await directory.getBidderByEmail(email);
  // No enumeration: unknown or erased accounts get the same ok, no email.
  if (!bidder || bidder.anonymisedAt) return { ok: true };

  const code = generateOtpCode();
  await directory.putOtp(email, {
    codeHash: hashOtpCode(email, code),
    expiresAt: new Date(now.getTime() + OTP_TTL_MS).toISOString(),
  }, now);

  const sent = await mailer.sendMail({
    to: email,
    subject: '[AMES] Your auction room sign-in code',
    text: [
      `Your AMES DE BRILLIANTE auction sign-in code is:`,
      ``,
      `  ${code}`,
      ``,
      `It expires in 10 minutes and can be used once. If you did not request`,
      `this code, ignore this email.`,
    ].join('\n'),
  });
  if (!sent) return { ok: false, reason: 'email_unavailable' };
  return { ok: true };
}

export type OtpVerifyResult =
  | { ok: true; bidder: BidderRecord }
  | { ok: false; reason: 'invalid_code' | 'rate_limited' };

export async function verifyLoginCode(
  directory: BidderDirectory,
  limiter: RateLimiter,
  rawEmail: unknown,
  rawCode: unknown,
  now: Date,
): Promise<OtpVerifyResult> {
  const emailParsed = z.email().max(255).safeParse(rawEmail);
  const codeParsed = z.string().regex(/^\d{6}$/).safeParse(rawCode);
  if (!emailParsed.success || !codeParsed.success) return { ok: false, reason: 'invalid_code' };
  const email = normalizeEmail(emailParsed.data);

  // Every attempt counts against the shared brute-force budget, even
  // malformed ones with a valid email shape.
  const allowed = await limiter.hit(`bidder:otp:verify:${email}`, OTP_VERIFY_WINDOW_SECONDS, OTP_VERIFY_LIMIT_PER_WINDOW, now);
  if (!allowed) return { ok: false, reason: 'rate_limited' };

  const otp = await directory.getOtp(email);
  if (!otp) return { ok: false, reason: 'invalid_code' };
  if (otp.usedAt) return { ok: false, reason: 'invalid_code' }; // single-use
  if (Date.parse(otp.expiresAt) <= now.getTime()) return { ok: false, reason: 'invalid_code' };
  if (!otpCodeMatches(email, codeParsed.data, otp.codeHash)) return { ok: false, reason: 'invalid_code' };

  await directory.markOtpUsed(email, now.toISOString());
  const bidder = await directory.getBidderByEmail(email);
  if (!bidder || bidder.anonymisedAt) return { ok: false, reason: 'invalid_code' };
  return { ok: true, bidder };
}

/* ── Terms ── */

export type TermsResult = { ok: true } | { ok: false; reason: 'not_found' };

export async function acceptCurrentTerms(
  directory: BidderDirectory,
  bidderId: string,
  now: Date,
  audit: AuditFn = noAudit,
): Promise<TermsResult> {
  const bidder = await directory.getBidder(bidderId);
  if (!bidder || bidder.anonymisedAt) return { ok: false, reason: 'not_found' };
  const version = currentTermsVersion();
  if (bidder.termsVersion !== version) {
    await directory.setBidderTerms(bidderId, { version, at: now.toISOString() });
    await audit({
      entity: 'bidder',
      entityId: bidderId,
      action: 'bidder.terms_accepted',
      actor: bidderId,
      detail: { version },
      now,
    });
  }
  return { ok: true };
}

/** True when this bidder may bid, given the flag and terms state. */
export function bidderMayBid(bidder: BidderRecord, publicBidding: boolean, termsVersion: string): boolean {
  return publicBidding && bidder.status === 'verified' && !bidder.anonymisedAt && bidder.termsVersion === termsVersion;
}

/* ── Staff decisions ── */

export const DECISION_ACTIONS = ['approve', 'reject', 'suspend', 'reinstate'] as const;
export type DecisionAction = (typeof DECISION_ACTIONS)[number];

const DECISION_TO_STATUS: Record<DecisionAction, BidderRecord['status']> = {
  approve: 'verified',
  reject: 'rejected',
  suspend: 'suspended',
  reinstate: 'verified',
};

export const DecideSchema = z.object({
  action: z.enum(DECISION_ACTIONS),
  reason: z.string().trim().min(3).max(500),
});

export type DecideResult = { ok: true; bidder: BidderRecord } | { ok: false; reason: 'not_found' | 'invalid_body' };

export async function decideBidder(
  directory: BidderDirectory,
  bidderId: string,
  rawInput: unknown,
  actorLabel: string,
  now: Date,
  audit: AuditFn = noAudit,
): Promise<DecideResult> {
  const parsed = DecideSchema.safeParse(rawInput);
  if (!parsed.success) return { ok: false, reason: 'invalid_body' };
  const bidder = await directory.getBidder(bidderId);
  if (!bidder) return { ok: false, reason: 'not_found' };

  const status = DECISION_TO_STATUS[parsed.data.action];
  await directory.setBidderStatus(bidderId, { status, reason: parsed.data.reason, at: now.toISOString() });
  const auditAction: Record<DecisionAction, AuditAction> = {
    approve: 'bidder.approved',
    reject: 'bidder.rejected',
    suspend: 'bidder.suspended',
    reinstate: 'bidder.reinstated',
  };
  await audit({
    entity: 'bidder',
    entityId: bidderId,
    action: auditAction[parsed.data.action],
    actor: actorLabel,
    detail: { action: parsed.data.action, reason: parsed.data.reason, from: bidder.status, to: status },
    now,
  });
  return { ok: true, bidder: { ...bidder, status, statusReason: parsed.data.reason } };
}
