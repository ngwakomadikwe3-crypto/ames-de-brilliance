import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { activityId, readActivity, writeActivity, listActivity, type Activity } from './account-activity-store';
import { withListingLock, mutateListing } from './jeweller-listing-store';
import { shopProduct, moneyMinor, type ShopProduct } from './shop-products';
export type CartData={version:number;items:string[]};
export type PurchaseData={version:number;buyerName:string;buyerEmail:string;instructions:string;lines:ShopProduct[];currency:string;subtotalMinor:number;invoice:null|{number:string;paymentInstructions:string;shippingMinor:number;taxMinor:number;totalMinor:number;issuedAt:string};receiptReference:string;fulfilmentReference:string;reason:string;history:{action:string;at:string;by:'customer'|'staff'}[]};
export const cartAction=z.object({action:z.enum(['add','remove']),assetId:z.string().regex(/^listing-[a-f0-9-]{36}$/)}).strict();
export const checkoutInput=z.object({version:z.number().int().positive(),quote:z.string().regex(/^[a-f0-9]{64}$/),idempotencyKey:z.uuid(),contactConsent:z.literal(true),invoiceTerms:z.literal(true),instructions:z.string().trim().max(500).default('')}).strict();
export function quoteHash(version:number,lines:ShopProduct[]){return createHash('sha256').update(JSON.stringify({version,lines})).digest('hex');}
export async function readCart(userId:string){return await readActivity<CartData>(activityId('cart',userId))||{id:activityId('cart',userId),kind:'cart',owner:userId,subject:'cart',status:'active',createdAt:new Date().toISOString(),data:{version:1,items:[]}} satisfies Activity<CartData>;}
export async function cartView(userId:string){const cart=await readCart(userId);const items=await Promise.all(cart.data.items.map(async assetId=>{try{return{assetId,product:await shopProduct(assetId),error:''};}catch{return{assetId,product:null,error:'This piece is no longer available at a reviewed fixed price.'};}}));const lines=items.flatMap(i=>i.product?[i.product]:[]),currencies=[...new Set(lines.map(l=>l.currency))];return{version:cart.data.version,items,quote:quoteHash(cart.data.version,lines),currency:currencies.length===1?currencies[0]:null,subtotalMinor:currencies.length===1?lines.reduce((n,l)=>n+l.amountMinor,0):null,canCheckout:!!items.length&&items.every(i=>!!i.product)&&currencies.length===1};}
export async function changeCart(userId:string,input:unknown){const v=cartAction.parse(input),id=activityId('cart',userId);return withListingLock(id,async()=>{const cart=await readCart(userId);if(v.action==='add')await shopProduct(v.assetId);const items=v.action==='add'?[...new Set([...cart.data.items,v.assetId])]:cart.data.items.filter(i=>i!==v.assetId);if(items.length>20)throw Error('Your cart can hold up to 20 pieces.');await writeActivity({...cart,data:{version:cart.data.version+1,items}});});}
export async function checkout(user:{$id:string;name:string;email:string},input:unknown){const v=checkoutInput.parse(input),orderId=activityId('purchase',user.$id+':'+v.idempotencyKey);return withListingLock(activityId('cart',user.$id),async()=>{
 const previous=await readActivity<PurchaseData>(orderId);if(previous){if(previous.kind!=='purchase'||previous.owner!==user.$id)throw Error('Order conflict');return previous;}
 const cart=await readCart(user.$id),view=await cartView(user.$id);if(v.version!==cart.data.version||v.quote!==view.quote)throw Error('Your cart or its prices changed. Review the latest cart before requesting an invoice.');if(!view.canCheckout||!view.currency)throw Error('Choose available pieces in one currency before requesting an invoice.');
 const lines=view.items.map(i=>i.product!),at=new Date().toISOString(),record:Activity<PurchaseData>={id:orderId,kind:'purchase',owner:user.$id,subject:'purchase',status:'requested',createdAt:at,data:{version:1,buyerName:user.name,buyerEmail:user.email,instructions:v.instructions,lines,currency:view.currency,subtotalMinor:lines.reduce((n,l)=>n+l.amountMinor,0),invoice:null,receiptReference:'',fulfilmentReference:'',reason:'',history:[{action:'requested',at,by:'customer'}]}};
 await writeActivity(record,true);await writeActivity({...cart,data:{version:cart.data.version+1,items:[]}});return record;
 });}
