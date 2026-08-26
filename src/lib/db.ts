import {
  ensureReady, getDb as getDbSvc, getStorage, getMediaUrl, getLicenceUrl,
  doc, nowISO, DB_ID, MEDIA_BUCKET, LICENCE_DOCS_BUCKET,
} from "./appwrite";
import { ID, Query } from "node-appwrite";
import { InputFile } from "node-appwrite/file";

/* ── Interfaces ── */

export interface DbRequest {
  id: string; date: string; buyer_name: string; company: string; country: string;
  contact: string; type: string; shape: string; carat_min: string; carat_max: string;
  color: string; clarity: string; certification: string; notes: string;
  kp_licence: string; kp_country: string;
  consent: boolean; declaration: boolean; consent_timestamp: string;
  mandate: string; status: "New" | "Sourcing" | "Quoted" | "Closed"; created_at: string;
  offer_text: string; offer_timestamp: string;
}

export interface DbTrader {
  id: string; name: string; whatsapp: string; licence: string;
  portal_code: string; email: string; status: "Pending" | "Active" | "Declined";
  company: string; country: string; licence_photo: string;
  created_at: string;
}

export interface DbReport {
  id: string; trader_id: string; period_start: string; period_end: string;
  report_date: string; summary: string; data: string; created_at: string;
}

export interface DbStoneStatusLog {
  id: string; stone_id: string; status: string; reason: string; changed_at: string;
}

export interface DbStone {
  id: string; ref: string; stone_type: "rough" | "polished";
  shape: string; carat: number; color: string;
  clarity: string; cut: string; certification: string;
  category: string; crystal_form: string; clarity_notes: string;
  kp_status: boolean; price: number | null;
  status: "Available" | "Reserved" | "Sold"; photo: string;
  source: "Own stock" | "Consigned"; trader_id: string | null;
  commission: number; sale_price: number | null; photo_path: string | null;
  listing_category: "Rough" | "Polished" | "Jewelry"; created_at: string;
}

export interface DbOrder {
  id: string; stone_id: string; stone_ref: string;
  buyer_name: string; buyer_whatsapp: string; price: number | null;
  status: string; created_at: string;
}

export interface DbVideo {
  id: string; video_url: string; caption: string;
  stone_id: string | null; published: boolean;
  model_id: string | null; status: string; tap_count: number;
  reserve_count: number; sales_count: number; sales_value: number; commission_earned: number;
  likes_count: number; created_at: string;
}

export interface DbModel {
  id: string; name: string; whatsapp: string; instagram: string;
  portal_code: string; status: string; created_at: string;
  monthly_video_quota: number; monthly_base_fee: number; commission_rate: number;
  payment_method: string; payment_details: string; total_paid: number;
}

/* ── Placeholder ── */

export const STONE_PLACEHOLDER = "data:image/svg+xml," + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect fill="#e5e7eb" width="400" height="400"/><text x="200" y="195" font-family="system-ui,sans-serif" font-size="13" fill="#9ca3af" text-anchor="middle">Photo of actual stone</text><text x="200" y="215" font-family="system-ui,sans-serif" font-size="13" fill="#9ca3af" text-anchor="middle">on request</text></svg>'
);

/* ── Helpers ── */

