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
  id: number; name: string; whatsapp: string; licence: string; created_at: string;
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
  created_at: string;
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
      created_at TEXT NOT NULL
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
      price REAL, status TEXT NOT NULL DEFAULT 'Available',
      photo TEXT NOT NULL DEFAULT '', source TEXT NOT NULL DEFAULT 'Own stock',
      trader_id INTEGER, commission REAL NOT NULL DEFAULT 0, sale_price REAL,
      photo_path TEXT, created_at TEXT NOT NULL,
      FOREIGN KEY (trader_id) REFERENCES traders(id)
    );
  `);
  const count = db.prepare("SELECT COUNT(*) as c FROM stones").get() as { c: number };
  if (count.c === 0) seedData(db);
}

function seedData(db: Database.Database) {
  const now = new Date().toISOString();
  const insertTrader = db.prepare("INSERT INTO traders (name, whatsapp, licence, created_at) VALUES (?, ?, ?, ?)");
  const insertStone = db.prepare(
    `INSERT INTO stones (id, ref, stone_type, shape, carat, color, clarity, cut, certification,
     category, crystal_form, clarity_notes, kp_status, price, status, photo, source,
     trader_id, commission, sale_price, photo_path, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );

  const seed = [
    // ── Rough stones ──
    {
      id: "1", ref: "ADB-001", stone_type: "rough", shape: "Octahedron", carat: 12.45,
      color: "Near colourless", clarity: "", cut: "", cert: "",
      category: "Sawable", crystal_form: "Octahedron", clarity_notes: "Clean octahedron, minimal inclusions visible under 10x",
      kp: 1, price: null, photo: "", source: "Own stock", comm: 0,
    },
    {
      id: "2", ref: "ADB-002", stone_type: "rough", shape: "Macle", carat: 8.30,
      color: "Light brown", clarity: "", cut: "", cert: "",
      category: "Near-gem", crystal_form: "Macle", clarity_notes: "Twinned crystal, some feather inclusions along twin plane",
      kp: 1, price: null, photo: "", source: "Consigned", comm: 5,
      tn: "Kgosi Molefe", tw: "+267 71 555 0101", tl: "BDMR-089",
    },
    {
      id: "3", ref: "ADB-003", stone_type: "rough", shape: "Irregular", carat: 3.20,
      color: "Greyish", clarity: "", cut: "", cert: "",
      category: "Industrial", crystal_form: "Irregular", clarity_notes: "Fractured surface, suitable for industrial cutting only",
      kp: 0, price: null, photo: "", source: "Own stock", comm: 0,
    },
    // ── Polished stones ──
    {
      id: "4", ref: "ADB-004", stone_type: "polished", shape: "Round Brilliant", carat: 1.05,
      color: "G", clarity: "VS1", cut: "Excellent", cert: "GIA",
      category: "", crystal_form: "", clarity_notes: "",
      kp: 0, price: 8900, photo: "", source: "Own stock", comm: 0,
    },
    {
      id: "5", ref: "ADB-005", stone_type: "polished", shape: "Oval", carat: 1.72,
      color: "D", clarity: "IF", cut: "Excellent", cert: "GIA",
      category: "", crystal_form: "", clarity_notes: "",
      kp: 0, price: 24500, photo: "", source: "Consigned", comm: 8,
      tn: "Ravi Patel", tw: "+91 98765 43210", tl: "GJEPC-4421",
    },
  ];

  const tx = db.transaction(() => {
    for (const s of seed) {
      let traderId: number | null = null;
      if (s.source === "Consigned" && (s as any).tn) {
        const info = insertTrader.run((s as any).tn, (s as any).tw || "", (s as any).tl || "", now);
        traderId = info.lastInsertRowid as number;
      }
      insertStone.run(
        s.id, s.ref, s.stone_type, s.shape, s.carat, s.color, s.clarity, s.cut, s.cert,
        s.category, s.crystal_form, s.clarity_notes, s.kp,
        s.price, "Available", s.photo, s.source,
        traderId, s.comm, null, null, now
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

export function getAllTraders(): DbTrader[] {
  return getDb().prepare("SELECT * FROM traders ORDER BY name").all() as DbTrader[];
}

export function getOrCreateTrader(name: string, whatsapp: string, licence: string): number {
  const db = getDb();
  const existing = db.prepare("SELECT id FROM traders WHERE name = ?").get(name) as { id: number } | undefined;
  if (existing) return existing.id;
  return db.prepare("INSERT INTO traders (name, whatsapp, licence, created_at) VALUES (?, ?, ?, ?)")
    .run(name, whatsapp, licence, new Date().toISOString()).lastInsertRowid as number;
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
     trader_id, commission, sale_price, photo_path, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?)`
  ).run(id, ref, data.stone_type, data.shape, data.carat, data.color, data.clarity, data.cut,
    data.certification, data.category, data.crystal_form, data.clarity_notes, data.kp_status ? 1 : 0,
    data.price, data.status, photo, data.source, data.trader_id, data.commission, data.photo_path, now);
  return getStoneById(id);
}

export function updateStone(id: string, updates: Partial<Pick<DbStone, "status" | "sale_price" | "price" | "photo" | "photo_path">>) {
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
  if (fields.length === 0) return existing;
  values.push(id);
  db.prepare(`UPDATE stones SET ${fields.join(", ")} WHERE id = ?`).run(...values);
  return getStoneById(id);
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
