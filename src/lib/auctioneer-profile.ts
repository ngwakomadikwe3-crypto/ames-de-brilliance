import { z } from 'zod';

export const specialties = ['Jewellery', 'Gemstones', 'Watches', 'Accessories', 'Fine art', 'Collectibles'] as const;
export const checkLabels = {
  identity: 'Identity evidence checked', business: 'Business registration checked', contact: 'Contact details confirmed',
  experience: 'Auction experience and references reviewed', consignment: 'Seller authority, consignment policy and buyer terms reviewed', eligibility: 'Trading eligibility reviewed for the declared activities',
  qualifications: 'Qualifications and issuing bodies checked, or none claimed',
  consent: 'Authority to retain documents and evidence retention authority confirmed',
};
export type ReviewChecks = Record<keyof typeof checkLabels, boolean>;
export const blankChecks = (): ReviewChecks => ({ identity: false, business: false, contact: false, experience: false, consignment: false, eligibility: false, qualifications: false, consent: false });
const text = (max: number) => z.string().trim().max(max).default('');
export const profileInput = z.object({
  legalName: text(120), businessName: z.string().trim().min(2).max(120), registrationNumber: text(100),
  email: z.union([z.literal(''), z.email()]).default(''), phone: text(30), country: text(80), city: text(100), address: text(350),
  website: z.union([z.literal(''), z.url().refine(value => new URL(value).protocol === 'https:', 'Use an HTTPS website')]).default(''),
  biography: text(2000), specialties: z.array(z.enum(specialties)).max(9).default([]),
  auctionHistory: text(2000), consignmentPolicy: text(2000), buyerTerms: text(2000),
  experienceYears: z.number().int().min(0).max(80).default(0),
  licenceRequired: z.boolean().default(false), licenceNumber: text(120), licenceIssuer: text(160), licenceExpires: text(10), eligibilityReason: text(1000),
  qualifications: text(1500), consentConfirmed: z.boolean().default(false),
}).strict();
export type ProfileInput = z.infer<typeof profileInput>;
export const fileKinds = ['portrait', 'reference', 'identity', 'business', 'licence', 'qualification'] as const;
export type ProfileFile = { id: string; kind: typeof fileKinds[number]; filename: string; mime: string; bytes: number; sha256: string; uploadedAt: string; expiresOn: string };
export type AuctioneerProfile = ProfileInput & {
  portalUserId?: string;
  id: string; version: number; status: 'draft' | 'submitted' | 'verified' | 'needs_revision' | 'suspended';
  files: ProfileFile[]; checks: ReviewChecks; verifiedUntil: string; createdAt: string; updatedAt: string;
  audit: { action: string; at: string; actor: string; reason: string }[];
};
export function newProfile(id: string, input: unknown, now = new Date().toISOString()): AuctioneerProfile {
  return { ...profileInput.parse(input), id, version: 1, status: 'draft', files: [], checks: blankChecks(), verifiedUntil: '', createdAt: now, updatedAt: now,
    audit: [{ action: 'created', at: now, actor: 'owner', reason: '' }] };
}
export function recordChange(profile: AuctioneerProfile, changes: Partial<AuctioneerProfile>, action: string, reason = '', now = new Date().toISOString(), actor = 'owner'): AuctioneerProfile {
  return { ...profile, ...changes, version: profile.version + 1, updatedAt: now,
    audit: [...profile.audit, { action, reason: reason.slice(0, 500), at: now, actor }].slice(-50) };
}
export function editProfile(profile: AuctioneerProfile, input: unknown, actor = 'owner'): AuctioneerProfile {
  return recordChange(profile, { ...profileInput.parse(input), status: 'draft', checks: blankChecks(), verifiedUntil: '' }, 'details_changed', 'Previous verification cleared; review required', new Date().toISOString(), actor);
}
function dateValid(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;
}
export function profileGaps(profile: AuctioneerProfile, now = new Date().toISOString()): string[] {
  const gaps: string[] = [];
  for (const [key, label] of [['legalName', 'Legal name'], ['registrationNumber', 'Business registration number'], ['country', 'Country'], ['city', 'City'], ['address', 'Business address']] as const) {
    if (!profile[key]) gaps.push(label);
  }
  if (!profile.email || !z.email().safeParse(profile.email).success) gaps.push('Valid email');
  if (!/^\+[1-9]\d{6,14}$/.test(profile.phone.replace(/[\s()-]/g, ''))) gaps.push('Phone with international country code');
  if (profile.biography.length < 50) gaps.push('Professional biography (at least 50 characters)');
  if (!profile.specialties.length) gaps.push('At least one specialty');
  if (!profile.consentConfirmed) gaps.push('Authority to store personal documents and professional evidence');
  const today = now.slice(0, 10);
  for (const kind of ['identity', 'business'] as const) {
    const latest = profile.files.filter(file => file.kind === kind).sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))[0];
    if (!latest) gaps.push(`${kind === 'identity' ? 'Identity' : 'Business registration'} evidence`);
    else if (latest.expiresOn && (!dateValid(latest.expiresOn) || latest.expiresOn < today)) gaps.push(`Current ${kind} evidence`);
  }
  for (const [key, label] of [['auctionHistory', 'Auction experience'], ['consignmentPolicy', 'Seller authority and consignment policy'], ['buyerTerms', 'Buyer fees, payment and delivery terms']] as const) if (profile[key].length < 50) gaps.push(`${label} (at least 50 characters)`);
  const references = profile.files.filter(file => file.kind === 'reference');
  if (!references.some(file => (!file.expiresOn || dateValid(file.expiresOn) && file.expiresOn >= today) && !profile.files.some(other => ['identity', 'business'].includes(other.kind) && other.sha256 === file.sha256))) gaps.push('Current auction experience / professional reference evidence distinct from identity and registration documents');
  if (profile.qualifications) {
    const qualification = profile.files.filter(file => file.kind === 'qualification').sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))[0];
    if (!qualification || (qualification.expiresOn && (!dateValid(qualification.expiresOn) || qualification.expiresOn < today))) gaps.push('Current evidence for stated qualifications');
  }
  if (profile.licenceRequired) {
    if (!profile.licenceNumber || !profile.licenceIssuer) gaps.push('Licence number and issuer');
    if (!dateValid(profile.licenceExpires) || profile.licenceExpires < today) gaps.push('Current licence expiry date');
    const licence = profile.files.filter(file => file.kind === 'licence').sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))[0];
    if (!licence || (licence.expiresOn && (!dateValid(licence.expiresOn) || licence.expiresOn < today))) gaps.push('Current licence evidence');
  } else if (profile.eligibilityReason.length < 20) gaps.push('Recorded basis for trading eligibility / licence not applicable');
  return gaps;
}
export const reviewInput = z.object({ action: z.enum(['submit', 'verify', 'request_revision', 'suspend']), reason: text(500),
  validUntil: text(10), checks: z.object({ identity: z.boolean(), business: z.boolean(), contact: z.boolean(), experience: z.boolean(), consignment: z.boolean(), eligibility: z.boolean(), qualifications: z.boolean(), consent: z.boolean() }).optional() }).strict();
