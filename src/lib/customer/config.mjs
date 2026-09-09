export const COLLECTION_DEFAULTS = Object.freeze({profiles:'user_profiles',favorites:'favorites',saved:'saved_assets',designs:'generated_designs',entitlements:'entitlements',subscriptions:'subscriptions',catalog:'catalog_assets',events:'analytics_events',limits:'auth_rate_limits'});
export const BUCKET_DEFAULTS = Object.freeze({jewelry:'media',stones:'media',previews:'media',generated:'media'});
export function customerConfig(env=process.env) {
  // Server only: AMES_APP_ORIGIN is the exact trusted HTTPS deployment origin
  // (first the actual Vercel URL, later the custom domain). It is not a secret.
  // ASSET_DELIVERY_SECRET signs short-lived session-bound GLB leases. Owner supplied.
  const value=k=>env[k]?.trim()||'';
  const config={endpoint:value('APPWRITE_ENDPOINT'),project:value('APPWRITE_PROJECT_ID'),key:value('APPWRITE_API_KEY'),database:value('APPWRITE_DATABASE_ID')||'ames',origin:value('AMES_APP_ORIGIN'),deliverySecret:value('ASSET_DELIVERY_SECRET'),deskWhatsapp:value('AMES_DESK_WHATSAPP')||value('WHATSAPP_DESK'),collections:{},buckets:{}};
  for(const [key,id] of Object.entries(COLLECTION_DEFAULTS))config.collections[key]=value('APPWRITE_COLLECTION_'+key.toUpperCase())||id;
  for(const [key,id] of Object.entries(BUCKET_DEFAULTS))config.buckets[key]=value('APPWRITE_BUCKET_'+key.toUpperCase())||id;
  return config;
}
export function assertConfigured(c) {
  if(!c.endpoint||!c.project||!c.key||!c.origin||c.deliverySecret.length<48)throw Object.assign(new Error('Customer service is not configured'),{status:503});
  for(const raw of [c.endpoint,c.origin]) {const u=new URL(raw);if(u.username||u.password||u.search||u.hash||!(u.protocol==='https:'||u.protocol==='http:'&&['localhost','127.0.0.1','[::1]'].includes(u.hostname)))throw Object.assign(new Error('Invalid service configuration'),{status:503});}
  if(new URL(c.origin).origin!==c.origin||!new URL(c.endpoint).pathname.endsWith('/v1'))throw Object.assign(new Error('Invalid service configuration'),{status:503});
}
