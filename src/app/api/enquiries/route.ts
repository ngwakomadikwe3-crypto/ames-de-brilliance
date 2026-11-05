import { randomUUID, createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { customerSession } from '@/lib/customer-session';
import { signedInJeweller, isStaffOwner, verifiedListingProfile, listingFailure } from '@/lib/jeweller-access';
import { listEnquiryRecords, writeEnquiryRecord, getListing, withListingLock } from '@/lib/jeweller-listing-store';
import { enquiryInput, enquiryView, type CustomerEnquiry } from '@/lib/customer-enquiry';
import { publicListing } from '@/lib/jeweller-listing';
import { checkChatOrigin, privateHeaders, readChatJson, ChatError } from '@/lib/chat-security';
export const runtime = 'nodejs';
function requestLock(customerId: string, listingId: string) { const b = createHash('sha256').update('ames-enquiry:' + customerId + ':' + listingId).digest().subarray(0,16); b[6] = (b[6] & 15) | 80; b[8] = (b[8] & 63) | 128; const h = b.toString('hex'); return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`; }
export async function GET(req: NextRequest) {
  try {
    const role = req.nextUrl.searchParams.get('role') || 'customer';
    if (!['customer','jeweller','staff'].includes(role)) throw new ChatError(400, 'Unknown enquiry view.');
    let records: CustomerEnquiry[];
    if (role === 'staff') { if (!isStaffOwner(req)) throw new ChatError(403, 'Staff access required.'); records = await listEnquiryRecords<CustomerEnquiry>(); }
    else if (role === 'jeweller') { const profile = await signedInJeweller(req); records = (await listEnquiryRecords<CustomerEnquiry>()).filter(r => r.sellerId === profile.id); }
    else { const { user } = await customerSession(req); records = (await listEnquiryRecords<CustomerEnquiry>()).filter(r => r.buyerId === user.$id); }
    return NextResponse.json({ role, enquiries: records.sort((a,b) => b.updatedAt.localeCompare(a.updatedAt)).map(r => enquiryView(r, role === 'staff' ? 'staff' : role === 'jeweller' ? 'jeweller' : 'customer')) }, { headers: privateHeaders });
  } catch (e) { return listingFailure(e); }
}
export async function POST(req: NextRequest) {
  try {
    checkChatOrigin(req); const { user } = await customerSession(req, true), input = enquiryInput.parse(await readChatJson(req));
    const listing = await getListing(input.listingId), seller = await verifiedListingProfile(listing), published = publicListing(listing, seller.businessName);
    if (seller.portalUserId === user.$id) throw new Error('Use your jeweller studio to manage your own listing');
    const record = await withListingLock(requestLock(user.$id, listing.id), async () => {
      const existing = (await listEnquiryRecords<CustomerEnquiry>()).filter(r => r.buyerId === user.$id && r.status !== 'closed');
      if (existing.some(r => r.listingId === listing.id)) throw new ChatError(409, 'An enquiry for this piece is already open in your workspace.');
      if (existing.length >= 20) throw new Error('You have 20 open enquiries. Close an old enquiry before starting another.');
      const at = new Date().toISOString();
      return writeEnquiryRecord<CustomerEnquiry>({ id: randomUUID(), buyerId: user.$id, sellerId: seller.id, listingId: listing.id, version: 1, status: 'open', buyerName: user.name,
        buyerEmail: user.email, businessName: seller.businessName, pieceName: published.name, quote: null,
        messages: [{ by: 'customer', text: input.message, at }], createdAt: at, updatedAt: at }, true);
    });
    return NextResponse.json(enquiryView(record, 'customer'), { status: 201, headers: privateHeaders });
  } catch (e) { return listingFailure(e); }
}
