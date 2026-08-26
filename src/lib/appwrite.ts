import {
  Client,
  Databases,
  Storage,
  ID,
  Permission,
  Role,
} from "node-appwrite";

/* ── Environment ── */
const ENDPOINT = process.env.APPWRITE_ENDPOINT!;
const PROJECT_ID = process.env.APPWRITE_PROJECT_ID!;
const API_KEY = process.env.APPWRITE_API_KEY!;

export const DB_ID = "ames";
export const MEDIA_BUCKET = "media";
export const REPORTS_BUCKET = "reports";
export const LICENCE_DOCS_BUCKET = "licence-docs";

/* ── Singletons ── */
let _client: Client | null = null;
let _databases: Databases | null = null;
let _storage: Storage | null = null;

export function getClient(): Client {
  if (_client) return _client;
  _client = new Client().setEndpoint(ENDPOINT).setProject(PROJECT_ID).setKey(API_KEY);
  return _client;
}

export function getDb(): Databases {
  if (_databases) return _databases;
  _databases = new Databases(getClient());
  return _databases;
}

export function getStorage(): Storage {
  if (_storage) return _storage;
  _storage = new Storage(getClient());
  return _storage;
}

export function getMediaUrl(fileId: string): string {
  return `${ENDPOINT}/storage/buckets/${MEDIA_BUCKET}/files/${fileId}/view?project=${PROJECT_ID}`;
}

export function getLicenceUrl(fileId: string): string {
  return `${ENDPOINT}/storage/buckets/${LICENCE_DOCS_BUCKET}/files/${fileId}/view?project=${PROJECT_ID}`;
}

/* ── Helpers ── */
/** Convert Appwrite document to plain object with `id` and `created_at` */
export function doc<T extends Record<string, any>>(d: any): T {
  const plain: any = { ...d };
  if (plain.$id !== undefined) plain.id = String(plain.$id);
  if (plain.$createdAt !== undefined) plain.created_at = plain.$createdAt;
  if (plain.$updatedAt !== undefined) plain.updated_at = plain.$updatedAt;
  delete plain.$id;
  delete plain.$collectionId;
  delete plain.$databaseId;
  delete plain.$createdAt;
  delete plain.$updatedAt;
  delete plain.$permissions;
  return plain as T;
}

export function nowISO(): string {
  return new Date().toISOString();
}

/* ── Auto-provision database, collections, storage ── */
let _ready = false;

export async function ensureReady(): Promise<void> {
  if (_ready) return;
  if (!ENDPOINT || !PROJECT_ID || !API_KEY) return;
  try {
    const db = getDb();
    const sto = getStorage();

    // 1. Create database
    try { await db.create({ databaseId: DB_ID, name: "AMES" }); } catch { /* exists */ }

    // 2. Create collections + attributes
    for (const col of COLLECTION_DEFS) {
      try {
        await db.createCollection({
          databaseId: DB_ID,
          collectionId: col.id,
          name: col.name,
          permissions: [Permission.read(Role.any()), Permission.write(Role.any())],
        });
      } catch { /* exists */ }
      // Create missing attributes
      try {
        const existing = await db.listAttributes({ databaseId: DB_ID, collectionId: col.id });
        const existingKeys = new Set(existing.attributes.map((a: any) => a.key));
        for (const attr of col.attrs) {
          if (existingKeys.has(attr.key)) continue;
          await createAttr(db, col.id, attr);
        }
      } catch { /* skip */ }
    }

    // 3. Create storage bucket
    try {
      await sto.createBucket({
        bucketId: MEDIA_BUCKET,
        name: "Media",
        permissions: [Permission.read(Role.any()), Permission.write(Role.any())],
        enabled: true,
        maximumFileSize: 10 * 1024 * 1024,
        allowedFileExtensions: ["jpg", "jpeg", "png", "webp", "gif"],
      });
    } catch { /* exists */ }

    // 4. Create reports storage bucket
    try {
      await sto.createBucket({
        bucketId: "reports",
        name: "Reports",
        permissions: [Permission.read(Role.any()), Permission.write(Role.any())],
        enabled: true,
        maximumFileSize: 50 * 1024 * 1024,
        allowedFileExtensions: ["pdf"],
      });
    } catch { /* exists */ }

    // 5. Create private licence documents bucket (dashboard-only read)
    try {
      await sto.createBucket({
        bucketId: LICENCE_DOCS_BUCKET,
        name: "Licence Documents",
        permissions: [Permission.write(Role.any())],
        enabled: true,
        maximumFileSize: 20 * 1024 * 1024,
        allowedFileExtensions: ["jpg", "jpeg", "png", "webp", "pdf"],
      });
    } catch { /* exists */ }

    _ready = true;
  } catch (err) {
    console.error("[appwrite] ensureReady failed:", err);
  }
}

