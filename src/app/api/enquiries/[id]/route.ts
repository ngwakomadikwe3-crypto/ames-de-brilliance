import { NextRequest, NextResponse } from 'next/server';
import { customerSession } from '@/lib/customer-session';
import { signedInJeweller, isStaffOwner, listingFailure } from '@/lib/jeweller-access';
import { withListingLock, readEnquiryRecord, writeEnquiryRecord } from '@/lib/jeweller-listing-store';
import { changeEnquiry, enquiryView, type CustomerEnquiry } from '@/lib/customer-enquiry';
import { checkChatOrigin, privateHeaders, readChatJson, ChatError } from '@/lib/chat-security';
export const runtime = 'nodejs';
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    checkChatOrigin(req); const { id } = await params, body = await readChatJson(req);
    const updated = await withListingLock(id, async () => {
      const record = await readEnquiryRecord<CustomerEnquiry>(id);
      let role: 'customer' | 'jeweller' | 'staff';
      if (isStaffOwner(req)) role = 'staff';
      else {
        const { user } = await customerSession(req, true);
        if (record.buyerId === user.$id) role = 'customer';
        else { const seller = await signedInJeweller(req); if (seller.id !== record.sellerId) throw new ChatError(404, 'Enquiry not found.'); role = 'jeweller'; }
      }
      if (body.version !== record.version) throw new ChatError(409, 'This enquiry changed. Reload before replying or accepting a quote.');
      const changed = changeEnquiry(record, String(body.action), role, body);
      await writeEnquiryRecord(changed); return enquiryView(changed, role);
    });
    return NextResponse.json(updated, { headers: privateHeaders });
  } catch (e) { return listingFailure(e); }
}
