import {withListingLock} from './jeweller-listing-store';
import {getProfile} from './jeweller-store';
import {effectiveProfileStatus} from './jeweller-profile';
// Catalogue Room buy requests: a signed-in buyer asks to buy a published stone; the house confirms
// price, KYC and payment offline and records the outcome on the Purchase desk.
import {retailQuote,settingSchema,supplierQuote} from './supplier-pricing';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { activityId, readActivity, writeActivity, listActivity, type Activity } from './account-activity-store';
export type StoneRequestData = { configuration?:string; makerId?:string; makerName?:string; makerCost?:{amount:number;currency:string;reference:string}; version: number; stoneId: string; ref: string; title: string; carats: number; buyerName: string; buyerEmail: string; phone: string; message: string; note: string; setting?:string; metal?:string; supplierQuote?:z.infer<typeof supplierQuote>; customerPrice?:ReturnType<typeof retailQuote>;
  history: { action: string; at: string; by: 'buyer' | 'staff' }[] };
export type StoneRequestStatus = 'requested' | 'contacted' | 'closed';
export const requestInput = z.object({ stoneId: z.string().trim().min(1).max(64), configuration:z.string().trim().max(500).optional(), setting:settingSchema.default('loose'), metal:z.string().trim().max(40).default(''), phone: z.string().trim().max(40).default(''), message: z.string().trim().max(1000).default('') }).strict();
export async function createStoneRequest(user: { $id: string; name: string; email: string }, stone: { configuration?:string; stoneId: string; ref: string; title: string; carats: number }, input: z.infer<typeof requestInput>) {
  // One open request per buyer and stone: asking again updates it rather than adding another.
  const subject=input.configuration?activityId('stone-selection',JSON.stringify([stone.stoneId,input.setting,input.metal,input.configuration])):input.setting==='loose'?stone.stoneId:JSON.stringify([stone.stoneId,input.setting,input.metal]);
  const open = (await listActivity<StoneRequestData>('stone-request', { owner: user.$id, subject, status: ['requested', 'contacted'] }, 5)).records[0];
  const at = new Date().toISOString();
  if (open) return writeActivity({ ...open, data: { ...open.data, phone: input.phone || open.data.phone, message: input.message || open.data.message, version: open.data.version + 1, history: [...open.data.history, { action: 'asked_again', at, by: 'buyer' as const }].slice(-30) } });
  const record: Activity<StoneRequestData> = { id: activityId('stone-request', randomUUID()), kind: 'stone-request', owner: user.$id, subject, status: 'requested', createdAt: at,
    data: { version: 1, setting:input.setting,metal:input.metal,configuration:input.configuration,...stone, buyerName: user.name, buyerEmail: user.email, phone: input.phone, message: input.message, note: '', history: [{ action: 'requested', at, by: 'buyer' }] } };
  return writeActivity(record, true);
}
export const listStoneRequests = (owner?: string, cursor?: string) => listActivity<StoneRequestData>('stone-request', owner ? { owner } : {}, 50, cursor);
const changeInput = z.object({ version: z.number().int(), status: z.enum(['contacted', 'closed', 'requested']), makerId:z.uuid().optional(), pricing:supplierQuote.optional(), note: z.string().trim().max(600).default('') }).strict();
export async function changeStoneRequest(id: string, input: unknown) {
  return withListingLock(id,async()=>{
  const v = changeInput.parse(input), record = await readActivity<StoneRequestData>(id);
  if (!record || record.kind !== 'stone-request') throw new Error('Request not found');
  if (record.data.version !== v.version) throw new Error('This request changed. Reload before continuing.');
  const at = new Date().toISOString();
  let assignment={};
  if(v.makerId){
    if(record.data.customerPrice || record.data.makerCost || record.status==='closed' || record.data.setting==='loose')throw Error('Assignment is unavailable for this request.');
    const profile=await getProfile(v.makerId);
    if(effectiveProfileStatus(profile)!=='verified' || !profile.portalUserId)throw Error('Select a verified manufacturer with studio access.');
    assignment={makerId:profile.id,makerName:profile.businessName};
  }
  if(v.pricing && record.data.makerId){
    const confirmed=record.data.makerCost;
    if(!confirmed || confirmed.amount!==v.pricing.makerCost || confirmed.currency!==v.pricing.currency || confirmed.reference!==v.pricing.makerRef)throw Error('Use the assigned manufacturer’s confirmed quote.');
  }
  const price=v.pricing?retailQuote(v.pricing,record.data.setting??'loose'):undefined;
  return writeActivity({ ...record, status: v.status, data: { ...record.data, ...assignment, ...(price?{supplierQuote:v.pricing,customerPrice:price}:{}), note: v.note || record.data.note, version: record.data.version + 1, history: [...record.data.history, { action: v.status, at, by: 'staff' as const }].slice(-30) } });
  });
}
export function stoneRequestView(r:Activity<StoneRequestData>, staff=false){
  const {supplierQuote,note,makerId,makerName,makerCost,...customer}=r.data;
  return {id:r.id,status:r.status as StoneRequestStatus,createdAt:r.createdAt,...customer,...(staff?{supplierQuote,note,makerId,makerName,makerCost}:{})};
}

export async function recordMakerCost(makerId:string,input:unknown){
  const q=z.object({id:z.uuid(),amount:z.number().positive().max(1e9),currency:supplierQuote.shape.currency,reference:z.string().trim().min(1).max(120)}).parse(input);
  return withListingLock(q.id,async()=>{
  const record=await readActivity<StoneRequestData>(q.id);
  if(!record || record.kind!=='stone-request' || record.data.makerId!==makerId || record.status==='closed' || record.data.customerPrice || record.data.makerCost)throw Error('Request unavailable');
  return writeActivity({...record,data:{...record.data,makerCost:{amount:q.amount,currency:q.currency,reference:q.reference},version:record.data.version+1}});
  });
}
