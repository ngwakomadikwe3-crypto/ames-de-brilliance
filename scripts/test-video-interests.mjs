import test from 'node:test';
import assert from 'node:assert/strict';
import {videoInterests,captionWithInterests,filterVideoFeed} from '../src/lib/video-interests.ts';
import {readApiJson} from '../src/lib/client-api.ts';
test('For You contains videos and category buttons respect explicit interests',()=>{
 const records=[{key:'hip',mediaType:'video',searchTerms:['A chain #hiphop']},{key:'luxury',mediaType:'video',searchTerms:['#luxury #women']},{key:'unclassified',mediaType:'video',searchTerms:['Unclassified clip']},{key:'photo',mediaType:'image',searchTerms:['#luxury']}];
 assert.deepEqual(filterVideoFeed(records,'for-you').map(r=>r.key),['hip','luxury','unclassified']);
 assert.deepEqual(filterVideoFeed(records,'hip-hop').map(r=>r.key),['hip']);
 assert.deepEqual(filterVideoFeed(records,'women').map(r=>r.key),['luxury']);
 assert.deepEqual(videoInterests(['#women-owned #luxurious']),[]);
 assert.deepEqual(videoInterests(['#HIPHOP #Luxury.']),['hip-hop','luxury']);
});
test('staff category edits preserve the caption and replace only category tags',()=>{
 const caption=captionWithInterests('Our ring #luxury #brand',['hip-hop','women']);
 assert.ok(caption.includes('Our ring'));assert.ok(caption.includes('#brand'));
 assert.deepEqual(videoInterests([caption]),['hip-hop','women']);
 assert.equal(captionWithInterests(caption,['hip-hop','women']),caption);
 assert.deepEqual(videoInterests([captionWithInterests(caption,[])]),[]);
});
test('HTML and malformed JSON failures become readable retry messages',async()=>{
 for(const response of [new Response('<!DOCTYPE html><html>Error</html>',{status:500}),new Response('bad json',{status:200})])await assert.rejects(readApiJson(response,'Comments unavailable. Please try again.'),/^Error: Comments unavailable/);
 await assert.rejects(readApiJson(new Response('not json',{status:401}),'fallback'),/sign in/);
 await assert.rejects(readApiJson(new Response(JSON.stringify({error:'Please verify your email.'}),{status:403}),'fallback'),/verify your email/);
 await assert.rejects(readApiJson(new Response(JSON.stringify({error:'private storage details'}),{status:503}),'Try again.'),/^Error: Try again\./);
 assert.deepEqual(await readApiJson(new Response('{"comments":[]}'),'fallback'),{comments:[]});
});
