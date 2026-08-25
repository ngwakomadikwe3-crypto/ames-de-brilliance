import Database from "better-sqlite3";
import path from "path";
import fs from "fs";

const DATA_DIR = path.join(process.cwd(), "data");
const DB_PATH = path.join(DATA_DIR, "ames.db");

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");
  initTables(_db);
  return _db;
}

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
  id: number; name: string; whatsapp: string; licence: string;
  portal_code: string; email: string; status: "Pending" | "Active" | "Declined";
  company: string; country: string; licence_photo: string;
  created_at: string;
}

export interface DbReport {
  id: number; trader_id: number; period_start: string; period_end: string;
  report_date: string; summary: string; data: string; created_at: string;
}

export interface DbStoneStatusLog {
  id: number; stone_id: string; status: string; reason: string; changed_at: string;
}

export interface DbStone {
  id: string; ref: string;
  stone_type: "rough" | "polished";
  shape: string; carat: number; color: string;
  clarity: string; cut: string; certification: string;
  category: string; crystal_form: string; clarity_notes: string;
  kp_status: boolean;
  price: number | null;
  status: "Available" | "Reserved" | "Sold"; photo: string;
  source: "Own stock" | "Consigned"; trader_id: number | null;
  commission: number; sale_price: number | null; photo_path: string | null;
  listing_category: "Rough" | "Polished" | "Jewelry";
  created_at: string;
}

export interface DbOrder {
  id: number; stone_id: string; stone_ref: string;
  buyer_name: string; buyer_whatsapp: string; price: number | null;
  status: string; created_at: string;
}

export interface DbVideo {
  id: number; video_url: string; caption: string;
  stone_id: string | null; published: number;
  model_id: number | null; status: string; tap_count: number;
  reserve_count: number; sales_count: number; sales_value: number; commission_earned: number;
  created_at: string;
}

export interface DbModel {
  id: number; name: string; whatsapp: string; instagram: string;
  portal_code: string; status: string; created_at: string;
  monthly_video_quota: number; monthly_base_fee: number; commission_rate: number;
  payment_method: string; payment_details: string; total_paid: number;
}

/* ── Placeholder ── */

const PLACEHOLDER = "data:image/svg+xml," + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect fill="#e5e7eb" width="400" height="400"/><text x="200" y="195" font-family="system-ui,sans-serif" font-size="13" fill="#9ca3af" text-anchor="middle">Photo of actual stone</text><text x="200" y="215" font-family="system-ui,sans-serif" font-size="13" fill="#9ca3af" text-anchor="middle">on request</text></svg>'
);

/* ── Init ── */