function genPortalCode(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let code = "";
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

function normPrice(v: any): number | null {
  return v ? Number(v) : null;
}

/* ── Seed data ── */

async function seedIfEmpty(): Promise<void> {
  const db = getDbSvc();
  const existing = await db.listDocuments({ databaseId: DB_ID, collectionId: "stones", queries: [Query.limit(1)] });
  if (existing.total > 0) return;
  const now = nowISO();
  const t1 = await db.createDocument({ databaseId: DB_ID, collectionId: "traders", documentId: ID.unique(),
    data: { name: "Kgosi Molefe", whatsapp: "+267 71 555 0101", licence: "BDMR-089", portal_code: genPortalCode(), status: "Active", email: "", company: "", country: "", licence_photo: "", created_at: now } });
  const t2 = await db.createDocument({ databaseId: DB_ID, collectionId: "traders", documentId: ID.unique(),
    data: { name: "Ravi Patel", whatsapp: "+91 98765 43210", licence: "GJEPC-4421", portal_code: genPortalCode(), status: "Active", email: "", company: "", country: "", licence_photo: "", created_at: now } });
  const stones = [
    { id: "1", ref: "ADB-001", stone_type: "rough", shape: "Octahedron", carat: 12.45, color: "Near colourless", clarity: "", cut: "", certification: "", category: "Sawable", crystal_form: "Octahedron", clarity_notes: "Clean octahedron, minimal inclusions visible under 10x", kp_status: true, price: 0, status: "Available", photo: "", source: "Own stock", trader_id: "", commission: 0, sale_price: 0, photo_path: "", listing_category: "Rough" },
    { id: "2", ref: "ADB-002", stone_type: "rough", shape: "Macle", carat: 8.30, color: "Light brown", clarity: "", cut: "", certification: "", category: "Near-gem", crystal_form: "Macle", clarity_notes: "Twinned crystal", kp_status: true, price: 0, status: "Available", photo: "", source: "Consigned", trader_id: t1.$id, commission: 5, sale_price: 0, photo_path: "", listing_category: "Rough" },
    { id: "3", ref: "ADB-003", stone_type: "rough", shape: "Irregular", carat: 3.20, color: "Greyish", clarity: "", cut: "", certification: "", category: "Industrial", crystal_form: "Irregular", clarity_notes: "Fractured surface", kp_status: false, price: 0, status: "Available", photo: "", source: "Own stock", trader_id: "", commission: 0, sale_price: 0, photo_path: "", listing_category: "Rough" },
    { id: "4", ref: "ADB-004", stone_type: "polished", shape: "Round Brilliant", carat: 1.05, color: "G", clarity: "VS1", cut: "Excellent", certification: "GIA", category: "", crystal_form: "", clarity_notes: "", kp_status: false, price: 8900, status: "Available", photo: "", source: "Own stock", trader_id: "", commission: 0, sale_price: 0, photo_path: "", listing_category: "Polished" },
    { id: "5", ref: "ADB-005", stone_type: "polished", shape: "Oval", carat: 1.72, color: "D", clarity: "IF", cut: "Excellent", certification: "GIA", category: "", crystal_form: "", clarity_notes: "", kp_status: false, price: 24500, status: "Available", photo: "", source: "Consigned", trader_id: t2.$id, commission: 8, sale_price: 0, photo_path: "", listing_category: "Polished" },
  ];
  for (const s of stones) await db.createDocument({ databaseId: DB_ID, collectionId: "stones", documentId: s.id, data: { ...s, created_at: now } });
  const requests = [
    { id: "SR-2026-0001", date: "2026-08-22", buyer_name: "James Mokgosi", company: "Kalahari Diamonds Pty", country: "Botswana", contact: "+267 71 234 567", type: "Polished", shape: "Round Brilliant", carat_min: "1.00", carat_max: "3.00", color: "G", clarity: "VS1", certification: "GIA", notes: "Need by end of Q3.", status: "New", mandate: "SOURCING REQUEST" },
    { id: "SR-2026-0002", date: "2026-08-21", buyer_name: "Priya Sharma", company: "Surat Diamonds Ltd", country: "India", contact: "+91 98765 43210", type: "Polished", shape: "Oval", carat_min: "0.50", carat_max: "1.00", color: "D", clarity: "IF", certification: "GIA", notes: "Certified stones only.", status: "Sourcing", mandate: "SOURCING REQUEST" },
    { id: "SR-2026-0003", date: "2026-08-20", buyer_name: "David Van Houten", company: "Antwerp Rough Trading NV", country: "Belgium", contact: "+32 471 234 567", type: "Rough", shape: "", carat_min: "5.00", carat_max: "15.00", color: "Near colourless", clarity: "", certification: "None", notes: "Sawable to Near-gem.", kp_licence: "KP-BE-2026-0142", kp_country: "Belgium", status: "Quoted", mandate: "SOURCING REQUEST" },
  ];
  for (const r of requests) await db.createDocument({ databaseId: DB_ID, collectionId: "requests", documentId: r.id, data: { ...r, kp_licence: r.kp_licence || "", kp_country: r.kp_country || "", consent: true, declaration: false, consent_timestamp: now, offer_text: "", offer_timestamp: "", created_at: now } });
}

/* ── Request Queries ── */

export async function getAllRequests(): Promise<DbRequest[]> {
  await ensureReady();
  const db = getDbSvc();
  const res = await db.listDocuments({ databaseId: DB_ID, collectionId: "requests", queries: [Query.orderDesc("created_at")] });
  return res.documents.map(d => doc<DbRequest>(d));
}

export async function getRequestById(id: string): Promise<DbRequest | undefined> {
  await ensureReady();
  try { return doc<DbRequest>(await getDbSvc().getDocument({ databaseId: DB_ID, collectionId: "requests", documentId: id })); } catch { return undefined; }
}

export async function addRequest(data: { buyer_name: string; company: string; country: string; contact: string; type: string; shape: string; carat_min: string; carat_max: string; color: string; clarity: string; certification: string; notes: string; kp_licence?: string; kp_country?: string; consent?: boolean; declaration?: boolean; consent_timestamp?: string; }): Promise<DbRequest> {
  await ensureReady();
  const db = getDbSvc(); const now = nowISO();
  const count = (await db.listDocuments({ databaseId: DB_ID, collectionId: "requests", queries: [Query.limit(0)] })).total;
  const id = `SR-${new Date().getFullYear()}-${String(count + 1).padStart(4, "0")}`;
  const date = now.split("T")[0];
  const cr = data.carat_min === data.carat_max ? `${data.carat_min}ct` : `${data.carat_min}\u2013${data.carat_max}ct`;
  const cert = data.certification === "None" ? "" : ` ${data.certification}`;
  const lines = ["SOURCING REQUEST", "", `Buyer: ${data.company}${data.country ? ` (${data.country})` : ""}`, `Contact: ${data.contact}`, `Type: ${data.type}`, "", `Requirement: ${data.shape} ${cr} ${data.color} ${data.clarity}${cert}`];
  if (data.notes) lines.push("", `Notes: ${data.notes}`);
  if (data.kp_licence) lines.push("", `KP Licence: ${data.kp_licence} (${data.kp_country})`);
  await db.createDocument({ databaseId: DB_ID, collectionId: "requests", documentId: id, data: { date, buyer_name: data.buyer_name, company: data.company, country: data.country, contact: data.contact, type: data.type, shape: data.shape, carat_min: data.carat_min, carat_max: data.carat_max, color: data.color, clarity: data.clarity, certification: data.certification, notes: data.notes, kp_licence: data.kp_licence || "", kp_country: data.kp_country || "", consent: data.consent || false, declaration: data.declaration || false, consent_timestamp: data.consent_timestamp || now, mandate: lines.join("\n"), status: "New", offer_text: "", offer_timestamp: "", created_at: now } });
  return (await getRequestById(id))!;
}

export async function updateRequest(id: string, updates: Partial<Pick<DbRequest, "status" | "notes" | "mandate">>): Promise<DbRequest | null> {
  await ensureReady();
  if (!(await getRequestById(id))) return null;
  await getDbSvc().updateDocument({ databaseId: DB_ID, collectionId: "requests", documentId: id, data: updates });
  return (await getRequestById(id)) || null;
}

export async function updateRequestOffer(id: string, offerText: string): Promise<DbRequest | null> {
  await ensureReady();
  if (!(await getRequestById(id))) return null;
  await getDbSvc().updateDocument({ databaseId: DB_ID, collectionId: "requests", documentId: id, data: { offer_text: offerText, offer_timestamp: nowISO(), status: "Quoted" } });
  return (await getRequestById(id)) || null;
}

/* ── Trader Queries ── */

export async function createTrader(name: string, whatsapp: string): Promise<DbTrader> {
  await ensureReady();
  const res = await getDbSvc().createDocument({ databaseId: DB_ID, collectionId: "traders", documentId: ID.unique(), data: { name, whatsapp, licence: "", portal_code: genPortalCode(), email: "", status: "Active", company: "", country: "", licence_photo: "", created_at: nowISO() } });
  return doc<DbTrader>(res);
}

export async function getAllTraders(): Promise<DbTrader[]> {
  await ensureReady();
  const res = await getDbSvc().listDocuments({ databaseId: DB_ID, collectionId: "traders" });
  const traders = res.documents.map(d => doc<DbTrader>(d));
  const order: Record<string, number> = { Pending: 0, Active: 1, Declined: 2 };
  return traders.sort((a, b) => (order[a.status] ?? 3) - (order[b.status] ?? 3) || a.name.localeCompare(b.name));
}

export async function getTraderByPortalCode(code: string): Promise<DbTrader | undefined> {
  await ensureReady();
  try { const res = await getDbSvc().listDocuments({ databaseId: DB_ID, collectionId: "traders", queries: [Query.equal("portal_code", code), Query.limit(1)] }); return res.documents.length ? doc<DbTrader>(res.documents[0]) : undefined; } catch { return undefined; }
}

export async function getOrCreateTrader(name: string, whatsapp: string, licence: string): Promise<string> {
  await ensureReady();
  const db = getDbSvc();
  const existing = await db.listDocuments({ databaseId: DB_ID, collectionId: "traders", queries: [Query.equal("name", name), Query.limit(1)] });
  if (existing.documents.length) return existing.documents[0].$id;
  const res = await db.createDocument({ databaseId: DB_ID, collectionId: "traders", documentId: ID.unique(), data: { name, whatsapp, licence, portal_code: genPortalCode(), email: "", status: "Active", company: "", country: "", licence_photo: "", created_at: nowISO() } });
  return res.$id;
}

export async function getTraderById(id: string): Promise<DbTrader | undefined> {
  await ensureReady();
  try { return doc<DbTrader>(await getDbSvc().getDocument({ databaseId: DB_ID, collectionId: "traders", documentId: id })); } catch { return undefined; }
}

export async function addTraderApplication(data: { name: string; company: string; country: string; whatsapp: string; email: string; licence: string; licence_photo: string }): Promise<DbTrader> {
  await ensureReady();
  const res = await getDbSvc().createDocument({ databaseId: DB_ID, collectionId: "traders", documentId: ID.unique(), data: { name: data.name, company: data.company, country: data.country, whatsapp: data.whatsapp, email: data.email, licence: data.licence, licence_photo: data.licence_photo, portal_code: "", status: "Pending", created_at: nowISO() } });
  return doc<DbTrader>(res);
}

export async function approveTrader(id: string): Promise<DbTrader | null> {
  await ensureReady();
  const existing = await getTraderById(id); if (!existing) return null;
  await getDbSvc().updateDocument({ databaseId: DB_ID, collectionId: "traders", documentId: id, data: { status: "Active", portal_code: existing.portal_code || genPortalCode() } });
  return (await getTraderById(id)) || null;
}

export async function declineTrader(id: string): Promise<DbTrader | null> {
  await ensureReady();
  if (!(await getTraderById(id))) return null;
  await getDbSvc().updateDocument({ databaseId: DB_ID, collectionId: "traders", documentId: id, data: { status: "Declined" } });
  return (await getTraderById(id)) || null;
}

export async function togglePreferredTrader(id: string): Promise<boolean> {
  await ensureReady();
  const trader = await getTraderById(id);
  if (!trader) return false;
  const newVal = !(trader as any).preferred;
  await getDbSvc().updateDocument({ databaseId: DB_ID, collectionId: "traders", documentId: id, data: { preferred: newVal } });
  return newVal;
}

/* ── Report Queries ── */

export async function getTraderReports(traderId: string): Promise<DbReport[]> {
  await ensureReady();
  const res = await getDbSvc().listDocuments({ databaseId: DB_ID, collectionId: "reports", queries: [Query.equal("trader_id", traderId), Query.orderDesc("report_date")] });
  return res.documents.map(d => doc<DbReport>(d));
}

export async function getAllReports(): Promise<(DbReport & { trader_name: string })[]> {
  await ensureReady();
  const res = await getDbSvc().listDocuments({ databaseId: DB_ID, collectionId: "reports", queries: [Query.orderDesc("report_date")] });
  const reports = res.documents.map(d => doc<DbReport>(d));
  const traderIds = [...new Set(reports.map(r => r.trader_id).filter(Boolean))];
  const traderMap = new Map<string, string>();
  for (const tid of traderIds) { const t = await getTraderById(tid); if (t) traderMap.set(tid, t.name); }
  return reports.map(r => ({ ...r, trader_name: traderMap.get(r.trader_id) || "Unknown" }));
}

export async function addReport(traderId: string, periodStart: string, periodEnd: string, summary: string, data: object): Promise<DbReport> {
  await ensureReady();
  const now = nowISO();
  const res = await getDbSvc().createDocument({ databaseId: DB_ID, collectionId: "reports", documentId: ID.unique(), data: { trader_id: traderId, period_start: periodStart, period_end: periodEnd, report_date: now, summary, data: JSON.stringify(data), created_at: now } });
  return doc<DbReport>(res);
}

export async function generateWeeklyReport(traderId: string): Promise<DbReport | null> {
  await ensureReady();
  const trader = await getTraderById(traderId); if (!trader) return null;
  const db = getDbSvc(); const now = new Date(); const weekAgo = new Date(now.getTime() - 7 * 86400000);
  const periodStart = weekAgo.toISOString(); const periodEnd = now.toISOString();
  const stonesRes = await db.listDocuments({ databaseId: DB_ID, collectionId: "stones", queries: [Query.equal("trader_id", traderId)] });
  const allStones = stonesRes.documents.map(d => doc<any>(d));
  const live = allStones.filter((s: any) => s.status === "Available");
  const pending = allStones.filter((s: any) => s.status === "Pending");
  const rejected = allStones.filter((s: any) => s.status === "Rejected");
  const logRes = await db.listDocuments({ databaseId: DB_ID, collectionId: "stone_status_log", queries: [Query.greaterThanEqual("changed_at", periodStart)] });
  const recentLog = logRes.documents.map(d => doc<any>(d));
  const stoneIdSet = new Set(allStones.map((s: any) => s.id));
  const reservedIds = new Set(recentLog.filter((l: any) => l.status === "Reserved" && stoneIdSet.has(l.stone_id)).map((l: any) => l.stone_id));
  const soldIds = new Set(recentLog.filter((l: any) => l.status === "Sold" && stoneIdSet.has(l.stone_id)).map((l: any) => l.stone_id));
  const reserved = allStones.filter((s: any) => reservedIds.has(s.id));
  const sold = allStones.filter((s: any) => soldIds.has(s.id));
  const soldWithCommission = sold.map((s: any) => { const cp = s.commission || 0; const sp = s.sale_price || 0; return { ref: s.ref, shape: s.shape, carat: s.carat, color: s.color, clarity: s.clarity, certification: s.certification, sale_price: sp, commission_pct: cp, commission_amount: sp * (cp / 100) }; });
  const totalCommission = soldWithCommission.reduce((sum: number, s: any) => sum + s.commission_amount, 0);
  const summary = [`Weekly Report for ${trader.name}`, `Period: ${weekAgo.toISOString().split("T")[0]} to ${now.toISOString().split("T")[0]}`, "", `Live items: ${live.length}`, `New reserves: ${reserved.length}`, `Items sold: ${sold.length}`, `Commission: $${totalCommission.toLocaleString()}`, "", `Live: ${live.map((s: any) => s.ref).join(", ") || "none"}`, `Reserved: ${reserved.map((s: any) => s.ref).join(", ") || "none"}`, `Sold: ${sold.map((s: any) => s.ref).join(", ") || "none"}`, `Pending: ${pending.map((s: any) => s.ref).join(", ") || "none"}`].join("\n");
  return addReport(traderId, periodStart, periodEnd, summary, { period: { start: weekAgo.toISOString().split("T")[0], end: now.toISOString().split("T")[0] }, live, reserved, sold: soldWithCommission, total_commission: totalCommission, full_status: { live: live.map((s: any) => s.ref), reserved: reserved.map((s: any) => s.ref), sold: sold.map((s: any) => s.ref), pending: pending.map((s: any) => s.ref), rejected: rejected.map((s: any) => s.ref) } });
}

/* ── Stone Queries ── */

async function enrichStones(stones: any[]): Promise<any[]> {
  if (!stones.length) return [];
  const db = getDbSvc();
  const traderIds = [...new Set(stones.map(s => s.trader_id).filter(Boolean))];
  const traderMap = new Map<string, any>();
  for (const tid of traderIds) { try { traderMap.set(tid, await db.getDocument({ databaseId: DB_ID, collectionId: "traders", documentId: tid })); } catch {} }
  return stones.map(s => ({ ...s, kp_status: !!s.kp_status, price: normPrice(s.price), sale_price: normPrice(s.sale_price), trader_name: s.trader_id ? (traderMap.get(s.trader_id)?.name || null) : null, trader_whatsapp: s.trader_id ? (traderMap.get(s.trader_id)?.whatsapp || null) : null, trader_licence: s.trader_id ? (traderMap.get(s.trader_id)?.licence || null) : null, trader_preferred: s.trader_id ? !!(traderMap.get(s.trader_id) as any)?.preferred : false }));
}

export async function getAllStones() { await ensureReady(); const res = await getDbSvc().listDocuments({ databaseId: DB_ID, collectionId: "stones", queries: [Query.orderDesc("created_at")] }); return enrichStones(res.documents.map(d => doc<any>(d))); }
export async function getAvailableStones() { await ensureReady(); const res = await getDbSvc().listDocuments({ databaseId: DB_ID, collectionId: "stones", queries: [Query.equal("status", "Available"), Query.orderDesc("created_at")] }); return enrichStones(res.documents.map(d => doc<any>(d))); }

export async function getStoneById(id: string) {
  await ensureReady();
  try { const enriched = await enrichStones([doc<any>(await getDbSvc().getDocument({ databaseId: DB_ID, collectionId: "stones", documentId: id }))]); return enriched[0] || null; } catch { return null; }
}

export async function addStone(data: { stone_type: string; shape: string; carat: number; color: string; clarity: string; cut: string; certification: string; category: string; crystal_form: string; clarity_notes: string; kp_status: boolean; price: number | null; status: string; photo: string; source: string; trader_id: string | null; commission: number; photo_path: string | null; listing_category?: string; }) {
  await ensureReady(); const db = getDbSvc(); const now = nowISO();
  const count = (await db.listDocuments({ databaseId: DB_ID, collectionId: "stones", queries: [Query.limit(0)] })).total;
  const id = String(count + 1); const ref = `ADB-${String(count + 1).padStart(3, "0")}`;
  await db.createDocument({ databaseId: DB_ID, collectionId: "stones", documentId: id, data: { ref, stone_type: data.stone_type, shape: data.shape, carat: data.carat, color: data.color, clarity: data.clarity, cut: data.cut, certification: data.certification, category: data.category, crystal_form: data.crystal_form, clarity_notes: data.clarity_notes, kp_status: data.kp_status, price: data.price || 0, status: data.status, photo: data.photo || "", source: data.source, trader_id: data.trader_id || "", commission: data.commission, sale_price: 0, photo_path: data.photo_path || "", listing_category: data.listing_category || "Polished", created_at: now } });
  return getStoneById(id);
}

export async function updateStone(id: string, updates: Partial<Pick<DbStone, "status" | "sale_price" | "price" | "photo" | "photo_path" | "shape" | "carat" | "color" | "clarity" | "cut" | "certification" | "listing_category">>) {
  await ensureReady(); const existing = await getStoneById(id); if (!existing) return null;
  const data: any = {};
  for (const [k, v] of Object.entries(updates)) { if (v !== undefined) data[k] = k === "sale_price" || k === "price" ? (v ?? 0) : v; }
  if (Object.keys(data).length === 0) return existing;
  await getDbSvc().updateDocument({ databaseId: DB_ID, collectionId: "stones", documentId: id, data });
  if (updates.status !== undefined && updates.status !== existing.status) {
    await getDbSvc().createDocument({ databaseId: DB_ID, collectionId: "stone_status_log", documentId: ID.unique(), data: { stone_id: id, status: updates.status, reason: "", changed_at: nowISO() } });
  }
  if (updates.status === "Sold" && existing.status !== "Sold") {
    const salePrice = updates.sale_price ?? existing.sale_price ?? 0;
    const videoRes = await getDbSvc().listDocuments({ databaseId: DB_ID, collectionId: "videos", queries: [Query.equal("stone_id", id)] });
    for (const v of videoRes.documents) { if (v.model_id) { await getDbSvc().updateDocument({ databaseId: DB_ID, collectionId: "videos", documentId: v.$id, data: { sales_count: (v.sales_count || 0) + 1, sales_value: (v.sales_value || 0) + (salePrice || 0), commission_earned: (v.commission_earned || 0) + ((salePrice || 0) * 0.005) } }); } }
  }
  return getStoneById(id);
}

export async function approveStone(id: string, edits: Partial<Pick<DbStone, "shape" | "carat" | "color" | "clarity" | "cut" | "certification" | "price" | "listing_category">>) {
  await ensureReady(); const data: any = { status: "Available" };
  for (const [k, v] of Object.entries(edits)) { if (v !== undefined) data[k] = v; }
  await getDbSvc().updateDocument({ databaseId: DB_ID, collectionId: "stones", documentId: id, data });
  await getDbSvc().createDocument({ databaseId: DB_ID, collectionId: "stone_status_log", documentId: ID.unique(), data: { stone_id: id, status: "Available", reason: "Approved", changed_at: nowISO() } });
  return getStoneById(id);
}

export async function rejectStone(id: string, reason: string) {
  await ensureReady();
  await getDbSvc().updateDocument({ databaseId: DB_ID, collectionId: "stones", documentId: id, data: { status: "Rejected" } });
  await getDbSvc().createDocument({ databaseId: DB_ID, collectionId: "stone_status_log", documentId: ID.unique(), data: { stone_id: id, status: "Rejected", reason, changed_at: nowISO() } });
  return getStoneById(id);
}

export async function getStoneStatusLog(stoneId: string): Promise<DbStoneStatusLog[]> {
  await ensureReady(); const res = await getDbSvc().listDocuments({ databaseId: DB_ID, collectionId: "stone_status_log", queries: [Query.equal("stone_id", stoneId), Query.orderAsc("changed_at")] });
  return res.documents.map(d => doc<DbStoneStatusLog>(d));
}

export async function getTraderStones(traderId: string) {
  await ensureReady(); const res = await getDbSvc().listDocuments({ databaseId: DB_ID, collectionId: "stones", queries: [Query.equal("trader_id", traderId), Query.orderDesc("created_at")] });
  return enrichStones(res.documents.map(d => doc<any>(d)));
}

/* ── Photo / Media Storage ── */

export async function savePhoto(filename: string, buffer: Buffer): Promise<string> {
  await ensureReady(); const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const file = InputFile.fromBuffer(buffer, `${Date.now()}_${safeName}`);
  const res = await getStorage().createFile({ bucketId: MEDIA_BUCKET, fileId: ID.unique(), file });
  return getMediaUrl(res.$id);
}

export function getPhotoFile(_filename: string): Buffer | null { return null; }
export function ensureUploadsDir(): string { return ""; }

/* ── Store Queries ── */

export async function getStoreStones() {
  await ensureReady(); const res = await getDbSvc().listDocuments({ databaseId: DB_ID, collectionId: "stones", queries: [Query.equal("status", "Available"), Query.orderDesc("created_at")] });
  return enrichStones(res.documents.map(d => doc<any>(d)).filter((s: any) => s.listing_category === "Polished" || s.listing_category === "Jewelry"));
}

/* ── Order Queries ── */

export async function createOrder(stoneId: string, stoneRef: string, buyerName: string, buyerWhatsapp: string, price: number | null): Promise<DbOrder> {
  await ensureReady(); const db = getDbSvc(); const now = nowISO();
  const res = await db.createDocument({ databaseId: DB_ID, collectionId: "orders", documentId: ID.unique(), data: { stone_id: stoneId, stone_ref: stoneRef, buyer_name: buyerName, buyer_whatsapp: buyerWhatsapp, price: price || 0, status: "Reserved", created_at: now } });
  await db.updateDocument({ databaseId: DB_ID, collectionId: "stones", documentId: stoneId, data: { status: "Reserved" } });
  await db.createDocument({ databaseId: DB_ID, collectionId: "stone_status_log", documentId: ID.unique(), data: { stone_id: stoneId, status: "Reserved", reason: "", changed_at: now } });
  const videoRes = await db.listDocuments({ databaseId: DB_ID, collectionId: "videos", queries: [Query.equal("stone_id", stoneId)] });
  for (const v of videoRes.documents) { await db.updateDocument({ databaseId: DB_ID, collectionId: "videos", documentId: v.$id, data: { reserve_count: (v.reserve_count || 0) + 1 } }); }
  return doc<DbOrder>(res);
}

export async function getAllOrders() {
  await ensureReady(); const db = getDbSvc();
  const res = await db.listDocuments({ databaseId: DB_ID, collectionId: "orders", queries: [Query.orderDesc("created_at")] });
  const orders = res.documents.map(d => doc<any>(d));
  const stoneIds = [...new Set(orders.map((o: any) => o.stone_id).filter(Boolean))];
  const stoneMap = new Map<string, any>();
  for (const sid of stoneIds) { const s = await getStoneById(sid); if (s) stoneMap.set(sid, s); }
  return orders.map((o: any) => ({ ...o, price: normPrice(o.price), shape: stoneMap.get(o.stone_id)?.shape || "", carat: stoneMap.get(o.stone_id)?.carat || 0, color: stoneMap.get(o.stone_id)?.color || "", clarity: stoneMap.get(o.stone_id)?.clarity || "", certification: stoneMap.get(o.stone_id)?.certification || "", stone_status: stoneMap.get(o.stone_id)?.status || "" }));
}

export async function updateOrderStatus(id: string, status: string): Promise<DbOrder | null> {
  await ensureReady();
  try { await getDbSvc().updateDocument({ databaseId: DB_ID, collectionId: "orders", documentId: id, data: { status } }); return doc<DbOrder>(await getDbSvc().getDocument({ databaseId: DB_ID, collectionId: "orders", documentId: id })); } catch { return null; }
}

/* ── Video Queries ── */

export async function getAllVideos() {
  await ensureReady(); const db = getDbSvc();
  const res = await db.listDocuments({ databaseId: DB_ID, collectionId: "videos", queries: [Query.orderDesc("created_at")] });
  const videos = res.documents.map(d => doc<any>(d));
  const stoneIds = [...new Set(videos.map((v: any) => v.stone_id).filter(Boolean))];
  const modelIds = [...new Set(videos.map((v: any) => v.model_id).filter(Boolean))];
  const stoneMap = new Map<string, any>(); const modelMap = new Map<string, any>();
  for (const sid of stoneIds) { const s = await getStoneById(sid); if (s) stoneMap.set(sid, s); }
  for (const mid of modelIds) { try { modelMap.set(mid, await db.getDocument({ databaseId: DB_ID, collectionId: "models", documentId: mid })); } catch {} }
  return videos.map((v: any) => ({ ...v, published: !!v.published, stone_ref: stoneMap.get(v.stone_id)?.ref || null, model_name: modelMap.get(v.model_id)?.name || null, model_instagram: modelMap.get(v.model_id)?.instagram || null }));
}

export async function getPublishedVideos() {
  await ensureReady(); const db = getDbSvc();
  const res = await db.listDocuments({ databaseId: DB_ID, collectionId: "videos", queries: [Query.equal("published", true), Query.equal("status", "Live"), Query.orderDesc("created_at")] });
  const videos = res.documents.map(d => doc<any>(d));
  return Promise.all(videos.map(async (v: any) => {
    let stone = null, model = null;
    if (v.stone_id) { try { stone = await db.getDocument({ databaseId: DB_ID, collectionId: "stones", documentId: v.stone_id }); } catch {} }
    if (v.model_id) { try { model = await db.getDocument({ databaseId: DB_ID, collectionId: "models", documentId: v.model_id }); } catch {} }
    return { ...v, published: true, stone_ref: stone?.ref || null, shape: stone?.shape || null, carat: stone?.carat || null, color: stone?.color || null, clarity: stone?.clarity || null, certification: stone?.certification || null, price: normPrice(stone?.price), stone_status: stone?.status || null, model_instagram: model?.instagram || null };
  }));
}

export async function addVideo(videoUrl: string, caption: string, stoneId: string | null): Promise<DbVideo> {
  await ensureReady(); const now = nowISO();
  const res = await getDbSvc().createDocument({ databaseId: DB_ID, collectionId: "videos", documentId: ID.unique(), data: { video_url: videoUrl, caption, stone_id: stoneId || "", published: false, model_id: "", status: "Live", tap_count: 0, reserve_count: 0, sales_count: 0, sales_value: 0, commission_earned: 0, likes_count: 0, created_at: now } });
  return doc<DbVideo>(res);
}

export async function updateVideo(id: string, updates: { video_url?: string; caption?: string; stone_id?: string | null; published?: number | boolean }): Promise<DbVideo | null> {
  await ensureReady(); const db = getDbSvc(); const data: any = {};
  if (updates.video_url !== undefined) data.video_url = updates.video_url;
  if (updates.caption !== undefined) data.caption = updates.caption;
  if (updates.stone_id !== undefined) data.stone_id = updates.stone_id || "";
  if (updates.published !== undefined) data.published = !!updates.published;
  if (!Object.keys(data).length) { try { return doc<DbVideo>(await db.getDocument({ databaseId: DB_ID, collectionId: "videos", documentId: id })); } catch { return null; } }
  try { await db.updateDocument({ databaseId: DB_ID, collectionId: "videos", documentId: id, data }); return doc<DbVideo>(await db.getDocument({ databaseId: DB_ID, collectionId: "videos", documentId: id })); } catch { return null; }
}

export async function deleteVideo(id: string): Promise<boolean> { await ensureReady(); try { await getDbSvc().deleteDocument({ databaseId: DB_ID, collectionId: "videos", documentId: id }); return true; } catch { return false; } }

/* ── Model Queries ── */

export async function getAllModels() {
  await ensureReady(); const db = getDbSvc();
  const res = await db.listDocuments({ databaseId: DB_ID, collectionId: "models", queries: [Query.orderDesc("created_at")] });
  const models = res.documents.map(d => doc<any>(d));
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
  return Promise.all(models.map(async (m: any) => {
    const vRes = await db.listDocuments({ databaseId: DB_ID, collectionId: "videos", queries: [Query.equal("model_id", m.id)] });
    const videos = vRes.documents;
    return { ...m, live_count: videos.filter((v: any) => v.status === "Live").length, pending_count: videos.filter((v: any) => v.status === "Pending").length, approved_this_month: videos.filter((v: any) => v.status === "Live" && v.created_at >= monthStart).length, commission_earnings: videos.reduce((s: number, v: any) => s + (v.commission_earned || 0), 0) };
  }));
}

export async function getActiveModelCount(): Promise<number> {
  await ensureReady();
  const res = await getDbSvc().listDocuments({ databaseId: DB_ID, collectionId: "models", queries: [Query.equal("status", "Active"), Query.limit(0)] });
  return res.total;
}

export async function getModelByPortalCode(code: string): Promise<DbModel | undefined> { await ensureReady(); try { const res = await getDbSvc().listDocuments({ databaseId: DB_ID, collectionId: "models", queries: [Query.equal("portal_code", code), Query.limit(1)] }); return res.documents.length ? doc<DbModel>(res.documents[0]) : undefined; } catch { return undefined; } }
export async function getModelById(id: string): Promise<DbModel | undefined> { await ensureReady(); try { return doc<DbModel>(await getDbSvc().getDocument({ databaseId: DB_ID, collectionId: "models", documentId: id })); } catch { return undefined; } }

export async function addModel(name: string, whatsapp: string, instagram: string): Promise<DbModel> {
  await ensureReady();
  const res = await getDbSvc().createDocument({ databaseId: DB_ID, collectionId: "models", documentId: ID.unique(), data: { name, whatsapp, instagram, portal_code: genPortalCode(), status: "Active", monthly_video_quota: 30, monthly_base_fee: 200, commission_rate: 0.005, payment_method: "", payment_details: "", total_paid: 0, created_at: nowISO() } });
  return doc<DbModel>(res);
}

export async function addModelVideo(modelId: string, videoUrl: string, caption: string, stoneId: string | null): Promise<DbVideo> {
  await ensureReady();
  const res = await getDbSvc().createDocument({ databaseId: DB_ID, collectionId: "videos", documentId: ID.unique(), data: { video_url: videoUrl, caption, stone_id: stoneId || "", published: false, model_id: modelId, status: "Pending", tap_count: 0, reserve_count: 0, sales_count: 0, sales_value: 0, commission_earned: 0, likes_count: 0, created_at: nowISO() } });
  return doc<DbVideo>(res);
}

export async function getModelVideos(modelId: string) {
  await ensureReady(); const db = getDbSvc();
  const res = await db.listDocuments({ databaseId: DB_ID, collectionId: "videos", queries: [Query.equal("model_id", modelId), Query.orderDesc("created_at")] });
  return Promise.all(res.documents.map(async (d) => {
    const v = doc<any>(d); let stone = null;
    if (v.stone_id) { try { stone = await db.getDocument({ databaseId: DB_ID, collectionId: "stones", documentId: v.stone_id }); } catch {} }
    return { ...v, stone_ref: stone?.ref || null, stone_status: stone?.status || null };
  }));
}

export async function getModelMonthlySummary(modelId: string) {
  await ensureReady(); const model = await getModelById(modelId);
  if (!model) return { approved_this_month: 0, base_earned: 0, commission_earned: 0, total_due: 0 };
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
  const res = await getDbSvc().listDocuments({ databaseId: DB_ID, collectionId: "videos", queries: [Query.equal("model_id", modelId), Query.equal("status", "Live")] });
  const approved = res.documents.filter((v: any) => v.created_at >= monthStart).length;
  const capped = Math.min(approved, model.monthly_video_quota);
  const baseEarned = capped * (model.monthly_base_fee / model.monthly_video_quota);
  const commission = res.documents.filter((v: any) => v.created_at >= monthStart).reduce((s: number, v: any) => s + (v.commission_earned || 0), 0);
  return { approved_this_month: approved, base_earned: baseEarned, commission_earned: commission, total_due: baseEarned + commission - model.total_paid };
}

export async function getModelPaymentReport(modelId: string) {
  await ensureReady(); const model = (await getModelById(modelId))!; const db = getDbSvc();
  const now = new Date(); const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const res = await db.listDocuments({ databaseId: DB_ID, collectionId: "videos", queries: [Query.equal("model_id", modelId), Query.equal("status", "Live"), Query.orderDesc("created_at")] });
  const videosThisMonth = [];
  for (const d of res.documents) {
    if (d.created_at >= monthStart) {
      const v = doc<any>(d); let stoneRef = "";
      if (v.stone_id) { try { stoneRef = (await db.getDocument({ databaseId: DB_ID, collectionId: "stones", documentId: v.stone_id })).ref; } catch {} }
      videosThisMonth.push({ id: v.id, caption: v.caption, created_at: v.created_at, sales_count: v.sales_count, sales_value: v.sales_value, commission_earned: v.commission_earned, stone_ref: stoneRef });
    }
  }
  const capped = Math.min(videosThisMonth.length, model.monthly_video_quota);
  const baseEarned = capped * (model.monthly_base_fee / model.monthly_video_quota);
  const commissionTotal = videosThisMonth.reduce((s: number, v: any) => s + (v.commission_earned || 0), 0);
  return { model, month, videos: videosThisMonth, base_earned: baseEarned, commission_total: commissionTotal, total_due: baseEarned + commissionTotal - model.total_paid };
}

export async function markModelPaid(modelId: string, amount: number): Promise<void> {
  await ensureReady(); const model = await getModelById(modelId); if (!model) return;
  await getDbSvc().updateDocument({ databaseId: DB_ID, collectionId: "models", documentId: modelId, data: { total_paid: model.total_paid + amount } });
}

export async function approveModelVideo(id: string): Promise<DbVideo | null> {
  await ensureReady(); try { await getDbSvc().updateDocument({ databaseId: DB_ID, collectionId: "videos", documentId: id, data: { status: "Live", published: true } }); return doc<DbVideo>(await getDbSvc().getDocument({ databaseId: DB_ID, collectionId: "videos", documentId: id })); } catch { return null; }
}

export async function declineModelVideo(id: string): Promise<boolean> { await ensureReady(); try { await getDbSvc().deleteDocument({ databaseId: DB_ID, collectionId: "videos", documentId: id }); return true; } catch { return false; } }

export async function incrementTapCount(id: string): Promise<void> {
  await ensureReady(); try { const v = await getDbSvc().getDocument({ databaseId: DB_ID, collectionId: "videos", documentId: id }); await getDbSvc().updateDocument({ databaseId: DB_ID, collectionId: "videos", documentId: id, data: { tap_count: (v.tap_count || 0) + 1 } }); } catch {}
}

/* ── Portal Authentication ── */

export async function authenticateTrader(code: string, phone: string): Promise<DbTrader | null> {
  const trader = await getTraderByPortalCode(code);
  if (!trader) return null;
  const normalise = (s: string) => s.replace(/[^0-9+]/g, "");
  if (normalise(trader.whatsapp) && normalise(phone) && normalise(trader.whatsapp) !== normalise(phone)) return null;
  return trader;
}

export async function authenticateModel(code: string, phone: string): Promise<DbModel | null> {
  const model = await getModelByPortalCode(code);
  if (!model) return null;
  const normalise = (s: string) => s.replace(/[^0-9+]/g, "");
  if (normalise(model.whatsapp) && normalise(phone) && normalise(model.whatsapp) !== normalise(phone)) return null;
  return model;
}

/* ── Multi-photo support ── */

export async function savePhotos(files: File[]): Promise<string[]> {
  const urls: string[] = [];
  for (const file of files.slice(0, 6)) {
    const buffer = Buffer.from(await file.arrayBuffer());
    const url = await savePhoto(file.name, buffer);
    urls.push(url);
  }
  return urls;
}

export function parsePhotos(photoField: string): string[] {
  if (!photoField) return [];
  return photoField.split("|").filter(u => u.length > 10 && u.startsWith("http"));
}

/* ── Licence Document Storage ── */

export async function saveLicenceDoc(filename: string, buffer: Buffer): Promise<string> {
  await ensureReady();
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const file = InputFile.fromBuffer(buffer, `${Date.now()}_${safeName}`);
  const res = await getStorage().createFile({ bucketId: LICENCE_DOCS_BUCKET, fileId: ID.unique(), file });
  return getLicenceUrl(res.$id);
}

export function getLicenceDocUrl(fileId: string): string {
  return getLicenceUrl(fileId);
}

/* ── Stone sales count ── */

export async function getStoneSalesCount(stoneId: string): Promise<number> {
  await ensureReady();
  const res = await getDbSvc().listDocuments({ databaseId: DB_ID, collectionId: "orders", queries: [Query.equal("stone_id", stoneId), Query.equal("status", "Paid")] });
  return res.total;
}

/* ── Seed on import ── */
seedIfEmpty().catch(() => {});
