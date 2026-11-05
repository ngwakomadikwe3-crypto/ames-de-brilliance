import { z } from 'zod';
export const enquiryInput = z.object({ listingId: z.uuid(), message: z.string().trim().min(10).max(1500), contactConsent: z.literal(true) }).strict();
export const quoteInput = z.object({ amount: z.string().regex(/^\d{1,9}(?:\.\d{1,2})?$/).refine(v => Number(v) > 0), currency: z.string().regex(/^[A-Z]{3}$/).refine(v => Intl.supportedValuesOf('currency').includes(v)), message: z.string().trim().min(5).max(1500) }).strict().superRefine((v, ctx) => {
  if (v.amount.includes('.') && v.amount.split('.')[1].length > new Intl.NumberFormat('en', { style: 'currency', currency: v.currency }).resolvedOptions().maximumFractionDigits!) ctx.addIssue({ code: 'custom', message: 'Check currency decimal places' });
});
export type CustomerEnquiry = {
  id: string; buyerId: string; sellerId: string; listingId: string; version: number; status: 'open' | 'quoted' | 'accepted' | 'closed';
  buyerName: string; buyerEmail: string; businessName: string; pieceName: string;
  quote: { amount: string; currency: string } | null;
  messages: { by: 'customer' | 'jeweller' | 'staff'; text: string; at: string }[];
  createdAt: string; updatedAt: string;
};
export function changeEnquiry(record: CustomerEnquiry, action: string, role: 'customer' | 'jeweller' | 'staff', input: unknown): CustomerEnquiry {
  if (record.status === 'closed') throw new Error('This enquiry is closed');
  const at = new Date().toISOString(); let changes: Partial<CustomerEnquiry> = {}, message = '';
  if (action === 'quote') {
    if (role !== 'jeweller' || record.status === 'accepted') throw new Error('Only the jeweller can quote before a purchase request is accepted');
    const body = input as Record<string, unknown>;
    const quote = quoteInput.parse({ amount: body.amount, currency: body.currency, message: body.message }); changes = { status: 'quoted', quote: { amount: quote.amount, currency: quote.currency } }; message = quote.message;
  } else if (action === 'accept') {
    if (role !== 'customer' || record.status !== 'quoted' || !record.quote) throw new Error('Only the customer can accept the current quote');
    changes = { status: 'accepted' }; message = 'Customer requested purchase at the quoted price. Payment and fulfilment are not recorded by this action.';
  } else if (action === 'close') { changes = { status: 'closed' }; message = 'Enquiry closed.'; }
  else if (action === 'reply') { message = z.string().trim().min(1).max(1500).parse((input as { message?: unknown })?.message); }
  else throw new Error('Unknown enquiry action');
  if (record.messages.length >= 30) throw new Error('This thread has reached its message limit. Contact AMES staff.');
  return { ...record, ...changes, version: record.version + 1, updatedAt: at, messages: [...record.messages, { by: role, text: message, at }] };
}
export function enquiryView(record: CustomerEnquiry, role: 'customer' | 'jeweller' | 'staff') {
  return { id: record.id, listingId: record.listingId, version: record.version, status: record.status, buyerName: record.buyerName, businessName: record.businessName,
    ...(role !== 'customer' ? { buyerEmail: record.buyerEmail } : {}), pieceName: record.pieceName, quote: record.quote, messages: record.messages, updatedAt: record.updatedAt };
}
