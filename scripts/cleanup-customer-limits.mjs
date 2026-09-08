// Operator task; removes only expired auth slots, never user or entitlement records.
import {Client,Query} from 'node-appwrite';
import {customerConfig,assertConfigured} from '../src/lib/customer/config.mjs';
import {customerDatabase} from '../src/lib/customer/database.mjs';
const c=customerConfig();assertConfigured(c);const db=customerDatabase(new Client().setEndpoint(c.endpoint).setProject(c.project).setKey(c.key));
const base={databaseId:c.database,collectionId:c.collections.limits};let removed=0;
for(;;){const result=await db.listDocuments({...base,queries:[Query.lessThan('updatedAt',new Date(Date.now()-86400000).toISOString()),Query.limit(100)]});if(!result.documents.length)break;
 if(!process.argv.includes('--apply')){console.log('Dry run: at least '+result.documents.length+' expired auth slots; use --apply.');break;}
 for(const d of result.documents){await db.deleteDocument({...base,documentId:d.$id});removed++;}}
console.log(JSON.stringify({removed}));
