import {z} from 'zod';
export const settingSchema=z.enum(['loose','ring','bracelet','necklace','watch','earrings','pendant']);
export const supplierQuote=z.object({
  currency:z.enum(['BWP','USD','ZAR','EUR','GBP']),
  dealerRef:z.string().trim().min(1).max(120), dealerCost:z.number().positive().max(1e9),
  makerRef:z.string().trim().max(120), makerCost:z.number().nonnegative().max(1e9),
  markup:z.number().nonnegative().max(1000)
}).strict();
export function retailQuote(input:unknown,setting:string){
  const quote=supplierQuote.parse(input);
  if(setting!=='loose' && (!quote.makerRef || !quote.makerCost))throw Error('Record the confirmed manufacturer quote before releasing a jewelry price.');
  if(setting==='loose' && quote.makerCost!==0)throw Error('A loose stone has no manufacturing charge.');
  const cents=Math.round(quote.dealerCost*100)+Math.round(quote.makerCost*100);
  return {currency:quote.currency,amount:Math.round(cents*(1+quote.markup/100))/100};
}