export function reviewProfile(profile: AuctioneerProfile, input: unknown, now = new Date().toISOString(), actor = 'owner'): AuctioneerProfile {
  const review = reviewInput.parse(input);
  if (review.action === 'request_revision' || review.action === 'suspend') {
    if (review.reason.length < 10) throw new Error('Record a reason of at least 10 characters');
    if (review.action === 'suspend' && profile.status !== 'verified') throw new Error('Only a verified profile can be suspended');
    return recordChange(profile, { status: review.action === 'suspend' ? 'suspended' : 'needs_revision', checks: blankChecks(), verifiedUntil: '' }, review.action, review.reason, now, actor);
  }
  const gaps = profileGaps(profile, now);
  if (gaps.length) throw new Error(`Complete before review: ${gaps.join('; ')}`);
  if (review.action === 'submit') {
    if (!['draft', 'needs_revision', 'suspended'].includes(profile.status) && effectiveProfileStatus(profile, now) !== 'review_expired') throw new Error('This profile is already under review or verified');
    return recordChange(profile, { status: 'submitted', checks: blankChecks(), verifiedUntil: '' }, 'submitted', '', now, actor);
  }
  if (profile.status !== 'submitted') throw new Error('Submit the completed profile for review first');
  if (!review.checks || Object.values(review.checks).some(value => !value)) throw new Error('Every verification check must be completed');
  if (review.reason.length < 20) throw new Error('Record the verification findings (at least 20 characters)');
  const until = Date.parse(`${review.validUntil}T23:59:59Z`), current = Date.parse(now);
  if (!dateValid(review.validUntil) || until <= current || until - current > 366 * 86400000) throw new Error('Set a future review expiry within 12 months');
  if (profile.licenceRequired && review.validUntil > profile.licenceExpires) throw new Error('Review expiry cannot exceed the licence expiry');
  return recordChange(profile, { status: 'verified', checks: review.checks, verifiedUntil: review.validUntil }, 'verified', review.reason, now, actor);
}
export function effectiveProfileStatus(profile: AuctioneerProfile, now = new Date().toISOString()): string {
  return profile.status === 'verified' && (profile.verifiedUntil < now.slice(0, 10) || profileGaps(profile, now).length > 0) ? 'review_expired' : profile.status;
}
export function detectProfileFile(bytes: Uint8Array): string | null {
  const b = Buffer.from(bytes);
  if (b.length >= 8 && b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) return 'image/png';
  if (b.length >= 3 && b[0] === 255 && b[1] === 216 && b[2] === 255) return 'image/jpeg';
  if (b.length >= 12 && b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  if (b.toString('ascii', 0, 5) === '%PDF-') return 'application/pdf';
  return null;
}
