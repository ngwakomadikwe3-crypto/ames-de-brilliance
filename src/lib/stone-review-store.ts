import { createHash, randomUUID } from 'node:crypto';
import { Query } from 'node-appwrite';
import { DB_ID, getDb } from './appwrite';
import { stoneReviewSchema, publicationBlockers, publicationMatches, publicStoneRecord, type StoneReview } from './stone-verification';

const drafts = 'stone_reviews';
const publications = 'stone_publications';
class MissingStoneError extends Error {}
async function requirePrivateCollection(collectionId: string) {
  const collection = await getDb().getCollection({ databaseId: DB_ID, collectionId });
  if (collection.$permissions.length || collection.documentSecurity) {
    throw new Error('Review storage permissions are unsafe. An administrator must make the collection private.');
  }
}
const errorCode = (e: unknown) => typeof e === 'object' && e && 'code' in e ? Number(e.code) : 0;
async function optionalDocument(collectionId: string, documentId: string) {
  try { return await getDb().getDocument({databaseId:DB_ID,collectionId,documentId}); }
  catch(e) { if(errorCode(e)===404) return null; throw e; }
}
export async function ensureReviewStorage() {
  const db=getDb();
  for(const collectionId of [drafts,publications]) {
    try { await db.createCollection({databaseId:DB_ID,collectionId,name:collectionId,permissions:[],documentSecurity:false}); }
    catch(e) { if(errorCode(e)!==409) throw e; }
    await requirePrivateCollection(collectionId);
    const attributes=await db.listAttributes({databaseId:DB_ID,collectionId});
    for(const [key,size] of [['stoneId',100],['payload',30000]] as const) {
      if(!attributes.attributes.some(a=>a.key===key)) {
        try { await db.createStringAttribute({databaseId:DB_ID,collectionId,key,size,required:true}); }
        catch(e) { if(errorCode(e)!==409) throw e; }
      }
    }
    const ready=await db.listAttributes({databaseId:DB_ID,collectionId});
    if(!['stoneId','payload'].every(key=>ready.attributes.some(a=>a.key===key&&a.status==='available'))) throw new Error('Review storage is preparing. Retry shortly.');
  }
}
export async function stoneContext(stoneId: string) {
  const stone=await optionalDocument('stones',stoneId);
  if(!stone) throw new MissingStoneError('Stone not found');
  const trader=stone.trader_id ? await optionalDocument('traders',String(stone.trader_id)) : null;
  // $updatedAt binds approval even to edits made through legacy inventory APIs.
  const sourceHash=createHash('sha256').update(JSON.stringify({stone, trader})).digest('hex');
  return {stone,trader,sourceHash,available:stone.status==='Available',sellerActive:stone.source==='Own stock'||!!(trader&&trader.status==='Active')};
}
export async function latestDraft(stoneId:string) {
  try {
    await requirePrivateCollection(drafts);
    const rows=await getDb().listDocuments({databaseId:DB_ID,collectionId:drafts,queries:[Query.equal('stoneId',stoneId),Query.orderDesc('$sequence'),Query.limit(1)]});
    const row=rows.documents[0];
    if (!row) return null;
    const payload = JSON.parse(row.payload);
    return { ...payload, id: row.$id, createdAt: row.$createdAt, review: stoneReviewSchema.parse(payload.review) } as {id:string;createdAt:string;review:StoneReview;sourceHash:string;actor:string;reason:string};
  } catch(e) { if(errorCode(e)===404)return null;throw e; }
}
export async function reviewDetail(stoneId:string) {
  const context=await stoneContext(stoneId), draft=await latestDraft(stoneId);
  const row=draft ? await optionalDocument(publications,draft.id) : null;
  const receipt=row ? JSON.parse(row.payload) : null;
  const blockers=draft ? publicationBlockers(stoneReviewSchema.parse(draft.review),context.available,context.sellerActive) : ['Save a verification draft.'];
  if(draft && Number(context.stone.carat)!==draft.review.carats) blockers.push('Measured carat weight differs from inventory. Correct inventory before reviewing.');
  if(draft && context.sourceHash!==draft.sourceHash) blockers.push('Inventory or seller changed. Save and review a fresh draft.');
  return {stone:{id:context.stone.$id,ref:String(context.stone.ref),status:String(context.stone.status)},draft,blockers,
    published:!!draft&&blockers.length===0&&publicationMatches(draft.id,draft.sourceHash,context.sourceHash,receipt),receipt};
}
export async function saveReview(stoneId:string, input:unknown, actor:string, reason:string) {
  const review=stoneReviewSchema.parse(input),context=await stoneContext(stoneId);
  await ensureReviewStorage();
  // Append-only drafts: any newer draft withdraws an older publication. No old receipt can approve it.
  await getDb().createDocument({databaseId:DB_ID,collectionId:drafts,documentId:randomUUID(),data:{stoneId,payload:JSON.stringify({review,sourceHash:context.sourceHash,actor,role:"owner",reason})}});
  return reviewDetail(stoneId);
}
export async function publishReview(stoneId:string,draftId:string,actor:string) {
  const detail=await reviewDetail(stoneId);
  if(!detail.draft||detail.draft.id!==draftId) throw new Error('Review changed. Reload before approving.');
  if(detail.blockers.length) throw new Error(detail.blockers.join(' '));
  await ensureReviewStorage();
  // Unique document ID makes publication idempotent and binds approval to exactly one immutable draft.
  const payload={draftId,sourceHash:detail.draft.sourceHash,actor,role:"owner",approvedAt:new Date().toISOString()};
  try { await getDb().createDocument({databaseId:DB_ID,collectionId:publications,documentId:draftId,data:{stoneId,payload:JSON.stringify(payload)}}); }
  catch(e) { if(errorCode(e)!==409) throw e; }
  return reviewDetail(stoneId);
}
export async function publicStoneCatalogue() {
  const db=getDb();let cursor='';const stoneIds=new Set<string>();
  try {
    await requirePrivateCollection(publications);
    for(;;){const rows=await db.listDocuments({databaseId:DB_ID,collectionId:publications,queries:[Query.limit(100),...(cursor?[Query.cursorAfter(cursor)]:[])]});
      rows.documents.forEach(row=>stoneIds.add(String(row.stoneId)));if(rows.documents.length<100)break;cursor=rows.documents[rows.documents.length-1].$id;}
  } catch(e) {if(errorCode(e)===404)return [];throw e;}
  const items=[];
  for(const id of stoneIds){
    try {
    const detail=await reviewDetail(id);
    if(detail.published&&detail.draft)items.push(publicStoneRecord(id,detail.stone.ref,detail.draft.review));
    } catch (error) {
      if (!(error instanceof MissingStoneError)) throw error;
    }
  }
  return items;
}