async function createAttr(db: Databases, collectionId: string, attr: AttrDef): Promise<void> {
  switch (attr.type) {
    case "string":
      await db.createStringAttribute({
        databaseId: DB_ID, collectionId, key: attr.key,
        size: attr.size || 255, required: attr.required ?? false, xdefault: attr.default,
      });
      break;
    case "integer":
      await db.createIntegerAttribute({
        databaseId: DB_ID, collectionId, key: attr.key,
        required: attr.required ?? false, xdefault: attr.default,
      });
      break;
    case "float":
      await db.createFloatAttribute({
        databaseId: DB_ID, collectionId, key: attr.key,
        required: attr.required ?? false, xdefault: attr.default,
      });
      break;
    case "boolean":
      await db.createBooleanAttribute({
        databaseId: DB_ID, collectionId, key: attr.key,
        required: attr.required ?? false, xdefault: attr.default,
      });
      break;
    case "datetime":
      await db.createDatetimeAttribute({
        databaseId: DB_ID, collectionId, key: attr.key,
        required: attr.required ?? false, xdefault: attr.default,
      });
      break;
  }
}

/* ── Collection schemas ── */
type AttrDef = {
  key: string;
  type: "string" | "integer" | "float" | "boolean" | "datetime";
  required?: boolean;
  default?: any;
  size?: number;
};

