// Shared deny-by-default route policy. Public access is to server projections, never tables.
export function legacyPolicy(url,method){
 const {pathname:p,searchParams:q}=new URL(url);if(!p.startsWith('/api/'))return p.startsWith('/dashboard')?'staff':'public';
 if(p.startsWith('/api/customer/')||p==='/api/health'||p.startsWith('/api/auth/')||p==='/api/chats'||p.startsWith('/api/chats/'))return 'handler';
 if(method==='GET'&&(p==='/api/stones'||p.startsWith('/api/stones/photo/')||p==='/api/videos'&&q.get('published')==='1'||/^\/api\/videos\/[^/]+\/comments$/.test(p)||/^\/api\/(model|trader)\/public\/[^/]+$/.test(p)))return 'public';
 if(method==='POST'&&['/api/chat','/api/sourcing','/api/partner','/api/models/login','/api/trader/login'].includes(p))return 'public';
 if(method==='POST'&&(p==='/api/videos/tap'||/^\/api\/videos\/[^/]+\/(like|comments)$/.test(p)))return 'public';
 if(p==='/api/orders'&&method==='POST')return 'customer';
 if(p==='/api/model/profile'||/^\/api\/models\/[^/]+(\/videos)?$/.test(p)&&!['enable','disable','login'].includes(p.split('/')[3]))return 'model';
 if(p==='/api/trader/profile'||/^\/api\/trader\/[^/]+(\/stones)?$/.test(p)&&!['login','public'].includes(p.split('/')[3]))return 'trader';
 if(p==='/api/videos/upload'&&method==='POST')return 'model';
 return 'staff';
}
export const publicStone=s=>Object.fromEntries(['id','ref','stone_type','shape','carat','color','clarity','cut','certification','category','crystal_form','clarity_notes','kp_status','price','status','photo','photo_path','listing_category','created_at'].filter(k=>s[k]!==undefined).map(k=>[k,s[k]]));
export const publicVideo=v=>Object.fromEntries(['id','video_url','caption','stone_id','published','status','likes_count','created_at','stone_ref','shape','carat','color','clarity','certification','price','stone_status','model_instagram','stone_photo','house_note','featured_piece'].filter(k=>v[k]!==undefined).map(k=>[k,v[k]]));