function initTables(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS requests (
      id TEXT PRIMARY KEY, date TEXT NOT NULL, buyer_name TEXT NOT NULL DEFAULT '',
      company TEXT NOT NULL, country TEXT NOT NULL DEFAULT '', contact TEXT NOT NULL,
      type TEXT NOT NULL, shape TEXT NOT NULL, carat_min TEXT NOT NULL DEFAULT '',
      carat_max TEXT NOT NULL DEFAULT '', color TEXT NOT NULL, clarity TEXT NOT NULL,
      certification TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '',
      kp_licence TEXT NOT NULL DEFAULT '', kp_country TEXT NOT NULL DEFAULT '',
      consent INTEGER NOT NULL DEFAULT 0, declaration INTEGER NOT NULL DEFAULT 0,
      consent_timestamp TEXT NOT NULL DEFAULT '',
      mandate TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'New',
      created_at TEXT NOT NULL,
      offer_text TEXT NOT NULL DEFAULT '', offer_timestamp TEXT NOT NULL DEFAULT ''
    );
    CREATE TABLE IF NOT EXISTS traders (
      id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL,
      whatsapp TEXT NOT NULL DEFAULT '', licence TEXT NOT NULL DEFAULT '',
      portal_code TEXT NOT NULL DEFAULT '', email TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'Pending',
      company TEXT NOT NULL DEFAULT '', country TEXT NOT NULL DEFAULT '',
      licence_photo TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trader_id INTEGER NOT NULL,
      period_start TEXT NOT NULL, period_end TEXT NOT NULL,
      report_date TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      data TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      FOREIGN KEY (trader_id) REFERENCES traders(id)
    );
    CREATE TABLE IF NOT EXISTS stone_status_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      stone_id TEXT NOT NULL,
      status TEXT NOT NULL,
      reason TEXT NOT NULL DEFAULT '',
      changed_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS stones (
      id TEXT PRIMARY KEY, ref TEXT NOT NULL,
      stone_type TEXT NOT NULL DEFAULT 'polished',
      shape TEXT NOT NULL, carat REAL NOT NULL, color TEXT NOT NULL,
      clarity TEXT NOT NULL DEFAULT '', cut TEXT NOT NULL DEFAULT '',
      certification TEXT NOT NULL DEFAULT '',
      category TEXT NOT NULL DEFAULT '', crystal_form TEXT NOT NULL DEFAULT '',
      clarity_notes TEXT NOT NULL DEFAULT '',
      kp_status INTEGER NOT NULL DEFAULT 0,
      price REAL, status TEXT NOT NULL DEFAULT 'Available',      photo TEXT NOT NULL DEFAULT '', source TEXT NOT NULL DEFAULT 'Own stock', trader_id INTEGER, commission REAL NOT NULL DEFAULT 0, sale_price REAL,
      photo_path TEXT, listing_category TEXT NOT NULL DEFAULT 'Polished', created_at TEXT NOT NULL,
      FOREIGN KEY (trader_id) REFERENCES traders(id)
    );
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      stone_id TEXT NOT NULL,
      stone_ref TEXT NOT NULL,
      buyer_name TEXT NOT NULL DEFAULT '',
      buyer_whatsapp TEXT NOT NULL DEFAULT '',
      price REAL,
      status TEXT NOT NULL DEFAULT 'Reserved',
      created_at TEXT NOT NULL
    );
  `);
  // Migrate: add listing_category column if missing
  const cols = db.prepare("PRAGMA table_info(stones)").all() as { name: string }[];
  if (!cols.some(c => c.name === "listing_category")) {
    db.exec("ALTER TABLE stones ADD COLUMN listing_category TEXT NOT NULL DEFAULT 'Polished'");
    // Backfill rough stones
    db.exec("UPDATE stones SET listing_category = 'Rough' WHERE stone_type = 'rough'");
  }
  // Migrate: add buyer/price columns to orders if missing
  const orderCols = db.prepare("PRAGMA table_info(orders)").all() as { name: string }[];
  if (!orderCols.some(c => c.name === "buyer_name")) {
    db.exec("ALTER TABLE orders ADD COLUMN buyer_name TEXT NOT NULL DEFAULT ''");
  }
  if (!orderCols.some(c => c.name === "buyer_whatsapp")) {
    db.exec("ALTER TABLE orders ADD COLUMN buyer_whatsapp TEXT NOT NULL DEFAULT ''");
  }
  if (!orderCols.some(c => c.name === "price")) {
    db.exec("ALTER TABLE orders ADD COLUMN price REAL");
  }
  // Migrate: add portal_code/email to traders if missing
  const traderCols = db.prepare("PRAGMA table_info(traders)").all() as { name: string }[];
  if (!traderCols.some(c => c.name === "portal_code")) {
    db.exec("ALTER TABLE traders ADD COLUMN portal_code TEXT NOT NULL DEFAULT ''");
    // Backfill existing traders with random codes
    const traders = db.prepare("SELECT id FROM traders WHERE portal_code = ''").all() as { id: number }[];
    for (const t of traders) {
      db.prepare("UPDATE traders SET portal_code = ? WHERE id = ?").run(genPortalCode(), t.id);
    }
  }
  if (!traderCols.some(c => c.name === "email")) {
    db.exec("ALTER TABLE traders ADD COLUMN email TEXT NOT NULL DEFAULT ''");
  }
  if (!traderCols.some(c => c.name === "status")) {
    db.exec("ALTER TABLE traders ADD COLUMN status TEXT NOT NULL DEFAULT 'Pending'");
    // Backfill existing traders with portal codes as Active
    db.exec("UPDATE traders SET status = 'Active' WHERE portal_code != ''");
  }
  if (!traderCols.some(c => c.name === "company")) {
    db.exec("ALTER TABLE traders ADD COLUMN company TEXT NOT NULL DEFAULT ''");
  }
  if (!traderCols.some(c => c.name === "country")) {
    db.exec("ALTER TABLE traders ADD COLUMN country TEXT NOT NULL DEFAULT ''");
  }
  if (!traderCols.some(c => c.name === "licence_photo")) {
    db.exec("ALTER TABLE traders ADD COLUMN licence_photo TEXT NOT NULL DEFAULT ''");
  }
  // Migrate: create reports table if missing
  const reportTables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='reports'").all();
  if (reportTables.length === 0) {
    db.exec(`CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      trader_id INTEGER NOT NULL,
      period_start TEXT NOT NULL, period_end TEXT NOT NULL,
      report_date TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      data TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL,
      FOREIGN KEY (trader_id) REFERENCES traders(id)
    )`);
  }
  // Migrate: create videos table if missing
  const videoTables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='videos'").all();
  if (videoTables.length === 0) {
    db.exec(`CREATE TABLE IF NOT EXISTS videos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      video_url TEXT NOT NULL,
      caption TEXT NOT NULL DEFAULT '',
      stone_id TEXT,
      published INTEGER NOT NULL DEFAULT 0,
      model_id INTEGER,
      status TEXT NOT NULL DEFAULT 'Live',
      tap_count INTEGER NOT NULL DEFAULT 0,
      reserve_count INTEGER NOT NULL DEFAULT 0,
      sales_count INTEGER NOT NULL DEFAULT 0,
      sales_value REAL NOT NULL DEFAULT 0,
      commission_earned REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (stone_id) REFERENCES stones(id),
      FOREIGN KEY (model_id) REFERENCES models(id)
    )`);
  } else {
    // Migrate: add model_id, status, tap_count to videos if missing
    const vCols = db.prepare("PRAGMA table_info(videos)").all() as { name: string }[];
    if (!vCols.some(c => c.name === "model_id")) db.exec("ALTER TABLE videos ADD COLUMN model_id INTEGER");
    if (!vCols.some(c => c.name === "status")) db.exec("ALTER TABLE videos ADD COLUMN status TEXT NOT NULL DEFAULT 'Live'");
    if (!vCols.some(c => c.name === "tap_count")) db.exec("ALTER TABLE videos ADD COLUMN tap_count INTEGER NOT NULL DEFAULT 0");
    if (!vCols.some(c => c.name === "reserve_count")) db.exec("ALTER TABLE videos ADD COLUMN reserve_count INTEGER NOT NULL DEFAULT 0");
    if (!vCols.some(c => c.name === "sales_count")) db.exec("ALTER TABLE videos ADD COLUMN sales_count INTEGER NOT NULL DEFAULT 0");
    if (!vCols.some(c => c.name === "sales_value")) db.exec("ALTER TABLE videos ADD COLUMN sales_value REAL NOT NULL DEFAULT 0");
    if (!vCols.some(c => c.name === "commission_earned")) db.exec("ALTER TABLE videos ADD COLUMN commission_earned REAL NOT NULL DEFAULT 0");
  }
  // Migrate: create models table if missing
  const modelTables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='models'").all();
  if (modelTables.length === 0) {
    db.exec(`CREATE TABLE IF NOT EXISTS models (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      whatsapp TEXT NOT NULL DEFAULT '',
      instagram TEXT NOT NULL DEFAULT '',
      portal_code TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'Active',
      monthly_video_quota INTEGER NOT NULL DEFAULT 30,
      monthly_base_fee REAL NOT NULL DEFAULT 200,
      commission_rate REAL NOT NULL DEFAULT 0.005,
      payment_method TEXT NOT NULL DEFAULT '',
      payment_details TEXT NOT NULL DEFAULT '',
      total_paid REAL NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    )`);
  } else {
    const mCols = db.prepare("PRAGMA table_info(models)").all() as { name: string }[];
    if (!mCols.some(c => c.name === "monthly_video_quota")) db.exec("ALTER TABLE models ADD COLUMN monthly_video_quota INTEGER NOT NULL DEFAULT 30");
    if (!mCols.some(c => c.name === "monthly_base_fee")) db.exec("ALTER TABLE models ADD COLUMN monthly_base_fee REAL NOT NULL DEFAULT 200");
    if (!mCols.some(c => c.name === "commission_rate")) db.exec("ALTER TABLE models ADD COLUMN commission_rate REAL NOT NULL DEFAULT 0.005");
    if (!mCols.some(c => c.name === "payment_method")) db.exec("ALTER TABLE models ADD COLUMN payment_method TEXT NOT NULL DEFAULT ''");
    if (!mCols.some(c => c.name === "payment_details")) db.exec("ALTER TABLE models ADD COLUMN payment_details TEXT NOT NULL DEFAULT ''");
    if (!mCols.some(c => c.name === "total_paid")) db.exec("ALTER TABLE models ADD COLUMN total_paid REAL NOT NULL DEFAULT 0");
  }
  const count = db.prepare("SELECT COUNT(*) as c FROM stones").get() as { c: number };
  if (count.c === 0) seedData(db);
}

function seedData(db: Database.Database) {
  const now = new Date().toISOString();
  const insertTrader = db.prepare("INSERT INTO traders (name, whatsapp, licence, portal_code, status, created_at) VALUES (?, ?, ?, ?, 'Active', ?)");
  const insertStone = db.prepare(
    `INSERT INTO stones (id, ref, stone_type, shape, carat, color, clarity, cut, certification,
     category, crystal_form, clarity_notes, kp_status, price, status, photo, source,
     trader_id, commission, sale_price, photo_path, listing_category, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const seed = [
    // ── Rough stones ──
    {
      id: "1", ref: "ADB-001", stone_type: "rough", shape: "Octahedron", carat: 12.45,
      color: "Near colourless", clarity: "", cut: "", cert: "",
      category: "Sawable", crystal_form: "Octahedron", clarity_notes: "Clean octahedron, minimal inclusions visible under 10x",
      kp: 1, price: null, photo: "", source: "Own stock", comm: 0, lc: "Rough",
    },
    {
      id: "2", ref: "ADB-002", stone_type: "rough", shape: "Macle", carat: 8.30,
      color: "Light brown", clarity: "", cut: "", cert: "",
      category: "Near-gem", crystal_form: "Macle", clarity_notes: "Twinned crystal, some feather inclusions along twin plane",
      kp: 1, price: null, photo: "", source: "Consigned", comm: 5, lc: "Rough",
      tn: "Kgosi Molefe", tw: "+267 71 555 0101", tl: "BDMR-089",
    },
    {
      id: "3", ref: "ADB-003", stone_type: "rough", shape: "Irregular", carat: 3.20,
      color: "Greyish", clarity: "", cut: "", cert: "",
      category: "Industrial", crystal_form: "Irregular", clarity_notes: "Fractured surface, suitable for industrial cutting only",
      kp: 0, price: null, photo: "", source: "Own stock", comm: 0, lc: "Rough",
    },
    // ── Polished stones ──
    {
      id: "4", ref: "ADB-004", stone_type: "polished", shape: "Round Brilliant", carat: 1.05,
      color: "G", clarity: "VS1", cut: "Excellent", cert: "GIA",
      category: "", crystal_form: "", clarity_notes: "",
      kp: 0, price: 8900, photo: "", source: "Own stock", comm: 0, lc: "Polished",
    },
    {
      id: "5", ref: "ADB-005", stone_type: "polished", shape: "Oval", carat: 1.72,
      color: "D", clarity: "IF", cut: "Excellent", cert: "GIA",
      category: "", crystal_form: "", clarity_notes: "",
      kp: 0, price: 24500, photo: "", source: "Consigned", comm: 8, lc: "Polished",
      tn: "Ravi Patel", tw: "+91 98765 43210", tl: "GJEPC-4421",
    },
  ];

  const tx = db.transaction(() => {
    for (const s of seed) {
      let traderId: number | null = null;
      if (s.source === "Consigned" && (s as any).tn) {
        const info = insertTrader.run((s as any).tn, (s as any).tw || "", (s as any).tl || "", genPortalCode(), now);
        traderId = info.lastInsertRowid as number;
      }
      insertStone.run(
        s.id, s.ref, s.stone_type, s.shape, s.carat, s.color, s.clarity, s.cut, s.cert,
        s.category, s.crystal_form, s.clarity_notes, s.kp,
        s.price, "Available", s.photo, s.source,
        traderId, s.comm, null, null, (s as any).lc || "Polished", now
      );
    }
  });
  tx();

  // Always seed test requests if table is empty
  const reqCount = (db.prepare("SELECT COUNT(*) as c FROM requests").get() as { c: number }).c;
  if (reqCount === 0) {
    const ins = db.prepare(
      "INSERT INTO requests (id, date, buyer_name, company, country, contact, type, shape, carat_min, carat_max, color, clarity, certification, notes, kp_licence, kp_country, consent, declaration, consent_timestamp, mandate, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    );
    const testRequests = [
      {
        id: "SR-2026-0001", date: "2026-08-22", buyer_name: "James Mokgosi", company: "Kalahari Diamonds Pty", country: "Botswana",
        contact: "+267 71 234 567", type: "Polished", shape: "Round Brilliant", carat_min: "1.00", carat_max: "3.00",
        color: "G", clarity: "VS1", certification: "GIA", notes: "Need by end of Q3. Prefer triple-excellent cut.",
        status: "New",
        mandate: "SOURCING REQUEST\n\nBuyer: Kalahari Diamonds Pty (Botswana)\nContact: +267 71 234 567\nType: Polished\n\nRequirement: Round Brilliant 1.00\u20133.00ct G VS1 GIA\n\nNotes: Need by end of Q3. Prefer triple-excellent cut.",
      },
      {
        id: "SR-2026-0002", date: "2026-08-21", buyer_name: "Priya Sharma", company: "Surat Diamonds Ltd", country: "India",
        contact: "+91 98765 43210", type: "Polished", shape: "Oval", carat_min: "0.50", carat_max: "1.00",
        color: "D", clarity: "IF", certification: "GIA", notes: "Certified stones only. Minimum VS2 clarity.",
        status: "Sourcing",
        mandate: "SOURCING REQUEST\n\nBuyer: Surat Diamonds Ltd (India)\nContact: +91 98765 43210\nType: Polished\n\nRequirement: Oval 0.50\u20131.00ct D IF GIA\n\nNotes: Certified stones only. Minimum VS2 clarity.",
      },
      {
        id: "SR-2026-0003", date: "2026-08-20", buyer_name: "David Van Houten", company: "Antwerp Rough Trading NV", country: "Belgium",
        contact: "+32 471 234 567", type: "Rough", shape: "", carat_min: "5.00", carat_max: "15.00",
        color: "Near colourless", clarity: "", certification: "None", notes: "Sawable to Near-gem. KP licence on file.",
        kp_licence: "KP-BE-2026-0142", kp_country: "Belgium",
        status: "Quoted",
        mandate: "SOURCING REQUEST\n\nBuyer: Antwerp Rough Trading NV (Belgium)\nContact: +32 471 234 567\nType: Rough\n\nRequirement: 5.00\u201315.00ct Near colourless\n\nNotes: Sawable to Near-gem. KP licence on file.\n\nKP Licence: KP-BE-2026-0142 (Belgium)",
      },
    ];
    for (const r of testRequests) {
      ins.run(r.id, r.date, r.buyer_name, r.company, r.country, r.contact, r.type, r.shape,
        r.carat_min, r.carat_max, r.color, r.clarity, r.certification, r.notes,
        r.kp_licence || "", r.kp_country || "", 1, 0, now, r.mandate, r.status, now);
    }
  }
}

/* ── Exports ── */

export const STONE_PLACEHOLDER = PLACEHOLDER;

/* ── Request Queries ── */

export function getAllRequests(): DbRequest[] {
  return getDb().prepare("SELECT * FROM requests ORDER BY created_at DESC").all() as DbRequest[];
}

export function getRequestById(id: string): DbRequest | undefined {
  return getDb().prepare("SELECT * FROM requests WHERE id = ?").get(id) as DbRequest | undefined;
}

export function addRequest(data: {
  buyer_name: string; company: string; country: string; contact: string;
  type: string; shape: string; carat_min: string; carat_max: string;
  color: string; clarity: string; certification: string; notes: string;
  kp_licence?: string; kp_country?: string; consent?: boolean; declaration?: boolean; consent_timestamp?: string;
}): DbRequest {
  const db = getDb();
  const now = new Date();
  const count = (db.prepare("SELECT COUNT(*) as c FROM requests").get() as { c: number }).c;
  const id = `SR-${now.getFullYear()}-${String(count + 1).padStart(4, "0")}`;
  const date = now.toISOString().split("T")[0];
  const cr = data.carat_min === data.carat_max ? `${data.carat_min}ct` : `${data.carat_min}\u2013${data.carat_max}ct`;
  const cert = data.certification === "None" ? "" : ` ${data.certification}`;
  const lines = [
    "SOURCING REQUEST", "",
    `Buyer: ${data.company}${data.country ? ` (${data.country})` : ""}`,
    `Contact: ${data.contact}`, `Type: ${data.type}`, "",
    `Requirement: ${data.shape} ${cr} ${data.color} ${data.clarity}${cert}`,
  ];
  if (data.notes) lines.push("", `Notes: ${data.notes}`);
  if (data.kp_licence) lines.push("", `KP Licence: ${data.kp_licence} (${data.kp_country})`);

  db.prepare(
    "INSERT INTO requests (id, date, buyer_name, company, country, contact, type, shape, carat_min, carat_max, color, clarity, certification, notes, kp_licence, kp_country, consent, declaration, consent_timestamp, mandate, status, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'New', ?)"
  ).run(id, date, data.buyer_name, data.company, data.country, data.contact, data.type, data.shape, data.carat_min, data.carat_max, data.color, data.clarity, data.certification, data.notes, data.kp_licence || "", data.kp_country || "", data.consent ? 1 : 0, data.declaration ? 1 : 0, data.consent_timestamp || now.toISOString(), lines.join("\n"), now.toISOString());

  return getRequestById(id)!;
}

export function updateRequest(id: string, updates: Partial<Pick<DbRequest, "status" | "notes" | "mandate">>): DbRequest | null {
  const db = getDb();
  const existing = getRequestById(id);
  if (!existing) return null;
  const fields: string[] = [];
  const values: unknown[] = [];
  if (updates.status !== undefined) { fields.push("status = ?"); values.push(updates.status); }
  if (updates.notes !== undefined) { fields.push("notes = ?"); values.push(updates.notes); }
  if (updates.mandate !== undefined) { fields.push("mandate = ?"); values.push(updates.mandate); }
  if (fields.length === 0) return existing;
  values.push(id);
  db.prepare(`UPDATE requests SET ${fields.join(", ")} WHERE id = ?`).run(...values);
  return getRequestById(id)!;
}

export function updateRequestOffer(id: string, offerText: string): DbRequest | null {
  const db = getDb();
  const existing = getRequestById(id);
  if (!existing) return null;
  db.prepare("UPDATE requests SET offer_text = ?, offer_timestamp = ?, status = 'Quoted' WHERE id = ?")
    .run(offerText, new Date().toISOString(), id);
  return getRequestById(id)!;
}

/* ── Trader Queries ── */

function genPortalCode(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let code = "";
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export function getAllTraders(): DbTrader[] {
  return getDb().prepare("SELECT * FROM traders ORDER BY CASE status WHEN 'Pending' THEN 0 WHEN 'Active' THEN 1 ELSE 2 END, name").all() as DbTrader[];
}

export function getTraderByPortalCode(code: string): DbTrader | undefined {
  return getDb().prepare("SELECT * FROM traders WHERE portal_code = ?").get(code) as DbTrader | undefined;
}

export function getOrCreateTrader(name: string, whatsapp: string, licence: string): number {
  const db = getDb();
  const existing = db.prepare("SELECT id FROM traders WHERE name = ?").get(name) as { id: number } | undefined;
  if (existing) return existing.id;
  return db.prepare("INSERT INTO traders (name, whatsapp, licence, portal_code, email, status, created_at) VALUES (?, ?, ?, ?, '', 'Active', ?)")
    .run(name, whatsapp, licence, genPortalCode(), new Date().toISOString()).lastInsertRowid as number;
}

export function getTraderById(id: number): DbTrader | undefined {
  return getDb().prepare("SELECT * FROM traders WHERE id = ?").get(id) as DbTrader | undefined;
}

export function addTraderApplication(data: { name: string; company: string; country: string; whatsapp: string; email: string; licence: string; licence_photo: string }): DbTrader {
  const db = getDb();
  const now = new Date().toISOString();
  const info = db.prepare(
    `INSERT INTO traders (name, company, country, whatsapp, email, licence, licence_photo, portal_code, status, created_at) VALUES (?, ?, ?, ?, ?, ?, '', '', 'Pending', ?)`
  ).run(data.name, data.company, data.country, data.whatsapp, data.email, data.licence, data.licence_photo, now);
  return db.prepare("SELECT * FROM traders WHERE id = ?").get(info.lastInsertRowid) as DbTrader;
}

export function approveTrader(id: number): DbTrader | null {
  const db = getDb();
  const existing = getTraderById(id);
  if (!existing) return null;
  const code = existing.portal_code || genPortalCode();
  db.prepare("UPDATE traders SET status = 'Active', portal_code = ? WHERE id = ?").run(code, id);
  return getTraderById(id)!;
}

export function declineTrader(id: number): DbTrader | null {
  const db = getDb();
  const existing = getTraderById(id);
  if (!existing) return null;
  db.prepare("UPDATE traders SET status = 'Declined' WHERE id = ?").run(id);
  return getTraderById(id)!;
}

/* ── Report Queries ── */

export function getTraderReports(traderId: number): DbReport[] {
  return getDb().prepare("SELECT * FROM reports WHERE trader_id = ? ORDER BY report_date DESC").all(traderId) as DbReport[];
}

export function getAllReports(): (DbReport & { trader_name: string })[] {
  return getDb().prepare(`
    SELECT r.*, t.name as trader_name
    FROM reports r LEFT JOIN traders t ON r.trader_id = t.id
    ORDER BY r.report_date DESC
  `).all() as any[];
}

export function addReport(traderId: number, periodStart: string, periodEnd: string, summary: string, data: object): DbReport {
  const db = getDb();
  const now = new Date().toISOString();
  const info = db.prepare(
    `INSERT INTO reports (trader_id, period_start, period_end, report_date, summary, data, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).run(traderId, periodStart, periodEnd, now, summary, JSON.stringify(data), now);
  return db.prepare("SELECT * FROM reports WHERE id = ?").get(info.lastInsertRowid) as DbReport;
}

export function generateWeeklyReport(traderId: number): DbReport | null {
  const db = getDb();
  const trader = getTraderById(traderId);
  if (!trader) return null;

  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const periodStart = weekAgo.toISOString();
  const periodEnd = now.toISOString();

  // Get all trader's stones
  const allStones = db.prepare(
    `SELECT s.*, t.name as trader_name FROM stones s LEFT JOIN traders t ON s.trader_id = t.id WHERE s.trader_id = ?`
  ).all(traderId) as any[];

  // Currently live
  const live = allStones.filter(s => s.status === "Available");
  // New reserves this week
  const reserved = allStones.filter(s => s.status === "Reserved" &&
    db.prepare("SELECT 1 FROM stone_status_log WHERE stone_id = ? AND status = 'Reserved' AND changed_at >= ?").get(s.id, periodStart));
  // Sold this week
  const sold = allStones.filter(s => s.status === "Sold" &&
    db.prepare("SELECT 1 FROM stone_status_log WHERE stone_id = ? AND status = 'Sold' AND changed_at >= ?").get(s.id, periodStart));
  // Pending
  const pending = allStones.filter(s => s.status === "Pending");
  // Rejected
  const rejected = allStones.filter(s => s.status === "Rejected");

  // Commission calc
  const soldWithCommission = sold.map(s => {
    const commissionPct = s.commission || 0;
    const salePrice = s.sale_price || 0;
    const commissionAmount = salePrice * (commissionPct / 100);
    return { ref: s.ref, shape: s.shape, carat: s.carat, color: s.color, clarity: s.clarity,
      certification: s.certification, sale_price: salePrice, commission_pct: commissionPct, commission_amount: commissionAmount };
  });
  const totalCommission = soldWithCommission.reduce((sum, s) => sum + s.commission_amount, 0);
  const totalRevenue = soldWithCommission.reduce((sum, s) => sum + s.sale_price, 0);

  const summary = [
    `Weekly Report for ${trader.name}`,
    `Period: ${weekAgo.toISOString().split("T")[0]} to ${now.toISOString().split("T")[0]}`,
    ``,
    `Live items: ${live.length}`,
    `New reserves this week: ${reserved.length}`,
    `Items sold this week: ${sold.length}`,
    `Total commission earned: $${totalCommission.toLocaleString()}`,
    ``,
    `Full status list:`,
    `  Live: ${live.map(s => s.ref).join(", ") || "none"}`,
    `  Reserved: ${reserved.map(s => s.ref).join(", ") || "none"}`,
    `  Sold: ${sold.map(s => s.ref).join(", ") || "none"}`,
    `  Pending: ${pending.map(s => s.ref).join(", ") || "none"}`,
  ].join("\n");

  const reportData = {
    period: { start: weekAgo.toISOString().split("T")[0], end: now.toISOString().split("T")[0] },
    live: live.map(s => ({ ref: s.ref, shape: s.shape, carat: s.carat, color: s.color, clarity: s.clarity })),
    reserved: reserved.map(s => ({ ref: s.ref, shape: s.shape, carat: s.carat, color: s.color, clarity: s.clarity })),
    sold: soldWithCommission,
    total_commission: totalCommission,
    total_revenue: totalRevenue,
    full_status: {
      live: live.map(s => s.ref),
      reserved: reserved.map(s => s.ref),
      sold: sold.map(s => s.ref),
      pending: pending.map(s => s.ref),
      rejected: rejected.map(s => s.ref),
    },
  };

  return addReport(traderId, periodStart, periodEnd, summary, reportData);
}

/* ── Stone Queries ── */

const STONE_COLS = "s.*, t.name as trader_name, t.whatsapp as trader_whatsapp, t.licence as trader_licence";

export function getAllStones() {
  return getDb().prepare(`SELECT ${STONE_COLS} FROM stones s LEFT JOIN traders t ON s.trader_id = t.id ORDER BY s.created_at DESC`).all() as any[];
}

export function getAvailableStones() {
  return getDb().prepare(`SELECT ${STONE_COLS} FROM stones s LEFT JOIN traders t ON s.trader_id = t.id WHERE s.status = 'Available' ORDER BY s.created_at DESC`).all() as any[];
}

export function getStoneById(id: string) {
  return getDb().prepare(`SELECT ${STONE_COLS} FROM stones s LEFT JOIN traders t ON s.trader_id = t.id WHERE s.id = ?`).get(id) as any;
}

export function addStone(data: {
  stone_type: string; shape: string; carat: number; color: string;
  clarity: string; cut: string; certification: string;
  category: string; crystal_form: string; clarity_notes: string;
  kp_status: boolean; price: number | null; status: string; photo: string;
  source: string; trader_id: number | null; commission: number; photo_path: string | null;
  listing_category?: string;
}) {
  const db = getDb();
  const now = new Date().toISOString();
  const count = (db.prepare("SELECT COUNT(*) as c FROM stones").get() as { c: number }).c;
  const id = String(count + 1);
  const ref = `ADB-${String(count + 1).padStart(3, "0")}`;
  // Hard rule: photo only published if it's the actual stone; otherwise use placeholder
  const photo = data.photo || "";
  db.prepare(
    `INSERT INTO stones (id, ref, stone_type, shape, carat, color, clarity, cut, certification,
     category, crystal_form, clarity_notes, kp_status, price, status, photo, source,
     trader_id, commission, sale_price, photo_path, listing_category, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)`
  ).run(id, ref, data.stone_type, data.shape, data.carat, data.color, data.clarity, data.cut,
    data.certification, data.category, data.crystal_form, data.clarity_notes, data.kp_status ? 1 : 0,
    data.price, data.status, photo, data.source, data.trader_id, data.commission, data.photo_path, data.listing_category || 'Polished', now);
  return getStoneById(id);
}

export function updateStone(id: string, updates: Partial<Pick<DbStone, "status" | "sale_price" | "price" | "photo" | "photo_path" | "shape" | "carat" | "color" | "clarity" | "cut" | "certification" | "listing_category">>) {
  const db = getDb();
  const existing = getStoneById(id);
  if (!existing) return null;
  const fields: string[] = [];
  const values: unknown[] = [];
  if (updates.status !== undefined) { fields.push("status = ?"); values.push(updates.status); }
  if (updates.sale_price !== undefined) { fields.push("sale_price = ?"); values.push(updates.sale_price); }
  if (updates.price !== undefined) { fields.push("price = ?"); values.push(updates.price); }
  if (updates.photo !== undefined) { fields.push("photo = ?"); values.push(updates.photo); }
  if (updates.photo_path !== undefined) { fields.push("photo_path = ?"); values.push(updates.photo_path); }
  if (updates.shape !== undefined) { fields.push("shape = ?"); values.push(updates.shape); }
  if (updates.carat !== undefined) { fields.push("carat = ?"); values.push(updates.carat); }
  if (updates.color !== undefined) { fields.push("color = ?"); values.push(updates.color); }
  if (updates.clarity !== undefined) { fields.push("clarity = ?"); values.push(updates.clarity); }
  if (updates.cut !== undefined) { fields.push("cut = ?"); values.push(updates.cut); }
  if (updates.certification !== undefined) { fields.push("certification = ?"); values.push(updates.certification); }
  if (updates.listing_category !== undefined) { fields.push("listing_category = ?"); values.push(updates.listing_category); }
  if (fields.length === 0) return existing;
  values.push(id);
  db.prepare(`UPDATE stones SET ${fields.join(", ")} WHERE id = ?`).run(...values);
  // Log status change
  if (updates.status !== undefined && updates.status !== existing.status) {
    db.prepare("INSERT INTO stone_status_log (stone_id, status, reason, changed_at) VALUES (?, ?, '', ?)")
      .run(id, updates.status, new Date().toISOString());
  }
  // Track sales on model-sourced videos
  if (updates.status === "Sold" && existing.status !== "Sold") {
    const salePrice = updates.sale_price ?? existing.sale_price ?? 0;
    db.prepare(`
      UPDATE videos SET
        sales_count = sales_count + 1,
        sales_value = sales_value + ?,
        commission_earned = commission_earned + ?
      WHERE stone_id = ? AND model_id IS NOT NULL
    `).run(salePrice, salePrice * 0.005, id);
  }
  return getStoneById(id);
}

export function approveStone(id: string, edits: Partial<Pick<DbStone, "shape" | "carat" | "color" | "clarity" | "cut" | "certification" | "price" | "listing_category">>) {
  const db = getDb();
  const fields: string[] = ["status = ?"];
  const values: unknown[] = ["Available"];
  for (const [k, v] of Object.entries(edits)) {
    if (v !== undefined) { fields.push(`${k} = ?`); values.push(v); }
  }
  values.push(id);
  db.prepare(`UPDATE stones SET ${fields.join(", ")} WHERE id = ?`).run(...values);
  db.prepare("INSERT INTO stone_status_log (stone_id, status, reason, changed_at) VALUES (?, 'Available', 'Approved', ?)")
    .run(id, new Date().toISOString());
  return getStoneById(id);
}

export function rejectStone(id: string, reason: string) {
  const db = getDb();
  db.prepare("UPDATE stones SET status = 'Rejected' WHERE id = ?").run(id);
  db.prepare("INSERT INTO stone_status_log (stone_id, status, reason, changed_at) VALUES (?, 'Rejected', ?, ?)")
    .run(id, reason, new Date().toISOString());
  return getStoneById(id);
}

export function getStoneStatusLog(stoneId: string): DbStoneStatusLog[] {
  return getDb().prepare("SELECT * FROM stone_status_log WHERE stone_id = ? ORDER BY changed_at ASC")
    .all(stoneId) as DbStoneStatusLog[];
}

export function getTraderStones(traderId: number) {
  return getDb().prepare(`SELECT ${STONE_COLS} FROM stones s LEFT JOIN traders t ON s.trader_id = t.id WHERE s.trader_id = ? ORDER BY s.created_at DESC`).all(traderId) as any[];
}

/* ── Photo Storage ── */

const UPLOADS_DIR = path.join(DATA_DIR, "uploads");

export function ensureUploadsDir() {
  if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  return UPLOADS_DIR;
}

export function savePhoto(filename: string, buffer: Buffer): string {
  const dir = ensureUploadsDir();
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const finalName = `${Date.now()}_${safeName}`;
  fs.writeFileSync(path.join(dir, finalName), buffer);
  return `/api/stones/photo/${finalName}`;
}

export function getPhotoFile(filename: string): Buffer | null {
  const filePath = path.join(ensureUploadsDir(), filename);
  if (!fs.existsSync(filePath)) return null;
  return fs.readFileSync(filePath);
}

/* ── Store Queries (for /app) ── */

export function getStoreStones() {
  return getDb().prepare(`SELECT ${STONE_COLS} FROM stones s LEFT JOIN traders t ON s.trader_id = t.id WHERE s.status = 'Available' AND s.listing_category IN ('Polished', 'Jewelry') ORDER BY s.created_at DESC`).all() as any[];
}

/* ── Order Queries ── */

export function createOrder(stoneId: string, stoneRef: string, buyerName: string, buyerWhatsapp: string, price: number | null): DbOrder {
  const db = getDb();
  const now = new Date().toISOString();
  const info = db.prepare("INSERT INTO orders (stone_id, stone_ref, buyer_name, buyer_whatsapp, price, status, created_at) VALUES (?, ?, ?, ?, ?, 'Reserved', ?)").run(stoneId, stoneRef, buyerName, buyerWhatsapp, price, now);
  db.prepare("UPDATE stones SET status = 'Reserved' WHERE id = ?").run(stoneId);
  // Increment reserve_count on any video linked to this stone
  db.prepare("UPDATE videos SET reserve_count = reserve_count + 1 WHERE stone_id = ?").run(stoneId);
  return db.prepare("SELECT * FROM orders WHERE id = ?").get(info.lastInsertRowid) as DbOrder;
}

export function getAllOrders(): (DbOrder & { shape: string; carat: number; color: string; clarity: string; certification: string; stone_status: string })[] {
  return getDb().prepare(
    `SELECT o.*, s.shape, s.carat, s.color, s.clarity, s.certification, s.status as stone_status
     FROM orders o LEFT JOIN stones s ON o.stone_id = s.id
     ORDER BY o.created_at DESC`
  ).all() as any[];
}

export function updateOrderStatus(id: number, status: string): DbOrder | null {
  const db = getDb();
  db.prepare("UPDATE orders SET status = ? WHERE id = ?").run(status, id);
  return db.prepare("SELECT * FROM orders WHERE id = ?").get(id) as DbOrder | undefined || null;
}

/* ── Video Queries ── */

export function getAllVideos(): (DbVideo & { stone_ref: string | null; model_name: string | null; model_instagram: string | null })[] {
  return getDb().prepare(
    `SELECT v.*, s.ref as stone_ref, m.name as model_name, m.instagram as model_instagram
     FROM videos v LEFT JOIN stones s ON v.stone_id = s.id LEFT JOIN models m ON v.model_id = m.id
     ORDER BY v.created_at DESC`
  ).all() as any[];
}

export function getPublishedVideos(): (DbVideo & { stone_ref: string | null; shape: string | null; carat: number | null; color: string | null; clarity: string | null; certification: string | null; price: number | null; stone_status: string | null; model_instagram: string | null })[] {
  return getDb().prepare(
    `SELECT v.*, s.ref as stone_ref, s.shape, s.carat, s.color, s.clarity, s.certification, s.price, s.status as stone_status, m.instagram as model_instagram
     FROM videos v LEFT JOIN stones s ON v.stone_id = s.id LEFT JOIN models m ON v.model_id = m.id
     WHERE v.published = 1 AND v.status = 'Live' ORDER BY v.created_at DESC`
  ).all() as any[];
}

export function addVideo(videoUrl: string, caption: string, stoneId: string | null): DbVideo {
  const db = getDb();
  const now = new Date().toISOString();
  const info = db.prepare(
    `INSERT INTO videos (video_url, caption, stone_id, published, created_at) VALUES (?, ?, ?, 0, ?)`
  ).run(videoUrl, caption, stoneId, now);
  return db.prepare("SELECT * FROM videos WHERE id = ?").get(info.lastInsertRowid) as DbVideo;
}

export function updateVideo(id: number, updates: { video_url?: string; caption?: string; stone_id?: string | null; published?: number }): DbVideo | null {
  const db = getDb();
  const fields: string[] = [];
  const values: unknown[] = [];
  if (updates.video_url !== undefined) { fields.push("video_url = ?"); values.push(updates.video_url); }
  if (updates.caption !== undefined) { fields.push("caption = ?"); values.push(updates.caption); }
  if (updates.stone_id !== undefined) { fields.push("stone_id = ?"); values.push(updates.stone_id); }
  if (updates.published !== undefined) { fields.push("published = ?"); values.push(updates.published); }
  if (fields.length === 0) return db.prepare("SELECT * FROM videos WHERE id = ?").get(id) as DbVideo || null;
  values.push(id);
  db.prepare(`UPDATE videos SET ${fields.join(", ")} WHERE id = ?`).run(...values);
  return db.prepare("SELECT * FROM videos WHERE id = ?").get(id) as DbVideo || null;
}

export function deleteVideo(id: number): boolean {
  const db = getDb();
  const result = db.prepare("DELETE FROM videos WHERE id = ?").run(id);
  return result.changes > 0;
}

/* ── Model Queries ── */

export function getAllModels(): (DbModel & { live_count: number; pending_count: number; approved_this_month: number; commission_earnings: number })[] {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  return getDb().prepare(
    `SELECT m.*,
      (SELECT COUNT(*) FROM videos WHERE model_id = m.id AND status = 'Live') as live_count,
      (SELECT COUNT(*) FROM videos WHERE model_id = m.id AND status = 'Pending') as pending_count,
      (SELECT COUNT(*) FROM videos WHERE model_id = m.id AND status = 'Live' AND created_at >= ?) as approved_this_month,
      (SELECT COALESCE(SUM(commission_earned), 0) FROM videos WHERE model_id = m.id) as commission_earnings
     FROM models m ORDER BY m.created_at DESC`
  ).all(monthStart) as any[];
}

export function getActiveModelCount(): number {
  return (getDb().prepare("SELECT COUNT(*) as c FROM models WHERE status = 'Active'").get() as { c: number }).c;
}

export function getModelByPortalCode(code: string): DbModel | undefined {
  return getDb().prepare("SELECT * FROM models WHERE portal_code = ?").get(code) as DbModel | undefined;
}

export function getModelById(id: number): DbModel | undefined {
  return getDb().prepare("SELECT * FROM models WHERE id = ?").get(id) as DbModel | undefined;
}

function genModelPortalCode(): string {
  const chars = "abcdefghijklmnopqrstuvwxyz0123456789";
  let code = "";
  for (let i = 0; i < 8; i++) code += chars[Math.floor(Math.random() * chars.length)];
  return code;
}

export function addModel(name: string, whatsapp: string, instagram: string): DbModel {
  const db = getDb();
  const now = new Date().toISOString();
  const code = genModelPortalCode();
  const info = db.prepare(
    `INSERT INTO models (name, whatsapp, instagram, portal_code, status, created_at) VALUES (?, ?, ?, ?, 'Active', ?)`
  ).run(name, whatsapp, instagram, code, now);
  return db.prepare("SELECT * FROM models WHERE id = ?").get(info.lastInsertRowid) as DbModel;
}

export function addModelVideo(modelId: number, videoUrl: string, caption: string, stoneId: string | null): DbVideo {
  const db = getDb();
  const now = new Date().toISOString();
  const info = db.prepare(
    `INSERT INTO videos (video_url, caption, stone_id, published, model_id, status, tap_count, created_at) VALUES (?, ?, ?, 0, ?, 'Pending', 0, ?)`
  ).run(videoUrl, caption, stoneId, modelId, now);
  return db.prepare("SELECT * FROM videos WHERE id = ?").get(info.lastInsertRowid) as DbVideo;
}

export function getModelVideos(modelId: number): (DbVideo & { stone_ref: string | null; stone_status: string | null })[] {
  return getDb().prepare(
    `SELECT v.*, s.ref as stone_ref, s.status as stone_status
     FROM videos v LEFT JOIN stones s ON v.stone_id = s.id
     WHERE v.model_id = ? ORDER BY v.created_at DESC`
  ).all(modelId) as any[];
}

export function getModelMonthlySummary(modelId: number): { approved_this_month: number; base_earned: number; commission_earned: number; total_due: number } {
  const db = getDb();
  const model = db.prepare("SELECT * FROM models WHERE id = ?").get(modelId) as DbModel | undefined;
  if (!model) return { approved_this_month: 0, base_earned: 0, commission_earned: 0, total_due: 0 };
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const approved = (db.prepare(
    "SELECT COUNT(*) as c FROM videos WHERE model_id = ? AND status = 'Live' AND created_at >= ?"
  ).get(modelId, monthStart) as { c: number }).c;
  const capped = Math.min(approved, model.monthly_video_quota);
  const baseEarned = capped * (model.monthly_base_fee / model.monthly_video_quota);
  const commission = (db.prepare(
    "SELECT COALESCE(SUM(commission_earned), 0) as s FROM videos WHERE model_id = ? AND created_at >= ?"
  ).get(modelId, monthStart) as { s: number }).s;
  return { approved_this_month: approved, base_earned: baseEarned, commission_earned: commission, total_due: baseEarned + commission - model.total_paid };
}

export function getModelPaymentReport(modelId: number): { model: DbModel; month: string; videos: any[]; base_earned: number; commission_total: number; total_due: number } {
  const db = getDb();
  const model = db.prepare("SELECT * FROM models WHERE id = ?").get(modelId) as DbModel;
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const videos = db.prepare(
    `SELECT v.id, v.caption, v.created_at, v.sales_count, v.sales_value, v.commission_earned, s.ref as stone_ref
     FROM videos v LEFT JOIN stones s ON v.stone_id = s.id
     WHERE v.model_id = ? AND v.status = 'Live' AND v.created_at >= ?
     ORDER BY v.created_at DESC`
  ).all(modelId, monthStart) as any[];
  const approved = videos.length;
  const capped = Math.min(approved, model.monthly_video_quota);
  const baseEarned = capped * (model.monthly_base_fee / model.monthly_video_quota);
  const commissionTotal = videos.reduce((sum: number, v: any) => sum + (v.commission_earned || 0), 0);
  return { model, month, videos, base_earned: baseEarned, commission_total: commissionTotal, total_due: baseEarned + commissionTotal - model.total_paid };
}

export function markModelPaid(modelId: number, amount: number): void {
  const db = getDb();
  db.prepare("UPDATE models SET total_paid = total_paid + ? WHERE id = ?").run(amount, modelId);
}

export function approveModelVideo(id: number): DbVideo | null {
  const db = getDb();
  db.prepare("UPDATE videos SET status = 'Live', published = 1 WHERE id = ?").run(id);
  return db.prepare("SELECT * FROM videos WHERE id = ?").get(id) as DbVideo || null;
}

export function declineModelVideo(id: number): boolean {
  const db = getDb();
  const result = db.prepare("DELETE FROM videos WHERE id = ? AND status = 'Pending'").run(id);
  return result.changes > 0;
}

export function incrementTapCount(id: number): void {
  getDb().prepare("UPDATE videos SET tap_count = tap_count + 1 WHERE id = ?").run(id);
}
