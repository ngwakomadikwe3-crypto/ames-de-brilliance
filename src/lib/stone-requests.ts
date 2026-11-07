// Catalogue Room buy requests: a signed-in buyer asks to buy a published stone; the house confirms
// price, KYC and payment offline and records the outcome on the Purchase desk.
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { activityId, readActivity, writeActivity, listActivity, type Activity } from './account-activity-store';
export type StoneRequestData = { version: number; stoneId: string; ref: string; title: string; carats: number; buyerName: string; buyerEmail: string; phone: string; message: string; note: string;
  history: { action: string; at: string; by: 'buyer' | 'staff' }[] };
export type StoneRequestStatus = 'requested' | 'contacted' | 'closed';
export const requestInput = z.object({ stoneId: z.string().trim().min(1).max(64), phone: z.string().trim().max(40).default(''), message: z.string().trim().max(1000).default('') }).strict();
export async function createStoneRequest(user: { $id: string; name: string; email: string }, stone: { stoneId: string; ref: string; title: string; carats: number }, input: z.infer<typeof requestInput>) {
  // One open request per buyer and stone: asking again updates it rather than adding another.
  const open = (await listActivity<StoneRequestData>('stone-request', { owner: user.$id, subject: stone.stoneId, status: ['requested', 'contacted'] }, 5)).records[0];
  const at = new Date().toISOString();
  if (open) return writeActivity({ ...open, data: { ...open.data, phone: input.phone || open.data.phone, message: input.message || open.data.message, version: open.data.version + 1, history: [...open.data.history, { action: 'asked_again', at, by: 'buyer' as const }].slice(-30) } });
  const record: Activity<StoneRequestData> = { id: activityId('stone-request', randomUUID()), kind: 'stone-request', owner: user.$id, subject: stone.stoneId, status: 'requested', createdAt: at,
    data: { version: 1, ...stone, buyerName: user.name, buyerEmail: user.email, phone: input.phone, message: input.message, note: '', history: [{ action: 'requested', at, by: 'buyer' }] } };
  return writeActivity(record, true);
}
export const listStoneRequests = (owner?: string, cursor?: string) => listActivity<StoneRequestData>('stone-request', owner ? { owner } : {}, 50, cursor);
const changeInput = z.object({ version: z.number().int(), status: z.enum(['contacted', 'closed', 'requested']), note: z.string().trim().max(600).default('') }).strict();
export async function changeStoneRequest(id: string, input: unknown) {
  const v = changeInput.parse(input), record = await readActivity<StoneRequestData>(id);
  if (!record || record.kind !== 'stone-request') throw new Error('Request not found');
  if (record.data.version !== v.version) throw new Error('This request changed. Reload before continuing.');
  const at = new Date().toISOString();
  return writeActivity({ ...record, status: v.status, data: { ...record.data, note: v.note || record.data.note, version: record.data.version + 1, history: [...record.data.history, { action: v.status, at, by: 'staff' as const }].slice(-30) } });
}
export const stoneRequestView = (r: Activity<StoneRequestData>) => ({ id: r.id, status: r.status as StoneRequestStatus, createdAt: r.createdAt, ...r.data });