export async function purchaseList(userId:string|undefined,cursor?:string){return listActivity<PurchaseData>('purchase',userId?{owner:userId}:{},50,cursor);}
export function purchaseView(record:Activity<PurchaseData>){return{id:record.id,status:record.status,createdAt:record.createdAt,...record.data};}
const invoiceInput=z.object({number:z.string().trim().min(3).max(80),paymentInstructions:z.string().trim().min(30).max(2000),shipping:z.string().default('0'),tax:z.string().default('0'),availabilityChecked:z.literal(true),sellerAuthorityChecked:z.literal(true),termsChecked:z.literal(true)}).strict();
async function productLocks<T>(ids:string[],operation:()=>Promise<T>):Promise<T>{if(!ids.length)return operation();return withListingLock(ids[0],()=>productLocks(ids.slice(1),operation));}
export async function changePurchase(record:Activity<PurchaseData>,body:Record<string,unknown>,staff:boolean){if(body.version!==record.data.version)throw Error('This purchase changed. Reload before continuing.');const at=new Date().toISOString();let next={...record,data:{...record.data}};const action=String(body.action);
 if(action==='invoice'){
  if(!staff||record.status!=='requested')throw Error('Only staff can invoice an open purchase request.');const v=invoiceInput.parse(body.invoice);
  return productLocks(record.data.lines.map(l=>l.listingId).sort(),async()=>{for(const line of record.data.lines){const p=await shopProduct(line.assetId,record.id);if(p.amountMinor!==line.amountMinor||p.currency!==line.currency||p.revision!==line.revision)throw Error('A piece or price changed. Cancel this request and ask the customer to review a new cart.');}
   const shippingMinor=moneyMinor(v.shipping,record.data.currency),taxMinor=moneyMinor(v.tax,record.data.currency);next={...record,status:'invoiced',data:{...record.data,invoice:{number:v.number,paymentInstructions:v.paymentInstructions,shippingMinor,taxMinor,totalMinor:record.data.subtotalMinor+shippingMinor+taxMinor,issuedAt:at}}};
   // The order is durable before reservations. Failed attempts never report success;
   // reservations created here identify the same order and can be released by staff.
   for(const line of record.data.lines)await writeActivity({id:activityId('reservation',line.assetId),kind:'reservation',owner:line.sellerId,subject:line.assetId,status:'active',createdAt:at,data:{orderId:record.id}});
   next.data.version++;next.data.history=[...next.data.history,{action,at,by:'staff'}];return writeActivity(next);
  });
 }
 if(action==='cancel'){
  if(!['requested','invoiced',...(staff?['cancelled']:[])].includes(record.status)||!staff&&record.status!=='requested')throw Error('Contact AMES to cancel an invoiced or paid purchase.');const reason=z.string().trim().min(10).max(500).parse(body.reason);next.status='cancelled';next.data.reason=reason;
  return productLocks(record.data.lines.map(l=>l.listingId).sort(),async()=>{next.data.version++;next.data.history=[...next.data.history,{action,at,by:staff?'staff':'customer'}];await writeActivity(next);for(const l of record.data.lines){const id=activityId('reservation',l.assetId),r=await readActivity<{orderId:string}>(id);if(r?.data.orderId===record.id)await writeActivity({...r,status:'released'});}return next;});
 }
 if(action==='paid'){
  if(!staff||record.status!=='invoiced'||!record.data.invoice||body.receiptConfirmed!==true)throw Error('Staff must confirm a received bank payment against an issued invoice.');next.data.receiptReference=z.string().trim().min(6).max(160).parse(body.reference);next.status='paid';
  next.data.version++;next.data.history=[...next.data.history,{action,at,by:'staff'}];const paid=await writeActivity(next);
  // A paid piece leaves the stock count. The version stays, so other open invoices for the same piece still match.
  for(const l of record.data.lines)await mutateListing(l.listingId,x=>x.details.stock==null?x:{...x,details:{...x.details,stock:Math.max(0,x.details.stock-1)},updatedAt:at,audit:[...x.audit,{action:'stock_sold',at,actor:'staff',reason:record.id}].slice(-80)}).then(async x=>{if(x.details.stock){const id=activityId('reservation',l.assetId),r=await readActivity<{orderId:string}>(id);if(r?.data.orderId===record.id)await writeActivity({...r,status:'released'});}}).catch(()=>{});
  return paid;
 }else if(action==='fulfilled'){if(!staff||record.status!=='paid')throw Error('Only a paid purchase can be marked fulfilled.');next.data.fulfilmentReference=z.string().trim().min(5).max(160).parse(body.reference);next.status='fulfilled';}
 else throw Error('Unknown purchase action');
 next.data.version++;next.data.history=[...next.data.history,{action,at,by:'staff'}];return writeActivity(next);
}
