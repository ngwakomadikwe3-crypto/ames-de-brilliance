import { timingSafeEqual } from 'node:crypto';
import { ChatError } from './chat-security';
import type { JewellerListing } from './jeweller-listing';
export function workerAuthorization(req: Request) {
  const secret = process.env.AMES_LISTING_WORKER_TOKEN;
  if (!secret || secret.length < 48) throw new ChatError(503, 'The CAD worker connection is not configured.');
  const token = req.headers.get('authorization')?.replace(/^Bearer /, '') || '';
  const a = Buffer.from(token), b = Buffer.from(secret);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new ChatError(401, 'Unauthorized worker.');
}
export function workerLease(listing: JewellerListing, lease: unknown) {
  if (listing.conversion?.status !== 'processing' || typeof lease !== 'string' || listing.conversion.lease !== lease || Date.parse(listing.conversion.leaseUntil || '') <= Date.now()) throw new ChatError(409, 'This conversion lease is no longer active.');
  return listing.conversion;
}
