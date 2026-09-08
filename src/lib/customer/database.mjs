// Current Appwrite TablesDB API behind the existing customer persistence contract.
import {TablesDB} from 'node-appwrite';
export function customerDatabase(client){
 const api=new TablesDB(client);
 const table=({collectionId,...p})=>({...p,tableId:collectionId});
 const row=({documentId,...p})=>({...table(p),rowId:documentId});
 return {
  get:p=>api.get(p),create:p=>api.create(p),
  async createCollection({documentSecurity,...p}){return api.createTable({...table(p),rowSecurity:documentSecurity});},
  async getCollection(p){const t=await api.getTable(table(p));return {...t,documentSecurity:t.rowSecurity};},
  createStringAttribute:p=>api.createStringColumn(table(p)),
  createDatetimeAttribute:p=>api.createDatetimeColumn(table(p)),
  async listAttributes(p){const r=await api.listColumns(table(p));return {...r,attributes:r.columns};},
  createIndex:({attributes,...p})=>api.createIndex({...table(p),columns:attributes}),
  async listIndexes(p){const r=await api.listIndexes(table(p));return {...r,indexes:r.indexes.map(i=>({...i,attributes:i.columns}))};},
  getDocument:p=>api.getRow(row(p)),createDocument:p=>api.createRow(row(p)),updateDocument:p=>api.updateRow(row(p)),deleteDocument:p=>api.deleteRow(row(p)),
  async listDocuments(p){const r=await api.listRows(table(p));return {...r,documents:r.rows};},
 };
}
