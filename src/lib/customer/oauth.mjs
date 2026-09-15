import {randomBytes,createHmac,timingSafeEqual} from 'node:crypto';
import {documentId} from './appwrite.mjs';

// Browser-bound, short-lived OAuth attempts. Appwrite owns provider identity linking.
export function createOAuthFlow(config,gateway,{identity,session,finishSession,rate,json},clock=Date.now){
  const secure=new URL(config.origin).protocol==='https:';
  const cookieName=secure?'__Host-ames_oauth':'ames_oauth';
  const cookie=(value,age)=>`${cookieName}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${secure?'; Secure':''}`;
  const mac=value=>createHmac('sha256',config.deliverySecret).update('oauth:'+value).digest('base64url');
  const redirect=path=>new Response(null,{status:303,headers:{Location:config.origin+path,'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Content-Type-Options':'nosniff','Set-Cookie':cookie('',0)}});
  function attempt(req,state){
    const values=(req.headers.get('cookie')||'').split(';').map(v=>v.trim()).filter(v=>v.startsWith(cookieName+'='));
    if(values.length!==1||values[0].length>1024)return null;
    try{
      const [payload,sig,extra]=values[0].slice(cookieName.length+1).split('.');
      if(extra||!sig)return null;
      const expected=Buffer.from(mac(payload)),actual=Buffer.from(sig);
      if(actual.length!==expected.length||!timingSafeEqual(actual,expected))return null;
      const data=JSON.parse(Buffer.from(payload,'base64url').toString());
      return data.nonce===state&&data.expires>clock()&&data.expires<=clock()+600000?data:null;
    }catch{return null;}
  }
  return async function handle(req,action){
    if(action==='google'||action==='microsoft'){
      if(req.method!=='POST')return json({error:'Use the sign-in buttons to continue.'},405);
      await rate(req);
      let user=null;
      try{user=await identity(req);}catch(e){if(e.status!==401)throw e;}
      const linked=user&&!user.guest?user:null;
      const nonce=randomBytes(32).toString('base64url');
      const payload=Buffer.from(JSON.stringify({nonce,expires:clock()+600000,userId:linked?.id||null})).toString('base64url');
      const success=`${config.origin}/api/customer/oauth/callback?state=${nonce}`;
      const failure=`${config.origin}/api/customer/oauth/failure?state=${nonce}`;
      try{
        const url=await gateway.oauthURL(action,success,failure,linked?session(req):undefined);
        const target=new URL(url);
        const providerHost=action==='google'?'accounts.google.com':'login.microsoftonline.com';
        if(target.protocol!=='https:'||target.hostname!==providerHost||target.username||target.password||target.port)throw new Error('Invalid provider destination');
        return json({url},200,{'Set-Cookie':cookie(payload+'.'+mac(payload),600),'Referrer-Policy':'no-referrer'});
      }catch{return json({error:'Social sign-in is unavailable. Try email sign-in or contact AMES.'},503);}
    }
    if(!['callback','failure'].includes(action)||req.method!=='GET')return json({error:'Not found'},404);
    const url=new URL(req.url),states=url.searchParams.getAll('state');
    const data=states.length===1?attempt(req,states[0]):null;
    if(!data)return redirect('/login?oauth=expired');
    try{
      // Atomic consumption prevents replay across server instances, including parallel callbacks.
      await gateway.put('limits',documentId('oauth-attempt',data.nonce),{kind:'oauth',expiresAt:new Date(data.expires).toISOString()},true);
      if(action==='failure')return redirect('/login?oauth=failed');
      const ids=url.searchParams.getAll('userId'),secrets=url.searchParams.getAll('secret');
      if(ids.length!==1||secrets.length!==1||!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,35}$/.test(ids[0])||!secrets[0]||secrets[0].length>2048)throw new Error('Invalid callback');
      if(data.userId&&data.userId!==ids[0])throw new Error('Linked identity changed');
      const result=await gateway.oauthSession(ids[0],secrets[0]);
      const response=await finishSession(req,result,ids[0]);
      const target=redirect('/app');
      for(const value of response.headers.getSetCookie())target.headers.append('Set-Cookie',value);
      return target;
    }catch{return redirect('/login?oauth=failed');}
  };
}
