import {createHash} from 'node:crypto';
import type {NextRequest} from 'next/server';
import {customerSession} from './customer-session';
import {ChatError} from './chat-security';
export const guestCookie='ames_jeweller_device';
export function guestUser(token:string){
  return {$id:'guest-'+createHash('sha256').update(token).digest('hex'),name:'Guest jeweller',email:'',emailVerification:false};
}
export async function jewellerSession(req:NextRequest,verified=true){
  if(req.cookies.has('ames_customer_session'))return customerSession(req,verified);
  const token=req.cookies.get(guestCookie)?.value;
  if(!token||!/^[a-f0-9]{64}$/.test(token))throw new ChatError(401,'Open jeweller onboarding to start your application.');
  return {user:guestUser(token)};
}