const COLLECTION_DEFS: { id: string; name: string; attrs: AttrDef[] }[] = [
  {
    id: "traders",
    name: "Traders",
    attrs: [
      { key: "name", type: "string", size: 255, required: true },
      { key: "whatsapp", type: "string", size: 255, default: "" },
      { key: "licence", type: "string", size: 255, default: "" },
      { key: "portal_code", type: "string", size: 255, default: "" },
      { key: "email", type: "string", size: 255, default: "" },
      { key: "status", type: "string", size: 50, default: "Pending" },
      { key: "company", type: "string", size: 255, default: "" },
      { key: "country", type: "string", size: 255, default: "" },
      { key: "licence_photo", type: "string", size: 65535, default: "" },
      { key: "created_at", type: "datetime" },
      { key: "preferred", type: "boolean", default: false },
    ],
  },
  {
    id: "stones",
    name: "Stones",
    attrs: [
      { key: "ref", type: "string", size: 50, required: true },
      { key: "stone_type", type: "string", size: 50, default: "polished" },
      { key: "shape", type: "string", size: 100, required: true },
      { key: "carat", type: "float", required: true, default: 0 },
      { key: "color", type: "string", size: 50, required: true },
      { key: "clarity", type: "string", size: 50, default: "" },
      { key: "cut", type: "string", size: 50, default: "" },
      { key: "certification", type: "string", size: 50, default: "" },
      { key: "category", type: "string", size: 50, default: "" },
      { key: "crystal_form", type: "string", size: 50, default: "" },
      { key: "clarity_notes", type: "string", size: 2000, default: "" },
      { key: "kp_status", type: "boolean", default: false },
      { key: "price", type: "float", default: 0 },
      { key: "status", type: "string", size: 50, default: "Available" },
      { key: "photo", type: "string", size: 2000, default: "" },
      { key: "source", type: "string", size: 50, default: "Own stock" },
      { key: "trader_id", type: "string", size: 50, default: "" },
      { key: "commission", type: "float", default: 0 },
      { key: "sale_price", type: "float", default: 0 },
      { key: "photo_path", type: "string", size: 500, default: "" },
      { key: "listing_category", type: "string", size: 50, default: "Polished" },
      { key: "created_at", type: "datetime" },
    ],
  },
  {
    id: "requests",
    name: "Requests",
    attrs: [
      { key: "date", type: "string", size: 20, required: true },
      { key: "buyer_name", type: "string", size: 255, default: "" },
      { key: "company", type: "string", size: 255, required: true },
      { key: "country", type: "string", size: 255, default: "" },
      { key: "contact", type: "string", size: 255, required: true },
      { key: "type", type: "string", size: 50, required: true },
      { key: "shape", type: "string", size: 100, required: true },
      { key: "carat_min", type: "string", size: 20, default: "" },
      { key: "carat_max", type: "string", size: 20, default: "" },
      { key: "color", type: "string", size: 50, required: true },
      { key: "clarity", type: "string", size: 50, required: true },
      { key: "certification", type: "string", size: 50, default: "" },
      { key: "notes", type: "string", size: 5000, default: "" },
      { key: "kp_licence", type: "string", size: 100, default: "" },
      { key: "kp_country", type: "string", size: 100, default: "" },
      { key: "consent", type: "boolean", default: false },
      { key: "declaration", type: "boolean", default: false },
      { key: "consent_timestamp", type: "string", size: 50, default: "" },
      { key: "mandate", type: "string", size: 10000, default: "" },
      { key: "status", type: "string", size: 50, default: "New" },
      { key: "offer_text", type: "string", size: 10000, default: "" },
      { key: "offer_timestamp", type: "string", size: 50, default: "" },
      { key: "created_at", type: "datetime" },
    ],
  },
  {
    id: "orders",
    name: "Orders",
    attrs: [
      { key: "stone_id", type: "string", size: 50, required: true },
      { key: "stone_ref", type: "string", size: 50, required: true },
      { key: "buyer_name", type: "string", size: 255, default: "" },
      { key: "buyer_whatsapp", type: "string", size: 255, default: "" },
      { key: "price", type: "float", default: 0 },
      { key: "status", type: "string", size: 50, default: "Reserved" },
      { key: "created_at", type: "datetime" },
    ],
  },
  {
    id: "reports",
    name: "Reports",
    attrs: [
      { key: "trader_id", type: "string", size: 50, required: true },
      { key: "period_start", type: "datetime", required: true },
      { key: "period_end", type: "datetime", required: true },
      { key: "report_date", type: "datetime", required: true },
      { key: "summary", type: "string", size: 10000, default: "" },
      { key: "data", type: "string", size: 50000, default: "{}" },
      { key: "created_at", type: "datetime" },
    ],
  },
  {
    id: "stone_status_log",
    name: "Stone Status Log",
    attrs: [
      { key: "stone_id", type: "string", size: 50, required: true },
      { key: "status", type: "string", size: 50, required: true },
      { key: "reason", type: "string", size: 2000, default: "" },
      { key: "changed_at", type: "datetime", required: true },
    ],
  },
  {
    id: "models",
    name: "Models",
    attrs: [
      { key: "name", type: "string", size: 255, required: true },
      { key: "whatsapp", type: "string", size: 255, default: "" },
      { key: "instagram", type: "string", size: 255, default: "" },
      { key: "portal_code", type: "string", size: 255, default: "" },
      { key: "status", type: "string", size: 50, default: "Active" },
      { key: "monthly_video_quota", type: "integer", default: 30 },
      { key: "monthly_base_fee", type: "float", default: 200 },
      { key: "commission_rate", type: "float", default: 0.005 },
      { key: "payment_method", type: "string", size: 50, default: "" },
      { key: "payment_details", type: "string", size: 1000, default: "" },
      { key: "total_paid", type: "float", default: 0 },
      { key: "created_at", type: "datetime" },
    ],
  },
  {
    id: "videos",
    name: "Videos",
    attrs: [
      { key: "video_url", type: "string", size: 2000, required: true },
      { key: "caption", type: "string", size: 500, default: "" },
      { key: "stone_id", type: "string", size: 50, default: "" },
      { key: "published", type: "boolean", default: false },
      { key: "model_id", type: "string", size: 50, default: "" },
      { key: "status", type: "string", size: 50, default: "Live" },
      { key: "tap_count", type: "integer", default: 0 },
      { key: "reserve_count", type: "integer", default: 0 },
      { key: "sales_count", type: "integer", default: 0 },
      { key: "sales_value", type: "float", default: 0 },
      { key: "commission_earned", type: "float", default: 0 },
      { key: "likes_count", type: "integer", default: 0 },
      { key: "created_at", type: "datetime" },
    ],
  },
  {
    id: "comments",
    name: "Comments",
    attrs: [
      { key: "video_id", type: "string", size: 50, required: true },
      { key: "author", type: "string", size: 255, default: "" },
      { key: "text", type: "string", size: 5000, required: true },
      { key: "created_at", type: "datetime" },
    ],
  },
  {
    id: "chats",
    name: "Chats",
    attrs: [
      { key: "title", type: "string", size: 255, default: "New chat" },
      { key: "created_at", type: "datetime" },
      { key: "updated_at", type: "datetime" },
    ],
  },
  {
    id: "chat_messages",
    name: "Chat Messages",
    attrs: [
      { key: "chat_id", type: "string", size: 50, required: true },
      { key: "role", type: "string", size: 20, required: true },
      { key: "text", type: "string", size: 50000, required: true },
      { key: "thinking", type: "string", size: 50000, default: "" },
      { key: "created_at", type: "datetime" },
    ],
  },
  {
    id: "report_issues",
    name: "Report Issues",
    attrs: [
      { key: "report_type", type: "string", size: 100, required: true },
      { key: "tier", type: "string", size: 50, default: "" },
      { key: "issue_label", type: "string", size: 255, required: true },
      { key: "pdf_url", type: "string", size: 2000, required: true },
      { key: "created_at", type: "datetime" },
    ],
  },
  {
    id: "report_products",
    name: "Report Products",
    attrs: [
      { key: "slug", type: "string", size: 100, required: true },
      { key: "name", type: "string", size: 255, required: true },
      { key: "tier", type: "string", size: 50, required: true },
      { key: "tier_label", type: "string", size: 100, required: true },
      { key: "price", type: "integer", default: 0 },
      { key: "price_label", type: "string", size: 100, default: "" },
      { key: "description", type: "string", size: 1000, default: "" },
      { key: "active", type: "boolean", default: true },
      { key: "created_at", type: "datetime" },
    ],
  },
  {
    id: "report_orders",
    name: "Report Orders",
    attrs: [
      { key: "product_slug", type: "string", size: 100, required: true },
      { key: "product_name", type: "string", size: 255, required: true },
      { key: "tier", type: "string", size: 50, required: true },
      { key: "tier_label", type: "string", size: 100, required: true },
      { key: "charge", type: "integer", default: 0 },
      { key: "buyer_name", type: "string", size: 255, default: "" },
      { key: "buyer_email", type: "string", size: 255, default: "" },
      { key: "company", type: "string", size: 255, default: "" },
      { key: "country", type: "string", size: 100, default: "" },
      { key: "notes", type: "string", size: 5000, default: "" },
      { key: "status", type: "string", size: 50, default: "Requested" },
      { key: "created_at", type: "datetime" },
    ],
  },
];
